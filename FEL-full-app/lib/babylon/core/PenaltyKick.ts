// PenaltyKick — the PES read of a penalty as pure numbers (owner, 2026-09-18: "football, tennis and soccer upgrades
// next", after the golf pass: a meter with lines, real physics, weather).
//
// A penalty in PES is THREE decisions under one pressure: WHERE in the goal (the aim), HOW HARD (the power bar — and too
// much of it sails the ball over the bar, which is the whole tension of the bar), and the SHAPE (a curled finesse
// shot, or the chip that floats over a keeper who has already gone). This file turns those into a launch the physics
// ball (SoccerBall: drag, Magnus, bounce) flies, plus the goal FRAME as a thing the ball can hit — "OFF THE POST" and
// "OFF THE BAR" are outcomes now, not a boolean called inFrame.

import { Vector3 } from '@babylonjs/core';

export const GOAL = { halfW: 3.66, barY: 2.44, z: 11, postR: 0.06 } as const;
export const BALL_R = 0.11;
const G = 9.81;

/** The meter's zones — the LINES the player gauges the kick by. Over the last one the ball clears the bar. */
export const METER_ZONES = [
  { to: 0.35, label: 'SOFT' },
  { to: 0.72, label: 'DRIVEN' },
  { to: 0.88, label: 'TOP BINS' },
  { to: 1.0, label: 'OVER' },
] as const;
export const OVER_BAR_FROM = 0.88;
/** A curled ball's spin (rad/s — a free kick spins ~10 rev/s) and how far inside its target it is aimed to bend out to it. */
export const CURL_SPIN = 60, CURL_AIM_IN = 0.28;
export function kickZone(power01: number): string {
  for (const z of METER_ZONES) if (power01 <= z.to) return z.label;
  return 'OVER';
}
/** Ball speed off the boot: a soft side-foot to a driven strike (m/s). */
export function kickSpeed(power01: number): number { return 17 + Math.max(0, Math.min(1, power01)) * 13; }

export interface KickOpts {
  /** −1..1: the stick held ACROSS the strike — a curled finesse shot bends on this (Magnus). */
  curl?: number;
  /** The chip: a floated Panenka over a keeper who has gone. Slow, high, backspin. */
  chip?: boolean;
  /** 0..1 lateral wobble (feints, a soft strike) — `rand` 0..1 decides which way. */
  wobble?: number; rand?: number;
}

/**
 * The launch. `target` is the point on the goal mouth the player aimed at (x across, y up, at GOAL.z); the elevation
 * that carries the ball there under gravity is solved (three fixed-point passes of tan θ = (y + g d² / 2v²cos²θ) / d),
 * and OVER-POWER lifts it further — past OVER_BAR_FROM the strike clears the bar, which is the gamble the top zone is.
 * A curled ball is aimed a little inside its target and bends out to it.
 */
export function launchKick(from: { x: number; y: number; z: number }, target: { x: number; y: number }, power01: number, opts: KickOpts = {}): { vel: Vector3; spin: Vector3; elevationDeg: number } {
  const p = Math.max(0, Math.min(1, power01));
  const curl = Math.max(-1, Math.min(1, opts.curl ?? 0));
  const wobble = (opts.wobble ?? 0) * (((opts.rand ?? 0.5) - 0.5) * 2) * 1.2;
  const tx = target.x + wobble - curl * CURL_AIM_IN, ty = Math.max(0.15, target.y);
  const dx = tx - from.x, dz = GOAL.z - from.z; const d = Math.hypot(dx, dz);
  if (opts.chip) {
    const v = 14.5, th = (26 * Math.PI) / 180;
    const vel = new Vector3((dx / d) * v * Math.cos(th), v * Math.sin(th), (dz / d) * v * Math.cos(th));
    return { vel, spin: new Vector3(-7, 0, 0), elevationDeg: 26 };   // backspin: it floats, then dips under the bar
  }
  const v = kickSpeed(p);
  let cos2 = 1, tan = 0;
  for (let i = 0; i < 3; i++) { tan = ((ty - from.y) + (G * d * d) / (2 * v * v * cos2)) / d; const th = Math.atan(tan); cos2 = Math.cos(th) * Math.cos(th); }
  let th = Math.atan(tan);
  if (p > OVER_BAR_FROM) th += (((p - OVER_BAR_FROM) / (1 - OVER_BAR_FROM)) * 14 * Math.PI) / 180;
  const vel = new Vector3((dx / d) * v * Math.cos(th), v * Math.sin(th), (dz / d) * v * Math.cos(th));
  // curl: y-spin bends the flight (SoccerBall's Magnus: spin × vel). A little topspin (x < 0 lifts, x > 0 dips) keeps a
  // driven ball down — the knuckle of a laces strike.
  const spin = new Vector3(p > 0.6 ? 12 : 0, curl * CURL_SPIN, 0);
  return { vel, spin, elevationDeg: (th * 180) / Math.PI };
}

export interface FrameHit { kind: 'post' | 'bar'; normal: Vector3 }
/** Did the ball just meet the frame? Called with the previous and current positions once per step. */
export function frameHit(prev: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }): FrameHit | null {
  if (!(pos.z >= GOAL.z - 0.3 && pos.z <= GOAL.z + 0.3) || pos.z <= prev.z) return null;
  const r = BALL_R + GOAL.postR;
  if (pos.y <= GOAL.barY + r && Math.abs(Math.abs(pos.x) - GOAL.halfW) <= r) {
    const inside = Math.abs(pos.x) < GOAL.halfW;
    return { kind: 'post', normal: new Vector3((inside ? -1 : 1) * Math.sign(pos.x || 1) * 0.7, 0, -0.7).normalize() };
  }
  if (Math.abs(pos.y - GOAL.barY) <= r && Math.abs(pos.x) <= GOAL.halfW + r) {
    return { kind: 'bar', normal: new Vector3(0, pos.y < GOAL.barY ? -0.7 : 0.7, -0.7).normalize() };
  }
  return null;
}

export type KickOutcome = 'goal' | 'saved' | 'wide' | 'over' | 'short';
/** Where the ball ended against the line, the keeper and the frame. `keeperReach` is the keeper's lateral reach (m). */
export function judgeKick(pos: { x: number; y: number; z: number }, keeperX: number, keeperReach: number, diedShort: boolean): KickOutcome {
  if (diedShort) return 'short';
  if (Math.abs(pos.x - keeperX) <= keeperReach && pos.y < 1.9 && pos.y > 0 && Math.abs(pos.x) < GOAL.halfW) return 'saved';
  if (pos.y >= GOAL.barY - BALL_R) return 'over';
  if (Math.abs(pos.x) >= GOAL.halfW - BALL_R) return 'wide';
  return 'goal';
}
