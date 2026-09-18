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
  /** Per-track stems and the master render. */
  mixdown: boolean;
  /** Export the groove to the dance floor. */
  danceExport: boolean;
}

export const TIERS: Record<MusicTier, TierDef> = {
  // THE GRID. Sixteen pads and a play button. Everything else is off, including the things that are only
  // buttons — a disabled control still asks a question the player cannot answer yet.
  grid: {
    id: 'grid', name: 'THE GRID',
    blurb: 'Sixteen steps, four sounds. Tap where you want a hit.',
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
