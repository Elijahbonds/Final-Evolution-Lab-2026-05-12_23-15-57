/**
 * scripts/rhythm-calibrate-tests.ts
 * PHASE 9 / Part 8.2 — headless invariants for the rhythm calibration math.
 *
 * MUSIC-SUITE P2 (2026-09-25): the clamp is ±400 ms (was ±200 — Bluetooth is often 200–300 ms), the click is 80 BPM
 * (was 100) so a one-beat reading window [-200, +550) ms holds a +400 offset, taps are read as phases on the grid
 * (readCalibrationTaps: nearest-beat pairing read a steady 300 ms-late player as early), the reading is stored with the
 * time it was measured, and ?return= takes same-origin paths only. The expectations below that moved say what they were.
 */
import {
  CALIBRATION, BEAT_INTERVAL_S, STEADY_MIN,
  roundToStep, clampOffset, normalizeOffset,
  computeOffsetMs, adjustedTargetS, nudgeOffset,
  readCalibrationTaps, calibrationAgeText, safeReturnPath,
  parseStoredOffset, parseMeasuredAt, loadAudioCalibration, loadAudioOffsetMs, loadSavedOffsetMs, loadRoomCalibration, saveAudioOffsetMs,
  CALIBRATION_STORAGE_KEY, CALIBRATION_MEASURED_AT_KEY, type CalibrationStore,
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
ok('range -400..400 (was -200..200)', CALIBRATION.MIN_MS === -400 && CALIBRATION.MAX_MS === 400);
ok('bpm 80 (was 100)', CALIBRATION.BPM === 80);
// the reading window is one beat, and the stored ceiling sits inside it with room for tap jitter
ok('one-beat window holds +400 with >= 100 ms to spare', CALIBRATION.EARLIEST_MS + BEAT_INTERVAL_S * 1000 - CALIBRATION.MAX_MS >= 100);
ok('window starts early enough for anticipation (-200)', CALIBRATION.EARLIEST_MS === -200);
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
ok('clamp 999 -> 400 (was 200)', clampOffset(999) === 400);
ok('clamp -999 -> -400 (was -200)', clampOffset(-999) === -400);
ok('clamp 100 stays', clampOffset(100) === 100);
ok('clamp 275 stays (Bluetooth; was clamped to 200)', clampOffset(275) === 275);
ok('clamp NaN -> 0', clampOffset(NaN) === 0);

// --- normalizeOffset (snap + clamp) ---
ok('normalize 213 -> 225 (was clamped to 200)', normalizeOffset(213) === 225);
ok('normalize 187 -> 175', normalizeOffset(187) === 175);
ok('normalize -260 -> -250 (was -200)', normalizeOffset(-260) === -250);
ok('normalize 413 -> 400', normalizeOffset(413) === 400);     // 413->snap425->clamp400
ok('normalize always multiple of 25', [0, 37, 123, -88, 250, 391].every((v) => normalizeOffset(v) % 25 === 0));
ok('normalize always in range', [900, -900, 500, -500, 0, 199, 399].every((v) => {
  const n = normalizeOffset(v); return n >= -400 && n <= 400;
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
// huge late clamps to +400 (was +200)
{
  const beats = [0, 1, 2];
  const taps = [0.5, 1.5, 2.5];
  ok('500ms late clamps +400', computeOffsetMs(beats, taps) === 400);
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
ok('nudge +1 at 200 -> 225 (the old ceiling is gone)', nudgeOffset(200, 1) === 225);
ok('nudge +1 at 400 stays 400', nudgeOffset(400, 1) === 400);
ok('nudge -1 at -400 stays -400', nudgeOffset(-400, -1) === -400);

// --- readCalibrationTaps (MUSIC-SUITE P2: phases on the grid, not the nearest beat) ---
{
  const B = BEAT_INTERVAL_S, grid = 10;
  // a deterministic ±jitter (ms) so every run reads the same
  const JIT = [12, -9, 15, -14, 3, -6, 18, -17, 7, -2, 10, -12, 5, -4, 16, -11];
  const run = (lateMs: number, n = 16, jitter = true) =>
    Array.from({ length: n }, (_, i) => grid + (4 + i) * B + (lateMs + (jitter ? JIT[i % JIT.length] : 0)) / 1000);

  ok('no taps -> 0, not steady', readCalibrationTaps([], grid).offsetMs === 0 && !readCalibrationTaps([], grid).steady);
  ok('on the beat -> 0', readCalibrationTaps(run(0), grid).offsetMs === 0);
  ok('40 ms late -> +50', readCalibrationTaps(run(40), grid).offsetMs === 50);
  ok('40 ms early -> -50', readCalibrationTaps(run(-40), grid).offsetMs === -50);
  ok('Bluetooth 250 ms -> +250', readCalibrationTaps(run(250), grid).offsetMs === 250);
  ok('Bluetooth 300 ms -> +300', readCalibrationTaps(run(300), grid).offsetMs === 300);
  ok('380 ms late -> +375', readCalibrationTaps(run(380), grid).offsetMs === 375);
  ok('400 ms late -> +400', readCalibrationTaps(run(400), grid).offsetMs === 400);
  ok('500 ms late clamps +400', readCalibrationTaps(run(500), grid).offsetMs === 400);
  ok('steady taps are steady', readCalibrationTaps(run(250), grid).steady && readCalibrationTaps(run(250), grid).steadiness > 0.95);
  // the same 300 ms-late taps, paired with the NEAREST beat (the old screen): read as early, the average collapses
  {
    const taps = run(300);
    const beats = Array.from({ length: 24 }, (_, i) => grid + i * (0.6));   // the old 100 BPM grid
    const oldTaps = Array.from({ length: 16 }, (_, i) => grid + (4 + i) * 0.6 + (300 + JIT[i]) / 1000);
    const nearest = oldTaps.map((t) => beats.reduce((a, b) => (Math.abs(t - b) < Math.abs(t - a) ? b : a)));
    ok('the old nearest-beat pairing misread a steady 300 ms (regression pin)', computeOffsetMs(nearest, oldTaps) < 200);
    ok('the phase reading does not', readCalibrationTaps(taps, grid).offsetMs === 300);
  }
  // a tap in the lead-in, or two beats late, is the same phase: it reads the same
  {
    const taps = run(250);
    taps[0] -= 2 * B;
    taps[5] += 3 * B;
    ok('which beat a tap belongs to never matters', readCalibrationTaps(taps, grid).offsetMs === 250);
  }
  // taps spread all over the beat are not a reading to trust
  {
    const uneven = Array.from({ length: 16 }, (_, i) => grid + i * B + ((i * 0.37) % 1) * B);
    const r = readCalibrationTaps(uneven, grid);
    ok('uneven taps are not steady', !r.steady && r.steadiness < STEADY_MIN);
  }
  ok('non-finite taps are ignored', readCalibrationTaps([NaN, ...run(100)], grid).taps === 16);
}

// --- when it was measured ---
ok('age: never dated -> null', calibrationAgeText(null, 1e12) === null);
ok('age: same day -> today', calibrationAgeText(1e12, 1e12 + 3_600_000) === 'today');
ok('age: 1 day -> yesterday', calibrationAgeText(1e12, 1e12 + 86_400_000 + 5) === 'yesterday');
ok('age: 9 days', calibrationAgeText(1e12, 1e12 + 9 * 86_400_000) === '9 days ago');
ok('age: a clock behind the reading -> today', calibrationAgeText(1e12, 1e12 - 5000) === 'today');

// --- storage (a Map-backed store: the browser's localStorage in the app) ---
{
  const mem = new Map<string, string>();
  const store: CalibrationStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } };
  ok('empty store -> 0, undated, not saved', loadAudioCalibration(store).offsetMs === 0 && loadAudioCalibration(store).measuredAt === null && !loadAudioCalibration(store).saved);
  ok('never saved -> loadSavedOffsetMs null (the rooms fall back to outputLatency)', loadSavedOffsetMs(store) === null);
  saveAudioOffsetMs(0, 1_758_800_000_000, store);
  ok('a saved 0 is a calibration', loadSavedOffsetMs(store) === 0 && loadAudioCalibration(store).saved);
  saveAudioOffsetMs(262, 1_758_800_000_000, store);
  ok('saves snapped, with its date', loadAudioCalibration(store).offsetMs === 250 && loadAudioCalibration(store).measuredAt === 1_758_800_000_000);
  ok('the offset key keeps its plain-integer format', mem.get(CALIBRATION_STORAGE_KEY) === '250' && parseInt(mem.get(CALIBRATION_STORAGE_KEY)!, 10) === 250);
  ok('loadAudioOffsetMs reads the same store', loadAudioOffsetMs(store) === 250);
  mem.delete(CALIBRATION_MEASURED_AT_KEY); mem.set(CALIBRATION_STORAGE_KEY, '175');
  ok('an offset saved before the date was kept reads undated', loadAudioCalibration(store).offsetMs === 175 && loadAudioCalibration(store).measuredAt === null);
  // MUSIC-SUITE P2 FIX PASS (2026-09-25): the rooms apply a saved offset in place of outputLatency; an undated one came from
  // the old nearest-click reader (±200 clamp, late taps read as early), so no room applies it and both ask for a redo
  ok('an undated offset is not applied by the rooms (loadSavedOffsetMs null) and reads stale', loadSavedOffsetMs(store) === null && loadRoomCalibration(store).offsetMs === null && loadRoomCalibration(store).stale);
  saveAudioOffsetMs(175, 1_758_800_000_000, store);
  ok('the same offset measured by the new reader is applied, not stale', loadSavedOffsetMs(store) === 175 && !loadRoomCalibration(store).stale);
  mem.set(CALIBRATION_STORAGE_KEY, 'garbage');
  ok('an unreadable offset reads 0, and as never saved', loadAudioOffsetMs(store) === 0 && loadSavedOffsetMs(store) === null);
  const throwing: CalibrationStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  ok('a blocked store reads 0 and saving does not throw', loadAudioOffsetMs(throwing) === 0 && (saveAudioOffsetMs(100, 1, throwing), true));
  ok('no store (SSR) reads 0', loadAudioOffsetMs(null) === 0);
  ok('parseStoredOffset clamps an out-of-range value', parseStoredOffset('900') === 400);
  ok('parseMeasuredAt refuses junk', parseMeasuredAt('abc') === null && parseMeasuredAt('-5') === null && parseMeasuredAt('') === null);
}

// --- ?return= (same-origin paths only) ---
ok('return: a room path', safeReturnPath('/play/dance') === '/play/dance');
ok('return: keeps a query', safeReturnPath('/play/music?stage=perform') === '/play/music?stage=perform');
ok('return: refuses protocol-relative', safeReturnPath('//evil.example/x') === null);
ok('return: refuses a backslash', safeReturnPath('/\\evil.example') === null);
ok('return: refuses a tab trick', safeReturnPath('/\t/evil.example') === null);
ok('return: refuses a scheme', safeReturnPath('https://evil.example/') === null && safeReturnPath('javascript:alert(1)') === null);
ok('return: refuses relative and empty', safeReturnPath('play/dance') === null && safeReturnPath('') === null && safeReturnPath(undefined) === null);
ok('return: refuses arrays / non-strings', safeReturnPath(['/play/dance']) === null && safeReturnPath(42) === null);
ok('return: refuses a very long one', safeReturnPath('/' + 'a'.repeat(600)) === null);
ok('return: leading spaces cannot hide a //', safeReturnPath('  //evil.example') === null);

if (failed > 0) {
  console.error(`\n❌ rhythm-calibrate: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`✅ rhythm-calibrate: all ${passed} invariants passed`);
}
