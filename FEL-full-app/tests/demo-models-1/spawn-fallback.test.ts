// DEMO-MODELS-1: CharacterLibrary.spawn on the real path (NullEngine). With a setting on and the coach file failing to load, the
// player still spawns, on the body the coach body replaced (the Meshy scan for the owner, the kit body for the /try dunk guest).
// With every setting off the coach file is never requested.
// v2: setting 5 is gone, and setting 4 reaches only the /try dunk demo's scene (stamped by ModeHarness for a known-guest `dunk`
// mount): the exercise stage (workouts and anatomy are one stage, exercise-stage.tsx, felModeId 'library') keeps every viewer's
// own body, a guest's included, with every setting on.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/babylon/core/playerIdentity', async (orig) => {
  const real = await orig<typeof import('@/lib/babylon/core/playerIdentity')>();
  return { ...real, resolveIdentity: vi.fn(async () => ({ ...(await real.resolveIdentity().catch(() => null)), body: h.body, custom: false })) };
});
const h = vi.hoisted(() => ({ body: 'scan' as 'scan' | 'kit-male' | 'kit-female' }));

import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterLibrary } from '@/lib/babylon/core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '@/lib/babylon/core/athleteRoster';
import { COACH_BODY_URL, KIT_BODY_URL, SCAN_BODY_URL } from '@/lib/babylon/core/heroBody';
import { NO_DEMO_MODEL_FLAGS, setDemoModelFlags, type DemoModelFlags } from '@/lib/babylon/core/demoModels';
import { setSignedOutVisitor } from '@/lib/babylon/core/visitor';

const realLoad = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
let kitData = '';
const asked: string[] = [];
beforeAll(() => {
  kitData = `data:model/gltf-binary;base64,${readFileSync(`public${KIT_BODY_URL.male}`).toString('base64')}`;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })));
  // every body file stands in as the kit body's bytes (no network); the coach file "will not load"
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(((root: string, file: string, scene: Scene) => {
    const url = `${root}${file}`;
    asked.push(url);
    if (url === COACH_BODY_URL) return Promise.reject(new Error('404 (the coach file is not deployed)'));
    return realLoad('', kitData, scene, undefined, '.glb');
  }) as never);
});
afterEach(() => { setDemoModelFlags(NO_DEMO_MODEL_FLAGS); setSignedOutVisitor(false); asked.length = 0; });

type Where = 'tryDunk' | 'exerciseStage' | 'play';
/** The scene the way each host builds it: /try's dunk (lookStack's felModeId + the harness's known-guest stamp), the exercise /
 *  anatomy stage (exercise-stage.tsx: felModeId 'library', never stamped), a signed-in mode. */
function sceneFor(where: Where): Scene {
  const scene = new Scene(new NullEngine());
  scene.metadata = where === 'tryDunk' ? { felTier: 'desktop', felModeId: 'dunk', felTryDunkGuest: true }
    : where === 'exerciseStage' ? { felTier: 'desktop', felModeId: 'library' } : { felTier: 'desktop', felModeId: 'dunk' };
  return scene;
}
async function spawnWith(flags: Partial<DemoModelFlags>, o: { body: typeof h.body; guest?: boolean; where?: Where }) {
  h.body = o.body;
  asked.length = 0;
  setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, ...flags });
  setSignedOutVisitor(o.guest === true);
  const scene = sceneFor(o.where ?? 'play');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // the exercise stage's own spawn options (exercise-stage.tsx: role player, idle_stand, deferred hero capture)
  const s = o.where === 'exerciseStage'
    ? await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', startClip: 'idle_stand', deferHeroCapture: true })
    : await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', identity: false });
  const warned = warn.mock.calls.map((c) => String(c[0]));
  warn.mockRestore();
  const bodies = asked.filter((u) => /\.glb$/.test(u));
  scene.dispose();
  return { s, bodies, warned };
}
const ALL_ON: Partial<DemoModelFlags> = { coachBody: true, coachBodyMask: true, rivalPrefetch: true, tryGuestCoach: true, crowdForgeFront: true };

describe('CharacterLibrary.spawn: the coach body and its fallback', () => {
  it('every setting off: the owner spawns the scan and the coach file is never asked for', async () => {
    const r = await spawnWith({}, { body: 'scan' });
    expect(r.s.meshes.length).toBeGreaterThan(0);
    expect(r.bodies).toContain(SCAN_BODY_URL);
    expect(r.bodies).not.toContain(COACH_BODY_URL);
  });
  it('every setting off: a /try guest spawns the kit body, the exercise stage spawns the viewer\'s own body (no coach file)', async () => {
    expect((await spawnWith({}, { body: 'kit-male', guest: true, where: 'tryDunk' })).bodies).toEqual([KIT_BODY_URL.male]);
    expect((await spawnWith({}, { body: 'kit-female', where: 'exerciseStage' })).bodies).toEqual([KIT_BODY_URL.female]);
  });
  it('1 on, the coach file failing: the owner still spawns, on the Meshy scan (warned once)', async () => {
    const r = await spawnWith({ coachBody: true }, { body: 'scan' });
    expect(r.s.meshes.length).toBeGreaterThan(0);
    expect(r.bodies).toEqual([COACH_BODY_URL, SCAN_BODY_URL]);
    expect(r.warned.some((w) => w.includes(`"${COACH_BODY_URL}" unavailable, using "${SCAN_BODY_URL}"`))).toBe(true);
  });
  it('4 on, the coach file failing: the /try dunk guest spawns the kit body', async () => {
    const r = await spawnWith({ tryGuestCoach: true }, { body: 'kit-male', guest: true, where: 'tryDunk' });
    expect(r.bodies).toEqual([COACH_BODY_URL, KIT_BODY_URL.male]);
  });
  // v2: the setting-5 test ("5 on … the demo spawns the viewer's own body") was removed with setting 5.
  it('1 on, the coach file loading: the owner spawns the coach file and nothing else', async () => {
    const coach = `data:model/gltf-binary;base64,${readFileSync(`public${COACH_BODY_URL}`).toString('base64')}`;
    (SceneLoader.LoadAssetContainerAsync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(((root: string, file: string, scene: Scene) => {
      asked.push(`${root}${file}`);
      return realLoad('', coach, scene, undefined, '.glb');
    }) as never);
    const r = await spawnWith({ coachBody: true }, { body: 'scan' });
    expect(r.bodies).toEqual([COACH_BODY_URL]);
    expect(r.s.meshes.some((m) => /^CoachHair_/.test(m.name))).toBe(true);
  });
});

describe('v2: setting 4 stays in the /try dunk demo; workouts and anatomy keep the viewer\'s own body', () => {
  it('a signed-out guest in the exercise stage with setting 4 on gets the kit body (the coach file is never asked for)', async () => {
    const r = await spawnWith({ tryGuestCoach: true }, { body: 'kit-male', guest: true, where: 'exerciseStage' });
    expect(r.bodies).toEqual([KIT_BODY_URL.male]);
  });
  it('with ALL settings on, the exercise / anatomy stage loads the viewer\'s own body — guest, kit-male or kit-female viewer', async () => {
    expect((await spawnWith(ALL_ON, { body: 'kit-male', guest: true, where: 'exerciseStage' })).bodies).toEqual([KIT_BODY_URL.male]);
    expect((await spawnWith(ALL_ON, { body: 'kit-male', where: 'exerciseStage' })).bodies).toEqual([KIT_BODY_URL.male]);
    expect((await spawnWith(ALL_ON, { body: 'kit-female', where: 'exerciseStage' })).bodies).toEqual([KIT_BODY_URL.female]);
  });
  it('the /try dunk demo guest with setting 4 on still gets the coach body (it loads: only the coach file is asked for)', async () => {
    const coach = `data:model/gltf-binary;base64,${readFileSync(`public${COACH_BODY_URL}`).toString('base64')}`;
    (SceneLoader.LoadAssetContainerAsync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(((root: string, file: string, scene: Scene) => {
      asked.push(`${root}${file}`);
      return realLoad('', coach, scene, undefined, '.glb');
    }) as never);
    const r = await spawnWith({ tryGuestCoach: true }, { body: 'kit-male', guest: true, where: 'tryDunk' });
    expect(r.bodies).toEqual([COACH_BODY_URL]);
    expect(r.s.meshes.some((m) => /^CoachHair_/.test(m.name))).toBe(true);
  });
  it('setting 4 needs BOTH the stamped /try dunk scene and the host\'s signed-out word', async () => {
    expect((await spawnWith({ tryGuestCoach: true }, { body: 'kit-male', guest: false, where: 'tryDunk' })).bodies).toEqual([KIT_BODY_URL.male]);   // a stale stamp, signed in
    expect((await spawnWith({ tryGuestCoach: true }, { body: 'kit-male', guest: true, where: 'play' })).bodies).toEqual([KIT_BODY_URL.male]);     // a guest flag, unstamped scene
  });
  it('setting 1 (the owner\'s scan → coach) never reaches another viewer\'s anatomy or workout view, even with ALL on', async () => {
    // hero-body answers 'scan' only to the scan owner's account; any other viewer's stage spawns their own kit body
    expect((await spawnWith(ALL_ON, { body: 'kit-female', where: 'exerciseStage' })).bodies).not.toContain(COACH_BODY_URL);
    expect((await spawnWith(ALL_ON, { body: 'kit-male', where: 'exerciseStage' })).bodies).not.toContain(COACH_BODY_URL);
    // the owner's own stage (his own body is the coach body under setting 1), falling back to his scan
    expect((await spawnWith({ coachBody: true }, { body: 'scan', where: 'exerciseStage' })).bodies).toEqual([COACH_BODY_URL, SCAN_BODY_URL]);
  });
});
