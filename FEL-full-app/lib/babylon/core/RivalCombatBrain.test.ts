import { describe, expect, it, afterEach } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { CHI_MAX, FighterState, KARATE_ATTACKS } from './FightCore';
import { RivalCombatBrain, threatLandsIn, type RivalMoveSpec } from './RivalCombatBrain';

const MOVES: RivalMoveSpec[] = [
  { id: 'jab', kind: 'jab', range: KARATE_ATTACKS.jab.range },
  { id: 'kick', kind: 'kick', range: KARATE_ATTACKS.kick.range },
  { id: 'heavy', kind: 'heavy', range: KARATE_ATTACKS.heavy.range },
  { id: 'cross', kind: 'jab', range: KARATE_ATTACKS.jab.range },
];

const SPEED = 5.2;
const DT = 1 / 60;

function withRand(seed: number, run: () => void): void {
  let s = seed >>> 0;
  const prev = Math.random;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try { run(); } finally { Math.random = prev; }
}

function simulate(difficulty: number, startZ: number, frames: number, seed: number) {
  let hitAt = -1;
  let minDist = startZ;
  const ids = new Set<string>();
  let attacks = 0;
  // The brain is built INSIDE the seeded scope: RivalFightBrain rolls its attackBias with
  // Math.random() in the constructor, and building it outside left that roll unseeded (CI flake).
  withRand(seed, () => {
    const brain = new RivalCombatBrain({ difficulty, moves: MOVES });
    const self = new Vector3(0, 0, startZ);
    const foe = new Vector3(0, 0, 0);
    const state = new FighterState(100);
    for (let f = 0; f < frames; f++) {
      const d = brain.decide(DT, self, foe, state, false);
      const dist = Vector3.Distance(self, foe);
      minDist = Math.min(minDist, dist);
      if (d.attackId) {
        attacks += 1;
        ids.add(d.attackId);
        const range = MOVES.find((m) => m.id === d.attackId)!.range;
        if (hitAt < 0 && dist <= range) hitAt = f * DT;
      }
      self.x += d.moveX * SPEED * DT;
      self.z += -d.moveY * SPEED * DT;
    }
  });
  return { hitAt, minDist, ids, attacks };
}

describe('threatLandsIn', () => {
  it('is -1 for a whiff that cannot reach', () => {
    expect(threatLandsIn(3, 1.6, 0.1)).toBe(-1);
    expect(threatLandsIn(1, 1.6, null)).toBe(-1);
    expect(threatLandsIn(1, 1.6, -0.2)).toBe(-1);
  });
  it('returns the time when the swing can connect', () => {
    expect(threatLandsIn(1.2, 1.6, 0.18)).toBeCloseTo(0.18);
  });
});

describe('RivalCombatBrain', () => {
  afterEach(() => { /* Math.random restored inside withRand */ });

  it('lands a hit on a stationary unblocking player inside 6 seconds', () => {
    for (const difficulty of [0.4, 0.7, 0.9]) {
      const r = simulate(difficulty, 3, 6 * 60, 7 + Math.round(difficulty * 10));
      expect(r.hitAt, `difficulty ${difficulty}`).toBeGreaterThanOrEqual(0);
      expect(r.hitAt).toBeLessThan(6);
    }
  });

  it('closes distance before it swings', () => {
    const r = simulate(0.7, 3, 60, 3);
    expect(r.minDist).toBeLessThan(2.4);
  });

  it('uses more than one move from the set', () => {
    const r = simulate(0.9, 1.4, 12 * 60, 11);
    expect(r.ids.size).toBeGreaterThanOrEqual(2);
  });

  it('a harder rival attacks more often once it is in range', () => {
    const easy = simulate(0.4, 1.4, 8 * 60, 5);
    const hard = simulate(0.9, 1.4, 8 * 60, 5);
    expect(hard.attacks).toBeGreaterThan(easy.attacks);
  });

  it('dashes when it is far and the meter can pay', () => {
    const self = new Vector3(0, 0, 8);
    const foe = new Vector3(0, 0, 0);
    const state = new FighterState(100);
    let dashed = false;
    withRand(2, () => {
      const brain = new RivalCombatBrain({ difficulty: 0.7, moves: MOVES });
      for (let f = 0; f < 30 && !dashed; f++) {
        const d = brain.decide(DT, self, foe, state, false, { value: 40, max: CHI_MAX, dashCost: 12, subCost: 25 });
        if (d.spend === 'dash') dashed = true;
      }
    });
    expect(dashed).toBe(true);
  });

  it('spends the ultimate when the meter is full and it is in range', () => {
    const self = new Vector3(0, 0, 1.2);
    const foe = new Vector3(0, 0, 0);
    const state = new FighterState(100);
    state.chi = CHI_MAX;
    let spent = false;
    withRand(9, () => {
      const brain = new RivalCombatBrain({ difficulty: 0.95, moves: MOVES });
      for (let f = 0; f < 180 && !spent; f++) {
        const d = brain.decide(DT, self, foe, state, false, { value: CHI_MAX, max: CHI_MAX, dashCost: 12, subCost: 25 });
        if (d.spend === 'ultimate' && d.attack === 'heavy') spent = true;
      }
    });
    expect(spent).toBe(true);
  });
});
