/**
 * Who answers a WebSocket upgrade request.
 *   feed   Ujuzi's live-status socket: Ujuzi's own code takes it.
 *   next   Next's own listener: in development its hot-reload socket must reach it untouched, or the page never
 *          attaches its client code (the site then sits on its loading placeholder forever).
 *   refuse nothing else may upgrade in production.
 */
export type UpgradeRoute = 'feed' | 'next' | 'refuse';

export function routeUpgrade(pathname: string, dev: boolean, feedPath: string): UpgradeRoute {
  if (pathname === feedPath) return 'feed';
  return dev ? 'next' : 'refuse';
}
