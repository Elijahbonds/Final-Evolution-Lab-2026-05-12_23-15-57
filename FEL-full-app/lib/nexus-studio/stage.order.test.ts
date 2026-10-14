// THE EDITOR DRAWS WHAT THE MODE DRAWS (docs/NEXUS-STUDIO.md §4.1). ModeHarness and the Studio's stage both mount the look
// stack through ONE function, lib/babylon/core/lookStack.ts mountLookStack (routed one-liner, §8, done 2026-10-14). This holds:
//   1. the look stack's calls, in the harness's historical order, made once each, inside mountLookStack;
//   2. that neither caller makes any of those calls itself (no second rig, backdrop or director slipped in beside it);
//   3. the after-load calls (liftBlackMaterials → adoptRest → captureVenue) in both callers, after load();
//   4. on a real (Null) scene: the hooks run at the points the harness's own work always ran (the scene before the camera;
//      the camera before the mood is read; the mood read once);
//   5. Tiebreak's Studio hooks (the play-test path).
// It replaces the old two-copies comparison: there is one copy now.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube NullEngine cannot build

import { NullEngine, TargetCamera, UniversalCamera, Vector3, type Camera } from '@babylonjs/core';
import { mountLookStack } from '../babylon/core/lookStack';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const harness = read('lib/babylon/core/ModeHarness.ts');
const lookStack = read('lib/babylon/core/lookStack.ts');
const stage = read('lib/nexus-studio/stage.ts');
const runtime = read('lib/nexus-studio/runtime.ts');
const tiebreak = read('lib/babylon/modes/TiebreakMode.ts');

const body = (src: string, start: string) => src.slice(src.indexOf(start));
const stackBody = body(lookStack, 'export async function mountLookStack(');
const harnessBody = body(harness, 'async function mountMode(');
const stageBody = body(stage, 'export async function mountStage(');

/** The look stack, in the order ModeHarness.mountMode made these calls before the extraction (commit 2e70a176). */
const STACK: Array<[string, RegExp]> = [
  ['engine', /await createEngine\(o\.canvas!\)/],
  ['canvas fit', /applyCanvasFit\(engine, o\.canvas\)/],
  ['tier', /detectRenderTier\(o\.canvas, fit, engine\)/],
  ['scene', /new Scene\(engine\)/],
  ['tier on the scene', /\.felTier = tier/],
  ['the mode id on the scene', /felModeId = o\.modeId/],
  ['the harness\'s scene hook (perf guard, agent bridge)', /o\.onScene\?\.\(scene/],
  ['the camera before the rig', /new TargetCamera\('cam', new Vector3\(0, 3, -8\), scene\)/],
  ['the mood, read once after the camera', /const mood = o\.mood\(\)/],
  ['the light rig', /mountLightRig\(scene, mood, tier\)/],
  ['SSAO by tier', /tierRigSettings\(tier, mood\)\.ssao \? mountSsao\(/],
  ['the backdrop', /mountBackdrop\(scene, o\.backdrop\?\.\(\) \?\? MOOD_TO_FAMILY\[mood\] \?\? 'park', mood\)/],
  ['the ink', /autoInk\(scene, inkStyleFor\(o\.modeId\)\)/],
  ['the director', /new CameraDirector\(scene, camera, o\.camPreset\)/],
  ['the letterbox', /mountLetterbox\(scene, o\.canvas, \(\) => camDirector\.cinematic01\)/],
];
const CALLS = ['createEngine(', 'applyCanvasFit(', 'detectRenderTier(', 'new Scene(', 'mountLightRig(', 'mountSsao(', 'mountBackdrop(', 'autoInk(', 'new CameraDirector(', 'mountLetterbox('];
const count = (src: string, s: string) => src.split(s).length - 1;

describe('one look stack, two callers', () => {
  it('mountLookStack makes the look stack\'s calls in the harness\'s order', () => {
    const at = STACK.map(([, re]) => { const m = re.exec(stackBody); return m ? m.index : -1; });
    STACK.forEach(([name], i) => expect(at[i], `${name} not found in mountLookStack`).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < at.length; i++) expect(at[i], `${STACK[i][0]} comes after ${STACK[i - 1][0]}`).toBeGreaterThan(at[i - 1]);
  });

  it('…each exactly once', () => {
    for (const c of CALLS) expect(count(stackBody, c), c).toBe(1);
  });

  it('ModeHarness.mountMode mounts it once, before load(), and makes none of its calls itself', () => {
    expect(count(harnessBody, 'await mountLookStack(')).toBe(1);
    expect(harnessBody.indexOf('await mountLookStack(')).toBeLessThan(harnessBody.indexOf('await def.load(ctx)'));
    for (const c of CALLS) expect(count(harnessBody, c), `${c} in ModeHarness.mountMode`).toBe(0);
    // the harness's own work stays where it ran: the perf guard and the agent bridge in the scene hook, the mood resolved from
    // `def.mood` read once (a per-venue getter), the backdrop a getter too
    expect(harnessBody).toMatch(/onScene: \(scene, \{ engine, fit, tier \}\) => \{[\s\S]*?mountPerfGuard\([\s\S]*?installAgentBridge\(AGENT_MODES\)/);
    expect(harnessBody).toMatch(/mood: \(\) => \{\s*declaredMood = def\.mood;[\s\S]*?resolveModeMood\(def\.modeId, declaredMood\)/);
    expect(harnessBody).toMatch(/backdrop: \(\) => def\.backdrop/);
    expect(harnessBody).toMatch(/modeId: def\.modeId/);
    expect(harnessBody).toMatch(/camPreset: def\.camPreset/);
  });

  it('the Studio\'s stage mounts it once and makes none of its calls itself', () => {
    expect(count(stageBody, 'await mountLookStack(')).toBe(1);
    for (const c of CALLS) expect(count(stageBody, c), `${c} in stage.mountStage`).toBe(0);
    expect(stageBody).toMatch(/modeId: exp\.target/);
    expect(stageBody).toMatch(/mood: \(\) => exp\.mood/);
  });

  it('both callers make the after-load calls in the same order, after load()', () => {
    const after = /liftBlackMaterials\(scene\);[^\n]*\n\s+lights\.adoptRest\(\);[^\n]*\n\s+lights\.captureVenue\(/;
    expect(harnessBody).toMatch(after);
    expect(stageBody).toMatch(after);
    expect(harnessBody.search(after)).toBeGreaterThan(harnessBody.indexOf('await def.load(ctx)'));
    expect(stageBody.search(after)).toBeGreaterThan(stageBody.indexOf('for (const l of STAGE_LAYERS) mountLayer(l)'));
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

describe('mountLookStack on a real (Null) scene', () => {
  it('the hooks run where the harness\'s own work ran; the mood is read once, after the cameras; SSAO takes the hook\'s camera', async () => {
    const order: string[] = [];
    let extra: Camera | null = null;
    const s = await mountLookStack({
      canvas: null, engine: new NullEngine(), modeId: 'tiebreak', tier: 'mobile', camPreset: 'court',
      onScene: (scene, at) => { order.push(`scene:${scene.cameras.length}:${at.tier}:${scene.metadata.felModeId}:${at.fit}`); },
      onCamera: (scene, cam) => { order.push(`camera:${cam.name}`); extra = new UniversalCamera('extra', new Vector3(0, 2, 5), scene); return extra; },
      mood: () => { order.push('mood'); return 'indoorArena'; },
      backdrop: () => { order.push('backdrop'); return undefined; },
    });
    try {
      expect(order).toEqual(['scene:0:mobile:tiebreak:null', 'camera:cam', 'mood', 'backdrop']);
      expect(s.mood).toBe('indoorArena');
      expect(s.camera).toBeInstanceOf(TargetCamera);
      expect(s.camera.name).toBe('cam');
      expect(s.scene.metadata.felTier).toBe('mobile');
      expect(s.fit).toBeNull();   // an engine was handed in: no canvas fit
      expect(s.scene.getLightByName('fel_sun')).toBeTruthy();   // the rig
      expect(s.camDirector).toBeTruthy();
      expect(extra).not.toBeNull();
    } finally {
      s.letterbox.dispose(); s.unink(); s.backdrop.dispose(); s.ssao?.dispose(); s.lights.dispose(); s.scene.dispose(); s.engine.dispose();
    }
  });
});
