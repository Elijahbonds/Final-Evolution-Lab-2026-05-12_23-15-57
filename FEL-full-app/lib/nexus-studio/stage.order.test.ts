// THE EDITOR DRAWS WHAT THE MODE DRAWS (docs/NEXUS-STUDIO.md §4.1). The stage runs ModeHarness's look stack itself (the
// harness's runMode is a game session), so this reads both files and holds them to one order of the same calls. When the
// harness changes its mount, this fails and points at lib/nexus-studio/stage.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const harness = readFileSync(join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8');
const stage = readFileSync(join(ROOT, 'lib/nexus-studio/stage.ts'), 'utf8');
const runtime = readFileSync(join(ROOT, 'lib/nexus-studio/runtime.ts'), 'utf8');
const tiebreak = readFileSync(join(ROOT, 'lib/babylon/modes/TiebreakMode.ts'), 'utf8');

/** The look stack, in the harness's order: [what to find in the harness, what to find in the stage]. */
const STACK: Array<[string, RegExp, RegExp]> = [
  ['engine', /await createEngine\(/, /await createEngine\(/],
  ['canvas fit', /applyCanvasFit\(engine, opts\.canvas\)/, /applyCanvasFit\(engine, canvas\)/],
  ['tier', /detectRenderTier\(opts\.canvas, fit, engine\)/, /detectRenderTier\(canvas, fit, engine\)/],
  ['scene', /new Scene\(engine\)/, /new Scene\(engine\)/],
  ['tier on the scene', /\.felTier = tier/, /\.felTier = tier/],
  ['the mode id on the scene', /felModeId = def\.modeId/, /felModeId = exp\.target/],
  ['the camera before the rig', /new TargetCamera\('cam'/, /new TargetCamera\('cam'/],
  ['the light rig', /mountLightRig\(scene, mood, tier\)/, /mountLightRig\(scene, mood, tier\)/],
  ['SSAO by tier', /tierRigSettings\(tier, mood\)\.ssao \? mountSsao\(/, /tierRigSettings\(tier, mood\)\.ssao \? mountSsao\(/],
  ['the backdrop', /mountBackdrop\(scene, def\.backdrop \?\? MOOD_TO_FAMILY\[mood\]/, /mountBackdrop\(scene, MOOD_TO_FAMILY\[mood\]/],
  ['the ink', /autoInk\(scene, inkStyleFor\(def\.modeId\)\)/, /autoInk\(scene, inkStyleFor\(exp\.target\)\)/],
  ['the director', /new CameraDirector\(scene, camera, def\.camPreset\)/, /new CameraDirector\(scene, shot, /],
  ['the letterbox', /mountLetterbox\(scene, opts\.canvas/, /mountLetterbox\(scene, canvas/],
  ['load()', /await def\.load\(ctx\)/, /for \(const l of STAGE_LAYERS\) mountLayer\(l\)/],
  ['lift black materials, then the rest grade', /liftBlackMaterials\(scene\);[^\n]*\n\s+lights\.adoptRest\(\)/, /liftBlackMaterials\(scene\);[^\n]*\n\s+lights\.adoptRest\(\)/],
  ['capture the venue', /lights\.captureVenue\(/, /lights\.captureVenue\(subject\(\)\)/],
];

function order(src: string, pick: 1 | 2): number[] {
  const body = pick === 1 ? src.slice(src.indexOf('async function mountMode(')) : src.slice(src.indexOf('export async function mountStage('));
  return STACK.map((row) => { const m = (row[pick] as RegExp).exec(body); return m ? m.index : -1; });
}

describe('the stage is the harness\'s look stack', () => {
  it('every call the harness makes is in the harness, in this order (if this fails, ModeHarness changed: update stage.ts)', () => {
    const at = order(harness, 1);
    STACK.forEach(([name], i) => expect(at[i], `${name} not found in ModeHarness.mountMode`).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < at.length; i++) expect(at[i], `${STACK[i][0]} comes after ${STACK[i - 1][0]} in the harness`).toBeGreaterThan(at[i - 1]);
  });

  it('the stage makes the same calls in the same order', () => {
    const at = order(stage, 2);
    STACK.forEach(([name], i) => expect(at[i], `${name} not found in stage.ts`).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < at.length; i++) expect(at[i], `${STACK[i][0]} comes after ${STACK[i - 1][0]} in the stage`).toBeGreaterThan(at[i - 1]);
  });

  it('the stage\'s load() is the mode\'s: mountVenue with the Studio look, then the runtime layers', () => {
    expect(stage).toMatch(/mountVenue\(ctx, exp\.spec, \{ keepGameplayCamera: true, look: studioLook\(exp\) \}\)/);
    for (const layer of ['mountMeshyLayer', 'mountFixtureLayer', 'mountDecalLayer', 'mountCrowdLayer', 'mountWeatherLayer']) {
      expect(stage, layer).toContain(`${layer}(`);
      expect(runtime, layer).toMatch(new RegExp(`layers = \\{[\\s\\S]*${layer}\\(`));   // mountStudioExtras (the mode's call) mounts the same layer
    }
  });

  it('Tiebreak mounts the same look and the same extras, and keeps its own values without a Studio venue', () => {
    expect(tiebreak).toMatch(/look: studioLookFor\('tiebreak'\) \?\? readPlaceLook\('tiebreak'\)/);
    expect(tiebreak).toMatch(/studio = mountStudioFor\('tiebreak', ctx\)/);
    expect(tiebreak).toMatch(/get mood\(\) \{ return studioMood\('tiebreak', 'goldenHour'\); \}/);
    expect(tiebreak).toMatch(/studio\?\.dispose\(\)/);
  });
});
