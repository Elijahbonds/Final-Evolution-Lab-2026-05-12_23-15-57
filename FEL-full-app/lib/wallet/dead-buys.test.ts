import { describe, expect, it } from 'vitest';
import { CATALOG, NOT_ON_SALE, SPEND_ROUTE_SKUS } from './catalog';
import { SHOP_CARDS, shopCardOnSale } from '@/lib/game-data';
import { REASON } from './reward-rules';
import {
  BOOKING_SKU, CLASS_PASS_REASON, DEAD_CATALOG_BUYS, HOLLOW_SHOP_CARDS, NO_LINK_REASON, PLAN_CLAIM_WINDOW_MS,
  bookingCharges, bookingName, bookingRefundAmount, bookingRefundNote, deadBuyOf, endedBookings, firstChargeIds, isClientMadeKey,
  linkedSlotsFor, refundKey, refundNote, refundToastTexts, refundableDeadBuys, refundedRowIds, shopPurchaseKey, unclaimed,
  unlinkedBookings, unseenRefundNotes,
  type BookingRow, type DeadBuyRow, type DeliveryEvidence,
} from './dead-buys';

// Owner decision 2026-09-24: refund every purchase that took a balance and delivered nothing. This file pins WHICH
// purchases those are (traced against 71ea8f30, the tree before hotfix 6/6) and how each is told apart from a purchase
// of the same item that did deliver. Owner additions 2026-09-25: the class passes, plans without the erased-plan
// proof, and a booked session that ended with no join link. The sweep that writes the refunds is
// dead-buy-refunds.test.ts.

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
const NONE: DeliveryEvidence = { wearables: [], plans: [], firstCharges: new Map(), bookedCharges: new Set() };
const buy = (r: DeadBuyRow, player = 'p1') => deadBuyOf(r, player)!;

describe('the refundable set', () => {
  // The 24 SKUs /store sold through the generic spend route that delivered nothing (hotfix 6/6's economy trace), the
  // six boost cards, whose first charge delivered and whose later /store charges did not, and (2026-09-25) the two
  // class passes /live sold through the same route.
  const EXPECTED = [
    'dunk_retry_token', 'dunk_style_slot', 'scan_personalized', 'creative_card_slot',
    'music_kit_neon', 'music_kit_dust', 'music_cell_assist',
    'workout_plan_4w', 'workout_program_12w', 'session_group_workout', 'seminar_seat', 'private_1on1',
    'cap_nexus', 'band_flow', 'top_lab', 'top_bonds', 'top_baseball', 'top_football',
    'shorts_court', 'shorts_glitch', 'shoes_evo', 'shoes_flight', 'acc_chain', 'acc_sleeve',
  ];
  const PASSES = ['class_pass_single', 'class_monthly'];
  const BOOSTS = Object.keys(CATALOG).filter((s) => s.startsWith('boost_card_'));

  it('is exactly the 24 dead /store SKUs, the two class passes and the six boost cards, keyed on raw SKU strings', () => {
    expect(BOOSTS).toHaveLength(6);
    expect(Object.keys(DEAD_CATALOG_BUYS).sort()).toEqual([...EXPECTED, ...PASSES, ...BOOSTS].sort());
  });

  it('keeps the three SKUs the catalog is deleting, because old ledger rows still carry them', () => {
    // keyed on the raw string, so it holds whether or not CATALOG still lists them
    for (const sku of ['dunk_retry_token', 'dunk_style_slot', 'scan_personalized']) {
      expect(DEAD_CATALOG_BUYS[sku], sku).toMatchObject({ match: 'client_key' });
    }
  });

  it('lists every boost card for its later charges only (first_charge)', () => {
    for (const sku of BOOSTS) expect(DEAD_CATALOG_BUYS[sku], sku).toMatchObject({ match: 'first_charge', currency: 'shards' });
  });

  // Owner decision 2026-09-25: the passes were held, not refunded, on the 24th. Now every charge of one comes back,
  // its entitlement row goes with it, and it says why in its own words. Both stay held until a class can be watched.
  it('lists both class passes: every browser-keyed charge, the entitlement taken back, a reason of their own, still held', () => {
    for (const sku of PASSES) {
      expect(DEAD_CATALOG_BUYS[sku], sku).toMatchObject({ match: 'client_key', currency: 'shards', undo: 'entitlement', reason: CLASS_PASS_REASON });
      expect(NOT_ON_SALE.has(sku), sku).toBe(true);
    }
    expect(DEAD_CATALOG_BUYS.class_pass_single.name).toBe('Single Class Pass');
    expect(DEAD_CATALOG_BUYS.class_monthly.name).toBe('Monthly All-Access Pass');
    // nothing else takes an entitlement back or has its own reason
    for (const [sku, d] of Object.entries(DEAD_CATALOG_BUYS)) {
      if (!PASSES.includes(sku)) { expect(d.undo, sku).toBeUndefined(); expect(d.reason, sku).toBeUndefined(); }
    }
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

  it('cannot grow: the generic spend route refuses every one of them today (403, unknown, or held before any write)', () => {
    for (const sku of Object.keys(DEAD_CATALOG_BUYS)) expect(!SPEND_ROUTE_SKUS.has(sku) || NOT_ON_SALE.has(sku), sku).toBe(true);
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
    expect(deadBuyOf(row({ currency: 'shards' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ reasonCode: 'ARENA_ENTRY' }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ metadata: null }), 'p1')).toBeNull();
    expect(deadBuyOf(row({ metadata: { skuId: 'constructor' } }), 'p1')).toBeNull();
  });

  it('takes a class pass charge, whichever pass, for what it took, with its entitlement to take back and its own reason', () => {
    expect(buy(row({ sku: 'class_monthly', currency: 'shards', delta: -300 })))
      .toMatchObject({ amount: 300, currency: 'shards', item: 'class_monthly', match: 'client_key', undo: 'entitlement', reason: CLASS_PASS_REASON });
    expect(buy(row({ sku: 'class_pass_single', currency: 'shards', delta: -40, idempotencyKey: 'k_1758456000000_4fzyo82mvyr' })))
      .toMatchObject({ amount: 40, item: 'class_pass_single', undo: 'entitlement' });
    // a pass in the wrong currency is not a pass charge; a refunded pass's key replays nothing (dead-buy-refunds.test.ts)
    expect(deadBuyOf(row({ sku: 'class_monthly', currency: 'coins', delta: -300 }), 'p1')).toBeNull();
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
    const mk = (min: number, key = UUID) => row({ sku: 'session_group_workout', currency: 'shards', delta: -150, createdAt: at(min), idempotencyKey: key });
    const store = mk(0), booked1 = mk(60), booked2 = mk(120);
    const ev = (bookings: { id: string; kind: string; createdAt: Date }[], rows: DeadBuyRow[]) =>
      ({ ...NONE, bookedCharges: new Set([...bookingCharges(bookings, rows).values()].map((r) => r.id)) });
    const both = [{ id: 'bk1', kind: 'group_workout', createdAt: at(60.01) }, { id: 'bk2', kind: 'group_workout', createdAt: at(120.01) }];
    expect(refundableDeadBuys([store, booked1, booked2].map((r) => buy(r)), ev(both, [store, booked1, booked2])).map((b) => b.row)).toEqual([store]);
    // a booking of another kind is not this SKU's delivery
    expect(refundableDeadBuys([buy(booked1)], ev([{ id: 'bk1', kind: 'private_1on1', createdAt: at(60.01) }], [booked1]))).toEqual([buy(booked1)]);
    // a booking whose own charge carried a server-shaped key claims that charge, so the older /store charge is still dead
    const server = mk(60, 'mine:1');
    expect(refundableDeadBuys([buy(store)], ev([{ id: 'bk1', kind: 'group_workout', createdAt: at(60.01) }], [store, server])).map((b) => b.row)).toEqual([store]);
  });

  // Owner decision 2026-09-25: no proof that nothing was erased is asked for any more. A charge no plan claims is paid
  // back, a plan that Workout delivered and delete-my-data then erased included.
  it('a workout plan: a charge no plan claims is refunded, with or without a plan or scan on file', () => {
    const mk = (min: number) => buy(row({ sku: 'workout_plan_4w', currency: 'shards', delta: -60, createdAt: at(min) }));
    const store = mk(0);
    expect(refundableDeadBuys([store], NONE)).toEqual([store]);
    // the Workout buy claims its plan (written one request after the charge); the earlier /store buy is paid back
    const workout = mk(30);
    expect(refundableDeadBuys([store, workout], { ...NONE, plans: [{ tier: 'plan_4w', createdAt: at(30.02) }] })).toEqual([store]);
    expect(refundableDeadBuys([workout], { ...NONE, plans: [{ tier: 'plan_4w', createdAt: at(30.02) }] })).toEqual([]);
    // a plan claims only a charge made within PLAN_CLAIM_WINDOW_MS before it, and only a plan of its tier
    expect(refundableDeadBuys([store], { ...NONE, plans: [{ tier: 'plan_4w', createdAt: new Date(at(0).getTime() + PLAN_CLAIM_WINDOW_MS + 1) }] })).toEqual([store]);
    expect(refundableDeadBuys([store], { ...NONE, plans: [{ tier: 'program_12w', createdAt: at(0.02) }] })).toEqual([store]);
    // a booking's claim is not evidence for a plan, and vice versa
    expect(refundableDeadBuys([store], { ...NONE, bookedCharges: new Set([store.row.id]) })).toEqual([store]);
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

// Owner decision 2026-09-25: a CONFIRMED booking whose session is over and whose slot never had a join link is paid
// back. The sweep (dead-buy-refunds.test.ts) reads the rows and the link table; these are the rules it applies.
describe('a booked session that ended with no link', () => {
  // Wed Sep 23 2026 17:30 PT is 00:30Z on the 24th; a private slot Thu Sep 24 16:00 PT is 23:00Z the same day
  const bk = (over: Partial<BookingRow> = {}): BookingRow => ({ id: 'bk1', kind: 'group_workout', sessionKey: 'gw_2026-09-23', shardsPaid: 150, startsAt: new Date('2026-09-24T00:30:00Z'), ...over });
  const NOW = new Date('2026-09-25T18:00:00Z');

  it('tells a session that is over from one still to come by its start and its kind\'s length, and says when the next one ends', () => {
    const over = bk();
    const running = bk({ id: 'bk2', sessionKey: 'gw_2026-09-25', startsAt: new Date(NOW.getTime() - 59 * 60_000) });
    const later = bk({ id: 'bk3', sessionKey: 'gw_2026-09-30', startsAt: new Date(NOW.getTime() + 5 * 86_400_000) });
    const pv = bk({ id: 'bk4', kind: 'private_1on1', sessionKey: 'pv_2026-09-25_09', startsAt: new Date(NOW.getTime() - 46 * 60_000) });
    const { ended, nextEndsAt } = endedBookings([later, running, pv, over], NOW);
    expect(ended.map((b) => b.id)).toEqual(['bk1', 'bk4']);   // a private slot runs 45 min, a group workout 60; oldest first
    expect(nextEndsAt).toBe(running.startsAt.getTime() + 60 * 60_000);
    expect(endedBookings([later], NOW).nextEndsAt).toBe(later.startsAt.getTime() + 60 * 60_000);
    expect(endedBookings([over], NOW)).toEqual({ ended: [over], nextEndsAt: null });
    expect(endedBookings([], NOW)).toEqual({ ended: [], nextEndsAt: null });
    // a booking with no readable start is neither over nor due
    expect(endedBookings([bk({ startsAt: new Date('x') })], NOW)).toEqual({ ended: [], nextEndsAt: null });
  });

  it('a slot that had a link is never paid back, whatever the session was like', () => {
    const a = bk(), b = bk({ id: 'bk2', sessionKey: 'pv_2026-09-24_16', kind: 'private_1on1' });
    expect(unlinkedBookings([a, b], new Set(['gw_2026-09-23']))).toEqual([b]);
    expect(unlinkedBookings([a, b], new Set())).toEqual([a, b]);
    expect(unlinkedBookings([a, b], new Set(['gw_2026-09-23', 'pv_2026-09-24_16']))).toEqual([]);
  });

  it('a slot has a link for this player only if it passes the link rules, and a private slot\'s only for its holder', () => {
    const zoom = 'https://us02web.zoom.us/j/81234567890';
    const links = [
      { sessionKey: 'gw_2026-09-23', url: zoom },
      { sessionKey: 'pv_2026-09-24_16', url: zoom },
      { sessionKey: 'gw_2026-09-18', url: 'javascript:alert(1)' },   // edited by hand: never shown, so never had
    ];
    const holders = new Map([['pv_2026-09-24_16', 'p1']]);
    expect([...linkedSlotsFor('p1', links, holders)]).toEqual(['gw_2026-09-23', 'pv_2026-09-24_16']);
    // a second booker who raced in was never shown the private slot's link: for them it had none
    expect([...linkedSlotsFor('p2', links, holders)]).toEqual(['gw_2026-09-23']);
    expect([...linkedSlotsFor('p2', links, new Map())]).toEqual(['gw_2026-09-23']);
  });

  // Found in review 2026-09-25: a replayed key booked a second slot on one charge's receipt, and each booking was paid
  // back its own shardsPaid. A booking now gets back only the charge it claims, keyed on that charge.
  describe('what a booking is paid back', () => {
    const charge = (id: string, min: number, over: Partial<DeadBuyRow> & { sku?: string } = {}) =>
      row({ id, sku: 'session_group_workout', currency: 'shards', delta: -150, createdAt: at(min), ...over });
    const booking = (id: string, min: number, kind = 'group_workout') => ({ id, kind, createdAt: at(min) });

    it('knows which SKU each kind of booking is charged under', () => {
      expect(Object.fromEntries(BOOKING_SKU)).toEqual({ group_workout: 'session_group_workout', seminar: 'seminar_seat', private_1on1: 'private_1on1' });
    });

    it('one charge backs one booking: the rest of the bookings made on its receipt claim nothing', () => {
      const c = charge('c1', 0, { idempotencyKey: 'mine:1' });
      const claims = bookingCharges([booking('bk3', 2), booking('bk1', 0.01), booking('bk2', 1)], [c]);
      expect([...claims]).toEqual([['bk1', c]]);
    });

    it('each booking claims the latest charge at or before it, whatever the key, the status, or a refund already made', () => {
      const store = charge('c_store', 0), mine = charge('c_mine', 30, { idempotencyKey: 'mine:1' }), later = charge('c_later', 90);
      const paidBack = charge('c_back', 120);
      const claims = bookingCharges([booking('bk1', 30.01), booking('bk2', 90.01), booking('bk3', 120.01)], [store, mine, later, paidBack]);
      expect(Object.fromEntries([...claims].map(([b, r]) => [b, r.id]))).toEqual({ bk1: 'c_mine', bk2: 'c_later', bk3: 'c_back' });
    });

    it('takes only charges of the kind\'s own SKU and currency, and never a credit or another reason', () => {
      const rows = [
        charge('c_pv', 0, { sku: 'private_1on1', delta: -900 }),
        charge('c_coins', 0, { currency: 'coins' }),
        charge('c_credit', 0, { delta: 150 }),
        charge('c_arena', 0, { reasonCode: 'ARENA_ENTRY' }),
      ];
      expect([...bookingCharges([booking('bk1', 1)], rows)]).toEqual([]);
      expect([...bookingCharges([booking('bk1', 1, 'private_1on1')], rows)].map(([b, r]) => [b, r.id])).toEqual([['bk1', 'c_pv']]);
    });

    it('decides a tie on time by id, so every server instance claims alike', () => {
      const a = charge('c_a', 0), b = charge('c_b', 0);
      const one = bookingCharges([booking('bk_b', 1), booking('bk_a', 1)], [b, a]);
      const two = bookingCharges([booking('bk_a', 1), booking('bk_b', 1)], [a, b]);
      expect([...one].map(([k, r]) => [k, r.id]).sort()).toEqual([...two].map(([k, r]) => [k, r.id]).sort());
    });

    it('pays back what the charge took, at most what the booking says, and nothing for no charge or one already back', () => {
      const b = { id: 'bk1', kind: 'group_workout', sessionKey: 'gw_2026-09-23', shardsPaid: 150, startsAt: at(0) };
      expect(bookingRefundAmount(b, charge('c1', 0), new Set())).toBe(150);
      expect(bookingRefundAmount({ ...b, shardsPaid: 900 }, charge('c1', 0), new Set())).toBe(150);
      expect(bookingRefundAmount(b, charge('c1', 0, { delta: -900 }), new Set())).toBe(150);
      expect(bookingRefundAmount(b, undefined, new Set())).toBe(0);
      expect(bookingRefundAmount(b, charge('c1', 0), new Set(['c1']))).toBe(0);
      expect(bookingRefundAmount({ ...b, shardsPaid: 0 }, charge('c1', 0), new Set())).toBe(0);
    });

    it('is keyed on the charge, so the charge reads as paid back and its key replays nothing afterwards', () => {
      expect(refundedRowIds([row({ reasonCode: REASON.DEAD_BUY_REFUND, delta: 150, idempotencyKey: refundKey('c1') })]).has('c1')).toBe(true);
    });
  });

  it('names the session by its kind and its start in the studio\'s time, and says why the shards are back', () => {
    expect(bookingName('group_workout', new Date('2026-09-24T00:30:00Z'))).toBe('Group Workout, Wed, Sep 23, 5:30 PM PT');
    expect(bookingName('private_1on1', '2026-09-24T23:00:00Z')).toBe('Private 1-on-1, Thu, Sep 24, 4:00 PM PT');
    expect(bookingName('seminar', new Date('2026-09-24T23:00:00Z'))).toMatch(/^Seminar, /);
    expect(bookingName('other_kind', new Date('x'))).toBe('other_kind, date unknown');
    expect(bookingRefundNote(150, 'group_workout', new Date('2026-09-24T00:30:00Z')))
      .toBe('We refunded 150 shards for Group Workout, Wed, Sep 23, 5:30 PM PT: no link to join was ever posted. Sorry about that.');
    expect(NO_LINK_REASON).toBe('no link to join was ever posted');
  });
});

describe('the note the player reads', () => {
  it('says what came back, for what, and why, in plain words', () => {
    expect(refundNote(300, 'coins', 'Nexus Visor')).toBe("We refunded 300 coins for Nexus Visor: it didn't deliver anything. Sorry about that.");
    expect(refundNote(900, 'shards', 'Private 1-on-1 session')).toBe("We refunded 900 shards for Private 1-on-1 session: it didn't deliver anything. Sorry about that.");
    expect(refundNote(80, 'lc', 'Jab Flow Drill')).toBe("We refunded 80 Lab Credits for Jab Flow Drill: it didn't deliver anything. Sorry about that.");
    expect(refundNote(1, 'shards', 'Dunk Style Slot')).toBe("We refunded 1 shard for Dunk Style Slot: it didn't deliver anything. Sorry about that.");
    expect(refundNote(1200, 'coins', 'X')).toContain('1,200 coins');
    // a class pass says why in its own words
    expect(refundNote(300, 'shards', 'Monthly All-Access Pass', CLASS_PASS_REASON)).toBe("We refunded 300 shards for Monthly All-Access Pass: live classes haven't started yet. Sorry about that.");
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
