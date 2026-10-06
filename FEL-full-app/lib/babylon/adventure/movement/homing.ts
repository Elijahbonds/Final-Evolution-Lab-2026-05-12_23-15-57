/**
 * The homing dash (lane A1; docs/ADVENTURE-PLAN.md "movement/homing.ts").
 *
 * THE FEEL (a feel reference only): jump, and press jump again with a target in front of you — you snap to it at
 * 22 m/s, hit it, and bounce up and a little back with your air dash restored, so the next target is a press away and
 * targets CHAIN. Without a target the same press is an air dash (or take-off when you can fly).
 *
 * WHO IS A TARGET: another body within 9 m, inside the ±45° cone of where you are going (your run, or your facing when
 * you have none), not too far above or below, in line of sight (world.clear), alive, and not on your team (and never a story NPC). The lock-on
 * (A2's `lock`) wins when its target qualifies on range and sight, even outside the cone — a locked player meant it.
 * The nearest otherwise. The hit itself is A2's to score: A1 emits 'homing' { hit } once per dash and A2 turns a hit
 * into a DamageEvent.
 */

import type { ActorId, AdventureActor, AdventureWorld, Vec3 } from '../contracts';
import { FLOW } from '@/lib/babylon/core/FreeRunFlow';
import type { BodyState, StepEnv } from './body';
import type { HomingParams } from './params';
import { yawOf } from './math';

const aEye: Vec3 = { x: 0, y: 0, z: 0 }, bEye: Vec3 = { x: 0, y: 0, z: 0 };

/** Why a body is or is not a homing target (tests read the reason). */
export type HomingWhy = 'ok' | 'self' | 'team' | 'down' | 'far' | 'above' | 'below' | 'cone' | 'blocked';

/** Is `t` a valid homing target for `a`? `dirYaw` is the cone's axis. `ignoreCone` for the lock. */
export function homingReason(
  a: AdventureActor, t: AdventureActor, dirYaw: number, world: AdventureWorld, h: HomingParams, ignoreCone = false,
): HomingWhy {
  if (t.id === a.id || t.id === a.ridingId || t.ridingId === a.id) return 'self';
  if (t.team === a.team || t.kind === 'npc') return 'team';
  if (!(t.stats.hp.cur > 0) || t.state === 'ko') return 'down';
  aEye.x = a.pos.x; aEye.y = a.pos.y + a.height * 0.5; aEye.z = a.pos.z;
  bEye.x = t.pos.x; bEye.y = t.pos.y + t.height * 0.5; bEye.z = t.pos.z;
  const dx = bEye.x - aEye.x, dy = bEye.y - aEye.y, dz = bEye.z - aEye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > h.range) return 'far';
  if (dy > h.maxAbove) return 'above';
  if (dy < -h.maxBelow) return 'below';
  if (!ignoreCone) {
    const flat = Math.hypot(dx, dz);
    // A target straight under the dasher is in any cone (a drop onto it); otherwise the planar angle decides.
    if (flat > 0.5) {
      const cos = (Math.sin(dirYaw) * dx + Math.cos(dirYaw) * dz) / flat;
      if (cos < Math.cos(h.coneHalfRad)) return 'cone';
    }
  }
  if (!world.clear(aEye, bEye)) return 'blocked';
  return 'ok';
}

/** The cone's axis: where the body is going, or where it faces when it is not going anywhere. */
export function homingAxis(a: AdventureActor): number {
  return Math.hypot(a.vel.x, a.vel.z) > 1 ? yawOf(a.vel.x, a.vel.z) : a.facingYaw;
}

/** The target a homing press would snap to, or null. Pure: same world, same answer. */
export function pickHomingTarget(a: AdventureActor, world: AdventureWorld, h: HomingParams): AdventureActor | null {
  const axis = homingAxis(a);
  if (a.lock) {
    const locked = world.actors.get(a.lock.actorId);
    if (locked && homingReason(a, locked, axis, world, h, true) === 'ok') return locked;
  }
  let best: AdventureActor | null = null, bestD = Infinity;
  for (const t of world.near(a.pos, h.range + 2)) {
    if (homingReason(a, t, axis, world, h) !== 'ok') continue;
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y, t.pos.z - a.pos.z);
    if (d < bestD) { best = t; bestD = d; }
  }
  return best;
}

export function startHoming(a: AdventureActor, b: BodyState, target: AdventureActor): void {
  b.homingId = target.id;
  b.homingT = 0;
  b.spinning = true;
  b.rising = false;
  b.airDashT = 0;
}

function endHoming(a: AdventureActor, b: BodyState, targetId: ActorId, hit: boolean, env: StepEnv): void {
  b.homingId = null;
  b.homingT = 0;
  env.bus.emit('homing', { actorId: a.id, targetId, hit });
}

/**
 * One tick of a homing dash: re-aim at the target's centre (it may move), close at the snap speed, and on contact
 * bounce. Returns false when the dash ended this tick (hit or miss) so the caller resumes normal air physics.
 */
export function stepHoming(a: AdventureActor, b: BodyState, env: StepEnv, dt: number): boolean {
  const h = env.p.homing;
  const id = b.homingId!;
  const t = env.world.actors.get(id);
  if (!t || !(t.stats.hp.cur > 0) || t.state === 'ko') { endHoming(a, b, id, false, env); return false; }
  b.homingT += dt;
  const dx = t.pos.x - a.pos.x, dy = (t.pos.y + t.height * 0.5) - (a.pos.y + a.height * 0.5), dz = t.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dy, dz);
  const contact = a.radius + t.radius + h.hitPad;
  const ux = dist > 1e-6 ? dx / dist : 0, uy = dist > 1e-6 ? dy / dist : 0, uz = dist > 1e-6 ? dz / dist : 0;
  if (dist <= contact + h.speed * dt) {
    // The hit: stop at the contact shell, bounce up and back, the air dash back for the next link.
    const go = Math.max(0, dist - contact);
    a.pos.x += ux * go; a.pos.y += uy * go; a.pos.z += uz * go;
    const flat = Math.hypot(ux, uz) || 1;
    a.vel.x = -(ux / flat) * h.bounceBack; a.vel.z = -(uz / flat) * h.bounceBack; a.vel.y = h.bounceUp;
    b.airDashes = 1;
    b.homingChain++;
    b.flow.add(FLOW.rebound);
    b.spinning = true;
    endHoming(a, b, id, true, env);
    return false;
  }
  a.vel.x = ux * h.speed; a.vel.y = uy * h.speed; a.vel.z = uz * h.speed;
  a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
  if (Math.hypot(ux, uz) > 1e-3) a.facingYaw = yawOf(ux, uz);
  if (b.homingT >= h.maxSec) {
    a.vel.x *= 0.5; a.vel.y *= 0.5; a.vel.z *= 0.5;
    endHoming(a, b, id, false, env);
    return false;
  }
  return true;
}
