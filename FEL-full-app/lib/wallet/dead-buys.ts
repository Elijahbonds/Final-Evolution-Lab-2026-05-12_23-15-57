/**
 * lib/wallet/dead-buys.ts — the purchases that took a balance and delivered nothing, and how each one is told apart
 * from a purchase of the same thing that did deliver. PURE: no database, no React, safe to import on the client.
 *
 * Owner decision 2026-09-24: "Refund automatically — put the currency back on every affected wallet with an in-app
 * note saying why." Hotfix 6/6 (750e6fb2) closed two storefronts that sold things nothing ever handed over:
 *
 *   - /store bought EVERY catalog SKU through POST /api/v1/wallet/spend. That route grants a PlayerEntitlement row and
 *     nothing else, and for 24 of the 30 SKUs /store listed, nothing ever read that row back. Its ledger row is reason
 *     SPEND_CATALOG_ITEM, metadata { skuId, quantity, unitPrice }, and an idempotency key the BROWSER made with
 *     newIdempotencyKey() (lib/wallet/client.ts). The route now refuses every one of them (spend-route.test.ts).
 *   - /shop sold eight Lab Credit cards whose keys are not lib/card-catalog.ts ids, and lib/entitlements.ts drops every
 *     CardOwnership row whose key is not one. Its ledger row is reason SHOP_PURCHASE, currency lc, key
 *     shop:<userId>:<cardKey>. /api/shop/purchase now refuses all eight (shop-view.test.tsx).
 *
 * The same items are ALSO sold, and delivered, by routes that call spend() directly and write the same reason and the
 * same metadata. So a SKU on its own never decides: `match` below says, per SKU, what separates the dead buy from the
 * one that delivered. A SKU whose dead buys cannot be told apart is not listed at all.
 *
 * The six boost cards (boost_card_*) are listed for their SECOND charge only. The Profile reads the entitlement row, so
 * the first charge of a card, from /store or the Profile, delivered it. But the generic route never refused a card the
 * player already owned: a /store tab loaded before a Profile buy, or a second /store tab, charged again and upserted the
 * same row, which delivered nothing.
 *
 * Owner additions 2026-09-25:
 *   - The two /live class passes are refunded too (they were held, not refunded, on the 24th): live classes have not
 *     started, so nothing has ever read a pass. The refund deletes the PlayerEntitlement row spend() wrote with the
 *     charge, in the same transaction, so a pass bought again once classes exist is charged again. Both SKUs stay in
 *     NOT_ON_SALE until then (dead-buys.test.ts pins it).
 *   - A workout plan bought on /store is refunded without proof that nothing was erased since: the owner accepts that a
 *     plan delivered by Workout and then erased by delete-my-data may be paid back too.
 *   - A session booking whose slot is over and never had a join link is refunded: the player paid for a session they
 *     were never told how to join (endedBookings and unlinkedBookings below, the rules; dead-buy-refunds.ts, the
 *     sweep). Admins' and the owner's own bookings are treated like anyone's.
 */

import { isPrivateKey, normaliseJoinUrl, sessionEnded, sessionEndsAtMs } from '@/lib/sessions/joinLink';
import { REASON, type WalletCurrency } from './reward-rules';

/**
 * How a dead buy of a SKU is told apart from a delivering one.
 *
 *   client_key    every row of the SKU whose key the browser made is dead. The one route that delivers it composes its
 *                 key on the server (music:<player>:<sku>, card_slot:<player>_<ms>), or no route delivers it at all
 *                 (the class passes: nothing has ever read one, so the refund also takes back the entitlement row).
 *                 MUSIC-SUITE P2 (2026-09-25): the Music Room's two kits are client_key SKUs whose entitlement row IS
 *                 now read back — GET /api/music/unlock hands the room the kits the account owns — and a /store
 *                 charge wrote that same row. The read therefore counts a row only when a charge this file never pays
 *                 back stands behind it (backedEntitlements): the room's own music:<player>:<sku> charge. A /store kit
 *                 charge is still paid back and still unlocks nothing, and a kit whose only charge was already paid
 *                 back (the sweep never deleted a kit's row: no `undo`) is not owned. Moving the kits to first_charge
 *                 instead was rejected: a player who bought a kit on /store and again in the room would keep both
 *                 charges (the room's key is never a candidate), and players swept before the change and after it
 *                 would be treated differently for the same buy.
 *   wearable      the Closet's buy (app/api/v1/closet/buy) writes OwnedWearable just after its charge and refuses an item
 *                 already owned, and nothing deletes a store wearable's row (the season pass withdraws only its own ids).
 *                 The row made at or just before OwnedWearable.acquiredAt delivered; any other row of that item did not.
 *   session       Sessions (app/api/v1/sessions/book) writes one SessionBooking just after each charge, and nothing
 *                 deletes a booking. Each booking claims the latest charge of its SKU made at or before it
 *                 (bookingCharges), out of EVERY charge of the SKU, whatever its key and whether or not it was paid
 *                 back, and each booking does, whatever its status: a booking paid back for having no join link still
 *                 claims its charge, so nothing else can. A row no booking claims delivered nothing.
 *   workout_plan  Workout (app/api/v1/workout/plan) writes a WorkoutPlan just after each charge, within
 *                 PLAN_CLAIM_WINDOW_MS. A row no plan claims is refunded. delete-my-data (DELETE /api/v1/workout/scan)
 *                 erases every plan, so a plan that was delivered and then erased is paid back too: the owner's call
 *                 (2026-09-25), over holding every unmatched charge back for want of proof.
 *   first_charge  the entitlement row IS the delivery, and spend() writes it with the first charge of the SKU; nothing
 *                 else writes it and nothing deletes it. The player's earliest charge of the SKU (whatever its key)
 *                 delivered; a later one whose key the browser made upserted the same row and delivered nothing.
 *
 * These rules lean on how the delivering routes behave today. If one of them ever deletes its record (a booking
 * cancelled by deletion, a wearable sold back) or starts writing it without a charge, its rule here must change. And a
 * new reader of the entitlement row of a client_key SKU must read it through backedEntitlements, or the rows those
 * refunds leave behind start delivering for free.
 */
export type DeadBuyMatch = 'client_key' | 'wearable' | 'session' | 'workout_plan' | 'first_charge';

export interface DeadCatalogBuy {
  currency: WalletCurrency;
  /** What the refund note calls it. */
  name: string;
  match: DeadBuyMatch;
  /** The SessionBooking.kind or WorkoutPlan.tier the delivering route writes for this SKU. */
  deliveredAs?: string;
  /** What the refund takes back with the currency: the PlayerEntitlement row spend() wrote for the SKU. */
  undo?: 'entitlement';
  /** What the note says after the name, when it is not "it didn't deliver anything". */
  reason?: string;
  /** Why a /store buy of it delivered nothing. */
  why: string;
}

/** Why a class pass is paid back (owner decision 2026-09-25). */
export const CLASS_PASS_REASON = "live classes haven't started yet";

/**
 * Every SKU a /store buy took a balance for and delivered nothing, keyed on the raw SKU string (three of these are no
 * longer in CATALOG, and old ledger rows still carry them). Traced against 71ea8f30, the tree before the hotfix, plus
 * the two class passes /live sold through the same route (the owner's addition of 2026-09-25).
 */
export const DEAD_CATALOG_BUYS: Readonly<Record<string, DeadCatalogBuy>> = {
  dunk_retry_token: { currency: 'coins', name: 'Dunk Retry Token', match: 'client_key', why: 'no code ever read the entitlement, and only /store sold it' },
  dunk_style_slot: { currency: 'shards', name: 'Dunk Style Slot', match: 'client_key', why: 'no code ever read the entitlement, and only /store sold it' },
  scan_personalized: { currency: 'shards', name: 'Personalized Scan', match: 'client_key', why: 'no code ever read the entitlement, and only /store sold it' },
  creative_card_slot: { currency: 'shards', name: 'Extra Card Slot', match: 'client_key', why: 'the card creator counts CardSlot.extra, which only its own route writes (key card_slot:)' },
  music_kit_neon: { currency: 'shards', name: 'NEON kit', match: 'client_key', why: 'the Music Room charges a kit under music:<player>:<sku>, and its entitlement read (GET /api/music/unlock) counts a row only with a charge this file keeps (backedEntitlements)' },
  music_kit_dust: { currency: 'shards', name: 'DUST kit', match: 'client_key', why: 'the Music Room charges a kit under music:<player>:<sku>, and its entitlement read (GET /api/music/unlock) counts a row only with a charge this file keeps (backedEntitlements)' },
  music_cell_assist: { currency: 'shards', name: 'Cell foundation', match: 'client_key', why: 'the Music Room charges each foundation as it is used, under its own key; a bought one was never used' },
  workout_plan_4w: { currency: 'shards', name: '4-Week Workout Plan', match: 'workout_plan', deliveredAs: 'plan_4w', why: 'a plan is a WorkoutPlan row, which only Workout writes (an erased plan is paid back too)' },
  workout_program_12w: { currency: 'shards', name: '12-Week Workout Program', match: 'workout_plan', deliveredAs: 'program_12w', why: 'a plan is a WorkoutPlan row, which only Workout writes (an erased plan is paid back too)' },
  class_pass_single: { currency: 'shards', name: 'Single Class Pass', match: 'client_key', undo: 'entitlement', reason: CLASS_PASS_REASON, why: 'no live class has ever run, so nothing has read the pass; only the generic spend route sold it' },
  class_monthly: { currency: 'shards', name: 'Monthly All-Access Pass', match: 'client_key', undo: 'entitlement', reason: CLASS_PASS_REASON, why: 'no live class has ever run, so nothing has read the pass; only the generic spend route sold it' },
  session_group_workout: { currency: 'shards', name: 'Group Workout session', match: 'session', deliveredAs: 'group_workout', why: 'a seat is a SessionBooking row, which only Sessions writes' },
  seminar_seat: { currency: 'shards', name: 'Seminar seat', match: 'session', deliveredAs: 'seminar', why: 'a seat is a SessionBooking row, which only Sessions writes (it has never booked a seminar)' },
  private_1on1: { currency: 'shards', name: 'Private 1-on-1 session', match: 'session', deliveredAs: 'private_1on1', why: 'a seat is a SessionBooking row, which only Sessions writes (and it refuses a minor)' },
  cap_nexus: { currency: 'coins', name: 'Nexus Visor', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  band_flow: { currency: 'coins', name: 'Flow Headband', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  top_lab: { currency: 'coins', name: 'Lab Compression Tee', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  top_bonds: { currency: 'coins', name: 'Bonds Signature Jersey', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  top_baseball: { currency: 'coins', name: 'Diamond Club Jersey', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  top_football: { currency: 'coins', name: 'Gridiron Jersey', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  shorts_court: { currency: 'coins', name: 'Court Shorts', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  shorts_glitch: { currency: 'coins', name: 'Glitch Shorts', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  shoes_evo: { currency: 'coins', name: 'Evolution Hi-Tops', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  shoes_flight: { currency: 'coins', name: 'Flight Trainers', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  acc_chain: { currency: 'coins', name: 'Shard Chain', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  acc_sleeve: { currency: 'coins', name: 'Power Sleeve', match: 'wearable', why: 'a wearable is worn from OwnedWearable, which only the Closet writes' },
  'boost_card_bonds-bounce': { currency: 'shards', name: 'Bonds Bounce Blueprint', match: 'first_charge', why: 'the first charge unlocked the card; /store charged again for a card already owned' },
  'boost_card_amir-signature': { currency: 'shards', name: 'Amir Smith Signature', match: 'first_charge', why: 'the first charge unlocked the card; /store charged again for a card already owned' },
  'boost_card_flight-lab-pro': { currency: 'shards', name: 'Flight Lab Pro Card', match: 'first_charge', why: 'the first charge unlocked the card; /store charged again for a card already owned' },
  'boost_card_coach-v-elite': { currency: 'shards', name: 'Coach V Elite Card', match: 'first_charge', why: 'the first charge unlocked the card; /store charged again for a card already owned' },
  'boost_card_neural-max': { currency: 'shards', name: 'Neural Max Override', match: 'first_charge', why: 'the first charge unlocked the card; /store charged again for a card already owned' },
  'boost_card_directors-cut': { currency: 'shards', name: "Director's Cut Monologue", match: 'first_charge', why: 'the first charge unlocked the card; /store charged again for a card already owned' },
};

/**
 * The eight /shop cards, keyed on the raw card key. Each one's key was never a lib/card-catalog.ts id, so its
 * CardOwnership row unlocked nothing (lib/entitlements.ts reads catalog ids only). Only /shop ever sold them.
 */
export const HOLLOW_SHOP_CARDS: Readonly<Record<string, { name: string }>> = {
  'drill-jab-flow': { name: 'Jab Flow Drill' },
  'drill-vert-charge': { name: 'Vert Charge Drill' },
  'drill-baseline-grind': { name: 'Baseline Grind Drill' },
  'avatar-neon-gi': { name: 'Neon Gi Avatar' },
  'avatar-golden-hour': { name: 'Golden Hour Avatar' },
  'avatar-neuro-pulse': { name: 'Neuro Pulse Avatar' },
  'course-dunk-adv': { name: 'Advanced Dunk Theory' },
  'course-karate-adv': { name: 'Advanced Strike Systems' },
};

/** The reasons whose rows the sweep reads: the two dead purchases, and the refunds already made for them. */
export const SHOP_PURCHASE_REASON = 'SHOP_PURCHASE';
export const DEAD_BUY_REASONS: readonly string[] = [REASON.SPEND_CATALOG_ITEM, SHOP_PURCHASE_REASON, REASON.DEAD_BUY_REFUND];

/** The refund's idempotency key. Unique across the ledger, so a row is refunded at most once, ever. */
export function refundKey(rowId: string): string {
  return `refund:${rowId}`;
}

/**
 * The key a /shop purchase is charged under. shop:<userId>:<cardKey> buys a card once however often it is tapped. A
 * refund undoes the sale (the LC back, the card off the shelf) but the sale's row keeps that key, and applyLc answers a
 * key it already holds with that row, so a card bought again once it goes on sale would come free. A sale made after
 * the first one was refunded is keyed after that refunded row instead. deadBuyOf never takes it: it names no card.
 */
export function shopPurchaseKey(userId: string, cardKey: string, refundedSaleId?: string | null): string {
  const key = `shop:${userId}:${cardKey}`;
  return refundedSaleId ? `${key}:after-refund:${refundedSaleId}` : key;
}

/** A row younger than this is left for a later read: a Closet or Sessions buy may still be writing what it delivered. */
export const DEAD_BUY_GRACE_MS = 10 * 60_000;
/** How long a refund's note keeps being offered to a device that has not shown it yet. */
export const REFUND_NOTE_DAYS = 14;
/** A Workout charge and the plan it writes are one request apart; a plan claims only a row this close before it. */
export const PLAN_CLAIM_WINDOW_MS = 5 * 60_000;
/** Clock slack when a delivery claims its row: both are written by one request, the row first. */
const CLAIM_SLACK_MS = 2_000;

/**
 * Was this key made by the browser's newIdempotencyKey()? A v4 UUID, or k_<ms>_<base36> where crypto has no
 * randomUUID. Every key a server route composes carries a colon (music:, card_slot:, boost_card:, shop:), so none
 * of them can pass.
 */
export function isClientMadeKey(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key) || /^k_\d+_[0-9a-z]*$/.test(key);
}

/** A ledger row as the sweep reads it (delta already a number). */
export interface DeadBuyRow {
  id: string;
  currency: string;
  delta: number;
  reasonCode: string;
  idempotencyKey: string;
  metadata: unknown;
  createdAt: Date;
}

export interface DeadBuy {
  row: DeadBuyRow;
  /** What to pay back: exactly what the row took. */
  amount: number;
  currency: WalletCurrency;
  name: string;
  /** The catalog SKU, or the /shop card key. */
  item: string;
  match: DeadBuyMatch | 'shop_card';
  deliveredAs?: string;
  undo?: 'entitlement';
  reason?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The dead buy this row might be, or null. Checks everything the row itself can prove: reason, SKU, currency, a
 * charge and not a credit, and a key only the dead path wrote. Whether a delivering route claims it is decided by
 * refundableDeadBuys, which needs what that route wrote.
 */
export function deadBuyOf(row: DeadBuyRow, playerId: string): DeadBuy | null {
  if (!(row.delta < 0) || !Number.isSafeInteger(row.delta)) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (row.reasonCode === REASON.SPEND_CATALOG_ITEM) {
    const sku = str(meta.skuId);
    const dead = Object.prototype.hasOwnProperty.call(DEAD_CATALOG_BUYS, sku) ? DEAD_CATALOG_BUYS[sku] : null;
    if (!dead || row.currency !== dead.currency || !isClientMadeKey(row.idempotencyKey)) return null;
    return {
      row, amount: -row.delta, currency: dead.currency, name: dead.name, item: sku, match: dead.match, deliveredAs: dead.deliveredAs,
      ...(dead.undo ? { undo: dead.undo } : {}), ...(dead.reason ? { reason: dead.reason } : {}),
    };
  }
  if (row.reasonCode === SHOP_PURCHASE_REASON && row.currency === 'lc') {
    const prefix = `shop:${playerId}:`;
    if (!row.idempotencyKey.startsWith(prefix)) return null;   // the key carries the buyer, so this is also "their own row"
    const cardKey = row.idempotencyKey.slice(prefix.length);
    const card = Object.prototype.hasOwnProperty.call(HOLLOW_SHOP_CARDS, cardKey) ? HOLLOW_SHOP_CARDS[cardKey] : null;
    if (!card) return null;
    return { row, amount: -row.delta, currency: 'lc', name: card.name, item: cardKey, match: 'shop_card' };
  }
  return null;
}

/** The ids of the rows a refund already exists for, read off the refund rows' keys. */
export function refundedRowIds(rows: readonly DeadBuyRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.reasonCode === REASON.DEAD_BUY_REFUND && r.idempotencyKey.startsWith('refund:')) out.add(r.idempotencyKey.slice('refund:'.length));
  }
  return out;
}

/**
 * Each delivery claims one row: the latest one not yet claimed that was made at or before it (and, with a window, no
 * earlier than `windowMs` before it). Deliveries are taken oldest first, so a later purchase never changes what an
 * earlier delivery claimed, and a refund once decided stays decided. Returns delivery -> the buy it claimed.
 */
function claims<T extends { row: { createdAt: Date } }, D>(buys: readonly T[], deliveries: readonly D[], at: (d: D) => Date, windowMs = Infinity): Map<D, T> {
  const open = [...buys].sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime());
  const out = new Map<D, T>();
  const taken = new Set<T>();
  for (const d of [...deliveries].sort((a, b) => at(a).getTime() - at(b).getTime())) {
    const when = at(d).getTime();
    let pick: T | null = null;
    for (const b of open) {
      const t = b.row.createdAt.getTime();
      if (t > when + CLAIM_SLACK_MS) break;
      if (taken.has(b) || t < when - windowMs) continue;
      pick = b;   // ascending, so the last fit is the latest
    }
    if (pick) { taken.add(pick); out.set(d, pick); }
  }
  return out;
}

/** The buys no delivery claimed (see claims), oldest first. */
export function unclaimed<T extends { row: { createdAt: Date } }>(buys: readonly T[], deliveredAt: readonly Date[], windowMs = Infinity): T[] {
  const claimed = new Set(claims(buys, deliveredAt.map((d) => ({ d })), (x) => x.d, windowMs).values());
  return [...buys].sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime()).filter((b) => !claimed.has(b));
}

/** What the delivering routes wrote for this player, as far as the sweep's candidates need it. */
export interface DeliveryEvidence {
  wearables: readonly { itemId: string; acquiredAt: Date }[];
  plans: readonly { tier: string; createdAt: Date }[];
  /** SKU -> the id of the player's earliest charge of it, whatever its key (firstChargeIds). */
  firstCharges: ReadonlyMap<string, string>;
  /** The ids of the charges the player's bookings claim (bookingCharges). */
  bookedCharges: ReadonlySet<string>;
}

/** The player's earliest SPEND_CATALOG_ITEM charge of each SKU, from their own ledger rows: SKU -> row id. */
export function firstChargeIds(rows: readonly DeadBuyRow[]): Map<string, string> {
  const first = new Map<string, DeadBuyRow>();
  for (const r of rows) {
    if (r.reasonCode !== REASON.SPEND_CATALOG_ITEM || !(r.delta < 0)) continue;
    const sku = str(((r.metadata ?? {}) as Record<string, unknown>).skuId);
    const had = first.get(sku);
    const t = r.createdAt.getTime();
    if (sku && (!had || t < had.createdAt.getTime() || (t === had.createdAt.getTime() && r.id < had.id))) first.set(sku, r);
  }
  return new Map([...first].map(([sku, r]) => [sku, r.id]));
}

/**
 * MUSIC-SUITE P2 (2026-09-25): the SKUs among `skus` whose entitlement row a charge still backs, for a reader of the
 * rows of a client_key or first_charge SKU — today GET /api/music/unlock, the Music Room's kits. Before P2 nothing read
 * a kit's row, which is why the kits could be client_key ("nothing calls the entitlement read"). Once something reads
 * it, the row spend() wrote with a /store charge would unlock the kit while the sweep pays that same charge back — a
 * free kit — and every kit already paid back still has its row, since a kit's refund takes nothing back.
 *
 * A SKU counts when the player has a charge of it (SPEND_CATALOG_ITEM, delta < 0, from their own ledger rows) that has
 * no refund and that these rules never pay back: deadBuyOf takes no such charge (a server-composed key, e.g.
 * music:<player>:<sku>), or its rule is first_charge and it is the earliest charge (firstChargeIds). A browser-keyed
 * charge of a client_key SKU never backs a row, even before the sweep reaches it (younger than DEAD_BUY_GRACE_MS, or a
 * failed sweep): it is going to be paid back, so it does not deliver meanwhile either. The caller intersects the result
 * with the entitlement rows it read. Not for wearable/session/workout_plan SKUs: those deliver through other tables.
 */
export function backedEntitlements(skus: readonly string[], rows: readonly DeadBuyRow[], playerId: string): Set<string> {
  const want = new Set(skus);
  const refunded = refundedRowIds(rows);
  const first = firstChargeIds(rows);
  const out = new Set<string>();
  for (const r of rows) {
    if (r.reasonCode !== REASON.SPEND_CATALOG_ITEM || !(r.delta < 0) || refunded.has(r.id)) continue;
    const sku = str(((r.metadata ?? {}) as Record<string, unknown>).skuId);
    if (!want.has(sku) || out.has(sku)) continue;
    const dead = deadBuyOf(r, playerId);
    if (!dead || (dead.match === 'first_charge' && first.get(sku) === r.id)) out.add(sku);
  }
  return out;
}

/**
 * Which families of candidate need evidence read before they can be decided. Bookings are not among them: the sweep
 * reads every one of the player's bookings anyway, for their own refunds (bookingCharges).
 */
export function evidenceNeeded(buys: readonly DeadBuy[]): { wearables: string[]; plans: boolean } {
  const wearables = new Set<string>();
  let plans = false;
  for (const b of buys) {
    if (b.match === 'wearable') wearables.add(b.item);
    else if (b.match === 'workout_plan') plans = true;
  }
  return { wearables: [...wearables], plans };
}

/** The candidates that delivered nothing, per their SKU's rule (see DeadBuyMatch). */
export function refundableDeadBuys(buys: readonly DeadBuy[], ev: DeliveryEvidence): DeadBuy[] {
  const out: DeadBuy[] = [];
  const byItem = new Map<string, DeadBuy[]>();
  for (const b of buys) {
    if (b.match === 'client_key' || b.match === 'shop_card') { out.push(b); continue; }
    // the earliest charge is the one that delivered; with no earliest known, nothing is refunded
    if (b.match === 'first_charge') { if (ev.firstCharges.has(b.item) && ev.firstCharges.get(b.item) !== b.row.id) out.push(b); continue; }
    // a booking claims its charge out of every charge of the SKU, not just these candidates (bookingCharges)
    if (b.match === 'session') { if (!ev.bookedCharges.has(b.row.id)) out.push(b); continue; }
    const list = byItem.get(b.item) ?? [];
    list.push(b);
    byItem.set(b.item, list);
  }
  for (const [item, list] of byItem) {
    const rule = list[0];
    if (rule.match === 'wearable') {
      out.push(...unclaimed(list, ev.wearables.filter((w) => w.itemId === item).map((w) => w.acquiredAt)));
    } else if (rule.match === 'workout_plan') {
      // a plan claims only the charge just before it; every other charge is paid back, an erased plan's included
      out.push(...unclaimed(list, ev.plans.filter((p) => p.tier === rule.deliveredAs).map((p) => p.createdAt), PLAN_CLAIM_WINDOW_MS));
    }
  }
  return out.sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime());
}

const UNITS: Record<WalletCurrency, [string, string]> = {
  coins: ['coin', 'coins'],
  shards: ['shard', 'shards'],
  lc: ['Lab Credit', 'Lab Credits'],
};

/** The note the player reads, once in a toast and for good in the wallet history. */
export function refundNote(amount: number, currency: WalletCurrency, name: string, reason = "it didn't deliver anything"): string {
  const [one, many] = UNITS[currency];
  return `We refunded ${amount.toLocaleString('en-US')} ${amount === 1 ? one : many} for ${name}: ${reason}. Sorry about that.`;
}

// ── Session bookings with no join link (owner decision 2026-09-25) ───────────────────────────────────────────────────
//
// Sessions charged shards and wrote a SessionBooking, and until 110560be there was no way to be told where the session
// was. A CONFIRMED booking whose session is over (lib/sessions/joinLink.ts sessionEnded: its start plus its kind's
// length) and whose slot never had a link this player could open (linkedSlotsFor) is paid back: what the charge it
// claims took (bookingCharges), at most its shardsPaid, in shards, and the booking's status becomes 'refunded' in the
// same transaction. The credit is keyed on that charge (refund:<chargeId>, the key a /store refund of it would take), so
// the charge comes back once whatever claims it, and its own key replays nothing afterwards (wallet-service
// spendReplay). A booking that claims no charge was never paid for: until 2026-09-25 the booking route answered a used
// key with its old receipt and booked another slot on it. That booking, one whose charge is already paid back and one of
// 0 shards are only closed. A slot with a link is never paid back, however the session went, and once a session has
// started its link can be replaced but not taken down (app/api/v1/sessions/join-link). Cancelled, pending and refunded
// rows are never touched. The SessionJoinLink table may not exist yet (it is new): then nothing can be proven and NO
// booking is paid back on that read (dead-buy-refunds.ts). Two guards make it once: the status flip is conditional on
// 'confirmed', and the credit's key is unique across the ledger.

/** A confirmed SessionBooking as the sweep reads it. */
export interface BookingRow { id: string; kind: string; sessionKey: string; shardsPaid: number; startsAt: Date }

/** SessionBooking.kind -> the SKU Sessions charges for it (the session SKUs' deliveredAs, read the other way). */
export const BOOKING_SKU: ReadonlyMap<string, string> = new Map(
  Object.entries(DEAD_CATALOG_BUYS).filter(([, d]) => d.match === 'session' && d.deliveredAs).map(([sku, d]) => [d.deliveredAs as string, sku]),
);

/** A SessionBooking of any status, as the claim reads it. */
export interface ClaimingBooking { id: string; kind: string; createdAt: Date }

/**
 * The charge each of a player's bookings claims: booking id -> its SPEND_CATALOG_ITEM row. Per kind, the bookings
 * oldest first each take the latest charge of the kind's SKU not yet taken that was made at or before them (claims),
 * out of every charge of that SKU, whatever its key and whether or not it was paid back, and every booking, whatever
 * its status. So what a booking claims never moves, and no two bookings share a charge. A tie on time goes to the lower
 * id, so every server instance decides alike.
 */
export function bookingCharges(bookings: readonly ClaimingBooking[], rows: readonly DeadBuyRow[]): Map<string, DeadBuyRow> {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const out = new Map<string, DeadBuyRow>();
  for (const [kind, sku] of BOOKING_SKU) {
    const currency = DEAD_CATALOG_BUYS[sku].currency;
    const charges = rows
      .filter((r) => r.reasonCode === REASON.SPEND_CATALOG_ITEM && r.delta < 0 && r.currency === currency && str(((r.metadata ?? {}) as Record<string, unknown>).skuId) === sku)
      .sort(byId).map((row) => ({ row }));
    const mine = bookings.filter((b) => b.kind === kind).sort(byId);
    for (const [b, c] of claims(charges, mine, (x) => x.createdAt)) out.set(b.id, c.row);
  }
  return out;
}

/**
 * What an ended booking with no link is paid back: what the charge it claims took, at most what the booking says it
 * paid. 0 when it claims no charge, that charge is already paid back, or the booking cost nothing: it is only closed.
 */
export function bookingRefundAmount(b: BookingRow, charge: DeadBuyRow | undefined, refunded: ReadonlySet<string>): number {
  if (!charge || refunded.has(charge.id) || !(b.shardsPaid > 0)) return 0;
  return Math.min(b.shardsPaid, -charge.delta);
}

/** Why a booking is paid back. */
export const NO_LINK_REASON = 'no link to join was ever posted';

const KIND_LABELS: Record<string, string> = { group_workout: 'Group Workout', private_1on1: 'Private 1-on-1', seminar: 'Seminar' };
const PT = 'America/Los_Angeles';

/**
 * What the note calls a booking: its kind and its start, in the studio's time (the schedule's labels use the same).
 * Newer ICU builds put a narrow no-break space before AM/PM; the note is stored, so it is written with a plain space
 * whatever Node formats it.
 */
export function bookingName(kind: string, startsAt: Date | string): string {
  const at = new Date(startsAt);
  const when = Number.isFinite(at.getTime())
    ? `${new Intl.DateTimeFormat('en-US', { timeZone: PT, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at).replace(/\u202f/g, ' ')} PT`
    : 'date unknown';
  return `${KIND_LABELS[kind] ?? kind}, ${when}`;
}

export function bookingRefundNote(amount: number, kind: string, startsAt: Date | string): string {
  return refundNote(amount, 'shards', bookingName(kind, startsAt), NO_LINK_REASON);
}

/**
 * A player's confirmed bookings, split: the ones whose session is over, and when the next one ends (null with none
 * still to come). The sweep looks at a player again after `nextEndsAt`, since a booking becomes dead by the clock,
 * not by anything the player does.
 */
export function endedBookings(rows: readonly BookingRow[], now: Date): { ended: BookingRow[]; nextEndsAt: number | null } {
  const ended: BookingRow[] = [];
  let nextEndsAt: number | null = null;
  for (const b of rows) {
    if (sessionEnded(b.kind, b.startsAt, now.getTime())) { ended.push(b); continue; }
    const end = sessionEndsAtMs(b.kind, b.startsAt);
    if (Number.isFinite(end) && (nextEndsAt === null || end < nextEndsAt)) nextEndsAt = end;
  }
  ended.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { ended, nextEndsAt };
}

/**
 * The slots whose link this player could open, from the SessionJoinLink rows of their slots: a stored link that passes
 * the link rules (joinLinkServer.readJoinLinks drops one that does not), and for a private 1-on-1 only its holder's
 * (privateHolders: a second booker who raced in is never shown it). The rule /sessions shows a link by, so what the
 * page says about an ended session and what the wallet pays back agree.
 */
export function linkedSlotsFor(playerId: string, links: readonly { sessionKey: string; url: string }[], holders: ReadonlyMap<string, string>): Set<string> {
  return new Set(links
    .filter((l) => normaliseJoinUrl(l.url).ok && (!isPrivateKey(l.sessionKey) || holders.get(l.sessionKey) === playerId))
    .map((l) => l.sessionKey));
}

/** The ended bookings no link was ever posted for. `linked` is every slot whose link this player could open. */
export function unlinkedBookings(ended: readonly BookingRow[], linked: ReadonlySet<string>): BookingRow[] {
  return ended.filter((b) => !linked.has(b.sessionKey));
}

/** A refund's note as the wallet read hands it to the client. `id` is the refund's ledger row. */
export interface RefundNote { id: string; text: string; at: string }

/** The notes this device has not shown yet, oldest first. */
export function unseenRefundNotes(notes: readonly RefundNote[], seen: ReadonlySet<string>): RefundNote[] {
  return notes.filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string' && !seen.has(n.id))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** What the toasts say: each note on its own, or past three, one line that points at the history (which has each). */
export function refundToastTexts(fresh: readonly RefundNote[]): string[] {
  if (fresh.length <= 3) return fresh.map((n) => n.text);
  return [`We refunded ${fresh.length} purchases that didn't deliver anything. Your wallet history lists each one. Sorry about that.`];
}
