// RivalCombatBrain — the shared opponent for combat modes (MODES-SHARED-10).
//
// RivalFightBrain already approaches, mixes jab/kick/heavy, and spends a full
// chi bar by upgrading heavy. Duel and Showdown were not calling it: they
// rolled a fresh attack every second and Showdown only swung inside 2 m.
// This wrapper is what those modes (and the dodge read) share. It does not
// change FightCore's guard math — fight-balance tests own that.

import { Vector3 } from '@babylonjs/core';
import {
  CHI_MAX, KARATE_ATTACKS, RivalFightBrain,
  type AttackDef, type FighterState,
} from './FightCore';

export type RivalAttackKind = 'jab' | 'kick' | 'heavy';

export interface RivalMoveSpec {
  id: string;
  kind: RivalAttackKind;
  range: number;
}

/** The meter the rival spends the way the player does: dash, substitution, ultimate. */
export interface RivalResource {
  value: number;
  max: number;
  dashCost: number;
  subCost: number;
}

export interface RivalDecision {
  moveX: number;
  moveY: number;
  attack: RivalAttackKind | null;
  attackId: string | null;
  block: boolean;
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

export class RivalCombatBrain {
  private inner: RivalFightBrain;
  private moves: RivalMoveSpec[];
  private cursor = 0;
  private spendLock = 0;
  /** Furthest committed swing. Dodge reads use this, not a guessed reach. */
  lastRange: number;

  constructor(opts: { difficulty: number; moves?: RivalMoveSpec[] }) {
    this.moves = opts.moves && opts.moves.length ? opts.moves : DEFAULT_MOVES;
    this.inner = new RivalFightBrain(opts.difficulty, attacksFrom(this.moves));
    this.lastRange = Math.max(...this.moves.map((m) => m.range));
  }

  setNerve(aggression: number, mistake: number): void { this.inner.setNerve(aggression, mistake); }
  setRound(round: number): void { this.inner.setRound(round); }

  decide(
    dt: number,
    self: Vector3,
    foe: Vector3,
    fighterState: FighterState,
    foeStriking: boolean,
    resource?: RivalResource,
    incomingSec = -1,
  ): RivalDecision {
    this.spendLock = Math.max(0, this.spendLock - dt);
    const action = this.inner.decide(dt, self, foe, fighterState, foeStriking);
    const to = foe.subtract(self);
    to.y = 0;
    const dist = to.length();

    let attack = action.attack;
    let attackId: string | null = null;
    let spend: RivalDecision['spend'] = null;

    const canSpend = !!resource && this.spendLock <= 0;
    if (canSpend && resource && incomingSec >= 0 && incomingSec < 0.35 && dist <= this.lastRange + 0.4 && resource.value >= resource.subCost) {
      spend = 'substitution';
      attack = null;
      this.spendLock = 1.6;
    } else if (canSpend && resource && !action.attack && !action.block && dist > this.lastRange + 1.2 && resource.value >= resource.dashCost) {
      spend = 'dash';
      this.spendLock = 1.2;
    } else if (attack) {
      if (resource && resource.value >= resource.max && dist <= this.lastRange + 0.15) {
        spend = 'ultimate';
        attack = 'heavy';
        this.spendLock = 1.4;
      }
      attackId = this.pickId(attack);
      const spec = this.moves.find((m) => m.id === attackId);
      if (spec) this.lastRange = spec.range;
    }

    return { moveX: action.moveX, moveY: action.moveY, attack, attackId, block: action.block, spend };
  }

  private pickId(kind: RivalAttackKind): string {
    const pool = this.moves.filter((m) => m.kind === kind);
    const use = pool.length ? pool : this.moves;
    const id = use[this.cursor % use.length].id;
    this.cursor += 1;
    return id;
  }
}

/** Chi bar the duel rival spends. Showdown passes its chakra meter instead. */
export function chiResource(chi: number, dashCost: number, subCost: number): RivalResource {
  return { value: chi, max: CHI_MAX, dashCost, subCost };
}
