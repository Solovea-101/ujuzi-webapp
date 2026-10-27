import type { WebSocket } from 'ws';
import type { KaziStatus } from '@/lib/clients/kaziClient';

/** What the feed sends a graduate's open page: one of these for every change to one of their applications. */
export interface FeedEvent {
  applicationId: string;
  status: KaziStatus;
  updatedAt: string;
}

// Only the parts of a socket the feed touches, so this module never imports `ws` at run time (route
// bundles must not). The registry is on globalThis because server.ts and every route bundle share it.
type FeedSocket = Pick<WebSocket, 'send' | 'readyState' | 'on' | 'OPEN'>;
const shared = globalThis as typeof globalThis & { __ujuziFeed?: Map<string, Set<FeedSocket>> };
const clients = () => (shared.__ujuziFeed ??= new Map());

/** Adds a socket to a graduate's feed, and removes it when it closes. */
export function registerFeedClient(graduateId: string, socket: FeedSocket): void {
  const set = clients().get(graduateId) ?? new Set<FeedSocket>();
  clients().set(graduateId, set);
  set.add(socket);
  socket.on('close', () => {
    set.delete(socket);
    if (set.size === 0) clients().delete(graduateId);
  });
}

/** Sends the event to every open page of this graduate, and to nobody else. */
export function pushToGraduate(graduateId: string, event: FeedEvent): number {
  let sent = 0;
  for (const socket of clients().get(graduateId) ?? []) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event));
      sent += 1;
    }
  }
  return sent;
}

export function feedClientCount(graduateId: string): number {
  return clients().get(graduateId)?.size ?? 0;
}
