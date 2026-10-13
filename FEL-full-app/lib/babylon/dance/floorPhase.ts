// floorPhase — WHEN A DANCE MOVE IS ON THE FLOOR, and the crossfade that leaves it (MUSIC-SUITE P9 FIX PASS, closed PR
// #46, re-landed fresh 2026-10-13, trimmed to the eight DANCE_LIBRARY moves of today's design). Pure, so node tests it;
// DanceMode wires it to playStep.
//
// WHAT WAS WRONG. The room crossfades every move switch over 0.12 s into a clip that starts standing, and loops a move
// until the next step. When the move being left is down on the floor, the body goes from lying to standing in 120 ms.
// The generated charts rarely did that (floorPhase.test.ts: 3 switches across the six songs, all a baby freeze looping
// on its second cycle); an authored chart (dance/chart.ts) starts the next move where the chart wants it, and the
// windmill and the six-step are 8-beat moves: 39 switches across the six shipped charts (warmup 2, cypher 6, goldenhour
// 4, battle 9, canals 9, evolution 9, once the scored-step cap has thinned them) happen mid-floor. moveFadeSec gives a switch made while the running move is on the floor a
// RISE: a crossfade of RISE_FADE_BEATS instead. A switch made standing keeps 0.12 s, byte for byte.
//
// THE TABLE: for each move that goes to the floor, the beat (from the clip's start) the body is DOWN by and the beat its
// RISE begins. From danceClips.ts, where each is built: the procedural baby freeze's keys (down at ½, up from 1½) and
// the captured pair DANCE_CAPTURES (¾ in, 1 out of 8 beats). floorPhase.test.ts holds the table to those.

/** Beats from a clip's start: when the body is on the floor, and when its rise begins. */
export interface FloorPhase { down: number; rise: number }

export const FLOOR_PHASE: Readonly<Record<string, FloorPhase>> = {
  dance_freeze_baby: { down: 0.5, rise: 1.5 },
  dance_power_windmill: { down: 0.75, rise: 7 },
  dance_footwork_six: { down: 0.75, rise: 7 },
};

/** The floor phase of a clip id (a mirrored `<id>.M` reads its base id's), or null for a standing move. */
export function floorPhaseOf(clipId: string | null | undefined): FloorPhase | null {
  if (!clipId) return null;
  return FLOOR_PHASE[clipId.replace(/\.M$/, '')] ?? null;
}

/** Is the body on the floor `beatsInto` beats after the clip started (past its drop, before its rise)? Loops wrap. */
export function onFloor(clipId: string | null | undefined, beatsInto: number, clipBeats?: number): boolean {
  const f = floorPhaseOf(clipId);
  if (!f || !Number.isFinite(beatsInto) || beatsInto < 0) return false;
  const b = clipBeats && clipBeats > 0 ? beatsInto % clipBeats : beatsInto;
  return b > f.down - 1e-9 && b < f.rise - 1e-9;
}

/** The room's ordinary crossfade from one move into the next (DanceMode playStep — unchanged since ANIM-READABILITY). */
export const STEP_FADE_SEC = 0.12;
/** A switch made while the running move is on the floor rises over this many beats instead. NEW TUNED NUMBER (#46's; the
 *  owner's eye is the judge): half a beat is 0.24–0.34 s across the six songs (88–126 BPM). */
export const RISE_FADE_BEATS = 0.5;

/**
 * The crossfade into the next move: STEP_FADE_SEC, or a rise (RISE_FADE_BEATS × the beat) when the move being left is
 * still on the floor. `beatsIntoPrev` = chart beats since the move being left started; `beatSec` = one beat in seconds.
 */
export function moveFadeSec(prevClipId: string | null | undefined, beatsIntoPrev: number, beatSec: number, prevClipBeats?: number): number {
  return onFloor(prevClipId, beatsIntoPrev, prevClipBeats) ? Math.max(STEP_FADE_SEC, RISE_FADE_BEATS * beatSec) : STEP_FADE_SEC;
}
