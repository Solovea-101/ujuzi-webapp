'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, Field, inputClass, Page } from '@/components/ui';
import { api, setToken, type Schemas } from '@/lib/clientApi';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<Schemas['AuthResponse']>('/api/auth/login', { method: 'POST', body: { email, password } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setToken(res.data.token);
    window.location.assign(res.data.user.role === 'staff' ? '/staff' : '/');
    router.refresh();
  }

  return (
    <Page title="Log in">
      <Card className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Button>
        </form>
        <p className="mt-4 text-sm text-ink/70">New here? <Link className="font-semibold text-brand-700 underline" href="/register">Create an account</Link></p>
      </Card>
    </Page>
  );
}
