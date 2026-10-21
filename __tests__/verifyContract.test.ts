import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyProbe, parseContract } from '@/scripts/verifyContract';

const contract = (paths: string) => `openapi: 3.0.3\ninfo: { title: T, version: 1.0.0 }\npaths:\n${paths}`;

describe('parseContract', () => {
  it('lists operations and fills path parameters from their examples, through $ref and path-level parameters', () => {
    const text = `${contract(`  /api/bookings/{bookingId}:
    parameters:
      - $ref: '#/components/parameters/BookingId'
    get:
      responses: { '200': { description: ok }, '404': { description: missing } }
    delete:
      responses: { '204': { description: gone } }
  /api/courses/{courseId}/job-matches/{n}:
    get:
      parameters:
        - { name: courseId, in: path, required: true, schema: { type: string, example: crs_501 } }
        - { name: n, in: path, required: true, example: 3, schema: { type: integer } }
      responses: { '200': { description: ok } }
`)}components:
  parameters:
    BookingId: { name: bookingId, in: path, required: true, schema: { type: string, example: bkg_6001 } }
`;
    const parsed = parseContract(text);
    expect(parsed).toMatchObject({ openapi: '3.0.3', version: '1.0.0' });
    expect(parsed.operations.map((o) => `${o.method} ${o.url}`)).toEqual([
      'get /api/bookings/bkg_6001',
      'delete /api/bookings/bkg_6001',
      'get /api/courses/crs_501/job-matches/3',
    ]);
    expect(parsed.operations[0].statuses).toEqual(['200', '404']);
  });

  it('rejects a contract that is not OpenAPI 3.0', () => {
    expect(() => parseContract('openapi: 2.0\ninfo: { version: 1 }\npaths: {}')).toThrow(/3\.0\.x/);
  });

  it('rejects an operation with no responses', () => {
    expect(() => parseContract(contract('  /api/a:\n    get: { summary: x }\n'))).toThrow(/GET \/api\/a documents no responses/);
  });

  it('rejects a path parameter with no example', () => {
    const text = contract(`  /api/a/{id}:
    get:
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '200': { description: ok } }
`);
    expect(() => parseContract(text)).toThrow(/\{id\} has no example/);
  });

  it('rejects a $ref that points nowhere', () => {
    const text = contract(`  /api/a/{id}:
    get:
      parameters: [{ $ref: '#/components/parameters/Nope' }]
      responses: { '200': { description: ok } }
`);
    expect(() => parseContract(text)).toThrow(/Unresolved \$ref/);
  });

  it('reads the real openapi.yaml: every operation has a concrete URL and documented statuses', () => {
    const real = parseContract(readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
    expect(real.operations.length).toBeGreaterThan(0);
    for (const op of real.operations) {
      expect(op.url).not.toMatch(/[{}]/);
      expect(op.statuses.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyProbe', () => {
  it('calls the catch-all route\'s 404 pending', () => {
    expect(classifyProbe(404, { message: 'No endpoint GET /api/courses' }).kind).toBe('pending');
  });

  it('calls a real handler\'s 404 built, because the route exists', () => {
    expect(classifyProbe(404, { message: 'Course crs_999 not found' }).kind).toBe('built');
  });

  it('calls ordinary answers built, including validation and auth errors', () => {
    for (const status of [200, 201, 204, 400, 401, 403, 409, 413]) {
      expect(classifyProbe(status, undefined).kind).toBe('built');
    }
  });

  it('calls 502 built (Kazi unreachable is documented containment) but any other 5xx failed', () => {
    expect(classifyProbe(502, { message: 'Kazi Connect could not be reached' }).kind).toBe('built');
    expect(classifyProbe(500, { message: 'Internal server error' }).kind).toBe('failed');
    expect(classifyProbe(503, undefined).kind).toBe('failed');
  });
});
