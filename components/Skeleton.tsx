const block = 'bg-subtle motion-safe:animate-skeleton';

/** Same height as a real course card, so the page does not jump when the data arrives. */
export function CourseCardSkeleton() {
  return (
    <div aria-hidden="true" className="h-[212px] rounded-md border border-line bg-surface p-4">
      <div className={`h-4 w-1/3 ${block}`} />
      <div className={`mt-3 h-6 w-4/5 ${block}`} />
      <div className={`mt-2 h-4 w-3/5 ${block}`} />
      <div className={`mt-6 h-12 w-full ${block}`} />
    </div>
  );
}

export function JobCardSkeleton() {
  return (
    <div aria-hidden="true" className="h-28 rounded-md border border-line bg-surface p-4">
      <div className={`h-5 w-2/3 ${block}`} />
      <div className={`mt-3 h-4 w-1/2 ${block}`} />
      <div className={`mt-3 h-4 w-1/3 ${block}`} />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div aria-hidden="true" className="h-20 rounded-md border border-line bg-surface p-4">
      <div className={`h-5 w-1/2 ${block}`} />
      <div className={`mt-3 h-4 w-3/4 ${block}`} />
    </div>
  );
}

export function Loading({ children }: { children: string }) {
  return <p role="status" className="sr-only">{children}</p>;
}
