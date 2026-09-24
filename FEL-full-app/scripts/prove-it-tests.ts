#!/usr/bin/env -S npx tsx
// Prove It (IRL dunk duel) headless checks — synthetic pose streams through
// the real tracker. The camera can't be driven headless, so the MEASUREMENT
// core is proven here frame-by-frame: a scripted jump with known physics
// must come out as the known numbers.
//
// Run: npx tsx scripts/prove-it-tests.ts

import { readFileSync } from 'node:fs';
import {
  DunkTracker, scoreIrlDunk, DUNK_POSE_IDX, MAX_VERTICAL_CM, refusalLine,
  type TrackerFrame, type TrackerLandmark,
} from '../lib/irl/dunkTracker';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const FLOOR_ANKLE_Y = 0.9;
const HIP_Y = 0.55;

interface PoseOpts {
  ankleRise?: number;       // how far ankles lift (image units, y-down)
  leftRise?: number;        // one foot only (overrides ankleRise for that foot)
  rightRise?: number;
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
  set(DUNK_POSE_IDX.leftAnkle, hipX - sep, FLOOR_ANKLE_Y - (o.leftRise ?? rise));
  set(DUNK_POSE_IDX.rightAnkle, hipX + sep, FLOOR_ANKLE_Y - (o.rightRise ?? rise));
  set(DUNK_POSE_IDX.nose, hipX, 0.33);
  set(DUNK_POSE_IDX.leftWrist, o.wristX ?? hipX - 0.12, o.wristY ?? 0.55);
  set(DUNK_POSE_IDX.rightWrist, o.wristX ?? hipX + 0.12, o.wristY ?? 0.55);
  return { landmarks: lms, timestampMs: t, present: true };
}

/** A scripted dunk: stand (calibrate) → run-up → jump of `flightMs` → land → settle.
 *  `stepMs` is the camera frame interval (33 = 30 fps); `feedsPerFrame` feeds each camera frame that many times,
 *  as a rAF loop faster than the camera does (adapter.detect() hands back the same frame until the video advances). */
function runDunk(opts: {
  flightMs: number; runUp?: boolean; wristArc?: boolean; belowHip?: boolean;
  roll?: number; ankleSep?: number; sway?: boolean; stepMs?: number; feedsPerFrame?: number;
}): { metrics: import('../lib/irl/dunkTracker').DunkMetrics | null; tracker: DunkTracker } {
  const tr = new DunkTracker();
  let result: import('../lib/irl/dunkTracker').DunkMetrics | null = null;
  let t = 0;
  const dt = opts.stepMs ?? 33;
  const feeds = opts.feedsPerFrame ?? 1;
  const step = (ms: number, o: PoseOpts) => {
    t += ms;
    const f = frame(t, o);
    for (let r = 0; r < feeds; r++) { const got = tr.feed(f); if (got) result = got; }
  };
  // stand still for calibration (25 frames at 30 fps)
  for (let i = 0, n = Math.round(825 / dt); i < n; i++) step(dt, {});
  // run-up: hips travel left→right over 0.5s
  if (opts.runUp) for (let i = 0, n = Math.round(495 / dt); i < n; i++) step(dt, { hipX: 0.35 + ((i * dt) / 33) * 0.015 });
  // the jump
  const air = Math.floor(opts.flightMs / dt);
  for (let i = 0; i < air; i++) {
    const k = i / Math.max(1, air - 1);                       // 0..1 across flight
    const rise = 0.06 + Math.sin(k * Math.PI) * 0.06;          // up and back down
    const wristY = opts.belowHip && k > 0.3 && k < 0.6 ? 0.62 : 0.35 - Math.sin(k * Math.PI) * 0.2;
    const wristX = opts.wristArc ? 0.5 + Math.sin(k * Math.PI * 2) * 0.25 : undefined;
    step(dt, { ankleRise: rise, shoulderRoll: (opts.roll ?? 0) * k, wristY, wristX, ankleSep: opts.ankleSep });
  }
  // landing + settle (with optional sway)
  for (let i = 0, n = Math.round(660 / dt); i < n; i++) step(dt, { hipX: 0.5 + (opts.sway ? Math.sin(i * 1.3) * 0.06 : 0) });
  return { metrics: result, tracker: tr };
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

// ── a step is not a jump: BOTH feet must leave the floor ────────────────────
{
  const tr = new DunkTracker();
  let t = 0;
  let got: unknown = null;
  let wentAirborne = false;
  const step = (o: PoseOpts) => { t += 33; if (tr.feed(frame(t, o))) got = true; if (tr.state === 'airborne') wentAirborne = true; };
  for (let i = 0; i < 25; i++) step({});
  // one foot lifted high for 300 ms (the mean of the two ankles used to clear the line), then the other
  for (let i = 0; i < 9; i++) step({ leftRise: 0.08 });
  for (let i = 0; i < 20; i++) step({});
  for (let i = 0; i < 9; i++) step({ rightRise: 0.08 });
  for (let i = 0; i < 20; i++) step({});
  ok(got === null, 'one foot lifted for 300 ms is not a jump');
  ok(!wentAirborne, 'stepping never reads as airborne');
  // and the flight is the time BOTH feet were off: it ends when the first foot lands
  const tr2 = new DunkTracker();
  let t2 = 0;
  let m2: import('../lib/irl/dunkTracker').DunkMetrics | null = null;
  const step2 = (o: PoseOpts) => { t2 += 33; const r = tr2.feed(frame(t2, o)); if (r) m2 = r; };
  for (let i = 0; i < 25; i++) step2({});
  for (let i = 0; i < 15; i++) step2({ ankleRise: 0.08 });             // both off, 495 ms
  for (let i = 0; i < 6; i++) step2({ leftRise: 0, rightRise: 0.08 });  // left foot down, right still up
  for (let i = 0; i < 20; i++) step2({});
  ok(m2 !== null && (m2 as { flightTimeMs: number }).flightTimeMs === 495,
    `the first foot down ends the flight (got ${(m2 as { flightTimeMs: number } | null)?.flightTimeMs})`);
  // a split stance (one foot nearer the camera sits lower in the image) times the same jump as a level one: the
  // floor is calibrated on the lower ankle, the same signal takeoff and landing read
  const smoothFlight = (stagger: number): number | null => {
    const tr3 = new DunkTracker();
    let t3 = 0;
    let m: import('../lib/irl/dunkTracker').DunkMetrics | null = null;
    const s3 = (rise: number) => { t3 += 33; const r = tr3.feed(frame(t3, { leftRise: rise, rightRise: rise + stagger })); if (r) m = r; };
    for (let i = 0; i < 25; i++) s3(0);
    for (let i = 1; i < 24; i++) s3(0.1 * Math.sin((i / 24) * Math.PI));   // a gradual rise and fall
    for (let i = 0; i < 20; i++) s3(0);
    return (m as { flightTimeMs: number } | null)?.flightTimeMs ?? null;
  };
  const level = smoothFlight(0), split = smoothFlight(0.04);
  ok(level !== null && split === level, `a split stance times the jump as a level one does (got ${split} vs ${level})`);
}

// ── the approach window survives a fast feed ────────────────────────────────
{
  const ref = runDunk({ flightMs: 500, runUp: true }).metrics!;
  ok(ref.approachSpeed > 0.3, `a run-up reads as approach speed at 30 fps (got ${ref.approachSpeed})`);
  // a 120 Hz pose feed: the old 90-entry trail was evicted before the landing settled
  const fast = runDunk({ flightMs: 500, runUp: true, stepMs: 8 }).metrics!;
  ok(Math.abs(fast.approachSpeed - ref.approachSpeed) < ref.approachSpeed * 0.2,
    `a 120 Hz feed keeps approachSpeed (got ${fast.approachSpeed} vs ${ref.approachSpeed})`);
  // a 30 fps camera under a 120 Hz rAF loop: every frame arrives four times
  const dup = runDunk({ flightMs: 500, runUp: true, feedsPerFrame: 4 }).metrics!;
  ok(dup.approachSpeed === ref.approachSpeed, `duplicate frames change nothing (got ${dup.approachSpeed} vs ${ref.approachSpeed})`);
  ok(dup.landingStability === ref.landingStability && dup.flightTimeMs === ref.flightTimeMs, 'duplicate frames keep the landing and the flight');
}

// ── the tracker refuses what /api/mirror/dunks refuses, and says why ───────
{
  const high = runDunk({ flightMs: 1000 });                   // 990 ms ≈ 120 cm: a real (huge) jump
  ok(high.metrics !== null && high.metrics.verticalCm <= MAX_VERTICAL_CM, `a ~1 s flight is measured (got ${high.metrics?.verticalCm} cm)`);
  ok(high.tracker.takeRefusal() === null, 'a measured jump carries no refusal');
  const long = runDunk({ flightMs: 1100 });                   // 1089 ms ≈ 145 cm: the route would refuse it
  ok(long.metrics === null, 'a flight the route would refuse is not reported as a measurement');
  ok(long.tracker.takeRefusal() === 'implausible_vertical', 'it is refused with the route\'s own reason');
  ok(long.tracker.takeRefusal() === null, 'a refusal is handed over once');
  ok(/130 cm/.test(refusalLine('implausible_vertical')), 'the refusal line names the cap');
  // a landing the camera never sees closes the attempt on the safety clock, refused, not silent
  const tr = new DunkTracker();
  let t = 0;
  for (let i = 0; i < 25; i++) tr.feed(frame((t += 33), {}));
  for (let i = 0; i < 90; i++) tr.feed(frame((t += 33), { ankleRise: 0.08 }));   // ~3 s up: past the safety clock
  for (let i = 0; i < 20; i++) tr.feed(frame((t += 33), {}));
  ok(tr.takeRefusal() === 'implausible_flight', 'an unseen landing is refused as implausible_flight');
  // a hop is not an attempt: nothing to show
  const hop = runDunk({ flightMs: 100 });
  ok(hop.metrics === null && hop.tracker.takeRefusal() === null, 'a 100 ms hop is dropped without a refusal');
  // every flight the tracker accepts is inside the route's bounds
  let inBounds = true;
  for (let ms = 200; ms <= 1300; ms += 50) {
    const m = runDunk({ flightMs: ms }).metrics;
    if (m && !(m.verticalCm > 0 && m.verticalCm <= MAX_VERTICAL_CM && m.flightTimeMs > 0 && m.flightTimeMs <= 1400)) inBounds = false;
  }
  ok(inBounds, 'every accepted measurement is one the route stores');
  const route = readFileSync(new URL('../app/api/mirror/dunks/route.ts', import.meta.url), 'utf8');
  ok(/import \{[^}]*\bMAX_VERTICAL_CM\b[^}]*\} from '@\/lib\/irl\/dunkTracker'/.test(route) && !/const MAX_VERTICAL_CM/.test(route),
    'the route reads the vertical cap from the tracker (one number, not two)');
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
