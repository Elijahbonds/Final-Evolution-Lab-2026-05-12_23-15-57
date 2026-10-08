/**
 * Lock-on (plan A2): pick by distance, screen-centre and line of sight; switch with a stick flick; break past 25 m or
 * out of sight for 1 s. A boss's weak points are lock candidates of their own (`LockTarget.part`), so locking onto a
 * part and flicking between parts is the same verb as switching enemies (the monster-slayer feel: lock the weak point).
 *
 * Pure: plain data in, a choice out. The lock is written by the combat system (A2 owns `actor.lock`).
 */

import type { ActorId, AdventureActor, AdventureWorld, LockTarget, Vec3 } from '../contracts';
import { LOCK } from './tuning';

/** A boss weak point, in the body's local frame (+x right, +y up, +z forward). */
export interface WeakPointRef { part: string; offset: Vec3 }

/** Who lists an actor's weak points (the combat system answers from its registered boss defs). */
export type PartsOf = (actor: AdventureActor) => readonly WeakPointRef[] | null;

export interface LockCandidate { actorId: ActorId; part?: string; x: number; y: number; z: number; dist: number }

const wrap = (a: number): number => {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** Yaw from a to b (0 faces +z, +π/2 faces +x: the contract's left-handed axes). */
export const yawTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az);

/** A local offset on a body facing `yaw`, in world space (forward = (sin, cos), right = (cos, −sin)). */
export function partWorld(body: Pick<AdventureActor, 'pos' | 'facingYaw'>, offset: Vec3, out: Vec3): Vec3 {
  const s = Math.sin(body.facingYaw), c = Math.cos(body.facingYaw);
  out.x = body.pos.x + offset.x * c + offset.z * s;
  out.y = body.pos.y + offset.y;
  out.z = body.pos.z - offset.x * s + offset.z * c;
  return out;
}

/** Is `other` something `self` may fight: another team, alive. */
export function isHostile(self: AdventureActor, other: AdventureActor): boolean {
  return other.id !== self.id && other.team !== self.team && other.stats.hp.cur > 0 && other.kind !== 'npc';
}

const eye = (a: AdventureActor): Vec3 => ({ x: a.pos.x, y: a.pos.y + a.height * 0.6, z: a.pos.z });

/**
 * Every lockable point within `rangeM` and in sight: hostile bodies, and each boss weak point as its own candidate.
 * Called on a lock press or a flick (edges), never per tick, so it may allocate.
 */
export function lockCandidates(self: AdventureActor, world: AdventureWorld, partsOf: PartsOf, rangeM = LOCK.acquireM): LockCandidate[] {
  const out: LockCandidate[] = [];
  const from = eye(self);
  for (const o of world.near(self.pos, rangeM)) {
    if (!isHostile(self, o)) continue;
    const d = Math.hypot(o.pos.x - self.pos.x, o.pos.z - self.pos.z);
    if (d > rangeM) continue;
    const to = eye(o);
    if (!world.clear(from, to)) continue;
    out.push({ actorId: o.id, x: o.pos.x, y: to.y, z: o.pos.z, dist: d });
    const parts = partsOf(o);
    if (parts) {
      for (const p of parts) {
        const w = partWorld(o, p.offset, { x: 0, y: 0, z: 0 });
        out.push({ actorId: o.id, part: p.part, x: w.x, y: w.y, z: w.z, dist: Math.hypot(w.x - self.pos.x, w.z - self.pos.z) });
      }
    }
  }
  return out;
}

/**
 * The best candidate for a fresh lock: the one nearest the screen centre (the camera's forward) and nearest the body,
 * among those on screen. With nothing on screen, the nearest anywhere in range (a lock press never does nothing when
 * an enemy is behind you; the camera then swings to it). −1 when there is nothing.
 */
export function pickLock(self: Pick<AdventureActor, 'pos'>, camYaw: number, cands: readonly LockCandidate[]): number {
  let best = -1, bestScore = Infinity, nearest = -1, nearestD = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (c.part) continue;   // a fresh lock takes the body; a flick reaches the parts
    if (c.dist < nearestD) { nearestD = c.dist; nearest = i; }
    const ang = Math.abs(wrap(yawTo(self.pos.x, self.pos.z, c.x, c.z) - camYaw));
    if (ang > LOCK.acquireHalfAngleRad) continue;
    const score = c.dist * LOCK.distWeight + ang * LOCK.angleWeight;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best >= 0 ? best : nearest;
}

/**
 * The next candidate in the flick's direction (+1 = to the right, −1 = to the left), measured as the turn from the
 * current lock around the body. Wraps: past the rightmost target the flick comes round to the leftmost. −1 when the
 * current lock is the only candidate.
 */
export function cycleLock(self: Pick<AdventureActor, 'pos'>, current: { x: number; z: number; actorId: ActorId; part?: string },
  dir: 1 | -1, cands: readonly LockCandidate[]): number {
  const base = yawTo(self.pos.x, self.pos.z, current.x, current.z);
  let best = -1, bestTurn = Infinity, wrapBest = -1, wrapTurn = -Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (c.actorId === current.actorId && c.part === current.part) continue;
    let turn = wrap(yawTo(self.pos.x, self.pos.z, c.x, c.z) - base) * dir;
    // A part on the same body sits at almost the same bearing: order it by its distance so a flick still reaches it.
    if (Math.abs(turn) < 1e-3) turn = 1e-3 + c.dist * 1e-4;
    if (turn > 0 && turn < bestTurn) { bestTurn = turn; best = i; }
    if (turn <= 0 && -turn > wrapTurn) { wrapTurn = -turn; wrapBest = i; }
  }
  return best >= 0 ? best : wrapBest;
}

/** Where a lock points in the world (a part's world position, or the body's chest). Null when the target is gone. */
export function lockPoint(lock: LockTarget, world: AdventureWorld, partsOf: PartsOf, out: Vec3): Vec3 | null {
  const t = world.actors.get(lock.actorId);
  if (!t) return null;
  if (lock.part) {
    const parts = partsOf(t);
    const p = parts?.find((q) => q.part === lock.part);
    if (p) return partWorld(t, p.offset, out);
  }
  out.x = t.pos.x; out.y = t.pos.y + t.height * 0.6; out.z = t.pos.z;
  return out;
}

export type LockBreak = 'range' | 'sight' | 'gone' | null;

/**
 * Should a hard lock hold this tick? Breaks past `LOCK.breakM`, when the target is gone or down, or after
 * `LOCK.lostSightSec` out of sight. `lostSec` is the caller's accumulator (returned updated).
 */
export function lockHolds(self: AdventureActor, lock: LockTarget, world: AdventureWorld, lostSec: number, dt: number):
  { breakReason: LockBreak; lostSec: number } {
  const t = world.actors.get(lock.actorId);
  if (!t || t.stats.hp.cur <= 0) return { breakReason: 'gone', lostSec: 0 };
  const d = Math.hypot(t.pos.x - self.pos.x, t.pos.z - self.pos.z);
  if (d > LOCK.breakM) return { breakReason: 'range', lostSec: 0 };
  const seen = world.clear(eye(self), eye(t));
  const lost = seen ? 0 : lostSec + dt;
  if (lost >= LOCK.lostSightSec) return { breakReason: 'sight', lostSec: 0 };
  return { breakReason: null, lostSec: lost };
}
