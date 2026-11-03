'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthCard, CooldownBanner } from '@/components/AuthCard';
import { PasswordField } from '@/components/PasswordField';
import { Button, ErrorNote, Field, inputClass, Page } from '@/components/ui';
import { api, setToken, type Schemas } from '@/lib/clientApi';
import { formatCountdown } from '@/lib/formatters';
import { useCountdown } from '@/lib/useCountdown';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState<{ message: string; seconds: number } | null>(null);
  const left = useCountdown(paused?.seconds ?? null);
  const locked = paused !== null && left > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    setError(null);
    setPaused(null);
    const res = await api<Schemas['AuthResponse']>('/api/auth/login', { method: 'POST', body: { email, password } });
    setBusy(false);
    if (!res.ok) {
      if (res.status === 429) return setPaused({ message: res.message, seconds: res.retryAfter ?? 60 });
      return setError(res.message);
    }
    setToken(res.data.token);
    window.location.assign(res.data.user.role === 'staff' ? '/staff' : '/');
    router.refresh();
  }

  return (
    <Page title="Log in" width="narrow">
      <AuthCard stamp="Member card">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          {locked && paused && <CooldownBanner message={paused.message} left={formatCountdown(left)} />}
          <ErrorNote message={error} />
          <Button type="submit" size="lg" full loading={busy} disabled={locked}>{busy ? 'Logging in…' : 'Log in'}</Button>
        </form>
        <p className="mt-4 text-sm text-ink-secondary">New here? <Link className="font-semibold text-brand underline" href="/register">Create an account</Link></p>
      </AuthCard>
    </Page>
  );
}
