/** ISO 8601 UTC with a Z and no milliseconds, the shape of every date-time in the API. */
export const ISO_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** The object has exactly these keys: none missing, none extra. */
export function expectKeys(value: unknown, keys: string[]): void {
  expect(Object.keys(value as object).sort()).toEqual([...keys].sort());
}

/** Every error the API sends is { "message": "..." } and nothing else. */
export function expectErrorBody(body: unknown, message?: string | RegExp): void {
  expectKeys(body, ['message']);
  const actual = (body as { message: unknown }).message;
  expect(typeof actual).toBe('string');
  if (typeof message === 'string') expect(actual).toBe(message);
  if (message instanceof RegExp) expect(actual).toMatch(message);
}
