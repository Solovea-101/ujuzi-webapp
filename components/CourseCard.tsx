import Link from 'next/link';
import { formatCategory, formatCertLevelShort, formatKES, formatLocalDate, formatWeeks } from '@/lib/formatters';
import type { Schemas } from '@/lib/clientApi';
import { TradeIcon } from './TradeIcon';
import { Card } from './ui';

/** One course as a ticket: the trade, the title, where, and a ledger of the three numbers people compare. */
export function CourseCard({ course }: { course: Schemas['Course'] }) {
  return (
    <Link href={`/courses/${course.id}`} className="block h-full" aria-label={`${course.title}, ${course.centre.name}`}>
      <Card variant="interactive" className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><TradeIcon category={course.category} />{formatCategory(course.category)}</p>
          <span className="shrink-0 whitespace-nowrap rounded-xs border border-line-strong bg-brass px-1.5 py-0.5 text-xs font-bold text-on-brass">{formatCertLevelShort(course.certificateLevel)}</span>
        </div>
        <h2 className="mt-2 font-display text-lg font-bold leading-snug text-ink">{course.title}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{course.centre.name} · {course.area}, {course.county}</p>
        <dl className="perforation mt-auto grid grid-cols-3 pt-3 text-sm">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Fee</dt><dd className="tabular font-mono font-bold">{formatKES(course.feeKes)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Length</dt><dd className="tabular font-mono font-bold">{formatWeeks(course.durationWeeks)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Starts</dt><dd className="tabular font-mono font-bold">{formatLocalDate(course.nextStart)}</dd></div>
        </dl>
      </Card>
    </Link>
  );
}
