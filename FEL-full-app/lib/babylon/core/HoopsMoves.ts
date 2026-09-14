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
import { DUNK_PCT, STEPBACK_SEC, STEPBACK_SPEED, LAYUP_STRIDE_SPEED, type ShotStyle, type ShotDrift } from './BasketballCore';

// ── M1: the gather ──────────────────────────────────────────────────────────
export type GatherKind = 'set' | 'pullup' | 'stepback'
  // HOOPS-MOVE-KIT-B wave 2 (M8 / M13 / M14): three more gathers, and the first ones that end in a FINISH rather than a
  // rise — the footwork IS the move, and the meter runs through it exactly as it runs through the pull-up's plant.
  | 'stepthrough' | 'hop' | 'euro';
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
  /** HOOPS-MOVE-KIT-B: what the gather ends IN — the jumpshot's rise, or a finish that starts where the feet land. */
  then?: 'rise' | FinishStyle;
  /** The footwork itself: each leg is a direction held for its own seconds (the euro's sell-then-cross, the step-through's
   *  step past the shoulder, the hop's two-foot gather). Walked in order; `sec` is their total. */
  legs?: Array<{ dir: Vector3; sec: number; speed: number }>;
  /** The finish's side once the feet land (the euro finishes on the crossing hand). */
  side?: FinishSide;
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
  if (plan.legs) {   // HOOPS-MOVE-KIT-B: walk the legs in order (the euro's two steps, the step-through's one, the hop)
    let k = t;
    for (const leg of plan.legs) { if (k < leg.sec) return leg.dir.scale(leg.speed); k -= leg.sec; }
    return new Vector3(0, 0, 0);
  }
  if (plan.kind === 'stepback') return t < STEPBACK_SEC ? plan.toRim.scale(-STEPBACK_SPEED) : new Vector3(0, 0, 0);
  const k = Math.min(1, Math.max(0, t / plan.sec));
  const f = (1 - k) * (1 - k);
  return plan.v0.scale(f);
}

/** Closed-form travel of the gather (metres): a pull-up = |v0|·sec/3, a step-back = STEPBACK_SPEED·STEPBACK_SEC. */
export function gatherTravel(plan: GatherPlan): number {
  if (plan.kind === 'set') return 0;
  if (plan.legs) return plan.legs.reduce((m, l) => m + l.speed * l.sec, 0);
  if (plan.kind === 'stepback') return STEPBACK_SPEED * STEPBACK_SEC;
  return plan.v0.length() * plan.sec / 3;
}

/** The HUD label for the shot under its gather. */
export function gatherLabel(kind: GatherKind, base: string): string {
  return kind === 'pullup' ? 'PULL-UP' : kind === 'stepback' ? 'STEP-BACK'
    : kind === 'stepthrough' ? 'STEP-THROUGH' : kind === 'hop' ? 'HOP STEP' : kind === 'euro' ? 'EURO STEP' : base;
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
/** HOOPS-MOVE-KIT-B: the hook (M5) and the fadeaway (M4) join the finish family — every one of them is a metered shot
 *  released from its OWN clip at the top of its own hop, not a label on the jumpshot. */
export type FinishStyle = Extract<ShotStyle, 'layup' | 'floater' | 'hook' | 'fadeaway' | 'reverse'>;
/** Lateral offset (body frame, metres) from the rim's line past which the drive is on a side. */
export const LAYUP_SIDE_MIN = 0.35;
/** A defender inside this on the strong side sends the finish to the off hand. */
export const LAYUP_PROTECT_RANGE = 1.5;
/** The hop apex (metres) of each finish: a layup's two-foot hop, a floater's runner. */
export const FINISH_HOP_APEX: Record<FinishStyle, number> = { layup: 0.28, floater: 0.22, hook: 0.3, fadeaway: 0.34, reverse: 0.3 };
/** The stride the finish carries toward the rim (the rival's LAYUP_STRIDE_SPEED) while further than the stop range. A hook
 *  takes ONE step into the middle; a fadeaway goes the other way entirely (fadeDrift). */
export const FINISH_STRIDE_SPEED: Record<FinishStyle, number> = { layup: LAYUP_STRIDE_SPEED, floater: 1.6, hook: 1.1, fadeaway: 0, reverse: 1.5 };
export const FINISH_STRIDE_STOP: Record<FinishStyle, number> = { layup: 0.9, floater: 2.0, hook: 1.5, fadeaway: 0, reverse: 0.55 };   // M11: the reverse carries THROUGH the rim to the far side
/** The authored finish clips and where in them the ball leaves the hand (the top of the hop) and the feet come down. */
export const FINISH_CLIP: Record<FinishStyle, Record<FinishSide, string>> = {
  layup: { right: 'bball_layup_gather', left: 'bball_layup_gather_left' },
  floater: { right: 'bball_floater', left: 'bball_floater' },
  hook: { right: 'bball_hook', left: 'bball_hook_left' },                     // M5: the sweep over the shielding shoulder
  fadeaway: { right: 'bball_fadeaway', left: 'bball_fadeaway' },              // M4: the lean is the same either way
  reverse: { right: 'bball_layup_reverse', left: 'bball_layup_reverse_left' },   // M11: the far side, the ball laid back over the rim
};
export const FINISH_RELEASE_KEY_SEC: Record<FinishStyle, number> = { layup: 0.3, floater: 0.35, hook: 0.34, fadeaway: 0.38, reverse: 0.34 };
export const FINISH_LAND_KEY_SEC: Record<FinishStyle, number> = { layup: 0.7, floater: 0.7, hook: 0.72, fadeaway: 0.8, reverse: 0.74 };

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
  /** HOOPS-MOVE-KIT-B M4: the fade's escape line (unit planar) — the direction the push-off carries the body. */
  away: Vector3;
}
/** Pace a finish clip to the meter: the release key at the green, the landing key = feet-down. */
export function planFinish(style: FinishStyle, side: FinishSide, meterSec: number, green01: number, away?: Vector3, preSec = 0): FinishPlan {
  // `preSec` = seconds of the meter already spent on footwork BEFORE this clip starts (KIT-B wave 2: the step-through's
  // step, the hop's gather, the euro's two steps). The release key still lands on the green — the clip just has less of
  // the meter left to cover.
  const releaseSec = Math.max(0.12, meterSec * green01 - preSec);
  const speedRatio = FINISH_RELEASE_KEY_SEC[style] / releaseSec;
  return { style, side, clip: FINISH_CLIP[style][side], speedRatio, releaseSec, hopSec: FINISH_LAND_KEY_SEC[style] / speedRatio, away: away ?? new Vector3(0, 0, 0) };
}
/** M4: the fade's drift this frame — BALLISTIC (set at the push-off, held through the whole hop, feet-down included), so
 *  the release is already behind where the feet left and the landing further still. */
export function fadeDrift(plan: FinishPlan): Vector3 {
  if (plan.style !== 'fadeaway') return new Vector3(0, 0, 0);
  return plan.away.scale(FADE_DRIFT_SPEED);
}
/** The separation a fade has bought by its release (metres) — the bar FADE_SEPARATION_MIN measures. */
export function fadeSeparation(plan: FinishPlan): number {
  return plan.style === 'fadeaway' ? FADE_DRIFT_SPEED * plan.releaseSec : 0;
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
  hook: { right: 'JUMP HOOK — RIGHT', left: 'JUMP HOOK — LEFT' },
  fadeaway: { right: 'FADEAWAY', left: 'FADEAWAY' },
  reverse: { right: 'REVERSE — RIGHT', left: 'REVERSE — LEFT' },
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

// ════════════════════════════════════════════════════════════════════════════
// HOOPS-MOVE-KIT-B (2026-09-08; SPEC-HOOPS-MOVE-KIT M4–M6). The owner: "post fadeaway, hook shots, spin moves."
//
// Measured on e589e5a (KIT-A shipped): there was no POST at all — a body with its back to the basket did not exist, the
// only thing that read the block was the layup band; FADEAWAY was a LABEL (classifyShot returns it when you retreat under
// a contest) that played the plain `jumpshot` clip standing still, so the shot never leaned and never bought an inch of
// separation — the defender's hand stayed in it; there was no HOOK anywhere in the game (a paint shot with the back turned
// was a floater or a layup, released two-handed off a facing rise); and there was no SPIN — a drive that met a body
// bumped, bled its speed and either finished through him or died, with no counter.
//
//   M4 the FADE is a jump AWAY. postFadeAway() picks the escape line (off the defender when he is on me, straight off the
//      rim otherwise), fadeDrift() is a BALLISTIC drift — the push-off speed is set at the takeoff and held through the
//      whole hop, the way a jump is — so the release is FADE_SEPARATION_MIN behind where the feet left and the landing is
//      further still; the lean itself is the authored `bball_fadeaway` (the shoulders behind the hips, the legs kicked out)
//      under the posture layer's own `fade` window.
//   M5 the HOOK is a shielded release. pickHookSide() shoots with the hand AWAY from the defender so the off shoulder and
//      the off arm are the shield; hookShield() is what that shield is worth — the contest that reaches the ball is cut,
//      which is the whole reason the shot exists (and AI_BLOCK_BASE.hook is the lowest in the table).
//   M6 the SPIN is a real pivot. planSpin() plants the foot on the defender's side and swings the body a full turn around
//      it (spinYaw is monotonic and eased — a readable pivot, not a snap) while the root ARCS around that foot and carries
//      SPIN_TRAVEL out the far side on the exit line (toward the rim, past his shoulder), and the exit hands the drive
//      SPIN_EXIT_SPEED back so the move ends IN a finish. spinOffContact() is the drive trigger (a bump with a body still
//      in front of me), postSpinSide() the post one (the stick swung across while I back him down).
// ════════════════════════════════════════════════════════════════════════════

// ── The post (the path into M4 / M5 / M6) ───────────────────────────────────
/** The post band, planar from the rim: inside POST_BAND_MIN you are already at the rim (a layup / a dunk), outside
 *  POST_BAND_MAX you are facing up, not posting. */
export const POST_BAND_MIN = 1.2, POST_BAND_MAX = 5.4;
/** A defender inside this is a body to back down (the post needs someone to post UP). */
export const POST_DEFENDER_RANGE = 2.4;
/** Backing him down is slow; sliding along the lane is quicker but still not a drive. */
export const POST_BACKDOWN_SPEED = 0.95, POST_SLIDE_SPEED = 1.5;

/** Can this body post up right now: inside the band with a defender to back down. */
export function canPostUp(shooter: Vector3, rimFloor: Vector3, defender: Vector3 | null): boolean {
  const d = Math.hypot(shooter.x - rimFloor.x, shooter.z - rimFloor.z);
  if (d < POST_BAND_MIN || d > POST_BAND_MAX) return false;
  return !!defender && Math.hypot(defender.x - shooter.x, defender.z - shooter.z) <= POST_DEFENDER_RANGE;
}
/** The post's yaw: the BACK to the basket (the chest faces away from the rim). */
export function postYaw(shooter: Vector3, rimFloor: Vector3): number {
  return Math.atan2(shooter.x - rimFloor.x, shooter.z - rimFloor.z);
}
/** The post's wish velocity from the stick: the component toward the rim is a slow BACK-DOWN, the lateral one a shuffle
 *  along the lane; pushing away from the rim is a face-up step and moves at the shuffle's speed. */
export function postWish(wishX: number, wishZ: number, toRim: Vector3): Vector3 {
  const m = Math.hypot(wishX, wishZ);
  if (m < 0.2) return new Vector3(0, 0, 0);
  const nx = wishX / m, nz = wishZ / m;
  const along = nx * toRim.x + nz * toRim.z;                       // + = toward the rim (backing him down)
  const latX = nx - along * toRim.x, latZ = nz - along * toRim.z;
  const speed = Math.min(1, m);
  const back = along > 0 ? along * POST_BACKDOWN_SPEED : along * POST_SLIDE_SPEED;
  return new Vector3(toRim.x * back + latX * POST_SLIDE_SPEED, 0, toRim.z * back + latZ * POST_SLIDE_SPEED).scale(speed);
}

// ── M4: the fadeaway ────────────────────────────────────────────────────────
/** The push-off, held through the hop (a jump is ballistic): 1.35 m/s over a ~0.8 s fade = ~1.05 m of ground given up. */
export const FADE_DRIFT_SPEED = 1.35;
/** A defender inside this is what the fade escapes; beyond it the fade goes straight off the rim. */
export const FADE_DEFENDER_RANGE = 2.6;
/** The separation the release must have bought (metres) — the bar the fade exists for. */
export const FADE_SEPARATION_MIN = 0.4;
/** The stick pulled this far off the rim at a post squeeze asks for the FADE; anything else is the hook. */
export const POST_FADE_STICK_MIN = 0.35;

/** Which way the fade jumps: away from the defender when he is on me, otherwise straight away from the rim. Planar unit. */
export function postFadeAway(
  shooter: Vector3, rimFloor: Vector3, defender: Vector3 | null, drift: ShotDrift = 'none',
): Vector3 {
  let away: Vector3 | null = null;
  if (defender) {
    const v = new Vector3(shooter.x - defender.x, 0, shooter.z - defender.z);
    const d = v.length();
    if (d > 1e-4 && d <= FADE_DEFENDER_RANGE) away = v.scale(1 / d);
  }
  if (!away) {
    const off = new Vector3(shooter.x - rimFloor.x, 0, shooter.z - rimFloor.z);
    const d = off.length();
    away = d > 1e-4 ? off.scale(1 / d) : new Vector3(0, 0, 1);
  }
  if (drift === 'none') return away;

  // A BASELINE FADE GOES ACROSS, NOT BACKWARDS (owner, 2026-09-13).
  //
  // Without this the direction was only a label: `classifyShot` said "BASELINE FADE — LEFT" and the body
  // then drifted straight away from the rim exactly like every other fade, so the two shots were the same
  // shot with different text on the HUD. The away vector is blended toward the drift side so the body
  // actually slides along the baseline and the separation is bought sideways.
  const toRim = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const len = toRim.length();
  if (len < 1e-4) return away;
  toRim.scaleInPlace(1 / len);
  // the repo's convention: for a facing (fx, fz), the shooter's right is (fz, -fx)
  const side = new Vector3(toRim.z, 0, -toRim.x).scale(drift === 'right' ? 1 : -1);
  const blended = away.scale(1 - BASELINE_FADE_ACROSS).add(side.scale(BASELINE_FADE_ACROSS));
  const bl = blended.length();
  return bl > 1e-4 ? blended.scale(1 / bl) : away;
}

/** How much of a baseline fade's drift is sideways rather than backwards. */
export const BASELINE_FADE_ACROSS = 0.6;

// ── M5: the hook ────────────────────────────────────────────────────────────
/** How much of the contest the shielding shoulder takes off a hook (the reason the shot exists). */
export const HOOK_SHIELD = 0.45;
/** The contest that actually reaches a hook. */
export function hookShield(contest01: number): number { return contest01 * (1 - HOOK_SHIELD); }

/** Which hand hooks: the one AWAY from the defender, so the off shoulder and the off arm are between him and the ball.
 *  With nobody on me, the hand on the middle-of-the-floor side (toward the rim's line). */
export function pickHookSide(shooter: Vector3, rimFloor: Vector3, yaw: number, defender: Vector3 | null): FinishSide {
  const right = bodyRight(yaw);
  if (defender) {
    const dv = new Vector3(defender.x - shooter.x, 0, defender.z - shooter.z);
    if (dv.length() <= POST_DEFENDER_RANGE + 0.6) return Vector3.Dot(dv, right) > 0 ? 'left' : 'right';
  }
  const off = new Vector3(shooter.x - rimFloor.x, 0, shooter.z - rimFloor.z);
  return Vector3.Dot(off, right) > 0 ? 'right' : 'left';
}

// ── M6: the spin ────────────────────────────────────────────────────────────
/** The turn itself: a full revolution over SPIN_SEC around the planted foot. (0.6 s and a 0.2 m foot offset are not free
 *  numbers: the smoothstep's peak rate is 1.5× the mean, so the root's fastest frame is 1.5/SPIN_SEC × (2π·offset + travel)
 *  — at these values 6.3 m/s, INSIDE the dribble's own 6.4 m/s sprint. A tighter or quicker pivot whips the body faster
 *  than it can run, which reads as a teleport however good the clip is.) */
export const SPIN_SEC = 0.6, SPIN_SWEEP = Math.PI * 2;
/** The pivot foot sits this far to the defender's side of the body … */
export const SPIN_PIVOT_OFFSET = 0.2;
/** … and the body comes out this far down the exit line. */
export const SPIN_TRAVEL = 1.25;
/** The exit line leans this far past the defender's shoulder, off the straight line to the rim. */
export const SPIN_EXIT_DEG = 14;
/** The drive the spin hands back on the way out. */
export const SPIN_EXIT_SPEED = 4.2;
/** A contact ARMS the spin for this long: the body you just met is the thing you spin off, and the swing of the stick is
 *  the move. (It used to fire on the contact alone — measured on the KIT-A probe: a drive that met the lane defender
 *  pivoted on its own, ate the shot the player had already asked for, and in 3v3's six bodies fired on nearly every
 *  possession. A spin is a move you MAKE.) */
export const SPIN_ARM_SEC = 0.4;
/** A drive spins off a body it meets at this speed or more … */
export const SPIN_MIN_SPEED = 2.2;
/** … with the body inside this and in front of the drive. */
export const SPIN_TRIGGER_RANGE = 1.9;
/** The stick has to swing this far across the body to spin out of the post. */
export const POST_SPIN_STICK_MIN = 0.55;
/** A body spun off is beaten for this long. */
export const SPIN_STUN_SEC = 0.45;
/** How far into the turn the shoulder clears him (the banner / the thud). */
export const SPIN_BEAT_K = 0.45;
/** A spin cannot re-fire inside this (one pivot per collision, not a drill). */
export const SPIN_COOLDOWN_SEC = 1.6;

export interface SpinPlan {
  sec: number;
  /** Which way the body turns: 'right' = the yaw sweeps +2π. */
  side: FinishSide;
  yaw0: number; sweep: number;
  /** The planted foot, world planar. */
  pivot: Vector3;
  /** The body's offset from the pivot at the plant (rotated through the turn). */
  r0: Vector3;
  /** Unit planar exit line (past his shoulder, at the rim). */
  exit: Vector3;
  /** Metres carried down the exit line over the turn — SPIN_TRAVEL for a spin, ZERO for a pivot (M9: the planted foot
   *  never moves, and a pivot that slid 1.25 m down the lane would be a travel, not a turn). */
  travel: number;
}

/** Plan the spin: plant the foot on the DEFENDER's side and swing the body the other way, coming out on the exit line —
 *  the rim, leaned SPIN_EXIT_DEG past his shoulder. With nobody there the spin goes off the body's right. */
export function planSpin(shooter: Vector3, yaw: number, rimFloor: Vector3, defender: Vector3 | null, side?: FinishSide): SpinPlan {
  const right = bodyRight(yaw);
  let lateral = 0;
  if (defender) lateral = (defender.x - shooter.x) * right.x + (defender.z - shooter.z) * right.z;
  const turn: FinishSide = side ?? (lateral > 0 ? 'left' : 'right');
  const sign = turn === 'right' ? 1 : -1;
  const pivot = new Vector3(shooter.x - right.x * SPIN_PIVOT_OFFSET * sign, 0, shooter.z - right.z * SPIN_PIVOT_OFFSET * sign);
  const r0 = new Vector3(shooter.x - pivot.x, 0, shooter.z - pivot.z);
  const toRim = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = toRim.length();
  if (d > 1e-4) toRim.scaleInPlace(1 / d); else toRim.copyFrom(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)));
  const a = SPIN_EXIT_DEG * Math.PI / 180 * sign;                  // lean the exit past his shoulder
  const exit = new Vector3(toRim.x * Math.cos(a) + toRim.z * Math.sin(a), 0, -toRim.x * Math.sin(a) + toRim.z * Math.cos(a));
  return { sec: SPIN_SEC, side: turn, yaw0: yaw, sweep: SPIN_SWEEP * sign, pivot, r0, exit, travel: SPIN_TRAVEL };
}
/** The turn's eased clock 0..1 (smoothstep: it winds up and it settles — a pivot, not a snap). */
export function spinEase(k01: number): number {
  const k = Math.min(1, Math.max(0, k01));
  return k * k * (3 - 2 * k);
}
/** The body's yaw `t` seconds into the spin — monotonic through a full revolution, back on the exit at the end. */
export function spinYaw(plan: SpinPlan, t: number): number {
  return plan.yaw0 + plan.sweep * spinEase(t / plan.sec);
}
/** The root `t` seconds into the spin: the offset swings around the planted foot AND the body carries down the exit line. */
export function spinPos(plan: SpinPlan, t: number): Vector3 {
  const e = spinEase(t / plan.sec);
  const a = plan.sweep * e;
  const ca = Math.cos(a), sa = Math.sin(a);
  // the same rotation the yaw takes (yaw + turns the forward toward body-right): x' = x cos + z sin, z' = −x sin + z cos
  const rx = plan.r0.x * ca + plan.r0.z * sa, rz = -plan.r0.x * sa + plan.r0.z * ca;
  return new Vector3(plan.pivot.x + rx + plan.exit.x * plan.travel * e, 0, plan.pivot.z + rz + plan.exit.z * plan.travel * e);
}
export function spinDone(plan: SpinPlan, t: number): boolean { return t >= plan.sec; }

/** The DRIVE ARM: I am moving at speed with the ball and a body I have just met is still in front of me — the spin is now
 *  available for SPIN_ARM_SEC, and postSpinSide (the stick swung across) is what actually throws it. */
export function spinOffContact(vel: Vector3, shooter: Vector3, yaw: number, defender: Vector3 | null): boolean {
  if (!defender) return false;
  if (Math.hypot(vel.x, vel.z) < SPIN_MIN_SPEED) return false;
  const dv = new Vector3(defender.x - shooter.x, 0, defender.z - shooter.z);
  const d = dv.length();
  if (d > SPIN_TRIGGER_RANGE || d < 1e-4) return false;
  const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  return Vector3.Dot(dv, fwd) / d > 0.3;                            // in front of me, not beside me
}
/** The STICK: swung across the body (out of a seal, or off a body just met on the drive) — the spin's input. Returns the
 *  side, or null. */
export function postSpinSide(wishX: number, wishZ: number, yaw: number): FinishSide | null {
  const m = Math.hypot(wishX, wishZ);
  if (m < 0.3) return null;
  const right = bodyRight(yaw);
  const lat = (wishX * right.x + wishZ * right.z) / m;
  if (Math.abs(lat) < POST_SPIN_STICK_MIN) return null;
  return lat > 0 ? 'right' : 'left';
}


// ════════════════════════════════════════════════════════════════════════════
// HOOPS-MOVE-KIT-B wave 2 (2026-09-08; AMEND-HOOPS-KIT-B-FOOTWORK + AMEND-HOOPS-KIT-B-EURO-HOP).
// Elijah: "running hooks, step through, pivots, reverse pivots, floaters, reverse layups, bank shots" then "hop steps
// and euro steps." Measured on the M4–M6 build: the hook only existed as a JUMP-STOP shot out of the seal (a drive
// through the lane could not throw one); there was no pump fake at all — an early release was simply a 0.35-pct brick —
// so nothing to step through; a standing handler could not turn without travelling (the only turn in the game was the
// spin's full pivot with 1.25 m of exit); the floater was chosen by DISTANCE alone, so a body standing in the lane got a
// layup driven into its chest; a drive that carried under the rim still laid the ball up on the near side; and no shot in
// the game had ever touched the backboard on purpose (ShotArc was one straight parabola to the iron).
//
//   M7 runningHook   — a hook thrown ON THE MOVE: in the paint band, moving, with a body in the way. The same shielded
//                      release, with the stride still under it.
//   M8 pump / step-through — a squeeze released inside PUMP_MAX_SEC is a FAKE, not a brick; it opens a window in which
//                      the next squeeze STEPS THROUGH his shoulder (a leg of real footwork) into a layup.
//   M9 planPivot     — a turn IN PLACE around the planted foot: a front pivot opens to the stick, a reverse pivot turns
//                      the other way through the back. No travel — the pivot foot never moves.
//   M10 rimProtected — a body sitting in the lane turns a layup into a FLOATER over the length.
//   M11 isReverseFinish — a drive carried ACROSS / under the rim finishes on the far side, off the glass.
//   M12 bankPoint    — the square's own point for a shot inside the bank band: the ShotArc routes the ball through it.
//   M13 planHopStep  — the two-foot hop gather: a forward hop that lands square, legal (≤ HOP_TRAVEL_MAX), into a rise
//                      or a power finish.
//   M14 planEuro     — gather, SELL step A, CROSS step B, finish on the crossing hand (a layup, or a floater over help).
// ════════════════════════════════════════════════════════════════════════════

// ── M7: the running hook ────────────────────────────────────────────────────
/** A hook on the move lives in this planar band from the rim — the SHORT paint. It is deliberately narrow: outside it a
 *  drive is a layup (inside 2.2 m, KIT-A's M3) or a pull-up / floater (past 3.0 m, KIT-A's M1 / M3), and a wider band had
 *  the hook quietly taking all three (measured on the KIT-A probe: the 1-dribble pull-up from 4 m, both layups at 2.17 m
 *  and the floater all came out JUMP HOOK). */
export const RUN_HOOK_MIN = 2.25, RUN_HOOK_MAX = 3.0;
/** … at this speed or more … */
export const RUN_HOOK_MIN_SPEED = 1.6;
/** … with a body this close to the line between me and the rim (the reason you hook instead of laying it in). */
export const RUN_HOOK_HELP_RANGE = 2.4, RUN_HOOK_HELP_LATERAL = 1.2;
/** A body THIS close to me is on my hip: you hook over him. Further out and waiting at the rim, you float it over him
 *  instead — the same read, two different shots, and the order matters (measured: the hook took every floater). */
export const HOOK_ON_ME = 1.9;

/** Is there a body between me and the rim (inside `range`, no further than `lateral` off the line)? The help read that
 *  M7 (hook on the move), M10 (floater over length) and M14 (the euro's evade) all ask. */
export function helpInTheWay(shooter: Vector3, rimFloor: Vector3, defender: Vector3 | null, range: number, lateral: number): boolean {
  if (!defender) return false;
  const to = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const len = to.length();
  if (len < 1e-4) return false;
  to.scaleInPlace(1 / len);
  const rel = new Vector3(defender.x - shooter.x, 0, defender.z - shooter.z);
  const along = Vector3.Dot(rel, to);
  if (along <= 0 || along > Math.min(range, len + 0.6)) return false;
  return Math.abs(rel.x * to.z - rel.z * to.x) <= lateral;
}
/** M7: a hook thrown on the move — in the band, moving, with a body in the way. */
export function runningHook(vel: Vector3, shooter: Vector3, rimFloor: Vector3, defender: Vector3 | null): boolean {
  const d = Math.hypot(shooter.x - rimFloor.x, shooter.z - rimFloor.z);
  if (d < RUN_HOOK_MIN || d > RUN_HOOK_MAX) return false;
  if (Math.hypot(vel.x, vel.z) < RUN_HOOK_MIN_SPEED) return false;
  return helpInTheWay(shooter, rimFloor, defender, RUN_HOOK_HELP_RANGE, RUN_HOOK_HELP_LATERAL);
}

// ── M8: the pump fake and the step-through ──────────────────────────────────
/** A squeeze let go inside this much of the meter is a PUMP FAKE, not a shot (it was a 0.35-pct brick). */
export const PUMP_MAX_SEC = 0.22;
/** He bit: the window in which the next squeeze is a STEP-THROUGH. */
export const STEP_THROUGH_SEC = 1.0;
/** The step itself: past his shoulder, then the finish. */
export const STEP_THROUGH_SPEED = 2.4, STEP_THROUGH_SEC_LEG = 0.3;
/** A defender inside this bites the fake. */
export const PUMP_BITE_RANGE = 2.0;
/** How often a contesting body leaves its feet on a pump. */
export const PUMP_BITE_CHANCE = 0.55;
/** He is frozen this long when he bites. */
export const PUMP_BITE_STUN = 0.6;

/** Was that a pump fake? — the meter had run less than PUMP_MAX_SEC when the trigger came up. */
export function isPumpFake(meterSec: number): boolean { return meterSec < PUMP_MAX_SEC; }
/** M8: the step-through's gather — ONE leg past his shoulder (the side he is NOT on), then a layup on that hand. */
export function planStepThrough(shooter: Vector3, rimFloor: Vector3, yaw: number, defender: Vector3 | null): GatherPlan {
  const toRim = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = toRim.length();
  if (d > 1e-4) toRim.scaleInPlace(1 / d); else toRim.set(0, 0, -1);
  const right = bodyRight(yaw);
  let lateral = 0;
  if (defender) lateral = (defender.x - shooter.x) * right.x + (defender.z - shooter.z) * right.z;
  const side: FinishSide = lateral > 0 ? 'left' : 'right';        // step past the shoulder he is NOT on
  const sign = side === 'right' ? 1 : -1;
  // the step goes at the rim AND around him: half toward the rim, half across
  const dir = new Vector3(toRim.x * 0.72 + right.x * 0.7 * sign, 0, toRim.z * 0.72 + right.z * 0.7 * sign);
  const n = dir.length() || 1;
  return { kind: 'stepthrough', sec: STEP_THROUGH_SEC_LEG, v0: new Vector3(0, 0, 0), toRim, then: 'layup', side,
    legs: [{ dir: dir.scale(1 / n), sec: STEP_THROUGH_SEC_LEG, speed: STEP_THROUGH_SPEED }] };
}

// ── M9: the pivot (front and reverse) ───────────────────────────────────────
/** The pivot turns this far (a front pivot opens you up; a reverse turns through the back). */
export const PIVOT_FRONT_SWEEP = Math.PI * 0.6, PIVOT_REVERSE_SWEEP = Math.PI;
/** … over this long, around a foot that does NOT move. */
export const PIVOT_SEC = 0.42;
/** The stick has to be swung this far off the body's own line to ask for a pivot. */
export const PIVOT_STICK_MIN = 0.45;
/** A body under this speed is standing still enough to pivot rather than drive. */
export const PIVOT_MAX_SPEED = 1.2;

/** Read a pivot off the stick: swung ACROSS the body opens a FRONT pivot to that side; swung across AND BACK is a
 *  REVERSE pivot (you turn through your own back the other way). Null when the stick is going somewhere. */
export function pivotFrom(wishX: number, wishZ: number, yaw: number): { side: FinishSide; reverse: boolean } | null {
  const m = Math.hypot(wishX, wishZ);
  if (m < 0.3) return null;
  const right = bodyRight(yaw);
  const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const lat = (wishX * right.x + wishZ * right.z) / m;
  const along = (wishX * fwd.x + wishZ * fwd.z) / m;
  if (Math.abs(lat) < PIVOT_STICK_MIN) return null;
  return { side: lat > 0 ? 'right' : 'left', reverse: along < -0.25 };
}
/** A pivot is the spin's machinery with NO travel and a shorter sweep: the planted foot stays exactly where it is (a
 *  reverse pivot turns the other way, through the back). */
export function planPivot(shooter: Vector3, yaw: number, side: FinishSide, reverse: boolean): SpinPlan {
  const right = bodyRight(yaw);
  const sign = side === 'right' ? 1 : -1;
  // the pivot foot is the one you keep: opposite the turn on a front pivot, the same side on a reverse
  const footSign = reverse ? sign : -sign;
  const pivot = new Vector3(shooter.x + right.x * SPIN_PIVOT_OFFSET * footSign, 0, shooter.z + right.z * SPIN_PIVOT_OFFSET * footSign);
  const sweep = (reverse ? PIVOT_REVERSE_SWEEP : PIVOT_FRONT_SWEEP) * (reverse ? -sign : sign);
  const fwd = new Vector3(Math.sin(yaw + sweep), 0, Math.cos(yaw + sweep));
  return { sec: PIVOT_SEC, side, yaw0: yaw, sweep, pivot, r0: new Vector3(shooter.x - pivot.x, 0, shooter.z - pivot.z), exit: fwd, travel: 0 };
}

// ── M10: the floater over length ────────────────────────────────────────────
/** A body inside this of the rim, in the lane, is protecting it. */
export const PROTECT_RIM_RANGE = 2.0, PROTECT_RIM_LATERAL = 1.3;
/** Is the rim PROTECTED — a body between me and it, near enough to meet me there? Then the finish goes OVER him. */
export function rimProtected(shooter: Vector3, rimFloor: Vector3, defender: Vector3 | null): boolean {
  if (!defender) return false;
  if (Math.hypot(defender.x - rimFloor.x, defender.z - rimFloor.z) > PROTECT_RIM_RANGE) return false;
  return helpInTheWay(shooter, rimFloor, defender, PROTECT_RIM_RANGE + 2.4, PROTECT_RIM_LATERAL);
}

// ── M11: the reverse ────────────────────────────────────────────────────────
/** A reverse is finished from inside this of the rim … */
export const REVERSE_RANGE = 1.9;
/** … with the drive going ACROSS the rim rather than at it (|cos| below this). */
export const REVERSE_CROSS_COS = 0.5;
/** M11: the drive carried me under / across the rim — the ball is laid back on the FAR side, off the glass. */
export function isReverseFinish(shooter: Vector3, rimFloor: Vector3, vel: Vector3): boolean {
  const to = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = to.length();
  if (d > REVERSE_RANGE || d < 1e-4) return false;
  const sp = Math.hypot(vel.x, vel.z);
  if (sp < 1.2) return false;
  return Math.abs((vel.x * to.x + vel.z * to.z) / (sp * d)) < REVERSE_CROSS_COS;
}
/** The reverse finishes on the side the drive is carrying me TO (the far side of the rim). */
export function reverseSide(shooter: Vector3, rimFloor: Vector3, yaw: number, vel: Vector3): FinishSide {
  const right = bodyRight(yaw);
  const lat = vel.x * right.x + vel.z * right.z;
  if (Math.abs(lat) > 0.4) return lat > 0 ? 'right' : 'left';
  return pickLayupSide(shooter, rimFloor, yaw, null);
}

// ── M12: the bank ───────────────────────────────────────────────────────────
/** The glass is live between these planar distances … */
export const BANK_MIN_DIST = 1.2, BANK_MAX_DIST = 6.8;
/** … and inside this angle off the backboard's normal (straight on is a swish, the baseline has no square). */
export const BANK_MIN_DEG = 12, BANK_MAX_DEG = 62;
/** The square's own point: this far above the ring and this far behind it (the board's face). */
export const BANK_UP = 0.42, BANK_BACK = 0.32;
/** The glass is worth this much of a make inside the band (a bank from the wing is a real edge). */
export const BANK_PCT_BONUS = 0.06;

/** Is the shot inside the bank band — the angle at which the square actually helps? `boardNormal` is the direction the
 *  backboard faces (out of the glass, toward the court); the rim sits in front of it. */
export function inBankBand(shooter: Vector3, rimFloor: Vector3, boardNormal: Vector3): boolean {
  const off = new Vector3(shooter.x - rimFloor.x, 0, shooter.z - rimFloor.z);
  const d = off.length();
  if (d < BANK_MIN_DIST || d > BANK_MAX_DIST) return false;
  const cos = Vector3.Dot(off.scale(1 / d), boardNormal);
  if (cos <= 0) return false;                                    // behind the board: no square to use
  const deg = Math.acos(Math.min(1, cos)) * 180 / Math.PI;
  return deg >= BANK_MIN_DEG && deg <= BANK_MAX_DEG;
}
/** The point on the square the ball is thrown at: above and behind the ring, offset to the shooter's side of the box. */
export function bankPoint(shooter: Vector3, rim: Vector3, boardNormal: Vector3): Vector3 {
  const right = new Vector3(-boardNormal.z, 0, boardNormal.x);   // along the board's face
  const off = new Vector3(shooter.x - rim.x, 0, shooter.z - rim.z);
  const side = Math.sign(Vector3.Dot(off, right)) || 1;
  return new Vector3(rim.x - boardNormal.x * BANK_BACK + right.x * 0.17 * side, rim.y + BANK_UP, rim.z - boardNormal.z * BANK_BACK + right.z * 0.17 * side);
}

// ── M13: the hop step ───────────────────────────────────────────────────────
/** The two-foot hop: this long, this fast, and never further than HOP_TRAVEL_MAX (a legal gather, not a travel pop). */
export const HOP_SEC = 0.26, HOP_SPEED = 3.1, HOP_TRAVEL_MAX = 0.9;
/** A hop step is asked for by an explosive gather — sprint held at the squeeze — inside this of the rim. */
export const HOP_RANGE = 5.0;
/** M13: the hop's gather — one forward leg onto two feet, landing square, into a rise or a power finish. */
export function planHopStep(vel: Vector3, shooter: Vector3, rimFloor: Vector3, then: 'rise' | FinishStyle): GatherPlan {
  const toRim = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = toRim.length();
  if (d > 1e-4) toRim.scaleInPlace(1 / d); else toRim.set(0, 0, -1);
  const sp = Math.hypot(vel.x, vel.z);
  const dir = sp > 0.5 ? new Vector3(vel.x / sp, 0, vel.z / sp) : toRim.clone();   // the hop goes where the drive was going
  return { kind: 'hop', sec: HOP_SEC, v0: new Vector3(vel.x, 0, vel.z), toRim, then,
    legs: [{ dir, sec: HOP_SEC, speed: HOP_SPEED }] };
}

// ── M14: the euro step ──────────────────────────────────────────────────────
/** Step A sells one way … */
export const EURO_A_SEC = 0.22, EURO_A_SPEED = 2.8;
/** … step B crosses back the other, longer and harder (the step that beats the help). */
export const EURO_B_SEC = 0.26, EURO_B_SPEED = 3.4;
/** The euro lives in this band from the rim. */
export const EURO_MIN = 1.6, EURO_MAX = 5.2;
/** A euro needs a drive this fast. */
export const EURO_MIN_SPEED = 2.0;

/** Is a euro available: driving, in the band, with help to evade? */
export function euroAvailable(vel: Vector3, shooter: Vector3, rimFloor: Vector3, defender: Vector3 | null): boolean {
  const d = Math.hypot(shooter.x - rimFloor.x, shooter.z - rimFloor.z);
  if (d < EURO_MIN || d > EURO_MAX) return false;
  if (Math.hypot(vel.x, vel.z) < EURO_MIN_SPEED) return false;
  return helpInTheWay(shooter, rimFloor, defender, RUN_HOOK_HELP_RANGE + 0.6, RUN_HOOK_HELP_LATERAL + 0.3);
}
/** M14: the euro's gather — SELL step A to `sell`, CROSS step B the other way, finish on the crossing hand. Both legs
 *  carry toward the rim as well as across it (a euro covers ground; it is not a side-step). */
export function planEuro(shooter: Vector3, rimFloor: Vector3, yaw: number, sell: FinishSide, then: FinishStyle = 'layup'): GatherPlan {
  const toRim = new Vector3(rimFloor.x - shooter.x, 0, rimFloor.z - shooter.z);
  const d = toRim.length();
  if (d > 1e-4) toRim.scaleInPlace(1 / d); else toRim.set(0, 0, -1);
  const right = bodyRight(yaw);
  const s = sell === 'right' ? 1 : -1;
  const leg = (sign: number, across: number) => {
    const v = new Vector3(toRim.x * 0.62 + right.x * across * sign, 0, toRim.z * 0.62 + right.z * across * sign);
    const n = v.length() || 1;
    return v.scale(1 / n);
  };
  const cross: FinishSide = sell === 'right' ? 'left' : 'right';
  return { kind: 'euro', sec: EURO_A_SEC + EURO_B_SEC, v0: new Vector3(0, 0, 0), toRim, then, side: cross,
    legs: [{ dir: leg(s, 0.85), sec: EURO_A_SEC, speed: EURO_A_SPEED }, { dir: leg(-s, 0.95), sec: EURO_B_SEC, speed: EURO_B_SPEED }] };
}
/** Which way the stick sells the first step (null = no euro asked for). */
export function euroSell(wishX: number, wishZ: number, yaw: number): FinishSide | null {
  const m = Math.hypot(wishX, wishZ);
  if (m < 0.3) return null;
  const right = bodyRight(yaw);
  const lat = (wishX * right.x + wishZ * right.z) / m;
  if (Math.abs(lat) < 0.3) return null;
  return lat > 0 ? 'right' : 'left';
}

// ── THE PASS FAKE (owner, 2026-09-13) ────────────────────────────────────────────────────────────────────
//
// Sibling of the pump fake above, and deliberately NOT a copy of it. A pump fake sells a shot: the defender
// leaves his feet and is frozen where he stands, and the payoff is the step-through past a body that cannot
// move. If a pass fake only did that, it would be a pump fake with a different banner.
//
// A pass fake sells the BALL GOING SOMEWHERE. The defender does not jump — he COMMITS, laterally, toward the
// lane you showed him. So the payoff is directional and it is the opposite of what he bit on: you show him
// the kick-out, he slides to cover it, and the lane you actually wanted opens behind his hip.
//
// That is why `passFakeBite` returns a SHIFT rather than a stun, and why the mode moves him before it freezes
// him. A defender who bit a pass fake and did not move has not been faked, he has been paused.

/** A pass squeezed and released inside this is a fake, not a pass. Matches the pump's feel. */
export const PASS_FAKE_MAX_SEC = 0.22;
/** A defender this far away can still be moved by a pass fake — further than a shot contest, it is a lane read. */
export const PASS_FAKE_BITE_RANGE = 4.5;
/** How often a defender who can see the lane bites it. */
export const PASS_FAKE_BITE_CHANCE = 0.6;
/** He is committed this long — shorter than a pump, because he is stepping rather than landing. */
export const PASS_FAKE_STUN = 0.45;
/** How far he slides toward the lane he bit on. */
export const PASS_FAKE_SHIFT = 0.9;
/** The window in which the lane the fake opened is still there. */
export const PASS_FAKE_LANE_SEC = 0.9;

/** Was that a pass fake? — the pass button came up before the ball ever left. */
export function isPassFake(heldSec: number): boolean { return heldSec < PASS_FAKE_MAX_SEC; }

export interface PassFakeRead {
  passer: Vector3;
  /** Where the fake was aimed — the team-mate you showed him. */
  target: Vector3;
  defender: Vector3;
}

export interface PassFakeBite {
  /** He bought it. */
  bit: boolean;
  /** Unit direction he commits in — toward the lane he was shown. Zero when he did not bite. */
  shift: Vector3;
  /** Unit direction that OPENED as a result: away from where he just went. Zero when he did not bite. */
  lane: Vector3;
}

const NO_BITE: PassFakeBite = { bit: false, shift: new Vector3(0, 0, 0), lane: new Vector3(0, 0, 0) };

/**
 * Does he bite, and what opens if he does?
 *
 * `roll` is injected so the odds are testable without a running game. A defender who is not between you and
 * the target has nothing to cover and cannot be faked by this — showing a pass to a man he is not guarding
 * is not a fake, it is a pass he ignores.
 */
export function passFakeBite(read: PassFakeRead, roll: () => number = Math.random): PassFakeBite {
  const toTarget = new Vector3(read.target.x - read.passer.x, 0, read.target.z - read.passer.z);
  const toDef = new Vector3(read.defender.x - read.passer.x, 0, read.defender.z - read.passer.z);
  const tLen = toTarget.length(), dLen = toDef.length();
  if (tLen < 1e-4 || dLen < 1e-4 || dLen > PASS_FAKE_BITE_RANGE) return NO_BITE;

  // he has to be somewhere between me and the man I showed him, or there is no lane to jump
  const cos = (toTarget.x * toDef.x + toTarget.z * toDef.z) / (tLen * dLen);
  if (cos < 0.2) return NO_BITE;
  if (roll() >= PASS_FAKE_BITE_CHANCE) return NO_BITE;

  const shift = toTarget.scale(1 / tLen);
  return { bit: true, shift, lane: shift.scale(-1) };
}

/** Where he ends up after biting — the mode moves him here, then freezes him for PASS_FAKE_STUN. */
export function passFakeShiftTo(defender: Vector3, bite: PassFakeBite): Vector3 {
  if (!bite.bit) return defender.clone();
  return new Vector3(
    defender.x + bite.shift.x * PASS_FAKE_SHIFT, defender.y, defender.z + bite.shift.z * PASS_FAKE_SHIFT,
  );
}
