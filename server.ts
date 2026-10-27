import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { WebSocketServer, type WebSocket } from 'ws';
import { getStore } from './lib/db';
import { userForToken } from './lib/auth/session';
import { prepareDatabase } from './lib/db/startup';
import { installRealtime } from './lib/realtime/hooks';
import { registerFeedClient } from './lib/realtime/graduateFeed';
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
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === FEED_PATH) {
      feed.handleUpgrade(req, socket, head, (ws) => onFeedConnection(ws, req));
    } else if (dev) {
      // Next's own dev sockets (hot reload) arrive here too.
      ready.then(() => app.getUpgradeHandler()(req, socket, head)).catch(() => socket.destroy());
    } else {
      socket.destroy();
    }
  };
  // Ujuzi owns the 'upgrade' event. On its first request Next adds an upgrade listener of its own to this
  // server, and that one closes any socket it does not recognise, including the feed. So 'upgrade' is not
  // dispatched to listeners at all: onUpgrade runs, and calls Next itself where Next should be asked.
  const emit = server.emit.bind(server);
  server.emit = ((event: string | symbol, ...args: unknown[]) => {
    if (event !== 'upgrade') return emit(event, ...args);
    onUpgrade(...(args as [IncomingMessage, Duplex, Buffer]));
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
