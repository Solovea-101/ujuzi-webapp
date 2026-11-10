import type { components } from '@/types/kazi';
import { cachedOrStale, fetchKazi, KaziRejectedError, KaziUnavailableError, type KaziAnswer, type Remembered } from './fetcher';

/**
 * The only file that knows Kazi Connect's address, paths and field names (typed from types/kazi.d.ts,
 * which is generated from partner-tests/kazi_openapi.yaml). Ujuzi uses endpoints 1, 2, 5, 6, 7, 8 and 9.
 * Endpoints 3 and 4 (one job, one job's status) are not used: the job list carries everything a graduate
 * is shown, including its status, and Kazi itself refuses an application for a job that is gone or closed.
 */
export type KaziJob = components['schemas']['Job'];
export type KaziApplication = components['schemas']['Application'];
export type KaziStatus = components['schemas']['ApplicationStatus']['status'];

export const KAZI_TERMINAL: readonly KaziStatus[] = ['accepted', 'filled', 'cancelled'];

const base = (name: 'KAZI_API_URL' | 'KAZI_WS_URL'): string => {
  const value = process.env[name];
  if (!value) throw new KaziUnavailableError(`${name} is not set`);
  return value.replace(/\/+$/, '');
};

// ---- What comes back is checked, not trusted ------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStatus = (value: unknown): value is KaziStatus =>
  value === 'pending' || value === 'accepted' || value === 'filled' || value === 'cancelled';

function asJob(value: unknown): KaziJob | undefined {
  if (!isObject(value) || !isObject(value.payRange)) return undefined;
  const { id, title, category, county, area, duration, urgent, status, payRange } = value;
  const ok =
    [id, title, category, county, area, duration].every((v) => typeof v === 'string') &&
    typeof urgent === 'boolean' &&
    (status === 'active' || status === 'closed') &&
    typeof payRange.min === 'number' &&
    typeof payRange.max === 'number';
  return ok ? (value as unknown as KaziJob) : undefined;
}

function asApplication(value: unknown): KaziApplication {
  if (
    isObject(value) &&
    typeof value.applicationId === 'string' &&
    typeof value.jobId === 'string' &&
    typeof value.studentId === 'string' &&
    typeof value.preferredDate === 'string' &&
    typeof value.note === 'string' &&
    (value.status === 'pending' || value.status === 'accepted' || value.status === 'filled')
  ) {
    return value as unknown as KaziApplication;
  }
  throw new KaziUnavailableError('Kazi Connect answered an application we cannot read');
}

/** A 400, 404 or 409 from a write becomes KaziRejectedError; any other unexpected status is unusable. */
function refuse(answer: KaziAnswer): never {
  const message = isObject(answer.body) && typeof answer.body.message === 'string' ? answer.body.message : undefined;
  if (answer.status === 400 || answer.status === 404 || answer.status === 409) throw new KaziRejectedError(answer.status, message);
  throw new KaziUnavailableError(`Kazi Connect answered ${answer.status}`);
}

// ---- Jobs (endpoints 1 and 2): cached for 5 minutes -----------------------------------------------------

/**
 * Active jobs, optionally narrowed to a county and a category (Kazi matches both ignoring case), with whether
 * they are saved data: when Kazi cannot be reached the last good list is returned, flagged stale and dated.
 */
export async function readActiveJobs(filter: { county?: string; category?: string } = {}): Promise<Remembered<KaziJob[]>> {
  const query = new URLSearchParams({ status: 'active' });
  if (filter.county) query.set('county', filter.county);
  if (filter.category) query.set('category', filter.category);
  const url = `${base('KAZI_API_URL')}/api/jobs?${query}`;

  return cachedOrStale(url, async () => {
    const answer = await fetchKazi(url, { mode: 'user' });
    if (answer.status !== 200 || !Array.isArray(answer.body)) throw new KaziUnavailableError(`Kazi Connect answered ${answer.status} to the job list`);
    return answer.body.map(asJob).filter((job): job is KaziJob => job !== undefined);
  });
}

/** The same list without the freshness: for callers that only need the jobs. */
export async function listActiveJobs(filter: { county?: string; category?: string } = {}): Promise<KaziJob[]> {
  return (await readActiveJobs(filter)).value;
}

// ---- Applications (endpoints 5, 7, 8, 9) ----------------------------------------------------------------

/** Endpoint 7. studentId is Ujuzi's own graduate id (grd_0101): fictional seed people only, never real data. */
export async function createApplication(input: {
  jobId: string;
  studentId: string;
  preferredDate: string;
  note?: string;
}): Promise<KaziApplication> {
  const answer = await fetchKazi(`${base('KAZI_API_URL')}/api/applications`, { method: 'POST', body: input, mode: 'user' });
  if (answer.status !== 201) refuse(answer);
  return asApplication(answer.body);
}

/** Endpoint 8: sets an absolute state; leaving note out clears it. */
export async function updateApplication(
  applicationId: string,
  change: { preferredDate: string; note?: string },
): Promise<KaziApplication> {
  const answer = await fetchKazi(`${base('KAZI_API_URL')}/api/applications/${encodeURIComponent(applicationId)}`, {
    method: 'PUT',
    body: change,
    mode: 'user',
  });
  if (answer.status !== 200) refuse(answer);
  return asApplication(answer.body);
}

/** Endpoint 9. Afterwards Kazi answers 404 for the application. */
export async function deleteApplication(applicationId: string): Promise<void> {
  const answer = await fetchKazi(`${base('KAZI_API_URL')}/api/applications/${encodeURIComponent(applicationId)}`, {
    method: 'DELETE',
    mode: 'user',
  });
  if (answer.status !== 204) refuse(answer);
}

/** Endpoint 5, for the background poller. "gone" is Kazi's 404: the application was withdrawn or never existed. */
export async function getApplicationStatus(applicationId: string): Promise<KaziStatus | 'gone'> {
  const answer = await fetchKazi(`${base('KAZI_API_URL')}/api/applications/${encodeURIComponent(applicationId)}/status`, {
    mode: 'background',
  });
  if (answer.status === 404) return 'gone';
  if (answer.status === 200 && isObject(answer.body) && isStatus(answer.body.status)) return answer.body.status;
  throw new KaziUnavailableError(`Kazi Connect answered ${answer.status} to a status check`);
}

/** Endpoint 6: the WebSocket that pushes status changes. */
export function subscribeUrl(applicationId: string): string {
  return `${base('KAZI_WS_URL')}/api/applications/${encodeURIComponent(applicationId)}/subscribe`;
}

/** What Kazi sends over that WebSocket: { applicationId, status }, or undefined for anything else. */
export function parseStatusMessage(raw: string): { applicationId: string; status: KaziStatus } | undefined {
  try {
    const message: unknown = JSON.parse(raw);
    if (isObject(message) && typeof message.applicationId === 'string' && isStatus(message.status)) {
      return { applicationId: message.applicationId, status: message.status };
    }
  } catch {
    // not JSON: ignored
  }
  return undefined;
}
