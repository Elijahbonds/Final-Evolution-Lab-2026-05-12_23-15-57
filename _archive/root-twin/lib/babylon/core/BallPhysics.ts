// BallPhysics — shared projectile: gravity, bounce, and SWEPT-SPHERE collision
// (the tennis through-the-racket fix: test the segment prevPos→pos, never the
// single frame position).

import { Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';

const GRAVITY = -9.81;

export class BallSim {
  public pos: Vector3;
  public vel = Vector3.Zero();
  public radius: number;
  public active = false;
  private prev: Vector3;

  constructor(public mesh: AbstractMesh, radius = 0.12) {
    this.pos = mesh.position.clone();
    this.prev = this.pos.clone();
    this.radius = radius;
  }

  launch(from: Vector3, velocity: Vector3): void {
    this.pos.copyFrom(from); this.prev.copyFrom(from);
    this.vel.copyFrom(velocity);
    this.active = true;
  }

  /** Integrate one step; bounces on ground plane y=groundY. */
  step(dt: number, groundY = 0, restitution = 0.62): void {
    if (!this.active) return;
    this.prev.copyFrom(this.pos);
    this.vel.y += GRAVITY * dt;
    this.pos.addInPlace(this.vel.scale(dt));
    if (this.pos.y - this.radius < groundY && this.vel.y < 0) {
      this.pos.y = groundY + this.radius;
      this.vel.y = -this.vel.y * restitution;
      this.vel.x *= 0.85; this.vel.z *= 0.85;
      if (Math.abs(this.vel.y) < 0.4) this.vel.y = 0;
    }
    this.mesh.position.copyFrom(this.pos);
  }

  /**
   * Swept-sphere vs sphere collider (racket head, keeper hands, rim ball-space).
   * Tests the WHOLE travel segment this frame — a fast ball cannot tunnel.
   * Returns the hit point or null.
   */
  sweptHit(colliderCenter: Vector3, colliderRadius: number): Vector3 | null {
    const R = this.radius + colliderRadius;
    const d = this.pos.subtract(this.prev);
    const f = this.prev.subtract(colliderCenter);
    const a = Vector3.Dot(d, d);
    if (a < 1e-9) return f.length() <= R ? this.prev.clone() : null;
    const b = 2 * Vector3.Dot(f, d);
    const c = Vector3.Dot(f, f) - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
    return this.prev.add(d.scale(t));
  }

  /** Reflect off a normal with speed multiplier (racket rebound, rim clank). */
  deflect(normal: Vector3, speedMul = 1): void {
    const n = normal.normalizeToNew();
    const dot = Vector3.Dot(this.vel, n);
    this.vel.subtractInPlace(n.scale(2 * dot)).scaleInPlace(speedMul);
  }

  stop(): void { this.active = false; this.vel.setAll(0); }
}

/** Aim helper: initial velocity to arc from `from` to `to` with apex height. */
export function arcVelocity(from: Vector3, to: Vector3, apexAbove = 1.5): Vector3 {
  const peak = Math.max(from.y, to.y) + apexAbove;
  const upTime = Math.sqrt((2 * (peak - from.y)) / -GRAVITY);
  const downTime = Math.sqrt((2 * (peak - to.y)) / -GRAVITY);
  const total = upTime + downTime;
  return new Vector3(
    (to.x - from.x) / total,
    -GRAVITY * upTime,
    (to.z - from.z) / total,
  );
}
