// SECURITY-REVIEW S-02: a sign-in for an email with no account takes as long as a wrong password for a real one.
// authorize() used to return before bcrypt for an unknown email (~250 ms sooner at cost 12), which let anyone timing
// POST /api/auth/callback/credentials learn which emails have accounts. The fix pays one compare against a fixed hash.
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));

import { UNKNOWN_ACCOUNT_HASH, authOptions } from '@/lib/auth';

type Authorize = (c: Record<string, string> | undefined) => Promise<unknown>;
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: Authorize } }).options.authorize;

describe('authorize() — unknown accounts pay the same bcrypt compare (S-02)', () => {
  beforeEach(() => { findUnique.mockReset(); vi.restoreAllMocks(); });

  it('the fixed hash is a real cost-12 bcrypt hash, the cost signup uses, and matches nothing typed', async () => {
    expect(bcrypt.getRounds(UNKNOWN_ACCOUNT_HASH)).toBe(12);
    expect(await bcrypt.compare('', UNKNOWN_ACCOUNT_HASH)).toBe(false);
    expect(await bcrypt.compare('password', UNKNOWN_ACCOUNT_HASH)).toBe(false);
  });

  it('an unknown email returns null AFTER one compare against the fixed hash', async () => {
    findUnique.mockResolvedValue(null);
    const spy = vi.spyOn(bcrypt, 'compare');
    expect(await authorize({ email: 'Nobody@Example.com ', password: 'guess-1' })).toBeNull();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'nobody@example.com' } }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('guess-1', UNKNOWN_ACCOUNT_HASH);
  });

  it('an account with no password (an OAuth-era row) is refused the same way', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', password: null, profile: null });
    const spy = vi.spyOn(bcrypt, 'compare');
    expect(await authorize({ email: 'a@b.c', password: 'x' })).toBeNull();
    expect(spy).toHaveBeenCalledWith('x', UNKNOWN_ACCOUNT_HASH);
  });

  it('a real account still signs in with its password, and a wrong one is still null (behaviour unchanged)', async () => {
    const hash = await bcrypt.hash('right-pass', 4);
    findUnique.mockResolvedValue({ id: 'u2', email: 'real@x.y', name: 'Real', password: hash, role: 'player', profile: { id: 'p2' } });
    expect(await authorize({ email: 'real@x.y', password: 'right-pass' })).toMatchObject({ id: 'u2', email: 'real@x.y', profileId: 'p2', role: 'player' });
    expect(await authorize({ email: 'real@x.y', password: 'wrong-pass' })).toBeNull();
  });

  it('missing fields never reach the database', async () => {
    expect(await authorize({ email: '', password: 'x' })).toBeNull();
    expect(await authorize(undefined)).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
