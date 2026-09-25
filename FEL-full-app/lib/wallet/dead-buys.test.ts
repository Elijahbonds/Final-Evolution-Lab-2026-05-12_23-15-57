import { describe, expect, it } from 'vitest';
import { CATALOG, SPEND_ROUTE_SKUS } from './catalog';
import { SHOP_CARDS, shopCardOnSale } from '@/lib/game-data';
import { REASON } from './reward-rules';
import {
  DEAD_CATALOG_BUYS, HOLLOW_SHOP_CARDS, PLAN_CLAIM_WINDOW_MS,
  deadBuyOf, firstChargeIds, isClientMadeKey, refundKey, refundNote, refundToastTexts, refundableDeadBuys, refundedRowIds, shopPurchaseKey,
  unclaimed, unseenRefundNotes,
  type DeadBuyRow, type DeliveryEvidence,
} from './dead-buys';

// Owner decision 2026-09-24: refund every purchase that took a balance and delivered nothing. This file pins WHICH
// purchases those are (traced against 71ea8f30, the tree before hotfix 6/6) and how each is told apart from a purchase
// of the same item that did deliver. The sweep that writes the refunds is dead-buy-refunds.test.ts.

const UUID = '3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f';
const T0 = Date.parse('2026-09-21T12:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000);
let seq = 0;
const row = (over: Partial<DeadBuyRow> & { sku?: string } = {}): DeadBuyRow => {
  const { sku, ...rest } = over;
  return {
    id: `row_${++seq}`, currency: 'coins', delta: -300, reasonCode: REASON.SPEND_CATALOG_ITEM,
    idempotencyKey: UUID, metadata: { skuId: sku ?? 'cap_nexus', quantity: 1, unitPrice: 300 }, createdAt: at(0), ...rest,
  };
};
const NONE: DeliveryEvidence = { wearables: [], bookings: [], plans: [], oldestScanAt: null, firstCharges: new Map() };
const buy = (r: DeadBuyRow, player = 'p1') => deadBuyOf(r, player)!;

describe('the refundable set', () => {
  // The 24 SKUs /store sold through the generic spend route that delivered nothing (hotfix 6/6's economy trace), and
  // the six boost cards, whose first charge delivered and whose later /store charges did not.
  const EXPECTED = [
    'dunk_retry_token', 'dunk_style_slot', 'scan_personalized', 'creative_card_slot',
    'music_kit_neon', 'music_kit_dust', 'music_cell_assist',
    'workout_plan_4w', 'workout_program_12w', 'session_group_workout', 'seminar_seat', 'private_1on1',
    'cap_nexus', 'band_flow', 'top_lab', 'top_bonds', 'top_baseball', 'top_football',
    'shorts_court', 'shorts_glitch', 'shoes_evo', 'shoes_flight', 'acc_chain', 'acc_sleeve',
  ];
  const BOOSTS = Object.keys(CATALOG).filter((s) => s.startsWith('boost_card_'));

  it('is exactly the 24 dead /store SKUs plus the six boost cards, keyed on raw SKU strings', () => {
    expect(BOOSTS).toHaveLength(6);
    expect(Object.keys(DEAD_CATALOG_BUYS).sort()).toEqual([...EXPECTED, ...BOOSTS].sort());
  });

  it('keeps the three SKUs the catalog is deleting, because old ledger rows still carry them', () => {
    // keyed on the raw string, so it holds whether or not CATALOG still lists them
    for (const sku of ['dunk_retry_token', 'dunk_style_slot', 'scan_personalized']) {
      expect(DEAD_CATALOG_BUYS[sku], sku).toMatchObject({ match: 'client_key' });
    }
  });

  it('lists every boost card for its later charges only (first_charge), and leaves out what is held (the class passes)', () => {
    for (const sku of BOOSTS) expect(DEAD_CATALOG_BUYS[sku], sku).toMatchObject({ match: 'first_charge', currency: 'shards' });
    expect(DEAD_CATALOG_BUYS.class_pass_single).toBeUndefined();
    expect(DEAD_CATALOG_BUYS.class_monthly).toBeUndefined();
  });

  it('charges each SKU in the currency the catalog charges it in', () => {
    const was: Record<string, string> = { dunk_retry_token: 'coins', dunk_style_slot: 'shards', scan_personalized: 'shards' };
    for (const [sku, d] of Object.entries(DEAD_CATALOG_BUYS)) expect(d.currency, sku).toBe(CATALOG[sku]?.currency ?? was[sku]);
  });

  it('gives every SKU a reason and a name, and every delivered-elsewhere SKU what its delivering route writes', () => {
    for (const [sku, d] of Object.entries(DEAD_CATALOG_BUYS)) {
      expect(d.why.length, sku).toBeGreaterThan(10);
      expect(d.name.length, sku).toBeGreaterThan(2);
      if (d.match === 'session' || d.match === 'workout_plan') expect(d.deliveredAs, sku).toBeTruthy();
    }
  });

  it('cannot grow: the generic spend route refuses every one of them today (403 or unknown)', () => {
    for (const sku of Object.keys(DEAD_CATALOG_BUYS)) expect(SPEND_ROUTE_SKUS.has(sku), sku).toBe(false);
  });

  it('lists the eight /shop cards by name, none of which is on sale', () => {
    expect(Object.keys(HOLLOW_SHOP_CARDS).sort()).toEqual(SHOP_CARDS.map((c) => c.key).sort());
    for (const c of SHOP_CARDS) {
      expect(HOLLOW_SHOP_CARDS[c.key].name, c.key).toBe(c.name);
      expect(shopCardOnSale(c.key), c.key).toBe(false);
    }
  });
});

describe('what the row itself proves', () => {
  it('knows the keys the browser made from the keys a server route composed', () => {
    expect(isClientMadeKey(UUID)).toBe(true);
    expect(isClientMadeKey('k_1758456000000_4fzyo82mvyr')).toBe(true);
    for (const k of ['music:p1:music_kit_neon', 'music:p1:music_cell_assist:abc', 'card_slot:p1_1758456000000', 'boost_card:p1:neural-max', 'shop:p1:drill-jab-flow', 'k_old', '']) {
      expect(isClientMadeKey(k), k).toBe(false);
    }
  });

  it('takes a /store charge of a dead SKU, for exactly what it took', () => {
    expect(buy(row({ delta: -300 }))).toMatchObject({ amount: 300, currency: 'coins', name: 'Nexus Visor', item: 'cap_nexus', match: 'wearable' });
    expect(buy(row({ sku: 'seminar_seat', currency: 'shards', delta: -500 }))).toMatchObject({ amount: 500, currency: 'shards', deliveredAs: 'seminar' });
  });

  it('refuses a delivering route\'s key, a credit, a live SKU, a currency mismatch and another reason', () => {
    expect(deadBuyOf(row({ sku: 'music_kit_neon', currency: 'shards', delta: -200, idempotencyKey: 'music:p1:music_kit_neon' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ sku: 'creative_card_slot', currency: 'shards', delta: -200, idempotencyKey: 'card_slot:p1_17584' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ delta: 300 }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ delta: 0 }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ sku: 'boost_card_neural-max', currency: 'shards', delta: -400, idempotencyKey: 'boost_card:p1:neural-max' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ sku: 'class_monthly', currency: 'shards', delta: -300 }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ currency: 'shards' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ reasonCode: 'ARENA_ENTRY' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ metadata: null }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ metadata: { skuId: 'constructor' } }), 'p1')).toBeNull();
  });

  it('takes a /shop card only from its own buyer\'s key', () => {
    const shop = row({ reasonCode: 'SHOP_PURCHASE', currency: 'lc', delta: -80, idempotencyKey: 'shop:p1:drill-jab-flow', metadata: { cardKey: 'drill-jab-flow' } });
    expect(buy(shop)).toMatchObject({ amount: 80, currency: 'lc', item: 'drill-jab-flow', name: 'Jab Flow Drill', match: 'shop_card' });
    expect(deadBuyOf(shop, 'p2')).toBeNull();
    expect(deadBuyOf({ ...shop, idempotencyKey: 'shop:p1:some-real-card' }, 'p1')).toBeNull();
    expect(deadBuyOf({ ...shop, currency: 'coins' }, 'p1')).toBeNull();
  });

  it('a /shop sale after a refunded one is keyed after that row, and never reads as a hollow card', () => {
    expect(shopPurchaseKey('p1', 'drill-jab-flow')).toBe('shop:p1:drill-jab-flow');
    expect(shopPurchaseKey('p1', 'drill-jab-flow', 'row_9')).toBe('shop:p1:drill-jab-flow:after-refund:row_9');
    const again = row({ reasonCode: 'SHOP_PURCHASE', currency: 'lc', delta: -80, idempotencyKey: shopPurchaseKey('p1', 'drill-jab-flow', 'row_9') });
    expect(deadBuyOf(again, 'p1')).toBeNull();
  });

  it('reads which rows already have a refund off the refund keys', () => {
    const refund = row({ reasonCode: REASON.DEAD_BUY_REFUND, delta: 300, idempotencyKey: refundKey('row_a') });
    expect([...refundedRowIds([refund, row()])]).toEqual(['row_a']);
    expect(refundKey('row_a')).toBe('refund:row_a');
  });
});

describe('telling a dead buy from a delivered one', () => {
  it('a delivery claims the latest row at or before it, and a later purchase never moves an earlier claim', () => {
    const a = { row: { createdAt: at(0) } }, b = { row: { createdAt: at(10) } }, c = { row: { createdAt: at(20) } };
    expect(unclaimed([a, b, c], [at(11)])).toEqual([a, c]);
    expect(unclaimed([a, b, c], [at(11), at(21)])).toEqual([a]);
    expect(unclaimed([a, b], [at(11)])).toEqual(unclaimed([a, b, c], [at(11), at(21)]));   // c and its delivery added later
    expect(unclaimed([a], [at(-1)])).toEqual([a]);                                            // nothing before it to claim
    expect(unclaimed([a, b], [at(11)], 60_000)).toEqual([a]);                                 // b is inside the window
    expect(unclaimed([a, b], [at(15)], 60_000)).toEqual([a, b]);                              // b is outside it
  });

  it('a wearable: the /store buy before the Closet buy is refunded, the Closet buy is not', () => {
    const store = buy(row({ createdAt: at(0) }));
    const closet = buy(row({ createdAt: at(30) }));
    const owned = { ...NONE, wearables: [{ itemId: 'cap_nexus', acquiredAt: new Date(at(30).getTime() + 40) }] };
    expect(refundableDeadBuys([store, closet], owned)).toEqual([store]);
    expect(refundableDeadBuys([closet], owned)).toEqual([]);
    expect(refundableDeadBuys([store], NONE)).toEqual([store]);
    // owning a DIFFERENT item claims nothing
    expect(refundableDeadBuys([store], { ...NONE, wearables: [{ itemId: 'top_lab', acquiredAt: at(1) }] })).toEqual([store]);
  });

  it('a session: each booking claims its own charge, and a charge with no booking is refunded', () => {
    const mk = (min: number) => buy(row({ sku: 'session_group_workout', currency: 'shards', delta: -150, createdAt: at(min) }));
    const store = mk(0), booked1 = mk(60), booked2 = mk(120);
    const ev = { ...NONE, bookings: [{ kind: 'group_workout', createdAt: at(60.01) }, { kind: 'group_workout', createdAt: at(120.01) }] };
    expect(refundableDeadBuys([store, booked1, booked2], ev)).toEqual([store]);
    // a booking of another kind is not this SKU's delivery
    expect(refundableDeadBuys([booked1], { ...NONE, bookings: [{ kind: 'private_1on1', createdAt: at(60.01) }] })).toEqual([booked1]);
  });

  it('a workout plan is refunded only with proof that nothing was erased since it was bought', () => {
    const mk = (min: number) => buy(row({ sku: 'workout_plan_4w', currency: 'shards', delta: -60, createdAt: at(min) }));
    const store = mk(0);
    // no plan and no scan on file: the plan may have been delivered and erased by delete-my-data, so no refund
    expect(refundableDeadBuys([store], NONE)).toEqual([]);
    // a scan made before the buy is still here, so nothing was erased since: the buy delivered nothing
    expect(refundableDeadBuys([store], { ...NONE, oldestScanAt: at(-5) })).toEqual([store]);
    // only a scan made AFTER the buy: proves nothing about before it
    expect(refundableDeadBuys([store], { ...NONE, oldestScanAt: at(5) })).toEqual([]);
    // the Workout buy claims its plan; the earlier /store buy is proven dead by an older plan still on file
    const workout = mk(30);
    const ev = { ...NONE, plans: [{ tier: 'plan_4w', createdAt: at(-60) }, { tier: 'plan_4w', createdAt: at(30.02) }] };
    expect(refundableDeadBuys([store, workout], ev)).toEqual([store]);
    // a plan claims only a charge made just before it
    expect(refundableDeadBuys([store], { ...NONE, oldestScanAt: at(-5), plans: [{ tier: 'plan_4w', createdAt: new Date(at(0).getTime() + PLAN_CLAIM_WINDOW_MS + 1) }] })).toEqual([store]);
  });

  it('a boost card: the earliest charge of it delivered, whatever its key; a later /store charge did not', () => {
    const mk = (min: number, key = UUID, id?: string) => row({ ...(id ? { id } : {}), sku: 'boost_card_neural-max', currency: 'shards', delta: -400, createdAt: at(min), idempotencyKey: key });
    const profile = mk(0, 'boost_card:p1:neural-max'), store1 = mk(10), store2 = mk(20);
    const ev = (rows: DeadBuyRow[]) => ({ ...NONE, firstCharges: firstChargeIds(rows) });
    // the Profile's buy delivered, so both /store charges after it are refunded (the Profile's own row is never a candidate)
    expect(deadBuyOf(profile, 'p1')).toBeNull();
    expect(refundableDeadBuys([buy(store1), buy(store2)], ev([profile, store1, store2])).map((b) => b.row)).toEqual([store1, store2]);
    // two /store tabs: the first charge delivered, the second is refunded
    expect(refundableDeadBuys([buy(store1), buy(store2)], ev([store1, store2])).map((b) => b.row)).toEqual([store2]);
    // one charge alone delivered
    expect(refundableDeadBuys([buy(store1)], ev([store1]))).toEqual([]);
    // no earliest known: nothing is refunded
    expect(refundableDeadBuys([buy(store2)], NONE)).toEqual([]);
    // a tie on time goes to the lower id, and a credit or another reason is never a charge
    const a = mk(30, UUID, 'row_a'), b = mk(30, UUID, 'row_b');
    expect(firstChargeIds([b, a]).get('boost_card_neural-max')).toBe('row_a');
    expect(firstChargeIds([row({ sku: 'boost_card_neural-max', delta: 400 }), row({ sku: 'boost_card_neural-max', reasonCode: 'ARENA_ENTRY' })]).size).toBe(0);
  });

  it('a client-key SKU and a /shop card need no evidence at all', () => {
    const token = buy(row({ sku: 'dunk_retry_token', delta: -50 }));
    const kit = buy(row({ sku: 'music_kit_dust', currency: 'shards', delta: -400 }));
    const card = buy(row({ reasonCode: 'SHOP_PURCHASE', currency: 'lc', delta: -250, idempotencyKey: 'shop:p1:avatar-neon-gi' }));
    expect(refundableDeadBuys([token, kit, card], NONE)).toEqual([token, kit, card]);
  });
});

describe('the note the player reads', () => {
  it('says what came back, for what, and why, in plain words', () => {
    expect(refundNote(300, 'coins', 'Nexus Visor')).toBe("We refunded 300 coins for Nexus Visor: it didn't deliver anything. Sorry about that.");
    expect(refundNote(900, 'shards', 'Private 1-on-1 session')).toBe("We refunded 900 shards for Private 1-on-1 session: it didn't deliver anything. Sorry about that.");
    expect(refundNote(80, 'lc', 'Jab Flow Drill')).toBe("We refunded 80 Lab Credits for Jab Flow Drill: it didn't deliver anything. Sorry about that.");
    expect(refundNote(1, 'shards', 'Dunk Style Slot')).toBe("We refunded 1 shard for Dunk Style Slot: it didn't deliver anything. Sorry about that.");
    expect(refundNote(1200, 'coins', 'X')).toContain('1,200 coins');
  });

  it('is shown once per device: seen ids are skipped, the rest come oldest first', () => {
    const notes = [
      { id: 'e2', text: 'second', at: '2026-09-25T10:00:00.000Z' },
      { id: 'e1', text: 'first', at: '2026-09-25T09:00:00.000Z' },
    ];
    expect(unseenRefundNotes(notes, new Set()).map((n) => n.id)).toEqual(['e1', 'e2']);
    expect(unseenRefundNotes(notes, new Set(['e1'])).map((n) => n.id)).toEqual(['e2']);
    expect(unseenRefundNotes([{ id: 5, text: null } as never], new Set())).toEqual([]);
  });

  it('pops each note on its own up to three, and past that one line pointing at the history', () => {
    const n = (i: number) => ({ id: `e${i}`, text: `note ${i}`, at: `2026-09-25T0${i}:00:00.000Z` });
    expect(refundToastTexts([n(1), n(2), n(3)])).toEqual(['note 1', 'note 2', 'note 3']);
    expect(refundToastTexts([n(1), n(2), n(3), n(4)])).toEqual([
      "We refunded 4 purchases that didn't deliver anything. Your wallet history lists each one. Sorry about that.",
    ]);
    expect(refundToastTexts([])).toEqual([]);
  });
});
