'use client';

import { useEffect, useRef, useState } from 'react';
import { getToken, type Schemas } from './clientApi';

export type FeedEvent = Schemas['FeedEvent'];
export type FeedState = 'connecting' | 'live' | 'offline';

/**
 * Follows the graduate's application feed (a WebSocket). It authenticates with its first message, calls
 * onEvent for every status change, and reconnects with a growing pause if the connection drops.
 */
export function useFeed(enabled: boolean, onEvent: (event: FeedEvent) => void): FeedState {
  const [state, setState] = useState<FeedState>('connecting');
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      const token = getToken();
      if (!token || stopped) return;
      setState('connecting');
      socket = new WebSocket(`${window.location.origin.replace(/^http/, 'ws')}/api/me/applications/feed`);
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'auth', token }));
      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(String(message.data)) as { type?: string } & Partial<FeedEvent>;
          if (data.type === 'ready') {
            attempt = 0;
            setState('live');
          } else if (data.applicationId && data.status) {
            handler.current(data as FeedEvent);
          }
        } catch {
          // a message we do not understand is ignored
        }
      };
      socket.onclose = (closing) => {
        setState('offline');
        if (stopped || closing.code === 4401) return; // 4401: not logged in, so retrying cannot help
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
      };
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [enabled]);

  return state;
}
