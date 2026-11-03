// One 20x20 symbol per trade, drawn from straight lines and right angles so they read as stamps. The category
// codes are the shared list from the API; an unknown code gets a plain diamond.
const PATHS: Record<string, string> = {
  catering: 'M3 15h14 M4 15a6 6 0 0 1 12 0 M10 6v3 M8 6h4',
  accommodation: 'M3 4v12 M3 11h14v5 M17 16v-5l-8 0v0 M3 16h14',
  campus: 'M2 8l8-4 8 4 M4 8v7 M8 8v7 M12 8v7 M16 8v7 M2 16h16',
  cleaning: 'M13 2L9 10 M6 10h8l3 7H3z M8 14v3 M12 14v3',
  electrical: 'M11 2L4 11h5l-1 7 7-9h-5z',
  events: 'M3 5h14v12H3z M3 9h14 M7 3v4 M13 3v4',
  plumbing: 'M3 3v4h8v8h6 M11 15v3 M17 12v6',
  security: 'M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z M7 10l2 2 4-4',
  tutoring: 'M10 5C8 4 5 4 3 5v11c2-1 5-1 7 0 2-1 5-1 7 0V5c-2-1-5-1-7 0z M10 5v11',
};
const FALLBACK = 'M10 2l8 8-8 8-8-8z';

export function TradeIcon({ category, size = 20 }: { category: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" data-category={category}>
      <path d={PATHS[category.toLowerCase()] ?? FALLBACK} />
    </svg>
  );
}
