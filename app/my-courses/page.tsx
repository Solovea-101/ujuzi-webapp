'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, ErrorNote, Page, StatusBadge } from '@/components/ui';
import { api, formatWhen, type Schemas } from '@/lib/clientApi';
import { useAuth } from '@/lib/useAuth';

type Enrolment = Schemas['Enrolment'];

export default function MyCoursesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Enrolment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/login');
    if (user.role !== 'graduate') return router.replace('/staff');
    api<Enrolment[]>('/api/me/enrolments').then((res) => (res.ok ? setItems(res.data) : setError(res.message)));
  }, [user, loading, router]);

  return (
    <Page title="My courses" intro="The courses you are enrolled in, and the certificates you have earned.">
      <ErrorNote message={error} />
      {items === null && !error && <p className="text-ink/60">Loading…</p>}
      {items?.length === 0 && <p className="text-ink/70">You have not enrolled yet. <Link className="underline" href="/">Browse courses</Link>.</p>}
      <ul className="space-y-3">
        {items?.map((item) => (
          <li key={item.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link className="text-lg font-semibold text-brand-700 underline" href={`/courses/${item.courseId}`}>{item.courseTitle}</Link>
                  <p className="text-sm text-ink/70">Enrolled {formatWhen(item.enrolledAt)}</p>
                </div>
                {item.certificateNo ? <p className="text-sm"><StatusBadge status="accepted" /> Certificate <strong>{item.certificateNo}</strong></p> : <p className="text-sm text-ink/60">Certificate not issued yet</p>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Page>
  );
}
