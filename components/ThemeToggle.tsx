'use client';

import { useEffect, useState } from 'react';

const THEME_KEY = 'ujuzi.theme';

/** Light or dark. The choice is remembered in this browser; layout.tsx applies it before the first paint. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // the choice just is not remembered
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex size-11 items-center justify-center rounded-sm border border-line-strong bg-surface text-ink hover:bg-subtle"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        {dark ? (
          <path d="M10 3v2 M10 15v2 M3 10h2 M15 10h2 M5 5l1.5 1.5 M13.5 13.5L15 15 M5 15l1.5-1.5 M13.5 6.5L15 5 M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        ) : (
          <path d="M16 12A7 7 0 0 1 8 4a7 7 0 1 0 8 8z" />
        )}
      </svg>
    </button>
  );
}
