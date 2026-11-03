'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { RowSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { Button, buttonClass, Card, ErrorNote, Field, inputClass, Page, StatusBadge } from '@/components/ui';
import { api, localInputToUtc, type Schemas } from '@/lib/clientApi';
import { formatCategory, formatKESRange, formatLocalDateTime, getCachedJobContext, shiftRef } from '@/lib/formatters';
import { useAuth } from '@/lib/useAuth';
import { useFeed, type FeedEvent } from '@/lib/useFeed';

type Application = Schemas['Application'];

const MEANING: Record<string, string> = {
  pending: 'Your application is with the employer. You will see it change here as soon as they decide.',
  accepted: 'You got the job. The employer accepted your application.',
  filled: 'The job went to someone else. Look for another shift on a course page.',
  cancelled: 'You withdrew this application.',
};

const FEED_TEXT = {
  live: ['bg-ok-text', 'Live updates active. Status changes appear automatically.'],
  connecting: ['bg-warn-text', 'Connecting to live shift updates…'],
  offline: ['bg-ink-muted', 'Live updates paused (offline). Reload the page to check the status.'],
} as const;

/** Applied → Under review → Decision, with the current step filled in. */
function Progress({ status }: { status: string }) {
  const decided = status !== 'pending';
  const decision = status === 'accepted' ? 'Accepted' : status === 'filled' ? 'Filled' : status === 'cancelled' ? 'Withdrawn' : 'Decision';
  const steps = [
    { label: 'Applied', done: true },
    { label: 'Under review', done: true, current: !decided },
    { label: decision, done: decided, current: decided },
  ];
  return (
    <ol className="mt-3 grid grid-cols-3 gap-1 text-xs font-semibold" aria-label="Progress">
      {steps.map((step) => (
        <li key={step.label}>
          <div className={`h-2 border border-line-strong ${step.done ? (step.current ? 'bg-terracotta' : 'bg-brand') : 'bg-surface'}`} />
          <p className={`mt-1 ${step.done ? 'text-ink' : 'text-ink-muted'}`}>{step.label}</p>
        </li>
      ))}
    </ol>
  );
}

export default function MyApplicationsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    toast(`An application is now ${event.status}.`, 'info');
  });

  async function withdraw(id: string) {
    setFormError(null);
    const res = await api(`/api/me/applications/${id}`, { method: 'DELETE' });
    setConfirming(null);
    if (!res.ok) return setFormError(res.message);
    toast('Application withdrawn.');
    void load();
  }

  async function reschedule(event: FormEvent, id: string) {
    event.preventDefault();
    const preferredDate = localInputToUtc(date);
    if (!preferredDate) return setFormError('Choose a new date and time.');
    setSaving(true);
    const res = await api<Application>(`/api/me/applications/${id}`, { method: 'PUT', body: { preferredDate } });
    setSaving(false);
    if (!res.ok) return setFormError(res.message);
    setRescheduling(null);
    setFormError(null);
    toast('New start time saved.');
    void load();
  }

  const [dot, text] = FEED_TEXT[feed];

  return (
    <Page title="My applications" intro="The shifts you applied for through Ujuzi.">
      <p className="sticky top-14 z-30 -mx-4 mb-4 flex items-center gap-2 border-y border-line bg-canvas px-4 py-2 text-sm text-ink-secondary sm:mx-0 sm:border" aria-live="polite">
        <span aria-hidden="true" className={`inline-block size-2 rounded-full ${dot} ${feed === 'live' ? 'motion-safe:animate-pulse-dot' : ''}`} />
        {text}
      </p>
      <ErrorNote message={error ?? formError} />
      {items === null && !error && <div className="space-y-3"><RowSkeleton /><RowSkeleton /></div>}
      {items?.length === 0 && (
        <EmptyState title="No applications yet" action={<Link href="/" className={buttonClass({ tone: 'primary' })}>Browse courses</Link>}>
          Open a course to see the live jobs it opens up, then apply.
        </EmptyState>
      )}
      <ul className="mt-3 space-y-3">
        {items?.map((app) => {
          const job = getCachedJobContext(app.jobId);
          return (
            <li key={app.applicationId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold">{job ? job.title : 'Casual shift application'}</h2>
                    {job && <p className="text-sm text-ink-secondary">{formatCategory(job.category)} · {job.area}, {job.county} · <span className="tabular font-mono">{formatKESRange(job.minPay, job.maxPay)}</span></p>}
                    <p className="mt-1 text-xs text-ink-muted">Shift ref <span className="font-mono">{shiftRef(app.jobId)}</span></p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
                <p className="mt-2 text-sm">Start <span className="tabular font-mono">{formatLocalDateTime(app.preferredDate)}</span>{app.note ? ` · "${app.note}"` : ''}</p>
                <Progress status={app.status} />
                <p className="mt-3 rounded-sm border border-line bg-subtle px-3 py-2 text-sm" aria-live="polite">{MEANING[app.status]}</p>
                {app.status === 'pending' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button tone="plain" onClick={() => { setRescheduling(app.applicationId); setDate(''); setFormError(null); }}>Reschedule start time</Button>
                    {confirming === app.applicationId ? (
                      <>
                        <Button tone="danger" onClick={() => withdraw(app.applicationId)}>Confirm withdraw</Button>
                        <Button tone="plain" onClick={() => setConfirming(null)}>Keep</Button>
                      </>
                    ) : (
                      <Button tone="danger" onClick={() => setConfirming(app.applicationId)}>Withdraw</Button>
                    )}
                  </div>
                )}
                {rescheduling === app.applicationId && (
                  <form onSubmit={(e) => reschedule(e, app.applicationId)} className="perforation mt-4 flex flex-wrap items-end gap-3 pt-4">
                    <Field label="New start"><input className={`${inputClass} font-mono`} type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                    <Button type="submit" loading={saving}>Save</Button>
                    <Button tone="plain" onClick={() => setRescheduling(null)}>Cancel</Button>
                  </form>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
