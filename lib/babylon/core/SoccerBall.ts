// SoccerBall — Mode 5 Phase 2: the ball as a real physical object.
//
// A football is NOT a basketball arc: it rolls, skids, checks up on grass,
// and BENDS (Magnus). This module is the single physical truth every
// pass/shot/touch reads — no scripted trajectories layered on top.
//
//   MASS/DRAG — aerodynamic drag (quadratic) + rolling friction on grass.
//   MAGNUS   — sidespin curves the flight (bend it); backspin holds the
//              ball up (float), topspin drives it down (dip).
//   BOUNCE   — restitution + tangential skid; a topped ball skids forward,
//              a chopped ball checks.
//
// Analytic integration (not Havok) on purpose: swept-sphere collision +
// deterministic, testable trajectories are the gameplay contract; Havok
// owns player bodies (ContactSystem), the ball needs exact reads.

import { Vector3 } from '@babylonjs/core';

export interface BallTuning {
  radius: number;          // m
  mass: number;            // kg (FIFA ball ~0.43)
  dragK: number;           // quadratic drag coefficient
  magnusK: number;         // spin lift coefficient
  grassFriction: number;   // rolling decel m/s²
  restitution: number;     // bounce energy kept
  skidFactor: number;      // tangential retention on bounce
}

export const GRASS: BallTuning = {
  radius: 0.11, mass: 0.43, dragK: 0.012, magnusK: 0.0045,
  grassFriction: 2.6, restitution: 0.62, skidFactor: 0.82,
};

export class SoccerBall {
  pos: Vector3;
  vel = Vector3.Zero();
  spin = Vector3.Zero();     // rad/s, world axes (y = curve, z = dip/hold)
  active = false;
  rolling = false;
  private prev: Vector3;

  constructor(public mesh: { position: Vector3 }, private tune: BallTuning = GRASS) {
    this.pos = mesh.position.clone();
    this.prev = this.pos.clone();
  }

  launch(from: Vector3, velocity: Vector3, spin: Vector3 = Vector3.Zero()): void {
    this.pos.copyFrom(from); this.prev.copyFrom(from);
    this.vel.copyFrom(velocity);
    this.spin.copyFrom(spin);
    this.active = true;
    this.rolling = false;
  }

  get speed(): number { return this.vel.length(); }

  step(dt: number, groundY = 0): void {
    if (!this.active) return;
    this.prev.copyFrom(this.pos);
    const t = this.tune;

    if (this.rolling) {
      // pure rolling: friction + (optionally) curve on the ground
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.01) {
        const dec = Math.min(sp, t.grassFriction * dt);
        this.vel.x -= (this.vel.x / sp) * dec;
        this.vel.z -= (this.vel.z / sp) * dec;
        // ground curve from y-spin (a ball with side-spin bends its roll)
        const curve = this.spin.y * t.magnusK * sp * 60;
        const px = -this.vel.z / sp, pz = this.vel.x / sp;
        this.vel.x += px * curve * dt; this.vel.z += pz * curve * dt;
      } else {
        this.active = false;
      }
      this.pos.addInPlace(this.vel.scale(dt));
      this.pos.y = groundY + t.radius;
    } else {
      // flight: gravity + quadratic drag + Magnus
      const sp = this.vel.length();
      if (sp > 1e-6) {
        const dragA = this.vel.scale(-t.dragK * sp);           // F = -k·v·|v|
        const magnus = Vector3.Cross(this.spin, this.vel).scale(t.magnusK);
        this.vel.addInPlace(dragA.scale(dt));
        this.vel.addInPlace(magnus.scale(dt));
      }
      this.vel.y += -9.81 * dt;
      this.pos.addInPlace(this.vel.scale(dt));

      if (this.pos.y - t.radius <= groundY && this.vel.y < 0) {
        this.pos.y = groundY + t.radius;
        this.vel.y = -this.vel.y * t.restitution;
        // tangential skid: topspin grips forward, backspin checks;
        // and the spin BITES the bounce — topspin jumps up, slice stays low
        const skid = t.skidFactor + this.spin.x * 0.03;
        this.vel.x *= skid; this.vel.z *= skid;
        this.vel.y += -this.spin.x * 0.05;      // spin -> bounce bite
        // convert forward spin to roll on contact
        if (Math.abs(this.vel.y) < 1.2) {
          this.rolling = true;
          this.vel.y = 0;
        }
      }
    }
    // spin bleeds (air + grass)
    this.spin.scaleInPlace(1 - 0.35 * dt);
    this.mesh.position.copyFrom(this.pos);
  }

  /** Sweep-test against a sphere collider (keeper hands, defender leg, post). */
  sweptHit(center: Vector3, colliderRadius: number): Vector3 | null {
    const R = this.tune.radius + colliderRadius;
    const d = this.pos.subtract(this.prev);
    const f = this.prev.subtract(center);
    const a = Vector3.Dot(d, d);
    if (a < 1e-9) return f.length() <= R ? this.prev.clone() : null;
    const b = 2 * Vector3.Dot(f, d);
    const c = Vector3.Dot(f, f) - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const tt = (-b - Math.sqrt(disc)) / (2 * a);
    if (tt < 0 || tt > 1) return null;
    return this.prev.add(d.scale(tt));
  }

  /** Deflect off a surface normal with energy retention (parry/post/block). */
  deflect(normal: Vector3, keep = 0.7): void {
    const n = normal.normalizeToNew();
    const dot = Vector3.Dot(this.vel, n);
    if (dot < 0) {
      this.vel.subtractInPlace(n.scale(2 * dot)).scaleInPlace(keep);
      this.rolling = false;
    }
  }

  stop(): void { this.active = false; this.vel.setAll(0); this.spin.setAll(0); this.rolling = false; }
}
