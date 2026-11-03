/**
 * openapi.yaml names one server, http://localhost:3000. Swagger UI's "Try it out" and its curl examples use it, so on any
 * other port, or on Render, they would call the wrong place (on Render, the visitor's own computer). The docs page uses
 * these two functions to point them at the origin the page itself came from. The contract file is not changed.
 */
export const DECLARED_SERVER = 'http://localhost:3000';

/** A request URL aimed at the declared server, aimed at `origin` instead. Anything else is left alone. */
export function sameOriginUrl(url: string, origin: string): string {
  const hit = url === DECLARED_SERVER || ['/', '?', '#'].some((next) => url.startsWith(DECLARED_SERVER + next));
  return hit ? origin + url.slice(DECLARED_SERVER.length) : url;
}

/** The contract text with its declared server replaced, so the server list and the curl examples show the real address. */
export function specForOrigin(text: string, origin: string): string {
  return text.split(DECLARED_SERVER).join(origin);
}
