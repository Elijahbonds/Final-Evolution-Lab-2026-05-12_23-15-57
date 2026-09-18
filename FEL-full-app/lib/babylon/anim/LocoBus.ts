// LocoBus — the shared loco / facing / arms decisions every on-foot body makes (SHARED-ANIM-BUS, 2026-09-14).
//
// Three questions every mode answered for itself, differently, per frame:
//   LOCO    which loop — idle / walk / run / sprint, or a strafe / backpedal when the body is facing something it is
//           not travelling toward. Sprint picked `run`/`walk` off its own thresholds, big air off others, and the run
//           cycle played at one rate whatever the speed (feet skating at a jog, treading water at a sprint).
//   FACING  where the body turns, and how fast. Football, dunk and the duel each hand-rolled the same shortest-arc
//           rate clamp; the next mode to copy it gets the wrap wrong.
//   ARMS    what a body's hands may do in a window. This is the one that shipped wrong (measured on 2a0304b, dev, the
//           hero's rig per rendered frame, chest frame): the derby batter's stance held both hands 0.13–0.15 m BEHIND
//           the chest with the lead arm dragged 0.47 m across it and its elbow locked at 178° (786 of 816 stance frames);
//           the skater cruised with the front hand 0.03 m under its shoulder and the back hand 0.33 m out (503 of 503
//           ride frames above the ride limit — the "stiff T" read); and the football runner's tackle key threw both
//           hands out to shoulder height while the TD beat was a karate uppercut — on a one-mesh scan body those poses
//           stretch the jacket into the "purple melt" the eye called out.
//
// Pure functions only: the trees and modes call these, the authored-clip tests hold the clips to ARM_LIMITS, and the
// probe / production readout grade a live rig with the same `armsVerdict`. The loop's playback rate is StrideMatch's
// (the calibrated run reference and rate limits) — this module picks the loop, it does not re-derive the stride.

import { HOOPS_STRIDE, strideRate } from '../core/StrideMatch';

export type LocoWindow = 'idle' | 'walk' | 'run' | 'sprint' | 'strafe_left' | 'strafe_right' | 'backpedal';

export interface LocoTune {
  /** m/s above which the body walks / runs / sprints. */
  walkAt: number; runAt: number; sprintAt: number;
  /** The speed each cycle's stride matches the ground at (StrideMatch.strideRate scales and clamps against these). */
  walkRef: number; runRef: number; strafeRef: number;
}

// runRef is StrideMatch's calibrated run (foot-slide probe, live 1v1). walkRef / strafeRef — assumption: a 1.4 m/s walk
// and a 1.0 m/s side step, not yet calibrated against a foot-slide probe.
export const LOCO_TUNE: LocoTune = { walkAt: 0.6, runAt: 2.8, sprintAt: 6.5, walkRef: 1.4, runRef: HOOPS_STRIDE.run, strafeRef: 1.0 };

/** The clip each window plays — core names, so every scope owns them (clipScope.ts). A sprint is the run at a faster
 *  rate: the alias `sprint_forward` is the same loop at a fixed 1.4×, which would double-count the stride rate. */
export const LOCO_CLIP: Record<LocoWindow, string> = {
  idle: 'idle_stand', walk: 'walk', run: 'run', sprint: 'run',
  strafe_left: 'strafe_left', strafe_right: 'strafe_right', backpedal: 'run_backward',
};

export interface LocoIn {
  /** Ground speed, m/s. */
  speed: number;
  /** Travel direction (world XZ; any length). Ignored below walkAt. */
  moveX?: number; moveZ?: number;
  /** A yaw the body must keep facing while it moves (a lock-on, a defender, a ball). Absent = face the travel. */
  lockYaw?: number | null;
}

export interface LocoOut { window: LocoWindow; clip: string; rate: number; faceYaw: number | null }

export const wrapYaw = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Pick the loop, its playback rate and the yaw to face. `faceYaw` null = keep the current facing (standing still). */
export function locoPick(i: LocoIn, t: LocoTune = LOCO_TUNE): LocoOut {
  const v = Math.max(0, i.speed);
  if (v < t.walkAt) return { window: 'idle', clip: LOCO_CLIP.idle, rate: 1, faceYaw: i.lockYaw ?? null };
  const has = i.moveX !== undefined && i.moveZ !== undefined && Math.hypot(i.moveX, i.moveZ) > 1e-6;
  const travel = has ? Math.atan2(i.moveX!, i.moveZ!) : null;
  if (i.lockYaw != null && travel != null) {
    // facing something else: the angle between where the body looks and where it goes decides the loop
    const off = wrapYaw(travel - i.lockYaw);
    if (Math.abs(off) > (3 * Math.PI) / 4) return { window: 'backpedal', clip: LOCO_CLIP.backpedal, rate: strideRate(v, t.runRef), faceYaw: i.lockYaw };
    if (Math.abs(off) > Math.PI / 4) {
      // +off = travel clockwise of the facing (to the body's right when +z is forward and +x is right)
      const w: LocoWindow = off > 0 ? 'strafe_right' : 'strafe_left';
      return { window: w, clip: LOCO_CLIP[w], rate: strideRate(v, t.strafeRef), faceYaw: i.lockYaw };
    }
  }
  const face = i.lockYaw ?? travel;
  if (v < t.runAt) return { window: 'walk', clip: LOCO_CLIP.walk, rate: strideRate(v, t.walkRef), faceYaw: face };
  if (v < t.sprintAt) return { window: 'run', clip: LOCO_CLIP.run, rate: strideRate(v, t.runRef), faceYaw: face };
  return { window: 'sprint', clip: LOCO_CLIP.sprint, rate: strideRate(v, t.runRef), faceYaw: face };
}

/** Turn `cur` toward `target` along the shortest arc at no more than `ratePerSec` rad/s. Frame-rate independent (the
 *  step is a rate × dt clamp, never a per-frame fraction) and never overshoots. Returns the wrapped yaw. */
export function stepYaw(cur: number, target: number, dt: number, ratePerSec: number): number {
  const d = wrapYaw(target - cur);
  const max = Math.max(0, ratePerSec) * Math.max(0, dt);
  return wrapYaw(cur + Math.sign(d) * Math.min(Math.abs(d), max));
}

// ── ARMS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A hand off its own shoulder in the CHEST frame, metres: fwd (+ in front of the chest), up (+ above the shoulder),
 *  out (+ away from the body's midline). */
export interface HandInChest { fwd: number; up: number; out: number }

/** The windows a body's arms are judged in. Locomotion and stances are strict; a trick, a strike or a flush is free. */
export type ArmWindow = 'loco' | 'stance' | 'ride' | 'carry' | 'celebrate' | 'free';

export interface ArmLimit {
  /** How far a hand may sit BEHIND the chest plane. */
  maxBehind: number;
  /** How far a hand may rise above its shoulder. */
  maxUp: number;
  /** A hand out wider than this AND higher than `teeUp` is a T. */
  teeOut: number; teeUp: number;
}

export const ARM_LIMITS: Record<ArmWindow, ArmLimit> = {
  // a runner's arm swings back past the hip, never up behind the shoulder
  loco: { maxBehind: 0.34, maxUp: -0.05, teeOut: 0.3, teeUp: -0.12 },
  // a batter / golfer / keeper set: hands in front of or at the chest plane, never pulled back behind the body
  stance: { maxBehind: 0.12, maxUp: 0.25, teeOut: 0.35, teeUp: -0.05 },
  // cruising on a board: counterweight arms low and a little out, not held at shoulder height
  ride: { maxBehind: 0.3, maxUp: -0.15, teeOut: 0.28, teeUp: -0.2 },
  // carrying the ball / bracing into contact
  carry: { maxBehind: 0.34, maxUp: -0.05, teeOut: 0.3, teeUp: -0.12 },
  // a celebration may go up, but never locked out wide at shoulder height
  celebrate: { maxBehind: 0.2, maxUp: 0.5, teeOut: 0.32, teeUp: -0.12 },
  free: { maxBehind: Infinity, maxUp: Infinity, teeOut: Infinity, teeUp: Infinity },
};

export interface ArmsVerdict { ok: boolean; behind: boolean; high: boolean; tee: boolean; reasons: string[] }

export function armsVerdict(window: ArmWindow, left: HandInChest, right: HandInChest): ArmsVerdict {
  const lim = ARM_LIMITS[window];
  const reasons: string[] = [];
  const side = (n: string, h: HandInChest) => {
    if (-h.fwd > lim.maxBehind) reasons.push(`${n} hand ${(-h.fwd).toFixed(2)} m behind the chest (max ${lim.maxBehind})`);
    if (h.up > lim.maxUp) reasons.push(`${n} hand ${h.up.toFixed(2)} m above the shoulder (max ${lim.maxUp})`);
  };
  side('left', left); side('right', right);
  const teeOne = (h: HandInChest) => h.out > lim.teeOut && h.up > lim.teeUp;
  const tee = teeOne(left) && teeOne(right);
  if (tee) reasons.push(`both hands out wide at shoulder height (T): out ${left.out.toFixed(2)}/${right.out.toFixed(2)}`);
  const behind = reasons.some((r) => r.includes('behind'));
  const high = reasons.some((r) => r.includes('above'));
  return { ok: reasons.length === 0, behind, high, tee, reasons };
}

type P3 = { x: number; y: number; z: number };
const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: P3): P3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const cross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * Both hands in the chest frame from world bone positions. `rootFwd` only SIGNS the chest normal — the runtime root is
 * x-mirrored against the node (DUNK-POSTURE-LEGS), so the shoulder cross alone flips handedness; the chest never turns
 * more than 90° off the root, so the root's forward picks the right side of the plane every time.
 */
export function handsInChest(b: {
  hips: P3; neck: P3; leftShoulder: P3; rightShoulder: P3; leftHand: P3; rightHand: P3;
}, rootFwd: P3): { left: HandInChest; right: HandInChest } {
  const up = norm(sub(b.neck, b.hips));
  const across = norm(sub(b.rightShoulder, b.leftShoulder));   // left → right
  let fwd = norm(cross(across, up));
  if (dot(fwd, rootFwd) < 0) fwd = { x: -fwd.x, y: -fwd.y, z: -fwd.z };
  // "out" is away from the midline: to the right for the right hand, to the left for the left
  const rel = (hand: P3, shoulder: P3, outSign: number): HandInChest => {
    const d = sub(hand, shoulder);
    return { fwd: dot(d, fwd), up: dot(d, up), out: dot(d, across) * outSign };
  };
  return { left: rel(b.leftHand, b.leftShoulder, -1), right: rel(b.rightHand, b.rightShoulder, 1) };
}
