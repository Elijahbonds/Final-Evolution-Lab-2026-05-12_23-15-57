// HoopsStick — THE BALL HANDLER ANSWERS THE STICK (lane/hoops-reverse, owner decision 2026-10-23: port the useful part of PR #311, "H3a").
//
// Two things live here:
//   1. THE REVERSAL FIX (on by default — a bug fix). CourtMovement steered the velocity toward the stick with Lerp(dir, wantDir).normalize().
//      For a stick thrown straight back the lerp shrinks along the same line and normalises back to the OLD direction, so after the plant
//      the handler ran the old way again (measured on the rig: back up to a full jog the old way, never reversing until the sideline). A
//      stick at least REVERSE_DEG round from the travel is now a reversal: hold the line, brake through zero at REVERSE_DECEL, push off the
//      new way. (#311's fix, ported: `reverseDeg`, `reverseDecel`.)
//   2. EVERY H3a STICK NUMBER AS A FEEL KNOB (group "Hoops · movement"). Each default is TODAY'S release value, so nobody's game changes
//      unless the owner dials a knob in on the feel panel (an unpaid playtest run only — lib/feel-panel). The H3a values #311 tuned are
//      the H3A_STICK_PRESET below (and the table in docs/FEEL-PANEL.md): paste it into the panel to feel #311.
//
// Pure: the numbers, the per-frame read (liveGears), and three small helpers CourtMovement calls. No Babylon import beyond a Vector3 type.

import type { Vector3 } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';
import type { GearTuning } from './CourtMovement';

// ── the gears (GEARS_HOOPS): release values, the defaults everyone plays ──────────────────────────────────────────────────────────────
/** s — the lag to the jog target. H3a: 0.10. */
export const HOOPS_JOG_TAU = 0.17;
/** s — the lag to the sprint target. H3a: 0.10. */
export const HOOPS_SPRINT_TAU = 0.15;
/** m/s² — the accel cap toward a jog target. H3a: 22. */
export const HOOPS_JOG_ACCEL = 15;
/** m/s² — the accel cap toward a sprint target. H3a: 26. */
export const HOOPS_SPRINT_ACCEL = 24;
/** The loaded first step: under `loadBelow` the accel starts at this share. H3a: 0.7 (a lighter load). */
export const HOOPS_LOAD_SCALE = 0.45;
/** m/s² toward a lower target with the stick held (letting off the turbo). H3a: 12. */
export const HOOPS_GEAR_DOWN_DECEL = 9;
/** m/s² — the stop at a walk (stick released). H3a: 32. */
export const HOOPS_STOP_DECEL_LOW = 22;
/** m/s² — the stop at top speed (a sprint slides longer). H3a: 26. */
export const HOOPS_STOP_DECEL_HIGH = 11;
/** m/s² — the plant's bleed on a hard change of direction at pace. Today's is DEFAULT_MOVEMENT.decel × 1.4 (34 × 1.4). H3a: 34. */
export const HOOPS_PLANT_DECEL = 47.6;
/** °/s — the ball handler's velocity turn rate (DribbleController only; DEFAULT_MOVEMENT.turnRateDegAtSpeed). H3a: 720. */
export const HOOPS_HANDLER_TURN_DEG = 540;

// ── H3a's new numbers (new), defaults = what release does today ───────────────────────────────────────────────────────────────────────
/** (new) 1 = a turn under the reversal is a real rotation (slerp) at the turn rate; 0 = today's lerp-and-normalise, which turns a wide
 *  angle slower than the rate says (a 90° stick at ~64 % of it). H3a: 1. */
export const HOOPS_TURN_TRUE_ARC = 0;
/** (new) s — the sprint press's kick is spread over this; 0 = added in one frame (today: 0.9 m/s in a frame, 54 m/s²). H3a: 0.1. */
export const HOOPS_KICK_SEC = 0;
/** (new) s — the cut cost is paid over this, no re-acceleration meanwhile; 0 = paid in one frame (today). H3a: 0.08. */
export const HOOPS_CUT_SEC = 0;
/** (new) m/s³ — the most the speed's acceleration may change in a second (the push, the plant, the stop); 0 = off (today). H3a: 900. */
export const HOOPS_JERK = 0;
/** (new) ° — a stick at least this far round from the travel is a REVERSAL: brake through zero, then push off the new way. THE FIX: on by
 *  default (#311's 135). At 180 only an exact pull-back reverses. */
export const HOOPS_REVERSE_DEG = 135;
/** (new) m/s² — the brake through zero on a reversal, after the plant. assumption: the default is today's plant bleed (47.6), so the
 *  fixed reversal brakes exactly as hard as the plant it follows. H3a: 34. */
export const HOOPS_REVERSE_DECEL = 47.6;

/** TUNED (new) — owner decision 2026-10-24: "a real backpedal is slower than running forward". The share of JOG speed the handler may reach
 *  while RETREATING: the stick held against his facing (DribbleController's retreat dribble — the stick past 120° from the facing it holds,
 *  committed). Forward running, sprinting and lateral slides never read it. 1 = no cap (the game before this number). */
export const HOOPS_RETREAT_SPEED_K = 0.7;

// ── hoops-p01 (controls that answer, 1v1 / 3v3 ten-phase pass phase 1): THE BALL HANDLER'S GEARS ────────────────────────────────────────
// The DribbleController (every 1v1 / 3v3 body) runs on GEARS_HANDLER (core/CourtMovement); GEARS_HOOPS above stays release for the dunk
// approach (DunkMode — another lane's mode). The knobs read the handler's numbers as their defaults, so the panel's reset is the handler's
// game (the dunk approach keeps its own unless a knob is dialled); RELEASE_STICK_PRESET puts the release stick back in one paste.
/** TUNED (hoops-p01) 22 → 32 m/s² — the handler's stop at a walk: H3a's own number (#311). Gate: the stop from a jog ≤ 0.25 s / ≤ 0.6 m. */
export const HANDLER_STOP_DECEL_LOW = 32;
/** TUNED (hoops-p01) 11 → 26 m/s² — the handler's stop at top speed: H3a's. Release slid a sprint 0.42 s / 1.40 m; gate ≤ 0.35 s / ≤ 1.0 m. */
export const HANDLER_STOP_DECEL_HIGH = 26;
/** TUNED (hoops-p01) 0.17 → 0.10 s — the lag to the jog: H3a's. Gate: 90 % of the jog's pace ≤ 0.25 s (release 0.45 s). */
export const HANDLER_JOG_TAU = 0.1;
/** TUNED (hoops-p01) 15 → 22 m/s² — the accel cap toward the jog: H3a's. */
export const HANDLER_JOG_ACCEL = 22;
/** TUNED (hoops-p01) 0.45 → 0.7 — the loaded first step: H3a's lighter load. */
export const HANDLER_LOAD_SCALE = 0.7;
/** TUNED (new, hoops-p01) m/s — THE FIRST STEP: a stick pushed from a standstill starts the body at this speed on the press's own frame, then
 *  the loaded ramp takes over — the press is answered in the frame it lands. Gate: the root moves 2 cm ≤ 2 frames from the press (release
 *  4, H3a 3). 0 = no step (release). assumption: the least that meets the gate on H3a's ramp with a margin; not felt yet. */
export const HANDLER_FIRST_STEP_MPS = 0.3;
/** TUNED (new, hoops-p01) — THE PLANT ON A REVERSAL. 1 = release: a stick thrown back at pace plants and HOLDS the plant's floor speed on the
 *  OLD line for the rest of the plant (0.12 s; 2.7 m/s the wrong way from a jog, measured), then brakes through zero; 0 = the plant is the
 *  brake: it bleeds straight through zero at the plant's own rate and ends there. Turns and cuts under the reversal angle keep their plant. */
export const HANDLER_REVERSE_PLANT_HOLD = 0;
/** TUNED (new, hoops-p01) s — THE PUSH-OFF: out of a reversal the first step the new way is a launch for this long (no loaded step, the accel
 *  caps × LAUNCH_BOOST — what a move's explode already gets). 0 = release (a loaded step from zero). Gate: a reversal at pace reaches half
 *  the pace the new way ≤ 0.22 s (release 0.45 s, H3a 0.38 s). assumption: 0.2 s, the least that meets it (0.3 measured the same). */
export const HANDLER_REVERSE_LAUNCH_SEC = 0.2;

/** hoops-p01: the release stick as feel-panel values — paste it to put the ball handler back exactly as it shipped before this phase. */
export const RELEASE_STICK_PRESET: Readonly<Record<string, number>> = Object.freeze({
  'hoops.jogTau': HOOPS_JOG_TAU,
  'hoops.jogAccel': HOOPS_JOG_ACCEL,
  'hoops.loadScale': HOOPS_LOAD_SCALE,
  'hoops.stopDecelLow': HOOPS_STOP_DECEL_LOW,
  'hoops.stopDecelHigh': HOOPS_STOP_DECEL_HIGH,
  'hoops.firstStepMps': 0,
  'hoops.reversePlantHold': 1,
  'hoops.reverseLaunchSec': 0,
});

/** THE H3a PRESET: #311's tuned stick (owner 2026-10-16/17, "acceleration felt off… too twitchy"), as feel-panel values. Paste it into the
 *  panel (Copy values' own format) to play it; docs/FEEL-PANEL.md has the from → to table. */
export const H3A_STICK_PRESET: Readonly<Record<string, number>> = Object.freeze({
  'hoops.jogTau': 0.1,
  'hoops.sprintTau': 0.1,
  'hoops.jogAccel': 22,
  'hoops.sprintAccel': 26,
  'hoops.loadScale': 0.7,
  'hoops.gearDownDecel': 12,
  'hoops.stopDecelLow': 32,
  'hoops.stopDecelHigh': 26,
  'hoops.plantDecel': 34,
  'hoops.handlerTurnDeg': 720,
  'hoops.turnTrueArc': 1,
  'hoops.kickSec': 0.1,
  'hoops.cutSec': 0.08,
  'hoops.jerk': 900,
  'hoops.reverseDeg': 135,
  'hoops.reverseDecel': 34,
  // hoops-p01: #311 had none of these — its stick is theirs at release
  'hoops.firstStepMps': 0,
  'hoops.reversePlantHold': 1,
  'hoops.reverseLaunchSec': 0,
});

/** The gears for this frame: `base` (GEARS_HOOPS, or a test's copy) with the feel panel's overrides, written into `out` (no allocation).
 *  A field `base` leaves out stays out — a gears object that never opted into a knob is never moved by it. */
export function liveGears(base: GearTuning, out: GearTuning): GearTuning {
  out.walkStick = base.walkStick; out.walkFactor = base.walkFactor; out.loadBelow = base.loadBelow;
  out.sprintKick = base.sprintKick; out.kickAbove = base.kickAbove;
  out.jogTau = feel('hoops.jogTau', base.jogTau);
  out.sprintTau = feel('hoops.sprintTau', base.sprintTau);
  out.jogAccel = feel('hoops.jogAccel', base.jogAccel);
  out.sprintAccel = feel('hoops.sprintAccel', base.sprintAccel);
  out.loadScale = feel('hoops.loadScale', base.loadScale);
  out.gearDownDecel = feel('hoops.gearDownDecel', base.gearDownDecel);
  out.stopDecelLow = feel('hoops.stopDecelLow', base.stopDecelLow);
  out.stopDecelHigh = feel('hoops.stopDecelHigh', base.stopDecelHigh);
  out.plantDecel = base.plantDecel === undefined ? undefined : feel('hoops.plantDecel', base.plantDecel);
  out.turnRateDeg = base.turnRateDeg === undefined ? undefined : feel('hoops.handlerTurnDeg', base.turnRateDeg);
  out.trueArc = base.trueArc === undefined ? undefined : feel('hoops.turnTrueArc', base.trueArc);
  out.kickSec = base.kickSec === undefined ? undefined : feel('hoops.kickSec', base.kickSec);
  out.cutSec = base.cutSec === undefined ? undefined : feel('hoops.cutSec', base.cutSec);
  out.jerk = base.jerk === undefined ? undefined : feel('hoops.jerk', base.jerk);
  out.reverseDeg = base.reverseDeg === undefined ? undefined : feel('hoops.reverseDeg', base.reverseDeg);
  out.reverseDecel = base.reverseDecel === undefined ? undefined : feel('hoops.reverseDecel', base.reverseDecel);
  // hoops-p01: the handler's own (GEARS_HANDLER defines them; GEARS_HOOPS — the dunk approach — does not, so they never move it)
  out.firstStep = base.firstStep === undefined ? undefined : feel('hoops.firstStepMps', base.firstStep);
  out.reversePlantHold = base.reversePlantHold === undefined ? undefined : feel('hoops.reversePlantHold', base.reversePlantHold);
  out.reverseLaunchSec = base.reverseLaunchSec === undefined ? undefined : feel('hoops.reverseLaunchSec', base.reverseLaunchSec);
  return out;
}

/** The retreat cap for this frame (core/CourtMovement.retreatK): the knob when the stick is committed (past 0.6) and held more than 120°
 *  from the facing (`facingX`, `facingZ`: the facing the retreat dribble holds), else 1 (no cap). Stick space as CourtMovement: +Y = −Z. */
export function retreatCapK(moveX: number, moveY: number, facingX: number, facingZ: number): number {
  const mag = Math.hypot(moveX, moveY);
  if (mag <= 0.6) return 1;
  const back = (moveX * facingX - moveY * facingZ) / mag;
  return back < -0.5 ? feel('hoops.retreatSpeedK', HOOPS_RETREAT_SPEED_K) : 1;
}

/** The speed after a jerk limit: the acceleration (newSpeed − speed) / dt may differ from last frame's `accPrev` by at most `jerk`·dt.
 *  `idt` is 1 / dt, or 0 for a frame with no time (#311's zero-dt fix: 0 / 0 made NaN and spread through the 3v3 contacts). */
export function jerkLimit(speed: number, newSpeed: number, accPrev: number, jerk: number, dt: number, idt: number): number {
  const want = (newSpeed - speed) * idt, j = jerk * dt;
  const a = Math.max(accPrev - j, Math.min(accPrev + j, want));
  return want >= 0 ? Math.min(newSpeed, speed + a * dt) : Math.max(newSpeed, speed + a * dt);
}

/** Turn the unit travel `dir` toward the unit `want` (`angle` apart) by the share `k` of the angle. `trueArc`: a real rotation (slerp),
 *  well conditioned under ~178°; otherwise today's lerp-and-normalise. Mutates and returns `dir`. */
export function turnToward(dir: Vector3, want: Vector3, angle: number, k: number, trueArc: boolean): Vector3 {
  if (trueArc && angle < Math.PI * 0.99) {
    const so = Math.sin(angle), a = Math.sin((1 - k) * angle) / so, b = Math.sin(k * angle) / so;
    dir.set(dir.x * a + want.x * b, dir.y * a + want.y * b, dir.z * a + want.z * b);
  } else dir.set(dir.x + (want.x - dir.x) * k, dir.y + (want.y - dir.y) * k, dir.z + (want.z - dir.z) * k);
  return dir.normalize();
}
