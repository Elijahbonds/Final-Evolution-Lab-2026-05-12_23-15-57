#!/usr/bin/env -S npx tsx
// Prove It (IRL dunk duel) headless checks — synthetic pose streams through
// the real tracker. The camera can't be driven headless, so the MEASUREMENT
// core is proven here frame-by-frame: a scripted jump with known physics
// must come out as the known numbers.
//
// Run: npx tsx scripts/prove-it-tests.ts

import { readFileSync } from 'node:fs';
import {
  DunkTracker, scoreIrlDunk, DUNK_POSE_IDX,
  type TrackerFrame, type TrackerLandmark,
} from '../lib/irl/dunkTracker';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const FLOOR_ANKLE_Y = 0.9;
const HIP_Y = 0.55;

interface PoseOpts {
  ankleRise?: number;       // how far ankles lift (image units, y-down)
  hipX?: number;            // hip x this frame (approach motion)
  wristY?: number;          // wrists height
  wristX?: number;
  shoulderRoll?: number;    // radians of shoulder-line tilt
  ankleSep?: number;
}
function frame(t: number, o: PoseOpts = {}): TrackerFrame {
  const lms: TrackerLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  const roll = o.shoulderRoll ?? 0;
  const rise = o.ankleRise ?? 0;
  const hipX = o.hipX ?? 0.5;
  const sep = o.ankleSep ?? 0.04;
  const set = (idx: number, x: number, y: number) => { lms[idx] = { x, y, visibility: 0.95 }; };
  // shoulders tilt by roll around the midpoint
  set(DUNK_POSE_IDX.leftShoulder, hipX - 0.08 * Math.cos(roll), 0.4 - 0.08 * Math.sin(roll));
  set(DUNK_POSE_IDX.rightShoulder, hipX + 0.08 * Math.cos(roll), 0.4 + 0.08 * Math.sin(roll));
  set(DUNK_POSE_IDX.leftHip, hipX - 0.05, HIP_Y - rise * 0.6);
  set(DUNK_POSE_IDX.rightHip, hipX + 0.05, HIP_Y - rise * 0.6);
  set(DUNK_POSE_IDX.leftAnkle, hipX - sep, FLOOR_ANKLE_Y - rise);
  set(DUNK_POSE_IDX.rightAnkle, hipX + sep, FLOOR_ANKLE_Y - rise);
  set(DUNK_POSE_IDX.nose, hipX, 0.33);
  set(DUNK_POSE_IDX.leftWrist, o.wristX ?? hipX - 0.12, o.wristY ?? 0.55);
  set(DUNK_POSE_IDX.rightWrist, o.wristX ?? hipX + 0.12, o.wristY ?? 0.55);
  return { landmarks: lms, timestampMs: t, present: true };
}

/** A scripted dunk: stand (calibrate) → run-up → jump of `flightMs` → land → settle. */
function runDunk(opts: {
  flightMs: number; runUp?: boolean; wristArc?: boolean; belowHip?: boolean;
  roll?: number; ankleSep?: number; sway?: boolean;
}): { metrics: ReturnType<DunkTracker['compute']> extends never ? never : import('../lib/irl/dunkTracker').DunkMetrics | null } {
  const tr = new DunkTracker();
  let result: import('../lib/irl/dunkTracker').DunkMetrics | null = null;
  let t = 0;
  const step = (ms: number, o: PoseOpts) => { t += ms; const r = tr.feed(frame(t, o)); if (r) result = r; };
  // stand still for calibration (25 frames)
  for (let i = 0; i < 25; i++) step(33, {});
  // run-up: hips travel left→right over 0.5s
  if (opts.runUp) for (let i = 0; i < 15; i++) step(33, { hipX: 0.35 + i * 0.015 });
  // the jump
  const air = Math.floor(opts.flightMs / 33);
  for (let i = 0; i < air; i++) {
    const k = i / Math.max(1, air - 1);                       // 0..1 across flight
    const rise = 0.06 + Math.sin(k * Math.PI) * 0.06;          // up and back down
    const wristY = opts.belowHip && k > 0.3 && k < 0.6 ? 0.62 : 0.35 - Math.sin(k * Math.PI) * 0.2;
    const wristX = opts.wristArc ? 0.5 + Math.sin(k * Math.PI * 2) * 0.25 : undefined;
    step(33, { ankleRise: rise, shoulderRoll: (opts.roll ?? 0) * k, wristY, wristX, ankleSep: opts.ankleSep });
  }
  // landing + settle (with optional sway)
  for (let i = 0; i < 20; i++) step(33, { hipX: 0.5 + (opts.sway ? Math.sin(i * 1.3) * 0.06 : 0) });
  return { metrics: result as never };
}

// ── the physics are measured, not fabricated ───────────────────────────────
{
  const { metrics: m } = runDunk({ flightMs: 500 });
  ok(m !== null, 'a clean jump produces a measurement');
  ok(m!.flightTimeMs >= 480 && m!.flightTimeMs <= 560, `flight time ≈ 500ms (got ${m!.flightTimeMs})`);
  const expectedCm = (9.81 * 0.5 ** 2) / 8 * 100;             // ~30.7cm
  ok(Math.abs(m!.verticalCm - expectedCm) < 6, `vertical within tolerance of g·t²/8 (${m!.verticalCm} vs ${expectedCm.toFixed(1)})`);
  ok(m!.family === 'ONE-HAND JAM' || m!.family === 'TWO-HAND JAM', `a plain jump reads as a plain jam (got ${m!.family})`);
}

// ── the families separate ───────────────────────────────────────────────────
{
  const btl = runDunk({ flightMs: 500, belowHip: true }).metrics!;
  ok(btl.family === 'BETWEEN-THE-LEGS', `hand under the hips mid-air → BETWEEN-THE-LEGS (got ${btl.family})`);
  // apex is sampled mid-flight (k=0.5), so a full spin reads π there
  const spin = runDunk({ flightMs: 500, roll: Math.PI * 2 }).metrics!;
  ok(spin.family === '360', `big shoulder roll → 360 (got ${spin.family}, ${spin.rotationDeg}°)`);
  const mill = runDunk({ flightMs: 500, wristArc: true }).metrics!;
  ok(mill.family === 'WINDMILL' || mill.family === 'TOMAHAWK', `big wrist arc → WINDMILL/TOMAHAWK (got ${mill.family})`);
  const one = runDunk({ flightMs: 500, ankleSep: 0.2 }).metrics!;
  ok(one.takeoff === 'one-foot', 'wide ankle split at takeoff reads one-foot');
  const two = runDunk({ flightMs: 500, ankleSep: 0.03 }).metrics!;
  ok(two.takeoff === 'two-foot', 'narrow ankles read two-foot');
}

// ── the scoring is PRQ-relative and family-ordered ──────────────────────────
{
  const plain = runDunk({ flightMs: 500 }).metrics!;
  const fancy = runDunk({ flightMs: 500, belowHip: true }).metrics!;
  const sPlain = scoreIrlDunk(plain, 60);
  const sFancy = scoreIrlDunk(fancy, 60);
  ok(sFancy.difficulty > sPlain.difficulty, `between-the-legs out-difficulties a jam (${sFancy.difficulty} vs ${sPlain.difficulty})`);
  // same vert, different athlete: the lower-PRQ athlete's dunk reads harder
  const s60 = scoreIrlDunk(plain, 60);
  const s95 = scoreIrlDunk(plain, 95);
  ok(s60.difficulty > s95.difficulty, `same vert scores harder at PRQ 60 than PRQ 95 (${s60.difficulty} vs ${s95.difficulty})`);
  // a stumble costs execution
  const clean = scoreIrlDunk(runDunk({ flightMs: 500 }).metrics!, 60);
  const stumbled = scoreIrlDunk(runDunk({ flightMs: 500, sway: true }).metrics!, 60);
  ok(clean.execution > stumbled.execution, `a stumbled landing costs execution (${clean.execution} vs ${stumbled.execution})`);
}

// ── junk in, nothing out ────────────────────────────────────────────────────
{
  const hop = runDunk({ flightMs: 100 }).metrics;             // too short to be a dunk
  ok(hop === null, 'a 100ms hop is not scored as a dunk');
  const tr = new DunkTracker();
  const noPose = tr.feed({ landmarks: [], timestampMs: 0, present: false });
  ok(noPose === null && tr.state !== 'idle' || noPose === null, 'absent poses never fabricate a measurement');
}

// ── wiring ──────────────────────────────────────────────────────────────────
{
  const core = readFileSync(new URL('../lib/babylon/core/IRLCore.ts', import.meta.url), 'utf8');
  ok(/export const G = 9\.81/.test(core), 'flight physics share IRLCore\'s G');
  const tracker = readFileSync(new URL('../lib/irl/dunkTracker.ts', import.meta.url), 'utf8');
  ok(tracker.includes("import { G } from '../babylon/core/IRLCore'"), 'the tracker imports G, not its own constant');
}

if (fail.length) {
  console.error(`prove-it-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`prove-it-tests: ${checks} checks green`);
