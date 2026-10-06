/**
 * The monster brain: NeoCombatCore's EnemyBrain shape (pursue → WIND-UP → STRIKE, landing on its contact beat →
 * RECOVER → pursue), generalised so each attack carries its own tell, and MobSteering's pursuit (lead the target's
 * motion, a flanking bias, a reaction beat before the chase starts).
 *
 * It decides; it does not move. Its output is a `MoveInput` (A1 moves the body from it, like any other actor's
 * input) and a 'land' event the combat system resolves into a hit. Deterministic: the only randomness is the attack
 * pick, from the seeded `rng` the system passes in.
 *
 * Attack tokens: at most `ATTACK_TOKENS` monsters wind up on one target at once (NeoCombatCore.maxAttackers): a horde
 * pressures; it does not instant-mob. A boss ignores the tokens.
 */

import { STEERING_PRESETS } from '@/lib/babylon/core/MobSteering';
import { maxAttackers } from '@/lib/babylon/core/NeoCombatCore';
import type { ActorId, AdventureActor, AdventureWorld, MoveInput } from '../../contracts';
import { isHostile } from '../lock';
import { stickFor, type MonsterAttack, type MonsterDef } from './defs';

/** How many monsters may wind up on one target at once: NeoCombatCore's ceiling at its third wave (3). [TUNE] */
export const ATTACK_TOKENS = maxAttackers(3);

/** How often a monster looks for a better target while it has one. [TUNE] */
export const RETARGET_SEC = 0.3;

export type BrainPhase = 'idle' | 'pursue' | 'windup' | 'strike' | 'recover' | 'retreat';
export type BrainEvent = 'windup' | 'strike' | 'land' | null;

/** Who holds an attack token on whom. One per system. */
export class AttackTokens {
  private readonly held = new Map<ActorId, number>();
  take(targetId: ActorId, cap = ATTACK_TOKENS): boolean {
    const n = this.held.get(targetId) ?? 0;
    if (n >= cap) return false;
    this.held.set(targetId, n + 1);
    return true;
  }
  give(targetId: ActorId): void {
    const n = this.held.get(targetId) ?? 0;
    if (n <= 1) this.held.delete(targetId); else this.held.set(targetId, n - 1);
  }
  count(targetId: ActorId): number { return this.held.get(targetId) ?? 0; }
}

type BrainDef = Pick<MonsterDef, 'steering' | 'aggroM' | 'keepAwayM' | 'retreatSec' | 'hoverM'>;

export class MonsterBrain {
  phase: BrainPhase = 'idle';
  /** Seconds in the phase. */
  t = 0;
  attack: MonsterAttack | null = null;
  targetId: ActorId | null = null;
  /** The committed line of the swing (unit XZ), fixed when the strike starts: a sidestep after it moves off it. */
  lineX = 0;
  lineZ = 1;
  /** Set by a boss phase change: the next attack, whatever the range. */
  forced: MonsterAttack | null = null;
  /** The current attack table (a boss swaps it per phase). */
  attacks: readonly MonsterAttack[];
  speedMult = 1;
  /** Bosses ignore attack tokens. */
  usesTokens = true;
  private landed = false;
  private hasToken = false;
  private reactionLeft = 0;
  /** Seconds until the target is re-picked (a valid target is kept between picks: no spatial query every tick). */
  private retargetSec = 0;
  private readonly side: 1 | -1;

  constructor(private readonly def: BrainDef, attacks: readonly MonsterAttack[], private readonly rng: () => number, seedSide = 1) {
    this.attacks = attacks;
    this.side = seedSide >= 0 ? 1 : -1;
  }

  get attacking(): boolean { return this.phase === 'windup' || this.phase === 'strike'; }

  /** Seconds until the current swing lands (Infinity when none is coming): the perfect-dodge read. */
  get secToLand(): number {
    if (!this.attack) return Infinity;
    if (this.phase === 'windup') return Math.max(0, this.attack.tellSec - this.t) + this.attack.landAt;
    if (this.phase === 'strike' && !this.landed) return Math.max(0, this.attack.landAt - this.t);
    return Infinity;
  }

  /** A stagger or a phase change: whatever it was doing stops (EnemyBrain.interrupt). */
  interrupt(tokens: AttackTokens): void {
    this.releaseToken(tokens);
    this.phase = this.targetId ? 'pursue' : 'idle';
    this.t = 0; this.landed = false; this.attack = null;
  }

  private releaseToken(tokens: AttackTokens): void {
    if (this.hasToken && this.targetId) tokens.give(this.targetId);
    this.hasToken = false;
  }

  private pickTarget(self: AdventureActor, world: AdventureWorld): AdventureActor | null {
    const cur = this.targetId ? world.actors.get(this.targetId) : undefined;
    const keep = !!cur && isHostile(self, cur) && dist2(self, cur) <= (this.def.aggroM * 1.5) ** 2;
    if (keep && this.retargetSec > 0) return cur!;
    this.retargetSec = RETARGET_SEC;
    if (keep) return cur!;
    let best: AdventureActor | null = null, bestD = this.def.aggroM * this.def.aggroM;
    for (const o of world.near(self.pos, this.def.aggroM)) {
      if (!isHostile(self, o) || o.kind === 'monster' || o.kind === 'boss') continue;
      const d = dist2(self, o);
      if (d <= bestD) { bestD = d; best = o; }
    }
    return best;
  }

  private pickAttack(dist: number): MonsterAttack | null {
    let total = 0;
    for (const a of this.attacks) if (inReach(a, dist)) total += a.weight;
    if (total <= 0) return null;
    let r = this.rng() * total;
    for (const a of this.attacks) {
      if (!inReach(a, dist)) continue;
      r -= a.weight;
      if (r <= 0) return a;
    }
    return null;
  }

  /**
   * One step on the monster's own (time-scaled) seconds. Writes the movement intent into `out` (camYaw 0: the stick
   * is world XZ) and returns the swing's beat.
   */
  step(self: AdventureActor, world: AdventureWorld, dt: number, out: MoveInput, tokens: AttackTokens): BrainEvent {
    out.move.x = 0; out.move.y = 0; out.camYaw = 0; out.ascendHeld = false; out.descendHeld = false;
    if (self.stats.hp.cur <= 0) { this.interrupt(tokens); return null; }
    if (self.stunSec > 0) { if (this.phase !== 'idle' && this.phase !== 'pursue') this.interrupt(tokens); return null; }

    const target = this.pickTarget(self, world);
    if (!target) {
      this.interrupt(tokens);
      this.targetId = null; this.phase = 'idle';
      return null;
    }
    if (target.id !== this.targetId) {
      this.releaseToken(tokens);
      this.targetId = target.id;
      if (this.phase === 'idle') { this.phase = 'pursue'; this.reactionLeft = STEERING_PRESETS[this.def.steering].reactionSec ?? 0; }
    }
    const dx = target.pos.x - self.pos.x, dz = target.pos.z - self.pos.z;
    const dist = Math.hypot(dx, dz);
    const ux = dist > 1e-6 ? dx / dist : 0, uz = dist > 1e-6 ? dz / dist : 1;
    if (this.def.hoverM > 0) out.ascendHeld = self.pos.y < this.def.hoverM && this.phase !== 'strike';

    this.t += dt;
    this.retargetSec -= dt;
    switch (this.phase) {
      case 'idle':
      case 'pursue': {
        if (this.reactionLeft > 0) { this.reactionLeft -= dt; return null; }
        const a = this.forced ?? this.pickAttack(dist);
        // Ask for a token only with a swing in hand: a token taken on a miss would never be given back.
        const tokenOk = !!a && (!this.usesTokens || this.hasToken || tokens.take(target.id));
        if (a && tokenOk) {
          this.hasToken = this.usesTokens;
          this.forced = null;
          this.attack = a; this.phase = 'windup'; this.t = 0; this.landed = false;
          this.lineX = ux; this.lineZ = uz;
          return 'windup';
        }
        this.steer(self, target, dist, ux, uz, out);
        return null;
      }
      case 'windup': {
        const a = this.attack!;
        this.lineX = ux; this.lineZ = uz;            // the tell tracks; the strike commits
        if (a.kind === 'dive') out.descendHeld = true;
        if (this.t >= a.tellSec) { this.phase = 'strike'; this.t = 0; return 'strike'; }
        return null;
      }
      case 'strike': {
        const a = this.attack!;
        if (!this.landed && this.t >= a.landAt) { this.landed = true; return 'land'; }
        if (this.t >= a.strikeSec) { this.phase = 'recover'; this.t = 0; }
        return null;
      }
      case 'recover': {
        if (this.t >= this.attack!.recoverSec) {
          this.releaseToken(tokens);
          this.phase = this.def.retreatSec > 0 ? 'retreat' : 'pursue';
          this.t = 0; this.attack = null;
        }
        return null;
      }
      case 'retreat': {
        out.move.x = -ux * this.stickOf(self); out.move.y = -uz * this.stickOf(self);
        if (this.t >= this.def.retreatSec) { this.phase = 'pursue'; this.t = 0; }
        return null;
      }
    }
  }

  /** MobSteering's pursuit: lead the target, flank by the preset's bias, hold a caster's distance. */
  /**
   * The stick for the preset's speed. Contracts v2: with `maxSpeed` on the body (written by the combat system from the
   * preset) A1 runs a full stick at exactly that speed, so the stick is full; without it, the v1 estimate (stickFor).
   */
  private stickOf(self: AdventureActor): number {
    return self.maxSpeed !== undefined && self.maxSpeed > 0 ? 1 : stickFor(this.def, this.speedMult);
  }

  /** The preset's top speed for this body, m/s (the combat system writes it to `maxSpeed`). */
  presetSpeed(): number { return STEERING_PRESETS[this.def.steering].maxSpeed * this.speedMult; }

  private steer(self: AdventureActor, target: AdventureActor, dist: number, ux: number, uz: number, out: MoveInput): void {
    const cfg = STEERING_PRESETS[this.def.steering];
    const mag = this.stickOf(self);
    if (this.def.keepAwayM > 0) {
      const k = this.def.keepAwayM;
      const away = dist < k * 0.75 ? -1 : dist > k * 1.1 ? 1 : 0;
      // too close: back off; too far: close in; in the band: strafe round the target
      out.move.x = (away !== 0 ? ux * away : -uz * this.side) * mag;
      out.move.y = (away !== 0 ? uz * away : ux * this.side) * mag;
      return;
    }
    const lead = Math.min(0.6, dist / Math.max(0.1, cfg.maxSpeed));
    let wx = target.pos.x + target.vel.x * lead - self.pos.x;
    let wz = target.pos.z + target.vel.z * lead - self.pos.z;
    // Flank: bend the approach sideways by the containment bias, fading as it closes (it arrives from an angle).
    const bend = cfg.containmentBias * Math.min(1, dist / 4) * this.side;
    wx += -uz * bend * dist; wz += ux * bend * dist;
    const l = Math.hypot(wx, wz);
    if (l < 1e-6) return;
    // Arrive: ease off inside the first attack's reach instead of running through the target.
    const reach = this.attacks[0]?.range ?? 1.5;
    const ease = dist < reach * 0.8 ? 0 : 1;
    out.move.x = (wx / l) * mag * ease;
    out.move.y = (wz / l) * mag * ease;
  }
}

function inReach(a: MonsterAttack, dist: number): boolean {
  if (a.kind === 'projectile') return dist <= a.range && dist >= 3;
  if (a.kind === 'nova') return dist <= a.range;
  return dist <= a.range * 0.9;
}

const dist2 = (a: AdventureActor, b: AdventureActor): number => (a.pos.x - b.pos.x) ** 2 + (a.pos.z - b.pos.z) ** 2;
