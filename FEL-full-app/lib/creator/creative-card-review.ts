// lib/creator/creative-card-review.ts — CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06): who may see, approve and flag a
// Creative Card, and what a public reader is allowed to receive.
//
// WHY A NEW FILE. creator-platform holds lib/creator/*; the owner allowed ADDITIVE edits for this work (2026-10-06,
// "creator-platform files=allow additive edits"). Everything the safety fixes need lives here so the service and the
// routes change by a few lines each, and lane/create-hub's payload v2 edits to the types and service merge cleanly.
//
// THE RULES (owner decisions, 2026-10-06):
//  - "everything public needs approval": a card is public only once an approver passed it AND its creator asked for it.
//  - "approvers = founder + admin (mods flag only)".
//  - "teens = create but keep private (nothing public, no profile link)". Enforced ON READ (publicCardWhere, canViewCard):
//    a card whose owner is under 18 or has no birth year is never served to anyone but its owner and the review staff,
//    whatever its stored isPublic says. That also covers the old acting voice clips minors uploaded (owner: "make
//    private, no deletion"); scripts/soundtrack/privatize-minor-cards.ts flips the stored rows when the owner runs it.
//
// THE AGE RULE IS THE STRICT ONE (isVerifiedAdultStrict, `thisYear - dobYear > 18`). assumption: lib/age/ageRules.ts
// reserves the strict rule for "wherever the cost of being wrong is a minor's privacy", and a public voice or song is
// that; the creator card's progression block uses the looser >= 18. The cost: in the calendar year someone turns 18 or
// 19, their tracks wait until January. Swap to isAdultAtLeast18 in ONE place (adultDobYearMax) if the owner prefers.
//
// Pure apart from the two small Prisma helpers at the bottom, which take the client as an argument.

import { isVerifiedAdultStrict } from '@/lib/age/ageRules';
import type { CreativeCard } from './creative-card-types';

// ── Roles ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** May approve or reject a card, and put a track into (or pull it from) the soundtrack rotation. */
export const APPROVER_ROLES: readonly string[] = ['founder', 'admin'];
/** May read the review queue and flag a card for an approver. Mods flag only. */
export const FLAGGER_ROLES: readonly string[] = ['founder', 'admin', 'mod'];

export const canApprove = (role: string | null | undefined): boolean => !!role && APPROVER_ROLES.includes(role);
export const canFlag = (role: string | null | undefined): boolean => !!role && FLAGGER_ROLES.includes(role);

// ── Age ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A creator whose work may be public: verified 18+ by birth year (strict). Unknown age = not public. */
export const isPublicCreator = (dobYear: number | null | undefined, now: Date = new Date()): boolean =>
  isVerifiedAdultStrict(dobYear, now);

/** The latest birth year that passes isPublicCreator this calendar year (strict: gap > 18 → dobYear ≤ year − 19). */
export const adultDobYearMax = (now: Date = new Date()): number => now.getFullYear() - 19;
const EARLIEST_BIRTH_YEAR = 1900;   // mirrors lib/age/ageRules.ts's guard: anything before is a placeholder, not an age

/** The owner filter every public read of creative cards carries (Prisma relation filter; null dobYear never matches). */
export function adultOwnerWhere(now: Date = new Date()): { owner: { dobYear: { gte: number; lte: number } } } {
  return { owner: { dobYear: { gte: EARLIEST_BIRTH_YEAR, lte: adultDobYearMax(now) } } };
}

/** What a reader who is neither the owner nor review staff may list: approved, public, and an adult's. */
export function publicCardWhere(now: Date = new Date()) {
  return { isPublic: true, reviewState: 'approved', ...adultOwnerWhere(now) };
}

// ── Single-card visibility ───────────────────────────────────────────────────────────────────────────────────────────
export interface Viewer { id: string; role?: string | null }

/**
 * May this viewer read this card? The owner always; review staff (founder/admin/mod) always; anyone else only an
 * approved, public card whose owner is a public creator. `ownerIsPublicCreator` is asked lazily so the owner and staff
 * paths cost no age lookup.
 */
export async function canViewCard(
  card: Pick<CreativeCard, 'ownerId' | 'reviewState' | 'isPublic'>,
  viewer: Viewer | null,
  ownerIsPublicCreator: () => Promise<boolean>,
): Promise<boolean> {
  if (viewer && viewer.id === card.ownerId) return true;
  if (viewer && canFlag(viewer.role)) return true;
  if (card.reviewState !== 'approved' || card.isPublic !== true) return false;
  return ownerIsPublicCreator();
}

// ── Stats JSON (no schema change: these ride in CreativeCard.stats) ──────────────────────────────────────────────────
export interface ReviewRecord { decision: 'approved' | 'rejected'; note?: string; by: string; at: string }
export interface FlagRecord { by: string; note?: string; at: string }
export type Rotation = 'on' | 'featured' | 'pulled';
export interface SoundtrackRecord { rotation: Rotation; by: string; at: string; moods?: string[] }

/** Keys only the server writes. A client-sent card's stats never carries them in (createCard strips them). */
export const SERVER_STATS_KEYS = ['review', 'flags', 'soundtrack', 'plays', 'publicMedia', 'wantsPublic', 'privatizedAt'] as const;

export function stripServerStats<T extends object>(stats: T | null | undefined): T {
  const out = { ...(stats ?? {}) } as Record<string, unknown>;
  for (const k of SERVER_STATS_KEYS) delete out[k];
  return out as T;
}

export const NOTE_MAX = 500;
export const FLAGS_MAX = 20;
export const MOODS = ['menu', 'bed', 'hype', 'chill'] as const;
export type Mood = typeof MOODS[number];

export function cleanNote(note: unknown): string | undefined {
  if (typeof note !== 'string') return undefined;
  const t = note.trim().slice(0, NOTE_MAX);
  return t.length ? t : undefined;
}

export function cleanMoods(m: unknown): Mood[] | undefined {
  if (!Array.isArray(m)) return undefined;
  const out = [...new Set(m.filter((x): x is Mood => typeof x === 'string' && (MOODS as readonly string[]).includes(x)))];
  return out.length ? out : undefined;
}

/** Did the creator ask for this card to be public? Legacy cards carry no flag: /create always sent isPublic: true. */
export function wantsPublic(stats: unknown): boolean {
  const v = (stats as Record<string, unknown> | null | undefined)?.wantsPublic;
  return v !== false;
}

export function readRotation(stats: unknown): Rotation | null {
  const r = ((stats as Record<string, unknown> | null | undefined)?.soundtrack as SoundtrackRecord | undefined)?.rotation;
  return r === 'on' || r === 'featured' || r === 'pulled' ? r : null;
}

export function readPlays(stats: unknown): number {
  const p = (stats as Record<string, unknown> | null | undefined)?.plays;
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? Math.floor(p) : 0;
}

/** A pending upload URL → the public copy made on approval (promoteCardMedia). Unmapped URLs resolve to themselves. */
export function publicMediaUrl(url: string | undefined | null, stats: unknown): string | null {
  if (!url) return null;
  const map = (stats as Record<string, unknown> | null | undefined)?.publicMedia as Record<string, string> | undefined;
  return (map && typeof map[url] === 'string') ? map[url] : url;
}

// ── Projections ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** The fields a public reader gets from stats: never the review note, the reviewer, the flags or the privacy markers. */
export function publicStats(stats: unknown): Record<string, unknown> {
  const s = { ...((stats as Record<string, unknown>) ?? {}) };
  for (const k of ['review', 'flags', 'wantsPublic', 'privatizedAt', 'publicMedia'] as const) delete s[k];
  return s;
}

const INLINE = (v: unknown) => typeof v === 'string' && v.startsWith('data:');
export const EXCERPT_CHARS = 280;

/**
 * THE SLIM CARD (browse). `browse` returned up to 100 full payloads, and an art card's canvas is a data URL of up to 3 MB:
 * one list call could carry 300 MB. A list carries the card, never an inline image (the [id] route serves the full
 * card), and writing carries an excerpt. Scene questions stay: /api/v1/scene-packs builds its packs from this list.
 * `slim: true` tells a reader to fetch the card by id when it needs the media.
 */
export function slimCard<C extends Pick<CreativeCard, 'art' | 'stats'>>(card: C): C & { slim: true } {
  const art = { ...(card.art as Record<string, unknown>) };
  for (const k of ['canvasDataUrl', 'photoUrl', 'coverUrl', 'coverArtUrl']) if (INLINE(art[k])) art[k] = '';
  if (art.kind === 'writing' && typeof art.text === 'string' && art.text.length > EXCERPT_CHARS) {
    art.text = `${art.text.slice(0, EXCERPT_CHARS)}…`;
  }
  return { ...card, art: art as unknown as C['art'], stats: publicStats(card.stats) as unknown as C['stats'], slim: true };
}

/** What a public reader (not the owner, not staff) receives from the single-card route: full art, public stats only. */
export function publicCard<C extends Pick<CreativeCard, 'stats'>>(card: C): C {
  return { ...card, stats: publicStats(card.stats) as unknown as C['stats'] };
}

// ── Prisma helpers ───────────────────────────────────────────────────────────────────────────────────────────────────
type UserReader = { user: { findUnique(args: { where: { id: string }; select: Record<string, true> }): Promise<unknown> } };

export async function ownerIsPublicCreator(db: UserReader, ownerId: string, now: Date = new Date()): Promise<boolean> {
  const u = (await db.user.findUnique({ where: { id: ownerId }, select: { dobYear: true } })) as { dobYear?: number | null } | null;
  return isPublicCreator(u?.dobYear, now);
}

export async function roleOf(db: UserReader, userId: string): Promise<string | null> {
  const u = (await db.user.findUnique({ where: { id: userId }, select: { role: true } })) as { role?: string } | null;
  return u?.role ?? null;
}
