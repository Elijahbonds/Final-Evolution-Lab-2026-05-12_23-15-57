// YOUR TRACK IS WHAT PLAYS WHEN YOU WALK OUT (2026-09-13).
//
// The Music Room brief is explicit that the room is not the point: "THE BINDING (this is why it exists — do
// not build it standalone)". Three bindings are named, and none of them existed —
//
//   · the authored track becomes the walk-out / dunk-reel audio in Dunk Contest,
//   · its metadata writes to the Creator Card as a Passion Pipeline credential,
//   · Ghost Duels inherit the opponent's walk-out from their card.
//
// The room itself is largely built (AudioEngine, Song sections + chains, SynthKit, MusicTiers, a live route)
// and `DanceExport` is the precedent for exactly this shape: take a song, derive an artifact, persist it,
// let another mode consume it. This is that, for the contest.
//
// TWO DECISIONS WORTH ARGUING WITH:
//
//   1. A WALK-OUT IS METADATA, NOT AUDIO. It carries the song id, the title, the tempo and the shape — never
//      a rendered buffer. The buffer belongs to the Music Room's own storage; a card that shipped audio
//      would put megabytes into a record that gets copied into ghost-duel links and read by surfaces that
//      only ever wanted to print a name. The contest re-renders from the pattern, which it can, because the
//      instruments are synthesised (SynthKit) rather than sampled — so there is nothing to license and
//      nothing to ship.
//      MUSIC-SUITE P3 (2026-09-25): still true of THIS record. The library moved song audio off localStorage
//      into the device's file store (async), and DunkMode reads the walk-out synchronously — so the chosen
//      song's mixdown is kept in the LIBRARY's own walk-out keys (StudioLibrary KEY_WALKOUT_SRC/AUDIO), never
//      in here. This record stays a pointer that is safe to copy into a card or a ghost-duel link.
//
//   2. PLAYS ARE COUNTED WHERE THEY HAPPEN, AND ARE NOT A SCORE. The brief asks the card to show "plays
//      received". That is an engagement count, so it is labelled as one and it never feeds a rating, a
//      rarity or a gate. A creative metric that quietly becomes a competitive one is how a music room turns
//      into a leaderboard nobody asked for.
//
// Pure: no Babylon, no DOM beyond localStorage, no audio.

/** Bumped when the stored shape changes. A future version is refused rather than half-read. */
export const WALKOUT_VERSION = 1;
export const WALKOUT_KEY = 'fel-walkout';

export interface WalkOut {
  v: number;
  /** The song in the Music Room this came from. The audio is re-rendered from it, never stored here. */
  songId: string;
  title: string;
  bpm: number;
  /** Bars in the arrangement — how long the walk-out runs before it loops. */
  bars: number;
  /** ISO. When the athlete chose it, not when the song was written. */
  chosenAt: string;
  /** Times this walk-out has been heard, by anybody, including in a ghost duel. Engagement, never a score. */
  plays: number;
}

export const MAX_TITLE = 48;
/** Below this a "track" is a stab, not a walk-out; above it nobody hears the end before the dunk. */
export const MIN_BARS = 2;
export const MAX_BARS = 64;

export interface WalkOutDraft {
  songId: string;
  title: string;
  bpm: number;
  bars: number;
  now?: number;
}

export class WalkOutRefused extends Error {}

/** Build a walk-out from a song. Throws rather than storing something a player cannot hear. */
export function makeWalkOut(d: WalkOutDraft): WalkOut {
  if (!d.songId.trim()) throw new WalkOutRefused('That song has no id.');
  if (!Number.isFinite(d.bpm) || d.bpm < 40 || d.bpm > 220) throw new WalkOutRefused('Tempo is out of range.');
  if (!Number.isFinite(d.bars) || d.bars < MIN_BARS) throw new WalkOutRefused('Too short to walk out to.');
  return {
    v: WALKOUT_VERSION,
    songId: d.songId,
    title: (d.title || 'Untitled').trim().slice(0, MAX_TITLE),
    bpm: Math.round(d.bpm),
    bars: Math.min(MAX_BARS, Math.round(d.bars)),
    chosenAt: new Date(d.now ?? Date.now()).toISOString(),
    plays: 0,
  };
}

/**
 * Read one back.
 *
 * Defensive in the same way every other versioned record here is: a FUTURE version is refused rather than
 * half-read, because a v2 field this build does not understand could change what the record means.
 */
export function parseWalkOut(raw: unknown): WalkOut | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  const r = o as Partial<WalkOut>;
  if (typeof r.v !== 'number' || r.v > WALKOUT_VERSION) return null;
  if (typeof r.songId !== 'string' || !r.songId) return null;
  if (typeof r.bpm !== 'number' || !Number.isFinite(r.bpm)) return null;
  return {
    v: WALKOUT_VERSION,
    songId: r.songId,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.slice(0, MAX_TITLE) : 'Untitled',
    bpm: Math.round(r.bpm),
    bars: typeof r.bars === 'number' && r.bars >= MIN_BARS ? Math.min(MAX_BARS, Math.round(r.bars)) : MIN_BARS,
    chosenAt: typeof r.chosenAt === 'string' ? r.chosenAt : new Date(0).toISOString(),
    plays: typeof r.plays === 'number' && r.plays >= 0 ? Math.floor(r.plays) : 0,
  };
}

/**
 * MUSIC-SUITE P3 (2026-09-25): returns whether the record was actually kept. It returned nothing and swallowed the
 * failure, so a caller could not tell the player "that did not save" — the phase's rule is that no save fails
 * silently. DunkMode.ts:812 ignores the value (a play count), which stays correct; a caller that CHOOSES a walk-out
 * goes through StudioLibrary.setWalkOut, which also keeps the song's audio where DunkMode can read it synchronously.
 */
export function saveWalkOut(w: WalkOut): boolean {
  if (typeof window === 'undefined') return false;
  try { window.localStorage.setItem(WALKOUT_KEY, JSON.stringify(w)); return true; } catch { return false; /* private mode or full */ }
}

export function readWalkOut(): WalkOut | null {
  if (typeof window === 'undefined') return null;
  try { return parseWalkOut(window.localStorage.getItem(WALKOUT_KEY)); } catch { return null; }
}

export function clearWalkOut(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(WALKOUT_KEY); } catch { /* nothing to clear */ }
}

/** One more listen. Returns the new record; the caller persists it. */
export function countPlay(w: WalkOut): WalkOut {
  return { ...w, plays: w.plays + 1 };
}

// ── the Creator Card credential ──────────────────────────────────────────────────────────────────────────

/**
 * What the card shows for the Passion Pipeline.
 *
 * A READ over the walk-out, never a second record — the same rule the Creator Card already lives under
 * ("no mode may persist its own parallel profile"). `label` is the only string a card should print, so a
 * card cannot invent its own phrasing for an engagement number.
 */
export interface PassionCredential {
  pipeline: 'music';
  /** Tracks this athlete has authored. */
  authored: number;
  /** The one they walk out to, when they have chosen one. */
  walkOut: { title: string; bpm: number } | null;
  plays: number;
  /** Engagement, stated as engagement. Never a rating and never a gate. */
  label: string;
}

export function musicCredential(w: WalkOut | null, authored: number): PassionCredential {
  return {
    pipeline: 'music',
    authored: Math.max(0, Math.floor(authored)),
    walkOut: w ? { title: w.title, bpm: w.bpm } : null,
    plays: w?.plays ?? 0,
    label: w
      ? `${w.title} · ${w.bpm} BPM · ${w.plays} ${w.plays === 1 ? 'play' : 'plays'}`
      : `${Math.max(0, Math.floor(authored))} tracks authored`,
  };
}

// ── ghost duels ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * The walk-out carried on an imported card.
 *
 * A ghost duel plays the OPPONENT'S track, which means this crosses a trust boundary: the record came from
 * somebody else's JSON. It is re-parsed through `parseWalkOut` rather than trusted, and the play count is
 * deliberately DROPPED — an imported card's play total is their number, not something this device adds to.
 */
export function walkOutFromCard(raw: unknown): WalkOut | null {
  const w = parseWalkOut(raw);
  return w ? { ...w, plays: 0 } : null;
}
