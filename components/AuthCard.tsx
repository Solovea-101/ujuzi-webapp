import type { ReactNode } from 'react';
import { Emblem } from './Logo';

/** The frame for sign-in and sign-up: a registration card from a trade passbook. */
export function AuthCard({ children, stamp }: { children: ReactNode; stamp: string }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-md border-2 border-line-strong bg-surface shadow-tactile">
      <div className="flex items-center justify-between border-b-2 border-dashed border-line-strong px-5 py-3 text-brand">
        <Emblem size={24} />
        <span className="font-mono text-xs font-bold uppercase tracking-wide text-ink-secondary">{stamp}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Shown when sign-in is paused after too many wrong passwords. */
export function CooldownBanner({ message, left }: { message: string; left: string }) {
  return (
    <div role="alert" className="rounded-sm border border-warn-border bg-warn-bg px-3 py-2 text-sm text-warn-text">
      <p className="font-bold">Too many password attempts</p>
      <p className="mt-0.5">{message}</p>
      <p className="mt-1">For your security, sign-in is paused. Try again in <span className="tabular font-mono font-bold">{left}</span>.</p>
    </div>
  );
}
