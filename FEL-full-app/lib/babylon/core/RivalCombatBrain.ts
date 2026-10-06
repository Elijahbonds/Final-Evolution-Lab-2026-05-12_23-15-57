// RivalCombatBrain — the shared opponent for combat modes (MODES-SHARED-10).
//
// RivalFightBrain already approaches, mixes jab/kick/heavy, and spends a full
// chi bar by upgrading heavy. Duel and Showdown were not calling it: they
// rolled a fresh attack every second and Showdown only swung inside 2 m.
// This wrapper is what those modes (and the dodge read) share. It does not
// change FightCore's guard math — fight-balance tests own that.
//
// IMPROVE (2026-10-06), the shared combat stack pass:
//   • the substitution is a READ now (one skill-and-nerve roll per incoming swing), not a reflex that fired on every
//     threat it could afford, and it respects the defender's cooldown when the mode passes `subReady`;
//   • the move inside a kind is a weighted pick that never repeats the last move, instead of one round-robin cursor
//     shared by every kind (which made the order readable);
//   • spacing (dash, ultimate) reads the rival's REACH — its longest move — not the range of whatever it threw last;
//   • a guard read can be a parry or, on a skilled rival, a guard impact (`guard` on the decision);
//   • the difficulty, the special licence, the arena edge and the standing are setters;
//   • no allocation per frame.

import type { Vector3 } from '@babylonjs/core';
import {
  CHI_MAX, KARATE_ATTACKS, RivalFightBrain,
  type AttackDef, type FighterState, type GuardIntent,
} from './FightCore';
import type { NerveShift } from './Nerve';

export type RivalAttackKind = 'jab' | 'kick' | 'heavy';

export interface RivalMoveSpec {
  id: string;
  kind: RivalAttackKind;
  range: number;
  /** IMPROVE (2026-10-06): how often this move is picked inside its kind, relative to its siblings. Default 1. */
  weight?: number;
}

/** The meter the rival spends the way the player does: dash, substitution, ultimate. */
export interface RivalResource {
  value: number;
  max: number;
  dashCost: number;
  subCost: number;
  /** IMPROVE (2026-10-06): the defender's own substitution cooldown (DefenseController.canSubstitute). Absent = ready. */
  subReady?: boolean;
}

export interface RivalDecision {
  moveX: number;
  moveY: number;
  attack: RivalAttackKind | null;
  attackId: string | null;
  block: boolean;
  /** IMPROVE (2026-10-06): when `block`, what the guard is — stamp the press with FightCore.guardPressMs. */
  guard: GuardIntent | null;
  spend: null | 'dash' | 'ultimate' | 'substitution';
}

/**
 * Seconds until an incoming strike connects, or -1 when nothing is coming
 * or the swing cannot reach. A whiff that is already out of range is not a
 * dodge read.
 */
export function threatLandsIn(dist: number, range: number, secToImpact: number | null): number {
  if (secToImpact == null || !Number.isFinite(secToImpact) || secToImpact < 0) return -1;
  if (!(range > 0) || dist > range) return -1;
  return secToImpact;
}

function attacksFrom(moves: RivalMoveSpec[]): Record<RivalAttackKind, AttackDef> {
  const pick = (kind: RivalAttackKind, fallback: AttackDef): AttackDef => {
    const found = moves.filter((m) => m.kind === kind);
    const range = found.length ? Math.max(...found.map((m) => m.range)) : fallback.range;
    return { ...fallback, range };
  };
  return {
    jab: pick('jab', KARATE_ATTACKS.jab),
    kick: pick('kick', KARATE_ATTACKS.kick),
    heavy: pick('heavy', KARATE_ATTACKS.heavy),
  };
}

const DEFAULT_MOVES: RivalMoveSpec[] = [
  { id: 'jab', kind: 'jab', range: KARATE_ATTACKS.jab.range },
  { id: 'kick', kind: 'kick', range: KARATE_ATTACKS.kick.range },
  { id: 'heavy', kind: 'heavy', range: KARATE_ATTACKS.heavy.range },
];

/** IMPROVE (2026-10-06), TUNED: the chance the rival reads an incoming swing as a substitution, once per swing:
 *  `SUB_READ_PER_SKILL × difficulty ÷ nerve's mistake`, capped. 0.72 → 36 %. It was 100 % of every affordable threat. */
export const SUB_READ_PER_SKILL = 0.5;
export const SUB_READ_CAP = 0.6;
/** The threat must land inside this many seconds for a substitution to be on (unchanged). */
export const SUB_THREAT_SEC = 0.35;
/** IMPROVE (2026-10-06), TUNED: a skilled rival (difficulty ≥ IMPACT_MIN_SKILL) turns this share of its PARRY reads
 *  into a guard impact — the Soul Calibur read. DefenseSystem modes only (the karate modes have no impact). */
export const IMPACT_MIN_SKILL = 0.65;
export const IMPACT_SHARE = 0.35;

export class RivalCombatBrain {
  private inner: RivalFightBrain;
  private moves: RivalMoveSpec[];
  private readonly byKind: Record<RivalAttackKind, RivalMoveSpec[]>;
  /** The move each kind threw last — the pick never repeats it while the kind has another. */
  private readonly lastOf: Partial<Record<RivalAttackKind, string>> = {};
  private spendLock = 0;
  private difficulty: number;
  private mistake = 1;
  private rng: () => number;
  /** The threat in flight has been read (rolled) already — one substitution read per swing. */
  private threatRead = false;
  /** The guard in progress has been read (impact or not) already. */
  private guardRead = false;
  private guardNow: GuardIntent | null = null;
  private readonly out: RivalDecision = { moveX: 0, moveY: 0, attack: null, attackId: null, block: false, guard: null, spend: null };
  /** The rival's REACH: its longest move. Spacing (dash, substitution) reads this. */
  readonly reach: number;
  /** The range of the last committed swing (informational; spacing no longer reads it). */
  lastRange: number;

  constructor(opts: { difficulty: number; moves?: RivalMoveSpec[]; canSpecial?: boolean; rng?: () => number }) {
    this.moves = opts.moves && opts.moves.length ? opts.moves : DEFAULT_MOVES;
    this.inner = new RivalFightBrain(opts.difficulty, attacksFrom(this.moves));
    this.difficulty = opts.difficulty;
    this.rng = opts.rng ?? (() => Math.random());
    if (opts.canSpecial !== undefined) this.inner.setCanSpecial(opts.canSpecial);
    this.byKind = {
      jab: this.moves.filter((m) => m.kind === 'jab'),
      kick: this.moves.filter((m) => m.kind === 'kick'),
      heavy: this.moves.filter((m) => m.kind === 'heavy'),
    };
    this.reach = Math.max(...this.moves.map((m) => m.range));
    this.lastRange = this.reach;
  }

  setNerve(aggression: number, mistake: number): void {
    this.inner.setNerve(aggression, mistake);
    if (Number.isFinite(mistake)) this.mistake = Math.max(0.5, Math.min(2, mistake));
  }
  setRound(round: number): void { this.inner.setRound(round); }
  /** IMPROVE (2026-10-06): see RivalFightBrain.setDifficulty. */
  setDifficulty(d: number): void {
    this.inner.setDifficulty(d);
    this.difficulty = this.inner.skill;
  }
  get skill(): number { return this.difficulty; }
  setCanSpecial(ok: boolean): void { this.inner.setCanSpecial(ok); }
  setEdge(edgeIn: ((x: number, z: number) => number) | null): void { this.inner.setEdge(edgeIn); }
  /** IMPROVE (2026-10-06): NERVE at round start, memoised — see RivalFightBrain.setStanding. */
  setStanding(rivalWins: number, playerWins: number, toWin: number): NerveShift {
    const s = this.inner.setStanding(rivalWins, playerWins, toWin);
    this.mistake = Math.max(0.5, Math.min(2, s.mistake));
    return s;
  }

  /** `foeOpen` (IMPROVE 2026-10-06): the player is punishable — in a swing's recovery, a dash or a roll. */
  decide(
    dt: number,
    self: Pick<Vector3, 'x' | 'z'>,
    foe: Pick<Vector3, 'x' | 'z'>,
    fighterState: FighterState,
    foeStriking: boolean,
    resource?: RivalResource,
    incomingSec = -1,
    foeOpen = false,
  ): RivalDecision {
    this.spendLock = Math.max(0, this.spendLock - dt);
    const action = this.inner.decide(dt, self, foe, fighterState, foeStriking, foeOpen);
    const dist = Math.hypot(foe.x - self.x, foe.z - self.z);

    let attack = action.attack;
    let attackId: string | null = null;
    let spend: RivalDecision['spend'] = null;

    // one substitution read per swing: the latch clears when nothing is incoming
    const threat = incomingSec >= 0 && incomingSec < SUB_THREAT_SEC;
    if (incomingSec < 0) this.threatRead = false;

    const canSpend = !!resource && this.spendLock <= 0;
    const canSub = canSpend && !!resource && threat && !this.threatRead && resource.subReady !== false
      && dist <= this.reach + 0.4 && resource.value >= resource.subCost;
    let subbed = false;
    if (canSub) {
      this.threatRead = true;
      const chance = Math.min(SUB_READ_CAP, (this.difficulty * SUB_READ_PER_SKILL) / this.mistake);
      subbed = this.rng() < chance;
    }
    if (subbed) {
      spend = 'substitution';
      attack = null;
      this.spendLock = 1.6;
    } else if (canSpend && resource && !action.attack && !action.block && dist > this.reach + 1.2 && resource.value >= resource.dashCost) {
      spend = 'dash';
      this.spendLock = 1.2;
    } else if (attack) {
      // the ultimate is a heavy: it is spent when the HEAVY reaches, whatever the last swing was
      if (resource && resource.value >= resource.max && dist <= this.reachOf('heavy') + 0.15) {
        spend = 'ultimate';
        attack = 'heavy';
        this.spendLock = 1.4;
      }
      attackId = this.pickId(attack);
      const spec = this.moves.find((m) => m.id === attackId);
      if (spec) this.lastRange = spec.range;
    }

    // the guard: the inner brain's read, with a skilled rival turning some of its parries into guard impacts
    if (!action.block) { this.guardRead = false; this.guardNow = null; }
    else if (!this.guardRead) {
      this.guardRead = true;
      const g = action.guard ?? 'block';
      this.guardNow = g === 'parry' && this.difficulty >= IMPACT_MIN_SKILL && this.rng() < IMPACT_SHARE ? 'impact' : g;
    }

    const o = this.out;
    o.moveX = action.moveX; o.moveY = action.moveY; o.attack = attack; o.attackId = attackId;
    o.block = action.block; o.guard = action.block ? this.guardNow : null; o.spend = spend;
    return o;
  }

  private reachOf(kind: RivalAttackKind): number {
    const pool = this.byKind[kind];
    return pool.length ? Math.max(...pool.map((m) => m.range)) : this.reach;
  }

  /** Weighted pick inside the kind, never the move that kind threw last when the kind has another. */
  private pickId(kind: RivalAttackKind): string {
    const pool = this.byKind[kind].length ? this.byKind[kind] : this.moves;
    if (pool.length === 1) return pool[0].id;
    const last = this.lastOf[kind];
    let total = 0;
    for (const m of pool) if (m.id !== last) total += Math.max(0, m.weight ?? 1);
    let chosen = pool.find((m) => m.id !== last) ?? pool[0];
    if (total > 0) {
      let r = this.rng() * total;
      for (const m of pool) {
        if (m.id === last) continue;
        r -= Math.max(0, m.weight ?? 1);
        if (r < 0) { chosen = m; break; }
      }
    }
    this.lastOf[kind] = chosen.id;
    return chosen.id;
  }
}

/** Chi bar the duel rival spends. Showdown passes its chakra meter instead. */
export function chiResource(chi: number, dashCost: number, subCost: number, subReady?: boolean): RivalResource {
  return { value: chi, max: CHI_MAX, dashCost, subCost, subReady };
}
