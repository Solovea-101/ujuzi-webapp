'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState } from '@/components/EmptyState';
import { RowSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { Button, Card, ErrorNote, Field, inputClass, Page, StatusBadge } from '@/components/ui';
import { api, localInputToUtc, type Schemas } from '@/lib/clientApi';
import { CATEGORIES, CERTIFICATE_LEVELS } from '@/lib/db/types';
import { formatCategory, formatCertLevel, formatKES, formatLocalDateTime } from '@/lib/formatters';
import { useAuth } from '@/lib/useAuth';

type Booking = Schemas['Booking'];
type Course = Schemas['Course'];

const TABS = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'certificate', label: 'Certificates' },
  { id: 'course', label: 'New course' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function StaffPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<TabId>('bookings');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<Booking[]>('/api/bookings');
    if (res.ok) setBookings(res.data);
    else setError(res.message);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/login');
    if (user.role !== 'staff') return router.replace('/');
    void load();
    // Bookings only carry a course id, so the course names come from the course list.
    api<Course[]>('/api/courses').then((res) => {
      if (res.ok) setTitles(Object.fromEntries(res.data.map((course) => [course.id, course.title])));
    });
  }, [user, loading, router, load]);

  async function decide(id: string, status: 'confirmed' | 'declined') {
    setError(null);
    setDeciding(id);
    const res = await api(`/api/bookings/${id}`, { method: 'PATCH', body: { status } });
    setDeciding(null);
    if (!res.ok) setError(res.message);
    else toast(`Booking ${status}.`);
    void load();
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    if (event.key === 'ArrowRight') setTab(TABS[(index + 1) % TABS.length].id);
    if (event.key === 'ArrowLeft') setTab(TABS[(index + TABS.length - 1) % TABS.length].id);
  }

  const pending = bookings?.filter((b) => b.status === 'pending').length ?? 0;

  return (
    <Page title="Centre staff" intro="Decide group training bookings, issue certificates, and add courses for your own centre." width="wide">
      <div role="tablist" aria-label="Staff tasks" onKeyDown={onKey} className="mb-5 flex gap-1 overflow-x-auto border-b-2 border-line-strong pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`-mb-0.5 min-h-11 shrink-0 border-2 border-b-0 px-3 text-sm font-bold ${tab === t.id ? 'border-line-strong bg-surface text-ink' : 'border-transparent text-ink-secondary hover:text-ink'}`}
          >
            {t.label}{t.id === 'bookings' && pending > 0 && <span className="ml-1.5 rounded-xs bg-terracotta px-1.5 py-0.5 font-mono text-xs text-on-terracotta">{pending}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-bookings" aria-labelledby="tab-bookings" hidden={tab !== 'bookings'}>
        <ErrorNote message={error} />
        {bookings === null && !error && <div className="space-y-3"><RowSkeleton /><RowSkeleton /></div>}
        {bookings?.length === 0 && <EmptyState title="No bookings yet">When an event organiser books a crew on one of your courses, it appears here for you to confirm or decline.</EmptyState>}
        <ul className="space-y-3">
          {bookings?.map((b) => (
            <li key={b.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold">{b.eventName}</h2>
                    <p className="text-sm text-ink-secondary">{titles[b.courseId] ?? 'Course'} <span className="font-mono text-xs text-ink-muted">({b.courseId})</span></p>
                    <p className="mt-1 text-sm"><span className="tabular font-mono font-bold">{b.crewSize}</span> {b.crewSize === 1 ? 'trainee' : 'trainees'} · wanted <span className="tabular whitespace-nowrap font-mono">{formatLocalDateTime(b.preferredStart)}</span></p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                {b.status === 'pending' && (
                  <div className="perforation mt-3 flex flex-wrap gap-2 pt-3">
                    <Button onClick={() => decide(b.id, 'confirmed')} loading={deciding === b.id} disabled={deciding !== null}>Confirm booking</Button>
                    <Button tone="danger" onClick={() => decide(b.id, 'declined')} disabled={deciding !== null}>Decline</Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <div role="tabpanel" id="panel-certificate" aria-labelledby="tab-certificate" hidden={tab !== 'certificate'}>
        <IssueCertificate onError={setError} />
      </div>
      <div role="tabpanel" id="panel-course" aria-labelledby="tab-course" hidden={tab !== 'course'}>
        <NewCourse onError={setError} />
      </div>
    </Page>
  );
}

function NewCourse({ onError }: { onError: (text: string | null) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', category: 'catering', durationWeeks: '2', feeKes: '3500', nextStart: '', certificateLevel: 'short-course' });
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const fee = Number(form.feeKes);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    onError(null);
    const nextStart = localInputToUtc(form.nextStart);
    if (!nextStart) return setLocalError('Choose when the next intake starts.');
    setBusy(true);
    const res = await api<Course>('/api/courses', {
      method: 'POST',
      body: { title: form.title, category: form.category, durationWeeks: Number(form.durationWeeks), feeKes: fee, nextStart, certificateLevel: form.certificateLevel },
    });
    setBusy(false);
    if (res.ok) {
      toast(`Course "${res.data.title}" added to your centre.`);
      setForm({ ...form, title: '' });
    } else setLocalError(res.message);
  }

  return (
    <Card className="max-w-2xl">
      <h2 className="font-display text-lg font-bold">Add a course</h2>
      <p className="mt-1 text-sm text-ink-secondary">The course is added to your own centre, with your centre&apos;s county and area.</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Course title"><input className={inputClass} required maxLength={120} value={form.title} onChange={set('title')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Trade"><select className={inputClass} value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{formatCategory(c)}</option>)}</select></Field>
          <Field label="Certificate"><select className={inputClass} value={form.certificateLevel} onChange={set('certificateLevel')}>{CERTIFICATE_LEVELS.map((c) => <option key={c} value={c}>{formatCertLevel(c)}</option>)}</select></Field>
          <Field label="Length in weeks"><input className={`${inputClass} font-mono`} type="number" min={1} max={104} required value={form.durationWeeks} onChange={set('durationWeeks')} /></Field>
          <Field label="Fee in KES" hint={Number.isFinite(fee) && form.feeKes !== '' ? `Shown to graduates as ${formatKES(fee)}` : undefined}><input className={`${inputClass} font-mono`} type="number" min={0} max={1000000} required value={form.feeKes} onChange={set('feeKes')} /></Field>
        </div>
        <Field label="Next intake starts"><input className={`${inputClass} font-mono`} type="datetime-local" required value={form.nextStart} onChange={set('nextStart')} /></Field>
        <ErrorNote message={localError} />
        <Button type="submit" size="lg" loading={busy}>Add course</Button>
      </form>
    </Card>
  );
}

function IssueCertificate({ onError }: { onError: (text: string | null) => void }) {
  const toast = useToast();
  const [enrolmentId, setEnrolmentId] = useState('');
  const [issued, setIssued] = useState<Schemas['CertificateCheck'] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    onError(null);
    setBusy(true);
    const res = await api<Schemas['CertificateCheck']>('/api/certificates', { method: 'POST', body: { enrolmentId: enrolmentId.trim() } });
    setBusy(false);
    if (res.ok) {
      setIssued(res.data);
      setEnrolmentId('');
      toast('Certificate issued.');
    } else setLocalError(res.message);
  }

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-display text-lg font-bold">Issue a certificate</h2>
        <p className="mt-1 text-sm text-ink-secondary">For a graduate who finished one of your centre&apos;s courses. Ask them to open <strong>My courses</strong> on their phone and read out or copy their enrolment number.</p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Enrolment number" hint="For example enr_0003"><input className={`${inputClass} font-mono`} required value={enrolmentId} onChange={(e) => setEnrolmentId(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
          <ErrorNote message={localError} />
          <Button type="submit" size="lg" loading={busy}>Issue certificate</Button>
        </form>
      </Card>
      {issued && (
        <Card variant="ticket" className="self-start">
          <div className="border-b-2 border-dashed border-line-strong bg-brass px-4 py-2 text-on-brass"><p className="text-xs font-bold uppercase tracking-wide">✓ Certificate issued</p></div>
          <div className="space-y-1 p-4">
            <p className="tabular font-mono text-xl font-bold">{issued.certificateNo}</p>
            <p className="font-display text-lg font-bold">{issued.courseTitle}</p>
            <p className="text-sm text-ink-secondary">{formatCertLevel(issued.level)} · issued to {issued.holder}</p>
            <div className="pt-2"><CopyButton value={issued.certificateNo} label="Copy certificate number" done="Certificate number copied" /></div>
          </div>
        </Card>
      )}
    </div>
  );
}
