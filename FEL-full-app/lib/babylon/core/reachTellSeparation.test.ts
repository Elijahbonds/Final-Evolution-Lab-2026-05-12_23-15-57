// lane/hoops-def-tell — #273 rebuilt on current release: T-A (the AI reach's tell, the poke's read: core/ReachTell) and T-C (body
// separation: core/BodySeparation). #273's own checks (K-ST1–3, K-BS1–3, the 0.55 constant), each knob's A/B off restoring the release
// exactly, and the fairness rule (a ranked run ignores the device's overrides).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { BODY_STANDOFF, DefenderBrain } from './BasketballCore';
import {
  AI_REACH_COOLDOWN_SEC, AI_REACH_GATE, AI_REACH_STUN_SEC, AI_REACH_TELL_SEC, AI_STEAL_CHANCE, AI_STEAL_ON_BUMP, AiReachTell, STEAL_RATE_PER_SEC,
  POKE_RANGE, aiPokes, aiReachTellOn, aiReachTellSec, pokeReadOn, resolveAiReach, type AiReach, type ReachFrame,
} from './ReachTell';
import {
  BODY_HARD_GAP, ONEVONE_CAPSULE_RADIUS, OLD_CAPSULE_RADIUS, SEP_DEADBAND, SEP_POP_MAX, SEP_PUSH_MPS, bodySepOn, capsuleRadius1v1, contactCap,
  separateBodies,
} from './BodySeparation';
import { resolveBodyContact } from './HoopsMoves';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

const ONE = readFileSync(join(__dirname, '../modes/OneVOneMode.ts'), 'utf8');
const THREE = readFileSync(join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
const BRAIN = readFileSync(join(__dirname, 'BasketballCore.ts'), 'utf8');

/** mulberry32: a plain LCG's consecutive draws are correlated enough to skew a rate by ~13 % on one seed (#273, measured). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const HOOP = new Vector3(0, 0, 0);

/** Steal intents per second from the REAL DefenderBrain, held at `self`, the handler (and ball) still at `handler`. */
function stealRate(aggr: number, dt: number, self: Vector3, handler: Vector3, sec = 600, seed = 7): number {
  const brain = new DefenderBrain(aggr, null, seeded(seed));
  let n = 0;
  const frames = Math.round(sec / dt);
  for (let i = 0; i < frames; i++) if (brain.decide(dt, self, handler, HOOP, [], [handler]).steal) n += 1;
  return n / sec;
}
/** The same against a handler swaying ~3 m/s at the standoff (#273's moving-handler measure). */
function movingRate(aggr: number, seed: number, sec = 600): number {
  const brain = new DefenderBrain(aggr, null, seeded(seed));
  const selfZ = 6 - BODY_STANDOFF; let n = 0; const dt = 1 / 60;
  for (let i = 0; i < sec / dt; i++) {
    const h = new Vector3(Math.sin(i * dt * 3), 0, 6);
    if (brain.decide(dt, new Vector3(h.x, 0, selfZ), h, HOOP, [], [h]).steal) n += 1;
  }
  return n / sec;
}

// the feel panel, opened on a playtest run with these overrides (the BallSideShade test's harness)
const g = globalThis as { window?: unknown };
function openPanel(o: Record<string, number>, search = '?playtest=1'): void {
  resetFeelForTests();
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(o)]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', search));
}
afterEach(() => { resetFeelForTests(); delete g.window; });

describe('K-ST1: the AI poke is a per-second rate (aggression × 1.2 /s at 30, 60 and 144 fps), from the real DefenderBrain', () => {
  const handler = new Vector3(0, 0, 6);
  const self = new Vector3(0, 0, 6 - 0.9);
  for (const a of [0.45, 0.7, 0.85]) {
    it(`aggression ${a}`, () => {
      for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
        const r = [1, 2, 3, 4, 5].reduce((m, sd) => m + stealRate(a, dt, self, handler, 300, sd), 0) / 5;
        expect(Math.abs(r - a * STEAL_RATE_PER_SEC) / (a * STEAL_RATE_PER_SEC)).toBeLessThanOrEqual(0.10);
      }
    });
  }
});

describe('the poke at BODY_STANDOFF, standing and moving (#273 measured 0.177 vs 0.822 /s before its aim fix)', () => {
  it('standing handler: the full rate; moving handler: within 20 % of it', () => {
    const standing = [1, 2, 3].reduce((m, sd) => m + stealRate(0.7, 1 / 60, new Vector3(0, 0, 6 - BODY_STANDOFF), new Vector3(0, 0, 6), 600, sd), 0) / 3;
    const moving = [1, 2, 3].reduce((m, sd) => m + movingRate(0.7, sd), 0) / 3;
    console.info(`[K-ST-MEASURE] standing ${standing.toFixed(3)} /s, moving ${moving.toFixed(3)} /s (expected ${(0.7 * STEAL_RATE_PER_SEC).toFixed(2)})`);
    expect(Math.abs(standing - 0.84) / 0.84).toBeLessThanOrEqual(0.10);
    expect(Math.abs(moving - 0.84) / 0.84).toBeLessThanOrEqual(0.20);
  });
  it('A/B: hoops.pokeReadOn 0 is the release\'s gate and per-frame roll exactly (draw for draw)', () => {
    openPanel({ 'hoops.pokeReadOn': 0 });
    expect(pokeReadOn()).toBe(false);
    for (const seed of [1, 2, 3]) {
      const a = seeded(seed), b = seeded(seed);
      for (let i = 0; i < 5000; i++) {
        const deny = (i % 37) / 20;   // 0 … 1.8 m
        const old = deny < 1.1 && b() < 0.7 * 0.02;
        expect(aiPokes(a, 0.7, 1 / 60, deny, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 9, z: 9 })).toBe(old);
      }
    }
  });
  it('outside POKE_RANGE of the led ball: no poke and no draw', () => {
    let draws = 0; const rng = () => { draws++; return 0; };
    expect(aiPokes(rng, 1, 1 / 60, 0, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: POKE_RANGE + 0.01, z: 0 })).toBe(false);
    expect(draws).toBe(0);
    // the lead: a ball moving away at 3 m/s is 0.3 m further for the poke
    expect(aiPokes(rng, 1, 1 / 60, 0, { x: 1.0, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 0 })).toBe(false);
    expect(aiPokes(rng, 1, 1 / 60, 0, { x: 1.0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 })).toBe(true);
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
  it('the moved constants keep 3v3\'s old values; the tell is 0.25 s', () => {
    expect([AI_REACH_COOLDOWN_SEC, AI_STEAL_CHANCE, AI_STEAL_ON_BUMP, AI_REACH_GATE, AI_REACH_STUN_SEC]).toEqual([1.2, 0.22, 0.6, 0.5, 0.35]);
    expect(AI_REACH_TELL_SEC).toBe(0.25);
  });
});

describe('AiReachTell: the tell is a window the handler can beat', () => {
  const frame = (o: Partial<ReachFrame> = {}): ReachFrame => ({
    eligible: true, inRange: true, moveMark: 0, onHim: false, carrierSpeed: 0, foulSpeed: 1.6, roll: () => 0, ...o,
  });
  it('shows for AI_REACH_TELL_SEC, then resolves (never earlier)', () => {
    const t = new AiReachTell();
    expect(t.start(false, frame())).toBeNull();
    let frames = 0, out = null;
    while (!out && frames < 100) { out = t.step(1 / 60, frame()); frames++; }
    expect(out).toBe('strip');
    expect(frames).toBe(Math.ceil(AI_REACH_TELL_SEC * 60 - 1e-9));
    expect(t.showing).toBe(false);
  });
  it('a stick move or a spin during the tell beats it, whatever the dice', () => {
    for (const late of [frame({ moveMark: 1 }), frame({ spinning: true })]) {
      const t = new AiReachTell(); t.start(false, frame());
      let out = null; for (let i = 0; i < 30 && !out; i++) out = t.step(1 / 60, late);
      expect(out).toBe('whiff');
    }
  });
  it('A/B: hoops.aiReachTellOn 0 resolves on the frame it starts (the release\'s 3v3 reach), with the same draws', () => {
    openPanel({ 'hoops.aiReachTellOn': 0 });
    expect(aiReachTellOn()).toBe(false);
    expect(aiReachTellSec()).toBe(0);
    const t = new AiReachTell();
    expect(t.start(false, frame({ roll: () => 0.21 }))).toBe('strip');
    expect(t.start(true, frame({ roll: () => 0.59 }))).toBe('strip');
    expect(t.start(false, frame({ roll: () => 0.23, onHim: true, carrierSpeed: 2 }))).toBe('foul');
  });
  it('a ranked run ignores the device\'s overrides (the feel panel\'s fairness rule)', () => {
    openPanel({ 'hoops.aiReachTellOn': 0, 'hoops.aiStealChance': 0.9 }, '?ranked=1');
    expect(aiReachTellOn()).toBe(true);
    expect(aiReachTellSec()).toBe(AI_REACH_TELL_SEC);
  });
});

describe('K-ST3: both modes reach through the tell; the knob off keeps the release\'s code path', () => {
  it('1v1: aiReach shows the beat, resolves through AiReachTell, calls the reach-in foul; the one-roll strip stays only behind the knob', () => {
    expect(ONE).toMatch(/if \(aiReachTellOn\(\)\) \{ if \(aiReach\(ctx, dt, foeIntent\.steal, sealed\)\) return; \}\s*\n\s*else if \(foeStunSec === 0 && carrying && !loose[^\n]*foeIntent\.steal && Vector3\.Distance\(me\.root\.position, foe\.root\.position\) < 1\.6\) \{/);
    const fn = ONE.slice(ONE.indexOf('function aiReach('), ONE.indexOf('function separate('));
    expect(fn).toMatch(/foeAnimTree\.beat\('bball_steal_reach'/);
    expect(fn).toMatch(/foeStealReach\.start\(meBumpAge <= BUMP_STRIP_WINDOW_SEC, frame\)/);
    expect(fn).toMatch(/stripBall\(ctx, 'STRIPPED!', true\)/);
    expect(fn).toMatch(/judge\('reach_in', \{ offense: 'me', fouled: 'me' \}\)/);
    expect(ONE.match(/foeStealReach\.reset\(\)/g)).toHaveLength(2);
  });
  it('3v3: the strip goes through the tell; a showing reach ends with the possession', () => {
    expect(THREE).not.toMatch(/const AI_REACH_COOLDOWN_SEC =/);
    expect(THREE).toMatch(/out = tell\.start\(carrier === me && bumpAge <= BUMP_STRIP_WINDOW_SEC, reachFrame, carrier\)/);
    expect(THREE).toMatch(/if \(tell\.showing && tell\.target !== carrier\) tell\.reset\(\);/);
    expect(THREE.match(/stripBall\(ctx, f, 'STOLEN!'\)/g)).toHaveLength(1);
    expect(THREE.match(/for \(const f of foes\) f\.reach\?\.reset\(\);/g)).toHaveLength(2);
  });
  it('the brain\'s poke goes through aiPokes', () => {
    expect(BRAIN).toMatch(/onBall && aiPokes\(this\.rng, this\.aggression, dt, dist, ball, \{ x: hvx, z: hvz \}, self\)/);
    expect(BRAIN).not.toMatch(/this\.aggression \* 0\.02/);
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
  it('from 0.76 m (the old Havok touch) it reaches ≥ 1.09 m within 5 frames at 60 fps', () => { expect(run(0.76, 5).gaps[4]).toBeGreaterThanOrEqual(1.09); });
  it('from 0.50 m no frame pops more than popMax, and it is ≥ 0.90 m by frame 4', () => {
    const r = run(0.5, 4);
    expect(r.maxPop).toBeLessThanOrEqual(SEP_POP_MAX + 1e-9);
    expect(r.gaps[3]).toBeGreaterThanOrEqual(BODY_HARD_GAP - 1e-9);
  });
  it('two bodies driven together at 6 m/s for 2 s settle without jitter, never under the hard gap after the first frames', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(1.6, 0, 0), dt = 1 / 60; const gaps: number[] = [];
    for (let i = 0; i < 120; i++) {
      a.x += 3 * dt; b.x -= 3 * dt;
      const s = separateBodies(a, b, dt); a.addInPlace(s.pushA); b.addInPlace(s.pushB); gaps.push(b.x - a.x);
    }
    for (let i = 19; i < gaps.length; i++) expect(Math.abs(gaps[i] - gaps[i - 1])).toBeLessThanOrEqual(0.01);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(BODY_HARD_GAP - 1e-9);
  });
});

describe('K-BS2: resolveBodyContact', () => {
  it('no cap: the instant full correction, unchanged', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(0.8, 0, 0);
    resolveBodyContact(a, b, new Vector3(), new Vector3(), 0.55);
    expect(b.x - a.x).toBeCloseTo(1.1, 9);
  });
  it('maxPush caps the positional step; the momentum exchange is unchanged', () => {
    const run = (opts: object) => {
      const a = new Vector3(0, 0, 0), b = new Vector3(1.0, 0, 0), va = new Vector3(5, 0, 0), vb = new Vector3(0, 0, 0);
      resolveBodyContact(a, b, va, vb, 0.55, opts); return { gap: b.x - a.x, va: va.x, vb: vb.x };
    };
    const capped = run(contactCap(0.02 / SEP_PUSH_MPS)), full = run({});
    expect(capped.gap).toBeCloseTo(1.04, 9);
    expect(capped.va).toBeCloseTo(full.va, 9);
    expect(capped.vb).toBeCloseTo(full.vb, 9);
  });
  it('A/B: hoops.bodySepOn 0 — 3v3\'s cap is empty (the instant push) and 1v1 builds the 0.38 capsule', () => {
    expect(capsuleRadius1v1()).toBe(ONEVONE_CAPSULE_RADIUS);
    openPanel({ 'hoops.bodySepOn': 0 });
    expect(bodySepOn()).toBe(false);
    expect(contactCap(1 / 60)).toEqual({});
    expect(capsuleRadius1v1()).toBe(OLD_CAPSULE_RADIUS);
  });
});

describe('K-BS3: the 1v1 capsule and the one separation guard', () => {
  it('the capsule radius is ONE constant, 0.55 (× 2 = BODY_STANDOFF), and both 1v1 bodies are built with it', () => {
    expect(ONEVONE_CAPSULE_RADIUS * 2).toBeCloseTo(BODY_STANDOFF, 9);
    expect(ONE).toMatch(/const capsule = capsuleRadius1v1\(\);/);
    expect(ONE).toMatch(/contact\.addBody\('me', me\.root, \{ radius: capsule \}\)/);
    expect(ONE).toMatch(/contact\.addBody\('foe', foe\.root, \{ radius: capsule \}\)/);
  });
  it('1v1: the guard shoves, never teleports, and skips the dunk; its off is the release\'s instant push', () => {
    const g2 = ONE.slice(ONE.indexOf('function separate(dt: number): boolean {'), ONE.indexOf('/** D1/D3: the AI\'s read on my load'));
    expect(g2).toMatch(/if \(!bodySepOn\(\)\) return !contact\?\.isReady && resolveBodyCollision\(me\.root\.position, foe\.root\.position\);/);
    expect(g2).toMatch(/if \(dunking \|\| dt <= 1e-6\) return false;/);
    expect(g2).toMatch(/contact\.shove\('me'/);
    expect(g2).not.toMatch(/teleport\(/);
    expect(ONE.match(/separate\(dt\);/g)?.length).toBe(2);
    expect(ONE).not.toMatch(/!contact\?\.isReady && resolveBodyCollision\(me\.root\.position, foe\.root\.position\) &&/);
  });
  it('3v3: the pair loop takes the cap', () => {
    expect(THREE).toMatch(/exchange: !cooling, \.\.\.contactCap\(dt\) \}/);
  });
});
