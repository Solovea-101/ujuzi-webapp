import { parseBookingChange, parseDateTime, parseNewBooking } from '@/lib/validation';
import { inDays } from './helpers/shapes';

const NOW = Date.parse('2026-10-21T10:00:00Z');
const valid = () => ({ courseId: 'crs_501', crewSize: 6, preferredStart: '2026-11-28T08:00:00Z', eventName: 'Wanjiku and Otieno wedding' });

describe('parseDateTime', () => {
  it.each([
    ['UTC with Z', '2026-11-28T08:00:00Z', '2026-11-28T08:00:00.000Z'],
    ['an offset, converted to UTC', '2026-11-28T11:00:00+03:00', '2026-11-28T08:00:00.000Z'],
    ['a negative offset', '2026-11-28T03:00:00-05:00', '2026-11-28T08:00:00.000Z'],
    ['fractional seconds, rounded down to the second', '2026-11-28T08:00:00.987Z', '2026-11-28T08:00:00.000Z'],
    ['29 February in a leap year', '2028-02-29T08:00:00Z', '2028-02-29T08:00:00.000Z'],
    ['the last second of a day', '2026-11-28T23:59:59Z', '2026-11-28T23:59:59.000Z'],
  ])('accepts %s', (_name, input, expected) => {
    expect(parseDateTime(input)?.toISOString()).toBe(expected);
  });

  it.each([
    ['30 February (Date.parse would roll it into March)', '2026-02-30T08:00:00Z'],
    ['29 February in a common year', '2027-02-29T08:00:00Z'],
    ['31 April', '2026-04-31T08:00:00Z'],
    ['month 13', '2026-13-01T08:00:00Z'],
    ['day 0', '2026-11-00T08:00:00Z'],
    ['hour 24', '2026-11-28T24:00:00Z'],
    ['minute 60', '2026-11-28T08:60:00Z'],
    ['a leap second', '2026-11-28T08:00:60Z'],
    ['a date with no time', '2026-11-28'],
    ['a time with no zone (local time is ambiguous)', '2026-11-28T08:00:00'],
    ['a space instead of T', '2026-11-28 08:00:00Z'],
    ['an offset of 24 hours', '2026-11-28T08:00:00+24:00'],
    ['a year before 1000', '0999-11-28T08:00:00Z'],
    ['words', 'next Tuesday'],
    ['an empty string', ''],
  ])('rejects %s', (_name, input) => {
    expect(parseDateTime(input)).toBeUndefined();
  });
});

describe('parseNewBooking', () => {
  it('accepts the contract example and returns store-shaped fields', () => {
    const result = parseNewBooking(valid(), NOW);
    expect(result).toEqual({
      ok: true,
      value: { course_id: 'crs_501', crew_size: 6, preferred_start: new Date('2026-11-28T08:00:00Z'), event_name: 'Wanjiku and Otieno wedding' },
    });
  });

  it('trims the event name', () => {
    const result = parseNewBooking({ ...valid(), eventName: '  Kamau reunion  ' }, NOW);
    expect(result.ok && result.value.event_name).toBe('Kamau reunion');
  });

  it.each([
    ['crewSize 1', 1, true],
    ['crewSize 40', 40, true],
    ['crewSize 0', 0, false],
    ['crewSize 41', 41, false],
    ['crewSize -3', -3, false],
    ['crewSize 2.5', 2.5, false],
    ['crewSize as text', '6', false],
    ['crewSize null', null, false],
    ['crewSize as a list', [6], false],
  ])('%s', (_name, crewSize, ok) => {
    const result = parseNewBooking({ ...valid(), crewSize }, NOW);
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.message).toBe('crewSize must be a whole number from 1 to 40');
  });

  it.each([
    ['120 characters', 'x'.repeat(120), true],
    ['121 characters', 'x'.repeat(121), false],
    ['one character', 'x', true],
    ['empty', '', false],
    ['only spaces', '   ', false],
    ['a number', 42, false],
    ['null', null, false],
  ])('eventName of %s', (_name, eventName, ok) => {
    const result = parseNewBooking({ ...valid(), eventName }, NOW);
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.message).toBe('eventName must be 1 to 120 characters');
  });

  it('rejects a start that is not in the future, with the contract message', () => {
    const message = 'preferredStart must be a future date-time, for example 2026-11-28T08:00:00Z';
    expect(parseNewBooking({ ...valid(), preferredStart: '2026-10-21T10:00:00Z' }, NOW)).toEqual({ ok: false, message });
    expect(parseNewBooking({ ...valid(), preferredStart: '2026-10-21T10:00:01Z' }, NOW).ok).toBe(true);
    expect(parseNewBooking({ ...valid(), preferredStart: '2020-01-01T00:00:00Z' }, NOW)).toEqual({ ok: false, message });
    expect(parseNewBooking({ ...valid(), preferredStart: 'soon' }, NOW)).toEqual({ ok: false, message });
    expect(parseNewBooking({ ...valid(), preferredStart: 20261128 }, NOW)).toEqual({ ok: false, message });
  });

  it('names every missing field at once', () => {
    expect(parseNewBooking({}, NOW)).toEqual({ ok: false, message: 'Missing required field(s): courseId, crewSize, preferredStart, eventName' });
    const { crewSize, ...rest } = valid();
    void crewSize;
    expect(parseNewBooking(rest, NOW)).toEqual({ ok: false, message: 'Missing required field(s): crewSize' });
  });

  it('refuses fields the contract does not have, before looking at anything else', () => {
    expect(parseNewBooking({ ...valid(), status: 'confirmed', id: 'bkg_1' }, NOW)).toEqual({ ok: false, message: 'Unknown field(s): status, id' });
  });

  it.each([
    ['a list', []],
    ['null', null],
    ['text', 'booking'],
    ['a number', 7],
  ])('refuses a body that is %s', (_name, body) => {
    expect(parseNewBooking(body, NOW)).toEqual({ ok: false, message: 'Request body must be a JSON object' });
  });

  it('refuses a courseId that is not a sensible text id', () => {
    for (const courseId of ['', '   ', 501, null, 'c'.repeat(65)]) {
      const result = parseNewBooking({ ...valid(), courseId }, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/^courseId must be a text id/);
    }
  });

  it('uses the real clock by default', () => {
    expect(parseNewBooking({ ...valid(), preferredStart: inDays(10) }).ok).toBe(true);
    expect(parseNewBooking({ ...valid(), preferredStart: inDays(-1) }).ok).toBe(false);
  });
});

describe('parseBookingChange', () => {
  it('accepts crewSize and preferredStart', () => {
    expect(parseBookingChange({ crewSize: 8, preferredStart: '2026-11-29T08:00:00Z' }, NOW)).toEqual({
      ok: true,
      value: { crew_size: 8, preferred_start: new Date('2026-11-29T08:00:00Z') },
    });
  });

  it('needs both fields: it replaces the booking\'s state, it is not a partial update', () => {
    expect(parseBookingChange({ crewSize: 8 }, NOW)).toEqual({ ok: false, message: 'Missing required field(s): preferredStart' });
    expect(parseBookingChange({}, NOW)).toEqual({ ok: false, message: 'Missing required field(s): crewSize, preferredStart' });
  });

  it('cannot change the event or the course', () => {
    expect(parseBookingChange({ crewSize: 8, preferredStart: '2026-11-29T08:00:00Z', eventName: 'New name' }, NOW)).toEqual({
      ok: false,
      message: 'Unknown field(s): eventName',
    });
  });

  it('applies the same crew size and future-date rules', () => {
    expect(parseBookingChange({ crewSize: 41, preferredStart: '2026-11-29T08:00:00Z' }, NOW).ok).toBe(false);
    expect(parseBookingChange({ crewSize: 8, preferredStart: '2026-01-01T08:00:00Z' }, NOW).ok).toBe(false);
  });
});
