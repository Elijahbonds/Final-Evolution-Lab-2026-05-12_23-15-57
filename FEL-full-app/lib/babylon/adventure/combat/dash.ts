/**
 * Dodge, the Storm dash, and the homing dash to the lock (plan A2: "Storm dash and the homing dash to the lock";
 * "dodge i-frames from EvadeMoves, perfect dodge from DodgeRead").
 *
 *   tap, unlocked → the Storm dash. A1 moves the body (it is a movement verb); A2 grants its short i-frames and
 *                   charges the stamina. Offence: short, cheap, cancels.
 *   tap, locked   → the ROLL (EvadeMoves): further, longer i-frames that end before the roll does, a cooldown. A2
 *                   drives the body through `impulse` for the roll's length. Defence: a commitment.
 *   double tap, locked → the HOMING DASH to the lock (StormCombat's chakra dash): it closes at 12.5 m/s and stops
 *                   at 1.5 m, so the string that follows starts in reach.
 * A dodge needs its whole stamina cost (an empty bar cannot dodge). A dodge started inside DodgeRead's window before
 * an incoming strike is PERFECT: a riposte window and a slow-mo beat (NeoCombatCore's latch, so it cannot chain).
 */

import { dodgeReward } from '@/lib/babylon/core/DodgeRead';
import { SLOWMO } from '@/lib/babylon/core/NeoCombatCore';
import type { ActorId, AdventureActor, AdventureBus, AdventureWorld } from '../contracts';
import { requestPlanarVel } from './damage';
import type { FightState } from './fightState';
import { spendStaminaAll } from './stamina';
import { DODGE, STAMINA } from './tuning';

export type DodgeKind = 'dash' | 'roll';

export interface DodgeResult { ok: boolean; perfect: boolean; reason?: 'stamina' | 'cooldown' | 'stunned' }

/**
 * Start a dodge. `dirX/dirZ` is the world direction (the stick; zero = backwards from facing, the souls backstep).
 * Emits the perfect dodge's slow-mo as `time:scale` (the host owns the clock).
 */
export function startDodge(actor: AdventureActor, fs: FightState, kind: DodgeKind, dirX: number, dirZ: number,
  bus: AdventureBus): DodgeResult {
  if (actor.stunSec > 0 || actor.stats.hp.cur <= 0) return { ok: false, perfect: false, reason: 'stunned' };
  if (kind === 'roll' && (fs.rollCooldownSec > 0 || fs.rollSec > 0)) return { ok: false, perfect: false, reason: 'cooldown' };
  if (!spendStaminaAll(actor, fs, STAMINA.dodge)) return { ok: false, perfect: false, reason: 'stamina' };
  const iframes = kind === 'roll' ? DODGE.rollIframeSec : DODGE.dashIframeSec;
  actor.iframeSec = Math.max(actor.iframeSec, iframes);
  fs.iframeCause = 'dodge';
  fs.move = null;            // a dodge cancels the swing (the dash is a cancel: StormCombat)
  fs.homingSec = 0;
  if (kind === 'roll') {
    const l = Math.hypot(dirX, dirZ);
    if (l > 0.2) { fs.rollDirX = dirX / l; fs.rollDirZ = dirZ / l; }
    else { fs.rollDirX = -Math.sin(actor.facingYaw); fs.rollDirZ = -Math.cos(actor.facingYaw); }
    fs.rollSec = DODGE.rollSec;
    fs.rollCooldownSec = DODGE.rollCooldownSec;
    fs.moveLockSec = Math.max(fs.moveLockSec, DODGE.rollSec);
  }
  const reward = dodgeReward(Number.isFinite(fs.incomingSec) ? fs.incomingSec : null);
  if (reward.perfect) {
    fs.perfectDodges++;
    fs.counterSec = Math.max(fs.counterSec, reward.counterSec);
    if (fs.slowMo.fire('perfectDodge')) {
      bus.emit('time:scale', { byId: actor.id, world: SLOWMO.scale, self: 1, sec: reward.slowMoSec });
    }
  }
  return { ok: true, perfect: reward.perfect };
}

/** Start the homing dash to the lock. Refused without a target or while stunned. Costs a dodge's stamina. */
export function startHoming(actor: AdventureActor, fs: FightState, targetId: ActorId | null): boolean {
  if (!targetId || actor.stunSec > 0 || actor.stats.hp.cur <= 0) return false;
  // The double tap's first tap already paid for a dash; the homing burst is the same press continued.
  fs.rollSec = 0;
  fs.homingSec = DODGE.homingMaxSec;
  fs.homingTarget = targetId;
  fs.moveLockSec = Math.max(fs.moveLockSec, DODGE.homingMaxSec);
  return true;
}

/**
 * Drive the body for the roll or the homing dash this step (through `impulse`). Returns 'arrived' on the step the
 * homing dash reaches its stop distance, 'expired' when it ran out first, else null.
 */
export function stepDodgeMotion(actor: AdventureActor, fs: FightState, world: AdventureWorld, dt: number): 'arrived' | 'expired' | null {
  if (fs.rollSec > 0) {
    fs.rollSec = Math.max(0, fs.rollSec - dt);
    const v = fs.rollSec > 0 ? DODGE.rollSpeed : 0;
    requestPlanarVel(actor, fs.rollDirX * v, fs.rollDirZ * v);
    return null;
  }
  if (fs.homingSec > 0) {
    const t = fs.homingTarget ? world.actors.get(fs.homingTarget) : undefined;
    fs.homingSec = Math.max(0, fs.homingSec - dt);
    if (!t || t.stats.hp.cur <= 0) { fs.homingSec = 0; fs.moveLockSec = 0; requestPlanarVel(actor, 0, 0); return 'expired'; }
    const dx = t.pos.x - actor.pos.x, dz = t.pos.z - actor.pos.z;
    const d = Math.hypot(dx, dz);
    const stop = DODGE.homingStopM + t.radius * 0.5;
    if (d <= stop) {
      fs.homingSec = 0; fs.moveLockSec = 0;
      requestPlanarVel(actor, 0, 0);
      return 'arrived';
    }
    // Never overshoot the stop distance in one step.
    const v = Math.min(DODGE.homingSpeed, (d - stop) / Math.max(dt, 1e-3));
    requestPlanarVel(actor, (dx / d) * v, (dz / d) * v);
    if (fs.homingSec === 0) { fs.moveLockSec = 0; return 'expired'; }
  }
  return null;
}
