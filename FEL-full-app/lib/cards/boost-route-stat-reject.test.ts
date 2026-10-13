import { describe, expect, it, vi } from 'vitest';

// CARD-SAFE-2: the purchase route refuses any payload that tries to carry a stat, before touching the wallet.
const { spend } = vi.hoisted(() => ({ spend: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'p1' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: { playerEntitlement: { findMany: vi.fn(async () => []) } } }));
vi.mock('@/lib/wallet/wallet-service', () => ({ spend, readWallet: vi.fn(async () => ({ shards: 0 })), WalletError: class extends Error {} }));

import { POST } from '@/app/api/cards/boosts/route';

const req = (body: unknown) => new Request('http://x/api/cards/boosts', { method: 'POST', body: JSON.stringify(body) }) as any;

describe('POST /api/cards/boosts stat payloads', () => {
  it.each([
    [{ card_id: 'neural-max', boost: { prq: 15 } }],
    [{ card_id: 'neural-max', prq: 10 }],
    [{ card_id: 'neural-max', card: { id: 'neural-max', vertical: 25 } }],
    [{ card_id: 'neural-max', modifiers: [{ stat: 'damage', value: 3 }] }],
  ])('rejects %j with 400 stat_modifier_rejected and spends nothing', async (body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'stat_modifier_rejected' });
    expect(spend).not.toHaveBeenCalled();
  });
});
