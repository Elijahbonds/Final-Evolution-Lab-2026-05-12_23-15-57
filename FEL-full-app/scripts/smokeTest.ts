/**
 * scripts/smokeTest.ts  (M31 — zero-black-screen reliability gate)
 * ================================================================
 * The sandbox has NO GPU / WebGL / camera, so a real headless mode boot is not
 * possible here. Instead this is a STATIC reliability gate that proves the
 * reliability wiring is present and correct, so the guarantees can't silently
 * regress:
 *
 *   1. faceFromLandmarks() only ever emits NAMED Closet options (never invents
 *      strings), for a spread of synthetic face geometries.
 *   2. Every player-spawning mode routes the player through
 *      CharacterPipeline.spawnPlayer (identity pipe), not the raw library.
 *   3. ModeHarness arms the RenderWatchdog after READY and disarms on cleanup.
 *   4. The global crash boundary + crash telemetry route + play layout exist.
 *   5. Every /play/* route ships a page.tsx (no dead route → no white screen).
 *
 * Run: yarn tsx scripts/smokeTest.ts
 */

import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  faceFromLandmarks, type Landmark,
} from '../lib/facescan/faceFromLandmarks';
import {
  FACE_SHAPES, EYE_SHAPES, NOSES, MOUTHS, BROWS, SKIN_TONES, EYE_COLORS,
} from '../lib/closet/wearable-catalog';

const ROOT = join(__dirname, '..');
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`  \u2713 ${name}`); }
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ── 1. faceFromLandmarks always emits valid, named options ─────────────────
function synthFace(seed: number): Landmark[] {
  // 478 deterministic pseudo-random-but-plausible landmarks in [0,1].
  const pts: Landmark[] = [];
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff); };
  for (let i = 0; i < 478; i++) pts.push({ x: 0.3 + rnd() * 0.4, y: 0.2 + rnd() * 0.6, z: rnd() * 0.1 });
  return pts;
}

check('faceFromLandmarks emits only named options across 40 synthetic faces', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const partial = faceFromLandmarks(synthFace(seed), '#C68642', '#3B2A1A');
    if (partial.faceShape) assert.ok(FACE_SHAPES.includes(partial.faceShape), `faceShape ${partial.faceShape}`);
    if (partial.eyeShape) assert.ok(EYE_SHAPES.includes(partial.eyeShape), `eyeShape ${partial.eyeShape}`);
    if (partial.nose) assert.ok(NOSES.includes(partial.nose), `nose ${partial.nose}`);
    if (partial.mouth) assert.ok(MOUTHS.includes(partial.mouth), `mouth ${partial.mouth}`);
    if (partial.brows) assert.ok(BROWS.includes(partial.brows), `brows ${partial.brows}`);
    if (partial.skinTone) assert.ok(SKIN_TONES.includes(partial.skinTone), `skinTone ${partial.skinTone}`);
    if (partial.eyeColor) assert.ok(EYE_COLORS.includes(partial.eyeColor), `eyeColor ${partial.eyeColor}`);
  }
});

check('faceFromLandmarks snaps arbitrary skin/eye colors to catalog swatches', () => {
  const partial = faceFromLandmarks(synthFace(7), '#123456', '#abcdef');
  assert.ok(SKIN_TONES.includes(partial.skinTone!));
  assert.ok(EYE_COLORS.includes(partial.eyeColor!));
});

check('faceFromLandmarks returns {} for degenerate input', () => {
  assert.deepStrictEqual(faceFromLandmarks([], undefined, undefined), {});
});

// ── 2. Every player-spawning mode routes through the grounded spawn path ────
// M35+ canonical spawn path is CharacterLibrary.spawn (auto-grounded +
// neverBindPose). Direct-spawn modes call it in-file; board + precision modes
// spawn through the shared cores (boardCore.buildRig / aimSwingCore.spawnAthlete).
check('every player-spawning mode routes the player through CharacterLibrary.spawn', () => {
  const directModes = ['DunkMode', 'KarateEndlessMode', 'FootballRushMode'];
  for (const m of directModes) {
    const src = read(`lib/babylon/modes/${m}.ts`);
    assert.ok(src.includes('CharacterLibrary.spawn'), `${m} missing CharacterLibrary.spawn`);
  }
  for (const c of ['boardCore', 'aimSwingCore']) {
    const src = read(`lib/babylon/modes/${c}.ts`);
    assert.ok(src.includes('CharacterLibrary.spawn'), `${c} missing CharacterLibrary.spawn`);
  }
});

// ── 3. ModeHarness arms + disarms the RenderWatchdog ────────────────────
check('ModeHarness arms RenderWatchdog after READY and disarms on cleanup', () => {
  const src = read('lib/babylon/core/ModeHarness.ts');
  assert.ok(src.includes("import { RenderWatchdog }"), 'RenderWatchdog not imported');
  assert.ok(src.includes('new RenderWatchdog('), 'RenderWatchdog never constructed');
  assert.ok(src.includes('renderWatchdog.arm()'), 'RenderWatchdog never armed');
  assert.ok((src.match(/renderWatchdog\?\.disarm\(\)/g) || []).length >= 2, 'RenderWatchdog not disarmed on cleanup');
});

check('RenderWatchdog exposes arm() and disarm()', () => {
  const src = read('lib/babylon/core/RenderWatchdog.ts');
  assert.ok(src.includes('arm(') && src.includes('disarm('), 'watchdog API incomplete');
});

// ── 3b. RenderWatchdog v2: samples FINAL frame + is gated on playing ─────
check('RenderWatchdog v2 samples the final composite and gates on isPlaying', () => {
  const wd = read('lib/babylon/core/RenderWatchdog.ts');
  assert.ok(wd.includes('CreateScreenshot'), 'watchdog v2 must sample via CreateScreenshot (final composite)');
  assert.ok(wd.includes('isPlaying'), 'watchdog v2 must take an isPlaying gate');
  assert.ok(!wd.includes('engine.readPixels'), 'watchdog v1 readPixels path must be gone');
  const harness = read('lib/babylon/core/ModeHarness.ts');
  assert.ok(/new RenderWatchdog\(\s*scene,\s*engine,\s*camera,/.test(harness), 'ModeHarness must pass camera to watchdog v2');
  assert.ok(harness.includes("phase === 'playing'"), 'ModeHarness must pass a playing-phase gate');
});

// ── 3c. Every active Babylon mode builds a world (venue/terrain) + ambient (M34/E10) ─
check('every active Babylon mode mounts a world (venue or terrain) and ambient', () => {
  // venue modes: VenueKit + EffectsKit.ambient
  const venueModes: Record<string, string> = {
    DunkMode: 'buildCourt', KarateEndlessMode: 'buildDojo', FootballRushMode: 'buildGridiron',
  };
  for (const [m, fn] of Object.entries(venueModes)) {
    const src = read(`lib/babylon/modes/${m}.ts`);
    assert.ok(src.includes("from '../visual/VenueKit'"), `${m} missing VenueKit import`);
    assert.ok(src.includes(`VenueKit.${fn}`), `${m} missing VenueKit.${fn}`);
    assert.ok(src.includes('EffectsKit.ambient('), `${m} missing EffectsKit.ambient`);
  }
  // precision modes (tennis/golf/baseball/soccer) share aimSwingCore + a field each
  const precision = read('lib/babylon/modes/precisionModes.ts');
  for (const fld of ['tennis', 'golf', 'ballpark', 'pitch']) {
    assert.ok(precision.includes(`VenueKit.buildField(ctx.scene, '${fld}')`), `precisionModes missing buildField('${fld}')`);
  }
  assert.ok(precision.includes('EffectsKit.ambient('), 'precisionModes missing EffectsKit.ambient');
  // board modes build procedural terrain via rideWorlds
  const boardModes: Record<string, string> = {
    SkateRunMode: 'buildSkatepark', SnowboardSlalomMode: 'buildSlopeRun', SurfBreakMode: 'buildSurfBreak',
  };
  for (const [m, fn] of Object.entries(boardModes)) {
    const src = read(`lib/babylon/modes/${m}.ts`);
    assert.ok(src.includes(fn), `${m} missing terrain build ${fn}`);
  }
});

// ── 4. Global crash boundary + telemetry + play layout ──────────────────
check('global error boundary, crash telemetry route, and play layout are present', () => {
  assert.ok(existsSync(join(ROOT, 'components/reliability/global-error-boundary.tsx')));
  assert.ok(existsSync(join(ROOT, 'app/api/telemetry/crash/route.ts')));
  const layout = read('app/play/layout.tsx');
  assert.ok(layout.includes('GlobalErrorBoundary'), 'play layout does not wrap children in the boundary');
});

// ── 5. Every /play/* route ships a page.tsx ─────────────────────────
check('every /play/* route has a page.tsx', () => {
  const playDir = join(ROOT, 'app/play');
  const entries = readdirSync(playDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.ok(entries.length > 0, 'no play routes found');
  for (const e of entries) {
    assert.ok(existsSync(join(playDir, e.name, 'page.tsx')), `play/${e.name} missing page.tsx`);
  }
});

console.log(`\nsmokeTest: ${passed} checks passed \u2705`);
