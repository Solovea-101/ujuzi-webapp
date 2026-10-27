import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

/**
 * Checks of Kazi Connect's answers against Kazi's own contract (partner-tests/kazi_openapi.yaml, the
 * frozen copy). Used by the partner tests and by `npm run ring:check`. The schemas are applied as Kazi
 * wrote them: a field Kazi adds beyond its contract is not an error here, a missing or mistyped one is.
 */
const doc = parse(readFileSync(path.join(__dirname, '..', 'partner-tests', 'kazi_openapi.yaml'), 'utf8')) as {
  components: { schemas: Record<string, object> };
};

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const cache = new Map<string, ValidateFunction>();

/** A validator for one of Kazi's schemas by name: "Job", "Application", "ApplicationStatus", "Error". */
export function kaziSchema(name: string): ValidateFunction {
  let validate = cache.get(name);
  if (!validate) {
    validate = ajv.compile({ $ref: `#/components/schemas/${name}`, components: doc.components });
    cache.set(name, validate);
  }
  return validate;
}

/** One plain sentence per problem, or [] when the value matches the schema. */
export function schemaProblems(name: string, value: unknown): string[] {
  const validate = kaziSchema(name);
  if (validate(value)) return [];
  return (validate.errors ?? []).map((e) => `${name}${e.instancePath.replace(/\//g, '.')}: ${e.message}`);
}
