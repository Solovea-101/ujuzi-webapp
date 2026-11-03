import type { ReactNode } from 'react';

/** The page frame: one h1, an optional plain-English intro, and the content. `wide` is for tables and workbenches. */
export function Page({
  title, children, intro, width = 'default',
}: { title: string; intro?: string; children: ReactNode; width?: 'narrow' | 'default' | 'wide' }) {
  const max = width === 'narrow' ? 'max-w-md' : width === 'wide' ? 'max-w-6xl' : 'max-w-5xl';
  return (
    <main id="main" className={`mx-auto w-full ${max} px-4 py-6 sm:px-6 lg:px-8 lg:py-10`}>
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {intro && <p className="mt-2 max-w-2xl text-ink-secondary">{intro}</p>}
      <div className="mt-6">{children}</div>
    </main>
  );
}

type CardVariant = 'default' | 'interactive' | 'ticket';

/** A bordered sheet. `interactive` gets the hard-offset shadow of something you can press; `ticket` has no padding so halves can be stacked. */
export function Card({ children, className = '', variant = 'default' }: { children: ReactNode; className?: string; variant?: CardVariant }) {
  const base = 'rounded-md border border-line-strong bg-surface text-ink';
  const kinds: Record<CardVariant, string> = {
    default: 'p-4',
    interactive: 'p-4 shadow-tactile-sm transition-transform motion-safe:hover:translate-x-px motion-safe:hover:translate-y-px motion-safe:hover:shadow-none',
    ticket: 'overflow-hidden',
  };
  return <section className={`${base} ${kinds[variant]} ${className}`}>{children}</section>;
}

export function ErrorNote({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex gap-2 rounded-sm border border-bad-border bg-bad-bg px-3 py-2 text-sm text-bad-text">
      <span aria-hidden="true" className="font-mono font-bold">!</span>
      <span>{message}</span>
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex gap-2 rounded-sm border border-ok-border bg-ok-bg px-3 py-2 text-sm text-ok-text">
      <span aria-hidden="true" className="font-mono font-bold">✓</span>
      <span>{children}</span>
    </p>
  );
}

/** The class every text input, select and textarea uses. 44px tall so a thumb can hit it. */
export const inputClass =
  'mt-1 block min-h-11 w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

export function Field({ label, children, hint }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-ink-muted">{hint}</span>}
    </label>
  );
}

type Tone = 'primary' | 'action' | 'plain' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/** The class for anything that looks like a button, so a Link can wear it too. */
export function buttonClass({ tone = 'primary', size = 'md', full = false }: { tone?: Tone; size?: Size; full?: boolean } = {}): string {
  const tones: Record<Tone, string> = {
    primary: 'border border-line-strong bg-brand text-on-brand shadow-tactile-sm hover:bg-brand-hover',
    action: 'border border-line-strong bg-terracotta text-on-terracotta shadow-tactile-sm hover:bg-terracotta-hover',
    plain: 'border border-line-strong bg-surface text-ink hover:bg-subtle',
    danger: 'border border-bad-border bg-surface text-bad-text hover:bg-bad-bg',
  };
  const sizes: Record<Size, string> = {
    sm: 'min-h-9 px-3 text-sm',
    md: 'min-h-11 px-4 text-sm',
    lg: 'min-h-12 px-5 text-base',
  };
  return [
    'inline-flex items-center justify-center gap-2 rounded-sm font-semibold transition-transform',
    'active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
    tones[tone], sizes[size], full ? 'w-full' : '',
  ].join(' ');
}

export function Button({
  children, onClick, type = 'button', disabled, tone = 'primary', size = 'md', loading = false, full = false,
}: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean;
  tone?: Tone; size?: Size; loading?: boolean; full?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass({ tone, size, full })}>
      {loading && <span aria-hidden="true" className="size-3 border-2 border-current border-t-transparent motion-safe:animate-spin" style={{ borderRadius: 2 }} />}
      {children}
    </button>
  );
}

type Look = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'urgent';

const BADGES: Record<string, { label: string; look: Look; icon: string }> = {
  pending: { label: 'Pending', look: 'warn', icon: '●' },
  accepted: { label: 'Accepted', look: 'ok', icon: '✓' },
  confirmed: { label: 'Confirmed', look: 'ok', icon: '✓' },
  filled: { label: 'Filled', look: 'neutral', icon: '■' },
  declined: { label: 'Declined', look: 'bad', icon: '✕' },
  cancelled: { label: 'Cancelled', look: 'neutral', icon: '✕' },
  urgent: { label: 'Urgent', look: 'urgent', icon: '!' },
  live: { label: 'Live', look: 'ok', icon: '●' },
  offline: { label: 'Offline', look: 'neutral', icon: '○' },
};

const LOOKS: Record<Look, string> = {
  ok: 'border-ok-border bg-ok-bg text-ok-text',
  warn: 'border-warn-border bg-warn-bg text-warn-text',
  bad: 'border-bad-border bg-bad-bg text-bad-text',
  info: 'border-info-border bg-info-bg text-info-text',
  neutral: 'border-line-strong bg-subtle text-ink-secondary',
  urgent: 'border-line-strong bg-terracotta text-on-terracotta',
};

/** Status as a word and a symbol, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const badge = BADGES[status] ?? { label: status, look: 'neutral' as Look, icon: '●' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${LOOKS[badge.look]}`}>
      <span aria-hidden="true" className="font-mono">{badge.icon}</span>
      {badge.label}
    </span>
  );
}

/** A label above a value, for the ledger rows of a course or booking. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{children}</dd>
    </div>
  );
}
