// BoardMovement — Mode 3 Phase 3: the shared board-sport movement model.
//
// Momentum is a REAL RESOURCE here, not a flat top speed:
//   PUSH/PUMP — kicking (flat ground) or pumping (transitions/wave face)
//     adds energy. Pumping on a downslope converts terrain into speed;
//     pumping on flat decays toward cruise — you can't pump your way to
//     max speed on flat concrete, exactly like a real board.
//   CARVE — steer input leans the board (BalanceModel) and turns with
//     edge hold: carving HOLDS speed through the turn (a real carve
//     accelerates out), while steering hard at speed without carve
//     commitment scrubs speed like a powerslide.
//   STANCE — regular/fakie (skate) or goofy/regular (snow/surf): switching
//     flips the control response and carries a tiny speed tax mid-ride
//     (switch-stance riding is slightly harder — a real skill signal).
//   Terrain — slope response from BoardPhysics feeds the momentum economy.

import { Vector3 } from '@babylonjs/core';
import { BalanceModel, sampleSlope } from './BoardPhysics';
import type { Scene, AbstractMesh } from '@babylonjs/core';

export type BoardStance = 'regular' | 'switch';

export interface BoardMoveTuning {
  pushAccel: number;        // m/s² per push stroke
  pushCooldownSec: number;
  pumpGain: number;         // energy from pumping on transitions
  cruiseSpeed: number;      // flat-ground pump asymptote
  maxSpeed: number;
  carveTurnRate: number;    // rad/s at full lean
  carveHold: number;        // speed retention through a committed carve
  scrubRate: number;        // speed loss when steering without carving
  drag: number;
  // ── SKATE-MOVE (2026-09-08): the push / coast / brake loop. All opt-in — snow (SNOW_TUNING) keeps the legacy model.
  /** A push stroke is a Δv applied over this window (s), not an instant impulse; also the auto-push cadence's stroke. */
  strokeSec?: number;
  /** Δv per stroke fades with speed: Δv = pushAccel × (1 − pushFade × speed/maxSpeed). A kick adds less to a fast board. */
  pushFade?: number;
  /** Holding the stick forward pushes on its own (cooldown-paced) while speed < cruiseSpeed × autoPushUntil. */
  autoPushUntil?: number;
  /** Rolling resistance (m/s²) while coasting with no input — the board comes to a stop instead of creeping forever. */
  rollResist?: number;
  /** Foot-drag decel (m/s²) at full stick-back. */
  brakeDecel?: number;
  /** Scrub as a per-second rate (× (1 − carveCommit) × scrubRate) instead of the legacy per-FRAME factor, which killed a
   *  half-deflected analog stick's speed in ~0.3 s (0.89× every frame at steer 0.5). */
  scrubPerSec?: boolean;
}

// SLOWER AND WEIGHTIER (owner call, 2026-09-12). A board should be heavy and you should BUILD speed rather than
// starting at it. Measured before: the rider was at 6-8 m/s within two seconds of a standing start and crossed the
// whole park in eight. Cruise and top speed come down about a quarter, the push gives less per kick and fades harder
// so speed is earned over several strokes, and a touch more roll resistance means letting off actually costs you.
// The venues grew at the same time, so a run is now a line through a place instead of a dash across one.
//
// FASTER (owner, 2026-09-15: "make the normal movement speed faster on board sports" — ~35%, skate + snow + surf). The
// weight stays: the push still fades with speed and a coasting board still rolls to rest. What moves is the pace a
// board settles at — the THPS cruise — and the ceiling above it, so the boost (+40% on top) still reads as a surge.
//
// FASTER AGAIN (owner, 2026-09-21: "faster normal board move speed skate/snow/surf"). 1.35 -> 1.6, +18.5% on every
// cruise, ceiling and push, and skate's held-forward push cadence now carries to 0.86 of cruise (was 0.8) — the pace a
// player actually rides at is the pace the stick HOLDS. Measured, stick held forward from a stand: 4 s covers 30.4 m
// (was 24.9) and the hold averages 8.75 m/s (was 7.1), 98% of the new 8.96 cruise. Still a ramp: the stroke is a Δv over
// 0.42 s and fades with speed, so nothing steps (largest frame-to-frame gain 0.14 m/s).
export const BOARD_PACE = 1.6;
export const SKATE_TUNING: BoardMoveTuning = {
  pushAccel: 3.1 * BOARD_PACE, pushCooldownSec: 0.6, pumpGain: 1.6 * BOARD_PACE, cruiseSpeed: 5.6 * BOARD_PACE,
  maxSpeed: 10.5 * BOARD_PACE, carveTurnRate: 2.4, carveHold: 1.0, scrubRate: 0.9, drag: 0.26,
  // SKATE-MOVE: the stroke is the board_push clip's 0.42 s; hold forward = push to cruise then roll; back = foot drag.
  // rollResist 0.4 -> 0.22 (SKATE-COAST): the weight pass (252d8ed) took six momentum
  // fields down together, but weight and friction are not the same thing. cruiseSpeed,
  // maxSpeed and pushAccel are the weight — harder to get going, lower ceiling — and
  // they are kept exactly as tuned. rollResist is the only one that governs how fast the
  // board dies when you stop pushing, and it is the only one that costs nothing to move:
  // settle (5.51) and time-to-95%-cruise (1.57 s) are identical at every value of it,
  // because it is a constant decel that applies ONLY while coasting. drag cannot do this
  // (it taxes cruise too). At 0.22 the two-push economy returns to 0.610 of cruise —
  // the 0.609 it had before the weight pass — and roll-to-rest goes 5.6 s -> 7.3 s
  // (avg 0.98 -> 0.75 m/s^2, against ~0.1-0.3 for a real board on flat concrete).
  strokeSec: 0.42, pushFade: 0.72, autoPushUntil: 0.86, rollResist: 0.22, brakeDecel: 7, scrubPerSec: true,
};
// Snow keeps more of its speed than skate — gravity is doing the work and a slope should feel fast — but the same
// quarter comes off the top so a rider is not outrunning the run.
export const SNOW_TUNING: BoardMoveTuning = {
  pushAccel: 0, pushCooldownSec: 1, pumpGain: 2.2 * BOARD_PACE, cruiseSpeed: 8.4 * BOARD_PACE,
  maxSpeed: 17 * BOARD_PACE, carveTurnRate: 1.9, carveHold: 1.02, scrubRate: 0.7, drag: 0.12,
  // WALLS + SPEED (2026-09-15): the carve scrub is PER SECOND, as skate's has been since SKATE-MOVE. Per frame, a gentle
  // 0.35 steer cost 11% of the speed every frame (0.886^60 per second) — measured: a held-forward run with light carves
  // crawled at 2 m/s down a hill it descends at 12–16 m/s straight. A carve still costs speed; it no longer stops you.
  scrubPerSec: true,
};
// A surfboard is the heaviest of the three: the wave supplies the speed and the rider trades it for turns.
export const SURF_TUNING: BoardMoveTuning = {
  pushAccel: 0, pushCooldownSec: 1, pumpGain: 2.6 * BOARD_PACE, cruiseSpeed: 6.2 * BOARD_PACE,
  maxSpeed: 12 * BOARD_PACE, carveTurnRate: 2.8, carveHold: 1.03, scrubRate: 0.6, drag: 0.19, scrubPerSec: true,
};

/** WALL-UNSTUCK (2026-09-21): how long after a touch the wall still owns the nose, the slowest a bounce leaves at, and the
 *  speed a glance never drags a moving board below. */
export const WALL_HOLD_SEC = 0.25;
export const WALL_BOUNCE_MIN = 2.6;
export const WALL_SLIDE_MIN = 3;
/** BAIL HONESTY (2026-09-21): the speed at which riding straight into a wall stops being a bump and becomes a slam the
 *  body has to answer for. Below it the bounce is the whole story; at or above it the mode owes the player a bail —
 *  a fall he can read, then gets up from. Set under the skate cruise (8.96) so a cruising rider who aims at a wall and
 *  holds it gets the fall, and a rider who drifts into one at walking pace does not. */
export const WALL_SLAM_SPEED = 7;

export class BoardMovement {
  vel = Vector3.Zero();
  yaw = 0;
  stance: BoardStance = 'regular';
  readonly balance = new BalanceModel();
  private pushCooldown = 0;
  /** Seconds left in the current push stroke (strokeSec model) and the Δv it still has to deliver. */
  private strokeLeft = 0;
  private strokeDv = 0;

  /** The SHARED boost's ramp, 0..1 (BoostKit — FINISH-RELEASE, 2026-09-14). While it is up the board is driven forward and
   *  the speed ceiling lifts to +40%, so a boost is a real surge, not flat out reached sooner. Set by the mode each frame. */
  boostK = 0;

  /** WALL-UNSTUCK: the last wall touched (its normal) and the seconds the board still counts as on it. */
  private wallNx = 0;
  private wallNz = 0;
  private wallT = 0;
  /** BAIL HONESTY: the last contact was a head-on hit fast enough to be a fall, not a bump. */
  private wallSlam = false;

  constructor(private tune: BoardMoveTuning = SKATE_TUNING) {}

  get speed(): number { return this.vel.length(); }
  get speed01(): number { return Math.min(1, this.speed / this.tune.maxSpeed); }
  get pushing(): boolean { return this.pushCooldown > 0; }
  /** The back foot is on the ground right now (the stroke window) — the anim tree's push beat. */
  get stroking(): boolean { return this.strokeLeft > 0; }

  /** A push stroke (skate flat-ground). Returns false during cooldown. */
  push(): boolean {
    if (this.pushCooldown > 0 || this.tune.pushAccel === 0) return false;
    this.pushCooldown = this.tune.pushCooldownSec;
    const fade = this.tune.pushFade ?? 0;
    const dv = this.tune.pushAccel * Math.max(0.25, 1 - fade * Math.min(1, this.speed / this.tune.maxSpeed));
    if (this.tune.strokeSec) {
      // SKATE-MOVE: the Δv lands over the stroke window (the foot is on the ground for the whole push clip), so the
      // speed ramps instead of stepping — a 3.8 m/s step in one frame read as a teleport.
      this.strokeLeft = this.tune.strokeSec;
      this.strokeDv = dv;
      return true;
    }
    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.vel.addInPlace(fwd.scale(dv));
    return true;
  }

  /**
   * A WALL (WALLS + SPEED, 2026-09-15: "fix the glitch where you get stuck to walls"). `nx, nz` is the wall's normal,
   * pointing back into the play area. Speed here always follows the facing, so a mode that only zeroed the velocity
   * into a wall left the board still POINTED at it: the next frame re-aimed the speed into the wall, it was zeroed again,
   * and the rider bled to a stop, pinned (measured on the skate fence: 0.03 m moved in 1.5 s holding forward). The wall
   * has to turn the board:
   *   · a glancing hit swings the nose along the wall (a touch off it) and keeps most of the speed — you scrape along;
   *   · a head-on hit (within ~37°) bounces the nose back off the wall and keeps a third — you are knocked away, never stuck.
   * Returns what happened, or null when the board is already leaving the wall.
   *
   * WALL-UNSTUCK (2026-09-21): the turn alone still glued a rider who HELD the stick toward the wall. The steer re-aimed
   * the nose into it every frame, every frame was a fresh glance, and every glance took its speed tax — measured, stick
   * held into the fence: 17–31 contacts in 5 s and the board dragged down to 1.2 m/s, scraping. A scrape is now ONE
   * contact: the tax is paid once when the board first meets the wall, never again while it stays on it, and for a beat
   * after a touch the steer cannot put the nose back into that wall (see update) — the board slides off along it at the
   * speed it has. A corner (two walls at once) has no "along", so it bounces from a shallower angle.
   */
  wall(nx: number, nz: number): 'glance' | 'bounce' | null {
    const corner = nx !== 0 && nz !== 0;
    const l = Math.hypot(nx, nz); if (!(l > 0)) return null;
    nx /= l; nz /= l;
    this.wallSlam = false;
    const scraping = this.wallT > 0;                    // still on the wall from a moment ago: no second tax
    this.wallNx = nx; this.wallNz = nz; this.wallT = WALL_HOLD_SEC;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const into = -(fx * nx + fz * nz);                 // 1 = straight at the wall, 0 = along it
    if (into <= 0.02) return null;
    const speed = this.speed;
    let dx: number, dz: number, keep: number, kind: 'glance' | 'bounce';
    if (into > (corner ? 0.5 : 0.8)) {
      dx = fx + 2 * into * nx; dz = fz + 2 * into * nz;   // mirror the heading off the wall
      keep = Math.max(WALL_BOUNCE_MIN, speed * 0.45); kind = 'bounce';
      this.wallSlam = !scraping && speed >= WALL_SLAM_SPEED;   // BAIL HONESTY: rode into it, hard, from clear air
    } else {
      dx = fx + into * nx + 0.2 * nx; dz = fz + into * nz + 0.2 * nz;   // along the wall, nudged off it
      keep = scraping ? speed : Math.max(Math.min(speed, WALL_SLIDE_MIN), speed * (1 - 0.3 * into)); kind = 'glance';
    }
    this.yaw = Math.atan2(dx, dz);
    this.strokeLeft = kind === 'bounce' ? 0 : this.strokeLeft;
    this.vel.set(Math.sin(this.yaw) * keep, 0, Math.cos(this.yaw) * keep);
    return kind;
  }

  /** True for a beat after the board touched a wall. */
  get onWall(): boolean { return this.wallT > 0; }

  /** BAIL HONESTY (2026-09-21): true when the last `wall()` was a fresh head-on hit at speed — the mode owes the player a
   *  readable fall for it. The board is already turned back off the wall and holding WALL_BOUNCE_MIN, so whatever the
   *  mode does with the bail, the rider gets up facing away from what he hit and rides off it. Never true twice for one
   *  scrape: a board sliding along a wall is not falling. */
  get slammedWall(): boolean { return this.wallSlam; }

  /** Stance switch: instant, small speed tax (switch riding is harder). */
  switchStance(): void {
    this.stance = this.stance === 'regular' ? 'switch' : 'regular';
    this.vel.scaleInPlace(0.97);
  }

  /**
   * Frame step. steer/pump are -1..1 / 0..1; groundMeshes enable slope
   * response (omit for flat). Returns the new velocity.
   * `drive` (SKATE-MOVE): the L stick's forward axis, −1..1 — forward auto-pushes (strokeSec / autoPushUntil), back
   * foot-drags (brakeDecel). Modes that do not pass it (snow) are unchanged.
   */
  update(dt: number, steer: number, pump: number, scene?: Scene, pos?: Vector3, ground?: AbstractMesh[], drive = 0): Vector3 {
    // A ZERO-dt FRAME (a slow-mo beat, a tab resume) must be a no-op. The stroke below divides `step / dt`, and with a
    // stroke in flight that is 0 / 0 = NaN — the [SKATE-NAN] trap's recorded frames were all dt 0 (release gauntlet,
    // 2026-09-14: two NaN reports in the first 100 s of a production skate run).
    if (!(dt > 0)) return this.vel;
    this.pushCooldown = Math.max(0, this.pushCooldown - dt);
    const t = this.tune;
    const stanceMult = this.stance === 'switch' ? 0.92 : 1;   // switch = slightly duller
    void stanceMult;

    // ── SKATE-MOVE: hold forward = push cadence up to cruise, then roll ──
    if (drive > 0.3 && t.strokeSec && this.speed < t.cruiseSpeed * (t.autoPushUntil ?? 1)) this.push();

    // ── terrain: gravity along slope builds/bleeds speed ──
    let slopeAccel = 0;
    let fall: { yaw: number; accel: number } | null = null;
    // the stroke in flight delivers its Δv evenly across the window
    if (this.strokeLeft > 0 && t.strokeSec) {
      const step = Math.min(dt, this.strokeLeft);
      slopeAccel += (this.strokeDv / t.strokeSec) * (step / dt);
      this.strokeLeft -= step;
    }
    // foot drag: the stick pulled back scrubs speed hard, to a stop, never backwards
    const brake = drive < -0.3 && t.brakeDecel ? t.brakeDecel * Math.min(1, -drive) : 0;
    // rolling resistance: a coasting board (no push, no pump, no carve) comes to rest
    const coasting = !this.stroking && drive <= 0.3 && pump < 0.1 && Math.abs(steer) < 0.5;
    const resist = coasting && t.rollResist ? t.rollResist : 0;
    if (scene && pos && ground?.length) {
      const s = sampleSlope(scene, pos, this.yaw, ground);
      slopeAccel += s.gravityAlongSlope;   // += : the stroke above must survive the terrain sample
      if (s.groundGap < 0.35 && s.fallAccel > 0.4) fall = { yaw: s.fallYaw, accel: s.fallAccel };
      // pumping converts slope + transition into extra speed
      if (pump > 0.1) {
        slopeAccel += pump * t.pumpGain * (0.5 + s.steepness01 * 2);
      }
    } else if (pump > 0.1) {
      // flat-ground pump: approaches cruise, never beyond — the gain fades
      // to zero AT cruise, so cruise is the asymptote by construction.
      const headroom = Math.max(0, 1 - this.speed / t.cruiseSpeed);
      slopeAccel += pump * t.pumpGain * 1.6 * headroom;
    }

    // ── carve: steer leans the board, committed carves hold speed ──
    const lean = Math.max(-1, Math.min(1, steer));
    this.balance.update(dt, lean, this.speed01);
    const carveCommit = Math.abs(lean);
    this.yaw += steer * t.carveTurnRate * stanceMult * dt * (0.4 + 0.6 * Math.min(1, this.speed / 4));
    // WALL-UNSTUCK: for a beat after a touch the steer cannot aim the nose back INTO that wall — the board slides along
    // it, a touch off. Steering away is untouched, so the way off a wall is always the stick away from it.
    if (this.wallT > 0) {
      this.wallT = Math.max(0, this.wallT - dt);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const into = -(fx * this.wallNx + fz * this.wallNz);
      if (into > -0.1) this.yaw = Math.atan2(fx + (into + 0.1) * this.wallNx, fz + (into + 0.1) * this.wallNz);
    }

    // ── THE HILL TAKES A STALLED BOARD (WALLS + SPEED, 2026-09-15) ──
    // Speed here follows the facing, and gravity only fed the component ALONG the facing — so a board turned across the
    // fall line lost its speed, and one that came to rest facing across or up the hill stayed there forever: zero speed,
    // zero pull, a 0.4× turn rate. Measured: a snowboard run held forward for 60 s travelled 53 m with 29 stalls. On real
    // snow a stopped board slides and swings its nose downhill; so a board that has nearly stopped on a slope is turned
    // toward the fall line and pulled down it. Only when SLOW: a board carrying speed up a quarter pipe or across the
    // hill is riding a line on purpose, and it reaches this rule on its own at the top of the transition.
    if (fall && this.speed < 2.5) {
      let d = fall.yaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const hold = 1 - 0.6 * Math.min(1, Math.abs(steer));          // a rider holding an edge resists (never fully)
      const rate = 2.2 * Math.min(1, fall.accel / 2) * hold;
      this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
      slopeAccel = Math.max(slopeAccel, fall.accel * Math.max(0.25, Math.cos(d)));
    }

    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // Steering re-aligns velocity toward facing (committed carves hold
    // speed through the turn; lazy steers scrub). SPEED IS SCALAR-FIRST:
    // pushing/pumping/drag act on magnitude, never re-deriving direction
    // from a zero vector. Alignment is a turn-cost, not a throttle.
    const speed = this.speed;
    if (speed > 0.01) {
      // turn cost only applies while actually steering; straight running
      // pays nothing (drag handles the bleed).
      const turnCost = carveCommit > 0.05
        ? (t.scrubPerSec ? 1 - (1 - carveCommit) * t.scrubRate * 0.6 * dt : 1 - (1 - carveCommit) * t.scrubRate * 0.25)
        : 1;
      const held = speed * turnCost + (slopeAccel - brake - resist) * dt;
      this.vel = fwd.scale(Math.max(0, held));
    } else if (slopeAccel > 0) {
      this.vel = fwd.scale(slopeAccel * dt);
    } else if (speed > 0) {
      this.vel.setAll(0);
    }

    // BOOST: drive forward along the facing and lift the ceiling, both scaled by the ramp
    const bk = Math.max(0, Math.min(1, this.boostK));
    if (bk > 0) this.vel.addInPlace(new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).scale(t.maxSpeed * 1.6 * bk * dt));
    // drag + clamp
    this.vel.scaleInPlace(Math.max(0, 1 - t.drag * dt));
    const cap = t.maxSpeed * (1 + 0.4 * bk);
    if (this.speed > cap) this.vel.scaleInPlace(cap / this.speed);
    return this.vel;
  }
}
