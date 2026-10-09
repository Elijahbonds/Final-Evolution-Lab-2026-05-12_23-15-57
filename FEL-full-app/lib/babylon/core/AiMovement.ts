// AiMovement — the AI bodies move with the hero's weight (HOOPS MOTION phase 3b, 2026-09-25; plan §3 "Feet": "The AI moves with
// acceleration. It uses the hero's CourtMovement model (accel 26 / decel 34 m/s²) and honours its `sprint` flag").
//
// Every AI body on a hoops court was bang-bang: its brain's intent is a unit vector or nothing (BasketballCore steer()), and the modes
// scaled it straight to a velocity — 3.6 m/s for the 1v1 rival, 3.8 for the 3v3 defenders, 4.2 for the 3v3 mates — so a start or a
// stop happened in one frame (3.6 m/s in 1/60 s: 216 m/s², MAP D-gap 1). The tree, the stride match and the posture read that wish, so
// the loops snapped between standing and full stride, and the `sprint` flag the brains set (a chase, a recovery, a closeout, a run
// of more than 3 m) was ignored.
//
// Each AI body now owns a mover on the hero's numbers (DEFAULT_MOVEMENT: accel 26 off the mark and up to speed, decel 34 to brake,
// turn or stop — 33 in the mover, AI_BRAKE, a margin under the gate's 34 for what the drawn root adds), tuned to its own speeds: its RUN top is what it always moved at, and a sprint is AI_SPRINT_X of that. It steers in
// VELOCITY space — each frame the velocity moves toward the wished one by at most accel × dt (speeding up along the way it is going)
// or decel × dt (braking, turning, reversing) — so a turn is an arc whose speed dips, a reversal is a plant (a hard brake through
// zero, then the new way), and no frame's change of velocity is ever harder than 34 m/s². CourtMovement's own steering was the first
// try and was measured wrong for a brain: it turns by lerping the heading toward the stick, which never comes round when the stick is
// (nearly) opposite — a defender who overshot his spot kept running away from it at speed (AiMovement.test, "reversal").
// A body is handed a WISHED VELOCITY in m/s — a brain's unit intent times its top, or an attacker's own wish — and gets back the
// velocity it really has, which the mode moves the root by and feeds to the tree, the stride match and the posture.
import { Vector3 } from '@babylonjs/core';
import { DEFAULT_MOVEMENT } from './CourtMovement';

/** A sprint's top over the body's run top — the brains' sprint flag (a chase, a recovery, a closeout, a long run). */
export const AI_SPRINT_X = 1.2;
/** The hero's accel / decel (m/s², DEFAULT_MOVEMENT): no AI frame speeds up harder than the first, or brakes harder than the second. */
export const AI_ACCEL = DEFAULT_MOVEMENT.accel, AI_DECEL = DEFAULT_MOVEMENT.decel;
/** What the mover really brakes, turns and reverses at (m/s²): the hero's decel less 1 — the drawn root carries the recorder's rounding and
 *  the modes' clamps on top of the model (measured ±0.3 m/s² round a 34 cap: p99 34.3 on the 3v3 slides), and the gate's line is 34. */
export const AI_BRAKE = AI_DECEL - 1;
/** A brake against the wish at more than this (m/s) is a PLANT — the mode pins a foot through it (FootPlant), as it does the hero's. */
export const AI_PLANT_MPS = 1.5;

export interface AiMoveState { vel: Vector3; speed01: number; planting: boolean }

export class AiMover {
  readonly vel = Vector3.Zero();
  /** Scale the tops (a burst, a slipstream, a synergy boost): multiplies the run and sprint speeds, not the wish's direction. */
  speedScale = 1;
  private readonly run: number;
  private readonly sprintTop: number;
  private planting = false;
  constructor(runMps: number, sprintMps = runMps * AI_SPRINT_X) {
    this.run = runMps; this.sprintTop = Math.max(runMps, sprintMps);
  }
  /** The run top (m/s), unscaled. */
  get runMps(): number { return this.run; }
  /**
   * One frame toward a wished planar velocity (m/s, world x/z). Its length is how fast the brain wants to go, capped at the run top (or
   * the sprint's with `sprint`), times speedScale. Returns the state (vel = the body's real velocity; speed01 against the run top).
   */
  step(dt: number, wish: { x: number; z: number }, sprint = false): AiMoveState {
    const top = (sprint ? this.sprintTop : this.run) * this.speedScale;
    const sp = Math.hypot(wish.x, wish.z);
    const want = sp > 1e-4 ? Math.min(sp, top) / sp : 0;
    return this.track(dt, { x: wish.x * want, z: wish.z * want });
  }
  /** One frame toward a wished velocity AS GIVEN (m/s; no top applied — an attacker's own wish, whose brain sets its speeds), with the
   *  same accel / decel limits. */
  track(dt: number, wish: { x: number; z: number }): AiMoveState {
    const tx = wish.x, tz = wish.z;
    const vx = this.vel.x, vz = this.vel.z;
    const dx = tx - vx, dz = tz - vz, d = Math.hypot(dx, dz);
    // speeding up along the way it is already going is the accel; anything else — braking, turning, a reversal — is the decel
    const along = vx * tx + vz * tz;
    const speedingUp = along >= 0 && tx * tx + tz * tz >= vx * vx + vz * vz;
    const cap = (speedingUp ? AI_ACCEL : AI_BRAKE) * Math.max(0, dt);
    if (d > 1e-9) { const k = Math.min(1, cap / d); this.vel.x = vx + dx * k; this.vel.z = vz + dz * k; }
    this.vel.y = 0;
    this.planting = along < 0 && Math.hypot(vx, vz) > AI_PLANT_MPS;
    return { vel: this.vel, speed01: Math.min(1, Math.hypot(this.vel.x, this.vel.z) / Math.max(1e-6, this.run * this.speedScale)), planting: this.planting };
  }
  /** A brain's stick-space intent (moveX / moveY, a unit vector or 0 — BasketballCore steer(); +moveY = −z on court), at the run top
   *  (with `sprint`: the sprint's), times speedScale. */
  stepIntent(dt: number, intent: { moveX: number; moveY: number; sprint?: boolean }): AiMoveState {
    const top = (intent.sprint ? this.sprintTop : this.run) * this.speedScale;
    return this.step(dt, { x: intent.moveX * top, z: -intent.moveY * top }, !!intent.sprint);
  }
  /** Braking against the wish at speed this frame (the plant). */
  get plantingNow(): boolean { return this.planting; }
  /**
   * THE BODY IS WHERE IT IS. Call once a frame, before the step, with the root's planar position: the mover takes the velocity the body
   * REALLY had since the last call. Other code moves an AI root too — the body-contact separation (a man standing in the lane holds a
   * runner up), the court clamps, a rail — and a mover that never heard of them kept its full speed against a body stopped at the wall,
   * then went from standing to 4.2 m/s in a frame the moment it came free (measured: 0.58 → 2.92 → 4.20 m/s over two frames, a mate
   * held up beside a defender). A jump too big for a run (a reset, a teleport: > 12 m/s) is not adopted.
   *
   * `moveStamp` (3b review): a root that only moves at one point of the frame — a PHYSICS body, moved in the physics step inside
   * scene.render — is observed once per stamp (the scene's frame id). Under the harness's fast-forward (?qaSpeed=N: N updates a render)
   * sub-updates 2..N saw zero travel and adopted a velocity of 0, so the 1v1 rival drove at 0.43 m/s in qaSpeed=4 (measured on c5f5d508).
   * An unchanged stamp keeps the velocity; a new one reads the travel over this update's dt (the physics step's own). Without a stamp
   * (a root the mode moves in every update: the 3v3 bodies) every call observes.
   */
  observe(pos: { x: number; z: number }, dt: number, moveStamp?: number): void {
    if (moveStamp !== undefined) {
      if (this.seen && moveStamp === this.lastStamp) return;   // the root cannot have moved since the last observe: keep the velocity
      this.lastStamp = moveStamp;
    }
    if (this.seen && dt > 1e-4) {
      const vx = (pos.x - this.lastX) / dt, vz = (pos.z - this.lastZ) / dt;
      if (vx * vx + vz * vz < 144) { this.vel.x = vx; this.vel.z = vz; }
    }
    this.lastX = pos.x; this.lastZ = pos.z; this.seen = true;
  }
  private seen = false; private lastX = 0; private lastZ = 0; private lastStamp = Number.NaN;
  /** A reset, a teleport, a knockdown: standing still, now (and the next observe starts afresh). */
  stop(): void { this.vel.setAll(0); this.planting = false; this.seen = false; }
  /** Adopt a velocity the mode wrote itself (a scripted drive's own motion), so the next wish starts from it. */
  adopt(v: { x: number; z: number }): void { this.vel.set(v.x, 0, v.z); }
}

// ── A SCRIPTED DRIVE AT THE SAME WEIGHT (HOOPS MOTION phase 3b) ──────────────────────────────────────────────────────────────────
// The 3v3 rival's drive is a clocked path (driveK walks from where he caught it to the rim in driveSec), and it was a straight lerp:
// he stood still, then covered 2–5.4 m/s from the first frame (a 324 m/s² start), and the bend round a defender stepped into the
// corridor in one frame. The clock and the arrival are kept — the drive still lasts driveSec and ends at the rim, so the block
// window and the tell are where they were — and the path's distance follows an accel-limited profile: a ramp at AI_ACCEL, then a
// cruise fast enough to arrive on time.

/** The share of the drive's length covered at `tauSec` into a drive of `totalSec` and `lengthM`, starting at `v0` m/s along the drive
 *  (0 = from a stand; negative = moving away from the rim): the speed changes from v0 at `accel` (through zero for a reversal) to the
 *  cruise speed that arrives at `totalSec` exactly, then that cruise. Linear when no such cruise exists (driveSecFor lengthens the clock
 *  so it always does). Can dip below 0 while a backpedal is braked. At v0 = 0 it is the stand-start ramp.
 *  (3b review) The drive always started from a stand: a defender backpedalling at 2.9 m/s was put on 0.22 m/s the other way in one frame
 *  (186 m/s², 17 of 34 drive starts at 87–262 m/s² in rC). */
export function driveFraction(tauSec: number, totalSec: number, lengthM: number, accel = AI_ACCEL, v0 = 0): number {
  const T = totalSec, L = lengthM, t = Math.min(Math.max(0, tauSec), T);
  if (!(T > 0) || !(L > 0)) return T > 0 ? t / T : 1;
  const vc = driveCruiseFrom(T, L, v0, accel);
  if (vc === null) return t / T;
  const ta = Math.abs(vc - v0) / accel, sg = vc >= v0 ? 1 : -1;
  const s = t <= ta ? v0 * t + 0.5 * sg * accel * t * t : v0 * ta + 0.5 * sg * accel * ta * ta + vc * (t - ta);
  return Math.min(1, s / L);
}
/** The cruise speed (m/s) a drive starting at `v0` reaches with a single change of speed at `accel` and holds, so it covers `lengthM` in
 *  exactly `totalSec`; null when none does (too far to arrive, or too fast to stop short). */
export function driveCruiseFrom(totalSec: number, lengthM: number, v0: number, accel = AI_ACCEL): number | null {
  const T = totalSec, L = lengthM, a = accel;
  if (L >= v0 * T) { const disc = a * a * T * T - 2 * a * (L - v0 * T); return disc < 0 ? null : v0 + a * T - Math.sqrt(disc); }
  const disc = a * a * T * T - 2 * a * (v0 * T - L); return disc < 0 ? null : v0 - (a * T - Math.sqrt(disc));
}
/** The cruise speed of the stand-start profile (m/s). */
export function driveCruiseMps(totalSec: number, lengthM: number, accel = AI_ACCEL): number {
  return driveCruiseFrom(totalSec, lengthM, 0, accel) ?? lengthM / totalSec;
}
/** The drive's clock for a start at `v0`: `totalSec`, lengthened (in 0.05 s steps, up to `maxSec`) until a moving start arrives without a
 *  cruise faster than the stand start's on the original clock — a reversal out of a backpedal takes the time the brake takes. */
export function driveSecFor(lengthM: number, totalSec: number, v0: number, accel = AI_ACCEL, maxSec = 2.4): number {
  const cap = driveCruiseMps(totalSec, lengthM, accel) + 1e-6;
  let T = totalSec;
  for (;;) {
    const vc = driveCruiseFrom(T, lengthM, v0, accel);
    if ((vc !== null && vc <= cap) || T >= maxSec - 1e-9) return T;
    T = Math.min(maxSec, T + 0.05);
  }
}

/** A 1-D offset that follows its target at a limited speed and acceleration (the drive's bend round a defender): it closes on the
 *  target over `tau`, never faster than `maxMps`, and its speed changes by at most `accel` × dt. */
export class AccelFollower {
  value = 0; vel = 0;
  constructor(private readonly tau = 0.12, private readonly maxMps = 3, private readonly accel = 18) {}
  step(target: number, dt: number): number {
    if (!(dt > 0)) return this.value;
    const want = Math.max(-this.maxMps, Math.min(this.maxMps, (target - this.value) / this.tau));
    this.vel += Math.max(-this.accel * dt, Math.min(this.accel * dt, want - this.vel));
    this.value += this.vel * dt;
    return this.value;
  }
  /** Start at `v` moving at `vel` (a body already moving across the line: its sideways speed bleeds out at ≤ accel, never in a frame). */
  reset(v = 0, vel = 0): void { this.value = v; this.vel = vel; }
}
