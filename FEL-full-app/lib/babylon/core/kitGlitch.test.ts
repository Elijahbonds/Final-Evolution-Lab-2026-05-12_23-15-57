// KIT-GLITCH (owner 2026-11-12: "the clothes look glitched out sometimes" — skin through cloth, flicker or stripes, cloth
// torn in moves, pieces floating off the body). Each guard here fails on the code before the fix, on the SHIPPED bodies.
// The rig that found them, and measures them on screen, is scripts/probes/kit-glitch (rig.mts; the ci-suite script
// scripts/kit-glitch-tests.ts runs the pure parts without a browser).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit, packFitsBody } from './kit';
import { GARMENT_INFLATE, metresPerBind } from './garmentFixes';
import { skinnedWorld, maskBodyNow } from './bodyMask';
import { applySkinShading } from './skinShading';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { registerAuthoredClips } from '../anim/authored';
import type { PBRMaterial } from '@babylonjs/core';

const FILES = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb', rival: 'public/models/rivals/ace.glb' } as const;
type Body = keyof typeof FILES;

let scene: Scene;
const containers = {} as Record<Body, AssetContainer>;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop' };
  for (const k of Object.keys(FILES) as Body[]) {
    containers[k] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(FILES[k]).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);

let n = 0;
function spawn(body: Body): { root: TransformNode; meshes: AbstractMesh[] } {
  const inst = containers[body].instantiateModelsToScene((x) => `${x}_k${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { root, meshes: root.getChildMeshes() };
}
const shown = (meshes: AbstractMesh[], re: RegExp) => meshes.find((m) => re.test(m.name) && m.isVisible) as Mesh;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

describe('stripes: a tiling weave never reads a paint atlas (fabric.weaveFits)', () => {
  it('a garment cut into the paint atlas gets no weave; authored UVs keep it (the kit tee, shorts and sock have them since KIT-FIT)', () => {
    // node has no canvas, so the scene is handed the weave maps fabric.ts would draw (it reuses a live cached map)
    const fake = (k: string) => ({ name: `weave_${k}`, getInternalTexture: () => ({}), level: 1, uScale: 1, vScale: 1 });
    for (const k of ['jersey', 'shorts', 'shoes', 'sock']) (scene.metadata as Record<string, unknown>)[`__felFabricWeaveNormal_${k}`] = fake(k);
    const male = spawn('male');
    const rival = spawn('rival');
    const atlas = spawn('female');
    // a garment WITHOUT UVs (as the kit tee and shorts shipped from 2026-10-20 until the kit-fit rebake) still gets the atlas, and
    // a weave sampled through the atlas is a fresh patch per triangle (stripes): it must get none
    for (const m of atlas.meshes) if (/^Kit_(tops|shorts)_/.test(m.name)) { (m as Mesh).makeGeometryUnique(); (m as Mesh).removeVerticesData('uv'); }
    for (const b of [male, rival, atlas]) applySkinShading(b.meshes, scene, 'desktop');
    for (const b of [male, rival, atlas]) applyKit(b.meshes, null, 'onevone');
    const bump = (meshes: AbstractMesh[], re: RegExp) => ((meshes.find((m) => re.test(m.name))!.material as PBRMaterial).bumpTexture as { name?: string } | null)?.name ?? null;
    expect(bump(atlas.meshes, /^Kit_tops_top_bonds/)).toBeNull();
    expect(bump(atlas.meshes, /^Kit_shorts_shorts_court/)).toBeNull();
    expect(shown(atlas.meshes, /^Kit_tops_/).metadata?.felAtlasUV).toBe(true);
    // KIT-FIT (scripts/avatar/kit-fit/bake.ts): the kit's tee, shorts and low sock carry authored UVs now — no atlas, the weave
    // tiles across them as it does on the rivals' textured garments and every shoe
    expect(shown(male.meshes, /^Kit_tops_/).metadata?.felAtlasUV).toBeUndefined();
    expect(bump(male.meshes, /^Kit_tops_top_bonds/)).toBe('weave_jersey');
    expect(bump(male.meshes, /^Kit_shorts_shorts_court/)).toBe('weave_shorts');
    expect(bump(male.meshes, /^Kit_shoes_shoes_evo_primitive1/)).toBe('weave_shoes');   // the low sock (its material is `shoes.shoes_evo.sock_low`: the shoe's canvas)
    expect(bump(rival.meshes, /^Kit_tops_/)).toBe('weave_jersey');
    expect(bump(rival.meshes, /^Kit_shorts_/)).toBe('weave_shorts');
    expect(bump(male.meshes, /^Kit_shoes_shoes_evo_primitive0/)).toBe('weave_shoes');
    for (const k of ['jersey', 'shorts', 'shoes', 'sock']) delete (scene.metadata as Record<string, unknown>)[`__felFabricWeaveNormal_${k}`];
    male.root.dispose(); rival.root.dispose(); atlas.root.dispose();
  });
});

describe('skin through cloth: the lift off the body is in METRES (garmentFixes.liftOffBody)', () => {
  it.each(['male', 'female'] as Body[])('%s: the shown tee stands GARMENT_INFLATE.tops off its loaded surface, the shorts GARMENT_INFLATE.shorts', (body) => {
    const s = spawn(body);
    // the loaded (un-lifted) positions, before applyKit touches the clones' own geometry
    const tee0 = s.meshes.find((m) => /^Kit_tops_top_bonds/.test(m.name)) as Mesh;
    const sh0 = s.meshes.find((m) => /^Kit_shorts_shorts_court/.test(m.name)) as Mesh;
    scene.render();
    const before = { tee: skinnedWorld(tee0)!.P.slice(), sh: skinnedWorld(sh0)!.P.slice(), teeInd: Array.from(tee0.getIndices()!), shInd: Array.from(sh0.getIndices()!) };
    applyKit(s.meshes, { tops: 'top_bonds', shorts: 'shorts_court' }, 'onevone');
    const lift = (m: Mesh, P0: Float32Array, ind0: number[]) => {
      // a garment without UVs is unwelded by applyKit (corner i of the new mesh is vertex ind0[i] of the loaded one); one with
      // UVs (the kit's since KIT-FIT) keeps its vertices, so vertex i is vertex i
      const P = skinnedWorld(m)!.P, same = P.length === P0.length;
      const d: number[] = [];
      for (let i = 0; i < (same ? P0.length / 3 : ind0.length); i++) { const o = same ? i : ind0[i]; d.push(Math.hypot(P[i * 3] - P0[o * 3], P[i * 3 + 1] - P0[o * 3 + 1], P[i * 3 + 2] - P0[o * 3 + 2])); }
      return median(d);
    };
    // the bind units are 0.25 m (tee) and 0.17 m (shorts) on these files: the unit bug lifted 3 mm, not 13 / 20
    expect(lift(tee0, before.tee, before.teeInd)).toBeGreaterThan(GARMENT_INFLATE.tops * 0.8);
    expect(lift(tee0, before.tee, before.teeInd)).toBeLessThan(GARMENT_INFLATE.tops * 1.25);
    expect(lift(sh0, before.sh, before.shInd)).toBeGreaterThan(GARMENT_INFLATE.shorts * 0.8);
    expect(lift(sh0, before.sh, before.shInd)).toBeLessThan(GARMENT_INFLATE.shorts * 1.25);
    s.root.dispose();
  });

  it('metresPerBind averages each bone\'s own length (vectors in different bone frames would cancel)', () => {
    const rotY = (deg: number, s: number) => { const c = Math.cos(deg * Math.PI / 180) * s, si = Math.sin(deg * Math.PI / 180) * s; return [c, 0, -si, 0, 0, s, 0, 0, si, 0, c, 0, 0, 0, 0, 1]; };
    // two bones at 180° to each other, both 0.2 m per bind unit: the summed vector is zero, the scale is still 0.2
    const ibms = [rotY(0, 0.2), rotY(180, 0.2)];
    expect(metresPerBind(ibms, [0, 1, 0, 0], [0.5, 0.5, 0, 0], 0, 1, 0, 0)).toBeCloseTo(0.2, 6);
    expect(metresPerBind(ibms, [0, 0, 0, 0], [0, 0, 0, 0], 0, 1, 0, 0)).toBe(1);   // unreadable: unchanged
  });
});

describe('floating: the waistband fit never hands the shorts an ARM\'s weights (bodyMask WAIST_DONOR_*)', () => {
  it.each(['male', 'rival'] as Body[])('%s: fitted at idle (hands beside the hips), the shorts stay on the hips when the arms go up', (body) => {
    const s = spawn(body);
    const sk = s.meshes.find((m) => /^Body/.test(m.name))!.skeleton!;
    const animator = new CharacterAnimator(scene, []);
    registerAuthoredClips(animator, scene, sk, null);
    applyKit(s.meshes, null, 'onevone');
    animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true });
    for (let i = 0; i < 3; i++) scene.render();
    maskBodyNow(s.meshes.find((m) => /^Body/.test(m.name)) as Mesh, s.meshes);   // the fit runs in the pose the body holds: idle
    const sh = shown(s.meshes, /^Kit_shorts_/);
    // the shorts are authored on Hips / UpLeg / Spine only: anything on a limb came from the fit
    const mi = sh.getVerticesData('matricesIndices')!, mw = sh.getVerticesData('matricesWeights')!, bones = sh.skeleton!.bones;
    let onLimb = 0;
    for (let v = 0; v < mw.length / 4; v++) { let w = 0; for (let k = 0; k < 4; k++) if (/(Shoulder|Arm|Hand|Neck|Head)$/.test(bones[mi[v * 4 + k]]?.name ?? '')) w += mw[v * 4 + k]; if (w > 0.2) onLimb++; }
    expect(onLimb).toBe(0);
    // the jumper's release, both arms overhead: before the fix a piece of the shorts rode the forearm 0.46 m off the hip
    const g = animator.play('jumpshot', { loop: true, fadeSec: 0, restart: true })!;
    g.goToFrame(g.from + (g.to - g.from) * 0.5); g.pause();
    for (let i = 0; i < 2; i++) scene.render();
    const bw = skinnedWorld(s.meshes.find((m) => /^Body/.test(m.name)) as Mesh)!.P, gw = skinnedWorld(sh)!.P;
    let far = 0;
    for (let v = 0; v < gw.length / 3; v += 2) { let bd = Infinity; for (let u = 0; u < bw.length / 3; u += 3) bd = Math.min(bd, (bw[u * 3] - gw[v * 3]) ** 2 + (bw[u * 3 + 1] - gw[v * 3 + 1]) ** 2 + (bw[u * 3 + 2] - gw[v * 3 + 2]) ** 2); far = Math.max(far, Math.sqrt(bd)); }
    expect(far).toBeLessThan(0.15);
    animator.dispose();
    s.root.dispose();
  }, 60_000);
});

describe('wrong pieces: a kit pack is worn only by the bodies it was fitted to (kit.packFitsBody)', () => {
  it('the kit bodies take packs; a forge rival (its own build) does not — measured 50–54 % of the football jersey inside a rival', () => {
    const male = spawn('male'), female = spawn('female'), rival = spawn('rival');
    expect(packFitsBody(male.meshes)).toBe(true);
    expect(packFitsBody(female.meshes)).toBe(true);
    expect(packFitsBody(rival.meshes)).toBe(false);
    // in football (the jersey is the sport's default top) the rival shows its own top and asks for no pack
    applyKit(rival.meshes, null, 'football');
    const tops = rival.meshes.filter((m) => /^Kit_tops_/.test(m.name) && m.isVisible);
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.every((m) => !/top_football/.test(m.name))).toBe(true);
    male.root.dispose(); female.root.dispose(); rival.root.dispose();
  });
});
