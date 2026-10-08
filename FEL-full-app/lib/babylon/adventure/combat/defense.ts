/**
 * Guard, parry and substitution (plan A2: "guard and parry from FightCore and DefenseSystem").
 *
 * THE PARRY IS FIGHTCORE'S. `resolveStrike` is the one authority every fight mode in the app asks "was that parried?";
 * the Adventure asks it too, through a scratch `FighterState` filled from the actor (its stun, its guard, the time of
 * its last guard press on its own clock). FightCore's guard GAUGE is not the Adventure's: here the guard spends
 * stamina (souls-like), so the scratch gauge is kept full and the stamina rule is applied after (`blockCost`).
 *
 * The guard covers the front only (a raised guard, not a bubble); a parry is a guard press inside the window before
 * the hit. A substitution (DefenseSystem's, guard + dash) is armed for a beat, costs energy, answers the next strike
 * by reappearing behind the attacker, and leaves a window in which a read punishes it.
 */

import { FighterState, GUARD_MAX, resolveStrike, type AttackDef } from '@/lib/babylon/core/FightCore';
import { blendTraits, guardTakenMult } from '@/lib/babylon/combat/schools';
import type { AdventureActor, Vec3 } from '../contracts';
import type { FightState } from './fightState';
import { yawTo } from './lock';
import { GUARD, STAMINA, SUBSTITUTION } from './tuning';

/** Extra parry window the foresight mind power grants. NEW [TUNE]. */
export const FORESIGHT_PARRY_BONUS_MS = 60;

export type GuardResult = 'parried' | 'blocked' | 'open';

// One scratch defender and one scratch attack, reused: resolveStrike is asked once per hit, never allocated per hit.
const scratchDef = new FighterState(1);
const scratchAtk: AttackDef = {
  id: 'adventure', label: '', clip: '', dmg: 0, range: 1, startupMs: 0, stunSec: 0, knockback: 0, chiGain: 0, guardDmg: 0,
};

/**
 * FightCore's answer for a hit landing now on a defender whose guard is `guardUp`, with the last guard press at
 * `pressSec` and the impact at `nowSec` (both on the DEFENDER's clock). Pure apart from the scratch.
 */
export function guardAnswer(guardUp: boolean, pressSec: number, nowSec: number, stunSec: number, parryWindowMs: number = GUARD.parryWindowMs): GuardResult {
  scratchDef.guard = GUARD_MAX;
  scratchDef.stunSec = Math.max(0, stunSec);
  scratchDef.staggerSec = 0;
  scratchDef.blockHeld = guardUp;
  // A guard that is not up cannot parry either: no press is on record.
  scratchDef.lastBlockPressMs = guardUp ? pressSec * 1000 : -1e9;
  const r = resolveStrike(scratchAtk, 0, scratchDef, nowSec * 1000, undefined, parryWindowMs);
  return r === 'parried' ? 'parried' : r === 'blocked' ? 'blocked' : 'open';
}

/** Is the attacker inside the defender's guarded front? */
export function inGuardArc(defender: Pick<AdventureActor, 'pos' | 'facingYaw'>, from: { x: number; z: number }): boolean {
  const toYaw = yawTo(defender.pos.x, defender.pos.z, from.x, from.z);
  let d = toYaw - defender.facingYaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) <= GUARD.frontHalfAngleRad;
}

/** Stamina a blocked hit of `damage` costs this defender (the school's guard trait scales it). */
export function blockCost(defender: AdventureActor, damage: number): number {
  return STAMINA.blockPerDamage * Math.max(0, damage) * guardTakenMult(blendTraits(defender.stats.school));
}

/** The parry window this defender has right now (foresight widens it). */
export function parryWindowMsFor(fs: FightState): number {
  return GUARD.parryWindowMs + (fs.foresightSec > 0 ? FORESIGHT_PARRY_BONUS_MS : 0);
}

/** Where a substitution puts the defender: behind the attacker (DefenseController.substitutionSpot, plain data). */
export function substitutionSpot(attacker: Pick<AdventureActor, 'pos' | 'facingYaw'>, out: Vec3, behind: number = SUBSTITUTION.behindM): Vec3 {
  out.x = attacker.pos.x - Math.sin(attacker.facingYaw) * behind;
  out.y = attacker.pos.y;
  out.z = attacker.pos.z - Math.cos(attacker.facingYaw) * behind;
  return out;
}
