import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Emblem } from '@/components/Logo';
import { TradeIcon } from '@/components/TradeIcon';
import { buttonClass, ErrorNote, Stat, StatusBadge } from '@/components/ui';
import { CATEGORIES } from '@/lib/db/types';

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe('StatusBadge', () => {
  it.each([
    ['pending', 'Pending'], ['accepted', 'Accepted'], ['confirmed', 'Confirmed'], ['filled', 'Filled'],
    ['declined', 'Declined'], ['cancelled', 'Cancelled'], ['urgent', 'Urgent'], ['live', 'Live'], ['offline', 'Offline'],
  ])('shows %s as the word "%s" and a symbol, so colour is never the only signal', (status, label) => {
    const out = html(createElement(StatusBadge, { status }));
    expect(out).toContain(label);
    expect(out).toMatch(/aria-hidden="true"[^>]*>[^<]+<\/span>/); // the symbol
  });
  it('shows an unknown status as its own text rather than nothing', () => {
    expect(html(createElement(StatusBadge, { status: 'mystery' }))).toContain('mystery');
  });
});

describe('TradeIcon', () => {
  it('draws a different symbol for each of the nine trades, in square-cornered strokes', () => {
    const paths = new Set(CATEGORIES.map((code) => {
      const out = html(createElement(TradeIcon, { category: code }));
      expect(out).toContain('stroke-width="1.75"');
      expect(out).toContain('stroke-linecap="square"');
      expect(out).toContain('stroke-linejoin="miter"');
      expect(out).toContain('aria-hidden="true"');
      return /d="([^"]+)"/.exec(out)?.[1];
    }));
    expect(paths.size).toBe(CATEGORIES.length);
  });
  it('falls back to a plain mark for a trade it does not know', () => {
    expect(html(createElement(TradeIcon, { category: 'pest-control' }))).toContain('<path');
  });
});

describe('small pieces', () => {
  it('draws the emblem as an inline image-free svg', () => {
    const out = html(createElement(Emblem));
    expect(out).toContain('<svg');
    expect(out).not.toContain('<img');
  });
  it('shows an error with the exact message it was given, as an alert', () => {
    const out = html(createElement(ErrorNote, { message: 'Course crs_999 not found' }));
    expect(out).toContain('role="alert"');
    expect(out).toContain('Course crs_999 not found');
    expect(html(createElement(ErrorNote, { message: null }))).toBe('');
  });
  it('gives every button size a thumb-sized height', () => {
    expect(buttonClass({ size: 'md' })).toContain('min-h-11');
    expect(buttonClass({ size: 'lg' })).toContain('min-h-12');
  });
  it('labels a ledger value', () => {
    const out = html(createElement(Stat, { label: 'Fee', children: 'KES 3,500' }));
    expect(out).toContain('Fee');
    expect(out).toContain('KES 3,500');
  });
});
