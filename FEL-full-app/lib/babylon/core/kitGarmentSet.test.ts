// lane/kit-mac-jobs (owner 2026-11-18: "make the clothes appear to be skin tight and not baggy"): the Blender-made garment sets
// (the one-piece short, the basketball and football jerseys) and the load-time swap that puts them on a kit body, behind
// `kit.onePieceShorts` and `kit.newJerseys`. Off (the default) nothing changes; on, the garments land on the body, in its
// bind space, where Blender fitted them.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { KIT_GARMENT_SETS, applyGarmentSet, garmentSetsFor, kitBodyOf, parseGarmentSet, type SetGarment } from './kitGarmentSet';
import { KIT_BODY_MOBILE_URL, KIT_BODY_URL, SCAN_BODY_URL } from './heroBody';
import { applyKit } from './kit';
import { skinnedWorld } from './bodyMask';
import { BASKETBALL_JERSEY, sportKitDefault } from './sportKitDefaults';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const pub = (u: string) => `public${u}`;
const set = (u: string): SetGarment[] => { const b = readFileSync(pub(u)); return parseGarmentSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const FEL_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm',
  'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

afterEach(() => resetFeelForTests());

describe('which body takes which set (pure)', () => {
  it('only the kit bodies, desktop and phone files, and only with a knob on', () => {
    expect(kitBodyOf(KIT_BODY_URL.male)).toBe('male');
    expect(kitBodyOf(KIT_BODY_MOBILE_URL.female)).toBe('female');
    expect(kitBodyOf(SCAN_BODY_URL)).toBeNull();
    expect(kitBodyOf('/models/rivals/ace.glb')).toBeNull();
    expect(garmentSetsFor(KIT_BODY_URL.male, { shorts: false, jerseys: false })).toEqual([]);
    expect(garmentSetsFor(KIT_BODY_MOBILE_URL.male, { shorts: true, jerseys: false })).toEqual([KIT_GARMENT_SETS.shorts.male]);
    expect(garmentSetsFor(KIT_BODY_URL.female, { shorts: true, jerseys: true })).toEqual([KIT_GARMENT_SETS.shorts.female, KIT_GARMENT_SETS.jerseys.female]);
    expect(garmentSetsFor('/models/rivals/ace.glb', { shorts: true, jerseys: true })).toEqual([]);
  });
  it('the basketball modes default to the new jersey only with kit.newJerseys on; football and tennis keep their tops', () => {
    expect(sportKitDefault('onevone').tops).toBe('top_bonds');
    setFeelUser(true); setFeelSession(null); setFeelOverride('kit.newJerseys', 1);
    expect(sportKitDefault('onevone').tops).toBe(BASKETBALL_JERSEY);
    expect(sportKitDefault('dunk').tops).toBe(BASKETBALL_JERSEY);
    expect(sportKitDefault('tennis').tops).toBe('top_bonds');
    expect(sportKitDefault('football').tops).toBe('top_football');
  });
});

describe('the set files (graft.ts output)', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: the one-piece short replaces both short items; the jerseys are added; every mesh is well formed`, () => {
      const shorts = set(KIT_GARMENT_SETS.shorts[sex]), jerseys = set(KIT_GARMENT_SETS.jerseys[sex]);
      expect(shorts.map((g) => [g.name, g.mode, g.items])).toEqual([['Kit_shorts_shorts_court', 'replace', ['shorts_court', 'shorts_glitch']]]);
      expect(jerseys.map((g) => [g.name, g.mode, g.target, g.material])).toEqual([
        ['Kit_tops_top_basketball', 'add', 'Kit_tops_top_lab', 'jersey.top_basketball'],
        ['Kit_tops_top_football', 'add', 'Kit_tops_top_lab', 'jersey.top_football'],
      ]);
      for (const g of [...shorts, ...jerseys]) {
        const nv = g.positions.length / 3;
        expect(g.jointNames.slice().sort()).toEqual(FEL_BONES.slice().sort());   // the 22 unprefixed FEL bones (GATE 0)
        expect(g.normals.length).toBe(nv * 3);
        expect(g.uv?.length).toBe(nv * 2);                                         // UVs: no runtime atlas, no cracks
        if (g.slot === 'tops') expect(g.uv2?.length).toBe(nv * 2);                 // the decal map (number and name)
        expect(Math.max(...g.indices)).toBeLessThan(nv);
        expect(g.positions.every(Number.isFinite)).toBe(true);
        for (let v = 0; v < nv; v++) {
          const s = g.weights[v * 4] + g.weights[v * 4 + 1] + g.weights[v * 4 + 2] + g.weights[v * 4 + 3];
          expect(Math.abs(s - 1)).toBeLessThan(1e-3);
        }
        expect(g.indices.length / 3).toBeLessThanOrEqual(g.slot === 'shorts' ? 2500 : g.name.endsWith('football') ? 4000 : 3000);   // the steps' budgets
      }
    });
  }
});

describe('the swap on a loaded kit body (NullEngine)', () => {
  let scene: Scene;
  const c = {} as Record<'today' | 'sets', AssetContainer>;
  beforeAll(async () => {
    scene = new Scene(new NullEngine());
    scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
    const data = `data:model/gltf-binary;base64,${readFileSync(pub(KIT_BODY_URL.male)).toString('base64')}`;
    c.today = await SceneLoader.LoadAssetContainerAsync('', data, scene, undefined, '.glb');
    c.sets = await SceneLoader.LoadAssetContainerAsync('', data, scene, undefined, '.glb');
    const r1 = applyGarmentSet(c.sets, set(KIT_GARMENT_SETS.shorts.male));
    const r2 = applyGarmentSet(c.sets, set(KIT_GARMENT_SETS.jerseys.male));
    expect(r1.replaced.sort()).toEqual(['Kit_shorts_shorts_court', 'Kit_shorts_shorts_glitch']);
    expect(r2.added).toEqual(['Kit_tops_top_basketball', 'Kit_tops_top_football']);
  }, 120_000);
  let n = 0;
  const spawn = (k: 'today' | 'sets') => {
    const inst = c[k].instantiateModelsToScene((x) => `${x}_c${++n}`, false, { doNotInstantiate: true });
    for (const g of inst.animationGroups) g.stop();
    return (inst.rootNodes[0] as TransformNode).getChildMeshes();
  };
  const shown = (ms: AbstractMesh[], slot: string) => ms.find((m) => m.name.startsWith(`Kit_${slot}_`) && m.isVisible) as Mesh;
  // each garment vertex's distance to the nearest body vertex, posed by the real skeleton (metres)
  function gaps(ms: AbstractMesh[], g: Mesh): number[] {
    scene.render();
    const B = skinnedWorld(ms.find((m) => /^Body/.test(m.name)) as Mesh)!.P, G = skinnedWorld(g)!.P, out: number[] = [];
    for (let i = 0; i < G.length; i += 3) {
      let best = Infinity;
      for (let j = 0; j < B.length; j += 3) { const d = (G[i] - B[j]) ** 2 + (G[i + 1] - B[j + 1]) ** 2 + (G[i + 2] - B[j + 2]) ** 2; if (d < best) best = d; }
      out.push(Math.sqrt(best));
    }
    return out.sort((a, b) => a - b);
  }
  const pct = (a: number[], p: number) => a[Math.floor(p * (a.length - 1))];

  it('the one-piece short lands ON the body, closer than today\'s three pieces (the poofy legs)', () => {
    const today = spawn('today'), mine = spawn('sets');
    applyKit(today, null, 'onevone'); applyKit(mine, null, 'onevone');
    const a = gaps(today, shown(today, 'shorts')), b = gaps(mine, shown(mine, 'shorts'));
    expect(shown(mine, 'shorts').getTotalVertices()).toBeGreaterThan(900);   // the one piece (today: 316)
    // both after the game's own lift (garmentFixes GARMENT_INFLATE: shorts 20 mm along the normals) and to the nearest BODY VERTEX
    console.info(`[kitGarmentSet.test] short gap to the nearest body vertex, mm: today p10/p50/p90 ${[0.1, 0.5, 0.9].map((p) => (pct(a, p) * 1000).toFixed(1)).join('/')}, one piece ${[0.1, 0.5, 0.9].map((p) => (pct(b, p) * 1000).toFixed(1)).join('/')}`);
    expect(pct(b, 0.9)).toBeLessThan(pct(a, 0.9));                          // the loose tail is gone
    expect(pct(b, 0.5)).toBeLessThan(pct(a, 0.5));
    expect(pct(b, 0.1)).toBeGreaterThan(0.01);                               // never painted on
  });

  it('the jerseys hang on the body\'s skeleton, wear a jersey.* material, and show when picked', () => {
    const mine = spawn('sets');
    applyKit(mine, { tops: 'top_basketball' }, 'onevone');
    const top = shown(mine, 'tops');
    expect(top.name).toMatch(/^Kit_tops_top_basketball/);
    expect(top.material?.name).toMatch(/^jersey\.top_basketball/);
    // the target garment's own skeleton (each glTF skin is its own; compared as a boolean: a failing toBe would diff two bone graphs)
    expect(top.skeleton === mine.find((m) => /^Kit_tops_top_lab/.test(m.name))!.skeleton).toBe(true);
    const g = gaps(mine, top);
    expect(pct(g, 0.5)).toBeLessThan(0.04);
    applyKit(mine, null, 'football');   // the body carries top_football now: shown from the body, no pack fetch
    expect(shown(mine, 'tops').name).toMatch(/^Kit_tops_top_football/);
  });
});
