// TIEBREAK — the tension grade and the ball's trail (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B,
// tiebreak). Pure, so a test can hold each to its rules; TiebreakMode.ts only feeds them the score and the time and applies what
// they say. None of it reads the rally's timing — the window, the flight and the AI are TiebreakBlitz / TiebreakFlight's, and
// nothing here writes to them.
//
//   TENSION    "the crowd darkens, a spotlight-style vignette, a heartbeat pulse" on a set point, a win-by-two run and sudden
//              death. The level comes from the same call the scoreboard prints (matchCall), so the screen and the board agree.
//              The grade is the rig's resting grade pushed toward a pressed, tighter look and a slow heartbeat on the vignette;
//              reduced flashing keeps the pressed look and takes the heartbeat out.
//   TRAIL      The ball's trail level (EffectsKit.TRAIL_LOOK) for each moment of a ball: nothing while it is not in play, a soft
//              line on the way in, a brighter one on the return.

import { matchCall, TARGET } from '../core/TiebreakBlitz';
import type { TrailLevel } from '../visual/EffectsKit';

/** 0..1 — how tense the match is. Zero in the warm-up. Pure; the rungs follow matchCall's own. */
export function tensionLevel(myPts: number, aiPts: number, warmup: number): number {
  if (warmup > 0) return 0;
  const call = matchCall(myPts, aiPts);
  if (call === 'SUDDEN DEATH') return 1;
  if (call === 'WIN BY 2') return 0.75;
  if (call.startsWith('SET POINT')) return 0.6;
  // regulation: a faint rise as the score climbs, so the screen leans in before the first set point
  return 0.12 * Math.min(1, (myPts + aiPts) / (2 * (TARGET - 1)));
}

/** The beat shape of a heart: a hard lub and a softer dub 0.18 of a beat later. 0..1 at phase 0..1. */
export function heartbeat(phase01: number): number {
  const p = ((phase01 % 1) + 1) % 1;
  const bump = (c: number, w: number): number => Math.exp(-(((p - c) / w) ** 2));
  return Math.min(1, bump(0.02, 0.06) + 0.6 * bump(0.2, 0.07));
}

/** TUNED (new): the heart's rate at no tension and at full tension (beats a minute). */
export const HEART_BPM = { min: 62, max: 104 };
export const heartRate = (level: number): number => HEART_BPM.min + (HEART_BPM.max - HEART_BPM.min) * Math.min(1, Math.max(0, level));

export interface RestGrade { exposure: number; vignette: number }

/** TUNED (new): how far full tension pushes the resting grade — exposure down by this share, the vignette up by this much — and
 *  how much the heartbeat tightens the vignette on top, at its peak. (The pulse rides the VIGNETTE, not the exposure: the rig's
 *  flash beat — a momentum tier, a made shot — owns the pipeline's exposure while it decays, and a per-frame exposure write
 *  from a mode would cancel it. The dimming goes through the rig's owned rest, which the flash returns to.) */
export const TENSION = { dim: 0.08, vignette: 0.9, pulse: 0.35 };

/** The resting grade at tension `level`: the rig's own grade dimmed and tightened. `base` is never modified. Writes `out`. Pure. */
export function tensionRest(base: RestGrade, level: number, out: RestGrade): RestGrade {
  const k = Math.min(1, Math.max(0, level));
  out.exposure = base.exposure * (1 - TENSION.dim * k);
  out.vignette = base.vignette + TENSION.vignette * k;
  return out;
}

/** How hard the heart is beating, 0..1, `t` seconds into the match. Only from "set point" up (level ≥ 0.5), fading in over the
 *  next tenth; 0 under reduced flashing (the pressed look stays, the pulse goes). Pure. */
export function tensionPulse(level: number, t: number, flashes: boolean): number {
  if (!flashes) return 0;
  const k = Math.min(1, Math.max(0, level));
  return Math.min(1, Math.max(0, (k - 0.5) / 0.1)) * heartbeat((t * heartRate(k)) / 60);
}

/** The trail for the ball's moment: out of play = off; the ball coming in = soft; your return flying out = hang. */
export function trailFor(awaiting: boolean, goingOut: boolean): TrailLevel {
  if (!awaiting) return 'off';
  return goingOut ? 'hang' : 'soft';
}
