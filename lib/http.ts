import { NextResponse, type NextRequest } from 'next/server';

export const MAX_BODY_BYTES = 20 * 1024;

export type ErrorBody = { message: string };

export function json<T>(status: number, body: T, headers?: HeadersInit): NextResponse<T> {
  return NextResponse.json(body, { status, headers });
}

/** Every error the API sends is { "message": "..." } and nothing else. */
export function fail(status: number, message: string): NextResponse<ErrorBody> {
  return json(status, { message });
}

export function noContent(): NextResponse<null> {
  return new NextResponse(null, { status: 204 });
}

export type JsonBody<T> = { ok: true; body: T } | { ok: false; response: NextResponse<ErrorBody> };

/**
 * Reads the request body as JSON: 413 over 20 KB, 400 when it is empty or not JSON.
 * T is NOT checked here; lib/validation.ts must narrow the value before anything is written.
 *
 *   const parsed = await readJson(req);
 *   if (!parsed.ok) return parsed.response;
 */
export async function readJson<T = unknown>(req: NextRequest): Promise<JsonBody<T>> {
  const tooLarge = () => fail(413, `Request body must be ${MAX_BODY_BYTES / 1024} KB or less`);

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: tooLarge() };
  }

  // Count the bytes actually received: chunked bodies have no Content-Length to trust.
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, response: tooLarge() };
      }
      chunks.push(value);
    }
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return { ok: false, response: fail(400, 'Request body must be a JSON object') };
  }
  try {
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: fail(400, 'Request body is not valid JSON') };
  }
}
