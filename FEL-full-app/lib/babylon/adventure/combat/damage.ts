/**
 * Damage: build a hit, answer it (dodge, substitution, parry, guard, barrier), apply it, emit it (plan A2:
 * "builds and applies DamageEvent, elementMultiplier, emits ko once").
 *
 * ONE PIPELINE FOR EVERY SOURCE. A string link, a monster's swing, a caster's bolt, a spell, a thrown body: all of them
 * become a `HitSpec` and go through `applyHit`, so a parry, an i-frame, an element and the damage caps mean the same
 * thing whatever threw the hit. The magic system calls the same function.
 *
 * THE CAPS ARE THE BR'S ECONOMY. Every multiplier is real (level, style, PRQ force, a route's payoff, a counter, a
 * juggle, an element, a weak point, a fused partner spell), and they stack. Without a ceiling the stack is what decides
 * a Battle Royale, so one hit is clamped to `DAMAGE.maxFractionOfMaxHp` of the target's max HP and `DAMAGE.maxAbsolute`
 * (tuning.ts). Nothing one-shots; a full-HP fighter survives any two hits.
 *
 * KO ONCE. `ko` fires on the hit that takes HP from above zero to zero, and a body at zero takes no more hits, so it
 * cannot fire twice for one life (a revive is A3's, and starts a new life).
 */

import { damageScale, ratingsFrom } from '@/lib/babylon/core/FighterStyle';
import { COUNTER_DAMAGE_MULT as SUB_PUNISH_MULT } from '@/lib/babylon/core/DefenseSystem';
import { blendTraits, damageMult as styleDamageMult } from '@/lib/babylon/combat/schools';
import {
  elementMultiplier, type AdventureActor, type AdventureBus, type DamageEvent, type DamageOutcome, type DamageSource,
  type Element,
} from '../contracts';
import { elementOf, fightStateOf } from './fightState';
import { blockCost, guardAnswer, inGuardArc, parryWindowMsFor, substitutionSpot } from './defense';
import { AIR, DAMAGE, GUARD, HIT, POISE, SUBSTITUTION } from './tuning';

/** Everything a hit carries before the defender answers it. Reusable: callers keep one and refill it. */
export interface HitSpec {
  base: number;
  source: DamageSource;
  element: Element | null;
  via: string;
  staggerSec: number;
  knockbackM: number;
  launch: boolean;
  slam: boolean;
  /** An air link: holds a juggled body up. */
  air: boolean;
  /** Poise damage = base × POISE.perDamage × this. */
  poiseMult: number;
  parryable: boolean;
  blockable: boolean;
  /** The caller's own multipliers (a route's payoff, a riposte, a fused partner spell). */
  mult: number;
  part?: string;
  partMult: number;
  finisher: boolean;
  /** Where the hit comes from (the guard's arc and the knockback's direction). */
  fromX: number;
  fromZ: number;
}

export function makeHitSpec(): HitSpec {
  return {
    base: 0, source: 'strike', element: null, via: '', staggerSec: 0, knockbackM: 0, launch: false, slam: false,
    air: false, poiseMult: 1, parryable: true, blockable: true, mult: 1, part: undefined, partMult: 1, finisher: false,
    fromX: 0, fromZ: 0,
  };
}

/** Reset a reusable spec to its defaults (so a caller never carries a flag from the last hit). */
export function resetHitSpec(s: HitSpec): HitSpec {
  s.base = 0; s.source = 'strike'; s.element = null; s.via = ''; s.staggerSec = 0; s.knockbackM = 0; s.launch = false;
  s.slam = false; s.air = false; s.poiseMult = 1; s.parryable = true; s.blockable = true; s.mult = 1; s.part = undefined;
  s.partMult = 1; s.finisher = false; s.fromX = 0; s.fromZ = 0;
  return s;
}

/** What the attacker brings to every hit: level, style (school power), PRQ force. A guest (no attrs) is a 50. */
export function outgoingMult(attacker: AdventureActor | null): number {
  if (!attacker) return 1;
  const st = attacker.stats;
  const level = 1 + DAMAGE.perLevel * Math.max(0, (st.level || 1) - 1);
  const style = styleDamageMult(blendTraits(st.school));
  const force = damageScale(ratingsFrom(st.attrs ?? {}));
  return level * style * force;
}

/** FightCore.applyHit's chain scaling for the `n`-th landed hit of a combo (1 = the opener). */
export function comboScale(n: number): number {
  return Math.max(HIT.comboFloor, 1 - HIT.comboStep * (Math.max(1, n) - 1));
}

/** The per-hit ceiling for this target. */
export function hitCap(target: AdventureActor): number {
  return Math.min(DAMAGE.maxAbsolute, DAMAGE.maxFractionOfMaxHp * Math.max(1, target.stats.hp.max));
}

/**
 * The HP a clean hit removes, every multiplier applied and the caps held. `comboN` is the hit's place in the
 * attacker's combo (strikes; 1 for anything else). Integer, finite, ≥ 0.
 */
export function damageAmount(attacker: AdventureActor | null, target: AdventureActor, spec: HitSpec, comboN = 1): number {
  if (!(spec.base > 0)) return 0;
  const tfs = fightStateOf(target);
  let m = spec.mult * spec.partMult * outgoingMult(attacker) * elementMultiplier(spec.element, elementOf(target));
  if (spec.source === 'strike') m *= comboScale(comboN);
  if (tfs.airSec > 0) m *= AIR.juggleMult;
  if (tfs.subVulnerableSec > 0) m *= SUB_PUNISH_MULT;
  m = Math.max(0, Math.min(DAMAGE.maxMultiplier, m));
  const raw = spec.base * m;
  const out = Math.round(Math.min(raw, hitCap(target)));
  return Number.isFinite(out) ? Math.max(0, out) : 0;
}

/** Add a velocity change for A1 to apply (A2 owns `impulse`; A1 adds it on its next step and zeroes it). */
export function addImpulse(a: AdventureActor, x: number, y: number, z: number): void {
  if (!a.impulse) a.impulse = { x, y, z };
  else { a.impulse.x += x; a.impulse.y += y; a.impulse.z += z; }
}

/** Ask for a vertical speed (a launch, an air link's hold, a slam): the impulse that turns vel.y into `vy`. */
export function requestVy(a: AdventureActor, vy: number): void {
  const pending = a.impulse ? a.impulse.y : 0;
  addImpulse(a, 0, vy - (a.vel.y + pending), 0);
}

/** Ask for a planar velocity (a roll, a homing dash, a lunge, a telekinesis hold). */
export function requestPlanarVel(a: AdventureActor, vx: number, vz: number): void {
  const px = a.impulse ? a.impulse.x : 0, pz = a.impulse ? a.impulse.z : 0;
  addImpulse(a, vx - (a.vel.x + px), 0, vz - (a.vel.z + pz));
}

/** The launch speed that keeps a body up for `sec` under A1's (assumed) gravity. */
export const launchVy = (sec: number): number => (AIR.gravity * sec) / 2;

function emit(bus: AdventureBus, tSec: number, attacker: AdventureActor | null, target: AdventureActor, spec: HitSpec,
  outcome: DamageOutcome, amount: number, staminaDamage: number, poiseDamage: number, staggerSec: number,
  launch: boolean, kb: { x: number; y: number; z: number } | null): DamageEvent {
  const ev: DamageEvent = {
    tSec, sourceId: attacker ? attacker.id : null, targetId: target.id, amount, source: spec.source, element: spec.element,
    outcome, staminaDamage, poiseDamage, staggerSec, launch, knockback: kb, via: spec.via || undefined,
    part: spec.part, finisher: spec.finisher || undefined,
  };
  bus.emit('damage', ev);
  return ev;
}

/**
 * Land `spec` on `target`. Returns the event it emitted, or null when the target was already down. The defender's
 * answers, in order: invulnerable (a dodge's i-frames read 'dodged', any other 'iframe'); an armed substitution
 * ('dodged'); a parry or a guard (front only, strikes; spells can be guarded but not parried); a barrier; the hit.
 */
export function applyHit(bus: AdventureBus, tSec: number, attacker: AdventureActor | null, target: AdventureActor, spec: HitSpec): DamageEvent | null {
  const hp = target.stats.hp;
  if (hp.cur <= 0) return null;
  const tfs = fightStateOf(target);
  const afs = attacker ? fightStateOf(attacker) : null;

  if (target.iframeSec > 0) {
    return emit(bus, tSec, attacker, target, spec, tfs.iframeCause === 'dodge' ? 'dodged' : 'iframe', 0, 0, 0, 0, false, null);
  }

  if (tfs.subArmedSec > 0 && spec.parryable && attacker) {
    tfs.subArmedSec = 0;
    tfs.subCooldownSec = SUBSTITUTION.cooldownSec;
    tfs.subVulnerableSec = SUBSTITUTION.vulnerableSec;
    substitutionSpot(attacker, tfs.subSpot);
    tfs.subPending = true;
    return emit(bus, tSec, attacker, target, { ...spec, via: 'substitution' }, 'dodged', 0, 0, 0, 0, false, null);
  }

  // The defender's guard: up, facing the hit, and the defender not stunned.
  const guardUp = tfs.guardWasHeld && target.stunSec <= 0 && !tfs.move && tfs.rollSec <= 0;
  if (guardUp && spec.blockable && inGuardArc(target, { x: spec.fromX, z: spec.fromZ })) {
    const ans = guardAnswer(true, tfs.guardPressSec, tfs.localSec, target.stunSec, parryWindowMsFor(tfs));
    if (ans === 'parried' && spec.parryable) {
      if (attacker && afs) { attacker.stunSec = Math.max(attacker.stunSec, GUARD.parryStaggerSec); afs.move = null; }
      tfs.counterSec = GUARD.riposteSec;
      return emit(bus, tSec, attacker, target, spec, 'parried', 0, 0, 0, attacker ? GUARD.parryStaggerSec : 0, false, null);
    }
    // A parry press on an unparryable hit is still a guard.
    const would = damageAmount(attacker, target, spec);
    const cost = blockCost(target, would);
    const st = target.stats.stamina;
    if (st.cur >= cost) {
      st.cur -= cost;
      tfs.staminaIdleSec = 0;
      return emit(bus, tSec, attacker, target, spec, 'blocked', 0, cost, 0, 0, false, null);
    }
    // Guard break: the bar empties and the defender staggers (FightCore's long stagger), no HP lost on the break.
    const spent = st.cur;
    st.cur = 0;
    tfs.staminaIdleSec = 0;
    target.stunSec = Math.max(target.stunSec, GUARD.guardBreakStaggerSec);
    tfs.move = null;
    return emit(bus, tSec, attacker, target, spec, 'guardBreak', 0, spent, 0, GUARD.guardBreakStaggerSec, false, null);
  }

  // A clean hit.
  const comboN = spec.source === 'strike' && afs ? afs.combo + 1 : 1;
  let amount = damageAmount(attacker, target, spec, comboN);
  if (tfs.barrierHp > 0 && amount > 0) {
    const absorbed = Math.min(tfs.barrierHp, amount);
    tfs.barrierHp -= absorbed;
    amount -= absorbed;
  }
  if (spec.source === 'strike' && afs) { afs.combo = comboN; afs.comboSec = HIT.comboWindowSec; }

  const before = hp.cur;
  hp.cur = Math.max(0, hp.cur - amount);

  // Poise: a break staggers even an armoured body, and refills its poise.
  const poise = target.stats.poise;
  const poiseDamage = Math.max(0, spec.base * POISE.perDamage * spec.poiseMult);
  tfs.poiseIdleSec = 0;
  let broke = false;
  if (poise.max > 0 && poiseDamage > 0) {
    poise.cur -= poiseDamage;
    if (poise.cur <= 0) { broke = true; poise.cur = poise.max; }
  }
  let stagger = 0;
  if (broke) stagger = POISE.breakStaggerSec;
  else if (!tfs.hyperArmor) stagger = spec.staggerSec;

  // Launch, air links, slams. An armoured body only leaves the ground when its poise breaks.
  const canLift = !tfs.hyperArmor || broke;
  let launched = false;
  if (spec.slam && tfs.airSec > 0) {
    tfs.airSec = 0; tfs.airLinks = 0;
    requestVy(target, AIR.slamVy);
    stagger = Math.max(stagger, AIR.slamStunSec);
  } else if (spec.air && tfs.airSec > 0) {
    tfs.airLinks++;
    if (tfs.airLinks <= AIR.maxLinks) {
      tfs.airSec = Math.max(tfs.airSec, AIR.linkExtendSec);
      requestVy(target, AIR.holdVy);
    }
    stagger = Math.max(stagger, tfs.airSec);
  } else if (spec.launch && canLift && tfs.airSec <= 0) {
    launched = true;
    tfs.airSec = AIR.launchSec; tfs.airLinks = 0;
    requestVy(target, launchVy(AIR.launchSec));
    stagger = Math.max(stagger, AIR.launchSec);
  }
  if (stagger > 0) {
    target.stunSec = Math.max(target.stunSec, stagger);
    if (stagger >= 0.3) tfs.move = null;   // a real stagger interrupts the swing; a flinch does not
  }

  // Knockback, away from where the hit came from.
  let kb: { x: number; y: number; z: number } | null = null;
  if (spec.knockbackM > 0 && canLift) {
    const dx = target.pos.x - spec.fromX, dz = target.pos.z - spec.fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const juggle = launched || spec.air ? AIR.launchKnockbackMult : 1;
    const v = (spec.knockbackM * juggle) / HIT.knockbackSec;
    kb = { x: (dx / d) * v, y: 0, z: (dz / d) * v };
    addImpulse(target, kb.x, 0, kb.z);
  }

  const ev = emit(bus, tSec, attacker, target, spec, 'hit', amount, 0, poiseDamage, stagger, launched, kb);
  if (before > 0 && hp.cur <= 0) {
    tfs.move = null; tfs.airSec = 0;
    bus.emit('ko', { actorId: target.id, byId: attacker ? attacker.id : null });
  }
  return ev;
}
