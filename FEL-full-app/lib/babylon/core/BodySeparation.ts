// BodySeparation — TWO BODIES NEVER STAND INSIDE EACH OTHER, AND NEVER POP APART (lane/hoops-def-tell, owner decision 2026-10-23:
// "rebuild #273 on current release, every number a feel knob"). Spec: #273's T-C (playtest HP-6, "players pass through each other").
// A GAMEPLAY CHANGE, flagged for the owner's feel test; every number below is a knob in the feel panel's "Hoops · defense" group.
//
// Before: 1v1's Havok capsules were the ContactSystem default (radius 0.38), so the solver let two bodies touch at 0.76 m while
// every 1v1 rule (the charge, the reach, the poke) assumed BODY_STANDOFF 1.10; the kinematic path (no Havok) pushed the whole
// overlap out in one frame (a pop); 3v3's pair loop did the same. Now: 1v1's capsule radius is 0.55 (× 2 = BODY_STANDOFF), one
// capped separation runs on both 1v1 paths (Havok: a separating velocity, never a teleport), and 3v3's pair loop caps its push.
// `hoops.bodySepOn` = 0 puts the release's contact back exactly (the 0.38 capsule — read when the mode loads — and the instant push).
//
// Pure: Babylon's Vector3 only; its one other import is the feel panel's `feel()` (the shipped constant unless a playtest override
// is live — never in staked, ranked, head-to-head or agent play).

import { Vector3 } from '@babylonjs/core';
import { BODY_STANDOFF } from './BasketballCore';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs, group "Hoops · defense" (lib/feel-panel/knobs.ts)

/** The switch (1 = #273's separation, shipped ON; 0 = the release's contact exactly). Knob `hoops.bodySepOn`. */
export const BODY_SEP_ON = true;
/** TUNED (from 0.38, the ContactSystem default, → 0.55, #273 PM-approved): both 1v1 Havok capsules' radius (m). × 2 = BODY_STANDOFF,
 *  so the solver itself holds the 1.10 m every 1v1 rule assumes. Read ONCE, when the mode loads its bodies. Knob `hoops.capsuleRadius1v1M`. */
export const ONEVONE_CAPSULE_RADIUS = 0.55;
/** The ContactSystem's own default, which 1v1 used before (and uses again with the switch off). */
export const OLD_CAPSULE_RADIUS = 0.38;
/** TUNED (new, #273): the interpenetration floor — below it the bodies go back to it this frame (capped at SEP_POP_MAX) (m). Knob `hoops.bodyHardGapM`. */
export const BODY_HARD_GAP = 0.90;
/** TUNED (new, #273): the most separation moves a body per second above the hard gap (0.04 m a frame at 60 fps). Knob `hoops.sepPushMps`. */
export const SEP_PUSH_MPS = 2.4;
/** TUNED (new, #273): no correction within this of BODY_STANDOFF — kills chatter (m). Knob `hoops.sepDeadbandM`. */
export const SEP_DEADBAND = 0.01;
/** TUNED (new, #273): the most any body moves in one frame from separation, even below the hard gap (m). Knob `hoops.sepPopMaxM`. */
export const SEP_POP_MAX = 0.10;

/** Is the separation on this frame (the constant, or the panel's A/B override)? */
export function bodySepOn(): boolean {
  return feel('hoops.bodySepOn', BODY_SEP_ON ? 1 : 0) >= 0.5;
}
/** The 1v1 capsule radius to build the bodies with (call it when the bodies are made): 0.55 with the separation on, 0.38 off. */
export function capsuleRadius1v1(): number {
  return bodySepOn() ? feel('hoops.capsuleRadius1v1M', ONEVONE_CAPSULE_RADIUS) : OLD_CAPSULE_RADIUS;
}

export interface SeparateOpts { gap?: number; hardGap?: number; pushMps?: number; popMax?: number; deadband?: number; weightA?: number; weightB?: number }
export interface Separation { overlap: number; pushA: Vector3; pushB: Vector3; touching: boolean }

/** The live numbers (the constants unless a playtest override is live). */
export function liveSeparation(): Required<Pick<SeparateOpts, 'hardGap' | 'pushMps' | 'popMax' | 'deadband'>> {
  return {
    hardGap: feel('hoops.bodyHardGapM', BODY_HARD_GAP),
    pushMps: feel('hoops.sepPushMps', SEP_PUSH_MPS),
    popMax: feel('hoops.sepPopMaxM', SEP_POP_MAX),
    deadband: feel('hoops.sepDeadbandM', SEP_DEADBAND),
  };
}

/**
 * The push that separates two bodies this frame, on XZ. PURE: it returns the push and never writes, so each path applies it its own
 * way (the roots on the kinematic path, a separating velocity on Havok). Inside the deadband: zero. Above the hard gap each body moves
 * at most pushMps·dt. Below it the bodies go back to the hard gap this frame, capped at popMax. The weights split the push.
 */
export function separateBodies(a: Vector3, b: Vector3, dt: number, opts: SeparateOpts = {}): Separation {
  const live = opts.hardGap === undefined || opts.pushMps === undefined || opts.popMax === undefined || opts.deadband === undefined ? liveSeparation() : null;
  const gap = opts.gap ?? BODY_STANDOFF, hard = opts.hardGap ?? live!.hardGap;
  const pushMps = opts.pushMps ?? live!.pushMps, popMax = opts.popMax ?? live!.popMax, deadband = opts.deadband ?? live!.deadband;
  const wa = opts.weightA ?? 0.5, wb = opts.weightB ?? 0.5, wsum = Math.max(1e-6, wa + wb);
  let dx = b.x - a.x, dz = b.z - a.z;
  let dist = Math.hypot(dx, dz);
  if (dist >= gap) return { overlap: 0, pushA: new Vector3(0, 0, 0), pushB: new Vector3(0, 0, 0), touching: false };
  const overlap = gap - dist;
  if (dist < 1e-6) { dx = 1; dz = 0; dist = 0; } else { dx /= dist; dz /= dist; }
  if (overlap <= deadband) return { overlap, pushA: new Vector3(0, 0, 0), pushB: new Vector3(0, 0, 0), touching: true };
  // the total the pair separates this frame
  const cap = Math.max(0, pushMps * dt) * 2;
  let total = Math.min(overlap, cap);
  if (dist < hard) total = Math.min(Math.max(total, hard - dist), popMax * 2);
  const ka = total * (wa / wsum), kb = total * (wb / wsum);
  const capOne = dist < hard ? popMax : Math.max(0, pushMps * dt);
  const sa = Math.min(ka, capOne), sb = Math.min(kb, capOne);
  return { overlap, touching: true, pushA: new Vector3(-dx * sa, 0, -dz * sa), pushB: new Vector3(dx * sb, 0, dz * sb) };
}

/** 3v3's pair loop: the options that cap resolveBodyContact's positional push this frame — {} (the release's instant push) with the
 *  separation off. */
export function contactCap(dt: number): { maxPush?: number; hardGap?: number; popMax?: number; deadband?: number } {
  if (!bodySepOn()) return {};
  const l = liveSeparation();
  return { maxPush: l.pushMps * Math.max(0, dt), hardGap: l.hardGap, popMax: l.popMax, deadband: l.deadband };
}
