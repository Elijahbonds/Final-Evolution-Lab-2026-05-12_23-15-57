// MusicTiers — THE GRID TIER, and the two above it (2026-09-13).
//
// Mission: Music Mode — Grid tier + Dance Rhythm export.
//
// The Academy shipped M1–M4 all at once: a 16-step groovebox, song sections, a chain, takes, stems and a
// mixdown. Everything works, and a player who opens it meets ALL of it — a full DAW on the first visit.
// That is the actual problem this closes. The room's own spec calls the first rung "the Flip": sixteen pads
// and nothing else. There was no structure that could say so.
//
// So the room has TIERS, and GRID is the first one: one bar, sixteen steps, four tracks, no sections, no
// arrangement, no recording. What a player can reach is a function of what they have actually made, and the
// tier is the thing that answers "what is this screen for?" for someone who has never seen a sequencer.
//
// The gate is DELIBERATELY not a paywall and not a level: it is a completion count. Make a pattern that is
// not empty and the chain appears; chain two sections and the studio appears. A player who already knows
// what they are doing passes both gates in about a minute, which is the correct amount of friction for a
// tutorial that is not allowed to be a tutorial.
//
// Pure: no audio, no DOM, no Babylon.
//
// MUSIC-SUITE P3 (2026-09-25), "Keep my work" — TIER HONESTY. The ladder above was read for ONE thing: how many grid
// rows to draw (StudioMode `tracks.slice(0, caps.tracks)`, ~:785 then). Everything else disagreed with it, measured in P1
// (outbox musicsuite/BASELINE.md 2b):
//   · THE ENGINE PLAYED ROWS THE GRID DID NOT DRAW. It was handed the project's whole track list (8 kit rows + Flip rows,
//     AudioEngine.ts scheduleStep), so CELL's lead/fx hits sounded on the 4-row grid (desktop: lead 4 hits in 2 bars) and a
//     Flip pad sent to the grid played 8 times in 2 bars on a row that was never drawn (flip_* rows sat after the 8 kit
//     rows, past every tier's slice). `shownRowIds` below is now the ONE rule for both: the grid draws exactly these rows
//     and the engine plays exactly these rows (AudioEngine.setAudible).
//   · FLIP ROWS HAVE THEIR OWN CAP, not the kit's: every pad (FLIP_ROW_CAP = 16), at every tier, in their own section
//     under the kit rows. Why not inside the tier's cap: the FLIP tab is open at every tier, and a Flip row exists only
//     because the player deliberately sent (or recorded) a pad — hiding it would hide the player's own work, and a 4-row
//     grid with one Flip row would have to hide a KIT row to fit it. The kit cap is the tutorial ("four sounds"); a chop
//     the player made is not.
//   · THE GATES. SEND TO THE DANCE FLOOR is `danceExport: true` at the GRID, but it lived in the song panel, which mounts
//     at the CHAIN — so it was chain-only. Takes (`takes`) and the song render + stems (`mixdown`) are STUDIO features but
//     were on screen from the CHAIN. Each is gated by its own flag now (StudioMode / SongPanel read `caps`).
//   · THE PATTERN GATE said one thing and did another: `nextUnlock` asks the player to "Play a pattern with at least one
//     hit in it" (and MusicProgress.patternsMade is documented as patterns "the player has played back"), but the room
//     opened the chain the instant a cell lit, played or not. `patternCounts` is the rule the words describe: playing,
//     with a hit on a row that is heard.
//   · THE CHIPS. `tierChips` says, for every tier, what it opens (derived from the TierDef flags, so the words can't drift
//     from the gates) and what it takes to get there.

import { KIT_SLOTS } from './SynthKit';
import { PAD_COUNT } from './Flip';

export type MusicTier = 'grid' | 'chain' | 'studio';

export const MUSIC_TIERS: readonly MusicTier[] = ['grid', 'chain', 'studio'];

export interface TierDef {
  id: MusicTier;
  name: string;
  /** One line, shown on the room's header — what this tier IS. */
  blurb: string;
  /** How many tracks the grid shows at this tier. Four is a kit; eight is a band. */
  tracks: number;
  /** Steps in the pattern. Sixteen is a bar of sixteenths. */
  steps: number;
  /** Sections, chaining and the arrangement timeline. */
  arrangement: boolean;
  /** Recording a take over the beat. */
  takes: boolean;
  /**
   * The SONG render (RENDER SONG, the chained song with its takes) and its per-track stems.
   * MUSIC-SUITE P3 FIX PASS (2026-09-25): this said "Per-track stems and the master render", while PUBLISH TO LIBRARY
   * (a 2-bar master mixdown) and the MASTER button are open at every tier — the library needs a publish from THE GRID.
   * The doc now says what the flag gates. assumption: publishing stays open at the grid (the owner can gate it here).
   */
  mixdown: boolean;
  /** Export the groove to the dance floor. */
  danceExport: boolean;
}

export const TIERS: Record<MusicTier, TierDef> = {
  // THE GRID. Sixteen pads and a play button. Everything else is off, including the things that are only
  // buttons — a disabled control still asks a question the player cannot answer yet.
  grid: {
    id: 'grid', name: 'THE GRID',
    // MUSIC-SUITE P3 FIX PASS: "four sounds" — but every pad sent from the FLIP gets its own row at every tier
    blurb: 'Sixteen steps, four kit sounds — plus every pad you send from the FLIP. Tap where you want a hit.',
    tracks: 4, steps: 16, arrangement: false, takes: false, mixdown: false,
    // the dance export IS available at the grid, on purpose: one bar of drums is already a chart, and
    // "dance to the thing I just made" is the strongest possible reason to make a second one
    danceExport: true,
  },
  chain: {
    id: 'chain', name: 'THE CHAIN',
    blurb: 'Save what you made as a section. Put sections in order and you have a song.',
    tracks: 6, steps: 16, arrangement: true, takes: false, mixdown: false, danceExport: true,
  },
  studio: {
    id: 'studio', name: 'THE STUDIO',
    blurb: 'Record over it, mix it, take the stems.',
    tracks: 8, steps: 16, arrangement: true, takes: true, mixdown: true, danceExport: true,
  },
};

/** What the player has actually done. The only input the gate reads. */
export interface MusicProgress {
  /** Patterns with at least one hit that the player has played back. */
  patternsMade: number;
  /** Sections saved. */
  sectionsSaved: number;
  /** Entries placed in a chain. */
  chainEntries: number;
}

export const NO_PROGRESS: MusicProgress = { patternsMade: 0, sectionsSaved: 0, chainEntries: 0 };

/** Make ONE pattern that is not silence and the chain opens. */
export const CHAIN_AT_PATTERNS = 1;
/** Chain TWO sections — the smallest arrangement that is actually an arrangement — and the studio opens. */
export const STUDIO_AT_CHAIN = 2;

export function tierFor(p: MusicProgress): MusicTier {
  if (p.sectionsSaved >= STUDIO_AT_CHAIN && p.chainEntries >= STUDIO_AT_CHAIN) return 'studio';
  if (p.patternsMade >= CHAIN_AT_PATTERNS) return 'chain';
  return 'grid';
}

export function tierDef(p: MusicProgress): TierDef {
  return TIERS[tierFor(p)];
}

/** Is this feature reachable yet? One question, so no screen has to know the ladder. */
export function unlocked(p: MusicProgress, feature: keyof Omit<TierDef, 'id' | 'name' | 'blurb' | 'tracks' | 'steps'>): boolean {
  return !!tierDef(p)[feature];
}

/**
 * What opens next, and what it takes — so the room can SAY it rather than leaving a locked control on screen.
 *
 * Returns null at the top, which is the honest answer: there is no fourth tier and pretending otherwise is
 * the kind of dangling carrot that makes a progression feel like a slot machine.
 */
export function nextUnlock(p: MusicProgress): { tier: MusicTier; needs: string } | null {
  const t = tierFor(p);
  if (t === 'grid') {
    return { tier: 'chain', needs: 'Play a pattern with at least one hit in it' };
  }
  if (t === 'chain') {
    const s = Math.max(0, STUDIO_AT_CHAIN - p.sectionsSaved);
    const c = Math.max(0, STUDIO_AT_CHAIN - p.chainEntries);
    return { tier: 'studio', needs: s > 0 ? `Save ${s} more section${s > 1 ? 's' : ''}` : `Put ${c} more section${c > 1 ? 's' : ''} in the chain` };
  }
  return null;
}

/** Does this pattern set count as "a pattern"? Silence does not. */
export function isRealPattern(tracks: readonly { pattern: readonly boolean[]; muted?: boolean }[]): boolean {
  return tracks.some((t) => !t.muted && t.pattern.some(Boolean));
}

/**
 * Fold one event into the progress record.
 *
 * Monotonic on purpose — a tier you reached is a tier you keep. Progress that can go DOWN would take a
 * screen away from someone mid-sentence, which no music room should ever do.
 */
export type MusicEvent = 'pattern' | 'section' | 'chain';
export function advance(p: MusicProgress, e: MusicEvent): MusicProgress {
  switch (e) {
    case 'pattern': return { ...p, patternsMade: p.patternsMade + 1 };
    case 'section': return { ...p, sectionsSaved: p.sectionsSaved + 1 };
    case 'chain': return { ...p, chainEntries: p.chainEntries + 1 };
    default: return p;
  }
}

// ── MUSIC-SUITE P3 (2026-09-25): what the room draws, what it plays, and what it says ─────────────────────────────────

/** Flip rows' own cap: one per pad, at every tier (see the header for why they are not inside the kit's cap). */
export const FLIP_ROW_CAP = PAD_COUNT;

/** The pad of a `flip_<pad>` row id (0–15), or -1. */
export function flipRowPad(sampleId: string): number {
  const m = /^flip_(\d{1,2})$/.exec(sampleId);
  const n = m ? Number(m[1]) : -1;
  return n >= 0 && n < FLIP_ROW_CAP ? n : -1;
}
export function isFlipRowId(sampleId: string): boolean { return flipRowPad(sampleId) >= 0; }

/**
 * THE ONE RULE for rows: the kit rows the tier shows (the first `tracks` kit slots, in kit order) and every Flip row. The
 * grid draws exactly these; the engine plays exactly these (AudioEngine.setAudible); publish, CELL and the dance export
 * read exactly these. A rule by id, not a list of the rows present, so a song-mode section swapped in on a bar line is
 * filtered the same way in the same instant.
 */
export function shownRowIds(def: Pick<TierDef, 'tracks'>): Set<string> {
  const ids = new Set<string>(KIT_SLOTS.slice(0, Math.max(0, def.tracks)).map((k) => k.id));
  for (let i = 0; i < FLIP_ROW_CAP; i++) ids.add(`flip_${i}`);
  return ids;
}

/** The rows the grid draws: the kit section (kit order) and the Flip section under it (pad order). */
export function visibleRows<T extends { sampleId: string }>(tracks: readonly T[], def: Pick<TierDef, 'tracks'>): { kit: T[]; flip: T[] } {
  const kitIds = KIT_SLOTS.slice(0, Math.max(0, def.tracks)).map((k) => k.id);
  const kit = kitIds.map((id) => tracks.find((t) => t.sampleId === id)).filter((t): t is T => !!t);
  const flip = tracks.filter((t) => isFlipRowId(t.sampleId)).sort((a, b) => flipRowPad(a.sampleId) - flipRowPad(b.sampleId));
  return { kit, flip };
}

/** What is heard: the drawn rows, kit then Flip. */
export function heardTracks<T extends { sampleId: string }>(tracks: readonly T[], def: Pick<TierDef, 'tracks'>): T[] {
  const { kit, flip } = visibleRows(tracks, def);
  return [...kit, ...flip];
}

/** Hits on rows the grid does not draw (kept in the project — a tier only grows — but never heard). */
export function hiddenHits(tracks: readonly { sampleId: string; pattern: readonly boolean[] }[], def: Pick<TierDef, 'tracks'>): number {
  const shown = shownRowIds(def);
  return tracks.reduce((n, t) => (shown.has(t.sampleId) ? n : n + t.pattern.filter(Boolean).length), 0);
}

/**
 * THE PATTERN GATE, as `nextUnlock` words it: the grid is PLAYING with at least one hit on a row that is heard. A cell lit
 * with the transport stopped, or a hit on a hidden row (a remixed studio track opened at the grid), is not "a pattern
 * played".
 */
export function patternCounts(o: { playing: boolean; tracks: readonly { sampleId: string; pattern: readonly boolean[]; muted?: boolean }[]; def: Pick<TierDef, 'tracks'> }): boolean {
  return o.playing && isRealPattern(heardTracks(o.tracks, o.def));
}

/** The words for each feature flag — the chips are built from the flags, so they can never promise what a gate refuses. */
const FEATURE_WORDS: Record<'arrangement' | 'takes' | 'mixdown' | 'danceExport', string> = {
  danceExport: 'send it to the dance floor',
  arrangement: 'sections, the chain and song mode',
  takes: 'record takes over it',
  // MUSIC-SUITE P4 (2026-09-25), grid-ui: the MIXER opens with the render, at THE STUDIO — the tier whose blurb has always
  // said "mix it" (StudioMode gates the mixer on this same flag, so the chip names it)
  // MUSIC-SUITE P4 FIX PASS (2026-09-25), owner decision #4: mute / solo are at EVERY tier now (the first chip says so);
  // what THE STUDIO opens is the rest of the desk — the faders, pan and the room / delay sends — with the render
  mixdown: 'the mixer\'s faders, pan, room + delay · render the song + stems',
};
/** MUSIC-SUITE P4 FIX PASS: what every tier has from the first (the MIXER's mute / solo — StudioMode draws them at all tiers). */
const FIRST_TIER_EXTRAS = 'mute / solo';

/** What a tier opens over the one below it (the first tier: all it has). */
export function tierOpens(t: MusicTier): string {
  const i = MUSIC_TIERS.indexOf(t);
  const def = TIERS[t];
  const below = i > 0 ? TIERS[MUSIC_TIERS[i - 1]] : null;
  // MUSIC-SUITE P3 FIX PASS: "4 rows" at a grid that can draw 4 kit rows AND up to 16 Flip rows — the chips count kit rows
  const parts: string[] = [below ? `${def.tracks} kit rows (+${def.tracks - below.tracks})` : `${def.tracks} kit rows + your Flip rows · ${FIRST_TIER_EXTRAS}`];
  for (const f of ['danceExport', 'arrangement', 'takes', 'mixdown'] as const) if (def[f] && !(below && below[f])) parts.push(FEATURE_WORDS[f]);
  return parts.join(' · ');
}

/** What it takes to reach a tier from the one below it (the 'next' chip uses nextUnlock's live count instead). */
const TIER_NEEDS: Record<MusicTier, string | null> = {
  grid: null,
  chain: 'Play a pattern with at least one hit in it',
  studio: `Save ${STUDIO_AT_CHAIN} sections and chain them`,
};

export interface TierChip {
  tier: MusicTier;
  name: string;
  /** reached = below the current tier; current = where the player is; next = the one nextUnlock names; later = beyond it. */
  state: 'reached' | 'current' | 'next' | 'later';
  opens: string;
  /** What unlocks it — null once reached. */
  needs: string | null;
}

/** The ladder as chips: every tier, what it opens, and what unlocks the ones not reached yet. */
export function tierChips(p: MusicProgress): TierChip[] {
  const cur = MUSIC_TIERS.indexOf(tierFor(p));
  const next = nextUnlock(p);
  return MUSIC_TIERS.map((t, i) => {
    const state: TierChip['state'] = i < cur ? 'reached' : i === cur ? 'current' : next?.tier === t ? 'next' : 'later';
    const needs = state === 'next' ? next!.needs
      : state === 'later' ? `After ${TIERS[MUSIC_TIERS[i - 1]].name}: ${TIER_NEEDS[t]!.charAt(0).toLowerCase()}${TIER_NEEDS[t]!.slice(1)}`
      : null;
    return { tier: t, name: TIERS[t].name, state, opens: tierOpens(t), needs };
  });
}

export const MUSIC_PROGRESS_KEY = 'fel-music-progress';

/** Read the remembered progress. Never throws: private mode and a corrupt value both mean "start at the grid". */
export function readProgress(): MusicProgress {
  try {
    if (typeof window === 'undefined') return { ...NO_PROGRESS };
    const raw = window.localStorage.getItem(MUSIC_PROGRESS_KEY);
    if (!raw) return { ...NO_PROGRESS };
    const v = JSON.parse(raw) as Partial<MusicProgress>;
    const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    return { patternsMade: n(v.patternsMade), sectionsSaved: n(v.sectionsSaved), chainEntries: n(v.chainEntries) };
  } catch { return { ...NO_PROGRESS }; }
}

export function writeProgress(p: MusicProgress): void {
  try { window.localStorage.setItem(MUSIC_PROGRESS_KEY, JSON.stringify(p)); } catch { /* convenience only */ }
}
