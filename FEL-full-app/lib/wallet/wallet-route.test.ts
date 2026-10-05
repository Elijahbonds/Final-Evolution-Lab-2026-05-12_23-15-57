// GET /api/v1/wallet, DRIVEN (no database) — LOGIN-LOOP-FIX (2026-10-04).
//
// During the sign-in redirect loop (components/auth-form.tsx, mode-carousel.tsx), a logged-out browser called this
// route thousands of times a minute and 24 of 1,389 answers came back 500 instead of 401. This route already 401'd
// when there was no session user id; this pins the cases that could still have slipped past that check into a 500:
//   - getServerSession itself throwing (a malformed / mid-rotation session cookie)
//   - a session whose user id no longer resolves to a real player (readWallet's wallet.create hits the Wallet ->
//     User foreign key and Prisma throws P2003, or P2025)
// and that a REAL failure for a valid, signed-in user (e.g. the database is unreachable) still surfaces as a 500 —
// this route does not swallow every error, only the ones that mean "there is no valid session here".
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const readWallet = vi.fn();
vi.mock('@/lib/wallet/wallet-service', () => ({ readWallet: (...a: unknown[]) => readWallet(...a) }));

const refundNotesFor = vi.fn();
vi.mock('@/lib/wallet/dead-buy-refunds', () => ({ refundNotesFor: (...a: unknown[]) => refundNotesFor(...a) }));

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { GET } from '@/app/api/v1/wallet/route';

const VIEW = { coins: 100, shards: 5, lc: 0, version: 3, updated_at: '2026-10-04T00:00:00.000Z' };

beforeEach(() => {
  getServerSession.mockReset();
  readWallet.mockReset();
  refundNotesFor.mockReset();
  refundNotesFor.mockReturnValue([]);
});

describe('GET /api/v1/wallet: logged-out / no-valid-user is always 401, never 500', () => {
  it('no session at all: 401 {error: "unauthorized"}', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(readWallet).not.toHaveBeenCalled();
  });

  it('a session with no user id: 401 (the pre-existing guard, kept)', async () => {
    getServerSession.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('getServerSession throws (a malformed / mid-rotation session cookie): 401, not 500', async () => {
    getServerSession.mockRejectedValue(new Error('JWEDecryptionFailed'));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(readWallet).not.toHaveBeenCalled();
  });

  it('a session whose user id no longer resolves to a player (P2003 foreign-key violation): 401, not 500', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'ghost-user' } });
    readWallet.mockRejectedValue(Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('a session whose user id no longer resolves to a player (P2025 record-not-found): 401, not 500', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'ghost-user' } });
    readWallet.mockRejectedValue(Object.assign(new Error('An operation failed because it depends on one or more records that were required but not found'), { code: 'P2025' }));
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/wallet: a valid signed-in user', () => {
  it('200 with the unchanged wallet shape', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    readWallet.mockResolvedValue(VIEW);
    refundNotesFor.mockReturnValue([{ id: 'r1', text: 'refunded', at: '2026-10-01T00:00:00.000Z' }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      coins: VIEW.coins, shards: VIEW.shards, lc: VIEW.lc, version: VIEW.version, updated_at: VIEW.updated_at,
      refund_notes: [{ id: 'r1', text: 'refunded', at: '2026-10-01T00:00:00.000Z' }],
    });
    expect(readWallet).toHaveBeenCalledWith({}, 'u1');
  });

  it('a real database failure for a valid session still surfaces (not masked as 401)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1' } });
    const dbDown = Object.assign(new Error('Server has closed the connection'), { constructor: { name: 'PrismaClientInitializationError' } });
    readWallet.mockRejectedValue(dbDown);
    // The route does not catch this: Next's own handler is what turns an uncaught throw into a 500 for a real
    // request. Calling the handler directly here, the promise it returns rejects with the same error — proving
    // it is NOT one of the unauthorized cases above (no .code === 'P2003'/'P2025', so isUnknownPlayerError is
    // false and the route re-throws).
    await expect(GET()).rejects.toBe(dbDown);
  });
});
