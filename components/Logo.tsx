/**
 * The Ujuzi mark: two carpenter's squares that interlock into a U, with an arrow rising through it. Drawn in 2px
 * square-cornered strokes so it stays crisp at 24px on a small screen. No image, no request.
 */
export function Emblem({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d="M4 4v14a6 6 0 0 0 6 6h8a6 6 0 0 0 6-6V4" />
      <path d="M14 20V8" />
      <path d="M9 13l5-5 5 5" />
    </svg>
  );
}

export function Logo({ showTagline = false }: { showTagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-brand">
      <Emblem />
      <span className="font-display text-xl font-bold uppercase tracking-tight text-ink">Ujuzi</span>
      {showTagline && <span className="hidden font-mono text-xs font-bold text-ink-muted lg:inline">TVET • NITA • KAZI</span>}
    </span>
  );
}
