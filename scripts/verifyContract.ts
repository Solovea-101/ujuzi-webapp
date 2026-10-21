import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

/**
 * `npm run verify`: checks the running app against openapi.yaml.
 *
 * Today it checks that the contract file is well formed, that types/*.d.ts are up to date with
 * their YAML, and that every operation in the contract is either built or reported as pending.
 * Built operations must not crash. The Week 5 version goes further (good and bad input for every
 * endpoint, every field of every response checked against the schema, VERIFICATION.md written);
 * until then pending operations do not fail the run. `npm run verify -- --strict` makes them fail.
 */

const ROOT = path.resolve(__dirname, '..');
const CONTRACT = 'openapi.yaml';
const TYPE_FILES: ReadonlyArray<{ yaml: string; types: string }> = [
  { yaml: 'openapi.yaml', types: 'types/api.d.ts' },
  { yaml: 'partner-tests/kazi_openapi.yaml', types: 'types/kazi.d.ts' },
];

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type Method = (typeof METHODS)[number];

export interface Operation {
  method: Method;
  /** The path as written in the contract, e.g. /api/bookings/{bookingId}. */
  template: string;
  /** The path with every {parameter} replaced by its example, ready to request. */
  url: string;
  /** Status codes the contract documents for this operation. */
  statuses: string[];
}

export interface Contract {
  openapi: string;
  version: string;
  operations: Operation[];
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function resolveRef(doc: Json, value: unknown): unknown {
  if (!isObject(value) || typeof value.$ref !== 'string') return value;
  const ref = value.$ref;
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref ${ref}: only local references are checked`);
  let node: unknown = doc;
  for (const part of ref.slice(2).split('/')) {
    node = isObject(node) ? node[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
  }
  if (node === undefined) throw new Error(`Unresolved $ref ${ref}`);
  return node;
}

function pathParameterExamples(doc: Json, ...lists: unknown[]): Map<string, string> {
  const examples = new Map<string, string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const param = resolveRef(doc, entry);
      if (!isObject(param) || param.in !== 'path' || typeof param.name !== 'string') continue;
      const schema = resolveRef(doc, param.schema);
      const example = param.example ?? (isObject(schema) ? schema.example : undefined);
      if (typeof example === 'string' || typeof example === 'number') examples.set(param.name, String(example));
    }
  }
  return examples;
}

/** Reads openapi.yaml text into its version and a list of operations. Throws a plain-English Error. */
export function parseContract(text: string): Contract {
  const doc: unknown = parse(text);
  if (!isObject(doc)) throw new Error('is not a YAML mapping');
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.0')) {
    throw new Error(`"openapi" must be a 3.0.x version, found ${JSON.stringify(doc.openapi)}`);
  }
  const info = doc.info;
  if (!isObject(info) || typeof info.version !== 'string') throw new Error('info.version is missing');
  if (!isObject(doc.paths)) throw new Error('paths is missing');

  const operations: Operation[] = [];
  for (const [template, rawItem] of Object.entries(doc.paths)) {
    const item = resolveRef(doc, rawItem);
    if (!isObject(item)) throw new Error(`${template} is not a mapping`);
    for (const method of METHODS) {
      const op = item[method];
      if (op === undefined) continue;
      const label = `${method.toUpperCase()} ${template}`;
      if (!isObject(op) || !isObject(op.responses) || Object.keys(op.responses).length === 0) {
        throw new Error(`${label} documents no responses`);
      }
      const examples = pathParameterExamples(doc, item.parameters, op.parameters);
      const url = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const example = examples.get(name);
        if (example === undefined) throw new Error(`${label}: path parameter {${name}} has no example`);
        return encodeURIComponent(example);
      });
      operations.push({ method, template, url, statuses: Object.keys(op.responses) });
    }
  }
  if (operations.length === 0) throw new Error('paths has no operations');
  return { openapi: doc.openapi, version: info.version, operations };
}

export type ProbeKind = 'built' | 'pending' | 'failed';

/**
 * Sorts one response into built, pending or failed. "Pending" is the catch-all route's own answer
 * (app/api/[...path]/route.ts), so a real handler that answers 404 for a missing id counts as built.
 * 502 is the answer when Kazi is unreachable, which is documented behaviour, not a crash.
 */
export function classifyProbe(status: number, body: unknown): { kind: ProbeKind; note: string } {
  if (status === 404 && isObject(body) && typeof body.message === 'string' && body.message.startsWith('No endpoint ')) {
    return { kind: 'pending', note: 'not built yet' };
  }
  if (status >= 500 && status !== 502) return { kind: 'failed', note: `answered ${status}` };
  return { kind: 'built', note: `answered ${status}` };
}

interface Probe {
  operation: Operation;
  kind: ProbeKind;
  note: string;
}

async function probe(baseUrl: string, operation: Operation): Promise<Probe> {
  const hasBody = operation.method === 'post' || operation.method === 'put' || operation.method === 'patch';
  const res = await fetch(baseUrl + operation.url, {
    method: operation.method.toUpperCase(),
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? '{}' : undefined,
  });
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text === '' ? undefined : JSON.parse(text);
  } catch {
    return { operation, kind: 'failed', note: `answered ${res.status} with a body that is not JSON` };
  }
  return { operation, ...classifyProbe(res.status, body) };
}

/** Regenerates each types file into a temp folder and compares it with the committed copy. */
function staleTypeFiles(): string[] {
  const stale: string[] = [];
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ujuzi-verify-'));
  try {
    const bin = path.join(ROOT, 'node_modules', '.bin', 'openapi-typescript');
    TYPE_FILES.forEach(({ yaml, types }, i) => {
      const out = path.join(tmp, `${i}.d.ts`);
      execFileSync(bin, [path.join(ROOT, yaml), '-o', out], { stdio: 'pipe' });
      if (readFileSync(out, 'utf8') !== readFileSync(path.join(ROOT, types), 'utf8')) stale.push(types);
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return stale;
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict');
  if (process.env.NODE_ENV !== 'production') {
    console.error('verify needs the production build: run it as `npm run verify`.');
    return 1;
  }
  const failures: string[] = [];

  let contract: Contract | undefined;
  try {
    contract = parseContract(readFileSync(path.join(ROOT, CONTRACT), 'utf8'));
    console.log(`verify: ${CONTRACT} ${contract.version} (OpenAPI ${contract.openapi}), ${contract.operations.length} operations`);
  } catch (err) {
    failures.push(`${CONTRACT} ${(err as Error).message}`);
  }

  try {
    const stale = staleTypeFiles();
    for (const file of stale) failures.push(`${file} is out of date with its YAML: run \`npm run types\``);
    console.log(stale.length === 0 ? '  generated types ..... up to date' : `  generated types ..... STALE: ${stale.join(', ')}`);
  } catch (err) {
    failures.push(`could not regenerate the types to compare them: ${(err as Error).message.split('\n')[0]}`);
  }

  const probes: Probe[] = [];
  if (contract) {
    // Tests and verify never use a developer's database or the live Kazi.
    process.env.DATABASE_URL = '';
    process.env.KAZI_API_URL = 'http://127.0.0.1:9';
    process.env.KAZI_WS_URL = 'ws://127.0.0.1:9';
    const { createServer } = await import('../server');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (const operation of contract.operations) probes.push(await probe(baseUrl, operation));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const count = (kind: ProbeKind) => probes.filter((p) => p.kind === kind).length;
    console.log(`  endpoints ........... ${count('built')} built, ${count('pending')} pending, ${count('failed')} failed`);
    for (const p of probes) {
      console.log(`    ${p.kind.padEnd(7)} ${p.operation.method.toUpperCase().padEnd(6)} ${p.operation.template}  (${p.note})`);
      if (p.kind === 'failed') failures.push(`${p.operation.method.toUpperCase()} ${p.operation.template} ${p.note}`);
      if (p.kind === 'pending' && strict) failures.push(`${p.operation.method.toUpperCase()} ${p.operation.template} is not built yet`);
    }
  }

  if (failures.length > 0) {
    console.error(`\nverify: FAILED\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    return 1;
  }
  const pending = probes.filter((p) => p.kind === 'pending').length;
  console.log(
    pending > 0
      ? `\nverify: OK. ${pending} pending operations are not built yet and will fail \`npm run verify -- --strict\`.`
      : '\nverify: OK.',
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
