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
 * Left out on purpose: class_pass_single and class_monthly. They are held, not dead (NOT_ON_SALE in catalog.ts). Their
 * entitlement rows are what a /live with a player would read, so a refund would turn into a free pass that day. The
 * owner's call.
 */

import { REASON, type WalletCurrency } from './reward-rules';

/**
 * How a dead buy of a SKU is told apart from a delivering one.
 *
 *   client_key    every row of the SKU whose key the browser made is dead. The one route that delivers it composes its
 *                 key on the server (music:<player>:<sku>, card_slot:<player>_<ms>), or no route delivers it at all.
 *   wearable      the Closet's buy (app/api/v1/closet/buy) writes OwnedWearable just after its charge and refuses an item
 *                 already owned, and nothing deletes a store wearable's row (the season pass withdraws only its own ids).
 *                 The row made at or just before OwnedWearable.acquiredAt delivered; any other row of that item did not.
 *   session       Sessions (app/api/v1/sessions/book) writes one SessionBooking just after each charge, and nothing
 *                 deletes a booking. Each booking claims the latest row of its SKU made at or before it; a row no booking
 *                 claims delivered nothing.
 *   workout_plan  Workout (app/api/v1/workout/plan) writes a WorkoutPlan just after each charge, but delete-my-data
 *                 (DELETE /api/v1/workout/scan) erases every plan AND every scan, leaving no trace. A row no plan claims
 *                 might be a plan that was delivered and erased, so it is refunded only when a plan or scan made BEFORE it
 *                 still exists: that proves nothing was erased since, so a delivered plan would still be there.
 *   first_charge  the entitlement row IS the delivery, and spend() writes it with the first charge of the SKU; nothing
 *                 else writes it and nothing deletes it. The player's earliest charge of the SKU (whatever its key)
 *                 delivered; a later one whose key the browser made upserted the same row and delivered nothing.
 *
 * These rules lean on how the delivering routes behave today. If one of them ever deletes its record (a booking
 * cancelled by deletion, a wearable sold back) or starts writing it without a charge, its rule here must change.
 */
export type DeadBuyMatch = 'client_key' | 'wearable' | 'session' | 'workout_plan' | 'first_charge';

export interface DeadCatalogBuy {
  currency: WalletCurrency;
  /** What the refund note calls it. */
  name: string;
  match: DeadBuyMatch;
  /** The SessionBooking.kind or WorkoutPlan.tier the delivering route writes for this SKU. */
  deliveredAs?: string;
  /** Why a /store buy of it delivered nothing. */
  why: string;
}

/**
 * Every SKU a /store buy took a balance for and delivered nothing, keyed on the raw SKU string (three of these are no
 * longer in CATALOG, and old ledger rows still carry them). Traced against 71ea8f30, the tree before the hotfix.
 */
export const DEAD_CATALOG_BUYS: Readonly<Record<string, DeadCatalogBuy>> = {
  dunk_retry_token: { currency: 'coins', name: 'Dunk Retry Token', match: 'client_key', why: 'no code ever read the entitlement, and only /store sold it' },
  dunk_style_slot: { currency: 'shards', name: 'Dunk Style Slot', match: 'client_key', why: 'no code ever read the entitlement, and only /store sold it' },
  scan_personalized: { currency: 'shards', name: 'Personalized Scan', match: 'client_key', why: 'no code ever read the entitlement, and only /store sold it' },
  creative_card_slot: { currency: 'shards', name: 'Extra Card Slot', match: 'client_key', why: 'the card creator counts CardSlot.extra, which only its own route writes (key card_slot:)' },
  music_kit_neon: { currency: 'shards', name: 'NEON kit', match: 'client_key', why: 'the Music Room keeps kits on the device and charges under music:<player>:<sku>; nothing calls the entitlement read' },
  music_kit_dust: { currency: 'shards', name: 'DUST kit', match: 'client_key', why: 'the Music Room keeps kits on the device and charges under music:<player>:<sku>; nothing calls the entitlement read' },
  music_cell_assist: { currency: 'shards', name: 'Cell foundation', match: 'client_key', why: 'the Music Room charges each foundation as it is used, under its own key; a bought one was never used' },
  workout_plan_4w: { currency: 'shards', name: '4-Week Workout Plan', match: 'workout_plan', deliveredAs: 'plan_4w', why: 'a plan is a WorkoutPlan row, which only Workout writes' },
  workout_program_12w: { currency: 'shards', name: '12-Week Workout Program', match: 'workout_plan', deliveredAs: 'program_12w', why: 'a plan is a WorkoutPlan row, which only Workout writes' },
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
    return { row, amount: -row.delta, currency: dead.currency, name: dead.name, item: sku, match: dead.match, deliveredAs: dead.deliveredAs };
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
 * earlier than `windowMs` before it). Returns the buys no delivery claimed. Deliveries are taken oldest first, so a
 * later purchase never changes what an earlier delivery claimed, and a refund once decided stays decided.
 */
export function unclaimed<T extends { row: { createdAt: Date } }>(buys: readonly T[], deliveredAt: readonly Date[], windowMs = Infinity): T[] {
  const open = [...buys].sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime());
  const claimed = new Set<T>();
  for (const d of [...deliveredAt].sort((a, b) => a.getTime() - b.getTime())) {
    const at = d.getTime();
    let pick: T | null = null;
    for (const b of open) {
      const t = b.row.createdAt.getTime();
      if (t > at + CLAIM_SLACK_MS) break;
      if (claimed.has(b) || t < at - windowMs) continue;
      pick = b;   // ascending, so the last fit is the latest
    }
    if (pick) claimed.add(pick);
  }
  return open.filter((b) => !claimed.has(b));
}

/** What the delivering routes wrote for this player, as far as the sweep's candidates need it. */
export interface DeliveryEvidence {
  wearables: readonly { itemId: string; acquiredAt: Date }[];
  bookings: readonly { kind: string; createdAt: Date }[];
  plans: readonly { tier: string; createdAt: Date }[];
  /** When the oldest WorkoutScan still on file was made, or null when none is. */
  oldestScanAt: Date | null;
  /** SKU -> the id of the player's earliest charge of it, whatever its key (firstChargeIds). */
  firstCharges: ReadonlyMap<string, string>;
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

/** Which families of candidate need evidence read before they can be decided. */
export function evidenceNeeded(buys: readonly DeadBuy[]): { wearables: string[]; bookingKinds: string[]; plans: boolean } {
  const wearables = new Set<string>();
  const kinds = new Set<string>();
  let plans = false;
  for (const b of buys) {
    if (b.match === 'wearable') wearables.add(b.item);
    else if (b.match === 'session' && b.deliveredAs) kinds.add(b.deliveredAs);
    else if (b.match === 'workout_plan') plans = true;
  }
  return { wearables: [...wearables], bookingKinds: [...kinds], plans };
}

/** The candidates that delivered nothing, per their SKU's rule (see DeadBuyMatch). */
export function refundableDeadBuys(buys: readonly DeadBuy[], ev: DeliveryEvidence): DeadBuy[] {
  const out: DeadBuy[] = [];
  const byItem = new Map<string, DeadBuy[]>();
  for (const b of buys) {
    if (b.match === 'client_key' || b.match === 'shop_card') { out.push(b); continue; }
    // the earliest charge is the one that delivered; with no earliest known, nothing is refunded
    if (b.match === 'first_charge') { if (ev.firstCharges.has(b.item) && ev.firstCharges.get(b.item) !== b.row.id) out.push(b); continue; }
    const list = byItem.get(b.item) ?? [];
    list.push(b);
    byItem.set(b.item, list);
  }
  // the oldest plan or scan still on file: anything newer than it cannot have had its plan erased
  const planTimes = ev.plans.map((p) => p.createdAt.getTime());
  const oldest = Math.min(ev.oldestScanAt ? ev.oldestScanAt.getTime() : Infinity, ...planTimes);
  for (const [item, list] of byItem) {
    const rule = list[0];
    if (rule.match === 'wearable') {
      out.push(...unclaimed(list, ev.wearables.filter((w) => w.itemId === item).map((w) => w.acquiredAt)));
    } else if (rule.match === 'session') {
      out.push(...unclaimed(list, ev.bookings.filter((k) => k.kind === rule.deliveredAs).map((k) => k.createdAt)));
    } else if (rule.match === 'workout_plan') {
      const left = unclaimed(list, ev.plans.filter((p) => p.tier === rule.deliveredAs).map((p) => p.createdAt), PLAN_CLAIM_WINDOW_MS);
      out.push(...left.filter((b) => oldest < b.row.createdAt.getTime()));
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
export function refundNote(amount: number, currency: WalletCurrency, name: string): string {
  const [one, many] = UNITS[currency];
  return `We refunded ${amount.toLocaleString('en-US')} ${amount === 1 ? one : many} for ${name}: it didn't deliver anything. Sorry about that.`;
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
