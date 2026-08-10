// BasketballCore v3 — REPLACES the M52 file. Everything v2 shipped is kept
// byte-for-byte in behavior (DribbleController, ShotMeter, body collision,
// ankle-breaker, shot variety, both AI brains, contestLevel, court clamps)
// and FOUR systems are added for the comprehensive upgrade pass:
//   TurboMeter — sprint is now a spent resource (drains while sprinting,
//     regens while you don't). Ends sprint-spam, creates real pacing, and
//     gates the new drive dunks so they're earned, not free.
//   ShotArc — the ball actually FLIES now: a real parabolic arc from the
//     release hand to the rim over ~0.65s (makes drop through, misses clang
//     off a rim point and bounce out via the mode's BallSim). The result is
//     still decided at release — the arc is the honest visual sell, not
//     hidden physics dice.
//   Drive dunks — checkDriveDunk(): attacking the rim at speed with turbo
//     in the tank converts the attempt into a DUNK instead of a metered
//     shot; a defender inside the drive makes it a POSTERIZE opportunity
//     (they get put on the floor). The missing Blacktop fantasy.
//   Shot blocking — checkBlock(): defense grows a real contest JUMP with a
//     timing window around the shooter's release. Mistimed jumps do
//     nothing; timed ones erase the shot.

import { Vector3 } from '@babylonjs/core';
import type { AIBehavior, Intent } from './PlayerSlot';

// ── Movement ─────────────────────────────────────────────────────────────
export interface DribbleResult { crossover: boolean; speed01: number; facingRad: number }

export class DribbleController {
  vel = Vector3.Zero();
  facing = 0;
  private lastMoveX = 0; private lastMoveY = 0;
  private crossoverCooldown = 0;

  constructor(private cfg = { maxSpeed: 5.4, accel: 16, decel: 10, turnRate: 9, crossoverBoost: 2.2 }) {}

  update(dt: number, moveX: number, moveY: number, sprint: boolean): DribbleResult {
    this.crossoverCooldown = Math.max(0, this.crossoverCooldown - dt);

    const mag = Math.hypot(moveX, moveY);
    let crossover = false;

    // crossover: stick reversed hard within the reaction window, and we
    // were already moving with some pace — reads as an intentional shake
    const dot = this.lastMoveX * moveX + this.lastMoveY * moveY;
    if (mag > 0.6 && this.vel.lengthSquared() > 1 && dot < -0.4 && this.crossoverCooldown === 0) {
      crossover = true;
      this.crossoverCooldown = 0.5;
      const dir = new Vector3(moveX, 0, -moveY).normalize();
      this.vel = dir.scale(Math.min(this.cfg.maxSpeed * 1.15, this.vel.length() + this.cfg.crossoverBoost));
      this.facing = Math.atan2(dir.x, dir.z);
    } else if (mag > 0.05) {
      const target = new Vector3(moveX, 0, -moveY).normalize().scale(this.cfg.maxSpeed * (sprint ? 1 : 0.7) * mag);
      const accel = this.cfg.accel * dt;
      this.vel.x += Math.max(-accel, Math.min(accel, target.x - this.vel.x));
      this.vel.z += Math.max(-accel, Math.min(accel, target.z - this.vel.z));
      const wantFacing = Math.atan2(moveX, -moveY);
      let dFace = wantFacing - this.facing;
      while (dFace > Math.PI) dFace -= 2 * Math.PI;
      while (dFace < -Math.PI) dFace += 2 * Math.PI;
      const maxStep = this.cfg.turnRate * dt;
      this.facing += Math.max(-maxStep, Math.min(maxStep, dFace));
    } else {
      const decel = this.cfg.decel * dt;
      const speed = this.vel.length();
      if (speed > 0) this.vel.scaleInPlace(Math.max(0, 1 - decel / Math.max(speed, 0.001)));
    }

    this.lastMoveX = moveX; this.lastMoveY = moveY;
    return { crossover, speed01: Math.min(1, this.vel.length() / this.cfg.maxSpeed), facingRad: this.facing };
  }
}

// ── NEW: body collision ──────────────────────────────────────────────────
/** Push two bodies apart on XZ if they overlap. Returns true when a push
 *  happened (modes can use it for a bump sound at high closing speed). */
export function resolveBodyCollision(a: Vector3, b: Vector3, radius = 0.55): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  const distSq = dx * dx + dz * dz;
  const minDist = radius * 2;
  if (distSq >= minDist * minDist || distSq < 1e-6) return false;
  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) / 2;
  const nx = dx / dist, nz = dz / dist;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
  return true;
}

// ── NEW: ankle-breaker ───────────────────────────────────────────────────
export const ANKLE_BREAK_RANGE = 1.6;
export const ANKLE_BREAK_STUN_SEC = 0.7;
/** A crossover thrown right in a tight defender's face breaks their ankles.
 *  The mode applies the stun (skip the defender's movement for
 *  ANKLE_BREAK_STUN_SEC and play a stagger clip). */
export function checkAnkleBreak(crossover: boolean, handler: Vector3, defender: Vector3): boolean {
  return crossover && Vector3.Distance(handler, defender) < ANKLE_BREAK_RANGE;
}

// ── Shooting ─────────────────────────────────────────────────────────────
export type ShotQuality = 'perfect' | 'good' | 'early' | 'late' | 'brick';
export type ShotStyle = 'layup' | 'floater' | 'jumper' | 'fadeaway';

export interface ShotContext { style: ShotStyle; label: string; pctMod: number }

/** Type the attempt from real context. `moveVel` is the shooter's current
 *  velocity; moving away from the hoop under a tight contest = fadeaway. */
export function classifyShot(shooter: Vector3, moveVel: Vector3, hoop: Vector3, contest01: number): ShotContext {
  const dist = Vector3.Distance(shooter, hoop);
  const toHoop = hoop.subtract(shooter); toHoop.y = 0;
  const speed = moveVel.length();
  const movingAway = speed > 1.2 && Vector3.Dot(moveVel, toHoop) < -0.3 * speed * toHoop.length();

  if (movingAway && contest01 > 0.25) return { style: 'fadeaway', label: 'FADEAWAY', pctMod: 0.82 };
  if (dist < 2.2) return { style: 'layup', label: 'LAYUP', pctMod: 1.18 };
  if (dist < 4.5) return { style: 'floater', label: 'FLOATER', pctMod: 1.0 };
  return { style: 'jumper', label: 'JUMPER', pctMod: 0.95 };
}

export class ShotMeter {
  active = false;
  t = 0;
  private duration = 0.72;
  private greenCenter = 0.62;
  private greenHalfWidth = 0.09;

  /** A tight defender narrows the window and speeds the rise; shot style
   *  tunes it further (layups forgiving, fadeaways demanding). */
  start(contestLevel01: number, style: ShotStyle = 'jumper'): void {
    this.active = true; this.t = 0;
    this.duration = 0.72 - contestLevel01 * 0.22;
    this.greenHalfWidth = Math.max(0.035, 0.09 - contestLevel01 * 0.05);
    if (style === 'layup') { this.greenHalfWidth *= 1.5; this.duration += 0.08; }
    if (style === 'fadeaway') { this.greenHalfWidth *= 0.75; this.duration -= 0.06; }
  }
  update(dt: number): number {
    if (!this.active) return 0;
    this.t = Math.min(1, this.t + dt / this.duration);
    return this.t;
  }
  /** Release NOW — call on the actionEdge; returns the quality band. */
  release(): ShotQuality {
    this.active = false;
    const d = this.t - this.greenCenter;
    if (Math.abs(d) <= this.greenHalfWidth * 0.35) return 'perfect';
    if (Math.abs(d) <= this.greenHalfWidth) return 'good';
    if (d < 0) return 'early';
    if (this.t >= 1) return 'brick';
    return 'late';
  }
}
export const SHOT_QUALITY_PCT: Record<ShotQuality, number> = {
  perfect: 0.97, good: 0.8, early: 0.35, late: 0.3, brick: 0.04,
};

// ── AI: defender ─────────────────────────────────────────────────────────
export class DefenderBrain implements AIBehavior {
  constructor(private aggression = 0.6) {}
  decide(_dt: number, self: Vector3, ball: Vector3, hoop: Vector3): Intent {
    // stay between the ball-handler and the hoop, biased toward the ball
    const denyPoint = Vector3.Lerp(ball, hoop, 0.35);
    const toDeny = denyPoint.subtract(self);
    toDeny.y = 0;
    const dist = toDeny.length();
    const closeEnough = dist < 1.4;
    return {
      moveX: closeEnough ? 0 : Math.max(-1, Math.min(1, toDeny.normalize().x)),
      moveY: closeEnough ? 0 : Math.max(-1, Math.min(1, -toDeny.normalize().z)),
      sprint: dist > 3,
      action: false, actionHeld: 0,
      pass: false,
      steal: dist < 1.1 && Math.random() < this.aggression * 0.02,   // occasional steal poke, cheap per-frame odds
    };
  }
}

/** How contested is `ballHandler` right now, 0..1 — feeds ShotMeter.start(). */
export function contestLevel(ballHandler: Vector3, defender: Vector3 | null): number {
  if (!defender) return 0;
  const d = Vector3.Distance(ballHandler, defender);
  return Math.max(0, Math.min(1, 1 - d / 2.2));
}

// ── AI: teammate (3v3) ──────────────────────────────────────────────────
/** Simple spacing: hold a lane away from the ball-handler and defenders,
 *  cut to the hoop when a lane opens. Good enough to read as "playing team
 *  ball" without needing a full playbook system. */
export class TeammateBrain implements AIBehavior {
  constructor(private slotAngle: number, private holdRadius = 5.5) {}
  decide(_dt: number, self: Vector3, ball: Vector3, hoop: Vector3, _allies: Vector3[], foes: Vector3[]): Intent {
    const spot = hoop.add(new Vector3(Math.sin(this.slotAngle) * this.holdRadius, 0, Math.cos(this.slotAngle) * this.holdRadius));
    // if the passing lane to the hoop is clear (no defender within 2u of
    // the cut line), cut hard to the rim instead of holding the spot
    const nearestFoe = foes.reduce<number>((m, f) => Math.min(m, Vector3.Distance(f, self)), 99);
    const cutting = nearestFoe > 3.2 && Vector3.Distance(self, ball) < 8;
    const target = cutting ? hoop : spot;
    const to = target.subtract(self); to.y = 0;
    const dist = to.length();
    if (dist < 0.6) return { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };
    const dir = to.normalize();
    return { moveX: dir.x, moveY: -dir.z, sprint: cutting, action: false, actionHeld: 0, pass: false, steal: false };
  }
}

// ── Court helpers ────────────────────────────────────────────────────────
export function clampToHalfCourt(pos: Vector3, halfWidth: number, depth: number): void {
  pos.x = Math.max(-halfWidth, Math.min(halfWidth, pos.x));
  pos.z = Math.max(0.5, Math.min(depth, pos.z));
}

// ── NEW (v3): turbo ──────────────────────────────────────────────────────
/** Sprint fuel. Modes call gate() every frame with the player's wish; it
 *  returns whether sprint is actually allowed and burns/regens the tank.
 *  Empty tank must fall to 25% before sprint re-arms (no flutter). */
export class TurboMeter {
  t01 = 1;
  private rearming = false;
  gate(dt: number, wantSprint: boolean, moving: boolean): boolean {
    if (this.rearming && this.t01 >= 0.25) this.rearming = false;
    const canSprint = wantSprint && moving && !this.rearming && this.t01 > 0;
    if (canSprint) {
      this.t01 = Math.max(0, this.t01 - 0.34 * dt);
      if (this.t01 === 0) this.rearming = true;
    } else {
      this.t01 = Math.min(1, this.t01 + 0.18 * dt);
    }
    return canSprint;
  }
}

// ── NEW (v3): the ball flight arc ────────────────────────────────────────
/** Parabolic flight from the release point to the rim (or a front-rim
 *  clang point for misses). Pure visual sell — the make/miss is decided at
 *  release; step() returns 'flying' | 'made' | 'missed' when it lands. */
export class ShotArc {
  private from = new Vector3();
  private to = new Vector3();
  private t = 0;
  private duration = 0.65;
  private apex = 1.6;
  active = false;
  private made = false;

  start(from: Vector3, rim: Vector3, made: boolean, style: ShotStyle): void {
    this.from.copyFrom(from);
    this.made = made;
    this.to.copyFrom(rim);
    if (!made) {                       // clang point on the front of the iron
      this.to.x += (Math.random() - 0.5) * 0.3;
      this.to.z += 0.22;
    }
    const dist = Vector3.Distance(from, rim);
    this.duration = style === 'layup' ? 0.4 : Math.min(0.9, 0.45 + dist * 0.045);
    this.apex = style === 'floater' ? 2.2 : style === 'layup' ? 0.9 : 1.6;
    this.t = 0;
    this.active = true;
  }

  step(dt: number, ball: Vector3): 'flying' | 'made' | 'missed' {
    if (!this.active) return 'flying';
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.t;
    ball.x = this.from.x + (this.to.x - this.from.x) * k;
    ball.z = this.from.z + (this.to.z - this.from.z) * k;
    ball.y = this.from.y + (this.to.y - this.from.y) * k + Math.sin(k * Math.PI) * this.apex;
    if (this.t >= 1) {
      this.active = false;
      return this.made ? 'made' : 'missed';
    }
    return 'flying';
  }
}

// ── NEW (v3): drive dunks ────────────────────────────────────────────────
export type DriveDunkKind = 'none' | 'dunk' | 'poster';
export const DUNK_RANGE = 2.8;
export const DUNK_MIN_SPEED = 3.4;
export const DUNK_MIN_TURBO = 0.25;
/** Attacking the rim at speed with turbo converts the attempt to a dunk;
 *  a defender parked inside the drive line makes it a posterize attempt. */
export function checkDriveDunk(shooter: Vector3, vel: Vector3, hoop: Vector3, turbo01: number, defender: Vector3 | null): DriveDunkKind {
  const dist = Vector3.Distance(shooter, hoop);
  if (dist > DUNK_RANGE || vel.length() < DUNK_MIN_SPEED || turbo01 < DUNK_MIN_TURBO) return 'none';
  const toHoop = hoop.subtract(shooter); toHoop.y = 0;
  if (Vector3.Dot(vel, toHoop) <= 0) return 'none';                 // must be attacking, not retreating
  if (defender && Vector3.Distance(defender, shooter) < 1.5) return 'poster';
  return 'dunk';
}
export const DUNK_PCT: Record<Exclude<DriveDunkKind, 'none'>, number> = { dunk: 0.92, poster: 0.78 };

// ── NEW (v3): shot blocking ──────────────────────────────────────────────
export const BLOCK_RANGE = 1.5;
export const BLOCK_WINDOW_SEC = 0.4;
/** A contest jump erases the shot when the blocker is in range AND jumped
 *  within the window before the release. `jumpAgeSec` = time since the
 *  blocker left the floor (Infinity = never jumped). */
export function checkBlock(blocker: Vector3, shooter: Vector3, jumpAgeSec: number): boolean {
  return jumpAgeSec <= BLOCK_WINDOW_SEC && Vector3.Distance(blocker, shooter) <= BLOCK_RANGE;
}
