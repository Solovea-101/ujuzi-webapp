import {
  cacheJobContext, formatCategory, formatCategoryShort, formatCertLevel, formatCertLevelShort, formatCountdown, formatKES, formatKESRange,
  formatLocalDate, formatLocalDateTime, formatWeeks, getCachedJobContext, shiftRef,
} from '@/lib/formatters';
import { CATEGORIES, CERTIFICATE_LEVELS } from '@/lib/db/types';

describe('money', () => {
  it('writes shillings with the KES prefix and thousands separators, and no decimals', () => {
    expect(formatKES(3500)).toBe('KES 3,500');
    expect(formatKES(0)).toBe('KES 0');
    expect(formatKES(1_250_000)).toBe('KES 1,250,000');
    expect(formatKES(9000.5)).toBe('KES 9,001');
  });
  it('writes a range with one prefix, or one amount when both ends are equal', () => {
    expect(formatKESRange(1200, 1800)).toBe('KES 1,200 – 1,800');
    expect(formatKESRange(3000, 3000)).toBe('KES 3,000');
  });
});

describe('labels', () => {
  it('has a plain label for every category on the shared list, and none is a raw code', () => {
    for (const code of CATEGORIES) {
      expect(formatCategory(code)).not.toBe(code);
      expect(formatCategory(code)).toMatch(/^[A-Z]/);
      expect(formatCategoryShort(code)).toMatch(/^[A-Z]/);
    }
    expect(formatCategory('catering')).toBe('Catering & Food Service');
    expect(formatCategory('accommodation')).toBe('Accommodation & Housekeeping');
  });
  it('falls back to Title Case for a code it does not know', () => {
    expect(formatCategory('pest-control')).toBe('Pest Control');
  });
  it('has a plain label for every certificate level', () => {
    for (const level of CERTIFICATE_LEVELS) {
      expect(formatCertLevel(level)).not.toBe(level);
      expect(formatCertLevelShort(level)).not.toMatch(/-/);
    }
    expect(formatCertLevel('grade-III')).toBe('NITA Trade Test Grade III');
    expect(formatCertLevel('short-course')).toBe('Short Course Certificate');
    expect(formatCertLevelShort('grade-II')).toBe('Grade II');
  });
  it('turns a job id into a reference people can quote', () => {
    expect(shiftRef('job_12345')).toBe('#12345');
    expect(shiftRef('abc')).toBe('#abc');
  });
  it('counts weeks', () => {
    expect(formatWeeks(1)).toBe('1 week');
    expect(formatWeeks(6)).toBe('6 weeks');
  });
  it('counts down as mm:ss', () => {
    expect(formatCountdown(42)).toBe('00:42');
    expect(formatCountdown(125)).toBe('02:05');
    expect(formatCountdown(-3)).toBe('00:00');
  });
});

describe('dates are written in Kenyan time', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('shows the weekday, day, month and 12-hour time', () => {
    expect(formatLocalDateTime('2026-11-14T05:00:00Z', now)).toBe('Sat, 14 Nov • 8:00 AM');
    expect(formatLocalDateTime('2026-11-14T15:30:00Z', now)).toBe('Sat, 14 Nov • 6:30 PM');
  });
  it('adds the year only when it is not the current one', () => {
    expect(formatLocalDateTime('2027-01-11T07:00:00Z', now)).toBe('Mon, 11 Jan 2027 • 10:00 AM');
  });
  it('moves to the next day after 21:00 UTC, because Kenya is UTC+3', () => {
    expect(formatLocalDateTime('2026-11-14T22:00:00Z', now)).toBe('Sun, 15 Nov • 1:00 AM');
  });
  it('writes a date alone, and hands back text it cannot read', () => {
    expect(formatLocalDate('2026-11-23T07:00:00Z')).toBe('23 Nov 2026');
    expect(formatLocalDateTime('not a date')).toBe('not a date');
    expect(formatLocalDate('not a date')).toBe('not a date');
  });
});

describe('the job cache', () => {
  const job = { jobId: 'job_12345', title: 'Banquet Server', category: 'catering' as const, county: 'Nairobi', area: 'Westlands', duration: 'Weekends', urgent: false, payRange: { minKes: 1200, maxKes: 1800 } };
  const store = new Map<string, string>();
  const install = (blocked = false) => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => { if (blocked) throw new Error('blocked'); return store.get(k) ?? null; },
        setItem: (k: string, v: string) => { if (blocked) throw new Error('blocked'); store.set(k, v); },
      },
    };
  };
  afterEach(() => { delete (globalThis as { window?: unknown }).window; store.clear(); });

  it('remembers what a job was, by id', () => {
    install();
    expect(getCachedJobContext('job_12345')).toBeUndefined();
    cacheJobContext(job);
    expect(getCachedJobContext('job_12345')).toEqual({ title: 'Banquet Server', category: 'catering', county: 'Nairobi', area: 'Westlands', minPay: 1200, maxPay: 1800 });
    expect(store.has('ujuzi_job_cache_v1')).toBe(true);
  });
  it('keeps only the newest 200 jobs', () => {
    install();
    for (let i = 0; i < 205; i++) cacheJobContext({ ...job, jobId: `job_${i}` });
    expect(getCachedJobContext('job_0')).toBeUndefined();
    expect(getCachedJobContext('job_204')).toBeDefined();
  });
  it('shrugs off damaged or blocked storage', () => {
    install();
    store.set('ujuzi_job_cache_v1', '{not json');
    expect(getCachedJobContext('job_1')).toBeUndefined();
    expect(() => cacheJobContext(job)).not.toThrow();
    install(true);
    expect(getCachedJobContext('job_1')).toBeUndefined();
    expect(() => cacheJobContext(job)).not.toThrow();
  });
});
