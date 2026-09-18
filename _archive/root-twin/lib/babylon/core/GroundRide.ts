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
}

export class Rider {
  public vel = Vector3.Zero();
  public grounded = true;
  public grinding: GrindLine | null = null;
  private grindT = 0;
  private down = new Vector3(0, -1, 0);
  /** M42: frames since the raycast last found ground — drives the hard clamp */
  private missedRaycasts = 0;

  constructor(
    private scene: Scene,
    public root: TransformNode,
    private groundMeshes: AbstractMesh[],
    private cfg = {
      gravity: -14, carveAccel: 9, maxSpeed: 16, drag: 0.35, snapHeight: 0.05,
      // M42: absolute floor — the rider is NEVER allowed below this, raycast or
      // not; and how many consecutive missed raycasts trigger the hard clamp.
      hardFloorY: 0,        //TUNE(elijah): safety floor plane
      missThreshold: 6,     //TUNE(elijah): missed frames before clamp
    },
  ) {
    if (!groundMeshes.length) {
      console.error('[FEL-SPAWN] Rider: constructed with zero ground meshes — hard floor clamp is the only thing that will hold the rider up');
    }
  }

  /** steer: -1..1 · pump: 0..1 (R2) · dt seconds */
  update(dt: number, steer: number, pump: number): void {
    if (this.grinding) { this.updateGrind(dt); return; }

    // forward accel with pump, lateral carve with steer
    const yaw = this.root.rotation.y;
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.vel.addInPlace(fwd.scale((this.cfg.carveAccel * (0.55 + 0.45 * pump)) * dt));
    this.root.rotation.y += steer * 1.9 * dt * (this.grounded ? 1 : 0.5);
    this.root.rotation.z = -steer * 0.28;            // carve lean reads the turn

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
    const ray = new Ray(this.root.position.add(new Vector3(0, 1.5, 0)), this.down, 6);
    const hit = this.scene.pickWithRay(ray, (m) => this.groundMeshes.includes(m as AbstractMesh));
    if (hit?.hit && hit.pickedPoint) {
      this.missedRaycasts = 0;
      const groundY = hit.pickedPoint.y;
      if (this.root.position.y <= groundY + this.cfg.snapHeight) {
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

  /** Try to catch a grind line (rail or lift cable). Call when airborne. */
  tryGrind(lines: GrindLine[]): GrindLine | null {
    if (this.grounded || this.grinding) return null;
    for (const line of lines) {
      if (line.minApproachHeight && this.root.position.y < line.minApproachHeight) continue;
      const t = closestT(line.a, line.b, this.root.position);
      const point = Vector3.Lerp(line.a, line.b, t);
      if (Vector3.Distance(point, this.root.position) < 1.1) {
        this.grinding = line;
        this.grindT = t;
        this.vel.y = 0;
        return line;
      }
    }
    return null;
  }

  private updateGrind(dt: number): void {
    const line = this.grinding!;
    const len = Vector3.Distance(line.a, line.b);
    const dir = Math.hypot(this.vel.x, this.vel.z) >= 0.5 ? Math.sign(
      Vector3.Dot(line.b.subtract(line.a), this.vel)) || 1 : 1;
    this.grindT += (dir * Math.max(6, Math.hypot(this.vel.x, this.vel.z)) * dt) / len;
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
