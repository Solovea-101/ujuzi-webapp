import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 of a key, as 64 hex characters. Keys are 256 random bits, so a plain hash is enough. */
export const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

const HASH = /^[0-9a-f]{64}$/;
const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** The partner an entry without a name belongs to. Name every key (name:hash) so each partner is told apart. */
export const UNNAMED_PARTNER = 'default';
let warnedAboutEntries = false;

interface ConfiguredKey {
  partner: string;
  hash: Buffer;
}

/**
 * The entries of PARTNER_KEYS (comma separated), each "name:hash" or just "hash". The name says whose key it
 * is, and is what a booking is filed under. Read on every call, so a change takes effect at once.
 */
function configuredKeys(): ConfiguredKey[] {
  const entries = (process.env.PARTNER_KEYS ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const keys: ConfiguredKey[] = [];
  for (const entry of entries) {
    const colon = entry.lastIndexOf(':');
    const partner = colon === -1 ? UNNAMED_PARTNER : entry.slice(0, colon);
    const hash = colon === -1 ? entry : entry.slice(colon + 1);
    if (HASH.test(hash) && NAME.test(partner)) keys.push({ partner, hash: Buffer.from(hash, 'hex') });
  }
  if (keys.length < entries.length && !warnedAboutEntries) {
    warnedAboutEntries = true;
    console.warn('PARTNER_KEYS has entries that are not "name:hash" or a SHA-256 hash (64 hex characters); they are ignored.');
  }
  return keys;
}

/**
 * The partner a presented X-API-Key belongs to, or undefined when it matches no key we issued. Only hashes are
 * ever stored (in PARTNER_KEYS, in Render's settings), never the keys. With no keys configured nothing
 * matches, so partner endpoints stay closed rather than open.
 */
export function partnerForKey(presented: string | null): string | undefined {
  if (!presented) return undefined;
  const candidate = Buffer.from(hashKey(presented), 'hex');
  let partner: string | undefined;
  // Compare against every hash with no early exit, so timing does not say which one was close.
  for (const key of configuredKeys()) {
    if (timingSafeEqual(candidate, key.hash)) partner = key.partner;
  }
  return partner;
}

/** True when the X-API-Key a caller sent is one we issued. */
export const hasValidPartnerKey = (presented: string | null): boolean => partnerForKey(presented) !== undefined;

/** A new random key and its hash. Give the key to the partner once; put only the hash in PARTNER_KEYS. */
export function generatePartnerKey(): { key: string; hash: string } {
  const key = `ujz_${randomBytes(32).toString('base64url')}`;
  return { key, hash: hashKey(key) };
}

/** How many valid key hashes are configured, for the start-up log. Never the hashes or the keys themselves. */
export const countPartnerKeys = (): number => configuredKeys().length;
