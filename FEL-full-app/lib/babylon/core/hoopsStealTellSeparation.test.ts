// T-A STEAL-TELL (step 4) + T-C HOOPS-BODY-SEPARATION (HOOPS-1V1-3V3-CLAUDE-TIPS-08486062): K-ST1, K-ST2, K-ST3, K-BS1, K-BS2,
// K-BS3, the 1v1 capsule radius as ONE [TUNE] constant, and the AI-steal reach at BODY_STANDOFF measured (not tuned around).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import {
  BODY_HARD_GAP, BODY_STANDOFF, DefenderBrain, SEP_DEADBAND, SEP_POP_MAX, SEP_PUSH_MPS, STEAL_RATE_PER_SEC, separateBodies,
} from './BasketballCore';
import {
  AI_REACH_COOLDOWN_SEC, AI_REACH_GATE, AI_REACH_STUN_SEC, AI_REACH_TELL_SEC, AI_STEAL_CHANCE, AI_STEAL_ON_BUMP, resolveAiReach, type AiReach,
} from './HoopsDefense';
import { resolveBodyContact } from './HoopsMoves';

const ONE = readFileSync(join(__dirname, '../modes/OneVOneMode.ts'), 'utf8');
const THREE = readFileSync(join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');

/** mulberry32: a plain LCG's consecutive draws are correlated enough to skew a rate by ~13 % on one seed (measured). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const HOOP = new Vector3(0, 0, 0);

/** Steal intents per second for a defender held still at `self`, the handler (and ball) still at `handler`. */
function stealRate(aggr: number, dt: number, self: Vector3, handler: Vector3, sec = 600, seed = 7): number {
  const brain = new DefenderBrain(aggr, null, seeded(seed));
  let n = 0;
  const frames = Math.round(sec / dt);
  for (let i = 0; i < frames; i++) if (brain.decide(dt, self, handler, HOOP, [], [handler]).steal) n += 1;
  return n / sec;
}

describe('K-ST1: the AI poke is a per-second rate (aggression × 1.2 /s at 30, 60 and 144 fps)', () => {
  // the deny point of a standing handler sits at arm's length toward the rim: hold the defender ON it (dist ≈ 0 < 1.1)
  const handler = new Vector3(0, 0, 6);
  const self = new Vector3(0, 0, 6 - DefenderBrain.ARMS_LENGTH);
  for (const a of [0.45, 0.5, 0.55, 0.65, 0.7, 0.85]) {
    it(`aggression ${a}`, () => {
      for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
        // 5 seeds × 600 s: one 600 s run at aggression 0.5 is ~360 events (σ ≈ 5 %), so a ±10 % bar on ONE seed fails ~5 % of
        // the 18 cells by chance (measured: a 2σ cell). The bar stays ±10 %; the sample is what makes it a test of the rate.
        const r = [1, 2, 3, 4, 5].reduce((m, sd) => m + stealRate(a, dt, self, handler, 600, sd), 0) / 5;
        expect(Math.abs(r - a * STEAL_RATE_PER_SEC) / (a * STEAL_RATE_PER_SEC)).toBeLessThanOrEqual(0.10);
      }
    });
  }
});

describe('MEASURED, flagged (not tuned): does the AI poke still open with the bodies held at BODY_STANDOFF?', () => {
  // The 0.55 capsule makes Havok hold 1.10 m like the kinematic path already does. The poke gate is `dist < 1.1` to the
  // DENY POINT (not the handler), so it only opens where the deny point lands inside 1.1 m of a defender standing 1.10 m off.
  it('a standing handler: the deny point is arm\'s length off him, so a defender at the standoff can poke', () => {
    const handler = new Vector3(0, 0, 6);
    const self = new Vector3(0, 0, 6 - BODY_STANDOFF);
    const r = [1, 2, 3, 4, 5].reduce((m, sd) => m + stealRate(0.7, 1 / 60, self, handler, 600, sd), 0) / 5;
    console.info(`[K-ST-MEASURE] standing handler, defender at ${BODY_STANDOFF} m: ${r.toFixed(3)} steal intents/s (expected ${(0.7 * STEAL_RATE_PER_SEC).toFixed(2)})`);
    expect(r).toBeGreaterThan(0);
  });
  it('a moving handler: reported (the contain lever drops the deny point toward the rim)', () => {
    const brain = new DefenderBrain(0.7, null, seeded(3));
    const self = new Vector3(0, 0, 6 - BODY_STANDOFF);
    let n = 0; const dt = 1 / 60, sec = 600;
    for (let i = 0; i < sec / dt; i++) {
      const x = Math.sin(i * dt * 3) * 0.05;   // a handler swaying ~3 m/s at the standoff
      const h = new Vector3(x * 20, 0, 6);
      if (brain.decide(dt, new Vector3(h.x, 0, self.z), h, HOOP, [], [h]).steal) n += 1;
    }
    console.info(`[K-ST-MEASURE] moving handler at the standoff: ${(n / sec).toFixed(3)} steal intents/s`);
    expect(Number.isFinite(n)).toBe(true);
  });
});

describe('K-ST2: resolveAiReach', () => {
  const base = (o: Partial<AiReach> = {}): AiReach => ({
    tellSec: AI_REACH_TELL_SEC, eligible: true, inRange: true, movedDuringTell: false, exposed: false, onHim: false,
    carrierSpeed: 0, foulSpeed: 1.6, roll: seeded(1), ...o,
  });
  it('a reach before the tell throws (never a strip)', () => {
    expect(() => resolveAiReach(base({ tellSec: AI_REACH_TELL_SEC - 0.01 }))).toThrow();
  });
  it('moved during the tell, out of range or not eligible: never a strip over 1,000 rolls', () => {
    for (const o of [{ movedDuringTell: true }, { inRange: false }, { eligible: false }]) {
      const roll = seeded(9);
      for (let i = 0; i < 1000; i++) expect(resolveAiReach(base({ ...o, roll }))).not.toBe('strip');
    }
  });
  it('exposed vs not: strip rate 0.60 / 0.22 ± 0.03 over 10,000 rolls', () => {
    for (const [exposed, want] of [[true, 0.6], [false, 0.22]] as const) {
      const roll = seeded(11); let n = 0;
      for (let i = 0; i < 10000; i++) if (resolveAiReach(base({ exposed, roll })) === 'strip') n += 1;
      expect(Math.abs(n / 10000 - want)).toBeLessThanOrEqual(0.03);
    }
  });
  it('a miss on a moving handler, body on body, is the foul; otherwise a whiff', () => {
    const miss = () => 0.99;
    expect(resolveAiReach(base({ roll: miss, onHim: true, carrierSpeed: 1.6 }))).toBe('foul');
    expect(resolveAiReach(base({ roll: miss, onHim: true, carrierSpeed: 1.0 }))).toBe('whiff');
    expect(resolveAiReach(base({ roll: miss, onHim: false, carrierSpeed: 3 }))).toBe('whiff');
  });
  it('the moved constants keep 3v3\'s old values', () => {
    expect([AI_REACH_COOLDOWN_SEC, AI_STEAL_CHANCE, AI_STEAL_ON_BUMP, AI_REACH_GATE, AI_REACH_STUN_SEC]).toEqual([1.2, 0.22, 0.6, 0.5, 0.35]);
    expect(AI_REACH_TELL_SEC).toBe(0.25);
  });
});

describe('K-ST3: both modes strip only through the tell', () => {
  it('1v1: the one-roll strip is gone; the tell resolves through resolveAiReach; the reach-in foul is called', () => {
    expect(ONE).not.toMatch(/foeIntent\.steal && Vector3\.Distance\(me\.root\.position, foe\.root\.position\) < 1\.6\) \{\s*stripBall/);
    expect(ONE).toMatch(/const kind = resolveAiReach\(\{/);
    expect(ONE).toMatch(/if \(kind === 'strip'\) \{ stripBall\(ctx, 'STRIPPED!', true\); return; \}/);
    expect(ONE).toMatch(/ai reach tell/);
    expect(ONE).toMatch(/judge\('reach_in', \{ offense: 'me', fouled: 'me' \}\)/);
  });
  it('3v3: no local reach constants; the strip goes through resolveAiReach after the tell', () => {
    expect(THREE).not.toMatch(/const AI_REACH_COOLDOWN_SEC =/);
    expect(THREE).toMatch(/if \(f\.reach\.t < AI_REACH_TELL_SEC\) continue;/);
    expect(THREE).toMatch(/const kind = resolveAiReach\(\{/);
    expect(THREE).toMatch(/ai reach tell/);
    expect(THREE.match(/stripBall\(ctx, f, 'STOLEN!'\)/g)).toHaveLength(1);
  });
});

describe('K-BS1: separateBodies', () => {
  const pair = (d: number) => [new Vector3(0, 0, 0), new Vector3(d, 0, 0)] as const;
  it('inside the deadband: zero', () => {
    const [a, b] = pair(BODY_STANDOFF - SEP_DEADBAND / 2);
    const s = separateBodies(a, b, 1 / 60);
    expect(s.pushA.length() + s.pushB.length()).toBe(0);
  });
  it('above the hard gap the push per body is ≤ pushMps · dt, symmetric, and never adds overlap', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      const [a, b] = pair(1.0);
      const s = separateBodies(a, b, dt);
      expect(s.pushA.length()).toBeLessThanOrEqual(SEP_PUSH_MPS * dt + 1e-9);
      expect(s.pushA.length()).toBeCloseTo(s.pushB.length(), 9);
      expect(b.add(s.pushB).x - a.add(s.pushA).x).toBeGreaterThan(1.0);
    }
  });
  const run = (d0: number, frames: number, dt = 1 / 60) => {
    const [a, b] = pair(d0); const gaps: number[] = []; let maxPop = 0;
    for (let i = 0; i < frames; i++) {
      const s = separateBodies(a, b, dt);
      maxPop = Math.max(maxPop, s.pushA.length(), s.pushB.length());
      a.addInPlace(s.pushA); b.addInPlace(s.pushB); gaps.push(b.x - a.x);
    }
    return { gaps, maxPop };
  };
  it('from 0.76 m it reaches ≥ 1.09 m within 5 frames at 60 fps', () => { expect(run(0.76, 5).gaps[4]).toBeGreaterThanOrEqual(1.09); });
  it('from 0.50 m no frame pops more than popMax, and it is ≥ 0.90 m by frame 4', () => {
    const r = run(0.5, 4);
    expect(r.maxPop).toBeLessThanOrEqual(SEP_POP_MAX + 1e-9);
    expect(r.gaps[3]).toBeGreaterThanOrEqual(BODY_HARD_GAP - 1e-9);
  });
  it('two bodies driven together at 6 m/s for 2 s settle without jitter', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(1.6, 0, 0), dt = 1 / 60; const gaps: number[] = [];
    for (let i = 0; i < 120; i++) {
      a.x += 3 * dt; b.x -= 3 * dt;
      const s = separateBodies(a, b, dt); a.addInPlace(s.pushA); b.addInPlace(s.pushB); gaps.push(b.x - a.x);
    }
    for (let i = 19; i < gaps.length; i++) expect(Math.abs(gaps[i] - gaps[i - 1])).toBeLessThanOrEqual(0.01);
  });
});

describe('K-BS2: resolveBodyContact', () => {
  it('no options: today\'s instant full correction', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(0.8, 0, 0);
    resolveBodyContact(a, b, new Vector3(), new Vector3(), 0.55);
    expect(b.x - a.x).toBeCloseTo(1.1, 9);
  });
  it('maxPush caps the positional step; the momentum exchange is unchanged', () => {
    const run = (opts: object) => {
      const a = new Vector3(0, 0, 0), b = new Vector3(1.0, 0, 0), va = new Vector3(5, 0, 0), vb = new Vector3(0, 0, 0);
      resolveBodyContact(a, b, va, vb, 0.55, opts); return { gap: b.x - a.x, va: va.x, vb: vb.x };
    };
    const capped = run({ maxPush: 0.02, hardGap: BODY_HARD_GAP, popMax: SEP_POP_MAX }), full = run({});
    expect(capped.gap).toBeCloseTo(1.04, 9);
    expect(capped.va).toBeCloseTo(full.va, 9);
    expect(capped.vb).toBeCloseTo(full.vb, 9);
  });
});

describe('K-BS3 + the 0.55 [TUNE] constant', () => {
  it('the 1v1 capsule radius is ONE named constant, 0.55, twice it is BODY_STANDOFF, and both bodies use it', () => {
    expect(ONE).toMatch(/export const ONEVONE_CAPSULE_RADIUS = 0\.55;/);
    expect(ONE).toMatch(/\[TUNE\][^\n]*\n[^\n]*\n?export const ONEVONE_CAPSULE_RADIUS/);
    expect(0.55 * 2).toBeCloseTo(BODY_STANDOFF, 9);
    expect(ONE).toMatch(/contact\.addBody\('me', me\.root, \{ radius: ONEVONE_CAPSULE_RADIUS \}\)/);
    expect(ONE).toMatch(/contact\.addBody\('foe', foe\.root, \{ radius: ONEVONE_CAPSULE_RADIUS \}\)/);
    expect(ONE.match(/radius: 0\.55/g) ?? []).toHaveLength(0);
  });
  it('1v1: no physics-only instant push left; the guard shoves, never teleports, and skips the dunk', () => {
    expect(ONE).not.toMatch(/!contact\?\.isReady && resolveBodyCollision/);
    expect(ONE).not.toMatch(/if \(!contact\?\.isReady\) resolveBodyCollision/);
    const g = ONE.slice(ONE.indexOf('function separate(dt: number): boolean {'), ONE.indexOf('function stripBall('));
    expect(g).toMatch(/if \(dunking \|\| dt <= 1e-6\) return false;/);
    expect(g).toMatch(/contact\.shove\('me'/);
    expect(g).not.toMatch(/teleport/);
    expect(ONE.match(/separate\(dt\);|= separate\(dt\);/g)?.length).toBe(2);
  });
  it('3v3: the pair loop passes maxPush', () => {
    expect(THREE).toMatch(/maxPush: SEP_PUSH_MPS \* dt, hardGap: BODY_HARD_GAP, popMax: SEP_POP_MAX/);
  });
});
