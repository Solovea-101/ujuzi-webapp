'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthCard, CooldownBanner } from '@/components/AuthCard';
import { PasswordField } from '@/components/PasswordField';
import { Button, ErrorNote, Field, inputClass, Page } from '@/components/ui';
import { api, setToken, type Schemas } from '@/lib/clientApi';
import { formatCountdown } from '@/lib/formatters';
import { useCountdown } from '@/lib/useCountdown';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState<{ message: string; seconds: number } | null>(null);
  const left = useCountdown(paused?.seconds ?? null);
  const locked = paused !== null && left > 0;
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    setError(null);
    setPaused(null);
    const res = await api<Schemas['AuthResponse']>('/api/auth/register', { method: 'POST', body: { role: 'graduate', ...form } });
    setBusy(false);
    if (!res.ok) {
      if (res.status === 429) return setPaused({ message: res.message, seconds: res.retryAfter ?? 60 });
      return setError(res.message);
    }
    setToken(res.data.token);
    window.location.assign('/');
  }

  return (
    <Page title="Create your account" intro="For graduates looking for training and work. Centre staff accounts are issued by your TVET centre." width="narrow">
      <AuthCard stamp="New member">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><input className={inputClass} required maxLength={60} autoComplete="given-name" value={form.firstName} onChange={set('firstName')} /></Field>
            <Field label="Last name"><input className={inputClass} required maxLength={60} autoComplete="family-name" value={form.lastName} onChange={set('lastName')} /></Field>
          </div>
          <Field label="Email"><input className={inputClass} type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
          <PasswordField label="Password" hint="At least 8 characters." minLength={8} autoComplete="new-password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          {locked && paused && <CooldownBanner message={paused.message} left={formatCountdown(left)} />}
          <ErrorNote message={error} />
          <Button type="submit" size="lg" full loading={busy} disabled={locked}>{busy ? 'Creating…' : 'Create account'}</Button>
        </form>
        <p className="mt-4 text-sm text-ink-secondary">Already registered? <Link className="font-semibold text-brand underline" href="/login">Log in</Link></p>
      </AuthCard>
    </Page>
  );
}
