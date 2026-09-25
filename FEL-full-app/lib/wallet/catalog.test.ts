import { describe, expect, it, vi } from 'vitest';
import { CATALOG, NOT_ON_SALE, SPEND_ROUTE_SKUS, getSku, skuOnSale } from './catalog';
import { spend, WalletError } from './wallet-service';

// /live sold class passes for shards with no video player behind them, and nothing reads the class_monthly
// entitlement. Owner decision 2026-09-24: refuse the sale now. The SKUs stay registered (price and all) so the
// change is one set away from being undone.
describe('SKUs held off sale', () => {
  it('holds both /live class passes, and they are still registered at their price', () => {
    for (const id of ['class_pass_single', 'class_monthly']) {
      expect(NOT_ON_SALE.has(id), id).toBe(true);
      expect(getSku(id), id).not.toBeNull();
      expect(skuOnSale(id), id).toBe(false);
    }
  });

  it('holds only SKUs that exist, so a typo cannot silently leave the real SKU on sale', () => {
    for (const id of NOT_ON_SALE) expect(CATALOG[id], id).toBeDefined();
  });

  it('holds nothing else (spend() still sells through the routes that deliver), and an unknown SKU is not on sale', () => {
    expect(skuOnSale('workout_plan_4w')).toBe(true); // sold by /api/v1/workout/plan, which writes the plan
    expect(skuOnSale('private_1on1')).toBe(true); // sold by /api/v1/sessions/book, which writes the booking
    expect(skuOnSale('no_such_sku')).toBe(false);
  });
});

// POST /api/v1/wallet/spend grants a PlayerEntitlement row and nothing else. /store called it for every SKU on sale, and
// 24 of those 30 delivered nothing that way. The route now sells only SPEND_ROUTE_SKUS (spend-route.test.ts runs it).
describe('what the generic spend route may sell', () => {
  it('is only the /live class passes, both held, so today it sells nothing', () => {
    expect([...SPEND_ROUTE_SKUS].sort()).toEqual(['class_monthly', 'class_pass_single']);
    for (const id of SPEND_ROUTE_SKUS) expect(CATALOG[id], id).toBeDefined();
    // Tripwire: a SKU that leaves NOT_ON_SALE is sold here for an entitlement row. Before it leaves, make something
    // read that row (for a class pass: a player that checks the pass), then update this line.
    for (const id of SPEND_ROUTE_SKUS) expect(NOT_ON_SALE.has(id), id).toBe(true);
  });

  it('leaves every SKU that another route delivers off it', () => {
    for (const id of [
      'workout_plan_4w', 'workout_program_12w', 'session_group_workout', 'seminar_seat', 'private_1on1',
      'creative_card_slot', 'music_cell_assist', 'boost_card_neural-max', 'top_lab',
    ]) {
      expect(CATALOG[id], id).toBeDefined();
      expect(SPEND_ROUTE_SKUS.has(id), id).toBe(false);
    }
  });
});

// Owner decision 2026-09-24: the three SKUs nothing ever read are deleted from the catalog, not just kept off sale.
// Old ledger rows and entitlements still carry these ids; nothing in the catalog does.
const DELETED = ['dunk_retry_token', 'dunk_style_slot', 'scan_personalized'];

describe('the SKUs nothing read', () => {
  it('are gone from the catalog: unknown, not on sale, not held, not on the spend route', () => {
    for (const id of DELETED) {
      expect(CATALOG[id], id).toBeUndefined();
      expect(getSku(id), id).toBeNull();
      expect(skuOnSale(id), id).toBe(false);
      expect(NOT_ON_SALE.has(id), id).toBe(false);
      expect(SPEND_ROUTE_SKUS.has(id), id).toBe(false);
    }
  });

  it('spend() refuses each as an unknown SKU before it reads anything, even a retried key', async () => {
    const db = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return undefined; // not a thenable
        throw new Error(`spend touched prisma.${String(prop)}`);
      },
    }) as never;
    for (const skuId of DELETED) {
      const err = await spend(db, { playerId: 'p1', idempotencyKey: `k_${skuId}`, skuId, quantity: 1 })
        .then(() => null, (e: unknown) => e);
      expect(err, skuId).toBeInstanceOf(WalletError);
      expect((err as WalletError).code, skuId).toBe('UNKNOWN_SKU');
    }
  });
});

// A stand-in database that answers the idempotency lookup and throws on anything else: any balance read, any
// transaction, any write fails the test, so what spend() returns is decided before it could move a shard.
function lookupOnly(prior: unknown) {
  const findUnique = vi.fn(async () => prior);
  const db = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'walletLedgerEntry') return { findUnique };
      if (prop === 'then') return undefined; // not a thenable
      throw new Error(`spend touched prisma.${String(prop)}`);
    },
  }) as never;
  return { db, findUnique };
}

describe('spend() and a held SKU', () => {
  it('refuses a new purchase of a held SKU after only the idempotency lookup, before any read or write of a balance', async () => {
    for (const skuId of NOT_ON_SALE) {
      const { db, findUnique } = lookupOnly(null);
      const err = await spend(db, { playerId: 'p1', idempotencyKey: `k_${skuId}`, skuId, quantity: 1 })
        .then(() => null, (e: unknown) => e);
      expect(err, skuId).toBeInstanceOf(WalletError);
      expect((err as WalletError).code).toBe('NOT_ON_SALE');
      expect(findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: `k_${skuId}` } });
    }
  });

  // Owner decision 2026-09-25: every pass charge is paid back by the wallet's sweep once it is older than the sweep's
  // grace (lib/wallet/dead-buys.ts). A retry seconds after the click is still answered with its receipt; the same key
  // minutes later is refused, or the player would keep the receipt and the refund both.
  it('a retried key of a pass bought before the hold gets its original receipt back inside the grace, and a refusal after it', async () => {
    const KEY = '3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f'; // what the browser makes
    const stand = (createdAt: Date) => {
      // the player's own charge of this same SKU, and no refund of it
      const prior = {
        id: 'entry_1', walletId: 'w1', currency: 'shards', delta: BigInt(-40), reasonCode: 'SPEND_CATALOG_ITEM', idempotencyKey: KEY,
        metadata: { skuId: 'class_pass_single', quantity: 1, unitPrice: 40 }, createdAt,
      };
      const wallet = { id: 'w1', coins: BigInt(5), shards: BigInt(60), lc: BigInt(0), version: BigInt(3), updatedAt: new Date(0) };
      return {
        walletLedgerEntry: { findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => (where.idempotencyKey === KEY ? prior : null)) },
        wallet: { findUnique: vi.fn(async () => wallet), create: vi.fn(), updateMany: vi.fn() },
        $transaction: vi.fn(async () => { throw new Error('a replay must not open a transaction'); }),
      };
    };
    const fresh = stand(new Date(Date.now() - 5_000));
    const res = await spend(fresh as never, { playerId: 'p1', idempotencyKey: KEY, skuId: 'class_pass_single', quantity: 1 });
    expect(res).toEqual({ spent: { currency: 'shards', amount: 40 }, balances: { coins: 5, shards: 60, lc: 0 }, entry_id: 'entry_1' });
    expect(fresh.$transaction).not.toHaveBeenCalled();
    expect(fresh.wallet.updateMany).not.toHaveBeenCalled();
    const stale = stand(new Date(Date.now() - 11 * 60_000));
    await expect(spend(stale as never, { playerId: 'p1', idempotencyKey: KEY, skuId: 'class_pass_single', quantity: 1 })).rejects.toMatchObject({ code: 'REPLAYED_KEY' });
    expect(stale.$transaction).not.toHaveBeenCalled();
    expect(stale.wallet.updateMany).not.toHaveBeenCalled();
  });
});
