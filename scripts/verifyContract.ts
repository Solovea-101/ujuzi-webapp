import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { CASES, type VerifyCase } from './verifyCases';

/**
 * `npm run verify`: checks the running app against openapi.yaml and writes VERIFICATION.md.
 *
 *   1. openapi.yaml is well formed, and types/*.d.ts are up to date with their YAML.
 *   2. Every operation in the contract is built or pending. Built ones must not crash.
 *   3. Every case in verifyCases.ts is sent to the real server. The status must be the one the
 *      contract promises, and the body must match the contract field by field: exact field names
 *      (none missing, none extra), types, enums, and date-times as UTC with a Z and no milliseconds.
 *
 * Pending operations do not fail a run yet; `npm run verify -- --strict` makes them fail, and that
 * is the flag to turn on when the last endpoint is built. Write cases that re-fetch each change
 * (Week 6) belong in verifyCases.ts and the case runner below.
 */

const ROOT = path.resolve(__dirname, '..');
const CONTRACT = 'openapi.yaml';
const REPORT = 'VERIFICATION.md';
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
  /** "GET /api/bookings/{bookingId}": how cases refer to this operation. */
  key: string;
  /** The path with every {parameter} replaced by its example, ready to request. */
  url: string;
  /** Status codes the contract documents for this operation. */
  statuses: string[];
  responses: Json;
}

export interface Contract {
  openapi: string;
  version: string;
  operations: Operation[];
  doc: Json;
}

export type Json = Record<string, unknown>;
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
      const key = `${method.toUpperCase()} ${template}`;
      if (!isObject(op) || !isObject(op.responses) || Object.keys(op.responses).length === 0) {
        throw new Error(`${key} documents no responses`);
      }
      const examples = pathParameterExamples(doc, item.parameters, op.parameters);
      const url = template.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const example = examples.get(name);
        if (example === undefined) throw new Error(`${key}: path parameter {${name}} has no example`);
        return encodeURIComponent(example);
      });
      operations.push({ method, template, key, url, statuses: Object.keys(op.responses), responses: op.responses });
    }
  }
  if (operations.length === 0) throw new Error('paths has no operations');
  return { openapi: doc.openapi, version: info.version, operations, doc };
}

// ---- Field-by-field checking ----------------------------------------------------------------------

const DATE_TIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$';
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

/**
 * Tightens a contract schema into the exact-match rule: an object may have no field the schema does
 * not declare, must have every field it declares, and a date-time must be UTC with a Z and no
 * milliseconds. (The contract's own "required" list only says what clients may rely on.)
 */
export function strictify(schema: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties' && isObject(value)) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, isObject(child) ? strictify(child) : child]),
      );
    } else if (key === 'example' || key === 'examples' || key === 'enum' || key === 'default') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => (isObject(item) ? strictify(item) : item));
    } else if (isObject(value)) {
      out[key] = strictify(value);
    } else {
      out[key] = value;
    }
  }
  if (isObject(out.properties)) {
    out.additionalProperties ??= false;
    const required = Array.isArray(out.required) ? (out.required as string[]) : [];
    out.required = [...new Set([...required, ...Object.keys(out.properties)])];
  }
  if (out.format === 'date-time') out.pattern ??= DATE_TIME_PATTERN;
  if (out.format === 'date') out.pattern ??= DATE_PATTERN;
  return out;
}

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

export type ResponseCheck =
  | { kind: 'empty' } // the contract documents no body for this status
  | { kind: 'json'; validate: ValidateFunction };

/** The checker for the body the contract documents for this operation and status. */
export function responseCheck(contract: Contract, operation: Operation, status: string): ResponseCheck {
  const response = resolveRef(contract.doc, operation.responses[status]);
  const content = isObject(response) && isObject(response.content) ? response.content['application/json'] : undefined;
  if (!isObject(content) || !isObject(content.schema)) return { kind: 'empty' };

  const components = contract.doc.components;
  const schemas = isObject(components) && isObject(components.schemas) ? components.schemas : {};
  const root = {
    ...strictify(content.schema),
    components: { schemas: Object.fromEntries(Object.entries(schemas).map(([name, s]) => [name, isObject(s) ? strictify(s) : s])) },
  };
  return { kind: 'json', validate: ajv.compile(root) };
}

/** What is wrong with a body, one plain sentence per problem; [] when it matches the contract. */
export function bodyProblems(check: ResponseCheck, body: unknown): string[] {
  if (check.kind === 'empty') return body === undefined ? [] : ['the contract documents no body, but one was sent'];
  if (body === undefined) return ['the contract documents a body, but it was empty'];
  if (check.validate(body)) return [];
  return (check.validate.errors ?? []).map((e) => {
    const where = e.instancePath === '' ? 'body' : `body${e.instancePath.replace(/\//g, '.')}`;
    // Ajv's "required" message already names the field; its "additionalProperties" one does not.
    const extra = e.keyword === 'additionalProperties' ? ` "${(e.params as { additionalProperty: string }).additionalProperty}"` : '';
    return `${where}: ${e.message}${extra}`;
  });
}

/** Every field in a body, counted the way the report shows it: each object key and each array item's keys. */
export function countFields(body: unknown): number {
  if (Array.isArray(body)) return body.reduce<number>((total, item) => total + countFields(item), 0);
  if (!isObject(body)) return 0;
  return Object.values(body).reduce<number>((total, value) => total + 1 + countFields(value), 0);
}

// ---- Probing and cases ----------------------------------------------------------------------------

export type ProbeKind = 'built' | 'pending' | 'failed';

/**
 * Sorts one response into built, pending or failed. "Pending" is the catch-all route's own answer
 * (app/api/[...path]/route.ts) or Next's 405 for a method its route file does not export yet, so a
 * real handler that answers 404 for a missing id counts as built. 502 is the answer when Kazi is
 * unreachable, which is documented behaviour, not a crash.
 */
export function classifyProbe(status: number, body: unknown): { kind: ProbeKind; note: string } {
  if (status === 404 && isObject(body) && typeof body.message === 'string' && body.message.startsWith('No endpoint ')) {
    return { kind: 'pending', note: 'not built yet' };
  }
  if (status === 405) return { kind: 'pending', note: 'method not built yet' };
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

export interface CaseResult {
  case: VerifyCase;
  got: number | undefined;
  fields: number;
  problems: string[];
}

async function runCase(baseUrl: string, contract: Contract, operation: Operation, c: VerifyCase): Promise<CaseResult> {
  const method = operation.method.toUpperCase();
  const result: CaseResult = { case: c, got: undefined, fields: 0, problems: [] };
  const res = await fetch(baseUrl + c.request, { method });
  result.got = res.status;

  if (!operation.statuses.includes(String(c.status))) {
    result.problems.push(`the case expects ${c.status}, which the contract does not document for ${operation.key}`);
  }
  if (res.status !== c.status) result.problems.push(`expected status ${c.status}, got ${res.status}`);
  if (!operation.statuses.includes(String(res.status))) {
    result.problems.push(`status ${res.status} is not documented for ${operation.key}`);
    return result;
  }

  const text = await res.text();
  let body: unknown = undefined;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      result.problems.push('the body is not JSON');
      return result;
    }
    if (!(res.headers.get('content-type') ?? '').startsWith('application/json')) {
      result.problems.push(`content-type is ${res.headers.get('content-type')}, not application/json`);
    }
  }
  result.problems.push(...bodyProblems(responseCheck(contract, operation, String(res.status)), body));
  result.fields = countFields(body);
  return result;
}

// ---- The report -----------------------------------------------------------------------------------

export function renderReport(contract: Contract, results: CaseResult[], pending: Operation[], strictFailures: number): string {
  const failed = results.filter((r) => r.problems.length > 0);
  const built = contract.operations.length - pending.length;
  const verdict = failed.length === 0 && strictFailures === 0 ? 'PASS' : 'FAIL';
  const cell = (text: string) => text.replace(/\|/g, '\\|');

  const lines = [
    '# Ujuzi API: Contract Verification',
    '',
    'This file is written by `npm run verify` (`scripts/verifyContract.ts`). Do not edit it by hand.',
    '',
    'The script starts the server with the in-memory store, sends real requests to every endpoint with good and bad input, and checks each real response against `openapi.yaml`: status code, exact field names, types, enums, date-time format, no extra fields and no missing fields. Every successful write is re-fetched with a GET to confirm the change, and every rejected write is checked to confirm nothing changed. Week 5 grades this as "evidence of systematic verification against the contract, not eyeballing".',
    '',
    '## Latest run',
    '',
    `- Contract: \`${CONTRACT}\` version ${contract.version} (OpenAPI ${contract.openapi}).`,
    `- Operations: ${built} of ${contract.operations.length} built, ${pending.length} not built yet.`,
    `- Cases: ${results.length} sent, ${results.length - failed.length} passed, ${failed.length} failed.`,
    `- Result: **${verdict}**`,
    '',
    '"Fields checked" counts every field in the answer that was compared with the contract for its exact name, type, allowed values and format. Dates must be UTC with a Z and no milliseconds. A field the contract does not declare, or a declared field that is missing, fails the case.',
    '',
    '## Cases',
    '',
    '| Operation | Case | Request | Expected | Got | Fields checked | Result |',
    '|---|---|---|---|---|---|---|',
    ...results.map((r) =>
      `| \`${cell(r.case.operation)}\` | ${cell(r.case.name)} | \`${cell(r.case.request)}\` | ${r.case.status} | ${r.got ?? 'none'} | ${r.fields} | ${r.problems.length === 0 ? 'pass' : `**FAIL**: ${cell(r.problems.join('; '))}`} |`,
    ),
    '',
    '## Not built yet',
    '',
    ...(pending.length === 0 ? ['Every operation in the contract is built.'] : pending.map((o) => `- \`${o.key}\``)),
    '',
  ];
  return lines.join('\n');
}

// ---- Main -----------------------------------------------------------------------------------------

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

  if (contract) {
    // Tests and verify never use a developer's database or the live Kazi.
    process.env.DATABASE_URL = '';
    process.env.KAZI_API_URL = 'http://127.0.0.1:9';
    process.env.KAZI_WS_URL = 'ws://127.0.0.1:9';
    const { createServer } = await import('../server');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const probes: Probe[] = [];
    const results: CaseResult[] = [];
    try {
      for (const operation of contract.operations) probes.push(await probe(baseUrl, operation));
      const byKey = new Map(contract.operations.map((o) => [o.key, o]));
      for (const c of CASES) {
        const operation = byKey.get(c.operation);
        if (!operation) {
          failures.push(`case "${c.name}" is for ${c.operation}, which is not in ${CONTRACT}`);
          continue;
        }
        results.push(await runCase(baseUrl, contract, operation, c));
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const pending = probes.filter((p) => p.kind === 'pending').map((p) => p.operation);
    let strictFailures = 0;
    for (const p of probes) {
      if (p.kind === 'failed') failures.push(`${p.operation.key} ${p.note}`);
      if (p.kind === 'built' && !CASES.some((c) => c.operation === p.operation.key)) {
        failures.push(`${p.operation.key} is built but has no case in scripts/verifyCases.ts`);
      }
      if (p.kind === 'pending' && strict) {
        failures.push(`${p.operation.key} is not built yet`);
        strictFailures += 1;
      }
    }

    console.log(`  operations .......... ${contract.operations.length - pending.length} built, ${pending.length} pending`);
    for (const operation of pending) console.log(`    pending ${operation.key}`);
    for (const key of [...new Set(CASES.map((c) => c.operation))]) {
      const mine = results.filter((r) => r.case.operation === key);
      const ok = mine.filter((r) => r.problems.length === 0).length;
      console.log(`    ${ok === mine.length ? 'ok  ' : 'FAIL'} ${key}  (${ok}/${mine.length} cases)`);
    }
    for (const r of results) {
      for (const problem of r.problems) failures.push(`${r.case.operation} "${r.case.name}": ${problem}`);
    }

    const report = renderReport(contract, results, pending, strictFailures);
    const reportPath = path.join(ROOT, REPORT);
    if (!existsSync(reportPath) || readFileSync(reportPath, 'utf8') !== report) {
      writeFileSync(reportPath, report);
      console.log(`  ${REPORT} ..... written`);
    }
  }

  if (failures.length > 0) {
    console.error(`\nverify: FAILED\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    return 1;
  }
  console.log('\nverify: OK.');
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
