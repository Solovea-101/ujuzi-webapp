import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt: memory-hard, so guessing a stolen hash is expensive. Tests use a cheap setting so they stay
// fast; the cost is written into each stored hash, so a hash is always checked at the cost it was made with.
const COST = () => (process.env.NODE_ENV === 'test' ? 1024 : 16384);
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** "scrypt$N$r$p$salt$hash": everything needed to check the password later, and nothing that reveals it. */
export async function hashPassword(password: string): Promise<string> {
  const n = COST();
  const salt = randomBytes(16);
  const key = await derive(password, salt, n, BLOCK_SIZE, PARALLELISM, KEY_LENGTH);
  return ['scrypt', n, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** True when the password matches the stored hash. A value that is not a hash (such as "!") never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const [cost, block, parallel] = [Number(n), Number(r), Number(p)];
  if (![cost, block, parallel].every((value) => Number.isInteger(value) && value > 0) || cost > 1 << 20) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), cost, block, parallel, expected.length);
  return expected.length > 0 && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;

/**
 * Checks a password against a throwaway hash, so a login for an email that does not exist takes as
 * long as one for an email that does, and the answer does not reveal which emails have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword('this is not anyone\'s password');
  await verifyPassword(password, await dummy);
  return false;
}
