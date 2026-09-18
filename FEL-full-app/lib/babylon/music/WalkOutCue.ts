// THE BINDING THAT WAS NEVER BUILT (2026-09-14).
//
// `WalkOut.ts` opens with the Music Room brief's own words, in capitals: "THE BINDING (this is why it
// exists — do not build it standalone)", and names the first of three bindings as the authored track
// becoming the walk-out audio in Dunk Contest.
//
// Audited today: **DunkMode references WalkOut zero times**, and `musicCredential` is consumed by nothing
// but its own test suite. The producer was built, tested and documented; the consumer never was. That is
// the same failure this pass has been finding in `MomentumBus`, `rig.pipeline` and `Coyote` — except this
// one is mine.
//
// THIS FILE IS THE MISSING HALF, AND IT IS THE PURE PART ON PURPOSE. Resolving a walk-out means asking
// questions with real answers — is the song still in the library, whose tempo wins when the record and the
// track disagree, how long does it run before it loops — and every one of them is testable without an
// AudioContext. The mode gets a resolved cue or `null`, and playing it is four lines of glue.
//
// WHY THE TRACK'S OWN TEMPO WINS. `WalkOut` deliberately stores metadata and never a buffer (its decision
// 1: a card that shipped audio would put megabytes into a record copied into ghost-duel links). That makes
// the stored `bpm` a SNAPSHOT of the song at the moment it was chosen, and the author can have re-tempoed
// it since. The library record is the live song; the walk-out record is a pointer with a label on it. When
// they disagree the live one is right, or the contest plays a number that has not been true for weeks.
//
// WHY A MISSING TRACK RESOLVES TO NULL RATHER THAN TO A PLACEHOLDER. A player can delete a song from the
// Studio after choosing it as their walk-out. The honest answer is that there is no walk-out any more —
// the card must not print a title that cannot be heard, because a credential nobody can verify is exactly
// the thing the Creator Card rules refuse.
//
// Pure: no AudioContext, no DOM, no localStorage. It decides WHAT SHOULD PLAY; the mode plays it.

import type { WalkOut } from './WalkOut';

/** The fields of a library TrackRecord this needs. Structural, so the test does not build a whole record. */
export interface WalkOutTrack {
  id: string;
  title: string;
  bpm: number;
  /** data: URL of the rendered mixdown. Synthesised by SynthKit — nothing licensed, nothing to ship. */
  mixdownDataUrl: string;
}

export interface WalkOutCue {
  songId: string;
  /** The LIVE title, from the library — the walk-out's copy can be stale for the same reason its bpm can. */
  title: string;
  bpm: number;
  src: string;
  /** Seconds of music before it repeats, from the arrangement's bars at the live tempo. */
  loopSec: number;
}

/** Seconds one bar of 4/4 lasts at `bpm`. */
export function barSec(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  return (60 / bpm) * 4;
}

/** Seconds `bars` of 4/4 last at `bpm`. */
export function barsSec(bars: number, bpm: number): number {
  if (!Number.isFinite(bars) || bars <= 0) return 0;
  return barSec(bpm) * bars;
}

/**
 * What should play when this athlete walks out, or null if nothing should.
 *
 * `track` is the live library record for `w.songId`, or null when the song is gone.
 */
export function resolveWalkOut(w: WalkOut | null, track: WalkOutTrack | null): WalkOutCue | null {
  if (!w || !track) return null;
  // a record that points at a different song than the one handed in is a caller bug, not a stale tempo
  if (track.id !== w.songId) return null;
  // no audio means nothing to walk out to, whatever the metadata says
  if (!track.mixdownDataUrl) return null;
  const bpm = Number.isFinite(track.bpm) && track.bpm > 0 ? track.bpm : w.bpm;
  return {
    songId: w.songId,
    title: track.title?.trim() ? track.title : w.title,
    bpm,
    src: track.mixdownDataUrl,
    loopSec: barsSec(w.bars, bpm),
  };
}

/**
 * The one line the bezel prints during the walk-out.
 *
 * Kept here rather than in the mode so a mode cannot invent its own phrasing — the same rule the Creator
 * Card lives under, for the same reason.
 */
export function walkOutLine(cue: WalkOutCue | null): string {
  return cue ? `WALK-OUT · ${cue.title}` : '';
}
