// purchases — what the Music Room sells, and for how much.
//
// THE ROOM WAS GIVING IT ALL AWAY. StudioMode takes a `spendShards` prop and falls back to allowing the spend
// when it is absent — with a console line saying so — and nothing in app/ or components/ has ever passed it. So
// every kit (NEON 200, DUST 400) and every Cell assist (50) has been free since the day it shipped. The seam was
// marked honestly in the code and then nobody closed it.
//
// This is the catalogue side of closing it: one table, read by the wallet SKUs and by the route, so the price a
// player is shown and the price the server charges cannot drift apart. The amounts are the ones the room already
// displayed.

import { KIT_META, type KitId } from './SynthKit';

export type MusicPurchase = { id: string; label: string; shards: number };

/** What the Cell assist costs. Mirrors CELL_ASSIST_COST in StudioMode. */
export const CELL_ASSIST_SHARDS = 50;

export const MUSIC_SKU_PREFIX = 'music_';

export function kitSkuId(kit: KitId): string { return `${MUSIC_SKU_PREFIX}kit_${kit}`; }
export const CELL_ASSIST_SKU = `${MUSIC_SKU_PREFIX}cell_assist`;

/**
 * Everything the room charges for. A free kit is NOT listed — a zero-price SKU would mean a spend call that
 * takes a lock and writes a ledger row for nothing.
 */
export const MUSIC_PURCHASES: MusicPurchase[] = [
  ...(Object.keys(KIT_META) as KitId[])
    .filter((k) => KIT_META[k].unlockShards > 0)
    .map((k) => ({ id: kitSkuId(k), label: `${KIT_META[k].label} kit`, shards: KIT_META[k].unlockShards })),
  { id: CELL_ASSIST_SKU, label: 'Cell foundation', shards: CELL_ASSIST_SHARDS },
];

export function musicPurchase(id: string): MusicPurchase | null {
  return MUSIC_PURCHASES.find((p) => p.id === id) ?? null;
}

/** The kit a SKU unlocks, or null when the SKU is not one of ours. */
export function kitForSku(skuId: string): KitId | null {
  const k = skuId.startsWith(`${MUSIC_SKU_PREFIX}kit_`) ? skuId.slice(`${MUSIC_SKU_PREFIX}kit_`.length) : '';
  return k in KIT_META ? (k as KitId) : null;
}

/** Kits that cost nothing are owned from the start; charging for them would be a lie either way. */
export function freeKits(): KitId[] {
  return (Object.keys(KIT_META) as KitId[]).filter((k) => KIT_META[k].unlockShards === 0);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P2 (2026-09-25): ACADEMY ECONOMY HONESTY. P1's map of the room (outbox musicsuite/understand-wf_3a55346f-
// 032.json, and BASELINE.md's "CELL spend" row) found four ways the room was not straight with a player's shards:
//   1. NO ASK. pickKit and cellAssist charged straight from the click (StudioMode.tsx:231-251 at P1): one tap on NEON
//      took 200 shards, one tap on CELL took 50, and nothing on screen asked first.
//   2. REMIX BOUGHT KITS. startRemix called pickKit(track.kit) (:313-321), so remixing somebody's NEON or DUST track
//      from the LIBRARY charged 200/400 shards for a kit the player never asked to buy.
//   3. ONE ANSWER FOR EVERY FAILURE. The loader returned `res.ok` (loader.tsx:43-46) and the room read `false` as
//      'Not enough Shards', so an expired sign-in (401) and a server fault (500) told a player with thousands of shards
//      that they were broke.
//   4. OWNERSHIP ON ONE DEVICE. Kits lived only in localStorage 'fel_studio_kits_v1' (:166-169); GET /api/music/unlock
//      had no caller. A kit bought on the phone was for sale again on the laptop, and a localStorage edit unlocked all.
// Below is the pure half of the fix — what a spend's answer means, what the player reads, what the confirm says, which
// kits the account owns, and which kit a remix opens on. StudioMode.tsx and the two loaders only wire it.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Why a spend (or the owned-kits read) did not go through. Each has its own words (SPEND_FAILURE_TEXT). */
export type SpendFailure = 'signed_out' | 'insufficient' | 'unreachable' | 'refused';

/** What the loader's spend answers — a typed result, never a bare boolean (a boolean is how 401 became "broke"). */
export type ShardSpendResult = { ok: true; shards?: number } | { ok: false; reason: SpendFailure };

/**
 * The room's spend seam. `reason` names the item (kitSpendReason / CELL_ASSIST_REASON; the loader maps it to a SKU and
 * the server prices it). `nonce` keys a consumable buy: the room keeps one per confirm, so pressing BUY again after a
 * lost answer replays that same purchase on the server instead of charging a second one.
 */
export type ShardSpend = (cost: number, reason: string, opts?: { nonce?: string }) => Promise<ShardSpendResult>;

/** What the account owns, from GET /api/music/unlock: the kit SKUs a charge still backs, and the balance. */
export type OwnedKitsRead = { ok: true; owned: readonly string[]; shards?: number } | { ok: false; reason: SpendFailure };
export type ReadOwnedKits = () => Promise<OwnedKitsRead>;

/**
 * The words for each failure. 'nothing was charged' is only said where it is true (see spendResultFromStatus).
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): NOT for 'unreachable'. That reason also covers a fetch that threw after the
 * request was sent (the loader's catch) and any 5xx — and a Hosting/Functions 502/504 timeout can arrive AFTER spend()
 * committed. It said "nothing was charged", and a player who believed it and pressed CANCEL dropped the Cell assist's
 * nonce, so the next CELL made a new one: 50 shards gone, no foundation. Now it says what is true (a retry, or the next
 * CELL ask, replays the same purchase — see shopReducer's unsettledAssistNonce).
 */
export const SPEND_FAILURE_TEXT: Readonly<Record<SpendFailure, string>> = {
  signed_out: 'Sign in to unlock',
  insufficient: 'Not enough Shards',
  unreachable: "Couldn't reach the shop — if it went through, you won't be charged twice",
  refused: "The shop doesn't sell that — nothing was charged",
};

export const SPEND_UNREACHABLE: ShardSpendResult = { ok: false, reason: 'unreachable' };
export const SPEND_REFUSED: ShardSpendResult = { ok: false, reason: 'refused' };

/**
 * What an HTTP answer from POST /api/music/unlock means. The route answers 401 signed out, 409 { error:
 * 'insufficient_shards' } when the conditional decrement found too little, 404/400 for an item it does not sell, and
 * 500 only from the catch around spend(), whose ledger row, decrement and entitlement are ONE transaction — so a 5xx
 * rolled everything back, and "nothing was charged" is true. 402 is read as insufficient too (the usual status for
 * it); a 409 that names some other error is a refusal, not poverty. 408/429 never reached the till either.
 */
export function spendResultFromStatus(status: number, body?: unknown): ShardSpendResult {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; shards?: unknown };
  if (status >= 200 && status < 300) return typeof b.shards === 'number' && Number.isFinite(b.shards) ? { ok: true, shards: b.shards } : { ok: true };
  if (status === 401) return { ok: false, reason: 'signed_out' };
  if (status === 402) return { ok: false, reason: 'insufficient' };
  if (status === 409) return { ok: false, reason: b.error === undefined || b.error === 'insufficient_shards' ? 'insufficient' : 'refused' };
  if (status >= 500 || status === 408 || status === 429 || status === 0) return SPEND_UNREACHABLE;
  return SPEND_REFUSED;
}

/**
 * What an answer from GET /api/music/unlock means. A 2xx whose body has no `owned` list is NOT "you own nothing": a
 * garbled answer must never wipe the device's kits, so it reads as unreachable and the cache stands.
 */
export function ownedReadFromResponse(status: number, body?: unknown): OwnedKitsRead {
  if (status >= 200 && status < 300) {
    const b = (body && typeof body === 'object' ? body : {}) as { owned?: unknown; shards?: unknown };
    if (!Array.isArray(b.owned)) return { ok: false, reason: 'unreachable' };
    const owned = b.owned.filter((s): s is string => typeof s === 'string');
    return typeof b.shards === 'number' && Number.isFinite(b.shards) ? { ok: true, owned, shards: b.shards } : { ok: true, owned };
  }
  const r = spendResultFromStatus(status, body);
  return r.ok ? { ok: false, reason: 'unreachable' } : r;
}

/** The reason string the room sends for a kit, which the loader maps back to the kit's SKU. */
export function kitSpendReason(kit: KitId): string { return `unlock kit ${kit}`; }
/** The reason string the room sends for a Cell foundation. */
export const CELL_ASSIST_REASON = 'cell foundation';

/**
 * The SKU a room spend is for, or null. By the reason alone: the loader used to take ANY spend of 50 as a Cell assist,
 * whatever it said it was for. A free kit has no SKU (nothing to charge), so asking to buy one is refused.
 */
export function skuForSpend(reason: string): string | null {
  const kit = (Object.keys(KIT_META) as KitId[]).find((k) => reason === kitSpendReason(k));
  if (kit) return musicPurchase(kitSkuId(kit)) ? kitSkuId(kit) : null;
  return reason === CELL_ASSIST_REASON ? CELL_ASSIST_SKU : null;
}

/** A per-purchase nonce for a consumable (the route folds it into the ledger key; [A-Za-z0-9_-], at most 40). */
export function newSpendNonce(now: number = Date.now(), rnd: () => number = Math.random): string {
  return `${now.toString(36)}${Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

// ── the ask ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A spend the room is ASKING about. Nothing is charged until the player says yes to it. */
export type PendingSpend =
  | { kind: 'kit'; kit: KitId; cost: number }
  | { kind: 'assist'; cost: number; nonce: string };

export function kitSpend(kit: KitId): PendingSpend { return { kind: 'kit', kit, cost: KIT_META[kit].unlockShards }; }
export function assistSpend(nonce: string = newSpendNonce()): PendingSpend { return { kind: 'assist', cost: CELL_ASSIST_SHARDS, nonce }; }
export function spendReason(p: PendingSpend): string { return p.kind === 'kit' ? kitSpendReason(p.kit) : CELL_ASSIST_REASON; }

/** The inline confirm's words: 'Unlock NEON for 200 Shards?  UNLOCK / CANCEL'. The balance only when the server said it. */
export function confirmCopy(p: PendingSpend, shards: number | null = null): { question: string; yes: string; no: string; balance: string | null } {
  const question = p.kind === 'kit'
    ? `Unlock ${KIT_META[p.kit].label} for ${p.cost.toLocaleString('en-US')} Shards?`
    : `Lay a Cell foundation for ${p.cost.toLocaleString('en-US')} Shards?`;
  return {
    question,
    yes: p.kind === 'kit' ? 'UNLOCK' : 'BUY',
    no: 'CANCEL',
    balance: shards === null || !Number.isFinite(shards) ? null : `You have ${Math.max(0, Math.floor(shards)).toLocaleString('en-US')}.`,
  };
}

// ── what the account owns ────────────────────────────────────────────────────────────────────────────────────────────

/** The device cache of owned kits: the prefix of each player's key (kitCacheKey), and the old shared key (P3: never read). */
export const KIT_CACHE_KEY = 'fel_studio_kits_v1';
/** The kit everybody owns; a remix of a locked kit opens on it. */
export const DEFAULT_KIT: KitId = 'street';

export function isKitId(v: unknown): v is KitId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(KIT_META, v);
}

/** Kits in the room's display order, each once, the free ones always in. */
function kitList(kits: Iterable<KitId>): KitId[] {
  const has = new Set<KitId>([...freeKits(), ...kits]);
  return (Object.keys(KIT_META) as KitId[]).filter((k) => has.has(k));
}

/** The kits a server answer says the account owns: the free ones, plus every paid kit whose SKU is listed. */
export function kitsFromOwned(owned: readonly unknown[]): KitId[] {
  const out: KitId[] = [];
  for (const s of owned) { const k = typeof s === 'string' ? kitForSku(s) : null; if (k) out.push(k); }
  return kitList(out);
}

/** A cache value cleaned: only real kit ids (a hand edit adding 'gold' adds nothing), always the free ones. */
export function cleanKitCache(raw: unknown): KitId[] {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  return kitList(Array.isArray(v) ? v.filter(isKitId) : []);
}

/** The kits the room shows as unlocked after a server read: the server's answer when it has one, else the cache. */
export function kitsAfterRead(cache: readonly KitId[], read: OwnedKitsRead): KitId[] {
  return read.ok ? kitsFromOwned(read.owned) : kitList(cache);
}

type KitStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem?(k: string): void };

/**
 * MUSIC-SUITE P3 (2026-09-25), from P2's open item: THE CACHE IS THE PLAYER'S, not the device's. It was one key for
 * everybody ('fel_studio_kits_v1'), and the room never knew who was playing, so on a shared device (a family laptop, a
 * school tablet) the next player saw the last player's NEON and DUST as owned until GET /api/music/unlock answered — and
 * kept seeing them if it never did (the cache stands when the read fails). The key now carries the signed-in player's id
 * (app/play/music passes it down; /dev/music a fixed dev id), and a room that doesn't know who is playing reads no cache at
 * all: the old unkeyed value could be anyone's, so it is never adopted, and it is removed on the first keyed write. The
 * server read stays the truth either way.
 */
export function kitCacheKey(playerId: string): string { return `${KIT_CACHE_KEY}:${playerId}`; }
const knownPlayer = (id: string | null | undefined): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128;

/** Read this player's cache. No player, or a storage that throws (blocked site data, a private window): free kits only. */
export function readKitCache(storage: KitStore | null | undefined, playerId: string | null | undefined): KitId[] {
  if (!knownPlayer(playerId)) return kitList([]);
  try { return cleanKitCache(storage?.getItem(kitCacheKey(playerId)) ?? null); } catch { return kitList([]); }
}
/** Write this player's cache (and drop the old shared key); no player or a storage that throws is ignored. */
export function writeKitCache(storage: KitStore | null | undefined, kits: readonly KitId[], playerId: string | null | undefined): void {
  if (!knownPlayer(playerId)) return;
  try { storage?.setItem(kitCacheKey(playerId), JSON.stringify(kitList(kits))); } catch { /* cache only */ }
  try { storage?.removeItem?.(KIT_CACHE_KEY); } catch { /* cache only */ }
}

// ── remix ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Which kit a remix opens on: the track's own if the player owns it, else DEFAULT_KIT — and which kit was locked. */
export function remixKit(trackKit: unknown, owned: readonly KitId[]): { kit: KitId; locked: KitId | null } {
  const k = isKitId(trackKit) ? trackKit : DEFAULT_KIT;
  return owned.includes(k) ? { kit: k, locked: null } : { kit: DEFAULT_KIT, locked: k };
}

/** What the room says when a remix could not open on the track's own kit. Null when it could. */
export function remixKitNote(plan: { kit: KitId; locked: KitId | null }): string | null {
  if (!plan.locked) return null;
  const l = KIT_META[plan.locked];
  return `This remix opens on ${KIT_META[plan.kit].label}: the original uses ${l.label}, which you haven't unlocked (${l.unlockShards.toLocaleString('en-US')} Shards in KITS). Nothing was charged.`;
}

// ── the room's shop, as a reducer (StudioMode's useReducer) ──────────────────────────────────────────────────────────

export interface ShopState {
  /** The kits the room treats as unlocked (the cache at mount, the server's answer once it arrives). */
  owned: KitId[];
  /** The spend being asked about; null = no confirm on screen. */
  pending: PendingSpend | null;
  /** The yes was pressed and the answer is not back: the yes is disabled, so one press is one purchase. */
  busy: boolean;
  /** Why the last yes failed (shown inside the confirm); cleared by a new ask, a retry or CANCEL. */
  error: SpendFailure | null;
  /** The balance the server last told us, or null. */
  shards: number | null;
  /**
   * Counts the purchases that went through. A read carries the epoch it was SENT at, and one sent before a purchase
   * landed is dropped: the mount read racing a quick NEON buy would otherwise answer "no NEON" after the buy and take
   * the kit the player just paid for off the screen.
   */
  epoch: number;
  /**
   * MUSIC-SUITE P2 FIX PASS (2026-09-25): the nonce of a Cell assist whose answer was lost ('unreachable') — it may have
   * been charged. It outlives CANCEL, and the next CELL ask reuses it, so a charge that did land replays into its
   * foundation (the route returns the original entry for a repeated key) instead of charging a second time. Cleared by
   * any definite answer for it. null = none outstanding.
   */
  unsettledAssistNonce: string | null;
}

export type ShopAction =
  | { type: 'ask'; spend: PendingSpend }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'spent'; spend: PendingSpend; result: ShardSpendResult }
  | { type: 'read'; read: OwnedKitsRead; epoch: number };

export function initialShop(cache: readonly KitId[]): ShopState {
  return { owned: kitList(cache), pending: null, busy: false, error: null, shards: null, epoch: 0, unsettledAssistNonce: null };
}

/**
 * The shop's rules, pure. An ASK only opens the confirm; nothing here charges — the one charge is StudioMode's
 * confirmSpend, between 'confirm' and 'spent'. While busy a new ask or a cancel is ignored (the answer is coming for
 * the spend on screen). A failed yes keeps the confirm open with its reason, and keeps the assist's nonce, so a second
 * yes after "couldn't reach the shop" is the SAME purchase to the server (a replay if the first did land).
 */
export function shopReducer(s: ShopState, a: ShopAction): ShopState {
  switch (a.type) {
    case 'ask':
      if (s.busy) return s;
      if (a.spend.kind === 'kit' && s.owned.includes(a.spend.kit)) return { ...s, pending: null, error: null };
      // P2 FIX PASS: a CELL ask after a lost answer is that same purchase (its nonce), never a second one
      if (a.spend.kind === 'assist' && s.unsettledAssistNonce) return { ...s, pending: { ...a.spend, nonce: s.unsettledAssistNonce }, error: null };
      return { ...s, pending: a.spend, error: null };
    case 'confirm':
      return s.pending && !s.busy ? { ...s, busy: true, error: null } : s;
    case 'cancel':
      return s.busy ? s : { ...s, pending: null, error: null };
    case 'spent': {
      if (!s.busy || s.pending !== a.spend) return s;   // an answer for a spend no longer on screen changes nothing
      // P2 FIX PASS: an assist's lost answer leaves its nonce outstanding; any definite answer for it settles it
      const unsettledAssistNonce = a.spend.kind !== 'assist' ? s.unsettledAssistNonce
        : !a.result.ok && a.result.reason === 'unreachable' ? a.spend.nonce : null;
      if (!a.result.ok) return { ...s, busy: false, error: a.result.reason, unsettledAssistNonce };
      const owned = a.spend.kind === 'kit' ? kitList([...s.owned, a.spend.kit]) : s.owned;
      return { ...s, owned, pending: null, busy: false, error: null, shards: a.result.shards ?? s.shards, epoch: s.epoch + 1, unsettledAssistNonce };
    }
    case 'read': {
      if (!a.read.ok || a.epoch !== s.epoch) return s;   // a failed read keeps the cache; a stale one is dropped
      const owned = kitsAfterRead(s.owned, a.read);
      // a confirm for a kit the server says is already owned has nothing left to ask
      const pending = s.pending && !s.busy && s.pending.kind === 'kit' && owned.includes(s.pending.kit) ? null : s.pending;
      return { ...s, owned, pending, error: pending ? s.error : null, shards: a.read.shards ?? s.shards };
    }
    default:
      return s;
  }
}
