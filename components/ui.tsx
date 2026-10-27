import type { ReactNode } from 'react';

export function Page({ title, children, intro }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold text-brand-700">{title}</h1>
      {intro && <p className="mt-2 max-w-2xl text-ink/80">{intro}</p>}
      <div className="mt-6">{children}</div>
    </main>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-brand-100 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-900">{children}</p>;
}

const FIELD = 'mt-1 w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

export function Field({ label, children, hint }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-ink/60">{hint}</span>}
    </label>
  );
}

export const inputClass = FIELD;

export function Button({
  children, onClick, type = 'button', disabled, tone = 'primary',
}: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; tone?: 'primary' | 'plain' | 'danger' }) {
  const tones = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    plain: 'border border-ink/20 bg-white text-ink hover:bg-brand-50',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

const BADGES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  accepted: 'bg-brand-100 text-brand-900',
  confirmed: 'bg-brand-100 text-brand-900',
  filled: 'bg-ink/10 text-ink',
  declined: 'bg-red-100 text-red-800',
  cancelled: 'bg-ink/10 text-ink/70',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[status] ?? 'bg-ink/10'}`}>{status}</span>;
}
