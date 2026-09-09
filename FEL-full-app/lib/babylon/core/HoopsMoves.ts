// HoopsMoves — the pure half of the hoops move kit, wave A (HOOPS-MOVE-KIT-A, 2026-09-08; SPEC-HOOPS-MOVE-KIT M1–M3).
//
// The owner's eye on 1v1 / 3v3: "is the 1-dribble pull-up natural? does a contested drive dunk feel body contact? real
// layups?" Measured on b24337a: the player's shot had NO gather — the squeeze stopped the feet on the frame (driveBody is
// skipped while `shooting`) and the jumpshot rose from wherever the body was, at whatever speed it had (the teleport shot);
// the drive dunk flew THROUGH the defender on a scripted parabola (the contest was a make% number rolled at the squeeze,
// the bump never happened) and 3v3 had no contact at all (resolveBodyCollision pushes two circles apart, symmetric, no
// momentum, no event); a layup METERED ON THE JUMPSHOT and released into the dunk launch clip (the T-sweep), one-handed
// right always, and a floater was a jumper with a higher arc.
//
// This file is the rules, headless-testable (HoopsMoves.test.ts); the modes wire them:
//   M1 planGather / gatherWish — the player's gather before the rise: SET (feet already under him: no gather, the rise
//      starts on the squeeze), PULL-UP (moving: a plant that bleeds the speed to zero over 0.2–0.34 s — the 1-dribble
//      pull-up gathers after one push — with ≤ 1 m of travel: a legal gather, not a float), STEP-BACK (contested, the stick
//      pulled away from the rim at the squeeze: the rival's own step-back, STEPBACK_SEC back then the gather). The meter runs
//      from the squeeze THROUGH the gather (ShotMeter.start(…, gatherSec)): the green is where the clip's release frame lands.
//   M3 pickLayupSide / finish* — a layup is gathered on the side the drive comes from (the outside hand, off the inside
//      foot), or the off hand away from a defender on the strong side; the finish clips are paced so their release key
//      (the top of the hop) lands on the meter's green, the hop is a real parabola the body rides to feet-down; a floater is
//      its own clip (a one-hand push from the forehead off the stride) on the soft high arc.
//   M2 contestDrive / bumpShove / resolveBodyContact — the drive dunk's contest is a BODY in the flight path: the bump
//      frame (where the flying root meets the defender), a set body squarely in the lane makes the finish harder than a
//      late one, the flight clock slows at the bump (the velocity kill), the defender is shoved or put down; on the floor
//      (3v3, no Havok) two bodies exchange momentum along the contact normal with the ContactSystem's own severity
//      thresholds, so a sprint into a set defender costs speed and reads as a hit.
import { Vector3 } from '@babylonjs/core';
import { classifyContact, type ContactSeverity } from './ContactSystem';
import { DUNK_PCT, STEPBACK_SEC, STEPBACK_SPEED, LAYUP_STRIDE_SPEED, type ShotStyle } from './BasketballCore';

// ── M1: the gather ──────────────────────────────────────────────────────────
export type GatherKind = 'set' | 'pullup' | 'stepback';
/** Planar speed under which the feet count as set (a standstill / the last shuffle): no gather, the rise starts now. */
export const GATHER_SET_SPEED = 1.0;
/** The pull-up gather: a walking pull-up plants in 0.2 s, a full-speed one (the 1-dribble off the check) in 0.34 s. */
export const GATHER_PULLUP_MIN_SEC = 0.2, GATHER_PULLUP_MAX_SEC = 0.34;
/** Top speed the gather scales against (the dribble controller's sprint). */
export const GATHER_TOP_SPEED = 6.4;
/** The step-back: the rival's STEPBACK_SEC back at STEPBACK_SPEED, then this much gather before the rise. */
export const GATHER_STEPBACK_TAIL_SEC = 0.16;
/** A step-back needs a body this contested … */
export const STEPBACK_CONTEST_MIN = 0.25;   // a defender inside ~1.65 m (3v3's on-ball man keeps a 1.4–1.6 m cushion)
/** … and the stick pulled this far away from the rim at the squeeze. */
export const STEPBACK_STICK_BACK_MIN = 0.4;
/** The legal gather: a pull-up at top speed travels no further than this before the rise (a hop, not a float). */
export const PULLUP_TRAVEL_MAX = 1.0;

export interface GatherPlan {
  kind: GatherKind;
  /** Seconds of gather before the rise (0 for a set shot). */
  sec: number;
  /** The planar velocity at the squeeze (the pull-up bleeds it to zero). */
  v0: Vector3;
  /** Unit planar direction from the shooter to the rim (the step-back goes the other way). */
  toRim: Vector3;
}

/** Plan the gather from the body at the squeeze. `stickBack01` = how far the stick is pulled AWAY from the rim (0..1). */
export function planGather(vel: Vector3, shooter: Vector3, rim: Vector3, contest01: number, stickBack01 = 0): GatherPlan {
  const v0 = new Vector3(vel.x, 0, vel.z);
  const toRim = new Vector3(rim.x - shooter.x, 0, rim.z - shooter.z);
  const d = toRim.length();
  if (d > 1e-4) toRim.scaleInPlace(1 / d); else toRim.set(0, 0, -1);
  if (contest01 >= STEPBACK_CONTEST_MIN && stickBack01 >= STEPBACK_STICK_BACK_MIN) {
    return { kind: 'stepback', sec: STEPBACK_SEC + GATHER_STEPBACK_TAIL_SEC, v0, toRim };
  }
  const speed = v0.length();
  if (speed < GATHER_SET_SPEED) return { kind: 'set', sec: 0, v0, toRim };
  const k = Math.min(1, speed / GATHER_TOP_SPEED);
  return { kind: 'pullup', sec: GATHER_PULLUP_MIN_SEC + (GATHER_PULLUP_MAX_SEC - GATHER_PULLUP_MIN_SEC) * k, v0, toRim };
}

/** The planar wish velocity `t` seconds into the gather. A pull-up eases out quadratically (the plant: most of the speed
 *  goes in the first third — travel = v0·sec/3); a step-back goes AWAY from the rim for STEPBACK_SEC then sets. */
export function gatherWish(plan: GatherPlan, t: number): Vector3 {
  if (plan.kind === 'set' || plan.sec <= 0 || t >= plan.sec) return new Vector3(0, 0, 0);
  if (plan.kind === 'stepback') return t < STEPBACK_SEC ? plan.toRim.scale(-STEPBACK_SPEED) : new Vector3(0, 0, 0);
  const k = Math.min(1, Math.max(0, t / plan.sec));
  const f = (1 - k) * (1 - k);
  return plan.v0.scale(f);
}

/** Closed-form travel of the gather (metres): a pull-up = |v0|·sec/3, a step-back = STEPBACK_SPEED·STEPBACK_SEC. */
export function gatherTravel(plan: GatherPlan): number {
  if (plan.kind === 'set') return 0;
  if (plan.kind === 'stepback') return STEPBACK_SPEED * STEPBACK_SEC;
  return plan.v0.length() * plan.sec / 3;
}

/** The HUD label for the shot under its gather. */
export function gatherLabel(kind: GatherKind, base: string): string {
  return kind === 'pullup' ? 'PULL-UP' : kind === 'stepback' ? 'STEP-BACK' : base;
}

/** How far the stick is pulled AWAY from the rim, 0..1, from a world-planar wish direction (mx, −my in the dribble's
 *  stick space) and the shooter → rim direction. */
export function stickBack01(wishX: number, wishZ: number, toRim: Vector3): number {
  const m = Math.hypot(wishX, wishZ);
  if (m < 0.3) return 0;
  return Math.max(0, -(wishX * toRim.x + wishZ * toRim.z) / m);
}

// ── M3: the finish (layup / floater) ────────────────────────────────────────
export type FinishSide = 'left' | 'right';
export type FinishStyle = Extract<ShotStyle, 'layup' | 'floater'>;
/** Lateral offset (body frame, metres) from the rim's line past which the drive is on a side. */
export const LAYUP_SIDE_MIN = 0.35;
/** A defender inside this on the strong side sends the finish to the off hand. */
export const LAYUP_PROTECT_RANGE = 1.5;
/** The hop apex (metres) of each finish: a layup's two-foot hop, a floater's runner. */
export const FINISH_HOP_APEX: Record<FinishStyle, number> = { layup: 0.28, floater: 0.22 };
/** The stride the finish carries toward the rim (the rival's LAYUP_STRIDE_SPEED) while further than the stop range. */
export const FINISH_STRIDE_SPEED: Record<FinishStyle, number> = { layup: LAYUP_STRIDE_SPEED, floater: 1.6 };
export const FINISH_STRIDE_STOP: Record<FinishStyle, number> = { layup: 0.9, floater: 2.0 };
/** The authored finish clips and where in them the ball leaves the hand (the top of the hop) and the feet come down. */
export const FINISH_CLIP: Record<FinishStyle, Record<FinishSide, string>> = {
  layup: { right: 'bball_layup_gather', left: 'bball_layup_gather_left' },
  floater: { right: 'bball_floater', left: 'bball_floater' },
};
export const FINISH_RELEASE_KEY_SEC: Record<FinishStyle, number> = { layup: 0.3, floater: 0.35 };
export const FINISH_LAND_KEY_SEC: Record<FinishStyle, number> = { layup: 0.7, floater: 0.7 };

/** Body-right for a yaw (measured, MODE-STICK-FACE): (cos yaw, 0, −sin yaw). */
export function bodyRight(yaw: number): Vector3 { return new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); }

/** Which hand finishes: the OUTSIDE hand of the side the drive comes from (a drive up the right side of the lane finishes
 *  right-handed off the left foot), the strong (right) hand straight on — unless a defender sits on that side inside
 *  LAYUP_PROTECT_RANGE, when the off hand finishes away from him. */
export function pickLayupSide(shooter: Vector3, rim: Vector3, yaw: number, defender: Vector3 | null): FinishSide {
  const right = bodyRight(yaw);
  const off = new Vector3(shooter.x - rim.x, 0, shooter.z - rim.z);
  const lateral = Vector3.Dot(off, right);
  if (lateral > LAYUP_SIDE_MIN) return 'right';
  if (lateral < -LAYUP_SIDE_MIN) return 'left';
  if (defender) {
    const dv = new Vector3(defender.x - shooter.x, 0, defender.z - shooter.z);
    if (dv.length() < LAYUP_PROTECT_RANGE && Vector3.Dot(dv, right) > 0.2) return 'left';
  }
  return 'right';
}

export interface FinishPlan {
  style: FinishStyle; side: FinishSide; clip: string;
  /** Clip speed so its release key lands on the meter's green. */
  speedRatio: number;
  /** Seconds from the squeeze to the release key / to feet-down (the hop's clock). */
  releaseSec: number; hopSec: number;
}
/** Pace a finish clip to the meter: the release key at the green, the landing key = feet-down. */
export function planFinish(style: FinishStyle, side: FinishSide, meterSec: number, green01: number): FinishPlan {
  const releaseSec = Math.max(0.12, meterSec * green01);
  const speedRatio = FINISH_RELEASE_KEY_SEC[style] / releaseSec;
  return { style, side, clip: FINISH_CLIP[style][side], speedRatio, releaseSec, hopSec: FINISH_LAND_KEY_SEC[style] / speedRatio };
}
/** Root height on the finish's hop clock 0..1 (the top at the release). */
export function finishHopY(style: FinishStyle, k01: number): number {
  return Math.sin(Math.min(1, Math.max(0, k01)) * Math.PI) * FINISH_HOP_APEX[style];
}
/** The stride the finish carries toward the rim this frame (planar wish), 0 once inside the stop range or after the release. */
export function finishStride(style: FinishStyle, shooter: Vector3, rimFloor: Vector3, released: boolean): Vector3 {
  if (released) return new Vector3(0, 0, 0);
  const to = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = to.length();
  if (d <= FINISH_STRIDE_STOP[style] || d < 1e-4) return new Vector3(0, 0, 0);
  return to.scale(FINISH_STRIDE_SPEED[style] / d);
}
export const FINISH_LABEL: Record<FinishStyle, Record<FinishSide, string>> = {
  layup: { right: 'LAYUP — RIGHT', left: 'LAYUP — LEFT' },
  floater: { right: 'FLOATER', left: 'FLOATER' },
};

// ── M2: the drive contest ───────────────────────────────────────────────────
/** The flying root inside this (planar) of the defender's root = the bodies meet. Two bodies REST 1.1 m apart (resolveBody*
 *  separates two 0.55 m radii), so 0.75 m could only fire on a defender the drive was already overlapping — measured in 3v3:
 *  the wall 0.98–1.10 m off the flight line and no bump on a poster attempt. */
export const DRIVE_BUMP_RADIUS = 1.05;
/** A defender under this speed is SET (a wall); a moving one is a late contest. */
export const DRIVE_SET_SPEED = 1.0;
/** How much a squarely set body takes off a poster attempt's make chance (0.78 → 0.62 at full strength). */
export const DRIVE_CONTEST_PENALTY = 0.16;
/** The flight clock after the bump: this fraction of real time for BUMP_SLOW_SEC (the velocity kill you feel). */
export const BUMP_SLOW = 0.55, BUMP_SLOW_SEC = 0.2;
/** The defender's shove at the bump (m/s along the drive), scaled by the contest strength. */
export const BUMP_SHOVE_SPEED = 2.2;

export interface DriveContest {
  contested: boolean;
  /** 0..1 — how squarely the body sits in the path (× 0.6 when he is moving). */
  strength01: number;
  set: boolean;
  /** The make chance of this attempt. */
  pct: number;
  /** The flight clock 0..1 at which the bodies meet (null when uncontested). */
  bumpK: number | null;
  /** Unit planar drive direction (from → landing). */
  dir: Vector3;
  /** The defender's place against the flight line: along it (0..1 of the flight) and off it (metres) — for the logs. */
  t: number; lateral: number;
}

/** Read the defender against the flight's line from the takeoff to the landing point. */
export function contestDrive(from: Vector3, landing: Vector3, defender: Vector3 | null, defenderVel: Vector3 | null, kind: 'dunk' | 'poster'): DriveContest {
  const seg = new Vector3(landing.x - from.x, 0, landing.z - from.z);
  const len = seg.length();
  const dir = len > 1e-4 ? seg.scale(1 / len) : new Vector3(0, 0, -1);
  const base: DriveContest = { contested: false, strength01: 0, set: false, pct: DUNK_PCT[kind], bumpK: null, dir, t: NaN, lateral: NaN };
  if (!defender || len < 1e-4) return base;
  const rel = new Vector3(defender.x - from.x, 0, defender.z - from.z);
  const t = Vector3.Dot(rel, dir) / len;                       // 0..1 along the flight
  const lateral = Math.abs(rel.x * dir.z - rel.z * dir.x);     // planar distance off the line
  base.t = t; base.lateral = lateral;
  if (t < 0 || t > 1.1 || lateral >= DRIVE_BUMP_RADIUS) return base;
  const speed = defenderVel ? Math.hypot(defenderVel.x, defenderVel.z) : 0;
  const set = speed < DRIVE_SET_SPEED;
  const strength01 = (1 - lateral / DRIVE_BUMP_RADIUS) * (set ? 1 : 0.6);
  const pct = kind === 'poster' ? DUNK_PCT.poster - DRIVE_CONTEST_PENALTY * strength01 : DUNK_PCT.dunk;
  return { contested: true, strength01, set, pct, bumpK: Math.min(1, Math.max(0.05, t)), dir, t, lateral };
}
/** The shove the defender takes at the bump (m/s, planar): along the drive, more from a squarer hit. */
export function bumpShove(c: DriveContest): Vector3 {
  return c.dir.scale(BUMP_SHOVE_SPEED * (0.6 + 0.4 * c.strength01));
}

// ── M2: kinematic body contact (3v3 — no Havok) ─────────────────────────────
export interface BodyContact {
  /** Closing speed along the contact normal (m/s, ≥ 0). */
  closing: number;
  severity: ContactSeverity;
  /** Which body ran into which: the faster along the normal. */
  attacker: 'a' | 'b';
  /** Each body's own speed TOWARD the other along the normal (m/s; negative = moving away) — a foul read wants the
   *  reckless body's own speed, not the sum (two bodies at 3 m/s each close at 6). */
  aAlong: number; bAlong: number;
}
export interface BodyContactOpts {
  airborneA?: boolean; airborneB?: boolean; bracedA?: boolean; bracedB?: boolean;
  /** Apply the momentum exchange this call (the separation push always happens). The Havok solver's exchange is ONE impulse
   *  per collision (a 300 ms pair cooldown) — applied every frame while two bodies overlap it stopped a sprinter dead
   *  (measured 6.1 → 0.5 m/s). Default true; the mode gates it. */
  exchange?: boolean;
}

/** Push two bodies apart on XZ if they overlap (resolveBodyCollision's separation) AND exchange momentum along the normal
 *  the way the ContactSystem's solver does (the attacker bleeds 55 % of the closing speed, 85 % into a brace; the target
 *  is shoved 25 %, 8 % when braced). `va` / `vb` are written IN PLACE (the modes' live velocities). Returns the contact
 *  (with the ContactSystem's severity) or null when the bodies do not touch. */
export function resolveBodyContact(a: Vector3, b: Vector3, va: Vector3, vb: Vector3, radius = 0.55, opts: BodyContactOpts = {}): BodyContact | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  const distSq = dx * dx + dz * dz;
  const minDist = radius * 2;
  if (distSq >= minDist * minDist || distSq < 1e-6) return null;
  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) / 2;
  const nx = dx / dist, nz = dz / dist;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
  const aAlong = va.x * nx + va.z * nz;          // a's speed toward b
  const bAlong = -(vb.x * nx + vb.z * nz);       // b's speed toward a
  const closing = Math.max(0, aAlong + bAlong);
  const severity = classifyContact(closing, { shooterAirborne: !!(opts.airborneA || opts.airborneB) });
  const attacker: 'a' | 'b' = aAlong >= bAlong ? 'a' : 'b';
  if (closing > 0.8 && opts.exchange !== false) {
    const braced = attacker === 'a' ? !!opts.bracedB : !!opts.bracedA;
    const bleed = braced ? 0.85 : 0.55, shove = braced ? 0.08 : 0.25;
    if (attacker === 'a') { va.x -= nx * closing * bleed; va.z -= nz * closing * bleed; vb.x += nx * closing * shove; vb.z += nz * closing * shove; }
    else { vb.x += nx * closing * bleed; vb.z += nz * closing * bleed; va.x -= nx * closing * shove; va.z -= nz * closing * shove; }
  }
  return { closing, severity, attacker, aAlong, bAlong };
}
