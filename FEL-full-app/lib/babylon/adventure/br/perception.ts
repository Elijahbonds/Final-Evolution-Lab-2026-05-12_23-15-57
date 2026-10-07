/**
 * What a bot knows (ADVENTURE PLAN Phase C: "Bots must not be omniscient (line of sight, hearing radius)"). A bot
 * learns where another fighter is only by
 *
 *   SEEING it   within its tier's sight range, inside its field of view (around its facing) AND with a clear line from
 *               eye to eye through the world (AdventureWorld.clear: the map's blocks hide you), or
 *   HEARING it  within its tier's hearing radius all round (footsteps, through walls), or within LOUD_M of a fighter
 *               who made a NOISE a moment ago (a landed or blocked hit, a cast): a fight is heard from further off.
 *
 * What it learned is MEMORY: the last place and time, forgotten after the tier's memory span. A bot hunts the memory,
 * never the live body, so a fighter who breaks the line and moves is lost until found again. Loot is seen the same
 * way (sight range and a clear line). The zone is public (everyone's HUD shows it), and so is a teammate.
 *
 * Pure: plain data and the world's two questions. No allocation per query (scratch vectors).
 */

import type { ActorId, AdventureActor, AdventureWorld, Vec3 } from '../contracts';
import { LOUD_M, type BotTierDef } from './tuning';

export interface Memory { id: ActorId; x: number; y: number; z: number; atSec: number; heard: boolean }

const eyeA: Vec3 = { x: 0, y: 0, z: 0 };
const eyeB: Vec3 = { x: 0, y: 0, z: 0 };

function eyeOf(a: AdventureActor, out: Vec3): Vec3 {
  out.x = a.pos.x; out.y = a.pos.y + a.height * 0.85; out.z = a.pos.z;
  return out;
}

/** Inside the field of view: the angle from the facing to `p` within half the tier's FOV. */
export function inFov(self: Pick<AdventureActor, 'pos' | 'facingYaw'>, p: { x: number; z: number }, fovDeg: number): boolean {
  const dx = p.x - self.pos.x, dz = p.z - self.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return true;
  const fx = Math.sin(self.facingYaw), fz = Math.cos(self.facingYaw);
  return (dx * fx + dz * fz) / len >= Math.cos(((fovDeg / 2) * Math.PI) / 180);
}

/** Can `self` see `other` right now? */
export function canSee(self: AdventureActor, other: AdventureActor, world: Pick<AdventureWorld, 'clear'>, tier: Pick<BotTierDef, 'sightM' | 'fovDeg'>): boolean {
  const dx = other.pos.x - self.pos.x, dy = other.pos.y - self.pos.y, dz = other.pos.z - self.pos.z;
  if (dx * dx + dy * dy + dz * dz > tier.sightM * tier.sightM) return false;
  if (!inFov(self, other.pos, tier.fovDeg)) return false;
  return world.clear(eyeOf(self, eyeA), eyeOf(other, eyeB));
}

/** Can `self` hear `other` (quiet steps within the tier's radius; a recent noise from LOUD_M)? */
export function canHear(self: AdventureActor, other: AdventureActor, tier: Pick<BotTierDef, 'hearM'>, noisy: boolean): boolean {
  const r = noisy ? Math.max(LOUD_M, tier.hearM) : tier.hearM;
  const dx = other.pos.x - self.pos.x, dy = other.pos.y - self.pos.y, dz = other.pos.z - self.pos.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Can `self` see a point (a loot item, a chest) within `rangeM`? Field of view is not needed: a bot looks around. */
export function canSeePoint(self: AdventureActor, p: Vec3, world: Pick<AdventureWorld, 'clear'>, rangeM: number): boolean {
  const dx = p.x - self.pos.x, dz = p.z - self.pos.z;
  if (dx * dx + dz * dz > rangeM * rangeM) return false;
  eyeOf(self, eyeA);
  eyeB.x = p.x; eyeB.y = p.y + 0.5; eyeB.z = p.z;
  return world.clear(eyeA, eyeB);
}

/**
 * Refresh a bot's memory of the other fighters: add or move what it perceives now, forget what is stale. `others` is
 * every candidate body (the caller passes fighters and summons, never the bot's own team); `noisy(id)` says whether a
 * body made a noise a moment ago. Returns the number of bodies perceived this call.
 */
export function perceive(self: AdventureActor, others: Iterable<AdventureActor>, world: Pick<AdventureWorld, 'clear'>,
  tier: BotTierDef, noisy: (id: ActorId) => boolean, memory: Map<ActorId, Memory>, tSec: number): number {
  let n = 0;
  for (const o of others) {
    if (o.id === self.id || o.team === self.team || !(o.stats.hp.cur > 0)) continue;
    const seen = canSee(self, o, world, tier);
    const heard = !seen && canHear(self, o, tier, noisy(o.id));
    if (!seen && !heard) continue;
    n++;
    let m = memory.get(o.id);
    if (!m) { m = { id: o.id, x: 0, y: 0, z: 0, atSec: 0, heard }; memory.set(o.id, m); }
    m.x = o.pos.x; m.y = o.pos.y; m.z = o.pos.z; m.atSec = tSec; m.heard = heard;
  }
  for (const [id, m] of memory) if (tSec - m.atSec > tier.memorySec) memory.delete(id);
  return n;
}
