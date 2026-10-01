// floorPhase — MUSIC-SUITE P9 FIX PASS (2026-09-29): WHEN A DANCE MOVE IS ON THE FLOOR, and what the room does about a
// move cut short there or held there. Pure (no Babylon, no imports), so chart.ts (which the Arena server imports through
// houseSong.ts) and the tests can read it; DanceMode.ts wires it to the dancer.
//
// What the phase review measured and what was wrong:
//   * A FREEZE HOLD OUTLASTED ITS FREEZE. The baby freeze is a 2-beat clip — STAND at 0, the freeze at ½, held to 1½,
//     STAND again at 2 (danceClips.ts babyFreeze) — and the room loops every move (BeatOwner.loop). Eight charted
//     baby-freeze holds are 2½–3 beats long (cypher bar 21, goldenhour bars 21 and 23, battle bar 22, canals bar 29,
//     evolution bars 25, 27 and 50), so the dancer stood up and dropped again in the middle of a HOLD, and a player who let
//     go when the body stood (1½ beats in) was ~0.9 s early: HOLD DROPPED, a MISS tail, the combo gone. Now, while a press
//     hold is down, the clip stops on its last floor pose (holdPoseDue — a floor move's pose just before its rise) and runs
//     on into its rise the moment the hold ends: the body holds exactly as long as the button does.
//   * A CHART CUT FLOOR MOVES MID-FLOOR. The windmill (8 beats) is on the floor until beat 7, and the authored hooks start
//     the next move at beat 4 (cypher chA / chB, goldenhour ghA, battle bhA, canals khA / kbA, evolution ehA / ebA); the
//     six-step is cut at 4, 6 or 7; battle's side freeze at 3, before its rise at 3¼. The switch was the room's 0.12 s
//     crossfade into a clip that starts from its first (standing) frame: the body went from lying on the floor to standing
//     in 120 ms — 49 times across the six songs by floorCuts (the review counted 50 its own way; floorPhase.test.ts pins
//     the count per song, so a new cut fails). moveFadeSec now gives a switch made while the running move is on the floor a RISE: a crossfade of
//     RISE_FADE_BEATS instead of 0.12 s (the captured moves' own drop is ¾ beat and rise 1 — this is half a beat, so the
//     next move still reads on its beat). Re-authoring the hooks around the floor is the owner's call (the charts are
//     their eye's; the report names it); this makes every such cut a rise, never a snap.
//
// THE TABLE: for each move that goes to the floor, the beat (from the clip's start) the body is DOWN by and the beat its
// RISE begins. From danceClips.ts, where each is built: the procedural baby freeze's keys (freeze at ½, rise from 1½);
// the RECOGNISABLE captured pair (DANCE_CAPTURES: ¾ in, 1 out, 8 beats); MOVE_CAPTURES' plans (inBeats, beats − outBeats).
// danceClips.captures.test.ts holds this table to those plans, so the two cannot drift apart.

/** Beats from a clip's start: when the body is on the floor, and when its rise begins. */
export interface FloorPhase { down: number; rise: number }

export const FLOOR_PHASE: Readonly<Record<string, FloorPhase>> = {
  dance_freeze_baby: { down: 0.5, rise: 1.5 },
  dance_power_windmill: { down: 0.75, rise: 7 },
  dance_footwork_six: { down: 0.75, rise: 7 },
  dance_freeze_side: { down: 0.5, rise: 3.25 },
  dance_power_headstand: { down: 0.75, rise: 3 },
  dance_power_helicopter: { down: 0.75, rise: 3 },
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

/** The room's ordinary crossfade from one move into the next (DanceMode danceMove — unchanged since ANIM-READABILITY). */
export const STEP_FADE_SEC = 0.12;
/** A switch made while the running move is on the floor rises over this many beats instead. NEW TUNED NUMBER (the
 *  owner's eye is the judge): half a beat is 0.24–0.31 s across the six songs (96–126 BPM). */
export const RISE_FADE_BEATS = 0.5;

/**
 * The crossfade into the next move: STEP_FADE_SEC, or a rise (RISE_FADE_BEATS × the beat) when the move being left is
 * still on the floor. `beatsIntoPrev` = song beats since the move being left started (its clip plays at the song's tempo:
 * clips are authored at 120 BPM and played at bpm/120). Pure.
 */
export function moveFadeSec(prevClipId: string | null | undefined, beatsIntoPrev: number, beatSec: number, prevClipBeats?: number): number {
  return onFloor(prevClipId, beatsIntoPrev, prevClipBeats) ? Math.max(STEP_FADE_SEC, RISE_FADE_BEATS * beatSec) : STEP_FADE_SEC;
}

/** How far before its rise a held move stops (beats): a GOOD's drag slows a clip for a moment (DanceMode dragFor), and
 *  the clip must stop while it is still on the floor however it was dragged. */
export const HOLD_POSE_LEAD_BEATS = 0.25;
/** The speed a held pose plays at: effectively stopped (a speed-0 group is legal mid-play — Babylon keeps its frame — but a
 *  tiny positive rate is what CharacterAnimator's own freeze uses, and it is the one proven on this rig). */
export const HOLD_POSE_SPEED = 0.0005;

/**
 * Should the dancer's clip stop on its floor pose now? Only while a press hold is down on THIS move (the held step's clip is
 * the one playing) and the clip has reached its last floor pose (rise − HOLD_POSE_LEAD_BEATS). A standing move, a move
 * whose hold ends before its rise, or no hold at all: the clip plays as authored. Pure.
 */
export function holdPoseDue(o: { holding: boolean; heldClipId: string | null; playingClipId: string | null; beatsInto: number }): boolean {
  if (!o.holding || !o.heldClipId || !o.playingClipId) return false;
  if (o.heldClipId.replace(/\.M$/, '') !== o.playingClipId.replace(/\.M$/, '')) return false;
  const f = floorPhaseOf(o.heldClipId);
  if (!f || !Number.isFinite(o.beatsInto)) return false;
  return o.beatsInto >= f.rise - HOLD_POSE_LEAD_BEATS - 1e-9;
}

/** One move-changing press of a chart, for floorCuts: the clip it starts and its song beat. */
export interface MoveStart { beat: number; clipId: string }

/**
 * Where a chart cuts a move while the body is on the floor: every move start (a called move, or a freestyle slot — a
 * pick dances a new clip) that falls after the running move's drop and before its rise. Pure; `clipBeats` looks a
 * clip's length up (a loop wraps: a move that has run past its end is on its next cycle).
 */
export function floorCuts(starts: readonly MoveStart[], clipBeats: (id: string) => number | undefined): { beat: number; from: string; to: string; into: number }[] {
  const out: { beat: number; from: string; to: string; into: number }[] = [];
  for (let i = 1; i < starts.length; i++) {
    const prev = starts[i - 1], cur = starts[i];
    const into = cur.beat - prev.beat;
    if (onFloor(prev.clipId, into, clipBeats(prev.clipId))) out.push({ beat: cur.beat, from: prev.clipId, to: cur.clipId, into });
  }
  return out;
}
