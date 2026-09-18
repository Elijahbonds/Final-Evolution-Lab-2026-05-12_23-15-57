#!/usr/bin/env -S npx tsx
// Neuro-Mechanic Mirror v2 checks — the upgrade: rep counting with tempo, the
// vertical-jump pattern (Prove It's tracker on the same stream), and the
// visible skeleton.
//
//   A. RepCounter (pure): a pull→press→hold cycle counts ONE rep with honest
//      tempo; flicker phases never count; the average accumulates.
//   B. The compositor feeds the phase stream into a RepCounter and exposes
//      reps/tempo on the frame payload AND the session summary.
//   C. The harness paints the user's skeleton (the proof of tracking) and
//      runs the jump tracker when the jump pattern is selected.
//
// Run: npx tsx scripts/mirror-v2-tests.ts

import { readFileSync } from 'node:fs';
import { RepCounter, MIN_REP_MS } from '../lib/babylon/nexus/neuro-mirror/rules/rep-counter';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** A phase stream: n clean reps at the given tempo (ms), hold between. */
function runReps(n: number, pullMs: number, pressMs: number, holdMs: number): RepCounter {
  const rc = new RepCounter();
  let t = 0;
  const step = (phase: 'pull' | 'press' | 'hold', ms: number) => {
    // feed frames at ~30fps through the phase
    const frames = Math.max(1, Math.round(ms / 33));
    for (let i = 0; i < frames; i++) { t += 33; rc.feed(phase, t); }
  };
  for (let i = 0; i < n; i++) {
    step('pull', pullMs);
    step('press', pressMs);
    step('hold', holdMs);
  }
  return rc;
}

// ── A. the counter (pure) ───────────────────────────────────────────────────
{
  const rc = runReps(3, 800, 500, 400);
  const s = rc.state;
  ok(s.reps === 3, `three clean cycles count three reps (got ${s.reps})`);
  ok(s.last !== null && s.last.pullSec > 0.7 && s.last.pullSec < 0.9, `pull tempo measured (${s.last?.pullSec}s)`);
  ok(s.last !== null && s.last.pressSec > 0.4 && s.last.pressSec < 0.6, `press tempo measured (${s.last?.pressSec}s)`);
  ok(s.avg !== null && Math.abs(s.avg.pullSec - 0.8) < 0.1, `average tempo across reps (${s.avg?.pullSec}s)`);
  ok(s.last!.n === 3, 'rep numbers are 1-based and ordered');
}
{
  // flicker: pull/press oscillating at 50ms is jitter, not reps
  const rc = new RepCounter();
  let t = 0;
  for (let i = 0; i < 40; i++) { t += 50; rc.feed(i % 2 ? 'pull' : 'press', t); t += 50; rc.feed('hold', t); }
  ok(rc.state.reps === 0, `flicker never counts (got ${rc.state.reps})`);
}
{
  // a rep that's too fast overall is flicker even if phases hold individually
  const rc = runReps(2, Math.floor(MIN_REP_MS / 3), Math.floor(MIN_REP_MS / 3), 60);
  ok(rc.state.reps === 0, `sub-${MIN_REP_MS}ms cycles are not reps (got ${rc.state.reps})`);
}
{
  // no press without a pull first
  const rc = new RepCounter();
  let t = 0;
  for (let i = 0; i < 20; i++) { t += 33; rc.feed('press', t); }
  for (let i = 0; i < 20; i++) { t += 33; rc.feed('hold', t); }
  ok(rc.state.reps === 0, 'pressing from cold is not a rep');
}

// ── B. compositor wiring ────────────────────────────────────────────────────
{
  const comp = readFileSync(new URL('../lib/babylon/nexus/neuro-mirror/render/overlay-compositor.ts', import.meta.url), 'utf8');
  ok(comp.includes('new RepCounter()'), 'the compositor keeps the rep book');
  ok(comp.includes('reps.feed(result.phase, frame.timestampMs)'), 'every evaluated frame feeds the counter on the pose clock');
  ok(comp.includes('reps: reps.state') && comp.includes('pose: frame'), 'the frame payload carries reps + the raw pose');
  ok(comp.includes('reps: repState.reps') && comp.includes('avgTempo'), 'the session summary carries reps + tempo');
}

// ── C. harness wiring ───────────────────────────────────────────────────────
{
  const h = readFileSync(new URL('../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
  ok(h.includes("['jump', 'Vertical Jump']"), 'the pattern picker offers Vertical Jump');
  ok(h.includes('jumpTrackerRef.current.feed(pose)'), 'the jump pattern runs the Prove It tracker on the same stream');
  ok(h.includes('jumpTrackerRef.current.reset()'), 'each jump resets for the next');
  ok(h.includes('paintSkeleton(pose, p)'), 'the skeleton is painted from the pose stream');
  ok(h.includes('skeletonRef'), 'the skeleton canvas is layered over the video');
  ok(h.includes('REPS'), 'the live HUD shows the rep count');
  ok(h.includes('measured from flight time'), 'the jump panel says where the number comes from');
  ok(!/verticalCm.*random|Math\.random/.test(h), 'no fabricated jump numbers in the harness');
}

if (fail.length) {
  console.error(`mirror-v2-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`mirror-v2-tests: ${checks} checks green`);
