'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, Field, inputClass, Notice, Page, StatusBadge } from '@/components/ui';
import { api, formatWhen, localInputToUtc, type Schemas } from '@/lib/clientApi';
import { CATEGORIES, CERTIFICATE_LEVELS } from '@/lib/db/types';
import { useAuth } from '@/lib/useAuth';

type Booking = Schemas['Booking'];

export default function StaffPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
  }, [user, loading, router, load]);

  async function decide(id: string, status: 'confirmed' | 'declined') {
    setError(null);
    const res = await api(`/api/bookings/${id}`, { method: 'PATCH', body: { status } });
    if (!res.ok) setError(res.message);
    else setMessage(`Booking ${id} ${status}.`);
    void load();
  }

  return (
    <Page title="Centre staff" intro="Decide group training bookings, add courses, and issue certificates for your own centre.">
      {message && <div className="mb-3"><Notice>{message}</Notice></div>}
      <ErrorNote message={error} />

      <h2 className="mt-4 text-xl font-semibold text-brand-700">Bookings for your centre</h2>
      {bookings === null && !error && <p className="mt-2 text-ink/60">Loading…</p>}
      {bookings?.length === 0 && <p className="mt-2 text-ink/70">No bookings yet.</p>}
      <ul className="mt-3 space-y-3">
        {bookings?.map((b) => (
          <li key={b.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{b.eventName} <StatusBadge status={b.status} /></p>
                  <p className="text-sm text-ink/70">Course {b.courseId} · crew of {b.crewSize} · wanted {formatWhen(b.preferredStart)}</p>
                </div>
                {b.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button onClick={() => decide(b.id, 'confirmed')}>Confirm</Button>
                    <Button tone="danger" onClick={() => decide(b.id, 'declined')}>Decline</Button>
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <NewCourse onDone={(text) => { setMessage(text); setError(null); }} onError={setError} />
        <IssueCertificate onDone={(text) => { setMessage(text); setError(null); }} onError={setError} />
      </div>
    </Page>
  );
}

function NewCourse({ onDone, onError }: { onDone: (text: string) => void; onError: (text: string) => void }) {
  const [form, setForm] = useState({ title: '', category: 'catering', durationWeeks: '2', feeKes: '3500', nextStart: '', certificateLevel: 'short-course' });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextStart = localInputToUtc(form.nextStart);
    if (!nextStart) return onError('Choose when the next intake starts.');
    const res = await api<Schemas['Course']>('/api/courses', {
      method: 'POST',
      body: { title: form.title, category: form.category, durationWeeks: Number(form.durationWeeks), feeKes: Number(form.feeKes), nextStart, certificateLevel: form.certificateLevel },
    });
    if (res.ok) onDone(`Course ${res.data.id} "${res.data.title}" added to your centre.`);
    else onError(res.message);
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-brand-700">Add a course</h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <Field label="Title"><input className={inputClass} required maxLength={120} value={form.title} onChange={set('title')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select className={inputClass} value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Certificate level"><select className={inputClass} value={form.certificateLevel} onChange={set('certificateLevel')}>{CERTIFICATE_LEVELS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Weeks"><input className={inputClass} type="number" min={1} max={104} required value={form.durationWeeks} onChange={set('durationWeeks')} /></Field>
          <Field label="Fee (KES)"><input className={inputClass} type="number" min={0} max={1000000} required value={form.feeKes} onChange={set('feeKes')} /></Field>
        </div>
        <Field label="Next intake starts"><input className={inputClass} type="datetime-local" required value={form.nextStart} onChange={set('nextStart')} /></Field>
        <Button type="submit">Add course</Button>
      </form>
    </Card>
  );
}

function IssueCertificate({ onDone, onError }: { onDone: (text: string) => void; onError: (text: string) => void }) {
  const [enrolmentId, setEnrolmentId] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const res = await api<Schemas['CertificateCheck']>('/api/certificates', { method: 'POST', body: { enrolmentId: enrolmentId.trim() } });
    if (res.ok) onDone(`Certificate ${res.data.certificateNo} issued to ${res.data.holder} for "${res.data.courseTitle}".`);
    else onError(res.message);
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-brand-700">Issue a certificate</h2>
      <p className="mt-1 text-sm text-ink/70">For a graduate who finished one of your centre's courses. Ask them for the enrolment number shown with their enrolment.</p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <Field label="Enrolment number" hint="For example enr_0003"><input className={inputClass} required value={enrolmentId} onChange={(e) => setEnrolmentId(e.target.value)} /></Field>
        <Button type="submit">Issue certificate</Button>
      </form>
    </Card>
  );
}
