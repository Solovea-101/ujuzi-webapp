import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bodyProblems, classifyProbe, countFields, fieldProblems, fillPlaceholders, parseContract, responseCheck, strictify } from '@/scripts/verifyContract';

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

  it('probes with an id that cannot exist, so probing a built DELETE or PUT never touches a real record', () => {
    const real = parseContract(readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
    const del = real.operations.find((o) => o.key === 'DELETE /api/bookings/{bookingId}');
    expect(del?.probeUrl).toBe('/api/bookings/verify-probe');
    expect(del?.url).toBe('/api/bookings/bkg_6001'); // the documented example, used for nothing destructive
    for (const op of real.operations) expect(op.probeUrl).not.toMatch(/[{}]/);
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

  it('calls 405 pending: the route file exists but does not export that method yet', () => {
    expect(classifyProbe(405, undefined)).toEqual({ kind: 'pending', note: 'method not built yet' });
  });

  it('calls 502 built (Kazi unreachable is documented containment) but any other 5xx failed', () => {
    expect(classifyProbe(502, { message: 'Kazi Connect could not be reached' }).kind).toBe('built');
    expect(classifyProbe(500, { message: 'Internal server error' }).kind).toBe('failed');
    expect(classifyProbe(503, undefined).kind).toBe('failed');
  });
});

describe('field-by-field checking against the real contract', () => {
  const contract = parseContract(readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
  const check = (key: string, status: string) => {
    const operation = contract.operations.find((o) => o.key === key);
    if (!operation) throw new Error(`no operation ${key}`);
    return responseCheck(contract, operation, status);
  };
  const course = {
    id: 'crs_501',
    title: 'Food hygiene and event service',
    category: 'catering',
    centre: { id: 'cen_11', name: 'Westlands Skills Centre' },
    county: 'Nairobi',
    area: 'Westlands',
    durationWeeks: 2,
    feeKes: 3500,
    nextStart: '2026-11-23T07:00:00Z',
    certificateLevel: 'short-course',
  };
  const oneCourse = check('GET /api/courses/{courseId}', '200');
  const problems = (body: unknown) => bodyProblems(oneCourse, body).join(' | ');

  it('accepts a body that matches the contract exactly', () => {
    expect(bodyProblems(oneCourse, course)).toEqual([]);
  });

  it('rejects a field the contract does not declare, at the top level and nested', () => {
    expect(problems({ ...course, colour: 'green' })).toMatch(/must NOT have additional properties "colour"/);
    expect(problems({ ...course, centre: { ...course.centre, phone: '0700' } })).toMatch(/body\.centre: .*"phone"/);
  });

  it('rejects a declared field that is missing', () => {
    const { area, ...withoutArea } = course;
    void area;
    expect(problems(withoutArea)).toMatch(/body: must have required property 'area'$/);
  });

  it('rejects a wrong type, a value outside the enum, and a non-integer', () => {
    expect(problems({ ...course, feeKes: '3500' })).toMatch(/body\.feeKes: must be integer/);
    expect(problems({ ...course, category: 'cooking' })).toMatch(/body\.category: must be equal to one of the allowed values/);
    expect(problems({ ...course, durationWeeks: 2.5 })).toMatch(/body\.durationWeeks: must be integer/);
  });

  it('rejects a date-time with milliseconds, with an offset, or that is not a date', () => {
    for (const nextStart of ['2026-11-23T07:00:00.000Z', '2026-11-23T10:00:00+03:00', '2026-11-23', 'soon']) {
      expect(problems({ ...course, nextStart })).toMatch(/body\.nextStart/);
    }
  });

  it('checks every item of an array', () => {
    const list = check('GET /api/courses', '200');
    expect(bodyProblems(list, [])).toEqual([]);
    expect(bodyProblems(list, [course, course])).toEqual([]);
    expect(bodyProblems(list, [course, { ...course, extra: 1 }]).join()).toMatch(/body\.1: .*"extra"/);
    expect(bodyProblems(list, { not: 'an array' }).join()).toMatch(/must be array/);
  });

  it('holds error bodies to exactly { message }', () => {
    const notFound = check('GET /api/courses/{courseId}', '404');
    expect(bodyProblems(notFound, { message: 'Course crs_999 not found' })).toEqual([]);
    expect(bodyProblems(notFound, { message: 'x', code: 404 }).join()).toMatch(/"code"/);
    expect(bodyProblems(notFound, { error: 'x' }).join()).toMatch(/required property 'message'/);
    expect(bodyProblems(notFound, undefined)).toEqual(['the contract documents a body, but it was empty']);
  });

  it('expects no body where the contract documents none', () => {
    const cancelled = check('DELETE /api/bookings/{bookingId}', '204');
    expect(bodyProblems(cancelled, undefined)).toEqual([]);
    expect(bodyProblems(cancelled, { message: 'x' })).toEqual(['the contract documents no body, but one was sent']);
  });

  it('strictify leaves examples alone and makes a date-time pattern', () => {
    const out = strictify({ type: 'object', properties: { at: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00Z' } } });
    expect(out).toMatchObject({ additionalProperties: false, required: ['at'] });
    expect((out.properties as Record<string, { example: string; pattern: string }>).at.example).toBe('2026-01-01T00:00:00Z');
    expect((out.properties as Record<string, { pattern: string }>).at.pattern).toMatch(/Z\$$/);
  });

  it('counts the fields of a body, including nested ones and every array item', () => {
    expect(countFields(course)).toBe(12);
    expect(countFields([course, course])).toBe(24);
    expect(countFields([])).toBe(0);
    expect(countFields(undefined)).toBe(0);
  });
});

describe('fillPlaceholders', () => {
  it('fills captured values and reports the ones that were never captured', () => {
    const vars = new Map([['bookingId', 'bkg_6003']]);
    expect(fillPlaceholders('/api/bookings/{{bookingId}}', vars)).toEqual({ text: '/api/bookings/bkg_6003', missing: [] });
    expect(fillPlaceholders('/api/{{a}}/{{b}}', vars)).toEqual({ text: '/api//', missing: ['a', 'b'] });
    expect(fillPlaceholders('/api/courses', vars)).toEqual({ text: '/api/courses', missing: [] });
  });
});

describe('fieldProblems', () => {
  it('passes when every expected field has exactly the expected value', () => {
    expect(fieldProblems({ crewSize: 8, status: 'pending', extra: true }, { crewSize: 8, status: 'pending' })).toEqual([]);
  });

  it('names each field that is wrong or missing', () => {
    expect(fieldProblems({ crewSize: 6 }, { crewSize: 8, status: 'pending' })).toEqual([
      'crewSize should be 8, but is 6',
      'status should be "pending", but is undefined',
    ]);
  });

  it('refuses to compare an answer that is not an object', () => {
    expect(fieldProblems([1], { a: 1 })).toHaveLength(1);
    expect(fieldProblems(undefined, { a: 1 })).toHaveLength(1);
  });
});
