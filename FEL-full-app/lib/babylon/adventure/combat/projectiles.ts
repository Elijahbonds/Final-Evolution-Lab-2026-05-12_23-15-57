/**
 * Projectiles: a caster monster's bolt, an element bolt spell. A fixed pool (no allocation per shot or per tick), each
 * shot a straight line at its speed, hitting the first hostile body it passes (the HordeDynamics `pathHits` test over
 * the step's segment, so a fast bolt cannot tunnel through a body between two ticks).
 *
 * Projectiles live in the world, so slow-time slows them: each one runs at its owner's world (the host's
 * `timeScaleOf(owner)`), which is what makes a caster's bolt dodgeable inside slow-time.
 */

import { pathHits, type Body2 } from '@/lib/babylon/core/HordeDynamics';
import type { ActorId, AdventureActor, AdventureStepContext, TeamId } from '../contracts';
import { applyHit, makeHitSpec, type HitSpec } from './damage';

export interface Projectile {
  active: boolean;
  ownerId: ActorId;
  team: TeamId;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  lifeSec: number;
  radius: number;
  readonly spec: HitSpec;
}

/** Fired shots the view draws (it reads the pool; nothing here is Babylon). */
export class ProjectilePool {
  readonly shots: Projectile[];
  private readonly bodies: Body2[] = [];
  private readonly bodyActors: AdventureActor[] = [];
  private readonly mid = { x: 0, y: 0, z: 0 };

  constructor(size = 48) {
    this.shots = Array.from({ length: size }, () => ({
      active: false, ownerId: '', team: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, lifeSec: 0, radius: 0.3, spec: makeHitSpec(),
    }));
  }

  /** A free slot, or null when every one is in the air (the shot is dropped: the cap is the budget). */
  fire(owner: AdventureActor, from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number },
    speed: number, rangeM: number, radius: number, spec: HitSpec): Projectile | null {
    const p = this.shots.find((s) => !s.active);
    if (!p) return null;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    p.active = true; p.ownerId = owner.id; p.team = owner.team;
    p.x = from.x; p.y = from.y; p.z = from.z;
    p.vx = (dir.x / len) * speed; p.vy = (dir.y / len) * speed; p.vz = (dir.z / len) * speed;
    p.lifeSec = rangeM / Math.max(0.1, speed);
    p.radius = radius;
    Object.assign(p.spec, spec);
    return p;
  }

  get activeCount(): number { let n = 0; for (const s of this.shots) if (s.active) n++; return n; }

  step(ctx: AdventureStepContext, dt: number): void {
    for (const p of this.shots) {
      if (!p.active) continue;
      const adt = dt * ctx.timeScaleOf(p.ownerId);
      const ax = p.x, az = p.z;
      p.x += p.vx * adt; p.y += p.vy * adt; p.z += p.vz * adt;
      p.lifeSec -= adt;
      // Who the segment passed: hostile, alive, at the bolt's height.
      this.bodies.length = 0; this.bodyActors.length = 0;
      const mid = this.mid;
      mid.x = (ax + p.x) / 2; mid.y = p.y; mid.z = (az + p.z) / 2;
      const reach = Math.hypot(p.x - ax, p.z - az) / 2 + p.radius + 2;
      for (const a of ctx.world.near(mid, reach)) {
        if (a.id === p.ownerId || a.team === p.team || a.stats.hp.cur <= 0) continue;
        if (p.y < a.pos.y - 0.2 || p.y > a.pos.y + a.height + 0.2) continue;
        this.bodies.push({ x: a.pos.x, z: a.pos.z });
        this.bodyActors.push(a);
      }
      let hitIdx = -1, hitD = Infinity;
      if (this.bodies.length) {
        // pathHits takes one width for every body; test against the widest and then check each body's own radius.
        let maxR = 0;
        for (const a of this.bodyActors) maxR = Math.max(maxR, a.radius);
        for (const i of pathHits({ x: ax, z: az }, { x: p.x, z: p.z }, this.bodies, p.radius + maxR)) {
          const a = this.bodyActors[i];
          const d = Math.hypot(a.pos.x - ax, a.pos.z - az);
          if (segDist(ax, az, p.x, p.z, a.pos.x, a.pos.z) <= p.radius + a.radius && d < hitD) { hitD = d; hitIdx = i; }
        }
      }
      if (hitIdx >= 0) {
        const target = this.bodyActors[hitIdx];
        const owner = ctx.world.actors.get(p.ownerId) ?? null;
        p.spec.fromX = ax; p.spec.fromZ = az;
        applyHit(ctx.bus, ctx.tSec, owner, target, p.spec);
        p.active = false;
        continue;
      }
      if (p.lifeSec <= 0) p.active = false;
    }
  }

  clear(): void { for (const s of this.shots) s.active = false; }
}

function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
