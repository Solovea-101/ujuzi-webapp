import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

/**
 * A tiny local Kazi Connect, written from partner-tests/kazi_openapi.yaml (endpoints 1 to 9) and the
 * quirks Kazi documents: read endpoints 1 to 5 answer 400/404 with an EMPTY body, writes answer
 * { message }, the WebSocket sends the current status on connect, "cancelled" is sent once before the
 * server closes the socket, and a withdrawn application then answers 404. Tests and `npm run verify`
 * use it, so neither ever needs the real Kazi.
 */

export interface StubJob {
  id: string;
  title: string;
  category: string;
  county: string;
  area: string;
  duration: string;
  urgent: boolean;
  status: 'active' | 'closed';
  payRange: { min: number; max: number };
}

export type StubStatus = 'pending' | 'accepted' | 'filled';

export interface StubApplication {
  applicationId: string;
  jobId: string;
  studentId: string;
  preferredDate: string;
  note: string;
  status: StubStatus;
}

export const SAMPLE_JOBS: StubJob[] = [
  { id: 'job_12345', title: 'Event Catering Assistant', category: 'catering', county: 'Nairobi', area: 'Westlands', duration: 'Part time, 3 months', urgent: true, status: 'active', payRange: { min: 15000, max: 22000 } },
  { id: 'job_12346', title: 'Banquet Server', category: 'catering', county: 'Nairobi', area: 'Parklands', duration: 'Weekends', urgent: false, status: 'active', payRange: { min: 9000.5, max: 14000 } },
  { id: 'job_12347', title: 'Pipe Fitter Helper', category: 'plumbing', county: 'Nairobi', area: 'Hurlingham', duration: 'Full time, 2 months', urgent: false, status: 'active', payRange: { min: 18000, max: 26000 } },
  { id: 'job_12348', title: 'Housekeeping Attendant', category: 'accommodation', county: 'Kiambu', area: 'Ruaka', duration: 'Full time, 6 months', urgent: true, status: 'active', payRange: { min: 12000, max: 16000 } },
  { id: 'job_12349', title: 'Closed Catering Gig', category: 'catering', county: 'Nairobi', area: 'Kilimani', duration: 'One day', urgent: false, status: 'closed', payRange: { min: 3000, max: 3000 } },
  // A category outside the shared list: Ujuzi must skip it rather than break its own contract.
  { id: 'job_12350', title: 'Dragon Tamer', category: 'dragons', county: 'Nairobi', area: 'Westlands', duration: 'Forever', urgent: false, status: 'active', payRange: { min: 1, max: 2 } },
];

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const FIELDS = ['jobId', 'studentId', 'preferredDate', 'note'];

export class KaziStub {
  jobs: StubJob[];
  applications = new Map<string, StubApplication>();
  /** Every request received, as "METHOD /path?query", so tests can count calls (for example, cache hits). */
  requests: string[] = [];

  private server: Server;
  private sockets = new Set<Socket>();
  private wss = new WebSocketServer({ noServer: true });
  private subscribers = new Map<string, Set<WebSocket>>();
  private hanging = false;
  private delayMs = 0;
  private nextId = 1005;
  private port = 0;

  constructor(jobs: StubJob[]) {
    this.jobs = jobs.map((job) => ({ ...job, payRange: { ...job.payRange } }));
    this.server = this.makeServer();
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }
  get wsUrl(): string {
    return `ws://127.0.0.1:${this.port}`;
  }

  /** How many sockets are subscribed to this application right now. */
  subscriberCount(applicationId: string): number {
    return [...(this.subscribers.get(applicationId) ?? [])].filter((ws) => ws.readyState === ws.OPEN).length;
  }

  /** Counts the requests received whose "METHOD /path" starts with this prefix. */
  count(prefix: string): number {
    return this.requests.filter((r) => r.startsWith(prefix)).length;
  }

  /** The employer accepts: this application becomes accepted, the other pending ones for the job become filled. */
  accept(applicationId: string): void {
    const accepted = this.applications.get(applicationId);
    if (!accepted) throw new Error(`no application ${applicationId}`);
    for (const app of this.applications.values()) {
      if (app.jobId === accepted.jobId && app.status === 'pending') {
        this.setStatus(app.applicationId, app.applicationId === applicationId ? 'accepted' : 'filled');
      }
    }
  }

  /** Changes a status and tells every subscriber, as Kazi does. */
  setStatus(applicationId: string, status: StubStatus): void {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error(`no application ${applicationId}`);
    app.status = status;
    this.broadcast(applicationId, { applicationId, status });
  }

  /** Closes every subscriber socket abruptly, as a network drop would. */
  dropSockets(): void {
    for (const set of this.subscribers.values()) for (const ws of set) ws.terminate();
  }

  /** Stops answering at all (connection refused), like a Kazi that is down or asleep. */
  async down(): Promise<void> {
    this.dropSockets();
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Starts answering again on the same port. */
  async up(): Promise<void> {
    if (this.server.listening) return;
    this.server = this.makeServer();
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', resolve);
    });
  }

  /** Every HTTP answer waits this long first, like a slow Kazi. */
  slow(ms: number): void {
    this.delayMs = ms;
  }

  /** Back to a pristine Kazi: no applications, numbering from app_1005, the original jobs, no delay. */
  reset(jobs: StubJob[] = SAMPLE_JOBS): void {
    this.applications.clear();
    this.requests.length = 0;
    this.nextId = 1005;
    this.delayMs = 0;
    this.hanging = false;
    this.jobs = jobs.map((job) => ({ ...job, payRange: { ...job.payRange } }));
  }

  /** While hanging, HTTP requests are accepted and never answered, like a Kazi that is still waking up. */
  hang(on: boolean): void {
    this.hanging = on;
  }

  async close(): Promise<void> {
    await this.down().catch(() => undefined);
    this.wss.close();
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  // ---- internals ------------------------------------------------------------------------------------

  private makeServer(): Server {
    const server = createServer((req, res) => void this.handle(req, res));
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    server.on('upgrade', (req, socket, head) => {
      const id = /^\/api\/applications\/([^/]+)\/subscribe$/.exec(new URL(req.url ?? '/', 'http://x').pathname)?.[1];
      if (!id || !this.applications.has(id)) {
        socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        const set = this.subscribers.get(id) ?? new Set<WebSocket>();
        this.subscribers.set(id, set);
        set.add(ws);
        ws.on('close', () => set.delete(ws));
        ws.send(JSON.stringify({ applicationId: id, status: this.applications.get(id)!.status }));
      });
    });
    return server;
  }

  private broadcast(applicationId: string, message: object): void {
    for (const ws of this.subscribers.get(applicationId) ?? []) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    }
  }

  private send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
    if (body === undefined) {
      res.writeHead(status, headers).end();
    } else {
      res.writeHead(status, { ...JSON_HEADERS, ...headers }).end(JSON.stringify(body));
    }
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    const method = req.method ?? 'GET';
    this.requests.push(`${method} ${url.pathname}${url.search}`);
    if (this.hanging) return; // never answer
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const path = url.pathname;
    const jobMatch = /^\/api\/jobs\/([^/]+)(\/status)?$/.exec(path);
    const appMatch = /^\/api\/applications\/([^/]+)(\/status|\/subscribe)?$/.exec(path);

    if (method === 'GET' && path === '/api/jobs') return this.listJobs(url, res);
    if (method === 'GET' && jobMatch) {
      const job = this.jobs.find((j) => j.id === jobMatch[1]);
      if (!job) return this.send(res, 404);
      return this.send(res, 200, jobMatch[2] ? { jobId: job.id, status: job.status } : job);
    }
    if (method === 'POST' && path === '/api/applications') return this.createApplication(req, res);
    if (appMatch && appMatch[2] === '/subscribe') return this.send(res, 426, { message: 'Connect with a WebSocket client' });
    if (method === 'GET' && appMatch?.[2] === '/status') {
      const app = this.applications.get(appMatch[1]);
      return app ? this.send(res, 200, { applicationId: app.applicationId, status: app.status }) : this.send(res, 404);
    }
    if (method === 'PUT' && appMatch && !appMatch[2]) return this.updateApplication(appMatch[1], req, res);
    if (method === 'DELETE' && appMatch && !appMatch[2]) return this.deleteApplication(appMatch[1], res);
    this.send(res, 404, { message: 'Not found' });
  }

  private listJobs(url: URL, res: ServerResponse): void {
    const status = url.searchParams.get('status');
    const county = url.searchParams.get('county');
    const category = url.searchParams.get('category');
    if (status === null || county === '' || category === '') return this.send(res, 400);
    const found = this.jobs.filter(
      (job) =>
        job.status === status &&
        (county === null || job.county.toLowerCase() === county.toLowerCase()) &&
        (category === null || job.category.toLowerCase() === category.toLowerCase()),
    );
    this.send(res, 200, found);
  }

  private async createApplication(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = JSON.parse(await this.readBody(req));
    } catch {
      return this.send(res, 400, { message: 'Body is not valid JSON' });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return this.send(res, 400, { message: 'Body must be an object' });
    const record = body as Record<string, unknown>;
    const unknown = Object.keys(record).filter((key) => !FIELDS.includes(key));
    if (unknown.length > 0) return this.send(res, 400, { message: `Unknown field(s): ${unknown.join(', ')}` });
    const missing = ['jobId', 'studentId', 'preferredDate'].filter((key) => record[key] === undefined);
    if (missing.length > 0) return this.send(res, 400, { message: `Missing required field(s): ${missing.join(', ')}` });
    if (typeof record.jobId !== 'string' || typeof record.studentId !== 'string' || record.jobId === '' || record.studentId === '') {
      return this.send(res, 400, { message: 'jobId and studentId must be text' });
    }
    if (typeof record.note !== 'undefined' && (typeof record.note !== 'string' || record.note.length > 500)) {
      return this.send(res, 400, { message: 'note must be text of up to 500 characters' });
    }
    if (typeof record.preferredDate !== 'string' || !(Date.parse(record.preferredDate) > Date.now())) {
      return this.send(res, 400, { message: 'preferredDate must be a real date-time in the future' });
    }
    const job = this.jobs.find((j) => j.id === record.jobId);
    if (!job) return this.send(res, 400, { message: `Job ${record.jobId} does not exist` });
    if (job.status !== 'active') return this.send(res, 409, { message: `Job ${job.id} is closed and is not accepting applications` });

    const application: StubApplication = {
      applicationId: `app_${this.nextId++}`,
      jobId: job.id,
      studentId: record.studentId,
      preferredDate: record.preferredDate,
      note: typeof record.note === 'string' ? record.note : '',
      status: 'pending',
    };
    this.applications.set(application.applicationId, application);
    this.send(res, 201, application, { Location: `/api/applications/${application.applicationId}` });
  }

  private async updateApplication(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const app = this.applications.get(id);
    if (!app) return this.send(res, 404, { message: `Application ${id} not found` });
    let body: unknown;
    try {
      body = JSON.parse(await this.readBody(req));
    } catch {
      return this.send(res, 400, { message: 'Body is not valid JSON' });
    }
    const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    if (typeof record.preferredDate !== 'string' || !(Date.parse(record.preferredDate) > Date.now())) {
      return this.send(res, 400, { message: 'preferredDate must be a real date-time in the future' });
    }
    if (app.status !== 'pending') return this.send(res, 409, { message: `Application ${id} is ${app.status}; only pending applications can be changed` });
    app.preferredDate = record.preferredDate;
    app.note = typeof record.note === 'string' ? record.note : '';
    this.send(res, 200, app);
  }

  private deleteApplication(id: string, res: ServerResponse): void {
    const app = this.applications.get(id);
    if (!app) return this.send(res, 404, { message: `Application ${id} not found` });
    if (app.status !== 'pending') return this.send(res, 409, { message: `Application ${id} is ${app.status}; only pending applications can be cancelled` });
    this.applications.delete(id);
    // "cancelled" goes out once, then the server closes the socket.
    for (const ws of this.subscribers.get(id) ?? []) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ applicationId: id, status: 'cancelled' }));
        ws.close(1000);
      }
    }
    this.send(res, 204);
  }
}

/** Starts a stub Kazi on a free local port. Call close() when done. */
export async function startKaziStub(jobs: StubJob[] = SAMPLE_JOBS): Promise<KaziStub> {
  const stub = new KaziStub(jobs);
  await stub.listen();
  return stub;
}
