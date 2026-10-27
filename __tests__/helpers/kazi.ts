import { clearKaziCache } from '@/lib/clients/fetcher';
import { startKaziStub, type KaziStub, type StubJob } from './kaziStub';

const KEYS = ['KAZI_API_URL', 'KAZI_WS_URL', 'KAZI_USER_TIMEOUT_MS', 'KAZI_BACKGROUND_TIMEOUT_MS', 'KAZI_CACHE_MS', 'KAZI_POLL_MS', 'KAZI_BACKOFF_BASE_MS', 'KAZI_BACKOFF_MAX_MS'] as const;

/** Points Ujuzi at a fresh stub Kazi with fast timers, and gives the environment back afterwards. */
export function useKaziStub(jobs?: StubJob[]) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const handle = { stub: undefined as unknown as KaziStub };

  beforeAll(async () => {
    handle.stub = await startKaziStub(jobs);
  });
  afterAll(async () => {
    await handle.stub.close();
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  beforeEach(async () => {
    // A stub that a test took down comes back, with nothing left over from the last test.
    await handle.stub.up().catch(() => undefined);
    handle.stub.reset(jobs);
    clearKaziCache();
    process.env.KAZI_API_URL = handle.stub.url;
    process.env.KAZI_WS_URL = handle.stub.wsUrl;
    process.env.KAZI_USER_TIMEOUT_MS = '1500';
    process.env.KAZI_BACKGROUND_TIMEOUT_MS = '1500';
    delete process.env.KAZI_CACHE_MS;
    process.env.KAZI_POLL_MS = '60000';
    process.env.KAZI_BACKOFF_BASE_MS = '30';
    process.env.KAZI_BACKOFF_MAX_MS = '120';
  });
  return handle;
}

/** Waits until the check passes, polling every 20 ms, or fails with the last error. */
export async function eventually(check: () => void | Promise<void>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await check();
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}
