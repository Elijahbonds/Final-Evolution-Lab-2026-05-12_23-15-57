/**
 * Souls-like stamina (plan A2). A2 owns `stats.stamina.cur` outright: spend AND regen, because the regen delay is a
 * combat feel (contracts.ts CombatStats). The max is A3's.
 *
 * Two spending rules, on purpose:
 *   - a DODGE needs its whole cost (`spendPool`: all or nothing). An empty bar cannot dodge: that is the punish.
 *   - an ATTACK only needs the bar above zero and drains it to zero (the souls rule: you can always throw the swing
 *     you committed to, and then you are empty). assumption: the plan says "stamina for every attack" without saying
 *     which rule; this is the genre's.
 * Either way the regen waits `STAMINA.regenDelaySec` after the last spend.
 */

import { spendPool, type AdventureActor } from '../contracts';
import type { FightState } from './fightState';
import { STAMINA } from './tuning';

/** All or nothing (a dodge, a substitution). */
export function spendStaminaAll(actor: AdventureActor, fs: FightState, cost: number): boolean {
  if (!spendPool(actor.stats.stamina, cost)) return false;
  fs.staminaIdleSec = 0;
  return true;
}

/** The souls rule (an attack): allowed while the bar is above zero; drains to zero at worst. */
export function spendStaminaSwing(actor: AdventureActor, fs: FightState, cost: number): boolean {
  const s = actor.stats.stamina;
  if (!(s.cur > 0)) return false;
  s.cur = Math.max(0, s.cur - Math.max(0, cost));
  fs.staminaIdleSec = 0;
  return true;
}

/** A continuous drain (sprint, a blocked hit's chip). Drains what is there; returns false when it ran dry. */
export function drainStamina(actor: AdventureActor, fs: FightState, amount: number): boolean {
  const s = actor.stats.stamina;
  if (!(amount > 0)) return s.cur > 0;
  fs.staminaIdleSec = 0;
  if (s.cur >= amount) { s.cur -= amount; return true; }
  s.cur = 0;
  return false;
}

/** Regen after the pause; slower behind a raised guard. `dt` is the actor's own (time-scaled) seconds. */
export function tickStamina(actor: AdventureActor, fs: FightState, dt: number, guardUp: boolean): void {
  fs.staminaIdleSec += dt;
  const s = actor.stats.stamina;
  if (fs.staminaIdleSec < STAMINA.regenDelaySec || s.cur >= s.max) return;
  const rate = STAMINA.regenPerSec * (guardUp ? STAMINA.guardRegenMult : 1);
  s.cur = Math.min(s.max, s.cur + rate * dt);
}
