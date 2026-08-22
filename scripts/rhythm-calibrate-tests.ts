/**
 * scripts/rhythm-calibrate-tests.ts
 * PHASE 9 / Part 8.2 — headless invariants for the rhythm calibration math.
 */
import {
  CALIBRATION, BEAT_INTERVAL_S,
  roundToStep, clampOffset, normalizeOffset,
  computeOffsetMs, adjustedTargetS, nudgeOffset,
} from '../lib/feel/rhythm-calibrate';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; console.error('  ✗ ' + name); }
}
function near(a: number, b: number, eps = 1e-9) { return Math.abs(a - b) <= eps; }

// --- constants ---
ok('tap count 16', CALIBRATION.TAP_COUNT === 16);
ok('step 25ms', CALIBRATION.STEP_MS === 25);
ok('range -200..200', CALIBRATION.MIN_MS === -200 && CALIBRATION.MAX_MS === 200);
ok('beat interval matches bpm', near(BEAT_INTERVAL_S, 60 / CALIBRATION.BPM));

// --- roundToStep ---
ok('round 12 -> 0', roundToStep(12) === 0);
ok('round 13 -> 25', roundToStep(13) === 25);
ok('round 37 -> 25', roundToStep(37) === 25);
ok('round 38 -> 50', roundToStep(38) === 50);
ok('round -13 -> -25', roundToStep(-13) === -25);
ok('round exact 75', roundToStep(75) === 75);
ok('round NaN -> 0', roundToStep(NaN) === 0);

// --- clampOffset ---
ok('clamp 999 -> 200', clampOffset(999) === 200);
ok('clamp -999 -> -200', clampOffset(-999) === -200);
ok('clamp 100 stays', clampOffset(100) === 100);
ok('clamp NaN -> 0', clampOffset(NaN) === 0);

// --- normalizeOffset (snap + clamp) ---
ok('normalize 213 -> 200', normalizeOffset(213) === 200);      // 213->snap225->clamp200
ok('normalize 187 -> 175', normalizeOffset(187) === 175);
ok('normalize -260 -> -200', normalizeOffset(-260) === -200);
ok('normalize always multiple of 25', [0, 37, 123, -88, 250].every((v) => normalizeOffset(v) % 25 === 0));
ok('normalize always in range', [500, -500, 0, 199].every((v) => {
  const n = normalizeOffset(v); return n >= -200 && n <= 200;
}));

// --- computeOffsetMs ---
ok('empty -> 0', computeOffsetMs([], []) === 0);
// perfectly on-beat -> 0 offset
{
  const beats = Array.from({ length: 16 }, (_, i) => i * BEAT_INTERVAL_S);
  ok('on-beat -> 0', computeOffsetMs(beats, beats.slice()) === 0);
}
// consistently 40ms late -> +50 (snapped)
{
  const beats = Array.from({ length: 16 }, (_, i) => i * BEAT_INTERVAL_S);
  const taps = beats.map((b) => b + 0.04);
  ok('40ms late -> +50', computeOffsetMs(beats, taps) === 50);
}
// consistently 40ms early -> -50
{
  const beats = Array.from({ length: 16 }, (_, i) => i * BEAT_INTERVAL_S);
  const taps = beats.map((b) => b - 0.04);
  ok('40ms early -> -50', computeOffsetMs(beats, taps) === -50);
}
// huge late clamps to +200
{
  const beats = [0, 1, 2];
  const taps = [0.5, 1.5, 2.5];
  ok('500ms late clamps +200', computeOffsetMs(beats, taps) === 200);
}
// mismatched lengths clip to shorter
{
  const beats = [0, 1, 2, 3];
  const taps = [0.02, 1.02]; // only 2 pairs, +20ms avg -> snap +25
  ok('mismatched length clips to shorter', computeOffsetMs(beats, taps) === 25);
}

// --- adjustedTargetS ---
ok('adjust +50ms', near(adjustedTargetS(2.0, 50), 2.05));
ok('adjust -75ms', near(adjustedTargetS(2.0, -75), 1.925));
ok('adjust 0', near(adjustedTargetS(3.3, 0), 3.3));

// --- nudgeOffset ---
ok('nudge +1 from 0 -> 25', nudgeOffset(0, 1) === 25);
ok('nudge -1 from 0 -> -25', nudgeOffset(0, -1) === -25);
ok('nudge +1 at 200 stays 200', nudgeOffset(200, 1) === 200);
ok('nudge -1 at -200 stays -200', nudgeOffset(-200, -1) === -200);

if (failed > 0) {
  console.error(`\n❌ rhythm-calibrate: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`✅ rhythm-calibrate: all ${passed} invariants passed`);
}
