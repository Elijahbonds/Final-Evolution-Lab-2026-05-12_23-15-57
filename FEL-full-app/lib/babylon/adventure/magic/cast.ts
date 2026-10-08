/**
 * Casting (plan A2: "cast time, energy, cooldowns, the shapes"). The rules a cast passes before anything is spent,
 * and the shapes a finished cast lands in.
 *
 * NO HALF-CASTS. Every check runs before the energy is taken: known, equipped, the level and fusion tier it needs,
 * the cooldown, a free caster, a target for a grab and an element for a partner spell, and finally the energy itself
 * (`spendPool`, all or nothing). A refused cast spends nothing and says why (`Refusal`, for the HUD).
 *
 * Shapes reuse the shipped geometry: the cone is OnslaughtCore's `inArc` test on plain data (a parity test pins it),
 * a bolt is a projectile (combat/projectiles.ts, HordeDynamics' path test), a nova every hostile in a radius.
 */

import type { ActorId, AdventureActor, AdventureWorld, SpellDef } from '../contracts';
import { isHostile, yawTo } from '../combat/lock';

export type Refusal =
  | 'unknown' | 'not-equipped' | 'level' | 'fusion' | 'cooldown' | 'energy' | 'busy' | 'stunned' | 'no-target'
  | 'too-heavy' | 'no-element' | 'shape';

/** A caster's spell book, as the save holds it (A3's `AdventureSave.player.spells`). */
export interface SpellLoadout { known: readonly string[]; equipped: readonly (string | null)[] }

/** One caster's casting state. Created once per caster. */
export class CasterState {
  slot = 0;
  casting: SpellDef | null = null;
  castT = 0;
  castTarget: ActorId | null = null;
  readonly cooldowns = new Map<string, number>();
  /** Telekinesis: the body held, and the spell holding it. */
  holding: ActorId | null = null;
  holdSpell: SpellDef | null = null;
  slowActive = false;
  magicHeldWas = false;
  lastRefusal: Refusal | null = null;
  casts = 0;
}

/** The planar forward-arc test of OnslaughtCore.inArc, on plain {x, z} (no Vector3 in the sim). */
export function inArcXZ(origin: { x: number; z: number }, facingYaw: number, target: { x: number; z: number }, range: number, arcDeg: number): boolean {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const len = Math.hypot(dx, dz);
  if (len > range || len < 1e-3) return false;
  const fx = Math.sin(facingYaw), fz = Math.cos(facingYaw);
  return (dx * fx + dz * fz) / len >= Math.cos(((arcDeg / 2) * Math.PI) / 180);
}

/** Where a spell goes: the lock (hard or soft), else straight ahead. */
export function spellAim(caster: AdventureActor, world: Pick<AdventureWorld, 'actors'>): { target: AdventureActor | null; yaw: number } {
  const t = caster.lock ? world.actors.get(caster.lock.actorId) : undefined;
  if (t && t.stats.hp.cur > 0) return { target: t, yaw: yawTo(caster.pos.x, caster.pos.z, t.pos.x, t.pos.z) };
  return { target: null, yaw: caster.facingYaw };
}

/** Everything but the energy: can this caster start `spell` now? */
export function castBlocker(caster: AdventureActor, cs: CasterState, spell: SpellDef, loadout: SpellLoadout | null,
  implemented: ReadonlySet<SpellDef['shape']>): Refusal | null {
  if (!loadout || !loadout.known.includes(spell.id)) return 'unknown';
  if (!implemented.has(spell.shape)) return 'shape';
  if (caster.stunSec > 0 || caster.stats.hp.cur <= 0) return 'stunned';
  if (cs.casting || cs.holding) return 'busy';
  const req = spell.requires;
  if (req?.level && caster.stats.level < req.level) return 'level';
  if (req?.fusionTier && caster.fusion.tier < req.fusionTier) return 'fusion';
  if ((cs.cooldowns.get(spell.id) ?? 0) > 0) return 'cooldown';
  return null;
}

/** The light hostile a telekinesis grab takes: the lock if it qualifies, else the nearest in a 40° cone ahead. */
export function grabTarget(caster: AdventureActor, world: AdventureWorld, rangeM: number,
  weightOf: (a: AdventureActor) => 'light' | 'medium' | 'heavy'): { target: AdventureActor | null; refusal: Refusal | null } {
  const aim = spellAim(caster, world);
  if (aim.target) {
    const d = Math.hypot(aim.target.pos.x - caster.pos.x, aim.target.pos.z - caster.pos.z);
    if (!isHostile(caster, aim.target) || d > rangeM) return { target: null, refusal: 'no-target' };
    return weightOf(aim.target) === 'light' ? { target: aim.target, refusal: null } : { target: null, refusal: 'too-heavy' };
  }
  let best: AdventureActor | null = null, bestD = Infinity, sawHeavy = false;
  for (const o of world.near(caster.pos, rangeM)) {
    if (!isHostile(caster, o) || !inArcXZ(caster.pos, caster.facingYaw, o.pos, rangeM, 40)) continue;
    if (weightOf(o) !== 'light') { sawHeavy = true; continue; }
    const d = Math.hypot(o.pos.x - caster.pos.x, o.pos.z - caster.pos.z);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { target: best, refusal: null } : { target: null, refusal: sawHeavy ? 'too-heavy' : 'no-target' };
}
