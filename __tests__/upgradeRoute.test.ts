import { routeUpgrade } from '@/lib/realtime/upgradeRoute';

const FEED = '/api/me/applications/feed';

describe('who answers a WebSocket upgrade', () => {
  it('gives the live-status feed to Ujuzi, in development and in production', () => {
    expect(routeUpgrade(FEED, true, FEED)).toBe('feed');
    expect(routeUpgrade(FEED, false, FEED)).toBe('feed');
  });

  it('in development, hands every other socket to Next untouched (its hot-reload socket), so the page can attach', () => {
    expect(routeUpgrade('/_next/hmr', true, FEED)).toBe('next');
    expect(routeUpgrade('/_next/webpack-hmr', true, FEED)).toBe('next');
    expect(routeUpgrade('/anything-else', true, FEED)).toBe('next');
  });

  it('in production, refuses every other socket', () => {
    expect(routeUpgrade('/_next/hmr', false, FEED)).toBe('refuse');
    expect(routeUpgrade('/api/courses', false, FEED)).toBe('refuse');
  });

  it('matches the feed path exactly, not by prefix', () => {
    expect(routeUpgrade(`${FEED}/extra`, false, FEED)).toBe('refuse');
    expect(routeUpgrade(`${FEED}/extra`, true, FEED)).toBe('next');
  });
});
