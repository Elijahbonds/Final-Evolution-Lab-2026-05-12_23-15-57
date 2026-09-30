// danceCard — A PUBLISHED DANCE CARD, PLAYED IN THE CYPHER (MUSIC-SUITE P9, 2026-09-29, PLAN phase 9: "dance cards playable").
//
// WHAT WAS WRONG (understand-wf map, "The equipped dance card never plays, and the card loses its BPM"): a creator builds a
// routine in /create (components/creator/modes/dance-mode.tsx), publishes it as a dance card (ArtPayload kind 'dance':
// choreographyId + sequence), and My Creations' only action was EQUIP — which stashes it for a dunk celebration whose
// reader (lib/modes/dance/active-routine.ts getEquippedRoutine) has no consumer anywhere. So a published routine never
// danced. And the card lost its tempo on the way: the builder publishes `bpm`, app/create/page.tsx dropped it.
//
// NOW. My Creations' DANCE IT puts the card on this device (writeCardPlay) and opens /play/dance?card=<id>; the room finds
// it in the pick list (danceTracks.allTracks — after the six songs and the player's own export) focused, and plays the
// card's own routine as a chart at the card's own tempo: every move of the routine is a press step called on its beat, the
// routine repeated back to back until it fills CARD_MIN_BARS (a routine is danced more than once through — a 3-move card
// is ten beats), the FEL synth band (StemBand) at the card's BPM underneath, each move's family earning its instrument.
// A card has no song and no freestyle bars. It is the player's own content, so it is FREE PLAY ONLY (owner decision #10:
// "own songs free play only") — an Arena run dances its house song and never reads this slot (houseSongSteps).
//
// A card's sequence came off the server and was typed by a person: it is PARSED, never trusted. Only moves the room can
// dance (dance/moves.ts — DANCE_LIBRARY's and the captured ones) survive, each step becomes a plain PRESS step (clipId,
// beat, the move's own length, mirrored — no body target, no press-only field can ride in), beats must be finite and
// inside the card's own limits, overlapping starts are dropped, and a card with nothing left is no card. Pure except
// the two storage calls, which never throw.

import type { DanceStep } from '../core/DanceCore';
import type { DanceTrack } from '../core/danceTracks';
import { danceMove } from './moves';

/** The track id prefix a card plays under (never a shipped song's id, never the export's). */
export const CARD_TRACK_PREFIX = 'card:';
/** The builder's own tempo range and default (components/creator/modes/dance-mode.tsx: a 60–140 slider, 96). A card
 *  published before its BPM was kept plays at the default. */
export const CARD_BPM_MIN = 60;
export const CARD_BPM_MAX = 140;
export const CARD_BPM_DEFAULT = 96;
/** A card's routine repeats until the chart is at least this many bars (the Groove Academy's grid export loops 8 bars —
 *  owner decision #32; a routine that is the whole run gets twice that). NEW TUNED NUMBER. */
export const CARD_MIN_BARS = 16;
/** The most steps a card chart carries (the creative-card validator's 64-step routine, looped at most twice over — the
 *  pre-P7 export's 128, which the free-play dance ceiling has always covered). */
export const CARD_MAX_STEPS = 128;
/** A card step's beat must sit inside the routine's first this-many beats (a 64-step routine of 8-beat moves). */
const CARD_MAX_BEAT = 64 * 8;

/** What the Cypher needs of a card. */
export interface DanceCardPlay {
  id: string;
  title: string;
  bpm: number;
  /** The card's routine as published (parsed by cardRoutine; never read raw). */
  sequence: unknown;
}

/** The card's routine as press steps, sorted, overlaps dropped; null when nothing danceable is left. Pure. */
export function cardRoutine(sequence: unknown): DanceStep[] | null {
  if (!Array.isArray(sequence)) return null;
  const parsed: DanceStep[] = [];
  for (const raw of sequence.slice(0, 64)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const move = typeof r.clipId === 'string' ? danceMove(r.clipId) : null;
    const beat = typeof r.beat === 'number' ? r.beat : NaN;
    if (!move || !Number.isFinite(beat) || beat < 0 || beat > CARD_MAX_BEAT) continue;
    parsed.push({ clipId: move.id, beat, holdBeats: move.beats, mirrored: r.mirrored === true });
  }
  parsed.sort((a, b) => a.beat - b.beat);
  const out: DanceStep[] = [];
  for (const s of parsed) if (!out.length || s.beat > out[out.length - 1].beat) out.push(s);   // one move per beat
  if (!out.length) return null;
  const t0 = out[0].beat;   // the routine starts on beat 0 of the chart, whatever beat the builder began on
  return out.map((s) => ({ ...s, beat: s.beat - t0 }));
}

/** The routine repeated back to back, each pass starting on a bar line, until the chart covers at least `minBars` bars
 *  (and never more than CARD_MAX_STEPS steps). Returns the steps and the chart's length in bars. Pure. */
export function loopCardRoutine(routine: readonly DanceStep[], minBars: number = CARD_MIN_BARS): { steps: DanceStep[]; bars: number } {
  if (!routine.length) return { steps: [], bars: 0 };
  const last = routine[routine.length - 1];
  const passBars = Math.max(1, Math.ceil((last.beat + last.holdBeats) / 4));
  const passes = Math.max(1, Math.min(Math.ceil(minBars / passBars), Math.floor(CARD_MAX_STEPS / routine.length) || 1));
  const steps: DanceStep[] = [];
  for (let p = 0; p < passes; p++) for (const s of routine) steps.push({ ...s, beat: s.beat + p * passBars * 4 });
  return { steps, bars: passes * passBars };
}

/** A card's tempo: its own BPM inside the builder's range, else the builder's default. Pure. */
export function cardBpm(bpm: unknown): number {
  return typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= CARD_BPM_MIN && bpm <= CARD_BPM_MAX ? Math.round(bpm) : CARD_BPM_DEFAULT;
}

/** The pick-list track and the chart a card plays as, or null when the card has no danceable routine. Pure. */
export function cardTrack(card: DanceCardPlay): { track: DanceTrack; steps: DanceStep[] } | null {
  const routine = cardRoutine(card.sequence);
  if (!routine || !card.id) return null;
  const { steps, bars } = loopCardRoutine(routine);
  const hardest = Math.max(...routine.map((s) => danceMove(s.clipId)?.difficulty ?? 1));
  const title = (card.title || 'MY ROUTINE').toUpperCase().slice(0, 28);
  const track: DanceTrack = {
    id: `${CARD_TRACK_PREFIX}${card.id}`,
    name: title,
    bpm: cardBpm(card.bpm),
    bars,
    difficulty: Math.min(3, Math.max(1, hardest)) as 1 | 2 | 3,
    seed: 1,
    blurb: `Your routine · ${routine.length} move${routine.length === 1 ? '' : 's'} · free play`,
  };
  return { track, steps };
}

/** Is this track id a card's? */
export const isCardTrackId = (id: string | null | undefined): boolean => !!id && id.startsWith(CARD_TRACK_PREFIX);

/** A creative card's dance payload as what the room plays (null for any other kind). Pure. */
export function cardPlayFrom(card: { id: string; title: string; art: { kind: string; sequence?: unknown; bpm?: unknown } }): DanceCardPlay | null {
  if (card.art.kind !== 'dance') return null;
  return { id: card.id, title: card.title, bpm: cardBpm(card.art.bpm), sequence: card.art.sequence };
}

// ── the device slot (one card at a time, like the export's) ─────────────────────────────────────────────────────────

export const DANCE_CARD_PLAY_KEY = 'fel:danceCardPlay';

/** Put a card on this device for the Cypher. False when storage is refused (the room then has no card to show). */
export function writeCardPlay(card: DanceCardPlay): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(DANCE_CARD_PLAY_KEY, JSON.stringify({ v: 1, id: card.id, title: card.title, bpm: card.bpm, sequence: card.sequence }));
    return true;
  } catch { return false; }
}

/** The card on this device as the room plays it, or null (none, storage refused, or nothing danceable in it). */
export function readCardTrack(): { track: DanceTrack; steps: DanceStep[] } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(DANCE_CARD_PLAY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DanceCardPlay> & { v?: number };
    if (!v || typeof v.id !== 'string' || typeof v.title !== 'string') return null;
    return cardTrack({ id: v.id, title: v.title, bpm: cardBpm(v.bpm), sequence: v.sequence });
  } catch { return null; }
}

/** `?card=<id>` (My Creations' DANCE IT): the card track id to focus, or null. */
export function cardIdFromQuery(search: string | null | undefined): string | null {
  if (!search) return null;
  const m = /(?:^|[?&])card=([^&#]+)/.exec(search);
  if (!m) return null;
  try { return `${CARD_TRACK_PREFIX}${decodeURIComponent(m[1])}`; } catch { return null; }
}
