import { WebSocket } from 'ws';
import { feedClientCount } from '@/lib/realtime/graduateFeed';
import { recordStatus } from '@/lib/realtime/applicationStatus';
import { getSubscriber } from '@/lib/realtime/kaziSubscriber';
import { getStore, resetStore } from '@/lib/db';
import { loggedInAs, login, SEEDED } from './helpers/auth';
import { eventually, useKaziStub } from './helpers/kazi';
import { startServer, type TestServer } from './helpers/server';
import { inDays, ISO_SECONDS } from './helpers/shapes';

const kazi = useKaziStub();
let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

const subscriber = () => getSubscriber();
const sockets: WebSocket[] = [];
beforeEach(() => {
  subscriber().stopAll();
  resetStore();
});
afterEach(() => {
  for (const ws of sockets.splice(0)) ws.terminate();
});

interface Feed {
  ws: WebSocket;
  events: Array<Record<string, unknown>>;
  closed: Promise<{ code: number; reason: string }>;
}

/** Connects to Ujuzi's feed, authenticates as the graduate, and resolves once the server says ready. */
async function openFeed(email: string): Promise<Feed> {
  const token = await login(app, email);
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/api/me/applications/feed`);
  sockets.push(ws);
  const events: Array<Record<string, unknown>> = [];
  const closed = new Promise<{ code: number; reason: string }>((resolve) => ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('error', reject);
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type === 'ready') resolve();
      else events.push(message);
    });
  });
  return { ws, events, closed };
}

async function apply(email: string, jobId = 'job_12345'): Promise<string> {
  const res = await (await loggedInAs(app, email)).post('/api/me/applications').send({ jobId, preferredDate: inDays(30) });
  expect(res.status).toBe(201);
  return res.body.applicationId;
}
const rowStatus = async (id: string) => (await (await getStore()).getKaziApplication(id))?.status;
const connected = (id: string) => () => expect(subscriber().state(id)).toBe('connected');

describe('the feed socket', () => {
  it('says ready after a graduate authenticates with the first message', async () => {
    const feed = await openFeed(SEEDED.achieng);
    expect(feedClientCount('grd_0101')).toBe(1);
    feed.ws.close();
    await feed.closed;
    await eventually(() => expect(feedClientCount('grd_0101')).toBe(0));
  });

  it.each([
    ['a token that was never issued', { type: 'auth', token: 'ab'.repeat(32) }],
    ['no token', { type: 'auth' }],
    ['the wrong message type', { type: 'hello', token: 'x' }],
    ['a token that is not text', { type: 'auth', token: 5 }],
  ])('closes with 4401 for %s', async (_name, message) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/api/me/applications/feed`);
    sockets.push(ws);
    const code = await new Promise<number>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify(message)));
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4401);
  });

  it('closes with 4401 for a first message that is not JSON, and for a staff token', async () => {
    const junk = new WebSocket(`ws://127.0.0.1:${app.port}/api/me/applications/feed`);
    sockets.push(junk);
    expect(await new Promise<number>((resolve) => { junk.on('open', () => junk.send('hello')); junk.on('close', (c) => resolve(c)); })).toBe(4401);

    const token = await login(app, SEEDED.westlands);
    const staff = new WebSocket(`ws://127.0.0.1:${app.port}/api/me/applications/feed`);
    sockets.push(staff);
    expect(await new Promise<number>((resolve) => { staff.on('open', () => staff.send(JSON.stringify({ type: 'auth', token }))); staff.on('close', (c) => resolve(c)); })).toBe(4401);
  });

  it('closes with 4401 when no first message comes within 5 seconds', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/api/me/applications/feed`);
    sockets.push(ws);
    const started = Date.now();
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
  }, 15_000);

  it('closes a socket that sends a first message over 4 KB', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/api/me/applications/feed`);
    sockets.push(ws);
    const code = await new Promise<number>((resolve) => { ws.on('open', () => ws.send('x'.repeat(10_000))); ws.on('close', (c) => resolve(c)); });
    expect(code).toBe(1009); // message too big
  });
});

describe('following an application live', () => {
  it('pushes accepted to the graduate, saves it, and stops following', async () => {
    const feed = await openFeed(SEEDED.achieng);
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    kazi.stub.accept(id);
    await eventually(() => expect(feed.events).toHaveLength(1));
    expect(feed.events[0]).toEqual({ applicationId: id, status: 'accepted', updatedAt: expect.stringMatching(ISO_SECONDS) });
    expect(await rowStatus(id)).toBe('accepted');
    await eventually(() => expect(subscriber().state(id)).toBeUndefined());
    expect(kazi.stub.subscriberCount(id)).toBe(0);
  });

  it('shows the new status in the graduate\'s list', async () => {
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    kazi.stub.accept(id);
    await eventually(async () => {
      const list = await (await loggedInAs(app, SEEDED.achieng)).get('/api/me/applications');
      expect(list.body[0].status).toBe('accepted');
    });
  });

  it('tells the graduate who lost the job that it is filled, and nobody else', async () => {
    const winner = await openFeed(SEEDED.achieng);
    const loser = await openFeed(SEEDED.brian);
    const bystander = await openFeed(SEEDED.mwanaisha);
    const a = await apply(SEEDED.achieng);
    const b = await apply(SEEDED.brian);
    await eventually(connected(a));
    await eventually(connected(b));
    kazi.stub.accept(a);
    await eventually(() => expect(winner.events.map((e) => e.status)).toEqual(['accepted']));
    await eventually(() => expect(loser.events.map((e) => e.status)).toEqual(['filled']));
    expect(loser.events[0].applicationId).toBe(b);
    expect(winner.events[0].applicationId).toBe(a);
    expect(bystander.events).toEqual([]); // not their application
    expect(await rowStatus(b)).toBe('filled');
  });

  it('delivers an event to every open page of the same graduate', async () => {
    const phone = await openFeed(SEEDED.achieng);
    const laptop = await openFeed(SEEDED.achieng);
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    kazi.stub.accept(id);
    await eventually(() => expect([phone.events.length, laptop.events.length]).toEqual([1, 1]));
  });

  it('sends one cancelled event when the graduate withdraws, not two', async () => {
    const feed = await openFeed(SEEDED.achieng);
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    expect((await (await loggedInAs(app, SEEDED.achieng)).delete(`/api/me/applications/${id}`)).status).toBe(204);
    await eventually(() => expect(feed.events).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 150)); // time for Kazi's own cancelled message, if it came
    expect(feed.events).toEqual([{ applicationId: id, status: 'cancelled', updatedAt: expect.any(String) }]);
    expect(subscriber().state(id)).toBeUndefined();
  });

  it('records a cancellation Kazi announces on its own socket', async () => {
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    await fetch(`${kazi.stub.url}/api/applications/${id}`, { method: 'DELETE' }); // withdrawn at Kazi, not through Ujuzi
    await eventually(async () => expect(await rowStatus(id)).toBe('cancelled'));
    expect(subscriber().state(id)).toBeUndefined();
  });

  it('follows each application once, however often it is asked', async () => {
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    const row = (await (await getStore()).getKaziApplication(id))!;
    subscriber().watch(row);
    subscriber().watch(row);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(kazi.stub.subscriberCount(id)).toBe(1);
    expect(subscriber().size).toBe(1);
  });
});

describe('a status never goes backwards', () => {
  it('ignores a later status once an application is decided', async () => {
    const id = await apply(SEEDED.achieng);
    subscriber().stopAll();
    const store = await getStore();
    expect(await recordStatus(store, id, 'accepted')).toBe(true);
    expect(await recordStatus(store, id, 'pending')).toBe(false);
    expect(await recordStatus(store, id, 'filled')).toBe(false);
    expect(await recordStatus(store, id, 'accepted')).toBe(false);
    expect(await rowStatus(id)).toBe('accepted');
    expect(await recordStatus(store, 'app_9999', 'accepted')).toBe(false); // one we never saved
  });
});

describe('when the connection to Kazi breaks', () => {
  it('reconnects after the socket drops, and still hears the next change', async () => {
    const feed = await openFeed(SEEDED.achieng);
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    kazi.stub.dropSockets();
    await eventually(() => expect(subscriber().state(id)).toBe('reconnecting'));
    await eventually(connected(id));
    expect(kazi.stub.subscriberCount(id)).toBe(1);
    kazi.stub.accept(id);
    await eventually(() => expect(feed.events).toHaveLength(1));
  });

  it('keeps retrying while Kazi is down, never crashes, and recovers when it is back', async () => {
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    await kazi.stub.down();
    await eventually(() => expect(subscriber().state(id)).toBe('reconnecting'));
    await new Promise((resolve) => setTimeout(resolve, 400)); // several failed attempts
    expect(subscriber().state(id)).toBe('reconnecting');
    expect(subscriber().size).toBe(1);
    await kazi.stub.up();
    await eventually(connected(id));
  });

  it('learns a change that happened while it could not hear, from the status Kazi sends on reconnect', async () => {
    const feed = await openFeed(SEEDED.achieng);
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    await kazi.stub.down();
    kazi.stub.applications.get(id)!.status = 'accepted'; // decided while Ujuzi was cut off
    await kazi.stub.up();
    await eventually(async () => expect(await rowStatus(id)).toBe('accepted'));
    await eventually(() => expect(feed.events).toHaveLength(1));
  });

  it('asks Kazi over HTTP every poll interval, in case the socket is silent', async () => {
    process.env.KAZI_WS_URL = 'ws://127.0.0.1:9'; // the socket can never connect
    process.env.KAZI_POLL_MS = '120';
    const id = await apply(SEEDED.achieng);
    kazi.stub.applications.get(id)!.status = 'accepted'; // no broadcast: only a poll can find out
    await eventually(async () => expect(await rowStatus(id)).toBe('accepted'));
    expect(kazi.stub.count(`GET /api/applications/${id}/status`)).toBeGreaterThanOrEqual(1);
    expect(subscriber().state(id)).toBeUndefined();
  });

  it('treats a 404 from the poll as withdrawn at Kazi', async () => {
    process.env.KAZI_WS_URL = 'ws://127.0.0.1:9';
    process.env.KAZI_POLL_MS = '120';
    const id = await apply(SEEDED.achieng);
    kazi.stub.applications.delete(id);
    await eventually(async () => expect(await rowStatus(id)).toBe('cancelled'));
  });

  it('asks by HTTP when Kazi refuses the socket for an application it does not know', async () => {
    const store = await getStore();
    const row = await store.createKaziApplication({
      application_id: 'app_4040', graduate_id: 'grd_0101', job_id: 'job_12345', preferred_date: new Date(Date.now() + 86_400_000), note: '', status: 'pending',
    });
    subscriber().watch(row);
    await eventually(async () => expect(await rowStatus('app_4040')).toBe('cancelled'));
  });

  it('survives Kazi being unreachable for the poll too: it just tries again later', async () => {
    process.env.KAZI_WS_URL = 'ws://127.0.0.1:9';
    process.env.KAZI_POLL_MS = '100';
    const id = await apply(SEEDED.achieng);
    await kazi.stub.down();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(subscriber().state(id)).toBe('reconnecting');
    await kazi.stub.up();
    kazi.stub.applications.get(id)!.status = 'filled';
    await eventually(async () => expect(await rowStatus(id)).toBe('filled'));
  });
});

describe('after a restart', () => {
  it('resumes following every pending application, and none that were decided', async () => {
    const [a, b, c] = [await apply(SEEDED.achieng), await apply(SEEDED.brian), await apply(SEEDED.mwanaisha, 'job_12346')];
    subscriber().stopAll(); // the old process is gone
    const store = await getStore();
    await store.updateKaziApplication(c, { status: 'accepted' });
    expect(subscriber().size).toBe(0);

    expect(await subscriber().resume()).toBe(2);
    await eventually(connected(a));
    await eventually(connected(b));
    expect(subscriber().state(c)).toBeUndefined();
    expect(kazi.stub.subscriberCount(c)).toBe(0);
  });

  it('stopAll closes every socket and clears every timer', async () => {
    const id = await apply(SEEDED.achieng);
    await eventually(connected(id));
    subscriber().stopAll();
    expect(subscriber().size).toBe(0);
    await eventually(() => expect(kazi.stub.subscriberCount(id)).toBe(0));
  });
});
