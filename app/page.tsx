'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CourseCard } from '@/components/CourseCard';
import { EmptyState } from '@/components/EmptyState';
import { FilterBar } from '@/components/FilterBar';
import { CourseCardSkeleton } from '@/components/Skeleton';
import { TradeIcon } from '@/components/TradeIcon';
import { buttonClass, Button, ErrorNote, Page } from '@/components/ui';
import { api, type Schemas } from '@/lib/clientApi';
import { formatCategory } from '@/lib/formatters';
import { useAuth } from '@/lib/useAuth';

type Course = Schemas['Course'];

export default function HomePage() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Page title="Ujuzi">
        <div className="grid gap-4 sm:grid-cols-2"><CourseCardSkeleton /><CourseCardSkeleton /></div>
        <p role="status" className="sr-only">Loading</p>
      </Page>
    );
  }
  return user ? <Catalogue name={user.firstName} /> : <Landing />;
}

// ---- Logged out: what Ujuzi is. The course list needs a login, so the proof of value is a labelled example. ----

function Landing() {
  const steps = [
    ['01', 'Train', 'Short practical courses at county TVET centres: catering, housekeeping, electrical, plumbing, security and more.'],
    ['02', 'Certify', 'Finish, and your centre issues a certificate with a number that anyone can check.'],
    ['03', 'Work', 'See live casual jobs that match your skill, apply in one tap, and watch the status change as it happens.'],
  ];
  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <section>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">Learn a certified trade. Book paid casual shifts.</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-secondary">Short practical courses at county TVET centres. Earn a certificate, then apply for live casual jobs posted on Kazi Connect, all in one place.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className={buttonClass({ tone: 'primary', size: 'lg', full: true })}>Create a graduate account</Link>
            <Link href="/login" className={buttonClass({ tone: 'plain', size: 'lg', full: true })}>Log in</Link>
          </div>
          <p className="mt-3 text-sm text-ink-muted">Free for graduates. Centre staff accounts are issued by your TVET centre.</p>
        </section>

        <section aria-labelledby="example-heading" className="bg-blueprint rounded-md border-2 border-line-strong bg-surface p-4">
          <p className="inline-block rounded-xs border border-line-strong bg-brass px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-on-brass">Example pathway</p>
          <h2 id="example-heading" className="mt-2 font-display text-lg font-bold">A course, and the job it opens</h2>
          <p className="text-sm text-ink-secondary">This is a made-up example. Log in to see the real courses and jobs in your county.</p>
          <div className="mt-3 rounded-md border border-line-strong bg-surface p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><TradeIcon category="electrical" />{formatCategory('electrical')}</p>
            <p className="mt-1 font-display text-lg font-bold">Domestic electrical wiring</p>
            <p className="tabular font-mono text-sm font-bold">8 weeks · KES 12,000 · Grade III</p>
          </div>
          <div aria-hidden="true" className="mx-auto h-5 w-0 border-l-2 border-dashed border-line-strong" />
          <div className="rounded-md border border-line-strong bg-surface p-4">
            <p className="font-display text-lg font-bold">Casual electrician</p>
            <p className="text-sm text-ink-secondary">Westlands, Nairobi · 3 days</p>
            <p className="tabular font-mono text-sm font-bold">KES 1,200 – 1,800</p>
          </div>
        </section>
      </div>

      <section aria-labelledby="how-heading" className="mt-12">
        <h2 id="how-heading" className="font-display text-2xl font-bold">How Ujuzi works</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {steps.map(([number, title, text]) => (
            <li key={number} className="rounded-md border border-line-strong bg-surface p-4 shadow-tactile-sm">
              <p className="tabular font-mono text-sm font-bold text-brand">{number}</p>
              <h3 className="font-display text-xl font-bold uppercase">{title}</h3>
              <p className="mt-1 text-sm text-ink-secondary">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

// ---- Logged in: the course catalogue ---------------------------------------------------------------------------------

function Catalogue({ name }: { name: string }) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [county, setCounty] = useState('');

  function load() {
    setError(null);
    setCourses(null);
    api<Course[]>('/api/courses').then((res) => {
      if (res.ok) setCourses(res.data);
      else setError(res.message);
    });
  }
  useEffect(load, []);

  const shown = useMemo(
    () => (courses ?? []).filter((c) => (!category || c.category === category) && (!county || c.county === county)),
    [courses, category, county],
  );
  const counties = new Set((courses ?? []).map((c) => c.county));

  return (
    <Page
      title="Courses"
      intro={courses ? `Habari, ${name}. ${courses.length} ${courses.length === 1 ? 'course' : 'courses'} across ${counties.size} ${counties.size === 1 ? 'county' : 'counties'}. Pick one to see the fee, the start date and the live jobs it opens.` : `Habari, ${name}.`}
      width="wide"
    >
      {courses && <div className="mb-5"><FilterBar courses={courses} category={category} county={county} onCategory={setCategory} onCounty={setCounty} /></div>}
      <ErrorNote message={error} />
      {error && <div className="mt-3"><Button tone="plain" onClick={load}>Try again</Button></div>}
      {courses === null && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><CourseCardSkeleton /><CourseCardSkeleton /><CourseCardSkeleton /><CourseCardSkeleton /></div>
      )}
      {courses && shown.length === 0 && (
        <EmptyState
          title={`No ${category ? formatCategory(category) : ''} courses ${county ? `in ${county} ` : ''}right now`.replace(/\s+/g, ' ')}
          action={<Button onClick={() => { setCategory(''); setCounty(''); }}>Show all {courses.length} courses</Button>}
        >
          Try another trade or county. New intakes are added by the centres.
        </EmptyState>
      )}
      {courses && shown.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-muted" aria-live="polite">Showing {shown.length} of {courses.length}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((course) => <li key={course.id}><CourseCard course={course} /></li>)}
          </ul>
        </>
      )}
    </Page>
  );
}
