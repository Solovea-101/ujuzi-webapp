'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState } from '@/components/EmptyState';
import { JobCardSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { TradeIcon } from '@/components/TradeIcon';
import { Button, Card, ErrorNote, Field, inputClass, Page, StatusBadge, Stat } from '@/components/ui';
import { api, localInputToUtc, type Schemas } from '@/lib/clientApi';
import {
  cacheJobContext, formatCategory, formatCertLevel, formatCertLevelShort, formatKES, formatKESRange, formatLocalDateTime, formatWeeks, shiftRef,
} from '@/lib/formatters';
import { useAuth } from '@/lib/useAuth';

type Course = Schemas['Course'];
type JobMatch = Schemas['JobMatch'];
type Enrolment = Schemas['Enrolment'];

/** Tomorrow at 8:00 in the browser's clock, in the shape a datetime-local box wants. */
function tomorrowMorning(): string {
  const date = new Date(Date.now() + 86_400_000);
  date.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [jobs, setJobs] = useState<JobMatch[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  // When the job list is a saved copy because Kazi Connect is not answering: the time it was read.
  const [jobsSavedAt, setJobsSavedAt] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadJobs = useCallback(async () => {
    setJobs(null);
    setJobsError(null);
    setJobsSavedAt(null);
    const res = await api<JobMatch[]>(`/api/courses/${courseId}/job-matches`);
    if (res.ok) {
      setJobs(res.data);
      setJobsSavedAt(res.savedAt ?? null);
      res.data.forEach(cacheJobContext); // so My applications can name the job later
    } else setJobsError(res.message);
  }, [courseId]);

  const loadEnrolment = useCallback(async () => {
    const res = await api<Enrolment[]>('/api/me/enrolments');
    if (res.ok) setEnrolment(res.data.find((item) => item.courseId === courseId) ?? null);
  }, [courseId]);

  useEffect(() => {
    if (!user) return;
    api<Course>(`/api/courses/${courseId}`).then((res) => (res.ok ? setCourse(res.data) : setError(res.message)));
    void loadJobs();
    if (user.role === 'graduate') void loadEnrolment();
  }, [user, courseId, loadJobs, loadEnrolment]);

  async function enrol() {
    setError(null);
    setEnrolling(true);
    const res = await api<Enrolment>('/api/enrolments', { method: 'POST', body: { courseId } });
    setEnrolling(false);
    if (res.ok) {
      setEnrolment(res.data);
      toast('You are enrolled.');
    } else if (res.status === 409) {
      await loadEnrolment();
    } else setError(res.message);
  }

  async function apply(event: FormEvent, job: JobMatch) {
    event.preventDefault();
    setApplyError(null);
    const preferredDate = localInputToUtc(date);
    if (!preferredDate) return setApplyError('Choose the date and time you can start.');
    setSending(true);
    const res = await api<Schemas['Application']>('/api/me/applications', {
      method: 'POST', body: { jobId: job.jobId, preferredDate, ...(note.trim() ? { note: note.trim() } : {}) },
    });
    setSending(false);
    if (!res.ok) return setApplyError(res.message);
    cacheJobContext(job);
    toast('Application sent. Follow it on My applications.');
    router.push('/my-applications');
  }

  if (!user) return <Page title="Course"><div className="space-y-3"><JobCardSkeleton /><p role="status" className="sr-only">Loading</p></div></Page>;
  if (error && !course) return <Page title="Course"><ErrorNote message={error} /><p className="mt-3"><Link className="font-semibold text-brand underline" href="/">Back to courses</Link></p></Page>;
  if (!course) return <Page title="Course"><div className="space-y-3"><JobCardSkeleton /><JobCardSkeleton /><p role="status" className="sr-only">Loading</p></div></Page>;

  return (
    <Page title={course.title}>
      <p className="-mt-3 mb-4 text-sm"><Link className="font-semibold text-brand underline" href="/">← Back to courses</Link></p>
      <Card variant="ticket">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-strong bg-subtle px-4 py-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><TradeIcon category={course.category} />{formatCategory(course.category)}</p>
          <span className="rounded-xs border border-line-strong bg-brass px-2 py-0.5 text-xs font-bold text-on-brass">{formatCertLevel(course.certificateLevel)}</span>
        </div>
        <div className="p-4">
          <p className="font-semibold">{course.centre.name}</p>
          <p className="text-sm text-ink-secondary">{course.area}, {course.county}</p>
        </div>
        <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4 [&>div]:bg-surface">
          <Stat label="Fee"><span className="tabular font-mono font-bold">{formatKES(course.feeKes)}</span></Stat>
          <Stat label="Length"><span className="tabular font-mono font-bold">{formatWeeks(course.durationWeeks)}</span></Stat>
          <Stat label="Next start"><span className="tabular font-mono text-[13px]">{formatLocalDateTime(course.nextStart)}</span></Stat>
          <Stat label="Certificate">{formatCertLevelShort(course.certificateLevel)}</Stat>
        </dl>
        {user.role === 'graduate' && (
          <div className="space-y-3 p-4">
            {enrolment ? (
              <div className="rounded-sm border border-ok-border bg-ok-bg p-3 text-ok-text">
                <p className="font-bold">✓ You are enrolled in this course</p>
                <p className="mt-1 text-sm">Enrolment number <span className="tabular font-mono font-bold">{enrolment.id}</span>. Show it to your centre staff when you finish.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={enrolment.id} label="Copy number" done="Enrolment number copied" />
                  <Link className="inline-flex min-h-9 items-center rounded-sm border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-subtle" href="/my-courses">Go to My courses</Link>
                </div>
              </div>
            ) : (
              <Button size="lg" onClick={enrol} loading={enrolling}>Enrol in this course</Button>
            )}
            <ErrorNote message={error} />
          </div>
        )}
      </Card>

      <section className="mt-10" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="font-display text-xl font-bold">Live casual jobs this skill opens up</h2>
        <p className="mt-1 text-sm text-ink-secondary">Read live from Kazi Connect in {course.county}, so they can be a few minutes old.</p>
        <div className="mt-4 space-y-3">
          <ErrorNote message={jobsError} />
          {jobsError && <Button tone="plain" onClick={loadJobs}>Try again</Button>}
          {jobsSavedAt && (
            <div role="status" className="rounded-sm border-2 border-line-strong bg-subtle px-3 py-2 text-sm">
              <p><strong>Showing saved jobs from {formatLocalDateTime(jobsSavedAt)}.</strong> Kazi Connect is not responding, so these may have changed.</p>
              <p className="mt-2"><Button tone="plain" onClick={loadJobs}>Check again</Button></p>
            </div>
          )}
          {jobs === null && !jobsError && <><JobCardSkeleton /><JobCardSkeleton /></>}
          {jobs?.length === 0 && (
            <EmptyState title="No live jobs for this skill here right now">Jobs come and go during the day. Check back soon, or look at another county&apos;s courses.</EmptyState>
          )}
          {jobs?.map((job) => (
            <Card key={job.jobId} variant="default">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold">
                    {job.title} {job.urgent && <StatusBadge status="urgent" />}
                  </h3>
                  <p className="text-sm text-ink-secondary">{job.area}, {job.county} · {job.duration}</p>
                  <p className="tabular mt-1 font-mono text-sm font-bold">{formatKESRange(job.payRange.minKes, job.payRange.maxKes)}</p>
                  <p className="mt-1 text-xs text-ink-muted">Ref <span className="font-mono">{shiftRef(job.jobId)}</span></p>
                </div>
                {user.role === 'graduate' && applying !== job.jobId && (
                  <Button tone="action" onClick={() => { setApplying(job.jobId); setApplyError(null); setDate(tomorrowMorning()); setNote(''); }}>Apply for shift</Button>
                )}
              </div>
              {applying === job.jobId && (
                <form onSubmit={(event) => apply(event, job)} className="perforation mt-4 grid gap-3 pt-4 sm:grid-cols-2">
                  <Field label="When can you start?"><input className={`${inputClass} font-mono`} type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                  <Field label="A note for the employer (optional)"><input className={inputClass} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: I have my own tools" /></Field>
                  <div className="space-y-2 sm:col-span-2">
                    <ErrorNote message={applyError} />
                    <div className="flex flex-wrap gap-2"><Button type="submit" tone="action" loading={sending}>Send application</Button><Button tone="plain" onClick={() => setApplying(null)}>Cancel</Button></div>
                  </div>
                </form>
              )}
            </Card>
          ))}
        </div>
      </section>
    </Page>
  );
}
