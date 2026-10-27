import { generatePartnerKey } from '../lib/auth/partnerKey';

/**
 * `npm run key:issue -- sherehe`: makes one partner key. It prints the key once, and the hash to put in
 * PARTNER_KEYS (Render's settings, never git). Nothing is written to disk: copy the key now, because
 * only the hash is kept anywhere and the key cannot be recovered.
 */
const partner = process.argv[2] ?? 'partner';
const { key, hash } = generatePartnerKey();

console.log(`Partner: ${partner}\n`);
console.log('Key. Give it to the partner once, over a private channel. It is not stored anywhere:');
console.log(`  ${key}\n`);
console.log('Entry. Add it to PARTNER_KEYS in Render (several entries are separated by commas). The name is the partner it belongs to:');
console.log(`  ${partner.toLowerCase()}:${hash}\n`);
console.log('The partner sends the key as the X-API-Key header on every partner request.');
