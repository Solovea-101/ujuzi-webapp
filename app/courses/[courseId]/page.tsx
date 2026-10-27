'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, ErrorNote, Field, inputClass, Notice, Page } from '@/components/ui';
import { api, formatWhen, kes, localInputToUtc, type Schemas } from '@/lib/clientApi';
import { useAuth } from '@/lib/useAuth';

type Course = Schemas['Course'];
type JobMatch = Schemas['JobMatch'];

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobMatch[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const loadJobs = useCallback(async () => {
    setJobs(null);
    setJobsError(null);
    const res = await api<JobMatch[]>(`/api/courses/${courseId}/job-matches`);
    if (res.ok) setJobs(res.data);
    else setJobsError(res.message);
  }, [courseId]);

  useEffect(() => {
    if (!user) return;
    api<Course>(`/api/courses/${courseId}`).then((res) => (res.ok ? setCourse(res.data) : setError(res.message)));
    void loadJobs();
  }, [user, courseId, loadJobs]);

  async function enrol() {
    setError(null);
    const res = await api<Schemas['Enrolment']>('/api/enrolments', { method: 'POST', body: { courseId } });
    if (res.ok) setEnrolled('You are enrolled. Your centre will issue your certificate when you finish.');
    else if (res.status === 409) setEnrolled('You are already enrolled in this course.');
    else setError(res.message);
  }

  async function apply(event: FormEvent, jobId: string) {
    event.preventDefault();
    setApplyError(null);
    const preferredDate = localInputToUtc(date);
    if (!preferredDate) return setApplyError('Choose the date and time you can start.');
    const res = await api<Schemas['Application']>('/api/me/applications', { method: 'POST', body: { jobId, preferredDate, ...(note.trim() ? { note: note.trim() } : {}) } });
    if (!res.ok) return setApplyError(res.message);
    router.push('/my-applications');
  }

  if (!user) return <Page title="Course"><p className="text-ink/60">Loading…</p></Page>;
  if (error && !course) return <Page title="Course"><ErrorNote message={error} /><p className="mt-3"><Link className="underline" href="/">Back to courses</Link></p></Page>;
  if (!course) return <Page title="Course"><p className="text-ink/60">Loading…</p></Page>;

  return (
    <Page title={course.title}>
      <p className="text-sm text-ink/70"><Link className="underline" href="/">All courses</Link> · {course.category}</p>
      <Card className="mt-4">
        <p>{course.centre.name}, {course.area}, {course.county}</p>
        <p className="mt-1 text-sm">{course.durationWeeks} weeks · {kes(course.feeKes)} · next start {formatWhen(course.nextStart)} · certificate: {course.certificateLevel}</p>
        {user.role === 'graduate' && (
          <div className="mt-4 space-y-3">
            <Button onClick={enrol}>Enrol in this course</Button>
            {enrolled && <Notice>{enrolled}</Notice>}
          </div>
        )}
        <div className="mt-3"><ErrorNote message={error} /></div>
      </Card>

      <h2 className="mt-8 text-xl font-semibold text-brand-700">Live jobs for this skill in {course.county}</h2>
      <p className="text-sm text-ink/70">Read live from Kazi Connect, so they can be a few minutes old.</p>
      <div className="mt-3 space-y-3">
        <ErrorNote message={jobsError} />
        {jobsError && <Button tone="plain" onClick={loadJobs}>Try again</Button>}
        {jobs === null && !jobsError && <p className="text-ink/60">Looking for jobs…</p>}
        {jobs?.length === 0 && <p className="text-ink/70">No active jobs for this skill here right now.</p>}
        {jobs?.map((job) => (
          <Card key={job.jobId}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{job.title}{job.urgent && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">urgent</span>}</h3>
                <p className="text-sm text-ink/70">{job.area}, {job.county} · {job.duration}</p>
                <p className="mt-1 text-sm font-medium">{kes(job.payRange.minKes)} to {kes(job.payRange.maxKes)}</p>
              </div>
              {user.role === 'graduate' && applying !== job.jobId && <Button onClick={() => { setApplying(job.jobId); setApplyError(null); }}>Apply</Button>}
            </div>
            {applying === job.jobId && (
              <form onSubmit={(e) => apply(e, job.jobId)} className="mt-4 grid gap-3 border-t border-brand-100 pt-4 sm:grid-cols-2">
                <Field label="When can you start?"><input className={inputClass} type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="A note for the employer (optional)"><input className={inputClass} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <div className="sm:col-span-2 space-y-2"><ErrorNote message={applyError} /><div className="flex gap-2"><Button type="submit">Send application</Button><Button tone="plain" onClick={() => setApplying(null)}>Cancel</Button></div></div>
              </form>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
