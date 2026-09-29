// Today's read model — what the client's Today card is handed for each prescribed exercise (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS WRONG. GET /api/coach/me/today built its exercises from the program tree, and the tree's query asked the
// coach's catalogue row for exactly two columns, `name` and `category` (lib/coach/server.ts TREE_INCLUDE, was :6).
// So a coach could write three cues, the common faults with their fixes, a demo video and an easier version into the
// catalogue, and none of it ever left the server: the client saw a name and "3×8-10 @ RPE7" (measured in P1,
// lib/coach/loop-baseline.test.ts BASELINE 3, when the fixture's row had all of it filled in). The session's P2 shape
// — sections, the key set, supersets, work/hold seconds, set-up cues, the effort band — reached the client as bare ids.
//
// WHAT THIS IS. The pure half of that read: one prescribed exercise (a TreeExercise) plus its catalogue row becomes a
// TodayExercise carrying the coaching, resolved to words — the cues; the faults as fault → fix; the demo as a thing
// the card can play; the easier version's NAME; the set-up picks as their text; the effort band's label and meaning;
// the pattern and brace labels; the timers. And the layout: sections in running order, supersets grouped with their
// A1/A2 labels. The route (lib/coach/todayServer.ts) does the two database reads; the card only renders.
//
// Every field is read defensively. `commonFaults` is a Json column (an old row may hold anything), the links are
// plain strings with no relation, and a row read before the P2 push has none of the new columns. A value that is not
// what it should be reads as absent — never as a crash on the client's Today.
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';
import { BRACE_INFO, PATTERN_INFO, isBraceMode, isPattern } from './catalogue';
import type { TreeExercise } from './loop';
import { groupBySection, supersetLabels, doseLine } from './structure';
import { MAX_EFFORT_CUE, SESSION_SECTIONS, bandAllowed, effortBand, setupCue, youthSafeCues } from './taxonomy';
import { timersFor, type TimerSpec } from './setTimer';

// ── the catalogue columns Today reads ───────────────────────────────────────────────────────────────────────────────

/**
 * The catalogue (ProgramExercise) columns the program tree now selects (lib/coach/server.ts TREE_INCLUDE). The two
 * variation links are plain ids with no Prisma relation, so their NAMES are a second read (todayServer.ts).
 */
export const CATALOGUE_COACHING_SELECT = {
  name: true, category: true, primaryCues: true, commonFaults: true, demoVideoUrl: true, equipment: true,
  pattern: true, braceMode: true, skillLayer: true, regressionOfId: true, progressionOfId: true,
} as const;

export interface CatalogueCoachingRow {
  name?: string; category?: string; primaryCues?: unknown; commonFaults?: unknown; demoVideoUrl?: unknown; equipment?: unknown;
  pattern?: unknown; braceMode?: unknown; skillLayer?: unknown; regressionOfId?: unknown; progressionOfId?: unknown;
}

export interface TodayFault { fault: string; fix: string | null }
export type DemoMedia =
  | { kind: 'youtube'; src: string; href: string }
  | { kind: 'file'; src: string; href: string }
  | { kind: 'link'; href: string };

export interface TodayCoaching {
  /** The catalogue's cues (up to three), in the coach's words. */
  cues: string[];
  faults: TodayFault[];
  demo: DemoMedia | null;
  /** The easier version (the catalogue row's regressionOfId), by name. */
  easier: { id: string; name: string } | null;
  /** The harder version (progressionOfId). In the read model for the coach's later use; Today does not show it — progressing is the coach's call. */
  harder: { id: string; name: string } | null;
  pattern: { id: MovementPattern; label: string } | null;
  brace: { id: BraceMode; label: string; hint: string } | null;
  equipment: string[];
  /** The coach's set-up picks for THIS prescription, as the words the client reads before the first rep. */
  setup: { id: string; text: string }[];
  /** The prescription's effort band, named. */
  band: { id: string; label: string; meaning: string; rir: string } | null;
}

export interface TodayExercise extends TreeExercise {
  /** The prescription as one line ("3 × 8-10 @ RPE7 · Drive"). */
  dose: string;
  /**
   * The client is under youth rules (taxonomy.ts youthRules: under 18, or no birth year — decisions #6, #20): no
   * adults-only band, no max-effort cue, and the set logger names no adults-only band. MIRROR-COACH P2 review.
   */
  youthRules?: boolean;
  coaching: TodayCoaching;
  timers: TimerSpec[];
}

const strings = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : []).filter((s): s is string => typeof s === 'string').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, max);

/** The Json `commonFaults` column as fault → fix rows; anything that is not { fault: string } is skipped. */
export function faultsFrom(json: unknown): TodayFault[] {
  if (!Array.isArray(json)) return [];
  const out: TodayFault[] = [];
  for (const r of json) {
    if (!r || typeof r !== 'object') continue;
    const fault = typeof (r as TodayFault).fault === 'string' ? (r as TodayFault).fault.replace(/\s+/g, ' ').trim() : '';
    if (!fault) continue;
    const fixRaw = (r as { correctionCue?: unknown }).correctionCue;
    const fix = typeof fixRaw === 'string' && fixRaw.trim() ? fixRaw.replace(/\s+/g, ' ').trim() : null;
    out.push({ fault, fix });
  }
  return out.slice(0, 6);
}

/**
 * What the card can do with a demo link: a YouTube link plays in an embed, a video file in a <video>, anything else
 * http(s) opens in a new tab. Not http(s) — a `javascript:` link, a bare word — is no demo at all (the catalogue
 * refuses those on save, lib/coach/catalogue.ts; a row written before that check might still hold one).
 */
export function demoMedia(url: unknown): DemoMedia | null {
  if (typeof url !== 'string') return null;
  const href = url.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(href)) return null;
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let yt = '';
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    yt = u.searchParams.get('v') ?? (/^\/(?:embed|shorts)\/([\w-]+)/.exec(u.pathname)?.[1] ?? '');
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`, href };
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: 'file', src: href, href };
  return { kind: 'link', href };
}

/** The variation ids a set of catalogue rows links to — the names a second read resolves. */
export function variationIds(rows: readonly (CatalogueCoachingRow | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) for (const v of [r?.regressionOfId, r?.progressionOfId]) if (typeof v === 'string' && v) ids.add(v);
  return [...ids];
}

const link = (id: unknown, names: ReadonlyMap<string, string>) => (typeof id === 'string' && names.has(id) ? { id, name: names.get(id)! } : null);

/**
 * One prescribed exercise, with its coaching. `names` maps catalogue ids to names for the variation links — ONLY the
 * program coach's own rows (todayServer.ts reads them with the coach's id), so a link to someone else's row, or to a
 * deleted one, reads as no easier version rather than leaking a name.
 */
export function todayExercise(e0: TreeExercise, row: CatalogueCoachingRow | null | undefined, names: ReadonlyMap<string, string>, opts: { youth?: boolean } = {}): TodayExercise {
  const r = row ?? {};
  const youth = !!opts.youth;
  // MIRROR-COACH P2 review (2026-09-26), decisions #6 and #20: a youth client's card carries no adults-only band (one
  // saved before the builder refused it is dropped, and the dose line with it) and no max-effort cue from the catalogue
  const e = youth && !bandAllowed(e0.effortBand, true) ? { ...e0, effortBand: null } : e0;
  const band = effortBand(e.effortBand);
  const cues = strings(r.primaryCues, 3);
  return {
    ...e,
    dose: doseLine(e),
    ...(youth ? { youthRules: true } : {}),
    coaching: {
      cues: youth ? youthSafeCues(cues) : cues,
      faults: youth ? faultsFrom(r.commonFaults).filter((f) => !MAX_EFFORT_CUE.test(`${f.fault} ${f.fix ?? ''}`)) : faultsFrom(r.commonFaults),
      demo: demoMedia(r.demoVideoUrl),
      easier: link(r.regressionOfId, names),
      harder: link(r.progressionOfId, names),
      pattern: isPattern(r.pattern) ? { id: r.pattern, label: PATTERN_INFO[r.pattern].label } : null,
      brace: isBraceMode(r.braceMode) ? { id: r.braceMode, label: BRACE_INFO[r.braceMode].label, hint: BRACE_INFO[r.braceMode].hint } : null,
      equipment: strings(r.equipment, 8),
      setup: e.setupCues.map((id) => setupCue(id)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({ id: c.id, text: c.text })),
      band: band ? { id: band.id, label: band.label, meaning: band.meaning, rir: band.rir } : null,
    },
    timers: timersFor(e),
  };
}

// ── the layout ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type TodayBlock<T> =
  | { kind: 'single'; item: T; label: string | null }
  | { kind: 'superset'; group: string; items: { label: string; item: T }[] };

export interface TodaySection<T> { section: string; label: string; meaning: string; blocks: TodayBlock<T>[] }

/**
 * The session as the client walks it: sections in running order (Prep → … → Cool-down, empty ones left out), and in
 * each, the exercises — members of a superset that sit next to each other become one block ("Superset A": A1, A2),
 * done set for set. A superset member on its own (a lone letter, or one split from its partner — the builder warns the
 * coach about both) is a single block; it keeps its A-label only when its superset really has a partner somewhere.
 */
export function todayLayout<T extends { id: string; order: number; section?: string | null; isKeySet?: boolean | null; supersetGroup?: string | null }>(items: readonly T[]): TodaySection<T>[] {
  const labels = supersetLabels(items);
  const size: Record<string, number> = {};
  for (const i of items) if (i.supersetGroup) size[i.supersetGroup] = (size[i.supersetGroup] ?? 0) + 1;
  return groupBySection(items).map((g) => {
    const blocks: TodayBlock<T>[] = [];
    for (let k = 0; k < g.items.length;) {
      const it = g.items[k];
      const grp = it.supersetGroup;
      let end = k + 1;
      if (grp) while (end < g.items.length && g.items[end].supersetGroup === grp) end++;
      if (grp && end - k >= 2) {
        blocks.push({ kind: 'superset', group: grp, items: g.items.slice(k, end).map((x) => ({ label: labels[x.id], item: x })) });
      } else {
        blocks.push({ kind: 'single', item: it, label: grp && size[grp] >= 2 ? labels[it.id] ?? null : null });
      }
      k = end;
    }
    const info = SESSION_SECTIONS.find((s) => s.id === g.section)!;
    return { section: g.section, label: g.label, meaning: info.meaning, blocks };
  });
}

/** The line under a superset's heading. */
export const supersetHint = (labels: readonly string[]): string => `Alternate ${labels.join(' and ')}, set for set. Rest after each round.`;

/** What the card says about the easier version. The note is where the client tells the coach they used it. */
export const easierLine = (name: string): string => `Easier version: ${name}. Use it if you can't hold the cues on this one today, and say so in your note.`;

/**
 * The reps box's placeholder: the prescription when it fits a small box ("8-10", "5"), else its leading number or
 * range ("6 each side" → "6"; the dose line above the box carries the whole text).
 */
export const repsPlaceholder = (reps: string): string => {
  const t = reps.trim();
  return t.length <= 5 ? t : (/^\d+(?:\s*[-–]\s*\d+)?/.exec(t)?.[0].replace(/\s+/g, '') ?? '');
};

/** A breath or mobility item logs reps or seconds only: no weight, reps left or effort to ask about. */
export const simpleLogging = (e: Pick<TodayExercise, 'coaching'>): boolean => e.coaching.pattern?.id === 'breath' || e.coaching.pattern?.id === 'mobility';

/** The line under a key set's name. */
export const KEY_SET_LINE = 'The set this session is built around. Give it your best clean reps.';

/** The note's prompt. It stays the client's only free-text channel to the coach about how a set felt. */
export const NOTE_PROMPT = 'How did it feel? Anything that felt off, tell your coach here.';
