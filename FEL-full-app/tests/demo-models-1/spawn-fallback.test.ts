// DEMO-MODELS-1: CharacterLibrary.spawn on the real path (NullEngine). With a setting on and the coach file failing to load, the
// player still spawns, on the body the coach body replaced (the Meshy scan for the owner, the kit body for a /try guest, the
// viewer's own body for a demo). With every setting off the coach file is never requested.
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

async function spawnWith(flags: Partial<DemoModelFlags>, o: { body: typeof h.body; guest?: boolean; demonstrator?: boolean }) {
  h.body = o.body;
  asked.length = 0;
  setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, ...flags });
  setSignedOutVisitor(o.guest === true);
  const scene = new Scene(new NullEngine());
  scene.metadata = { felTier: 'desktop' };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const s = await CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', identity: false, demonstrator: o.demonstrator });
  const warned = warn.mock.calls.map((c) => String(c[0]));
  warn.mockRestore();
  const bodies = asked.filter((u) => /\.glb$/.test(u));
  scene.dispose();
  return { s, bodies, warned };
}

describe('CharacterLibrary.spawn: the coach body and its fallback', () => {
  it('every setting off: the owner spawns the scan and the coach file is never asked for', async () => {
    const r = await spawnWith({}, { body: 'scan' });
    expect(r.s.meshes.length).toBeGreaterThan(0);
    expect(r.bodies).toContain(SCAN_BODY_URL);
    expect(r.bodies).not.toContain(COACH_BODY_URL);
  });
  it('every setting off: a /try guest spawns the kit body, a demo spawns the viewer\'s own body (no coach file)', async () => {
    expect((await spawnWith({}, { body: 'kit-male', guest: true })).bodies).toEqual([KIT_BODY_URL.male]);
    expect((await spawnWith({}, { body: 'kit-female', demonstrator: true })).bodies).toEqual([KIT_BODY_URL.female]);
  });
  it('1 on, the coach file failing: the owner still spawns, on the Meshy scan (warned once)', async () => {
    const r = await spawnWith({ coachBody: true }, { body: 'scan' });
    expect(r.s.meshes.length).toBeGreaterThan(0);
    expect(r.bodies).toEqual([COACH_BODY_URL, SCAN_BODY_URL]);
    expect(r.warned.some((w) => w.includes(`"${COACH_BODY_URL}" unavailable, using "${SCAN_BODY_URL}"`))).toBe(true);
  });
  it('4 on, the coach file failing: the /try guest spawns the kit body', async () => {
    const r = await spawnWith({ tryGuestCoach: true }, { body: 'kit-male', guest: true });
    expect(r.bodies).toEqual([COACH_BODY_URL, KIT_BODY_URL.male]);
  });
  it('5 on, the coach file failing: the demo spawns the viewer\'s own body', async () => {
    const r = await spawnWith({ libraryCoach: true }, { body: 'kit-female', demonstrator: true });
    expect(r.bodies).toEqual([COACH_BODY_URL, KIT_BODY_URL.female]);
  });
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
