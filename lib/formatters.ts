import type { Schemas } from './clientApi';

// Everything a person reads goes through these, so a raw API code ("catering", "grade-III", "job_12345") never
// reaches the screen. They are plain functions with no browser dependency, except the job cache at the bottom.

/** "KES 3,500". Whole shillings only, as the API sends them. */
export function formatKES(amount: number): string {
  return `KES ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(amount)}`;
}

/** "KES 1,200 – 1,800". */
export function formatKESRange(min: number, max: number): string {
  if (min === max) return formatKES(min);
  return `${formatKES(min)} – ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(max)}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  accommodation: 'Accommodation & Housekeeping',
  campus: 'Campus Services',
  catering: 'Catering & Food Service',
  cleaning: 'Cleaning Services',
  electrical: 'Electrical Installation',
  events: 'Events & Guest Service',
  plumbing: 'Plumbing & Pipefitting',
  security: 'Security & Guarding',
  tutoring: 'Tutoring & Learner Support',
};

/** A short label for the filter chips. */
const CATEGORY_SHORT: Record<string, string> = {
  accommodation: 'Housekeeping',
  campus: 'Campus',
  catering: 'Catering',
  cleaning: 'Cleaning',
  electrical: 'Electrical',
  events: 'Events',
  plumbing: 'Plumbing',
  security: 'Security',
  tutoring: 'Tutoring',
};

const titleCase = (code: string) =>
  code.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function formatCategory(code: string): string {
  return CATEGORY_LABELS[code.toLowerCase()] ?? titleCase(code);
}

export function formatCategoryShort(code: string): string {
  return CATEGORY_SHORT[code.toLowerCase()] ?? titleCase(code);
}

const LEVEL_LABELS: Record<string, string> = {
  'short-course': 'Short Course Certificate',
  'grade-III': 'NITA Trade Test Grade III',
  'grade-II': 'NITA Trade Test Grade II',
  'grade-I': 'NITA Trade Test Grade I',
};

export function formatCertLevel(level: string): string {
  return LEVEL_LABELS[level] ?? titleCase(level);
}

/** "Grade III" for a tight stamp. */
export function formatCertLevelShort(level: string): string {
  if (level === 'short-course') return 'Short course';
  const match = /^grade-(I{1,3})$/.exec(level);
  return match ? `Grade ${match[1]}` : titleCase(level);
}

const EAT = 'Africa/Nairobi';

/**
 * "Mon, 14 Nov • 8:00 AM" in Kenyan time. The year is added when it is not the current one. Fixed to Nairobi so
 * the server render and the browser agree, and so every reader sees the same clock as the centre.
 */
export function formatLocalDateTime(utc: string, now: Date = new Date()): string {
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return utc;
  const parts = new Intl.DateTimeFormat('en-KE', {
    timeZone: EAT, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const thisYear = new Intl.DateTimeFormat('en-KE', { timeZone: EAT, year: 'numeric' }).format(now);
  const year = get('year') === thisYear ? '' : ` ${get('year')}`;
  return `${get('weekday')}, ${get('day')} ${get('month')}${year} • ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** "14 Nov 2026" for a calendar date with no time of day. */
export function formatLocalDate(utc: string): string {
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return utc;
  return new Intl.DateTimeFormat('en-KE', { timeZone: EAT, day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatWeeks(weeks: number): string {
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}

/** "job_12345" → "#12345": the reference people can quote, without the system prefix. */
export function shiftRef(jobId: string): string {
  return `#${jobId.replace(/^job_/, '')}`;
}

/** "00:42" for a countdown. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// ---- What the browser remembers about jobs ------------------------------------------------------------------
// An application only carries a job id. The job's title, place and pay are known when the person looks at the course
// page and applies, so they are kept here (this browser only) to show "Catering Crew, Westlands" later. A new device
// has no cache and shows "Casual shift #12345" instead.

export type JobContext = {
  title: string;
  category: string;
  county: string;
  area: string;
  minPay: number;
  maxPay: number;
};

const JOB_CACHE_KEY = 'ujuzi_job_cache_v1';
const JOB_CACHE_LIMIT = 200;

function readJobCache(): Record<string, JobContext> {
  try {
    const raw = window.localStorage.getItem(JOB_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, JobContext>) : {};
  } catch {
    return {}; // storage blocked or damaged: behave as if nothing is remembered
  }
}

export function cacheJobContext(job: Schemas['JobMatch']): void {
  try {
    const cache = readJobCache();
    cache[job.jobId] = {
      title: job.title, category: job.category, county: job.county, area: job.area, minPay: job.payRange.minKes, maxPay: job.payRange.maxKes,
    };
    const ids = Object.keys(cache);
    for (const id of ids.slice(0, Math.max(0, ids.length - JOB_CACHE_LIMIT))) delete cache[id]; // oldest first
    window.localStorage.setItem(JOB_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignored: the cache is a convenience
  }
}

export function getCachedJobContext(jobId: string): JobContext | undefined {
  const entry = readJobCache()[jobId];
  return entry && typeof entry.title === 'string' ? entry : undefined;
}
