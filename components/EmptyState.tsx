import type { ReactNode } from 'react';

/** Shown when a list has nothing in it: a stamp, one sentence on what to do, and the action. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="bg-blueprint rounded-md border-2 border-dashed border-line-strong bg-surface p-6 text-center">
      <svg className="mx-auto text-ink-muted" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
        <path d="M6 12h28v20H6z M6 12l14-8 14 8 M14 20h12 M14 26h8" />
      </svg>
      <h2 className="mt-3 font-display text-lg font-bold text-ink">{title}</h2>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
