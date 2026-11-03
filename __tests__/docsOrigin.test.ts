import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DECLARED_SERVER, sameOriginUrl, specForOrigin } from '@/lib/docsOrigin';

describe('the API docs follow the address they were opened on', () => {
  it('uses the server that openapi.yaml really declares', () => {
    const yaml = readFileSync(path.resolve(__dirname, '../openapi.yaml'), 'utf8');
    expect(/^servers:\n {2}- url: (\S+)/m.exec(yaml)?.[1]).toBe(DECLARED_SERVER);
  });

  it('points a "Try it out" call at the page\'s own origin, keeping the path and query', () => {
    expect(sameOriginUrl('http://localhost:3000/api/courses?category=catering&county=Nairobi', 'https://ujuzi.onrender.com'))
      .toBe('https://ujuzi.onrender.com/api/courses?category=catering&county=Nairobi');
    expect(sameOriginUrl('http://localhost:3000', 'http://localhost:3100')).toBe('http://localhost:3100');
    expect(sameOriginUrl('http://localhost:3000/api/bookings/bkg_6001', 'http://localhost:4003')).toBe('http://localhost:4003/api/bookings/bkg_6001');
  });

  it('leaves every other address alone', () => {
    for (const url of ['/openapi.yaml', 'https://example.com/api/courses', 'http://localhost:30001/api', 'http://localhost:3000.evil.example/api']) {
      expect(sameOriginUrl(url, 'https://ujuzi.onrender.com')).toBe(url);
    }
  });

  it('rewrites the declared server in the contract text, and nothing else', () => {
    const out = specForOrigin('servers:\n  - url: http://localhost:3000\n    description: x\nfoo: bar', 'https://ujuzi.onrender.com');
    expect(out).toBe('servers:\n  - url: https://ujuzi.onrender.com\n    description: x\nfoo: bar');
  });
});
