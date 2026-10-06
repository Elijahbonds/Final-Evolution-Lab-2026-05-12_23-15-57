/**
 * A2's private per-actor bookkeeping: the timers and machines behind the fields A2 owns on `AdventureActor`
 * (hp, poise, stamina, lock, stunSec, iframeSec, impulse).
 *
 * WHY A WEAKMAP KEYED BY THE ACTOR. The combat system and the magic system are two `AdventureSystem`s (the plan hands
 * A4 both), but a hit from either must see the other's state: a strike lands on a barrier the magic system raised, a
 * spell lands on a guard the combat system is holding. Keying by the actor object lets both find one record without a
 * shared singleton (a test's actors are garbage, and so is their state) and without a field on the frozen contract.
 * Created once per actor, never per tick: the hot path allocates nothing.
 */

import type { ActorId, AdventureActor, Element, Vec3 } from '../contracts';
import { StringBook, StrikeQueue } from '@/lib/babylon/core/HordeDynamics';
import { XButtonReader } from '@/lib/babylon/core/StormCombat';
import { SlowMoLatch } from '@/lib/babylon/core/NeoCombatCore';
import type { RouteStrike } from '@/lib/babylon/core/FighterStyle';
import type { AdventureMove } from './strings';

/** Light enough to lift with telekinesis, or not (plan: "telekinesis lifting and throwing a light enemy"). */
export type WeightClass = 'light' | 'medium' | 'heavy';

/** Why an actor is invulnerable right now: a dodge read pays 'dodged', anything else 'iframe' (DAMAGE_OUTCOMES). */
export type IframeCause = 'dodge' | 'phase' | 'other';

export class FightState {
  /** The actor's own clock, seconds: advances by dt × its time scale (slow-time slows the world, not the caster). */
  localSec = 0;

  // ── stamina and poise ──
  staminaIdleSec = 99;
  poiseIdleSec = 99;

  // ── guard / parry ──
  guardWasHeld = false;
  /** Local time of the last guard press (the parry window is measured from it on the defender's clock). */
  guardPressSec = -1e9;
  /** Seconds left of a riposte window after a parry or a perfect dodge. */
  counterSec = 0;

  // ── dodge / dash ──
  iframeCause: IframeCause = 'other';
  rollSec = 0;
  rollCooldownSec = 0;
  rollDirX = 0;
  rollDirZ = 1;
  /** Seconds left of the homing dash to the lock, and its target. */
  homingSec = 0;
  homingTarget: ActorId | null = null;
  readonly xButton = new XButtonReader();
  dashWasHeld = false;
  /**
   * Seconds until the nearest strike already thrown at this actor lands, as of the previous tick (Infinity = nothing
   * coming). The perfect-dodge read (DodgeRead) asks this at the moment the dodge starts.
   */
  incomingSec = Infinity;
  incomingNext = Infinity;
  /** How many perfect dodges this actor has made (for tests and the HUD). */
  perfectDodges = 0;
  /** NeoCombatCore's latch: a perfect dodge's slow-mo beat fires once per moment, never back to back. */
  readonly slowMo = new SlowMoLatch();

  // ── substitution (DefenseSystem) ──
  subArmedSec = 0;
  subCooldownSec = 0;
  subVulnerableSec = 0;
  /** Where the last substitution put the actor; `subPending` until the host applies it (contract request: a warp). */
  readonly subSpot: Vec3 = { x: 0, y: 0, z: 0 };
  subPending = false;

  // ── strings ──
  readonly book = new StringBook();
  readonly queue = new StrikeQueue();
  /** The swing in progress, its clock, and whether its hit has been checked. */
  move: AdventureMove | null = null;
  moveT = 0;
  moveHitDone = false;
  /** The target the swing is aimed at (the lock, or the soft-lock pick at the press). */
  moveTarget: ActorId | null = null;
  /** Landed strikes for FighterStyle's routes, newest last (at most 3: the longest route). */
  readonly landed: RouteStrike[] = [];
  combo = 0;
  comboSec = 0;
  /** Seconds since a dash or homing dash ended inside which a strike is the dash attack (HordeDynamics). */
  afterDashSec = 0;
  /** Seconds a movement-owning verb (roll, homing dash, lunge) holds the body. Contract request: A1 reads it. */
  moveLockSec = 0;

  // ── being juggled ──
  airSec = 0;
  airLinks = 0;

  // ── lock upkeep ──
  lockLostSec = 0;
  lookXWas = 0;

  // ── classification ──
  weight: WeightClass = 'medium';
  /** Bosses and armoured monsters do not flinch until their poise breaks. */
  hyperArmor = false;
  /**
   * The element this body defends (and a monster strikes) with, when A2 decides it: a boss phase can change it. Undefined
   * = the actor's own `stats.element` (A3's field, never written here).
   */
  element: Element | null | undefined = undefined;

  // ── magic (written by the magic system, read by damage) ──
  barrierHp = 0;
  barrierSec = 0;
  foresightSec = 0;
  /** Held by someone's telekinesis: the holder's id. */
  heldBy: ActorId | null = null;
  /** Thrown by telekinesis: seconds of flight left, the thrower, and who it has already hit. */
  thrownSec = 0;
  thrownBy: ActorId | null = null;
  thrownPower = 0;
  readonly thrownHit = new Set<ActorId>();
  readonly thrownPrev: Vec3 = { x: 0, y: 0, z: 0 };
}

const states = new WeakMap<AdventureActor, FightState>();

/** The record for `actor`, made on first use. */
export function fightStateOf(actor: AdventureActor): FightState {
  let s = states.get(actor);
  if (!s) {
    s = new FightState();
    if (actor.kind === 'boss') { s.weight = 'heavy'; s.hyperArmor = true; }
    states.set(actor, s);
  }
  return s;
}

/** The element `actor` defends with right now (a boss phase's, else its own). */
export function elementOf(actor: AdventureActor): Element | null {
  const s = states.get(actor);
  return s && s.element !== undefined ? s.element : actor.stats.element;
}

/** True when `actor` already has a record (tests use it to prove a system never touched an actor). */
export function hasFightState(actor: AdventureActor): boolean { return states.has(actor); }
