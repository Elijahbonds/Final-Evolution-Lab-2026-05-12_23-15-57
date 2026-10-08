// IMPROVE (2026-10-06): the Sprint core's owner-picked changes — a random SET hold (opt-in), the signed timing error, and a
// state snapshot built once per change. The pad path with no option is pinned tick for tick to the pre-P8 core in
// ride-pad-equivalence.test.ts; these pin the new paths.
import { describe, it, expect } from 'vitest';
import { SprintCore } from './sprint-core';
import { makeSprintSkin, randomSetHoldMs, SPRINT_TUNING, SPRINT_SENSORY, SPRINT_SET_JITTER_MS } from './sprint-skin';
import { RhythmCadence } from '../rhythm-cadence';

const msToGo = (core: SprintCore): number => {
  let ms = 0;
  while (core.phase !== 'Go' && ms < 10000) { core.tick(1); ms += 1; }
  return ms;
};

describe('#1 the SET hold', () => {
  it('is the fixed setMs without the option (the 2D surface, the tests, the fixture)', () => {
    const c = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
    expect(Math.abs(msToGo(c) - (SPRINT_TUNING.readyMs + SPRINT_TUNING.setMs))).toBeLessThanOrEqual(2);
    expect(c.setHoldMs).toBe(SPRINT_TUNING.setMs);
  });
  it('is drawn on entering SET when the skin asks — and again after a false start', () => {
    const c = new SprintCore(makeSprintSkin({ setHoldMs: () => 1200 }));
    expect(Math.abs(msToGo(c) - (SPRINT_TUNING.readyMs + 1200))).toBeLessThanOrEqual(2);
    expect(c.setHoldMs).toBe(1200);
    const holds = [800, 1000];
    let i = 0;
    const d = new SprintCore(makeSprintSkin({ setHoldMs: () => holds[i++] }));
    while (d.phase !== 'Set') d.tick(1);
    expect(d.setHoldMs).toBe(800);
    d.step('L');                                     // a false start in SET: back to the blocks
    expect(d.phase).toBe('Ready');
    expect(Math.abs(msToGo(d) - (SPRINT_TUNING.readyMs + 1000))).toBeLessThanOrEqual(2);
    expect(d.setHoldMs).toBe(1000);
  });
  it('a broken draw falls back to setMs', () => {
    for (const bad of [NaN, -5, Infinity]) {
      const c = new SprintCore(makeSprintSkin({ setHoldMs: () => bad }));
      expect(Math.abs(msToGo(c) - (SPRINT_TUNING.readyMs + SPRINT_TUNING.setMs))).toBeLessThanOrEqual(2);
      expect(c.setHoldMs).toBe(SPRINT_TUNING.setMs);
    }
  });
  it('randomSetHoldMs spans [setMs, setMs + jitter] and is never shorter than the signed-off hold', () => {
    expect(randomSetHoldMs(() => 0)).toBe(SPRINT_TUNING.setMs);
    expect(randomSetHoldMs(() => 0.999999)).toBeCloseTo(SPRINT_TUNING.setMs + SPRINT_SET_JITTER_MS, 2);
    expect(randomSetHoldMs(() => -3)).toBe(SPRINT_TUNING.setMs);
    expect(randomSetHoldMs(() => NaN)).toBe(SPRINT_TUNING.setMs);
    for (let k = 0; k < 200; k++) {
      const h = randomSetHoldMs();
      expect(h).toBeGreaterThanOrEqual(SPRINT_TUNING.setMs);
      expect(h).toBeLessThanOrEqual(SPRINT_TUNING.setMs + SPRINT_SET_JITTER_MS);
    }
  });
});

describe('#2 the signed timing error', () => {
  it('RhythmCadence keeps the sign: + late, − early; null on a first tap or a fault; grades unchanged', () => {
    let now = 0;
    const r = new RhythmCadence({ targetIntervalMs: 200, perfectMs: 35, goodMs: 80, now: () => now });
    expect(r.tap('L')).toBe('first'); expect(r.lastErrorMs).toBeNull();
    now += 320; expect(r.tap('R')).toBe('off'); expect(r.lastErrorMs).toBe(120);
    now += 90; expect(r.tap('L')).toBe('off'); expect(r.lastErrorMs).toBe(-110);
    now += 210; expect(r.tap('R')).toBe('perfect'); expect(r.lastErrorMs).toBe(10);
    now += 200; expect(r.tap('R')).toBe('fault'); expect(r.lastErrorMs).toBeNull();
    now += 200; r.tap('L'); r.reset(); expect(r.lastErrorMs).toBeNull();
  });
  it('the core reports it for a pad stride, and null for a body stride, a stumble or a false start', () => {
    const c = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
    c.step('L'); expect(c.lastErrorMs).toBeNull();   // false start
    msToGo(c);
    c.step('L'); expect(c.lastErrorMs).toBeNull();   // first
    for (let t = 0; t < 400; t++) c.tick(1);
    c.step('R'); expect(c.state.lastStep).toBe('OFF'); expect(c.lastErrorMs).toBe(200);
    for (let t = 0; t < 100; t++) c.tick(1);
    c.step('L'); expect(c.state.lastStep).toBe('OFF'); expect(c.lastErrorMs).toBe(-100);
    c.step('L'); expect(c.state.lastStep).toBe('STUMBLE'); expect(c.lastErrorMs).toBeNull();
    c.step('R', { quality: 'off' }); expect(c.lastErrorMs).toBeNull();
  });
});

describe('#15 the state snapshot', () => {
  it('is one object between changes, a new one after tick or step, and an old snapshot never changes', () => {
    const c = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
    const a = c.state;
    expect(c.state).toBe(a);
    msToGo(c);
    const b = c.state;
    expect(b).not.toBe(a);
    expect(a.phase).toBe('Ready');
    expect(b.phase).toBe('Go');
    c.step('L');
    const after = c.state;
    expect(after).not.toBe(b);
    expect(b.phase).toBe('Go');
    expect(after.phase).toBe('Run');
    expect(after.speed).toBeGreaterThan(0);
  });
  it('a phase callback that reads state mid-step does not leave a stale snapshot behind', () => {
    let mid: string | null = null;
    const c: SprintCore = new SprintCore(makeSprintSkin({ onPhase: (p) => { if (p === 'Run') mid = String(c.state.speed); } }));
    msToGo(c);
    c.step('L');
    expect(mid).toBe('0');                         // read before the stride's impulse landed
    expect(c.state.speed).toBeGreaterThan(0);      // the caller sees the stride
  });
});
