/**
 * lib/board/board-physics.ts
 *
 * Pure-TS arcade board physics shared by skate / snow / surf.
 * No three.js imports — deterministic, unit-testable, zero allocation in the
 * hot path (update() writes into caller-owned out-objects).
 *
 * Harvest notes (see REFINEMENT.md):
 *  - JumpCore.js        -> gravity integration + one-frame apex/land event
 *                          flags, extended with terrain landing, ollie charge
 *                          and lip-launch detection.
 *  - LocomotionCore.js  -> moveTowards() accel/friction shape, re-expressed as
 *                          a heading+scalar-speed carve model (board, not strafe).
 *  - DodgeCore.js       -> cooldown/i-frame pattern reused for wipeout->recover.
 *
 * TERRAIN IS ANALYTIC. The visual map GLBs (venice-skatepark, mountain-slope,
 * surf-break) are rendered by the app's map-loader; the collider here is a
 * closed-form heightfield tuned to read like those maps. Swapping to a raycast
 * collider against the real GLB is a NEXT item (needs live map inspection).
 */

import type { BoardModeId } from './trick-table';
import { skateHeight, zoneAt, pumpImpulse } from './zones';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BoardInputFrame {
  steer: number;   // -1..1 (left/right)
  tuck: boolean;   // hold: snow/surf tuck, skate push
  crouch: boolean; // hold to load ollie, release to pop
  spin: number;    // -1..1 air rotation input
  boost: boolean;  // adrenaline dump (gated by BoostMeter)
  grind: boolean;  // held: try to lock onto a rail on descent
}

export type LandingQuality = 'clean' | 'sketchy' | 'bail';

export interface BoardFrameEvents {
  launched: boolean;         // left the ground this frame (lip or ollie)
  ollie: boolean;            // launch was a player pop
  landed: boolean;           // touched down this frame
  landingQuality: LandingQuality;
  landingSpinDeg: number;    // total spin at touchdown
  landingAirTimeMs: number;
  landingLateSpin: boolean;  // SSX rule: still cranking rotation at touchdown
  bailReason: '' | 'over-rotation' | 'trick-incomplete' | 'rail-slip' | 'late-spin';
}

export interface TerrainSample {
  h: number;  // height at (x,z)
  gx: number; // dh/dx
  gz: number; // dh/dz
}

export interface BoardPhysicsConfig {
  gravity: number;
  maxSpeed: number;
  baseAccel: number;   // ambient forward push (wave energy / slope culture)
  tuckAccel: number;   // extra accel while tucking / pushing
  drag: number;        // v^2 drag coefficient
  turnRate: number;    // rad/s at full steer, full speed-factor
  olliePopBase: number;
  olliePopCharge: number; // extra pop at full crouch charge
  spinRate: number;       // deg/s of air rotation at full input
  boundsX: number;        // soft clamp half-width
  boundsZmin: number;
  boundsZmax: number;
}

const CONFIGS: Record<BoardModeId, BoardPhysicsConfig> = {
  skate: {
    gravity: 22, maxSpeed: 13, baseAccel: 1.2, tuckAccel: 5.5, drag: 0.012,
    turnRate: 2.6, olliePopBase: 4.6, olliePopCharge: 3.6, spinRate: 400,
    boundsX: 15.5, boundsZmin: -19.5, boundsZmax: 19.5,
  },
  snow: {
    gravity: 22, maxSpeed: 24, baseAccel: 0.4, tuckAccel: 4.0, drag: 0.006,
    turnRate: 2.1, olliePopBase: 4.0, olliePopCharge: 3.0, spinRate: 380,
    boundsX: 24, boundsZmin: -100000, boundsZmax: 40,
  },
  surf: {
    gravity: 20, maxSpeed: 17, baseAccel: 2.4, tuckAccel: 3.2, drag: 0.010,
    turnRate: 2.4, olliePopBase: 4.4, olliePopCharge: 2.8, spinRate: 360,
    boundsX: 15, boundsZmin: -100000, boundsZmax: 30,
  },
};

// ---------------------------------------------------------------------------
// Analytic terrain per discipline
// ---------------------------------------------------------------------------

// (Skate quarterpipe/zone terrain now lives in the PURE zones core:
//  lib/board/zones.ts — skateHeight(). Snow/surf remain analytic below.)

function heightAt(mode: BoardModeId, x: number, z: number, t: number): number {
  switch (mode) {
    case 'skate': {
      // Venice-skatepark: 3 readable zones (deep bowl / flow street / vert
      // wall) + perimeter quarterpipes. Layout + heights live in the PURE
      // zones core so the physics and the headless tests agree exactly.
      return skateHeight(x, z);
    }
    case 'snow': {
      // Mountain-slope: constant grade downhill toward -z, moguls, kicker rows.
      const grade = 0.34 * z;
      const mogul =
        0.32 * Math.sin(x * 0.42) * Math.sin(z * 0.23) *
        Math.max(0, 1 - Math.abs(x) / 22);
      const kz = ((z % 70) + 70) % 70; // kicker every 70m down the fall line
      const kicker =
        1.7 * Math.exp(-((kz - 35) * (kz - 35)) / 16) * Math.exp(-(x * x) / 26);
      return grade + mogul + kicker;
    }
    case 'surf': {
      // Surf-break: wave face rising toward +x, breathing crest + rolling chop.
      const crestX = 7 + Math.sin(t * 0.35) * 1.2;
      const face = 3.1 * 0.5 * (1 + Math.tanh((x - crestX + 4) / 3.2));
      const chop = 0.16 * Math.sin(z * 0.35 + t * 2.1) * Math.sin(x * 0.5);
      const swell = 0.25 * Math.sin(z * 0.06 + t * 0.8);
      return face + chop + swell;
    }
  }
}

const TERRAIN_EPS = 0.25;

/** Finite-difference terrain sample written into a caller-owned object. */
export function sampleTerrain(
  mode: BoardModeId,
  x: number,
  z: number,
  t: number,
  out: TerrainSample
): TerrainSample {
  const h = heightAt(mode, x, z, t);
  out.h = h;
  out.gx = (heightAt(mode, x + TERRAIN_EPS, z, t) - h) / TERRAIN_EPS;
  out.gz = (heightAt(mode, x, z + TERRAIN_EPS, t) - h) / TERRAIN_EPS;
  return out;
}

// ---------------------------------------------------------------------------
// BoardPhysics
// ---------------------------------------------------------------------------

const SPIN_CLEAN_DEG = 30;   // touchdown misalignment tolerated silently
const SPIN_SKETCHY_DEG = 62; // beyond this -> bail (over-rotation)
const LATE_SPIN_INPUT = 0.5; // SSX: holding rotation into touchdown bails
const LIP_LAUNCH_DROP = 4.0; // m/s of lost surface-follow rate => airborne
const LIP_LAUNCH_MIN_VY = 1.6;

export class BoardPhysics {
  readonly mode: BoardModeId;
  readonly cfg: BoardPhysicsConfig;

  // pose
  x = 0; y = 0; z = 0;
  heading = 0;            // 0 faces -z; forward = (sin h, 0, -cos h)
  speed = 6;              // scalar ground speed along heading
  vy = 0;
  airborne = false;
  spinDeg = 0;            // accumulated air rotation this air session
  crouchCharge = 0;       // 0..1 loaded ollie
  airTime = 0;

  // wipeout (DodgeCore-style timers)
  wipeoutRemaining = 0;
  recoverRemaining = 0;

  // derived, for VFX/audio (read-only from outside)
  carveIntensity = 0;     // |steer| * normalized speed, grounded only
  surfaceVy = 0;          // vertical rate implied by the surface being ridden

  private _prevCrouch = false;
  private _prevSurfaceVy = 0;
  private _terrain: TerrainSample = { h: 0, gx: 0, gz: 0 };

  constructor(mode: BoardModeId) {
    this.mode = mode;
    this.cfg = CONFIGS[mode];
    if (mode === 'surf') { this.x = 2; this.speed = 8; }
    if (mode === 'snow') { this.speed = 9; }
    this.y = heightAt(mode, this.x, this.z, 0);
  }

  get isWipedOut(): boolean { return this.wipeoutRemaining > 0; }
  get isRecovering(): boolean { return this.recoverRemaining > 0; }
  get speedNorm(): number { return Math.min(1, this.speed / this.cfg.maxSpeed); }

  forwardX(): number { return Math.sin(this.heading); }
  forwardZ(): number { return -Math.cos(this.heading); }

  /** External bail (grind slip, incomplete trick). Puts us in wipeout. */
  bail(): void {
    this.wipeoutRemaining = 1.15;
    this.recoverRemaining = 0;
    this.airborne = false;
    this.spinDeg = 0;
    this.vy = 0;
    this.speed *= 0.28;
    this.crouchCharge = 0;
  }

  /** Grind support: scene snaps pose while a rail lock is active. */
  snapTo(x: number, y: number, z: number, heading: number): void {
    this.x = x; this.y = y; this.z = z;
    this.heading = heading;
    this.airborne = false;
    this.vy = 0;
    this.spinDeg = 0;
    this.airTime = 0;
  }

  /** Pop off a rail / lip into the air. */
  launch(vy: number): void {
    this.airborne = true;
    this.vy = vy;
    this.airTime = 0;
    this.spinDeg = 0;
  }

  /**
   * Advance one frame. `events` is caller-owned and fully rewritten.
   * `boostMult` comes from BoostMeter.speedMultiplier().
   */
  update(
    input: BoardInputFrame,
    dt: number,
    t: number,
    boostMult: number,
    events: BoardFrameEvents
  ): void {
    events.launched = false;
    events.ollie = false;
    events.landed = false;
    events.landingQuality = 'clean';
    events.landingSpinDeg = 0;
    events.landingAirTimeMs = 0;
    events.landingLateSpin = false;
    events.bailReason = '';

    const cfg = this.cfg;
    dt = Math.min(dt, 1 / 30);

    // ── Wipeout / recover flow ───────────────────────────────────────────
    if (this.wipeoutRemaining > 0) {
      this.wipeoutRemaining = Math.max(0, this.wipeoutRemaining - dt);
      this.speed = Math.max(0, this.speed - this.speed * 2.2 * dt);
      sampleTerrain(this.mode, this.x, this.z, t, this._terrain);
      this.x += this.forwardX() * this.speed * dt;
      this.z += this.forwardZ() * this.speed * dt;
      this.y = this._terrain.h;
      this.carveIntensity = 0;
      if (this.wipeoutRemaining === 0) this.recoverRemaining = 0.45;
      return;
    }
    if (this.recoverRemaining > 0) {
      this.recoverRemaining = Math.max(0, this.recoverRemaining - dt);
      this.speed = Math.min(cfg.maxSpeed, this.speed + 3.5 * dt);
    }

    const fx = this.forwardX();
    const fz = this.forwardZ();

    if (!this.airborne) {
      // ── Grounded: carve ────────────────────────────────────────────────
      sampleTerrain(this.mode, this.x, this.z, t, this._terrain);

      const speedFactor = Math.max(0.35, Math.min(1, this.speed / 6));
      this.heading += input.steer * cfg.turnRate * speedFactor * dt;

      // slope pull along heading (gradient points uphill)
      const slopeAccel = -cfg.gravity * 0.62 * (this._terrain.gx * fx + this._terrain.gz * fz);
      const pushAccel = cfg.baseAccel + (input.tuck ? cfg.tuckAccel : 0);
      const dragAccel = cfg.drag * this.speed * this.speed;
      const targetMax = cfg.maxSpeed * boostMult;

      this.speed += (slopeAccel + pushAccel - dragAccel) * dt;
      if (boostMult > 1) this.speed += (targetMax - this.speed) * 1.4 * dt;
      this.speed = Math.max(0, Math.min(targetMax, this.speed));

      // ── Skate: natural carve/pump momentum ─────────────────────────────
      // Pumping a transition (bowl wall / vert wall) while carving returns
      // real speed — the readable way to build velocity across the 3 zones
      // instead of a flat constant push. Gated to skate so snow/surf are
      // untouched. (see lib/board/zones.ts)
      if (this.mode === 'skate') {
        const slopeMag = Math.sqrt(
          this._terrain.gx * this._terrain.gx + this._terrain.gz * this._terrain.gz,
        );
        const carveAlign = Math.abs(input.steer) * this.speedNorm;
        const pump = pumpImpulse(zoneAt(this.x, this.z), slopeMag, carveAlign, dt);
        if (pump > 0) this.speed = Math.min(targetMax, this.speed + pump);
      }

      // ollie charge
      if (input.crouch) {
        this.crouchCharge = Math.min(1, this.crouchCharge + 2.4 * dt);
      } else if (this._prevCrouch) {
        // pop!
        const pop = cfg.olliePopBase + cfg.olliePopCharge * this.crouchCharge + this.speed * 0.1;
        this.crouchCharge = 0;
        this.launch(pop);
        events.launched = true;
        events.ollie = true;
      }

      if (!this.airborne) {
        // integrate along surface
        const prevH = this._terrain.h;
        this.x += fx * this.speed * dt;
        this.z += fz * this.speed * dt;
        this._clampBounds();
        sampleTerrain(this.mode, this.x, this.z, t, this._terrain);
        this.surfaceVy = dt > 0 ? (this._terrain.h - prevH) / dt : 0;

        // lip launch: surface was carrying us up hard, then fell away
        if (
          this._prevSurfaceVy > LIP_LAUNCH_MIN_VY &&
          this._prevSurfaceVy - this.surfaceVy > LIP_LAUNCH_DROP
        ) {
          this.launch(this._prevSurfaceVy * 0.92);
          events.launched = true;
        } else {
          this.y = this._terrain.h;
        }
        this._prevSurfaceVy = this.surfaceVy;
        this.carveIntensity = Math.abs(input.steer) * this.speedNorm;
      }
    }

    if (this.airborne) {
      // ── Airborne: gravity + spin ───────────────────────────────────────
      this.airTime += dt;
      this.vy -= cfg.gravity * dt;
      this.y += this.vy * dt;
      this.x += fx * this.speed * dt;
      this.z += fz * this.speed * dt;
      this._clampBounds();
      this.speed = Math.max(0, this.speed - cfg.drag * this.speed * this.speed * 0.5 * dt);
      this.spinDeg += input.spin * cfg.spinRate * (boostMult > 1.5 ? 1.25 : 1) * dt;
      this.carveIntensity = 0;

      sampleTerrain(this.mode, this.x, this.z, t, this._terrain);
      if (this.y <= this._terrain.h && this.vy < 0) {
        // ── touchdown ────────────────────────────────────────────────────
        this.y = this._terrain.h;
        this.airborne = false;
        this._prevSurfaceVy = 0;

        const r = ((this.spinDeg % 180) + 180) % 180;
        const misalign = Math.min(r, 180 - r);
        const lateSpin = Math.abs(input.spin) >= LATE_SPIN_INPUT && misalign > SPIN_CLEAN_DEG * 0.6;

        events.landed = true;
        events.landingSpinDeg = this.spinDeg;
        events.landingAirTimeMs = this.airTime * 1000;
        events.landingLateSpin = lateSpin;

        if (misalign > SPIN_SKETCHY_DEG) {
          events.landingQuality = 'bail';
          events.bailReason = 'over-rotation';
          this.bail();
        } else if (lateSpin) {
          events.landingQuality = 'bail';
          events.bailReason = 'late-spin';
          this.bail();
        } else {
          // fold spin into heading, snapped to the nearest ridden direction
          this.heading += (Math.round(this.spinDeg / 180) * 180) * (Math.PI / 180);
          if (misalign > SPIN_CLEAN_DEG) {
            events.landingQuality = 'sketchy';
            this.speed *= 0.72;
          } else {
            events.landingQuality = 'clean';
          }
          this.spinDeg = 0;
          this.vy = 0;
        }
      }
    }

    this._prevCrouch = input.crouch;
  }

  private _clampBounds(): void {
    const cfg = this.cfg;
    if (this.x > cfg.boundsX) this.x = cfg.boundsX;
    else if (this.x < -cfg.boundsX) this.x = -cfg.boundsX;
    if (this.z > cfg.boundsZmax) this.z = cfg.boundsZmax;
    else if (this.z < cfg.boundsZmin) this.z = cfg.boundsZmin;
  }
}
