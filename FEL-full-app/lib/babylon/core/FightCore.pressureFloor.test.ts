// RIVAL-PRESSURE-FLOOR: once a RivalFightBrain is in range of a stationary,
// never-blocking foe, it must land its first hit within a per-difficulty
// ceiling (see pressureFloorSec() in FightCore.ts) — easy rivals keep their
// slow mix, they just can't stall forever. Harness mirrors the one in
// RivalCombatBrain.test.ts (RivalCombatBrain over the test MOVES, 3 m start,
// SPEED 5.2, DT 1/60, foe stationary and never blocking, brain built INSIDE
// withRand(seed)) so these numbers are directly comparable to that file's
// baseline-style assertions.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { CHI_MAX, FighterState, KARATE_ATTACKS, pressureFloorSec } from './FightCore';
import { RivalCombatBrain, type RivalMoveSpec } from './RivalCombatBrain';

const MOVES: RivalMoveSpec[] = [
  { id: 'jab', kind: 'jab', range: KARATE_ATTACKS.jab.range },
  { id: 'kick', kind: 'kick', range: KARATE_ATTACKS.kick.range },
  { id: 'heavy', kind: 'heavy', range: KARATE_ATTACKS.heavy.range },
  { id: 'cross', kind: 'jab', range: KARATE_ATTACKS.jab.range },
];

const SPEED = 5.2;
const DT = 1 / 60;
const WINDOW_S = 8; // >= 8s so the 6s floor measured from in-range always fits

function withRand(seed: number, run: () => void): void {
  let s = seed >>> 0;
  const prev = Math.random;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try { run(); } finally { Math.random = prev; }
}

/** Hashed seeds (per the task spec) so attackBias — linear in the seed
 *  under the sequential LCG — actually spreads across its range. */
function hashSeed(i: number): number { return Math.imul(i, 2654435761) >>> 0; }

interface SimResult {
  /** -1 if the rival never entered swing range (dist <= heavy.range) at all. */
  inRangeAt: number;
  /** -1 if no swing ever landed (chosen attack's range >= dist on that frame). */
  hitAt: number;
  firstKind: string | null;
}

function simulate(difficulty: number, startZ: number, frames: number, seed: number): SimResult {
  let inRangeAt = -1;
  let hitAt = -1;
  let firstKind: string | null = null;
  withRand(seed, () => {
    const brain = new RivalCombatBrain({ difficulty, moves: MOVES });
    const self = new Vector3(0, 0, startZ);
    const foe = new Vector3(0, 0, 0);
    const state = new FighterState(100);
    for (let f = 0; f < frames; f++) {
      const d = brain.decide(DT, self, foe, state, false);
      const dist = Vector3.Distance(self, foe);
      if (inRangeAt < 0 && dist <= KARATE_ATTACKS.heavy.range) inRangeAt = f * DT;
      if (d.attackId) {
        const range = MOVES.find((m) => m.id === d.attackId)!.range;
        if (hitAt < 0 && inRangeAt >= 0 && dist <= range) { hitAt = f * DT; firstKind = d.attack; }
      }
      self.x += d.moveX * SPEED * DT;
      self.z += -d.moveY * SPEED * DT;
    }
  });
  return { inRangeAt, hitAt, firstKind };
}

// Use 1000 seeds unless that proves too slow locally; this suite runs in a
// few seconds either way (simulate() is pure arithmetic, no scene/render).
const N_SEEDS = 1000;

describe('pressureFloorSec', () => {
  it('matches the FLOOR_TABLE exactly at its sample points, clamped at both ends', () => {
    expect(pressureFloorSec(0)).toBe(6.0);
    expect(pressureFloorSec(0.2)).toBe(6.0);
    expect(pressureFloorSec(0.4)).toBe(6.0);
    expect(pressureFloorSec(0.55)).toBeCloseTo(4.5);
    expect(pressureFloorSec(0.7)).toBe(3.0);
    expect(pressureFloorSec(0.9)).toBe(3.0);
    expect(pressureFloorSec(1.0)).toBe(3.0);
  });

  it('interpolates linearly between 0.4 and 0.7', () => {
    expect(pressureFloorSec(0.5)).toBeCloseTo(6.0 + (3.0 - 6.0) * ((0.5 - 0.4) / (0.7 - 0.4)));
    expect(pressureFloorSec(0.6)).toBeCloseTo(6.0 + (3.0 - 6.0) * ((0.6 - 0.4) / (0.7 - 0.4)));
  });
});

describe('PRESSURE FLOOR sweep (A)', () => {
  for (const difficulty of [0.2, 0.4, 0.55, 0.7, 0.9, 1.0]) {
    it(`difficulty ${difficulty}: 0 never-hit seeds and every ttfh <= floor`, () => {
      const floor = pressureFloorSec(difficulty);
      let neverHit = 0;
      let maxTtfh = -Infinity;
      for (let i = 1; i <= N_SEEDS; i++) {
        const r = simulate(difficulty, 3, WINDOW_S * 60, i);
        if (r.inRangeAt < 0 || r.hitAt < 0) { neverHit += 1; continue; }
        const ttfh = r.hitAt - r.inRangeAt;
        maxTtfh = Math.max(maxTtfh, ttfh);
      }
      expect(neverHit, `difficulty ${difficulty} never-hit count`).toBe(0);
      expect(maxTtfh, `difficulty ${difficulty} max time-to-first-hit vs floor ${floor}`).toBeLessThanOrEqual(floor + 1e-9);
    });
  }
});

describe('EASY-STAYS-EASY guard (B)', () => {
  // Baseline measured on the unmodified lane tip (cd62df93) with this exact
  // harness, seeds 1..1000, 3 m start, Mini, Oct 4 2026
  // (/tmp/rival-sweep/baseline.txt, independently re-measured in-session
  // against a checked-out copy of cd62df93's FightCore.ts/RivalCombatBrain.ts
  // before any fix was applied):
  //   d=0.2: min ttfh 0.95 s, p50 0.95 s
  //   d=0.4: min ttfh 0.95 s, p50 0.95 s
  // The fix must never make an easy rival's first hit land FASTER than this —
  // it only has to stop the small fraction of seeds that never landed at all.
  const BASELINE: Record<string, { min: number; p50: number }> = {
    '0.2': { min: 0.95, p50: 0.95 },
    '0.4': { min: 0.95, p50: 0.95 },
  };

  for (const difficulty of [0.2, 0.4]) {
    it(`difficulty ${difficulty}: min and p50 time-to-first-hit never drop below baseline`, () => {
      const ttfhs: number[] = [];
      for (let i = 1; i <= N_SEEDS; i++) {
        const r = simulate(difficulty, 3, WINDOW_S * 60, i);
        if (r.inRangeAt < 0 || r.hitAt < 0) continue;
        ttfhs.push(r.hitAt - r.inRangeAt);
      }
      ttfhs.sort((a, b) => a - b);
      const min = ttfhs[0];
      const p50 = ttfhs[Math.round(0.5 * (ttfhs.length - 1))];
      const base = BASELINE[String(difficulty)];
      expect(min, `difficulty ${difficulty} min ttfh`).toBeGreaterThanOrEqual(base.min - 1e-9);
      expect(p50, `difficulty ${difficulty} p50 ttfh`).toBeGreaterThanOrEqual(base.p50 - 1e-9);
    });
  }
});

describe('variety under pressure (C)', () => {
  it('attackBias still spans a wide range across hashed seeds (p10 < 0.15, p90 > 0.85)', () => {
    // attackBias is rolled once in the RivalFightBrain constructor, which is
    // the very first Math.random() call inside withRand() — so it equals
    // the first LCG draw for the seed, independent of anything simulate()
    // does afterward.
    function firstDraw(seed: number): number {
      let s = seed >>> 0;
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    }
    const biases: number[] = [];
    for (let i = 1; i <= N_SEEDS; i++) biases.push(firstDraw(hashSeed(i)));
    biases.sort((a, b) => a - b);
    const p10 = biases[Math.floor(0.1 * (biases.length - 1))];
    const p90 = biases[Math.floor(0.9 * (biases.length - 1))];
    expect(p10).toBeLessThan(0.15);
    expect(p90).toBeGreaterThan(0.85);
  });

  it('at difficulty 0.9, at least 2 distinct attack kinds land their first hit across seeds', () => {
    const kinds = new Set<string>();
    for (let i = 1; i <= 200; i++) {
      const seed = hashSeed(i);
      const r = simulate(0.9, 3, WINDOW_S * 60, seed);
      if (r.firstKind) kinds.add(r.firstKind);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });
});

describe('forced-commit stays inside chi upgrade rules', () => {
  it('still upgrades to heavy once chi is maxed, even mid pressure-floor override', () => {
    // Regression guard: the forced branch special-cases maxed chi the same
    // way the normal attack/punish branches do (selfState.chi >= CHI_MAX ?
    // 'heavy' : ...), so a maxed-chi rival never gets forced onto jab/kick.
    let attack: string | null = null;
    withRand(42, () => {
      const brain = new RivalCombatBrain({ difficulty: 1.0, moves: MOVES });
      const self = new Vector3(0, 0, 1.75); // already inside the swing gate
      const foe = new Vector3(0, 0, 0);
      const state = new FighterState(100);
      state.chi = CHI_MAX;
      for (let f = 0; f < WINDOW_S * 60 && !attack; f++) {
        const d = brain.decide(DT, self, foe, state, false);
        if (d.attack) attack = d.attack;
      }
    });
    expect(attack).toBe('heavy');
  });
});
