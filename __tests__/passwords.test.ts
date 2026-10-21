import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/auth/passwords';

describe('hashPassword', () => {
  it('makes "scrypt$N$r$p$salt$hash" and never contains the password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored).toMatch(/^scrypt\$\d+\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(stored).not.toContain('correct');
    expect(stored).not.toContain('horse');
  });

  it('uses a new salt every time, so the same password never gives the same hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and nothing else', async () => {
    const stored = await hashPassword('Tr0ub4dor&3');
    expect(await verifyPassword('Tr0ub4dor&3', stored)).toBe(true);
    for (const wrong of ['tr0ub4dor&3', 'Tr0ub4dor&3 ', ' Tr0ub4dor&3', 'Tr0ub4dor&', '', 'x'.repeat(5000)]) {
      expect(await verifyPassword(wrong, stored)).toBe(false);
    }
  });

  it('handles unicode passwords', async () => {
    const stored = await hashPassword('pässwörd \u{1F511} 中文');
    expect(await verifyPassword('pässwörd \u{1F511} 中文', stored)).toBe(true);
    expect(await verifyPassword('password', stored)).toBe(false);
  });

  it.each([
    ['the "!" placeholder', '!'],
    ['an empty string', ''],
    ['plain text', 'password123'],
    ['another scheme', 'bcrypt$10$abc$def'],
    ['a missing hash', 'scrypt$1024$8$1$c2FsdA'],
    ['non-numeric cost', 'scrypt$lots$8$1$c2FsdA$aGFzaA'],
    ['a cost of zero', 'scrypt$0$8$1$c2FsdA$aGFzaA'],
    ['a cost so large it would exhaust memory', `scrypt$${2 ** 30}$8$1$c2FsdA$aGFzaA`],
    ['an empty hash part', 'scrypt$1024$8$1$c2FsdA$'],
  ])('never matches %s, and does not throw', async (_name, stored) => {
    await expect(verifyPassword('anything', stored)).resolves.toBe(false);
  });

  it('checks a hash at the cost written into it, not today\'s cost', async () => {
    // A hash made at one cost must keep working after the cost is changed.
    const stored = await hashPassword('moving target');
    const [scheme, , r, p, salt, hash] = stored.split('$');
    expect(scheme).toBe('scrypt');
    const cheaper = ['scrypt', 512, r, p, salt, hash].join('$');
    expect(await verifyPassword('moving target', cheaper)).toBe(false); // a different cost gives a different key
    expect(await verifyPassword('moving target', stored)).toBe(true);
  });
});

describe('verifyAgainstDummy', () => {
  it('does the same work as a real check and always says no', async () => {
    expect(await verifyAgainstDummy('anything')).toBe(false);
    expect(await verifyAgainstDummy('')).toBe(false);
  });
});
