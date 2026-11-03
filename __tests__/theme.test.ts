import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// The design rules for the website, enforced: colour contrast in both themes, the 6px corner limit, and the styles
// the design brief bans. A change that breaks one fails here, not in someone's eyes on a phone in the sun.

const root = path.resolve(__dirname, '..');
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const themes = { light: block(':root'), dark: block('.dark') };

describe.each(Object.entries(themes))('%s theme', (_name, t) => {
  const grounds = ['bg-canvas', 'bg-surface', 'bg-subtle'];

  it.each(['text-primary', 'text-secondary', 'text-muted'])('%s is readable (4.5:1) on every ground', (text) => {
    for (const ground of grounds) expect(ratio(t[text], t[ground])).toBeGreaterThanOrEqual(4.5);
  });

  it('brand green and the action colour are readable as text on the page, and their buttons are readable', () => {
    for (const ground of ['bg-canvas', 'bg-surface']) {
      expect(ratio(t['brand-primary'], t[ground])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['accent-action'], t[ground])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['accent-seal-text'], t[ground])).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(t['brand-on-primary'], t['brand-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['brand-on-primary'], t['brand-primary-hover'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['accent-action-on'], t['accent-action'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['accent-action-on'], t['accent-action-hover'])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['success', 'warn', 'danger', 'info'])('the %s status text is readable on its own background', (kind) => {
    expect(ratio(t[`status-${kind}-text`], t[`status-${kind}-bg`])).toBeGreaterThanOrEqual(4.5);
  });

  it('ink on a brass stamp is readable, and a frame is visible against the page (3:1)', () => {
    expect(ratio('#141715', t['accent-seal'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['border-strong'], t['bg-canvas'])).toBeGreaterThanOrEqual(3);
    expect(ratio(t['border-strong'], t['bg-surface'])).toBeGreaterThanOrEqual(3);
  });
});

describe('shape', () => {
  it('no corner in the theme is rounder than 6px', () => {
    const radii = [...css.matchAll(/--radius-[a-z0-9]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(radii.length).toBeGreaterThan(3);
    for (const radius of radii) expect(radius).toBeLessThanOrEqual(6);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === 'api' || name === 'node_modules') return [];
    return statSync(full).isDirectory() ? sources(full) : /\.(tsx|css)$/.test(name) ? [full] : [];
  });
}

describe('styles the design rules ban', () => {
  const files = [...sources(path.join(root, 'app')), ...sources(path.join(root, 'components'))].filter((f) => !f.endsWith('swagger-overrides.css'));
  const text = (file: string) => readFileSync(file, 'utf8');

  it.each([
    ['frosted glass', /backdrop-blur/],
    ['soft large shadows', /\bshadow-(md|lg|xl|2xl)\b/],
    ['gradients', /\b(bg-gradient|from-|via-|to-\w+-)/],
    ['big rounded corners', /\brounded-(lg|xl|2xl|3xl)\b/],
    ['purple or indigo', /(indigo|violet|purple|#6366f1|#8b5cf6)/i],
    ['raw backend codes in a label', /\bgrade-III\b(?!['"`])/],
  ])('has no %s', (_name, pattern) => {
    for (const file of files) expect({ file: path.relative(root, file), found: pattern.test(text(file)) }).toEqual({ file: path.relative(root, file), found: false });
  });

  it('uses rounded-full only for the 8px live-connection dot', () => {
    const users = files.filter((file) => /\brounded-full\b/.test(text(file))).map((file) => path.relative(root, file));
    expect(users).toEqual([path.join('app', 'my-applications', 'page.tsx')]);
  });

  it('loads no image or external icon library', () => {
    for (const file of files) expect(text(file)).not.toMatch(/<img\b|lucide|heroicons|react-icons|fontawesome/i);
  });
});
