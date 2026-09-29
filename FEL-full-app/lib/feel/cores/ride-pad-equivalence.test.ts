// Pad equivalence: movement play phase 8 must not change PAD play in the two cores it touched (PLAN-P8 G10).
//
// P8 taught SprintCore.step an optional body stride (`{ quality, early }`: graded on the camera's clock against a body's
// cadence, a step captured before the gun a false start) and AirSessionCore.runTap an optional `quality` — options a pad
// path never passes. This file drives each live core and a frozen copy of the pre-P8 one (tests/fixtures/ride-pre-p8,
// `git show 6adc0583`) with the SAME seeded pad input on the SAME clock and requires the same answer at every step:
//   • SprintCore: taps at a thumb's rate with jitter, same-side stumbles, gaps, taps in Ready / Set (false starts), through
//     the finish — every returned state, the cadence stats, the phase, every tick;
//   • AirSessionCore (the big-air skin): run-up taps, the spin's direction on the d-pad, A to start and plant the spin, B
//     to stick the landing, across attempts — every state, every tap's grade, every tick.
// Non-vacuous: the streams reach every grade, a false start, a finish, a launch, a spin and a landing, and the body's
// option on the same taps changes the run (the live core is not the frozen one by accident of never taking the new path).
// The modes the cores sit in are pinned on their source in lib/babylon/core/rideBody.gate.test.ts (G10) and driven by pad
// in the live probe's L7.
import { describe, it, expect } from 'vitest';
import { SprintCore } from './sprint-core';
import { SprintCore as BaseSprintCore } from '@/tests/fixtures/ride-pre-p8/sprint-core.base';
import { AirSessionCore } from './air-session-core';
import { AirSessionCore as BaseAirSessionCore } from '@/tests/fixtures/ride-pre-p8/air-session-core.base';
import { SPRINT_TUNING, SPRINT_SENSORY } from './sprint-constants';
import { makeBigAirSkin } from './big-air-skin';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const snap = (x: unknown) => JSON.stringify(x);

describe('SprintCore: the pad path is the pre-P8 core, tick for tick', () => {
  it('40 seeded pad streams (a thumb\'s taps, stumbles, gaps, false starts): the same state, stats and phase at every tick and tap', () => {
    const seen = { perfect: 0, good: 0, off: 0, fault: 0, falseStarts: 0, finishes: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const r = mulberry32(seed);
      const live = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
      const base = new BaseSprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
      let side: 'L' | 'R' = 'L', next = 300 + r() * 1500;
      for (let now = 0; now < 30000; now += 16) {
        live.tick(16); base.tick(16);
        while (now >= next) {
          // a stumble now and then (the same side twice), else alternate
          if (r() > 0.06) side = side === 'L' ? 'R' : 'L';
          live.step(side); base.step(side);
          expect(snap([live.state, live.cadenceStats, live.phase]), `seed ${seed} tap @${next.toFixed(0)}`).toBe(snap([base.state, base.cadenceStats, base.phase]));
          next += r() < 0.05 ? 400 + r() * 900 : 130 + r() * 140;   // a gap, or a thumb's 4–7 taps a second
        }
        expect(snap([live.state, live.cadenceStats, live.phase]), `seed ${seed} tick @${now}`).toBe(snap([base.state, base.cadenceStats, base.phase]));
      }
      const st = live.cadenceStats;
      seen.perfect += st.perfect; seen.good += st.good; seen.off += st.off; seen.fault += st.fault;
      seen.falseStarts += live.state.falseStarts; if (live.state.finishTimeS !== null) seen.finishes++;
    }
    for (const [k, v] of Object.entries(seen)) expect(v, k).toBeGreaterThan(0);
  });

  it('…and the body\'s option on the same taps changes the run (the new path is real, and only the option takes it)', () => {
    const run = (opts: boolean) => {
      const r = mulberry32(7);
      const c = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
      let side: 'L' | 'R' = 'L', next = 2600;
      for (let now = 0; now < 30000 && c.phase !== 'Finish'; now += 16) {
        c.tick(16);
        while (now >= next) { side = side === 'L' ? 'R' : 'L'; if (opts) c.step(side, { quality: 'perfect' }); else c.step(side); next += 300 + r() * 40; }
      }
      return c.state;
    };
    const pad = run(false), body = run(true);
    expect(body.finishTimeS).not.toBeNull();
    expect(pad.finishTimeS === null || body.finishTimeS! < pad.finishTimeS).toBe(true);
    // a step captured before the gun is a false start in Go / Run only with `early`
    const a = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
    while (a.phase !== 'Go') a.tick(16);
    a.step('L', { quality: 'good', early: true });
    expect(a.state.falseStarts).toBe(1);
  });
});

describe('AirSessionCore (big air): the pad path is the pre-P8 core, tick for tick', () => {
  it('30 seeded pad sessions (run-up taps, the spin\'s direction, A to spin and plant, B to stick): the same state and grades throughout', () => {
    const seen = { graded: 0, launches: 0, spins: 0, landings: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const r = mulberry32(100 + seed);
      const live = new AirSessionCore(makeBigAirSkin());
      const base = new BaseAirSessionCore(makeBigAirSkin());
      let side: 'L' | 'R' = 'L', next = 200, phase = '';
      for (let now = 0; now < 40000; now += 16) {
        const a = live.step(0.016), b = base.step(0.016);
        expect(snap(a), `seed ${seed} tick @${now}`).toBe(snap(b));
        if (a.phase !== phase) { if (a.phase === 'Air') seen.launches++; if (phase === 'Air') seen.landings++; phase = a.phase; }
        while (now >= next) {
          const k = r();
          if (a.phase === 'Run') {
            if (k > 0.05) side = side === 'L' ? 'R' : 'L';
            const qa = live.runTap(side), qb = base.runTap(side);
            expect(qa, `seed ${seed} tap @${now}`).toBe(qb);
            if (qa) seen.graded++;
            next += r() < 0.1 ? 350 + r() * 300 : 170 + r() * 150;
          } else if (a.phase === 'Air') {
            if (k < 0.3) { const d = r() < 0.5 ? 1 : -1; live.setSpinDir(d); base.setSpinDir(d); }
            else if (k < 0.8) { live.trick(); base.trick(); if (live.airTrick.spinning) seen.spins++; }
            else { live.stick(); base.stick(); }
            next += 90 + r() * 260;
          } else {
            // between attempts: presses the core ignores, and a tap it refuses (runTap outside Run → null on both)
            expect(live.runTap(side)).toBe(base.runTap(side));
            live.trick(); base.trick();
            next += 200 + r() * 400;
          }
          expect(snap([live.state, live.airTrick]), `seed ${seed} press @${now}`).toBe(snap([base.state, base.airTrick]));
        }
      }
    }
    for (const [k, v] of Object.entries(seen)) expect(v, k).toBeGreaterThan(0);
  });

  it('…and a body\'s graded tap changes the run-up (the new path is real, and only the option takes it)', () => {
    const run = (q?: 'perfect') => {
      const c = new AirSessionCore(makeBigAirSkin());
      let side: 'L' | 'R' = 'L';
      for (let now = 0, next = 100; now < 6000; now += 16) {
        c.step(0.016);
        if (c.state.phase === 'Run' && now >= next) { side = side === 'L' ? 'R' : 'L'; c.runTap(side, q); next += 480; }
      }
      return c.state;
    };
    // a lazy thumb (480 ms taps: off-beat for the core's own 260 ms target) vs the same taps graded perfect by a body grader
    const pad = run(), body = run('perfect');
    expect(snap(body)).not.toBe(snap(pad));
  });
});
