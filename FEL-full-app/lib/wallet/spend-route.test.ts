import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/wallet/spend runs for real here, and so does spend(). Only the session and the database are stand-ins:
// the database answers the idempotency lookup and throws on anything else, so any balance read, transaction or write
// fails the test, and a refused SKU is proved refused before the wallet could be touched.
const m = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as unknown,
  findUnique: vi.fn(async (_args: unknown): Promise<unknown> => null),
  touched: [] as string[],
}));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined; // not a thenable
      if (prop === 'walletLedgerEntry') return { findUnique: m.findUnique };
      m.touched.push(String(prop));
      throw new Error(`the route touched prisma.${String(prop)}`);
    },
  }),
}));

import { POST } from '@/app/api/v1/wallet/spend/route';
import { CATALOG, SPEND_ROUTE_SKUS } from './catalog';

const post = (skuId: string, body: Record<string, unknown> = {}) => POST(new Request('http://fel.test/api/v1/wallet/spend', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idempotency_key: `k_${skuId}`, sku_id: skuId, quantity: 1, ...body }),
}) as never);

describe('POST /api/v1/wallet/spend, the SKUs it may sell', () => {
  beforeEach(() => {
    m.session = { user: { id: 'u1' } };
    m.findUnique.mockClear();
    m.touched.length = 0;
  });

  it('refuses every SKU that is delivered by another route with 403, without touching the wallet', async () => {
    const refused = Object.keys(CATALOG).filter((id) => !SPEND_ROUTE_SKUS.has(id));
    expect(refused.length).toBeGreaterThan(20); // wearables, boosts, kits, plans, sessions, the slot
    for (const id of refused) {
      const res = await post(id);
      expect(res.status, id).toBe(403);
      expect(await res.json(), id).toEqual({ error: 'not_sold_here' });
    }
    expect(m.findUnique).not.toHaveBeenCalled();
    expect(m.touched).toEqual([]);
  });

  // Owner decision 2026-09-24: the three SKUs nothing read were deleted from the catalog, so they are unknown here now.
  it('answers the three deleted SKUs as unknown, 404, without touching the wallet', async () => {
    for (const id of ['dunk_retry_token', 'dunk_style_slot', 'scan_personalized']) {
      expect(CATALOG[id], id).toBeUndefined();
      const res = await post(id);
      expect(res.status, id).toBe(404);
      expect(await res.json(), id).toEqual({ error: 'unknown_sku' });
    }
    expect(m.findUnique).not.toHaveBeenCalled();
    expect(m.touched).toEqual([]);
  });

  it('passes a held class pass through to spend(), which refuses it after the idempotency lookup and before any write', async () => {
    const res = await post('class_pass_single');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'not_on_sale' });
    expect(m.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'k_class_pass_single' } });
    expect(m.touched).toEqual([]);
  });

  it('still answers an unknown SKU with 404, a missing key with 400 and no session with 401', async () => {
    expect((await post('no_such_sku')).status).toBe(404);
    expect((await post('boost_card_neural-max', { idempotency_key: '' })).status).toBe(400);
    m.session = null;
    expect((await post('boost_card_neural-max')).status).toBe(401);
  });
});
