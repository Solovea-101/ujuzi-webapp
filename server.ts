import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { WebSocketServer, type WebSocket } from 'ws';

/** Route handlers cannot accept WebSocket upgrades, so this one path is served from here. */
export const FEED_PATH = '/api/me/applications/feed';

// `tsx watch server.ts` leaves NODE_ENV unset (development); `npm start` sets production and
// Jest sets test. Tests run against the production build that `next build` just made.
const isDev = () => process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

function onFeedConnection(ws: WebSocket, _req: IncomingMessage): void {
  // TODO(realtime phase): authenticate the graduate and register the socket with
  // lib/realtime/graduateFeed. Until then the upgrade works and the socket closes at once.
  ws.close(1011, 'The applications feed is not available yet');
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

  const feed = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === FEED_PATH) {
      feed.handleUpgrade(req, socket, head, (ws) => onFeedConnection(ws, req));
    } else if (dev) {
      // Next's own dev sockets (hot reload) arrive here too.
      ready.then(() => app.getUpgradeHandler()(req, socket, head)).catch(() => socket.destroy());
    } else {
      socket.destroy();
    }
  });

  server.on('close', () => {
    feed.close();
    void app.close();
  });

  return server;
}

function main(): void {
  loadEnvConfig(process.cwd(), isDev());
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();

  server.listen(port, () => {
    console.log(`Ujuzi listening on http://localhost:${port} (${isDev() ? 'development' : 'production'})`);
    // TODO(realtime phase): reopen a Kazi subscription for every pending application
    // (lib/realtime/kaziSubscriber) now that the server is up.
  });

  // Render sends SIGTERM when it replaces an instance.
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) main();
