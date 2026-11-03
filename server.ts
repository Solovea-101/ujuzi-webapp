import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { WebSocketServer, type WebSocket } from 'ws';
import { countPartnerKeys } from './lib/auth/partnerKey';
import { getStore } from './lib/db';
import { userForToken } from './lib/auth/session';
import { prepareDatabase } from './lib/db/startup';
import { installRealtime } from './lib/realtime/hooks';
import { registerFeedClient } from './lib/realtime/graduateFeed';
import { routeUpgrade } from './lib/realtime/upgradeRoute';
import { getSubscriber } from './lib/realtime/kaziSubscriber';

/** Route handlers cannot accept WebSocket upgrades, so this one path is served from here. */
export const FEED_PATH = '/api/me/applications/feed';

// `tsx watch server.ts` leaves NODE_ENV unset (development); `npm start` sets production and
// Jest sets test. Tests run against the production build that `next build` just made.
const isDev = () => process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

const FEED_AUTH_SECONDS = 5;

/**
 * The feed is authenticated by its first message, {"type":"auth","token":"..."}, because a browser cannot
 * set headers on a WebSocket and a token in the URL would end up in logs. A missing, late or bad token, or a
 * staff token, closes the socket with code 4401. After that the graduate gets one FeedEvent per change.
 */
function onFeedConnection(ws: WebSocket, _req: IncomingMessage): void {
  const timer = setTimeout(() => ws.close(4401, `Send {"type":"auth","token":"..."} within ${FEED_AUTH_SECONDS} seconds`), FEED_AUTH_SECONDS * 1000);
  ws.once('message', (data) => {
    clearTimeout(timer);
    void (async () => {
      try {
        const message: unknown = JSON.parse(data.toString());
        const token = typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'auth' ? (message as { token?: unknown }).token : undefined;
        const user = typeof token === 'string' ? await userForToken(await getStore(), token) : undefined;
        if (!user || user.role !== 'graduate') return ws.close(4401, 'Log in as a graduate and send your token');
        registerFeedClient(user.id, ws);
        ws.send(JSON.stringify({ type: 'ready' }));
      } catch {
        ws.close(4401, 'Send {"type":"auth","token":"..."}');
      }
    })();
  });
  ws.on('error', () => clearTimeout(timer));
  ws.on('close', () => clearTimeout(timer));
}

/** False when the path has broken percent-encoding, such as a lone %E0 or a trailing %. */
function hasDecodablePath(url: string | undefined): boolean {
  try {
    decodeURIComponent((url ?? '/').split('?')[0]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next answers a method a route does not have (PUT /api/courses) with a bare, empty 405. Every error here is
 * { "message": "..." }, so on /api paths an empty 405 gets that body. Allow is not sent: Next does not say
 * which methods the route has, and saying so wrongly would be worse than saying nothing.
 */
function jsonFor405(req: IncomingMessage, res: ServerResponse): void {
  if (!(req.url ?? '').startsWith('/api/')) return;
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
  const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse;
  let wrote = false;
  const write = res.write.bind(res) as (...args: unknown[]) => boolean;
  res.write = ((...args: unknown[]) => {
    wrote = true;
    return write(...args);
  }) as typeof res.write;
  res.writeHead = ((status: number, ...args: unknown[]) => {
    if (status === 405 && !res.headersSent) res.setHeader('Content-Type', 'application/json');
    return writeHead(status, ...args);
  }) as typeof res.writeHead;
  res.end = ((...args: unknown[]) => {
    const chunk = args[0];
    const hasChunk = typeof chunk === 'string' ? chunk.length > 0 : chunk instanceof Uint8Array ? chunk.length > 0 : false;
    const empty = !wrote && !hasChunk;
    if (res.statusCode === 405 && empty) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
      return end(JSON.stringify({ message: 'This URL does not accept that method' }));
    }
    return end(...args);
  }) as typeof res.end;
}

/**
 * The whole app as one http.Server: Next's request handler plus the WebSocket upgrade hook.
 * Supertest and `npm start` both use it. Next prepares in the background; requests wait for it.
 */
export function createServer(): Server {
  const dev = isDev();
  const app = next({ dev, hostname: 'localhost', port: Number(process.env.PORT) || 3000 });
  const handle = app.getRequestHandler();
  const ready = app.prepare();
  ready.catch((err) => console.error('Next failed to prepare:', err));

  const server = createHttpServer(async (req, res) => {
    // The real peer address, for rate limiting. Always overwritten, so a client cannot choose its own.
    req.headers['x-ujuzi-peer'] = req.socket.remoteAddress ?? 'unknown';
    if (!hasDecodablePath(req.url)) {
      // Next answers a path like /api/courses/%E0%A4%A with a bare 500 in plain text.
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: 'The URL is not valid.' }));
      return;
    }
    jsonFor405(req, res);
    try {
      await ready;
      await handle(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify({ message: 'Internal server error' }));
    }
  });

  const feed = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const subscriber = getSubscriber();
  installRealtime(subscriber);
  const onFeed = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    feed.handleUpgrade(req, socket, head, (ws) => onFeedConnection(ws, req));
  };
  // Ujuzi owns the 'upgrade' event for its own socket. On its first request Next adds an upgrade listener of its
  // own to this server, and that one closes any socket it does not recognise, including the feed. So the feed is
  // taken here and never reaches Next's listener. In development every other upgrade (Next's hot-reload socket) is
  // passed on untouched, exactly as a plain Next server would; in production nothing else may upgrade.
  const emit = server.emit.bind(server);
  server.emit = ((event: string | symbol, ...args: unknown[]) => {
    if (event !== 'upgrade') return emit(event, ...args);
    const [req, socket, head] = args as [IncomingMessage, Duplex, Buffer];
    const route = routeUpgrade(new URL(req.url ?? '/', 'http://localhost').pathname, dev, FEED_PATH);
    if (route === 'feed') {
      onFeed(req, socket, head);
      return true;
    }
    if (route === 'next') return emit(event, ...args);
    socket.destroy();
    return true;
  }) as typeof server.emit;

  server.on('close', () => {
    subscriber.stopAll();
    installRealtime(undefined);
    feed.close();
    void app.close();
  });

  return server;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd(), isDev());
  const port = Number(process.env.PORT) || 3000;
  await prepareDatabase();
  console.log(`Partner keys loaded: ${countPartnerKeys()}`); // a count only, never the keys
  const server = createServer();

  server.listen(port, () => {
    console.log(`Ujuzi listening on http://localhost:${port} (${isDev() ? 'development' : 'production'})`);
    // Follow every application that was still pending when the last run stopped.
    getSubscriber().resume().then(
      (count) => count > 0 && console.log(`Following ${count} pending Kazi application(s)`),
      (err) => console.error('Could not resume Kazi subscriptions:', err),
    );
  });

  // Render sends SIGTERM when it replaces an instance.
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Ujuzi could not start:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
