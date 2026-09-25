import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARD_CATALOG, getCardById } from '@/lib/card-catalog';
import { SHOP_CARDS, SHOP_CARDS_ON_SALE, shopCardOnSale } from '@/lib/game-data';
import { ShopView, hollowOwnedShopCards } from './shop-view';

// /shop sold eight Lab-Credit cards whose keys are not catalog card ids. lib/entitlements.ts reads only catalog ids, so
// every purchase took LC and unlocked nothing. Owner decision 2026-09-24: refuse the sale, no redesign, no automatic
// refund. The route below runs for real; only its session, database and wallet are stand-ins that record what it did.
const m = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as unknown,
  findUnique: vi.fn(async () => null),
  create: vi.fn(async () => ({})),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ cardOwnership: { create: vi.fn(async () => ({})) } })),
  applyLc: vi.fn(async () => ({ entryId: 'e1', delta: -80, balanceAfter: 20, replayed: false })),
  getOrCreateProfile: vi.fn(async () => ({})),
  onSale: null as null | ((key: string) => boolean),
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => m.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: { cardOwnership: { findUnique: m.findUnique, create: m.create }, $transaction: m.transaction } }));
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: m.getOrCreateProfile }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: m.applyLc, WalletError: class WalletError extends Error {} }));
// The route's gate, with a switch a test can flip to prove the refusal comes from the gate and nothing else.
vi.mock('@/lib/game-data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/game-data')>();
  return { ...real, shopCardOnSale: (key: string, set?: ReadonlySet<string>) => (m.onSale ? m.onSale(key) : real.shopCardOnSale(key, set)) };
});

import { POST } from '@/app/api/shop/purchase/route';

const post = (cardKey: string) => POST(new Request('http://fel.test/api/shop/purchase', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardKey }),
}));

describe('/api/shop/purchase, the cards that unlock nothing', () => {
  beforeEach(() => { vi.clearAllMocks(); m.onSale = null; });

  it('refuses every current card with 409 not_on_sale, and moves no LC and writes no ownership', async () => {
    for (const c of SHOP_CARDS) {
      const res = await post(c.key);
      expect(res.status, c.key).toBe(409);
      expect(await res.json(), c.key).toMatchObject({ code: 'not_on_sale' });
    }
    expect(m.applyLc).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.findUnique).not.toHaveBeenCalled();
  });

  it('the refusal is the on-sale gate: with the gate open the same request reaches the purchase', async () => {
    m.onSale = () => true;
    const res = await post('drill-jab-flow');
    expect(res.status).toBe(200);
    expect(m.applyLc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ delta: -80, reasonCode: 'SHOP_PURCHASE' }));
  });

  it('still answers an unknown card with 400', async () => {
    expect((await post('no-such-card')).status).toBe(400);
  });
});

describe('what goes on sale, and who decides', () => {
  it('none of the eight /shop cards is on sale', () => {
    expect(SHOP_CARDS).toHaveLength(8);
    for (const c of SHOP_CARDS) expect(shopCardOnSale(c.key), c.key).toBe(false);
  });

  it('a key that matches a catalog card is NOT on sale by that alone: only the explicit list sells', () => {
    const id = CARD_CATALOG[0].id;
    expect(shopCardOnSale(id)).toBe(false);
    expect(shopCardOnSale(id, new Set([id]))).toBe(true);
  });

  it('even an explicitly listed card is refused if its key unlocks nothing (not a catalog id)', () => {
    expect(shopCardOnSale('drill-jab-flow', new Set(['drill-jab-flow']))).toBe(false);
    expect(shopCardOnSale('', new Set(['']))).toBe(false);
  });

  it('anything added to the list is a /shop card, a catalog card, and priced as /cards prices it', () => {
    for (const key of SHOP_CARDS_ON_SALE) {
      const shop = SHOP_CARDS.find((c) => c.key === key);
      expect(shop, key).toBeDefined();
      expect(getCardById(key), key).toBeDefined();
      expect(shop!.price, key).toBe(getCardById(key)!.costLC);
    }
  });
});

describe('/shop, the page', () => {
  it('shows every card NOT ON SALE YET, with its button disabled and no LC price on it', () => {
    const html = renderToStaticMarkup(createElement(ShopView));
    expect(html.match(/NOT ON SALE YET<\/button>/g)).toHaveLength(SHOP_CARDS.length);
    expect(html.match(/<button disabled=""/g)).toHaveLength(SHOP_CARDS.length);
    expect(html).not.toMatch(/\d+<!-- --> LC<\/button>/);
    expect(html).toMatch(/won&#x27;t take Lab Credits/);
    expect(html).toMatch(/href="\/cards"/);
    expect(html).not.toMatch(/You own/); // nobody owns anything yet: no owner notice
  });

  it('keeps every card unbuyable for a player who can afford all of them, so the gate is not the price', () => {
    const rich = 10_000;
    expect(Math.max(...SHOP_CARDS.map((c) => c.price))).toBeLessThan(rich);
    const html = renderToStaticMarkup(createElement(ShopView, { initialCredits: rich }));
    expect(html).toMatch(/10000(<!-- -->)? LC/); // the balance really is rich on this render
    expect(html.match(/<button disabled=""[^>]*>NOT ON SALE YET<\/button>/g)).toHaveLength(SHOP_CARDS.length);
    expect(html).not.toMatch(/\d+<!-- --> LC<\/button>/);
  });

  it('an owner of a hollow card sees it unlocks nothing yet and that the payment is on record, and is not refunded', () => {
    const html = renderToStaticMarkup(createElement(ShopView, { initialCredits: 20, initialOwned: ['drill-jab-flow'] }));
    expect(html).toContain('OWNED · UNLOCKS NOTHING YET');
    expect(html.match(/OWNED · UNLOCKS NOTHING YET/g)).toHaveLength(1);
    expect(html).toContain('You own a card from before this shop stopped selling them. It unlocks nothing yet.');
    expect(html).toMatch(/Your payment is on record/);
    expect(html).not.toMatch(/refund|safe/i); // no refund promised, and no "safe" to read as one

    expect(html.match(/NOT ON SALE YET<\/button>/g)).toHaveLength(SHOP_CARDS.length - 1);
  });

  it('counts several hollow cards, and ignores keys that are not /shop cards', () => {
    expect(hollowOwnedShopCards(['drill-jab-flow', 'avatar-neon-gi', CARD_CATALOG[0].id, 'junk'])).toEqual(['drill-jab-flow', 'avatar-neon-gi']);
    const html = renderToStaticMarkup(createElement(ShopView, { initialOwned: ['drill-jab-flow', 'avatar-neon-gi'] }));
    expect(html).toContain('You own 2 cards from before this shop stopped selling them. They unlock nothing yet.');
  });
});
