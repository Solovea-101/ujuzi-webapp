'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState } from '@/components/EmptyState';
import { RowSkeleton } from '@/components/Skeleton';
import { buttonClass, Card, ErrorNote, Page } from '@/components/ui';
import { api, type Schemas } from '@/lib/clientApi';
import { formatLocalDate } from '@/lib/formatters';
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
    <Page title="My courses" intro="Your courses and your certificates. When you finish a course, show your enrolment number to your centre staff so they can issue your certificate.">
      <ErrorNote message={error} />
      {items === null && !error && <div className="space-y-4"><RowSkeleton /><RowSkeleton /></div>}
      {items?.length === 0 && (
        <EmptyState
          title="You have not enrolled yet"
          action={<Link href="/" className={buttonClass({ tone: 'primary' })}>Browse courses</Link>}
        >
          Pick a trade course to start earning your certificate.
        </EmptyState>
      )}
      <ul className="space-y-4">
        {items?.map((item) => (
          <li key={item.id}>
            <Card variant="ticket">
              <div className="p-4">
                <Link className="font-display text-lg font-bold text-brand underline" href={`/courses/${item.courseId}`}>{item.courseTitle}</Link>
                <p className="text-sm text-ink-secondary">Enrolled {formatLocalDate(item.enrolledAt)}</p>
              </div>
              <div className="perforation flex flex-wrap items-center justify-between gap-3 bg-subtle px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Enrolment number (show to centre staff)</p>
                  <p className="tabular font-mono text-xl font-bold tracking-wider">{item.id}</p>
                </div>
                <CopyButton value={item.id} label="Copy number" done="Enrolment number copied" />
              </div>
              <div className="perforation p-4">
                {item.certificateNo ? (
                  <div className="rounded-sm border-2 border-line-strong bg-brass p-3 text-on-brass">
                    <p className="text-xs font-bold uppercase tracking-wide">✓ Certificate issued</p>
                    <p className="tabular mt-1 font-mono text-lg font-bold">{item.certificateNo}</p>
                    <div className="mt-2"><CopyButton value={item.certificateNo} label="Copy certificate number" done="Certificate number copied" /></div>
                  </div>
                ) : (
                  <div className="rounded-sm border-2 border-dashed border-warn-border bg-warn-bg p-3 text-warn-text">
                    <p className="font-bold">Certificate not issued yet</p>
                    <p className="mt-0.5 text-sm">When you finish training, share your enrolment number with your centre instructor.</p>
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Page>
  );
}
