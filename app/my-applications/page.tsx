'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, Field, inputClass, Notice, Page, StatusBadge } from '@/components/ui';
import { api, formatWhen, localInputToUtc, type Schemas } from '@/lib/clientApi';
import { useAuth } from '@/lib/useAuth';
import { useFeed, type FeedEvent } from '@/lib/useFeed';

type Application = Schemas['Application'];

const MEANING: Record<string, string> = {
  pending: 'Waiting for the employer to decide.',
  accepted: 'You got the job. The employer accepted your application.',
  filled: 'The job went to someone else.',
  cancelled: 'You withdrew this application.',
};

export default function MyApplicationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<Application[]>('/api/me/applications');
    if (res.ok) setItems(res.data);
    else setError(res.message);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/login');
    if (user.role !== 'graduate') return router.replace('/staff');
    void load();
  }, [user, loading, router, load]);

  const feed = useFeed(user?.role === 'graduate', (event: FeedEvent) => {
    setItems((current) => current?.map((a) => (a.applicationId === event.applicationId ? { ...a, status: event.status } : a)) ?? current);
    setFlash(`Application ${event.applicationId} is now ${event.status}.`);
  });

  async function withdraw(id: string) {
    setFormError(null);
    const res = await api(`/api/me/applications/${id}`, { method: 'DELETE' });
    if (!res.ok) return setFormError(res.message);
    void load();
  }

  async function reschedule(event: FormEvent, id: string) {
    event.preventDefault();
    const preferredDate = localInputToUtc(date);
    if (!preferredDate) return setFormError('Choose a new date and time.');
    const res = await api<Application>(`/api/me/applications/${id}`, { method: 'PUT', body: { preferredDate } });
    if (!res.ok) return setFormError(res.message);
    setRescheduling(null);
    setFormError(null);
    void load();
  }

  return (
    <Page title="My applications" intro="Jobs you applied for through Ujuzi. Statuses update on this page by themselves.">
      <p className="mb-3 text-xs text-ink/60" aria-live="polite">Live updates: {feed === 'live' ? 'connected' : feed === 'connecting' ? 'connecting…' : 'offline, retrying'}</p>
      {flash && <div className="mb-3"><Notice>{flash}</Notice></div>}
      <ErrorNote message={error ?? formError} />
      {items === null && !error && <p className="text-ink/60">Loading…</p>}
      {items?.length === 0 && <p className="text-ink/70">No applications yet. Open a <Link className="underline" href="/">course</Link> to see jobs that match it.</p>}
      <ul className="mt-3 space-y-3">
        {items?.map((app) => (
          <li key={app.applicationId}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">Job {app.jobId} <StatusBadge status={app.status} /></p>
                  <p className="text-sm text-ink/70">Start {formatWhen(app.preferredDate)}{app.note ? ` · "${app.note}"` : ''}</p>
                  <p className="mt-1 text-sm">{MEANING[app.status]}</p>
                </div>
                {app.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button tone="plain" onClick={() => { setRescheduling(app.applicationId); setDate(''); setFormError(null); }}>Reschedule</Button>
                    <Button tone="danger" onClick={() => withdraw(app.applicationId)}>Withdraw</Button>
                  </div>
                )}
              </div>
              {rescheduling === app.applicationId && (
                <form onSubmit={(e) => reschedule(e, app.applicationId)} className="mt-4 flex flex-wrap items-end gap-3 border-t border-brand-100 pt-4">
                  <Field label="New start"><input className={inputClass} type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                  <Button type="submit">Save</Button>
                  <Button tone="plain" onClick={() => setRescheduling(null)}>Cancel</Button>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </Page>
  );
}
