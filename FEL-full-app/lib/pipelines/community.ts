// lib/pipelines/community.ts — PIPELINES (owner, 2026-10-06, "have all the creative pipelines actually pushed a little
// bit more"): approved Creator Cards as the slim, credited entries each game consumer reads. Pure.
//
// ONE RULE FOR EVERY CONSUMER (each is a guard in community.test.ts):
//  - the card is approved AND public (the creator asked; a founder/admin passed it);
//  - its owner is a public creator (verified 18+, strict; owner: "teens … nothing public, no profile link");
//  - it carries no owner-only private upload (lib/soundtrack/privateUploads.ts: a teen's private area never leaves it);
//  - any media it plays resolves to the PUBLIC copy an approval made (stats.publicMedia), never a pending or private
//    object, and is https;
//  - every entry carries its credit: the creator's published card name and link, else their account name, no link.
// The database query (community-server.ts) also filters with publicCardWhere; these builders hold the line again on the
// rows they are handed, so a mistaken query can never leak a card.
//
// Kinds: dance songs (music cards with a chart), routines (dance cards), scene packs, recipes (cooking), reads (writing),
// MC lines (acting). Recipes carry the chef's own allergen list, shown as the chef's declaration, and no macros: a
// community recipe never enters the MealRx maths (owner, 2026-10-06).

import { cardSharePath } from '@/lib/creator/share-link';
import { isPublicCreator, publicMediaUrl, readPlays } from '@/lib/creator/creative-card-review';
import { CARD_ALLERGENS, type CardAllergen, type DanceStep } from '@/lib/creator/creative-card-types';
import { cardHasPrivateMedia, isPrivateMediaUrl } from '@/lib/soundtrack/privateUploads';
import { readMusicV2 } from '@/lib/soundtrack/musicPayload';
import { normaliseGainDb } from '@/lib/soundtrack/gain';
import { excerptOf } from '@/lib/create/cardBlocks';

export const COMMUNITY_KINDS = ['dance-songs', 'routines', 'scene-packs', 'recipes', 'reads', 'mc-lines'] as const;
export type CommunityKind = typeof COMMUNITY_KINDS[number];
export const isCommunityKind = (k: unknown): k is CommunityKind => typeof k === 'string' && (COMMUNITY_KINDS as readonly string[]).includes(k);

/** The card discipline each kind reads. */
export const KIND_DISCIPLINE: Readonly<Record<CommunityKind, string>> = {
  'dance-songs': 'music', routines: 'dance', 'scene-packs': 'scene', recipes: 'cooking', reads: 'writing', 'mc-lines': 'acting',
};

export const CREATOR_NAME_MAX = 40;
export const TITLE_MAX = 60;
export const ENTRIES_MAX = 24;
export const CHART_MIN_STEPS = 4;
export const CHART_MAX_STEPS = 512;
export const ROUTINE_MAX_STEPS = 64;
export const RECIPE_LIST_MAX = 30;
export const RECIPE_LINE_MAX = 200;

export interface Credit { name: string; href: string | null }

export interface CommunityRow {
  id: string; title: string; primary: string; reviewState: string; isPublic: boolean; art: unknown; stats: unknown;
  createdAt?: Date | string;
  owner: { name?: string | null; dobYear?: number | null; creatorCards?: { slug: string; displayName?: string | null }[] | null } | null;
}

export interface DanceSongEntry {
  /** The DanceTrack id: `card:<cardId>`. */
  id: string; cardId: string; title: string; creator: Credit;
  url: string; mime: string; durationSec: number; gainDb: number; bpm: number; bars: number; chart: DanceStep[];
}
export interface RoutineEntry { cardId: string; title: string; creator: Credit; bpm: number; steps: DanceStep[] }
export interface ScenePackEntry { cardId: string; title: string; creator: Credit; venueId: string; questions: number; plays: number }
export interface RecipeEntry {
  cardId: string; title: string; creator: Credit;
  ingredients: string[]; steps: string[]; fuelTags: string[];
  /** As the chef declared them. FEL does not check a community recipe's allergens; the shelf says so. */
  allergens: CardAllergen[];
  photoUrl: string | null;
}
export interface ReadEntry { cardId: string; title: string; creator: Credit; excerpt: string; text: string; more: boolean }
export interface McLineEntry { cardId: string; title: string; creator: Credit; url: string; slots: string[] }

export type CommunityEntry = DanceSongEntry | RoutineEntry | ScenePackEntry | RecipeEntry | ReadEntry | McLineEntry;

// ── the shared guards ────────────────────────────────────────────────────────────────────────────────────────────────
/** Approved, public, an adult's, and no private upload anywhere in it. */
export function isServable(row: CommunityRow, now: Date = new Date()): boolean {
  return row.reviewState === 'approved' && row.isPublic === true
    && isPublicCreator(row.owner?.dobYear, now) && !cardHasPrivateMedia(row.art);
}

/** A media URL the public may load: the approval's public copy, https, never pending/ or private/. */
export function publicCopyOf(url: unknown, stats: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  const u = publicMediaUrl(url, stats);
  if (!u || !/^https:\/\/\S+$/i.test(u) || u.length > 600) return null;
  if (/\/pending\//.test(u) || isPrivateMediaUrl(u)) return null;
  return u;
}

export function creditOf(row: CommunityRow): Credit {
  const pub = row.owner?.creatorCards?.[0];
  const name = (pub?.displayName?.trim() || row.owner?.name?.trim() || 'FEL creator').slice(0, CREATOR_NAME_MAX);
  return { name, href: pub?.slug ? cardSharePath(pub.slug) : null };
}

const title = (row: CommunityRow) => (row.title ?? '').trim().slice(0, TITLE_MAX) || 'Untitled';
const strList = (v: unknown, max = RECIPE_LIST_MAX): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, max).map((x) => x.trim().slice(0, RECIPE_LINE_MAX)) : [];

/** Well-formed steps only: a clip id, a whole non-negative beat, a positive hold, a mirror flag. Sorted by beat. */
export function cleanSteps(v: unknown, max: number): DanceStep[] {
  if (!Array.isArray(v)) return [];
  const out: DanceStep[] = [];
  for (const s of v.slice(0, max)) {
    const o = (s ?? {}) as Record<string, unknown>;
    if (typeof o.clipId !== 'string' || !/^dance_[a-z0-9_]{1,40}$/.test(o.clipId)) continue;
    const beat = Number(o.beat), hold = Number(o.holdBeats);
    if (!Number.isFinite(beat) || beat < 0 || beat > 4096 || !Number.isFinite(hold) || hold <= 0 || hold > 32) continue;
    out.push({ clipId: o.clipId, beat, holdBeats: hold, mirrored: o.mirrored === true });
  }
  return out.sort((a, b) => a.beat - b.beat);
}

// ── per kind ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A music card with a playable public mix, a rights record, a BPM and a chart becomes a Dance song. */
export function danceSongOf(row: CommunityRow, now: Date = new Date()): DanceSongEntry | null {
  if (row.primary !== 'music' || !isServable(row, now)) return null;
  const m = readMusicV2(row.art);
  if (!m || !m.rights || m.bpm === null) return null;
  const url = publicCopyOf(m.mixUrl, row.stats);
  if (!url) return null;
  const a = row.art as { chart?: unknown; bars?: unknown };
  const chart = cleanSteps(a.chart, CHART_MAX_STEPS);
  if (chart.length < CHART_MIN_STEPS) return null;
  const barsFromLen = Math.max(1, Math.floor((m.durationSec * m.bpm) / 60 / 4));
  const bars = typeof a.bars === 'number' && Number.isInteger(a.bars) && a.bars >= 1 && a.bars <= 512 ? Math.min(a.bars, barsFromLen) : barsFromLen;
  return {
    id: `card:${row.id}`, cardId: row.id, title: title(row), creator: creditOf(row),
    url, mime: m.mime, durationSec: m.durationSec, gainDb: Math.round(normaliseGainDb(m.loudnessLufs) * 10) / 10,
    bpm: m.bpm, bars, chart: chart.filter((s) => s.beat < bars * 4),
  };
}

export function routineOf(row: CommunityRow, now: Date = new Date()): RoutineEntry | null {
  if (row.primary !== 'dance' || !isServable(row, now)) return null;
  const a = (row.art ?? {}) as { kind?: unknown; sequence?: unknown; bpm?: unknown };
  if (a.kind !== 'dance') return null;
  const steps = cleanSteps(a.sequence, ROUTINE_MAX_STEPS);
  if (!steps.length) return null;
  const bpm = typeof a.bpm === 'number' && a.bpm >= 40 && a.bpm <= 300 ? Math.round(a.bpm) : 100;
  return { cardId: row.id, title: title(row), creator: creditOf(row), bpm, steps };
}

export function scenePackOf(row: CommunityRow, now: Date = new Date()): ScenePackEntry | null {
  if (row.primary !== 'scene' || !isServable(row, now)) return null;
  const a = (row.art ?? {}) as { kind?: unknown; venueId?: unknown; questions?: unknown };
  if (a.kind !== 'scene' || !Array.isArray(a.questions) || a.questions.length === 0) return null;
  return {
    cardId: row.id, title: title(row), creator: creditOf(row),
    venueId: typeof a.venueId === 'string' ? a.venueId.slice(0, 40) : '', questions: a.questions.length, plays: readPlays(row.stats),
  };
}

export function recipeOf(row: CommunityRow, now: Date = new Date()): RecipeEntry | null {
  if (row.primary !== 'cooking' || !isServable(row, now)) return null;
  const a = (row.art ?? {}) as { kind?: unknown; ingredients?: unknown; steps?: unknown; fuelTags?: unknown; allergens?: unknown; photoUrl?: unknown };
  if (a.kind !== 'cooking') return null;
  const ingredients = strList(a.ingredients), steps = strList(a.steps);
  if (!ingredients.length || !steps.length) return null;
  const allergens = Array.isArray(a.allergens)
    ? [...new Set(a.allergens.filter((x): x is CardAllergen => (CARD_ALLERGENS as readonly unknown[]).includes(x)))] : [];
  return {
    cardId: row.id, title: title(row), creator: creditOf(row), ingredients, steps, fuelTags: strList(a.fuelTags, 8),
    allergens, photoUrl: publicCopyOf(a.photoUrl, row.stats),
  };
}

export function readOf(row: CommunityRow, now: Date = new Date()): ReadEntry | null {
  if (row.primary !== 'writing' || !isServable(row, now)) return null;
  const a = (row.art ?? {}) as { kind?: unknown; text?: unknown };
  if (a.kind !== 'writing' || typeof a.text !== 'string' || !a.text.trim()) return null;
  const text = a.text.trim().slice(0, 4000);
  return { cardId: row.id, title: title(row), creator: creditOf(row), text, ...excerptOf(text) };
}

export function mcLineOf(row: CommunityRow, now: Date = new Date()): McLineEntry | null {
  if (row.primary !== 'acting' || !isServable(row, now)) return null;   // adults only: isServable's age rule
  const a = (row.art ?? {}) as { kind?: unknown; performanceUrl?: unknown; voiceLineIds?: unknown };
  if (a.kind !== 'acting') return null;
  const url = publicCopyOf(a.performanceUrl, row.stats);
  if (!url) return null;
  const slots = strList(a.voiceLineIds, 4).filter((s) => /^[a-z0-9_]{1,40}$/.test(s));
  if (!slots.length) return null;
  return { cardId: row.id, title: title(row), creator: creditOf(row), url, slots };
}

const BUILDERS: Readonly<Record<CommunityKind, (r: CommunityRow, now: Date) => CommunityEntry | null>> = {
  'dance-songs': danceSongOf, routines: routineOf, 'scene-packs': scenePackOf, recipes: recipeOf, reads: readOf, 'mc-lines': mcLineOf,
};

/** The entries of one kind from the rows a query returned: newest first, at most ENTRIES_MAX. */
export function buildCommunity(kind: CommunityKind, rows: readonly CommunityRow[], now: Date = new Date()): CommunityEntry[] {
  const sorted = [...rows].sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
  const out: CommunityEntry[] = [];
  for (const r of sorted) {
    const e = BUILDERS[kind](r, now);
    if (e) out.push(e);
    if (out.length >= ENTRIES_MAX) break;
  }
  return out;
}
