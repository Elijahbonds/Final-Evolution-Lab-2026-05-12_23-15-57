// GroundRide — board-sport rider: ground snap (never float, never sink), carve
// physics, air detection, grind-line attachment (rails AND the overhead lift
// cable). Kinematic and cheap.

import { Ray, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core';

export interface GrindLine {
  a: Vector3; b: Vector3;
  /** big-air only lines (the ski-lift cable) need this much height to catch */
  minApproachHeight?: number;
  bonus: number;
  /** Goal credit this rail pays when a grind locks onto it (VENICE-SKATE-THPS). The lock handler reads it off the line
   *  the Rider actually caught — identifying the rail by its INDEX in the world's list cannot work for a rail that
   *  moves, because a moving rail hands out a fresh line object every frame. */
  gapId?: string;
}

/** Per-world overrides for the Rider (pitched pistes need a longer ground ray and a floor below the run). */
export interface RiderCfgOverrides {
  /** Absolute safety floor — the rider is never allowed below this. A pitched piste sets it under its lowest point. */
  hardFloorY?: number;
  /** Ground raycast length from 1.5 m above the root (m). A piste that drops 45 m needs more than the flat 6. */
  rayLength?: number;
  /** While grounded, a surface this far below the root still counts as ridden (glued): descending a pitched slope the
   *  ground falls away faster than gravity catches up within a frame, and without this the rider flickers airborne. */
  stickDown?: number;
  /** Forward accel the Rider adds on its own every frame (m/s², × 0.55–1 with pump). Skate's momentum model owns the
   *  velocity outright and passes 0 — the default 9 was a frame-rate-dependent creep under it (SKATE-MOVE). */
  carveAccel?: number;
  /** Horizontal speed ceiling (m/s, default 16). Surf lifts it with the shared board pace (WALLS + SPEED, 2026-09-15). */
  maxSpeed?: number;
  /** Top speed ALONG a rail (m/s). A grind scrubs — riding a 4 m rail at 8 m/s is over in 0.5 s and reads as a bump,
   *  not a trick (VENICE-SKATE-THPS). Omit for the historic behaviour (the run's own speed, floored at 6). */
  grindSpeed?: number;
}

export class Rider {
  public vel = Vector3.Zero();
  public grounded = true;
  public grinding: GrindLine | null = null;
  private grindT = 0;
  private down = new Vector3(0, -1, 0);
  /** M42: frames since the raycast last found ground — drives the hard clamp */
  private missedRaycasts = 0;

  private cfg: { gravity: number; carveAccel: number; maxSpeed: number; drag: number; snapHeight: number; hardFloorY: number; missThreshold: number; rayLength: number; stickDown: number; grindSpeed: number };

  constructor(
    private scene: Scene,
    public root: TransformNode,
    private groundMeshes: AbstractMesh[],
    overrides: RiderCfgOverrides = {},
  ) {
    this.cfg = {
      gravity: -14, carveAccel: 9, maxSpeed: 16, drag: 0.35, snapHeight: 0.05,
      // M42: absolute floor — the rider is NEVER allowed below this, raycast or
      // not; and how many consecutive missed raycasts trigger the hard clamp.
      hardFloorY: 0,        //TUNE(elijah): safety floor plane
      missThreshold: 6,     //TUNE(elijah): missed frames before clamp
      grindSpeed: 0,        // 0 = the historic rule below (max(6, run speed))
      rayLength: 6,         // flat parks; the snow piste passes ~80 (it drops ~56 m over the run)
      stickDown: 0,         // flat parks: no glue; the snow piste passes 0.6 (see RiderCfgOverrides.stickDown)
      ...overrides,
    };
    if (!groundMeshes.length) {
      console.error('[FEL-SPAWN] Rider: constructed with zero ground meshes — hard floor clamp is the only thing that will hold the rider up');
    }
  }

  /** Top speed this rider is capped at, m/s. Read-only: the SPEED FOV kick normalises against the mode's own
   *  ceiling (a skater flat out and a kart flat out must get the same lens), and `cfg` is private. */
  get topSpeed(): number { return this.cfg.maxSpeed; }

  /** steer: -1..1 · pump: 0..1 (R2) · dt seconds */
  update(dt: number, steer: number, pump: number): void {
    if (this.grinding) { this.updateGrind(dt); return; }

    // forward accel with pump, lateral carve with steer
    const yaw = this.root.rotation.y;
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.vel.addInPlace(fwd.scale((this.cfg.carveAccel * (0.55 + 0.45 * pump)) * dt));
    this.root.rotation.y += steer * 1.9 * dt * (this.grounded ? 1 : 0.5);
    // carve lean reads the turn — eased (~0.1 s), not set: written straight from the stick it rolled the whole rider 16° in
    // one frame on every stick edge (measured 0.3–0.45 m hand jumps at each press / release; ANIM-READABILITY 2026-09-07)
    this.root.rotation.z += (-steer * 0.28 - this.root.rotation.z) * Math.min(1, 12 * dt);

    // drag + clamp
    this.vel.scaleInPlace(1 - this.cfg.drag * dt);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > this.cfg.maxSpeed) {
      const s = this.cfg.maxSpeed / hSpeed;
      this.vel.x *= s; this.vel.z *= s;
    }

    // gravity + ground snap via raycast (the anti-float fix)
    this.vel.y += this.cfg.gravity * dt;
    this.root.position.addInPlace(this.vel.scale(dt));
    const ray = new Ray(this.root.position.add(new Vector3(0, 1.5, 0)), this.down, this.cfg.rayLength);
    const hit = this.scene.pickWithRay(ray, (m) => this.groundMeshes.includes(m as AbstractMesh));
    if (hit?.hit && hit.pickedPoint) {
      this.missedRaycasts = 0;
      const groundY = hit.pickedPoint.y;
      // glued: a grounded rider descending a pitched piste stays on it (the surface falls away faster than one frame of
      // gravity); a jump sets grounded=false first, so the pop is never eaten
      const glued = this.grounded && this.cfg.stickDown > 0 && this.root.position.y - groundY <= this.cfg.stickDown;
      if (this.root.position.y <= groundY + this.cfg.snapHeight || glued) {
        if (!this.grounded && this.vel.y < -3) {
          // landing compression is played by the mode: animator.play('jump_land')
        }
        this.root.position.y = groundY;
        this.vel.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    } else {
      this.missedRaycasts++;
      this.grounded = false;
    }

    // ── M42 HARD FLOOR CLAMP (fixes E18: skater falls through the floor
    // forever). Once the raycast has missed for several consecutive frames, or
    // the rider is ever below the absolute floor, stop trusting the raycast and
    // clamp directly. Falling through the world forever becomes impossible.
    const belowHardFloor = this.root.position.y < this.cfg.hardFloorY - 0.5;
    if (this.missedRaycasts >= this.cfg.missThreshold || belowHardFloor) {
      console.warn(`[FEL-SPAWN] Rider: ${this.missedRaycasts} missed raycasts (y=${this.root.position.y.toFixed(2)}) — hard-clamping to floor`);
      this.root.position.y = this.cfg.hardFloorY;
      this.vel.y = 0;
      this.grounded = true;
      this.missedRaycasts = 0;
    }
  }

  jump(power: number): void {
    if (!this.grounded) return;
    this.vel.y = 5 + power * 5.5;
    this.grounded = false;
  }

  /**
   * Try to catch a grind line (rail or lift cable). Call when airborne.
   *
   * `radius` (VENICE-SKATE-THPS, 2026-09-09) is the catch sphere in metres, default the historic 1.1. That default is
   * measured from `root.position`, which on a board rider sits at the FEET — so a rail whose bar is 0.5 m up already
   * spends half the budget on height, leaving well under a metre of horizontal window to thread at 8 m/s. Skate's own
   * eye never once locked a rail. The mode passes a real magnet radius and an alignment test of its own; nothing else
   * that calls this changes.
   */
  tryGrind(lines: GrindLine[], radius = 1.1): GrindLine | null {
    if (this.grounded || this.grinding) return null;
    let best: GrindLine | null = null, bestD = Infinity, bestT = 0;
    for (const line of lines) {
      if (line.minApproachHeight && this.root.position.y < line.minApproachHeight) continue;
      const t = closestT(line.a, line.b, this.root.position);
      const point = Vector3.Lerp(line.a, line.b, t);
      const d = Vector3.Distance(point, this.root.position);
      if (d < radius && d < bestD) { best = line; bestD = d; bestT = t; }
    }
    if (!best) return null;
    // the NEAREST rail wins, not the first one in the list: the plaza's five lines cross, and taking list order handed
    // the lock to a rail the rider was not on
    this.grinding = best;
    this.grindT = bestT;
    this.vel.y = 0;
    return best;
  }

  private updateGrind(dt: number): void {
    const line = this.grinding!;
    const len = Vector3.Distance(line.a, line.b);
    const dir = Math.hypot(this.vel.x, this.vel.z) >= 0.5 ? Math.sign(
      Vector3.Dot(line.b.subtract(line.a), this.vel)) || 1 : 1;
    const run = Math.hypot(this.vel.x, this.vel.z);
    const alongSpeed = this.cfg.grindSpeed > 0 ? Math.max(3.5, Math.min(this.cfg.grindSpeed, run)) : Math.max(6, run);
    this.grindT += (dir * alongSpeed * dt) / len;
    if (this.grindT <= 0 || this.grindT >= 1) { this.dismount(); return; }
    const p = Vector3.Lerp(line.a, line.b, this.grindT);
    this.root.position.copyFrom(p);
    const along = line.b.subtract(line.a).normalize();
    this.root.rotation.y = Math.atan2(along.x, along.z);
    this.root.rotation.z = Math.sin(performance.now() / 180) * 0.06;  // balance wobble
  }

  dismount(): void {
    if (!this.grinding) return;
    this.grinding = null;
    this.vel.y = 2.5;
    this.grounded = false;
  }
}

function closestT(a: Vector3, b: Vector3, p: Vector3): number {
  const ab = b.subtract(a);
  const t = Vector3.Dot(p.subtract(a), ab) / Math.max(ab.lengthSquared(), 1e-9);
  return Math.min(1, Math.max(0, t));
}
