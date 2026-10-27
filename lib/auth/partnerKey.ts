import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 of a key, as 64 hex characters. Keys are 256 random bits, so a plain hash is enough. */
export const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

const HASH = /^[0-9a-f]{64}$/;
let warnedAboutEntries = false;

/** The hashes in PARTNER_KEYS (comma separated). Read on every call, so a change takes effect at once. */
function configuredHashes(): Buffer[] {
  const entries = (process.env.PARTNER_KEYS ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const valid = entries.filter((entry) => HASH.test(entry));
  if (valid.length < entries.length && !warnedAboutEntries) {
    warnedAboutEntries = true;
    console.warn('PARTNER_KEYS has entries that are not SHA-256 hashes (64 hex characters); they are ignored.');
  }
  return valid.map((hash) => Buffer.from(hash, 'hex'));
}

/**
 * True when the X-API-Key a caller sent hashes to one of the keys we issued. Only hashes are ever
 * stored (in PARTNER_KEYS, in Render's settings), never the keys. With no keys configured nothing
 * matches, so partner endpoints stay closed rather than open.
 */
export function hasValidPartnerKey(presented: string | null): boolean {
  if (!presented) return false;
  const candidate = Buffer.from(hashKey(presented), 'hex');
  let matched = false;
  // Compare against every hash with no early exit, so timing does not say which one was close.
  for (const hash of configuredHashes()) {
    if (timingSafeEqual(candidate, hash)) matched = true;
  }
  return matched;
}

/** A new random key and its hash. Give the key to the partner once; put only the hash in PARTNER_KEYS. */
export function generatePartnerKey(): { key: string; hash: string } {
  const key = `ujz_${randomBytes(32).toString('base64url')}`;
  return { key, hash: hashKey(key) };
}

/** How many valid key hashes are configured, for the start-up log. Never the hashes or the keys themselves. */
export const countPartnerKeys = (): number => configuredHashes().length;
