// The Studio's BUDGET on the real kit (CREATOR-PLAN phase 4d, 2026-10-06): the ten archetype recipes dressed in the old
// Closet preview's scene and in the Studio's, headless (NullEngine), measured — draw calls, lights, meshes, textures and
// their memory — plus what a pointer gesture costs on the CPU (the pick a drag makes on every move). The numbers are
// printed (the phase report quotes them) and the budget is asserted:
//   - the Studio adds exactly its two plinth meshes (+2 draws) and two lights over the old preview's two, whatever the look;
//   - the environment map is 64² × 6 float faces with mips (~0.5 MiB), built once per venue — never per edit;
//   - a phone's paint is the phone size (the scene says its tier now; the old preview never did, so a phone painted at the
//     desktop's 2048²).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, DirectionalLight, HemisphericLight, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ARCHETYPES } from '../../../creator/look/__fixtures__/archetypes';
import { applyIdentity, identityFrom } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';
import { PAINT_SIZES, flushPaint, paintStats, setPaintBaseReader } from '../paint/renderPaint';
import { FRONT_ALPHA, StudioStage } from './stageRig';
import { BodyPicker } from './bodyPick';
import { rigFrames } from '../parts/rigFrames';

const ENV_BYTES = Math.round(6 * 64 * 64 * 4 * 4 * (4 / 3));   // EnvironmentIBL: FACE_SIZE 64, RGBA float, mips

type Tier = 'mobile' | 'desktop';
interface Rig { scene: Scene; kits: Record<'male' | 'female', AssetContainer> }
const rigs: Partial<Record<string, Rig>> = {};

async function rig(kind: 'closet' | 'studio', tier: Tier | null): Promise<Rig> {
  const scene = new Scene(new NullEngine({ renderWidth: 390, renderHeight: 844, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 1 }));
  const cam = new ArcRotateCamera('c', kind === 'studio' ? FRONT_ALPHA : -Math.PI / 2, 1.25, 3.1, new Vector3(0, 0.95, 0), scene);
  scene.activeCamera = cam;
  if (tier) scene.metadata = { felTier: tier };
  if (kind === 'closet') {
    // the Closet preview as it was before 4d: a hemispheric fill and one directional key, nothing else
    new HemisphericLight('fill', new Vector3(0, 1, 0), scene).intensity = 0.9;
    new DirectionalLight('key', new Vector3(-0.4, -0.8, 0.5), scene).intensity = 1.1;
  } else {
    new StudioStage(scene, cam, { tier: tier ?? 'desktop', env: false });
  }
  const kits = {} as Rig['kits'];
  for (const sex of ['male', 'female'] as const) {
    kits[sex] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
  return { scene, kits };
}

beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  rigs.closet = await rig('closet', null);           // the old preview stamped no tier: the paint read 'desktop'
  rigs.studioPhone = await rig('studio', 'mobile');
  rigs.studioDesk = await rig('studio', 'desktop');
}, 180_000);
afterAll(() => setPaintBaseReader(null));

let n = 0;
function dress(r: Rig, slot: (typeof ARCHETYPES)[number]['slot']): SpawnedCharacter {
  const sex = slot.body === 'female' ? 'female' : 'male';
  const inst = r.kits[sex].instantiateModelsToScene((x) => `${x}_b${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  root.rotation = new Vector3(0, 0, 0);
  root.scaling.setAll(1);
  const s = { id: `b${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
  const hero = { body: sex === 'female' ? 'kit-female' : 'kit-male', frame: { heightScale: 100, buildScale: 100 }, scanOwned: false } as const;
  applyIdentity(s, identityFrom({ look: { face: { ...defaultFace(), creatorSlots: [slot], activeSlot: slot.id }, equipped: {} } }, hero, null));
  flushPaint(s.root);
  return s;
}

function measure(r: Rig): { draws: number; meshes: number; lights: number; texBytes: number } {
  r.scene.render();
  const active = r.scene.getActiveMeshes();
  let draws = 0;
  for (let i = 0; i < active.length; i++) draws += active.data[i].subMeshes?.length ?? 1;
  let texBytes = 0;
  for (const t of r.scene.textures) { const z = t.getSize(); texBytes += z.width * z.height * 4 * (t.noMipmap ? 1 : 4 / 3) * (t.isCube ? 6 : 1); }
  return { draws, meshes: active.length, lights: r.scene.lights.length, texBytes: Math.round(texBytes) };
}

const MiB = (b: number) => (b / 1048576).toFixed(2);

describe('the Studio budget on the ten archetypes', () => {
  it('+2 draws (the plinth), +2 lights, same look; a phone paints at the phone size', () => {
    const rows: string[] = [`${'archetype'.padEnd(46)} draws closet→studio  lights  tex MiB closet(2048)→phone  paint gpu MiB closet→phone→desk`];
    for (const a of ARCHETYPES) {
      const c = dress(rigs.closet!, a.slot), p = dress(rigs.studioPhone!, a.slot), d = dress(rigs.studioDesk!, a.slot);
      const mc = measure(rigs.closet!), mp = measure(rigs.studioPhone!);
      expect(mp.draws - mc.draws, a.name).toBe(2);
      expect(mp.lights - mc.lights, a.name).toBe(2);
      expect(mp.lights).toBeLessThanOrEqual(4);   // the PBR default: no material recompiles for a fifth light
      const gc = paintStats(c.root)?.gpuBytes ?? 0, gp = paintStats(p.root)?.gpuBytes ?? 0, gd = paintStats(d.root)?.gpuBytes ?? 0;
      const skinP = paintStats(p.root)?.targets.find((t) => t.kind === 'skin');
      if (skinP) expect(skinP.size).toBe(PAINT_SIZES.mobile.skin);
      expect(gp).toBeLessThanOrEqual(gc);
      rows.push(`${a.name.padEnd(46)} ${String(mc.draws).padStart(3)} → ${String(mp.draws).padEnd(10)} ${mc.lights}→${mp.lights}     ${MiB(mc.texBytes).padStart(6)} → ${MiB(mp.texBytes).padEnd(14)} ${MiB(gc)} → ${MiB(gp)} → ${MiB(gd)}`);
      for (const s of [c, p, d]) s.root.dispose();
    }
    rows.push(`environment map (built once per venue, not in a NullEngine): +${MiB(ENV_BYTES)} MiB GPU`);
    console.log(`[studio-budget]\n${rows.join('\n')}`);
  });
});

describe('what a gesture costs on the CPU (the real kit)', () => {
  it('the first pick builds the rest data once; a drag re-picks against the posed positions it skinned once', () => {
    const r = rigs.studioPhone!;
    const s = dress(r, ARCHETYPES[0].slot);
    s.root.computeWorldMatrix(true);
    for (const t of s.root.getDescendants(false)) (t as TransformNode).computeWorldMatrix?.(true);
    s.skeleton!.prepare();
    const f = Vector3.TransformNormal(rigFrames(s.skeleton!, s.root)!.axes.fwd, s.root.computeWorldMatrix(true)).normalize();
    const o = new Vector3(0, 1.3, 0).add(f.scale(2)), d = f.scale(-1);
    const pk = new BodyPicker(s);
    const t0 = performance.now(); pk.pick(o, d); const first = performance.now() - t0;
    const t1 = performance.now(); for (let i = 0; i < 20; i++) pk.pick(o.add(new Vector3(0.002 * i, 0, 0)), d); const drag = (performance.now() - t1) / 20;
    pk.invalidate();
    const t2 = performance.now(); pk.pick(o, d); const reskin = performance.now() - t2;
    const verts = s.meshes.reduce((a, m) => a + (m.getTotalVertices?.() ?? 0), 0);
    console.log(`[studio-budget] pick on ${verts} vertices: first ${first.toFixed(1)} ms (rest data + skin), per drag move ${drag.toFixed(2)} ms, new gesture ${reskin.toFixed(1)} ms`);
    expect(drag).toBeLessThan(first);
    s.root.dispose();
  });
});
