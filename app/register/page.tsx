'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, Field, inputClass, Page } from '@/components/ui';
import { api, setToken, type Schemas } from '@/lib/clientApi';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<Schemas['AuthResponse']>('/api/auth/register', { method: 'POST', body: { role: 'graduate', ...form } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setToken(res.data.token);
    window.location.assign('/');
  }

  return (
    <Page title="Create your account" intro="Graduates sign up here. Centre staff accounts are created by their centre.">
      <Card className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><input className={inputClass} required maxLength={60} autoComplete="given-name" value={form.firstName} onChange={set('firstName')} /></Field>
            <Field label="Last name"><input className={inputClass} required maxLength={60} autoComplete="family-name" value={form.lastName} onChange={set('lastName')} /></Field>
          </div>
          <Field label="Email"><input className={inputClass} type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Password" hint="At least 8 characters."><input className={inputClass} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
          <ErrorNote message={error} />
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
        </form>
        <p className="mt-4 text-sm text-ink/70">Already registered? <Link className="font-semibold text-brand-700 underline" href="/login">Log in</Link></p>
      </Card>
    </Page>
  );
}
