import { afterEach, describe, expect, it, vi } from 'vitest';

// Cell crypto fails closed (2026-09-24): no literal fallback secret. These pin the three halves of that — it still
// round-trips with the secret, it refuses without it, and it refuses at USE time so importing it never throws.

const findMany = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    cellApiKey: { findMany: (...a: unknown[]) => findMany(...a) },
    cellSettings: { findUnique: async () => null },
  },
}));

import { CellSecretMissingError, decryptSecret, encryptSecret, keyHint } from './cell-crypto';
import { loadBuildContext } from './cell-build';

afterEach(() => { vi.unstubAllEnvs(); findMany.mockReset(); });

describe('Cell secret encryption', () => {
  it('round-trips a provider key under NEXTAUTH_SECRET, and a different secret cannot read it', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const blob = encryptSecret('sk-live-1234');
    expect(blob).not.toContain('sk-live');
    expect(decryptSecret(blob)).toBe('sk-live-1234');
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-b');
    expect(decryptSecret(blob)).toBe('');
  });

  it('answers a corrupt blob with an empty string, as before', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    expect(decryptSecret('not-a-blob')).toBe('');
  });

  it('refuses to encrypt or decrypt with no secret, rather than using a literal anyone can read', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    const blob = encryptSecret('sk-live-1234');
    for (const unset of ['', undefined]) {
      vi.stubEnv('NEXTAUTH_SECRET', unset);
      expect(() => encryptSecret('sk-live-1234')).toThrow(CellSecretMissingError);
      // not swallowed into '' like a bad blob: a missing secret is a config error the caller must see
      expect(() => decryptSecret(blob)).toThrow(/NEXTAUTH_SECRET is not set/);
    }
  });

  it('needs no secret for the parts that hold no key material', () => {
    vi.stubEnv('NEXTAUTH_SECRET', '');
    expect(keyHint('sk-live-1234')).toBe('1234');
  });

  it('surfaces the missing secret through a build instead of silently dropping the stored keys', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-a');
    findMany.mockResolvedValue([{ provider: 'openai', keyCipher: encryptSecret('sk-live-1234') }]);
    const ctx = await loadBuildContext('p1', 'u1');
    expect(ctx.keys.openai).toBe('sk-live-1234');

    vi.stubEnv('NEXTAUTH_SECRET', '');
    await expect(loadBuildContext('p1', 'u1')).rejects.toThrow(CellSecretMissingError);

    // an unreachable database still degrades to the default routing, as it always has
    findMany.mockRejectedValue(new Error('db down'));
    await expect(loadBuildContext('p1', 'u1')).resolves.toMatchObject({ haveKeys: new Set() });
  });
});
