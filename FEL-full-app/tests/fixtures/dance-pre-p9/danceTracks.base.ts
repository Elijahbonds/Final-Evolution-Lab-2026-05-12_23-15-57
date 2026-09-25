// FROZEN PRE-P9 COPY: a test fixture, for lib/babylon/core/DanceCore.equivalence.test.ts ONLY. Never import it from
// app code and never edit it. Everything below this header is
// `git show 7ee51e4e:FEL-full-app/lib/babylon/core/danceTracks.ts` with exactly its three import lines changed so it
// resolves from here: the two DanceCore imports point at the frozen ./DanceCore.base, and the DanceExport import is
// spelled '@/lib/babylon/music/DanceExport'. The old core does not import this file; it is frozen so the test can hold
// the cue lane (cueLane / HudCue) to the old one for press steps too.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// danceTracks — the three charts of The Cypher (A+ mission #1, Phase 3).
//
// One routine at fixed constants was the Phase 0 gap: the spec wants three
// tracks at different difficulties, a cue lane the couch can read, a body
// that answers the judgement, and a graded results card. Everything here is
// pure (no Babylon, no audio) so it is testable and so DanceMode stays the
// only place that touches the scene.
//
// Seeds are fixed per track ON PURPOSE: DanceCore's generator is seeded so a
// retry hands the player the same chart (its own rationale). Three tracks =
// three charts, not three dice rolls.

import type { DanceClip, DanceStep, Judgement } from './DanceCore.base';
import { readExportedTrack } from '@/lib/babylon/music/DanceExport';
import { DANCE_LIBRARY } from './DanceCore.base';

export interface DanceTrack {
  id: string;
  name: string;
  bpm: number;
  bars: number;
  difficulty: 1 | 2 | 3;
  seed: number;
  /** One line on the pick screen. */
  blurb: string;
}

export const DANCE_TRACKS: readonly DanceTrack[] = [
  { id: 'warmup', name: 'WARM UP', bpm: 88, bars: 12, difficulty: 1, seed: 0x5150, blurb: 'On the beat · easy moves' },
  { id: 'cypher', name: 'THE CYPHER', bpm: 96, bars: 16, difficulty: 2, seed: 0xc1fe, blurb: 'Waves and six-steps join' },
  { id: 'battle', name: 'BATTLE', bpm: 112, bars: 16, difficulty: 3, seed: 0xba77, blurb: 'Freezes · windmills · off-beat entries' },
];

export const DEFAULT_TRACK_ID = 'cypher';

/**
 * The three shipped charts PLUS the player's exported song, if they have made one.
 *
 * Music Mode's Dance Rhythm export (music/DanceExport.ts) writes one slot; it appears at the end of the
 * pick screen so "dance to the thing I just made" is one left-press away from the default. DANCE_TRACKS
 * stays a shipped constant — a player's song is not shipped content and must not be mistaken for it.
 */
export function allTracks(): readonly DanceTrack[] {
  const mine = readExportedTrack();
  return mine ? [...DANCE_TRACKS, mine.track] : DANCE_TRACKS;
}

export function trackById(id: string | null | undefined): DanceTrack {
  const all = allTracks();
  return all.find((t) => t.id === id) ?? all.find((t) => t.id === DEFAULT_TRACK_ID)!;
}

/** Left/right on the pick screen; wraps. */
export function cycleTrack(id: string, dir: 1 | -1): DanceTrack {
  const all = allTracks();
  const i = Math.max(0, all.findIndex((t) => t.id === id));
  const n = all.length;
  return all[(i + dir + n) % n];
}

/**
 * The steps for a track.
 *
 * A shipped track GENERATES its routine from its seed (a retry must hand back the same chart); the player's
 * exported track carries its own steps, because those steps are the point — they are the song's own drums,
 * and re-generating them from a seed would throw away the thing the export exists to preserve.
 */
export function stepsFor(t: DanceTrack): DanceStep[] | null {
  const mine = readExportedTrack();
  return mine && mine.track.id === t.id ? mine.steps : null;
}

/** `?track=battle` deep link (probes, shares). null when absent or unknown —
 *  the mode then shows the pick screen instead of silently defaulting. */
export function trackFromQuery(search: string | null | undefined): DanceTrack | null {
  if (!search) return null;
  const m = /(?:^|[?&])track=([a-z_]+)/i.exec(search);
  if (!m) return null;
  return DANCE_TRACKS.find((t) => t.id === m[1].toLowerCase()) ?? null;
}

/** The pick-screen line: name · tempo · difficulty pips. */
export function pickBanner(t: DanceTrack): string {
  return `♪ ${t.name}  ·  ${t.bpm} BPM  ·  ${'●'.repeat(t.difficulty)}${'○'.repeat(3 - t.difficulty)}`;
}

/** Seconds the pick screen waits for input before starting the default —
 *  a controller-less viewer (or a capture harness) still gets a routine. */
export const PICK_TIMEOUT_SEC = 6;

// ── grade ─────────────────────────────────────────────────────────────

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** Letter grade on weighted accuracy. Thresholds MATCH DanceCore's star
 *  bands (5★ = S … 2★ = C) so the banner and the card never disagree. */
export function gradeFor(accuracy: number): Grade {
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  if (accuracy >= 0.5) return 'C';
  return 'D';
}

// ── the body answers the judgement ────────────────────────────────────

/** Playback speed multiplier for the step's clip once it is judged: a clean
 *  hit dances it full-out, a GOOD drags, a MISS is a stumble (speed 0 =
 *  "replace the move", the mode plays the react clip). */
export function bodySpeedFor(label: Judgement): number {
  switch (label) {
    case 'PERFECT': return 1;
    case 'GREAT': return 0.95;
    case 'GOOD': return 0.85;
    default: return 0;
  }
}

// ── the cue lane ──────────────────────────────────────────────────────

export const FAMILY_GLYPH: Record<DanceClip['category'], string> = {
  toprock: 'TR', bounce: 'BN', footwork: 'FW', wave: 'WV', freeze: 'FZ', power: 'PW', transition: 'SP',
};

/** Couch-legible family colours (each family = one instrument in the band). */
export const FAMILY_COLOR: Record<DanceClip['category'], string> = {
  toprock: '#F4C542', bounce: '#4FD1E8', footwork: '#7CE577', wave: '#C58BFF', freeze: '#FF8A5B', power: '#FF5E7A', transition: '#E8E8E8',
};

/** One marker on the lane. `in` is seconds until the hit (negative = just passed). */
export interface HudCue {
  in: number;
  name: string;
  family: string;
  glyph: string;
  color: string;
  mirrored: boolean;
}

/** How far ahead the lane shows — about a bar at 96 BPM, readable from a couch. */
export const CUE_LOOKAHEAD_SEC = 2.4;
/** A marker lingers this long past its beat so the hit reads, then leaves. */
export const CUE_LINGER_SEC = 0.2;

/** Build the lane from the performance's upcoming steps (audio-clock times). */
export function cueLane(
  upcoming: readonly { time: number; step: DanceStep }[],
  now: number,
  lookahead: number = CUE_LOOKAHEAD_SEC,
): HudCue[] {
  const out: HudCue[] = [];
  for (const u of upcoming) {
    const dt = u.time - now;
    if (dt < -CUE_LINGER_SEC || dt > lookahead) continue;
    const clip = DANCE_LIBRARY.find((c) => c.id === u.step.clipId);
    const family = clip?.category ?? 'transition';
    out.push({
      in: Math.round(dt * 1000) / 1000,
      name: clip?.name ?? 'MOVE',
      family,
      glyph: FAMILY_GLYPH[family],
      color: FAMILY_COLOR[family],
      mirrored: u.step.mirrored,
    });
  }
  return out.sort((a, b) => a.in - b.in);
}
