'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, ErrorNote, Field, inputClass, Page } from '@/components/ui';
import { api, formatWhen, kes, type Schemas } from '@/lib/clientApi';
import { CATEGORIES } from '@/lib/db/types';
import { useAuth } from '@/lib/useAuth';
import { KENYA_COUNTIES } from '@/lib/validation';

type Course = Schemas['Course'];

export default function HomePage() {
  const { user, loading } = useAuth();
  const [category, setCategory] = useState('');
  const [county, setCounty] = useState('');
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const query = new URLSearchParams();
    if (category) query.set('category', category);
    if (county) query.set('county', county);
    setCourses(null);
    api<Course[]>(`/api/courses${query.size ? `?${query}` : ''}`).then((res) => {
      if (res.ok) setCourses(res.data);
      else setError(res.message);
    });
  }, [user, category, county]);

  if (loading) return <Page title="Ujuzi"><p className="text-ink/60">Loading…</p></Page>;

  if (!user) {
    return (
      <Page title="Skills that lead to work" intro="Short courses at training centres across Kenya, certificates employers can check, and live casual jobs that match your skill.">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Train', 'Catering, housekeeping, electrical, plumbing, security and more, at centres near you.'],
            ['Certify', 'Finish a course and your centre issues a certificate with a number anyone can verify.'],
            ['Work', 'See live jobs that match your course, apply in one tap, and watch the status change as it happens.'],
          ].map(([title, text]) => (
            <Card key={title}><h2 className="text-lg font-semibold text-brand-700">{title}</h2><p className="mt-1 text-sm text-ink/80">{text}</p></Card>
          ))}
        </div>
        <p className="mt-6 flex flex-wrap gap-3">
          <Link href="/register" className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Create an account</Link>
          <Link href="/login" className="rounded-lg border border-ink/20 bg-white px-5 py-2.5 font-semibold hover:bg-brand-50">Log in</Link>
        </p>
      </Page>
    );
  }

  return (
    <Page title="Courses" intro="Pick a course to see what it costs, when it starts, and which live jobs it opens up.">
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="County">
          <select className={inputClass} value={county} onChange={(e) => setCounty(e.target.value)}>
            <option value="">All counties</option>
            {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <ErrorNote message={error} />
      {courses === null && !error && <p className="text-ink/60">Loading courses…</p>}
      {courses?.length === 0 && <p className="text-ink/70">No courses match. Try another category or county.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {courses?.map((course) => (
          <li key={course.id}>
            <Link href={`/courses/${course.id}`} className="block h-full">
              <Card className="h-full transition hover:border-brand-500">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{course.category}</p>
                <h2 className="mt-1 text-lg font-semibold">{course.title}</h2>
                <p className="mt-1 text-sm text-ink/70">{course.centre.name}, {course.area}, {course.county}</p>
                <p className="mt-3 text-sm">{course.durationWeeks} weeks · {kes(course.feeKes)} · starts {formatWhen(course.nextStart)}</p>
                <p className="mt-1 text-xs text-ink/60">Certificate: {course.certificateLevel}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
