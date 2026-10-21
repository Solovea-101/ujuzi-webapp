import { NextRequest } from 'next/server';
import { fail, json, MAX_BODY_BYTES, noContent, readJson } from '@/lib/http';

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/bookings', { method: 'POST', body, headers });

describe('response helpers', () => {
  it('json sends the status and body', async () => {
    const res = json(201, { id: 'bkg_6001' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'bkg_6001' });
  });

  it('fail sends only { message }', async () => {
    const res = fail(404, 'Course crs_999 not found');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: 'Course crs_999 not found' });
  });

  it('noContent is a 204 with no body', async () => {
    const res = noContent();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});

describe('readJson', () => {
  it('returns the parsed body', async () => {
    const result = await readJson<{ crewSize: number }>(post('{"crewSize":6}'));
    expect(result).toEqual({ ok: true, body: { crewSize: 6 } });
  });

  it('answers 400 { message } for malformed JSON', async () => {
    const result = await readJson(post('{"crewSize":'));
    if (result.ok) throw new Error('expected a failure');
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({ message: 'Request body is not valid JSON' });
  });

  it('answers 400 for an empty body', async () => {
    const result = await readJson(post(null));
    if (result.ok) throw new Error('expected a failure');
    expect(result.response.status).toBe(400);
  });

  it('accepts a body of exactly 20 KB', async () => {
    const padding = 'x'.repeat(MAX_BODY_BYTES - '{"a":""}'.length);
    const result = await readJson(post(`{"a":"${padding}"}`));
    expect(result.ok).toBe(true);
  });

  it('answers 413 for a body over 20 KB', async () => {
    const result = await readJson(post(`{"a":"${'x'.repeat(MAX_BODY_BYTES)}"}`));
    if (result.ok) throw new Error('expected a failure');
    expect(result.response.status).toBe(413);
    expect(await result.response.json()).toEqual({ message: 'Request body must be 20 KB or less' });
  });

  it('answers 413 from the declared length without trusting a small body', async () => {
    const result = await readJson(post('{}', { 'content-length': String(MAX_BODY_BYTES + 1) }));
    if (result.ok) throw new Error('expected a failure');
    expect(result.response.status).toBe(413);
  });
});
