// DriveFlight — the geometry and the reads of a drive dunk that make it a DUNK, not a jump near a hoop.
//
// DUNK-FANATIC (owner, 2026-09-17: "contesting a dunk, blocking dunks, better dunks in all modes as if you were a dunk
// fanatic"). The ball-path verifier (_ballpath.mts) showed every drive-dunk make leaving the hand 1.0–1.2 m IN FRONT of
// the ring: the root lerped takeoff → landing on one straight clock, so at the resolve (k 0.55) the body was barely past
// halfway and the flush carried the ball the last metre on its own — the dunk contest's old "the ball floats in alone"
// (DUNK-HANDS-RIM), on the court. Everything here is pure so the two modes (1v1 / 3v3, four flights) share one answer:
//   - driveDunkXZ: the root reaches RIM_REACH in front of the ring's centre AT the resolve (a bent arm over the lip), easing
//     in, then drops to the landing. The ball meets the iron over the ring, where the eye expects a dunk to happen.
//   - the RIM HANG: a poster or a timed SHOWTIME flush holds the body on the iron before the drop (the contest's hang).
//   - the RIM PROTECTOR: the AI leaves the floor to MEET a dunker (it only ever put a hand up and rolled at the bump), a
//     jump timed into the flight; at the meeting he either swats it (REJECTED) or gets dunked on (the poster ride).
//   - chestRide: the poster victim rides ON the dunker's chest (the old ride left the roots 0.33 m apart — inside him).
import { AI_BLOCK_RANGE, aiBlockChance } from './HoopsDefense';

/** The poster victim's slide after the release: he goes down AND clears the dunker's landing (the recorder had him floored
 *  under the landing spot for 100+ frames, roots 0.23 m apart). Metres per second and the distance carried. */
export const VICTIM_SLIDE = { mps: 3.2, dist: 0.95 } as const;
/** One frame of the slide: how far to move this frame given what is left. */
export function slideStep(left: number, dt: number, mps: number = VICTIM_SLIDE.mps): number { return Math.max(0, Math.min(left, mps * Math.max(0, dt))); }

/** How far in front of the ring's centre the ROOT stops when the ball meets the iron: the ring's radius + a bent arm. */
/** The least the drop carries forward from the resolve point (m). */
export const LAND_CARRY = 0.15;
export const RIM_REACH = 0.35;   // measured (SMOOTH recorder): at 0.68 a two-hand finish let go 1.0 m in front of the ring; the hand is ABOVE the head, not in front

/** The root's planar position through a drive-dunk flight. Takeoff → `RIM_REACH` short of the ring by `resolveK` (ease-out:
 *  the body arrives at the iron and stops there), then the short drop to the landing. A takeoff already inside the reach
 *  (a standing dunk under the rim) rises in place. */
export function driveDunkXZ(from: { x: number; z: number }, rim: { x: number; z: number }, landing: { x: number; z: number }, k: number, resolveK: number, reach = RIM_REACH): { x: number; z: number } {
  const kk = Math.min(1, Math.max(0, k));
  const dx = rim.x - from.x, dz = rim.z - from.z, d = Math.hypot(dx, dz);
  const near = Math.max(0, d - reach);
  const ax = d > 1e-4 ? from.x + (dx / d) * near : from.x, az = d > 1e-4 ? from.z + (dz / d) * near : from.z;
  if (kk <= resolveK) {
    const u = resolveK > 0 ? kk / resolveK : 1, e = 1 - (1 - u) * (1 - u);
    return { x: from.x + (ax - from.x) * e, z: from.z + (az - from.z) * e };
  }
  // the drop carries FORWARD (under the ring) — a landing spot behind the resolve point would drift the body back out
  const ux = d > 1e-4 ? dx / d : 0, uz = d > 1e-4 ? dz / d : -1;
  const aheadL = (landing.x - ax) * ux + (landing.z - az) * uz;
  const lx = aheadL >= LAND_CARRY ? landing.x : ax + ux * LAND_CARRY, lz = aheadL >= LAND_CARRY ? landing.z : az + uz * LAND_CARRY;
  const u = (kk - resolveK) / Math.max(1e-3, 1 - resolveK), e = u * u * (3 - 2 * u);
  return { x: ax + (lx - ax) * e, z: az + (lz - az) * e };
}

/** The rim hang: where in the flight the clock stops (after the resolve, at the top of the drop) and for how long. */
export const RIM_HANG = { k: 0.62, ms: 360, posterMs: 520 } as const;
export type ShowtimeJudge = 'perfect' | 'good' | 'early' | 'late' | 'none';
/** Milliseconds of rim hang a made dunk earns: a poster or a PERFECT showtime flush hangs longest, a good one or a flashy
 *  pick hangs, an ordinary flush drops straight through. 0 = no hang. */
export function hangWanted(made: boolean, kind: 'dunk' | 'poster' | 'standing', judge: ShowtimeJudge | null, flashy: boolean): number {
  if (!made) return 0;
  if (kind === 'poster' || judge === 'perfect') return RIM_HANG.posterMs;
  if (judge === 'good' || flashy) return RIM_HANG.ms;
  return 0;
}

/** The AI rim protector: a defender this close to the ring may leave the floor to meet a dunker. */
export const RIM_PROTECT = { range: 2.6, jumpKFrom: 0.10, jumpKTo: 0.28, meetK: 0.34, jumpMaxAge: 0.5, chance: 0.42, swatBoost: 1.6, swatCap: 0.72 } as const;

export interface ProtectorRead { dist: number; set: boolean; stunned: boolean; kind: 'dunk' | 'poster'; roll: () => number }
/** The flight k the protector leaves the floor at, or null when he stays down (out of range, stunned, or the roll). A set
 *  body jumps more often; a poster (a body squarely in the lane) is the one he most wants to meet. */
export function rimProtectorJump(i: ProtectorRead): number | null {
  if (i.stunned || i.dist > RIM_PROTECT.range) return null;
  const chance = RIM_PROTECT.chance * (i.set ? 1.25 : 0.85) * (i.kind === 'poster' ? 1.15 : 1);
  if (i.roll() >= chance) return null;
  return RIM_PROTECT.jumpKFrom + (RIM_PROTECT.jumpKTo - RIM_PROTECT.jumpKFrom) * i.roll();
}

export interface MeetRead { k: number; jumpAge: number; dist: number; set: boolean; strength01: number; roll: () => number }
/** At the meeting in the air: does the leaper get the ball? A fresh jump inside reach, boosted over the grounded block
 *  chance (a man in the air with the ball at its highest is the block a fanatic remembers), capped so a poster stays possible. */
export function rimProtectorSwats(i: MeetRead): boolean {
  if (i.k < RIM_PROTECT.meetK || i.jumpAge === Infinity || i.jumpAge > RIM_PROTECT.jumpMaxAge || i.dist > AI_BLOCK_RANGE) return false;
  const chance = Math.min(RIM_PROTECT.swatCap, aiBlockChance('dunk', i.dist, true, i.set, Math.max(0.5, i.strength01)) * RIM_PROTECT.swatBoost);
  return i.roll() < chance;
}

/** How far in front of the dunker's root the victim's root rides (chest to chest, not inside him). */
export const CHEST_RIDE = 0.55;
/** The poster victim's planar position `s` (0..1) into the ride: from his plant toward a point CHEST_RIDE ahead of the dunker
 *  along the drive, never closer than that to the dunker — he is bowled back on the dunker's chest. */
export function chestRide(plant: { x: number; z: number }, dunker: { x: number; z: number }, dir: { x: number; z: number }, s: number): { x: number; z: number } {
  const ss = Math.min(1, Math.max(0, s));
  const tx = dunker.x + dir.x * CHEST_RIDE, tz = dunker.z + dir.z * CHEST_RIDE;
  let x = plant.x + (tx - plant.x) * ss, z = plant.z + (tz - plant.z) * ss;
  const ahead = (x - dunker.x) * dir.x + (z - dunker.z) * dir.z;
  if (ahead < CHEST_RIDE) { x += dir.x * (CHEST_RIDE - ahead); z += dir.z * (CHEST_RIDE - ahead); }
  return { x, z };
}

/** The flight k at which the root's progress along the takeoff→landing line reaches fraction `t` (contestDrive's bump t is
 *  measured on that straight line; the eased approach reaches a body's spot EARLY — the recorder had the dunker pass through
 *  a defender 25 frames before the bump fired). */
export function driveDunkKFor(t: number, from: { x: number; z: number }, rim: { x: number; z: number }, landing: { x: number; z: number }, resolveK: number, reach = RIM_REACH): number {
  const len = Math.hypot(landing.x - from.x, landing.z - from.z);
  const d = Math.hypot(rim.x - from.x, rim.z - from.z);
  const near = Math.max(0, d - reach);
  if (len < 1e-4 || near < 1e-4) return Math.min(1, Math.max(0.05, t));
  const e = (t * len) / near;                               // the approach's eased progress this t needs
  if (e >= 1) return Math.min(1, resolveK + (1 - resolveK) * Math.min(1, (t * len - near) / Math.max(0.05, len - near)));
  const u = 1 - Math.sqrt(1 - e);
  return Math.min(1, Math.max(0.05, u * resolveK));
}

/** The ball hand's forward offset from the root along the approach (m; + = ahead of the body). */
export function handForward(from: { x: number; z: number }, rim: { x: number; z: number }, root: { x: number; z: number }, hand: { x: number; z: number }): number {
  const dx = rim.x - from.x, dz = rim.z - from.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  return ((hand.x - root.x) * dx + (hand.z - root.z) * dz) / d;
}
/** The root's extra forward carry so THE BALL (not the root) is over the ring at the resolve: a finish whose hands are still
 *  back (a two-hand hammer) carries the chest under the front lip; a reaching one (the double clutch) holds back. Ramped in
 *  from HAND_SHIFT.fromK to the resolve, clamped so no clip drives the body through the stanchion. */
export const HAND_SHIFT = { fromK: 0.25, min: -0.4, max: 0.5, maxStep: 0.06 } as const;
export function handShiftTarget(fwdNow: number, k: number, resolveK: number, reach = RIM_REACH): number {
  const raw = Math.min(HAND_SHIFT.max, Math.max(HAND_SHIFT.min, reach - fwdNow));
  const u = Math.min(1, Math.max(0, (k - HAND_SHIFT.fromK) / Math.max(1e-3, resolveK - HAND_SHIFT.fromK)));
  return raw * u * u * (3 - 2 * u);
}
/** One frame toward the target, never more than HAND_SHIFT.maxStep (a root slide with the arms, not a pop). */
export function stepShift(prev: number, target: number, maxStep = HAND_SHIFT.maxStep): number {
  const d = target - prev;
  return prev + Math.max(-maxStep, Math.min(maxStep, d));
}
/** driveDunkXZ plus the hand shift along the approach. */
export function driveDunkPos(from: { x: number; z: number }, rim: { x: number; z: number }, landing: { x: number; z: number }, k: number, resolveK: number, shift: number, reach = RIM_REACH): { x: number; z: number } {
  const p = driveDunkXZ(from, rim, landing, k, resolveK, reach);
  const dx = rim.x - from.x, dz = rim.z - from.z, d = Math.hypot(dx, dz);
  if (d < 1e-4 || shift === 0) return p;
  return { x: p.x + (dx / d) * shift, z: p.z + (dz / d) * shift };
}
