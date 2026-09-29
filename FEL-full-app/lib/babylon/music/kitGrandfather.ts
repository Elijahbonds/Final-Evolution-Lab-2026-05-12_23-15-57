// kitGrandfather — the kits the Music Room gave away before 2026-09-20, kept (owner decision #23). PURE: no database, no
// React; the client builds the claim from its own storage, the server (app/api/music/grandfather) parses and decides it,
// and lib/wallet/kit-grandfather.ts writes the grant.
//
// MUSIC-SUITE P6 (2026-09-25). WHAT WAS WRONG, measured in the history:
//   * UNTIL 4b766804 (2026-09-20 13:13 PDT) THE ROOM NEVER CHARGED FOR A KIT. pickKit called trySpend, and with no
//     `spendShards` wired trySpend allowed the spend (StudioMode.tsx at 4b766804^:178-181, pickKit :184-191), then wrote the kit into
//     localStorage 'fel_studio_kits_v1' — an undated JSON list of kit ids, the only record the room kept. /play/music was
//     sign-in only then too (app/play/music/page.tsx at 4b766804^:9-10), so every such unlock was made by an account
//     that already existed. Nothing reached the server: no ledger row, no entitlement row.
//   * P2 (8346808f, live 2026-09-25 18:16 PDT) made the account the truth: GET /api/music/unlock lists a kit only with a
//     charge behind it, and the room wrote that answer OVER the old list. P3 (176c5e1e, live 21:49 PDT) keyed the cache
//     to the player and removed the old list on the first keyed write. Either way a kit unlocked for free re-locked on
//     the next signed-in visit — "NEON isn't on your account" (StudioMode.tsx:784) — and its only record went with it.
//   * The owner's call (#23): LET PLAYERS KEEP THEM, as a one-time server grant with its own ledger reason.
//
// THE RECORDS a device can still hold, both player-editable localStorage (see FORGEABLE below):
//   'kit_list' — 'fel_studio_kits_v1' itself, if no signed-in visit since P2 wrote or removed it. Undated: no build ever
//               dated it. After 4b766804 the room added a kit to it only after the server took the charge (so the account
//               owns it and nothing is granted); a kit in it that the account does not own was put there by the free room.
//   'library'  — a song published on this device (StudioLibrary: 'fel_studio_library_v2', pre-P3 'fel_studio_tracks_v1')
//               on NEON or DUST, dated by its createdAt. A pre-4b766804 room could only publish on a kit it had unlocked,
//               and the library never left the device, so these survived P2 and P3.
//
// THE RULES (decideGrandfather), the server's, never the client's:
//   1. the ACCOUNT was created before the cutoff (User.createdAt: the one date here nobody can edit);
//   2. the kit was IN THE FREE WINDOW: NEON or DUST, frozen (SynthKit.ts at 4b766804^:28-32) — a kit added later was
//      never free, and STREET never cost anything;
//   3. a DATED record is dated before the cutoff (and not before the account, with a day's slack for the device's clock);
//      an undated one is only the old kit list, bounded by rule 1 alone;
//   4. the account does not already own the kit (a charge or an earlier grant backs it);
//   5. ONCE per player+kit, ever: the ledger key kit_grandfather_2026_09:<player>:<sku> is unique (dead-buys.ts).
//
// FORGEABLE, said plainly: every record is the player's own localStorage, so anyone with DevTools can write one, and the
// server cannot tell it from a real one. A forged record gets the kit it names — once. What bounds it is rule 1: only an
// account that existed before 2026-09-20 qualifies, and every such account could have taken both kits for nothing, any
// day before the cutoff, by tapping them (that was the bug). So the grant's worst case is exactly the exposure the bug
// already had: NEON + DUST (600 Shards of kits) once per pre-cutoff account, no balance moved, nothing repeatable, and no
// account made since can use it at all. The owner judged the exposure acceptable in choosing #23; this does not widen it.

import { KIT_CACHE_KEY, isKitId, kitSkuId } from './purchases';
import { KIT_META, type KitId } from './SynthKit';

/**
 * The cutoff: the start of 2026-09-20 on the owner's clock (Pacific, PDT = UTC-7). Owner decision #23 says "before
 * 2026-09-20"; the fix itself landed at 13:13 PDT that day (assumption: deployed the same day — the owner's push/deploy
 * cadence). A kit unlocked free on the 20th before the fix went live is outside the literal decision; move this constant
 * to the fix's deploy time if the owner wants that half-day in.
 */
export const KIT_GRANDFATHER_CUTOFF = '2026-09-20T00:00:00-07:00';
export const KIT_GRANDFATHER_CUTOFF_MS = Date.parse(KIT_GRANDFATHER_CUTOFF);

/** The kits the room gave away: the paid kits of the catalogue before 4b766804. Frozen on purpose (rule 2). */
export const FREE_WINDOW_KITS: readonly KitId[] = Object.freeze(['neon', 'dust'] as KitId[]);

/** A device clock can be off; a dated record this far before the account was made is still read as the account's. */
export const ACCOUNT_CLOCK_SLACK_MS = 24 * 60 * 60_000;

/** At most this many records are read from one claim (two kits × two sources is all a real device can hold). */
export const MAX_GRANDFATHER_RECORDS = 8;

/** The device's per-player "this claim is settled" mark, so a claim is sent once per player per device. */
export const KIT_GRANDFATHER_MARK = 'fel_studio_kit_grandfather_v1';
export function grandfatherMarkKey(playerId: string): string { return `${KIT_GRANDFATHER_MARK}:${playerId}`; }

/** The library's two keys (StudioLibrary.ts KEY_INDEX / KEY_LEGACY_TRACKS; kitGrandfather.test.ts pins them equal). */
export const LIBRARY_INDEX_KEY = 'fel_studio_library_v2';
export const LIBRARY_LEGACY_KEY = 'fel_studio_tracks_v1';

export type GrandfatherSource = 'kit_list' | 'library';
/** One device record of a kit unlocked in the free window. `at` = when (ms), null for the undated old kit list. */
export interface GrandfatherRecord { kit: KitId; at: number | null; from: GrandfatherSource }

export type GrandfatherRefusal =
  | 'account_after_cutoff'   // rule 1
  | 'not_in_free_window'     // rule 2
  | 'dated_after_cutoff'     // rule 3
  | 'dated_before_account';  // rule 3

export interface GrandfatherDecision {
  /** Rule 1 held: the account predates the cutoff. */
  eligible: boolean;
  /** The kits to grant now, each with the record it is granted on. */
  grant: { kit: KitId; record: GrandfatherRecord }[];
  /** Kits the account already owns (a charge or an earlier grant): nothing to do. */
  owned: KitId[];
  /** Kits named by a record that did not qualify, with the first rule each failed. */
  refused: { kit: KitId; why: GrandfatherRefusal }[];
}

const inWindow = (k: KitId): boolean => FREE_WINDOW_KITS.includes(k);
const finiteMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ── the client's half ────────────────────────────────────────────────────────────────────────────────────────────────

type ClaimStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem?(k: string): void };
const knownPlayer = (id: string | null | undefined): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128;

/** Rows of a library key: the v2 index is { v, tracks: [...] }, the pre-P3 key a bare array. Anything else: none. */
function libraryRows(raw: string | null): unknown[] {
  if (raw === null) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return v;
    const t = (v as { tracks?: unknown } | null)?.tracks;
    return Array.isArray(t) ? t : [];
  } catch { return []; }
}

/**
 * What this device can show for `playerId`: the old kit list's window kits (undated) and the earliest pre-cutoff song
 * on each window kit. Only what could qualify is sent (a record dated after the cutoff never can). Null when there is
 * nothing to claim, the claim is already settled for this player on this device, the player is unknown, or the storage
 * refuses to be read.
 */
export function grandfatherClaim(storage: ClaimStore | null | undefined, playerId: string | null | undefined): GrandfatherRecord[] | null {
  if (!knownPlayer(playerId) || !storage) return null;
  try {
    if (storage.getItem(grandfatherMarkKey(playerId)) !== null) return null;
    const out: GrandfatherRecord[] = [];
    let listed: unknown = null;
    try { listed = JSON.parse(storage.getItem(KIT_CACHE_KEY) ?? 'null'); } catch { listed = null; }
    if (Array.isArray(listed)) {
      for (const k of FREE_WINDOW_KITS) if (listed.includes(k)) out.push({ kit: k, at: null, from: 'kit_list' });
    }
    const earliest = new Map<KitId, number>();
    for (const row of [...libraryRows(storage.getItem(LIBRARY_INDEX_KEY)), ...libraryRows(storage.getItem(LIBRARY_LEGACY_KEY))]) {
      const r = (row && typeof row === 'object' ? row : {}) as { kit?: unknown; createdAt?: unknown };
      if (!isKitId(r.kit) || !inWindow(r.kit) || !finiteMs(r.createdAt) || r.createdAt <= 0 || r.createdAt >= KIT_GRANDFATHER_CUTOFF_MS) continue;
      const had = earliest.get(r.kit);
      if (had === undefined || r.createdAt < had) earliest.set(r.kit, r.createdAt);
    }
    for (const k of FREE_WINDOW_KITS) { const at = earliest.get(k); if (at !== undefined) out.push({ kit: k, at, from: 'library' }); }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** Was the claim's answer definite? A sign-in to redo, a timeout, a throttle or a server fault is tried again next visit. */
export function grandfatherAnswerDefinite(status: number): boolean {
  return status > 0 && status !== 401 && status !== 408 && status !== 429 && status < 500;
}

/**
 * Record the server's answer on the device. A definite answer marks this player's claim settled here (it is not sent
 * again). When the account was ELIGIBLE the old kit list has now been honoured and is removed — P3 removed it on the
 * first keyed write (it could be anybody's); now it is removed once it has been claimed, so the list survives until the
 * player it may belong to has been asked about it. An ineligible account (made after the cutoff) leaves it for an
 * older account on the same device. Never throws.
 */
export function settleGrandfatherClaim(storage: ClaimStore | null | undefined, playerId: string | null | undefined, status: number, body: unknown): boolean {
  if (!knownPlayer(playerId) || !storage || !grandfatherAnswerDefinite(status)) return false;
  try { storage.setItem(grandfatherMarkKey(playerId), JSON.stringify({ v: 1, status })); } catch { return false; }
  const eligible = status >= 200 && status < 300 && (body as { eligible?: unknown } | null)?.eligible === true;
  if (eligible) { try { storage.removeItem?.(KIT_CACHE_KEY); } catch { /* the mark alone stops a resend */ } }
  return true;
}

/** The device's storage, or null where there is none or it refuses (a private window, blocked site data, the server). */
export function claimStorage(): ClaimStore | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** What the claim came to, for the loader and its tests. */
export type GrandfatherClaimOutcome = 'none' | 'settled' | 'retry';

/**
 * Send this device's claim (if any) to POST /api/music/grandfather and settle it. Runs BEFORE the owned-kits read, so
 * the read that follows already lists a kit it granted and the room never says "isn't on your account" about it.
 * Never throws; a failure leaves the claim for the next visit.
 */
export async function claimGrandfatherKits(
  storage: ClaimStore | null | undefined, playerId: string | null | undefined,
  send: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): Promise<GrandfatherClaimOutcome> {
  const records = grandfatherClaim(storage, playerId);
  if (!records) return 'none';
  let res: Response;
  try {
    res = await send('/api/music/grandfather', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records }),
    });
  } catch {
    return 'retry';
  }
  const body = await res.json().catch(() => null);
  return settleGrandfatherClaim(storage, playerId, res.status, body) ? 'settled' : 'retry';
}

// ── the server's half ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A claim body, read defensively (it is the client's). { records: [{ kit, at, from }] } → the records worth deciding,
 * or null when the body has no record list at all. A record that is malformed or names no kit is dropped; a 'library'
 * record must be dated; at most MAX_GRANDFATHER_RECORDS are read.
 */
export function parseGrandfatherClaim(body: unknown): GrandfatherRecord[] | null {
  const list = (body && typeof body === 'object' ? (body as { records?: unknown }).records : undefined);
  if (!Array.isArray(list)) return null;
  const out: GrandfatherRecord[] = [];
  for (const raw of list.slice(0, MAX_GRANDFATHER_RECORDS)) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as { kit?: unknown; at?: unknown; from?: unknown };
    if (!isKitId(r.kit)) continue;
    if (r.from === 'kit_list' && (r.at === null || r.at === undefined)) out.push({ kit: r.kit, at: null, from: 'kit_list' });
    else if ((r.from === 'kit_list' || r.from === 'library') && finiteMs(r.at)) out.push({ kit: r.kit, at: Math.floor(r.at), from: r.from });
  }
  return out;
}

/** Why one record does not qualify (rules 2 and 3), or null when it does. Rule 1 is the caller's. */
function recordRefusal(rec: GrandfatherRecord, accountMs: number): GrandfatherRefusal | null {
  if (!inWindow(rec.kit)) return 'not_in_free_window';
  if (rec.at === null) return null;   // the undated old kit list: bounded by the account's age alone
  if (rec.at >= KIT_GRANDFATHER_CUTOFF_MS) return 'dated_after_cutoff';
  if (rec.at < accountMs - ACCOUNT_CLOCK_SLACK_MS) return 'dated_before_account';
  return null;
}

/**
 * The server's decision on a parsed claim. `accountCreatedAt` is User.createdAt; `owned` the kits the account's charges
 * or grants already back (the owned-kits read). One entry per kit: granted on its first qualifying record, else refused
 * for the first record's reason.
 */
export function decideGrandfather(
  records: readonly GrandfatherRecord[], accountCreatedAt: Date | number, owned: Iterable<KitId>,
): GrandfatherDecision {
  const accountMs = typeof accountCreatedAt === 'number' ? accountCreatedAt : accountCreatedAt.getTime();
  const eligible = Number.isFinite(accountMs) && accountMs < KIT_GRANDFATHER_CUTOFF_MS;
  const have = new Set(owned);
  const byKit = new Map<KitId, GrandfatherRecord[]>();
  for (const r of records) byKit.set(r.kit, [...(byKit.get(r.kit) ?? []), r]);
  const out: GrandfatherDecision = { eligible, grant: [], owned: [], refused: [] };
  for (const [kit, recs] of byKit) {
    if (!eligible) { out.refused.push({ kit, why: 'account_after_cutoff' }); continue; }
    const good = recs.find((r) => recordRefusal(r, accountMs) === null);
    if (!good) { out.refused.push({ kit, why: recordRefusal(recs[0], accountMs)! }); continue; }
    if (have.has(kit)) out.owned.push(kit);
    else out.grant.push({ kit, record: good });
  }
  return out;
}

/** The note the grant's ledger row carries (the wallet history shows it under its reason's label). */
export function grandfatherNote(kit: KitId): string {
  return `${KIT_META[kit].label} kit is yours to keep: you unlocked it before Sep 20, 2026, when the Music Room's kits were free by mistake.`;
}

/** The SKU a grant is written for (the kit's shop SKU: the entitlement the owned-kits read looks for). */
export function grandfatherSku(kit: KitId): string { return kitSkuId(kit); }
