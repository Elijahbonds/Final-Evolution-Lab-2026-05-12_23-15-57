/**
 * scripts/m5-game-smoke.ts
 * ========================
 * Headless smoke tests for M5 Game Parity systems.
 * Validates ComboTracker, MissGate, SessionRecorder, and prq-engine
 * integration — no DOM, no canvas, pure logic.
 *
 * Run:  cd nextjs_space && yarn tsx scripts/m5-game-smoke.ts
 */

import { strict as assert } from 'node:assert';
import {
  ComboTracker,
  MissGate,
  SessionRecorder,
  createGameSystems,
} from '../lib/game-systems';
import {
  comboMultiplier,
  computeSessionPerformance,
  computePrqDelta,
  type SessionTallies,
  type SessionPerformanceInput,
  type PrqDeltaInput,
} from '../lib/prq-engine';
// M7a — animation-state assertions folded into the M5 suite (per acceptance c).
import {
  AnimDirectorFSM,
  locomotionInvariantHolds,
  isValidDecision,
  resolve as resolveAnim,
} from '../lib/anim/state-machine';
import { isLoopClip } from '../lib/anim/clip-registry';

let pass = 0;
const t = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ✓ ${label}`);
};

console.log('\n── M5 Game-Systems Smoke Tests ──\n');

/* ─── ComboTracker ─────────────────────────────────────────── */
console.log('ComboTracker');

t('initial state is zero', () => {
  const c = new ComboTracker();
  const s = c.snapshot();
  assert.equal(s.chain, 0);
  assert.equal(s.multiplier, 1);
  assert.equal(s.bestChain, 0);
});

t('registerHit increments chain', () => {
  const c = new ComboTracker();
  c.registerHit();
  assert.equal(c.snapshot().chain, 1);
  c.registerHit();
  assert.equal(c.snapshot().chain, 2);
});

t('multiplier follows prq-engine ladder (4/7/10)', () => {
  const c = new ComboTracker();
  for (let i = 0; i < 3; i++) c.registerHit();
  assert.equal(c.snapshot().multiplier, 1); // chain 3 → 1×
  c.registerHit(); // chain 4 → 2×
  assert.equal(c.snapshot().multiplier, 2);
  for (let i = 0; i < 3; i++) c.registerHit(); // chain 7 → 3×
  assert.equal(c.snapshot().multiplier, 3);
  for (let i = 0; i < 3; i++) c.registerHit(); // chain 10 → 4×
  assert.equal(c.snapshot().multiplier, 4);
});

t('breakCombo resets chain to 0', () => {
  const c = new ComboTracker();
  c.registerHit(); c.registerHit();
  c.breakCombo();
  assert.equal(c.snapshot().chain, 0);
  assert.equal(c.snapshot().multiplier, 1);
});

t('bestChain tracks max', () => {
  const c = new ComboTracker();
  c.registerHit(); c.registerHit(); c.registerHit(); // best=3
  c.breakCombo();
  c.registerHit(); // chain=1, best still 3
  assert.equal(c.snapshot().bestChain, 3);
  assert.equal(c.snapshot().chain, 1);
});

t('update decays window and auto-breaks', () => {
  const c = new ComboTracker(1000); // 1s window
  c.registerHit();
  assert.equal(c.snapshot().chain, 1);
  c.update(0.5); // half-second
  assert.equal(c.snapshot().chain, 1); // still alive
  c.update(0.6); // past the window
  assert.equal(c.snapshot().chain, 0); // auto-broken
});

t('reset clears everything', () => {
  const c = new ComboTracker();
  c.registerHit(); c.registerHit();
  c.reset();
  const s = c.snapshot();
  assert.equal(s.chain, 0);
  assert.equal(s.bestChain, 0);
});

/* ─── MissGate ─────────────────────────────────────────────── */
console.log('\nMissGate');

t('default gate passes decent quality', () => {
  const g = new MissGate();
  assert.equal(g.attempt(0, 0.5), true); // quality 0.5 > 0.15 threshold
  assert.equal(g.misses, 0);
  assert.equal(g.gatedAttempts, 1);
});

t('default gate rejects quality below threshold', () => {
  const g = new MissGate();
  assert.equal(g.attempt(0, 0.1), false); // 0.1 < 0.15
  assert.equal(g.misses, 1);
});

t('proximity gate rejects too far', () => {
  const g = new MissGate({ proximityThreshold: 2.5 });
  assert.equal(g.attempt(5, 1.0), false); // too far
  assert.equal(g.attempt(2.0, 1.0), true); // within range
});

t('attemptByQuality ignores proximity', () => {
  const g = new MissGate({ proximityThreshold: 0.1 }); // very tight
  assert.equal(g.attemptByQuality(0.5), true); // passes because distance=0
});

t('reset clears counters', () => {
  const g = new MissGate();
  g.attempt(0, 0); g.attempt(0, 1);
  g.reset();
  assert.equal(g.misses, 0);
  assert.equal(g.gatedAttempts, 0);
});

/* ─── SessionRecorder ──────────────────────────────────────── */
console.log('\nSessionRecorder');

t('tallies accumulate correctly', () => {
  const r = new SessionRecorder();
  r.recordHit(true);  // perfect
  r.recordHit(false); // normal hit
  r.recordMiss();
  r.recordDodge();
  r.recordCombo();
  r.addScore(10);
  r.addScore(5);
  r.recordChain(3);
  r.recordChain(2); // should not lower best
  const tl = r.tallies();
  assert.equal(tl.hits, 2);
  assert.equal(tl.misses, 1);
  assert.equal(tl.dodges, 1);
  assert.equal(tl.combos, 1);
  assert.equal(r.perfects, 1);
  assert.equal(r.totalScore, 15);
  assert.equal(r.bestChain, 3);
});

t('reset clears tallies', () => {
  const r = new SessionRecorder();
  r.recordHit(true); r.addScore(100);
  r.reset();
  const tl = r.tallies();
  assert.equal(tl.hits, 0);
  assert.equal(r.totalScore, 0);
});

/* ─── createGameSystems factory ────────────────────────────── */
console.log('\ncreateGameSystems factory');

t('creates all three systems', () => {
  const sys = createGameSystems();
  assert.ok(sys.combo instanceof ComboTracker);
  assert.ok(sys.gate instanceof MissGate);
  assert.ok(sys.recorder instanceof SessionRecorder);
});

t('custom options propagate', () => {
  const sys = createGameSystems({ comboWindowMs: 500, gate: { minQteQuality: 0.5 } });
  assert.equal(sys.combo.windowMs, 500);
  assert.equal(sys.gate.config.minQteQuality, 0.5);
});

/* ─── prq-engine integration ──────────────────────────────── */
console.log('\nprq-engine integration');

t('comboMultiplier matches ladder', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(3), 1);
  assert.equal(comboMultiplier(4), 2);
  assert.equal(comboMultiplier(7), 3);
  assert.equal(comboMultiplier(10), 4);
  assert.equal(comboMultiplier(99), 4);
});

t('computeSessionPerformance produces 0..100 score', () => {
  const perf = computeSessionPerformance({
    tallies: { hits: 10, misses: 2, dodges: 1, combos: 3 },
    maxCombo: 5,
  });
  assert.ok(typeof perf === 'number');
  assert.ok(perf >= 0 && perf <= 100);
});

t('SessionRecorder tallies feed computeSessionPerformance', () => {
  const r = new SessionRecorder();
  for (let i = 0; i < 8; i++) r.recordHit(i < 3);
  r.recordMiss(); r.recordMiss();
  r.addScore(45);
  r.recordChain(6);
  const perf = computeSessionPerformance({ tallies: r.tallies(), maxCombo: r.bestChain });
  assert.ok(typeof perf === 'number');
  assert.ok(perf >= 0 && perf <= 100);
});

t('computePrqDelta returns bounded deltas', () => {
  const perf = computeSessionPerformance({
    tallies: { hits: 20, misses: 0, dodges: 5, combos: 8 },
    maxCombo: 12,
  });
  const delta = computePrqDelta({
    currentAttributes: { timing: 50, power: 50, style: 50, accuracy: 50 },
    performance: perf,
    mode: 'dunkContest',
    won: true,
  });
  for (const v of Object.values(delta)) {
    assert.ok(Math.abs(v) <= 3, `delta ${v} exceeds MAX_SESSION_ATTRIBUTE_DELTA=3`);
  }
});

/* ─── End-to-end: full dunk session simulation ─────────────── */
console.log('\nEnd-to-end dunk session simulation');

t('simulated dunk session produces valid PRQ delta', () => {
  const sys = createGameSystems({ comboWindowMs: 8000 });

  // Simulate 10 dunks: 7 hits (2 perfect), 3 misses
  const dunkResults = ['PERFECT', 'GREAT', 'GOOD', '', 'GREAT', 'PERFECT', 'GOOD', '', '', 'GREAT'];
  for (const qte of dunkResults) {
    const quality = qte === 'PERFECT' ? 1 : qte === 'GREAT' ? 0.7 : qte === 'GOOD' ? 0.4 : 0;
    const pass = sys.gate.attemptByQuality(quality);
    if (pass) {
      const mult = sys.combo.registerHit();
      sys.recorder.recordHit(qte === 'PERFECT');
      sys.recorder.addScore(2.5 * mult);
      sys.recorder.recordChain(sys.combo.snapshot().chain);
    } else {
      sys.combo.breakCombo();
      sys.recorder.recordMiss();
    }
  }

  const tallies = sys.recorder.tallies();
  assert.equal(tallies.hits, 7);
  assert.equal(tallies.misses, 3);
  assert.equal(sys.recorder.perfects, 2);
  assert.ok(sys.recorder.bestChain >= 3); // 3-chain from hits 4-6
  assert.ok(sys.recorder.totalScore > 0);

  const perf = computeSessionPerformance({ tallies, maxCombo: sys.recorder.bestChain });
  assert.ok(typeof perf === 'number');
  assert.ok(perf > 0);

  const delta = computePrqDelta({
    currentAttributes: { timing: 50, power: 50, style: 50, accuracy: 50 },
    performance: perf,
    mode: 'dunkContest',
    won: true,
  });
  const totalDelta = Object.values(delta).reduce((s, v) => s + v, 0);
  assert.ok(typeof totalDelta === 'number');
});

/* ─── M7a animation-state invariants ───────────────────────── */
console.log('\nM7a animation state (per-mode)');

t('every game mode resolves to a real (non-T-pose) clip', () => {
  const modes = [
    'basketball_dunk', 'karate_endless', 'basketball_h2h', 'venice_pickup',
    'soccer', 'football', 'skateboarding', 'snowboarding', 'surfing',
  ];
  for (const m of modes) {
    const c = resolveAnim(m, '', '');
    assert.ok(c.name.length > 0, `${m} produced an empty clip`);
  }
});

t('stationary avatar always plays an idle clip (idle never off)', () => {
  const fsm = new AnimDirectorFSM();
  for (let i = 0; i < 120; i++) {
    const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
    assert.equal(d.kind, 'idle');
    assert.ok(isValidDecision(d) && locomotionInvariantHolds(0, d));
  }
});

t('moving avatar always plays a locomotion loop (no slide-walking / waddle)', () => {
  const fsm = new AnimDirectorFSM();
  for (const spd of [0.15, 0.4, 0.7, 1.0]) {
    const d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: spd });
    assert.equal(d.kind, 'locomotion');
    assert.ok(d.clip.loop && isLoopClip(d.clip.name));
    assert.ok(locomotionInvariantHolds(spd, d));
  }
});

t('a strike action sequences and then blends back (no snap / T-pose)', () => {
  const fsm = new AnimDirectorFSM();
  let d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0, actionEvent: 'kick' });
  assert.equal(d.kind, 'action');
  let backToBase = false;
  for (let i = 0; i < 60; i++) {
    d = fsm.update(1 / 60, { modeId: 'karate_endless', speed01: 0 });
    assert.ok(isValidDecision(d));
    if (d.kind !== 'action') { backToBase = true; break; }
  }
  assert.ok(backToBase, 'action must resolve back to idle/locomotion');
});

/* ─── M7b hero-mode animation smoke (per hero mode) ───────── */
console.log('\nM7b hero-mode animation state');

const HERO_SMOKE: { mode: string; event: string; phase?: string }[] = [
  { mode: 'basketball_dunk', event: '360_eastbay', phase: 'airborne' },
  { mode: 'basketball_h2h', event: 'shoot' },
  { mode: 'karate_endless', event: 'kick' },
  { mode: 'soccer', event: 'shoot' },
  { mode: 'golf', event: 'swing' },
  { mode: 'baseball', event: 'swing' },
];

t('each hero mode: stationary idles, moving locomotes, action sequences (no T-pose)', () => {
  for (const h of HERO_SMOKE) {
    const fsm = new AnimDirectorFSM();
    fsm.reset();
    // stationary → idle
    const idle = fsm.update(1 / 60, { modeId: h.mode, speed01: 0 });
    assert.equal(idle.kind, 'idle', `${h.mode} stationary should idle`);
    assert.ok(isValidDecision(idle) && locomotionInvariantHolds(0, idle));
    // moving → locomotion loop
    const move = fsm.update(1 / 60, { modeId: h.mode, speed01: 0.8 });
    assert.equal(move.kind, 'locomotion', `${h.mode} moving should locomote`);
    assert.ok(move.clip.loop && isLoopClip(move.clip.name));
    // action event → action sequence that resolves
    const fsm2 = new AnimDirectorFSM();
    fsm2.reset();
    const act = fsm2.update(1 / 60, { modeId: h.mode, speed01: 0, phase: h.phase ?? '', actionEvent: h.event });
    assert.equal(act.kind, 'action', `${h.mode} event should start an action`);
    let resolved = false;
    for (let i = 0; i < 60; i++) {
      const d = fsm2.update(1 / 60, { modeId: h.mode, speed01: 0 });
      assert.ok(isValidDecision(d));
      if (d.kind !== 'action') { resolved = true; break; }
    }
    assert.ok(resolved, `${h.mode} action must resolve back to idle/locomotion`);
  }
});

console.log(`\n── All ${pass} M5 smoke tests passed ✓ ──\n`);
process.exit(0);
