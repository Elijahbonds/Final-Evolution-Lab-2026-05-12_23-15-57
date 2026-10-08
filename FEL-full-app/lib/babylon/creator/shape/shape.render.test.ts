// SHAPE V2 on the REAL kit bodies (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b), through the real path (identityFrom →
// applyIdentity → the Creator hook), in a NullEngine scene stamped as each place a body is spawned: a casual scene (no
// mode, like the Closet), `dunk` (a STANDARD_FRAME_MODES mode) and a ranked session.
//
// What is proven here: the reach-safe keys and the bulk never move a hand, a forearm, an arm, a shoulder, the root's
// scale or a ball in the palm, anywhere, ranked included; the frame keys move the body in a casual scene and are exactly
// 1.0 in dunk and ranked; nothing compounds; the morph is one target per mesh, follows onto the worn garments and the
// eyes, and pushes the chest OUT; the paint / ear maps and the parts' rest frames are keyed and measured the same under
// any shape. The measurements and the budget are logged for the report.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, MeshBuilder, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyIdentity, identityFrom } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { boneNode } from '../../anim/boneLookup';
import { defaultFace } from '../../../closet/wearable-catalog';
import { PART_BONES, emptyCreatorDoc, type CreatorDoc, type CreatorPart, type CreatorSlotV2 } from '../../../creator/look/doc';
import { setPaintBaseReader } from '../paint/renderPaint';
import { chartForBody, geometryKey, restSkin, surfaceMapKey } from '../paint/surfaceMap';
import { rigFrames } from '../parts/rigFrames';
import { nodeMatrix } from '../parts/placement';
import { partsOn } from '../parts/renderParts';
import { SHAPE_TARGET, bodyMeshOf, measureBody, prepFor, shapeCacheStats, shapeKey, shapeTargetOf } from './renderShape';
import { applyPresentation, stampPresentation } from './presentation';
import { MorphTargetManager } from '@babylonjs/core';

const kits: Record<'male' | 'female', AssetContainer> = {} as never;
let scene: Scene;
const PLACES = {
  casual: { felTier: 'mobile' },
  dunk: { felModeId: 'dunk', felTier: 'mobile' },
  ranked: { felModeId: 'karate', felRanked: true, felTier: 'mobile' },
} as const;
type Place = keyof typeof PLACES;
/** Where the next apply happens (the harness's stamps on the scene). */
const at = (place: Place) => { scene.metadata = { ...PLACES[place] }; };
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  at('casual');
  for (const sex of ['male', 'female'] as const) {
    kits[sex] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);
afterAll(() => setPaintBaseReader(null));

let n = 0;
function spawn(sex: 'male' | 'female' = 'male'): SpawnedCharacter {
  // the `_c<n>` clone suffix, as CharacterLibrary's instances carry (kit.ts reads garments through it)
  const inst = kits[sex].instantiateModelsToScene((x) => `${x}_c${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `c${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const doc = (shape: Partial<CreatorDoc['shape']>, parts: CreatorPart[] = []): CreatorDoc => ({ ...emptyCreatorDoc(), parts, shape: { face: {}, body: {}, ...shape } });
const WEAR = { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' };
const HERO = (sex: 'male' | 'female') => ({ body: sex === 'female' ? 'kit-female' : 'kit-male', frame: { heightScale: 100, buildScale: 100 }, scanOwned: false }) as const;
/** Dress the body the way every mode does: the stored slot, read by identityFrom, applied by applyIdentity. */
function wear(s: SpawnedCharacter, d: CreatorDoc | null, o: { sex?: 'male' | 'female'; equipped?: Record<string, string>; presentation?: number } = {}): void {
  const sex = o.sex ?? 'male';
  const slot: CreatorSlotV2 = { id: 'w1', label: 'W', body: sex, base: {}, doc: d ?? emptyCreatorDoc(), equipped: o.equipped ?? WEAR };
  if (o.presentation) slot.presentation = { scale: o.presentation };
  applyIdentity(s, identityFrom({ look: { face: { ...defaultFace(), creatorSlots: [slot], activeSlot: 'w1' }, equipped: o.equipped ?? WEAR } }, HERO(sex), null));
}
const REACH_BONES = ['LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];
/** The root's scale and the world position of every bone that sets where a hand is. */
function frameOf(s: SpawnedCharacter): number[] {
  s.root.computeWorldMatrix(true);
  for (const t of s.root.getDescendants(false) as TransformNode[]) t.computeWorldMatrix?.(true);
  const out: number[] = [s.root.scaling.x, s.root.scaling.y, s.root.scaling.z];
  for (const b of REACH_BONES) { const p = boneNode(s.skeleton!, b)!.getAbsolutePosition(); out.push(p.x, p.y, p.z); }
  return out;
}
const near = (a: number[], b: number[], eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) <= eps);
const meshNamed = (s: SpawnedCharacter, re: RegExp) => s.meshes.find((m) => re.test(m.name)) as Mesh;

/** Every reach-safe value at an extreme, every segment's bulk at an extreme. */
const REACH_SAFE_DOC = doc({ body: { head: 1.6, neck: 1.5, hands: 1.5, feet: 1.5 }, girth: { head: 1.6, neck: 1.6, chest: 1.6, belly: 0.7, upperArms: 1.6, forearms: 1.6, thighs: 0.7, calves: 1.6 } });
const FRAME_DOC = doc({ body: { legs: 1.04, torso: 1.04, shoulders: 1.08 } });

describe('measured on the kit bodies', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: radii, pivots, the neck and the legs are body-sized`, () => {
      const s = spawn(sex);
      const body = bodyMeshOf(s.meshes)!;
      expect(body.name).toMatch(/^Body/);
      const m = measureBody(body)!;
      console.info(`[shape] ${sex}: neck ${m.neckLength.toFixed(3)} m, hip→ankle ${m.hipToAnkle.toFixed(3)} m; radii ${Object.entries(m.radius).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')}`);
      expect(m.up[1]).toBeGreaterThan(0.99);
      for (const [b, r] of Object.entries(m.radius)) { expect(r, b).toBeGreaterThan(0.02); expect(r, b).toBeLessThan(0.25); }
      expect(m.neckLength).toBeGreaterThan(0.04); expect(m.neckLength).toBeLessThan(0.2);
      expect(m.hipToAnkle).toBeGreaterThan(0.7); expect(m.hipToAnkle).toBeLessThan(1);
      // the feet scale about the floor under the ankles; the hands about the wrists
      expect(Math.abs(m.pivot.LeftFoot[1])).toBeLessThan(0.03);
      expect(m.pivot.LeftHand[1]).toBeGreaterThan(1);
      s.root.dispose();
    });
  }
});

describe('reach-safe: head, neck, hands, feet and bulk never move a hand, anywhere (ranked included)', () => {
  for (const place of ['casual', 'dunk', 'ranked'] as Place[]) {
    for (const sex of ['male', 'female'] as const) {
      it(`${place}, ${sex}`, () => {
        at(place);
        const s = spawn(sex);
        // a ball in the right palm, the way ballRig.attachBallToHand parents it
        const ball = MeshBuilder.CreateSphere(`ball_${n}`, { diameter: 0.24 }, scene);
        ball.parent = boneNode(s.skeleton!, 'RightHand');
        ball.position.set(0, 0.1, 0.05);
        wear(s, null, { sex });
        const plain = frameOf(s);
        const ball0 = ball.getAbsolutePosition().clone();
        const head = boneNode(s.skeleton!, 'Head')!;
        const head0 = head.getAbsolutePosition().clone();
        wear(s, REACH_SAFE_DOC, { sex });
        expect(near(frameOf(s), plain)).toBe(true);
        ball.computeWorldMatrix(true);
        expect(ball.getAbsolutePosition().subtract(ball0).length()).toBeLessThan(1e-6);
        expect(ball.scaling.x).toBe(1);
        // and it is not a vacuous pass: the head grew, the hands' mesh grew, the body bulked
        expect(boneNode(s.skeleton!, 'Head')!.scaling.x).toBeCloseTo(1.6, 6);
        // the neck is the Head JOINT moving up, (neck − 1) × the visible neck; the Neck bone itself is never scaled
        expect(boneNode(s.skeleton!, 'Neck')!.scaling.x).toBeCloseTo(1, 9);
        const rise = head.getAbsolutePosition().subtract(head0);
        const m = measureBody(bodyMeshOf(s.meshes)!)!;
        expect(rise.y / s.root.scaling.y).toBeCloseTo(0.5 * m.neckLength, 3);
        expect(shapeTargetOf(bodyMeshOf(s.meshes)!)!.influence).toBe(1);
        expect(s.root.metadata.felShape.body).toMatchObject({ head: 1.6, neck: 1.5, hands: 1.5, feet: 1.5, legs: 1, torso: 1, shoulders: 1 });
        s.root.dispose(); ball.dispose();
        at('casual');
      });
    }
  }
});

describe('the frame keys: inside the clamp in a casual scene, exactly 1.0 in standard-frame and ranked', () => {
  it('casual: legs, torso and shoulders move the body (and the hands with it), the feet stay on the floor', () => {
    at('casual');
    const s = spawn();
    wear(s, null);
    const plain = frameOf(s);
    const leg0 = boneNode(s.skeleton!, 'LeftLeg')!.position.clone();
    const foot = boneNode(s.skeleton!, 'LeftFoot')!;
    foot.computeWorldMatrix(true);
    const ankle0 = foot.getAbsolutePosition().y;
    wear(s, FRAME_DOC);
    expect(near(frameOf(s), plain)).toBe(false);
    expect(boneNode(s.skeleton!, 'LeftLeg')!.position.length()).toBeCloseTo(leg0.length() * 1.04, 6);
    // the skeleton is lifted by the extra leg length, so the ankle stays where it was
    for (const t of s.root.getDescendants(false) as TransformNode[]) t.computeWorldMatrix?.(true);
    expect(Math.abs(foot.getAbsolutePosition().y - ankle0)).toBeLessThan(0.002);
    // back to neutral: exactly the bind pose again (absolute, never compounded)
    wear(s, null);
    expect(near(frameOf(s), plain, 1e-9)).toBe(true);
    s.root.dispose();
  });
  for (const place of ['dunk', 'ranked'] as Place[]) {
    it(`${place}: the frame keys are 1.0 — not a millimetre of the hands moves`, () => {
      at(place);
      const s = spawn();
      wear(s, null);
      const plain = frameOf(s);
      const legs0 = ['LeftLeg', 'Spine1', 'LeftArm'].map((b) => boneNode(s.skeleton!, b)!.position.clone());
      wear(s, doc({ body: { ...FRAME_DOC.shape.body, head: 1.3 } }));
      expect(frameOf(s)).toEqual(plain);
      ['LeftLeg', 'Spine1', 'LeftArm'].forEach((b, i) => expect(boneNode(s.skeleton!, b)!.position.equals(legs0[i])).toBe(true));
      expect(s.root.metadata.felShape.body).toMatchObject({ legs: 1, torso: 1, shoulders: 1, head: 1.3 });
      s.root.dispose();
      at('casual');
    });
  }
});

describe('idempotent and reversible', () => {
  it('applying twice is applying once; clearing restores the bind and keeps the target at influence 0', () => {
    at('casual');
    const s = spawn();
    const nodes = ['Head', 'LeftLeg', 'LeftFoot', 'Spine', 'Spine1', 'Spine2', 'LeftArm', 'RightArm'].map((b) => boneNode(s.skeleton!, b)!);
    const arm = boneNode(s.skeleton!, 'Hips')!.parent as TransformNode;
    const snap = () => [...nodes.flatMap((x) => [...x.position.asArray(), ...x.scaling.asArray()]), ...arm.position.asArray()];
    wear(s, null);
    const bind = snap();
    const d = doc({ body: { head: 1.3, neck: 1.2, legs: 1.03, torso: 0.97, shoulders: 1.05 }, girth: { chest: 1.3 } });
    wear(s, d);
    const once = snap();
    wear(s, d); wear(s, d);
    expect(snap()).toEqual(once);
    const body = bodyMeshOf(s.meshes)!;
    const targets = body.morphTargetManager!.numTargets;
    wear(s, null);
    expect(snap()).toEqual(bind);
    expect(shapeTargetOf(body)!.influence).toBe(0);
    expect(body.morphTargetManager!.numTargets).toBe(targets);   // kept, so a slider drag through 1.0 never recompiles
    s.root.dispose();
  });
});

describe('the morph: one target per mesh, outward, and the clothes and eyes follow', () => {
  it('the body: one extra target (7 face + 1), the vertex count, and the chest moves OUT by about (g − 1) × its radius', () => {
    at('casual');
    const s = spawn();
    wear(s, null);
    const body = bodyMeshOf(s.meshes)! as Mesh;
    const faces = body.morphTargetManager!.numTargets;
    const before = Float32Array.from(body.getPositionData(true, true)!);
    wear(s, doc({ body: {}, girth: { chest: 1.4 } }));
    expect(body.morphTargetManager!.numTargets).toBe(faces + 1);
    const t = shapeTargetOf(body)!;
    expect(t.name).toBe(SHAPE_TARGET);
    expect(t.getPositions()!.length).toBe(body.getTotalVertices() * 3);
    const after = body.getPositionData(true, true)!;
    const prep = prepFor(body)!, m = measureBody(body)!;
    const sk = s.skeleton!;
    const spine2 = sk.bones.findIndex((b) => /Spine2/.test(b.name));
    const neck = sk.bones.findIndex((b) => /^Neck/.test(b.name));
    const a = sk.bones[spine2].getAbsoluteTransform().getTranslation(), b = sk.bones[neck].getAbsoluteTransform().getTranslation();
    let out = 0, total = 0;
    const mags: number[] = [];
    const n0 = body.getTotalVertices();
    for (let v = 0; v < n0; v++) {
      const W = prep.field.W, J = prep.field.J;
      let best = 0, j = -1;
      for (let k = 0; k < 4; k++) if (W[v * 4 + k] > best) { best = W[v * 4 + k]; j = J[v * 4 + k]; }
      if (j !== spine2 || best < 0.6) continue;
      const d = new Vector3(after[v * 3] - before[v * 3], after[v * 3 + 1] - before[v * 3 + 1], after[v * 3 + 2] - before[v * 3 + 2]);
      // outward = away from the spine's line, at this vertex
      const p = new Vector3(before[v * 3], before[v * 3 + 1], before[v * 3 + 2]);
      const ab = b.subtract(a), tt = Math.max(0, Math.min(1, Vector3.Dot(p.subtract(a), ab) / ab.lengthSquared()));
      const radial = p.subtract(a.add(ab.scale(tt)));
      total++;
      if (Vector3.Dot(d, radial) > 0) out++;
      if (best >= 0.9) mags.push(d.length());   // the size check on the vertices the chest owns outright
    }
    mags.sort((x, y) => x - y);
    const median = mags[mags.length >> 1];
    console.info(`[shape] chest 1.4: ${total} chest vertices, ${out} moved out; median (weight ≥ 0.9, ${mags.length}) ${median.toFixed(4)} m vs (g − 1)·R ${(0.4 * m.radius.Spine2).toFixed(4)} m`);
    expect(total).toBeGreaterThan(100);
    expect(out / total).toBeGreaterThan(0.95);
    expect(median).toBeGreaterThan(0.4 * m.radius.Spine2 * 0.8);
    expect(median).toBeLessThan(0.4 * m.radius.Spine2 * 1.2);
    s.root.dispose();
  });

  it('the worn garments follow the body (about the same offset over the chest); a garment not worn gets no target until it is', () => {
    at('casual');
    const s = spawn();
    wear(s, doc({ body: {}, girth: { chest: 1.5 } }));
    const top = meshNamed(s, /^Kit_tops_top_lab/), other = meshNamed(s, /^Kit_tops_top_bonds/);
    expect(top.isVisible).toBe(true);
    expect(other.isVisible).toBe(false);
    expect(shapeTargetOf(top)).toBeTruthy();
    expect(shapeTargetOf(other)).toBeNull();
    // the shirt moves with the chest under it
    const body = bodyMeshOf(s.meshes)! as Mesh;
    const bodyMag = (mesh: Mesh) => {
      const base = mesh.getPositionData(true, false)!, morphed = mesh.getPositionData(true, true)!;
      const prep = prepFor(mesh)!;
      const sp2 = prep.bones.indexOf('Spine2');
      const mags: number[] = [];
      for (let v = 0; v < base.length / 3; v++) {
        let best = 0, j = -1;
        for (let k = 0; k < 4; k++) if (prep.field.W[v * 4 + k] > best) { best = prep.field.W[v * 4 + k]; j = prep.field.J[v * 4 + k]; }
        if (j === sp2 && best > 0.6) mags.push(Math.hypot(morphed[v * 3] - base[v * 3], morphed[v * 3 + 1] - base[v * 3 + 1], morphed[v * 3 + 2] - base[v * 3 + 2]));
      }
      mags.sort((x, y) => x - y);
      return mags[mags.length >> 1];
    };
    const ratio = bodyMag(top) / bodyMag(body);
    console.info(`[shape] chest 1.5: shirt / skin offset ratio ${ratio.toFixed(3)}`);
    expect(ratio).toBeGreaterThan(0.8); expect(ratio).toBeLessThan(1.25);
    // put the other top on: it is shaped at that apply
    wear(s, doc({ body: {}, girth: { chest: 1.5 } }), { equipped: { ...WEAR, tops: 'top_bonds' } });
    expect(other.isVisible).toBe(true);
    expect(shapeTargetOf(other)).toBeTruthy();
    s.root.dispose();
  });

  it('the eyes ride the face (head bulk) instead of swelling on their own normals', () => {
    at('casual');
    const s = spawn();
    wear(s, doc({ body: {}, girth: { head: 1.4 } }));
    const eyes = meshNamed(s, /^eyes/);
    const t = shapeTargetOf(eyes);
    expect(t).toBeTruthy();
    expect(t!.getPositions()!.length).toBe(eyes.getTotalVertices() * 3);
    // carried, not swollen: every eye vertex moves (about) the same way as the face skin next to it, so the offsets
    // within each eyeball are near-parallel (swelling on the eyeball's own normals would point them apart)
    const a = eyes.getPositionData(true, false)!, b = eyes.getPositionData(true, true)!;
    const d: Vector3[] = [];
    for (let v = 0; v < a.length / 3; v++) d.push(new Vector3(b[v * 3] - a[v * 3], b[v * 3 + 1] - a[v * 3 + 1], b[v * 3 + 2] - a[v * 3 + 2]));
    const cx = Array.from({ length: d.length }, (_, v) => a[v * 3]).reduce((x, y) => x + y, 0) / d.length;
    for (const side of [-1, 1]) {   // each eyeball on its own
      const ds = d.filter((_, v) => Math.sign(a[v * 3] - cx) === side);
      const mean = ds.reduce((acc, x) => acc.add(x), Vector3.Zero()).scale(1 / ds.length);
      const aligned = ds.filter((x) => Vector3.Dot(x.normalizeToNew(), mean.normalizeToNew()) > 0.7).length;
      console.info(`[shape] eye ${side}: ${ds.length} v, mean offset ${mean.length().toFixed(4)} m, ${aligned} aligned`);
      expect(mean.length()).toBeGreaterThan(0.002);
      expect(aligned / ds.length).toBeGreaterThan(0.9);
    }
    s.root.dispose();
  });

  it('the budget: every mesh carries ONE shape target, so the body is 8 influences at most (the WebGL1 cap), and the bytes', () => {
    at('casual');
    const s = spawn();
    wear(s, { ...REACH_SAFE_DOC, shape: { ...REACH_SAFE_DOC.shape, face: { faceLong: 1, faceRound: 1, faceSquare: 1, faceHeart: 1, faceDiamond: 1, jawOpen: 1, browRaise: 1 } } });
    const body = bodyMeshOf(s.meshes)! as Mesh;
    const mgr = body.morphTargetManager!;
    let active = 0;
    for (let i = 0; i < mgr.numTargets; i++) if (mgr.getTarget(i).influence !== 0) active++;
    expect(active).toBe(8);
    expect(active).toBeLessThanOrEqual(MorphTargetManager.MaxActiveMorphTargetsInVertexAttributeMode);
    const shaped = s.meshes.filter((m) => shapeTargetOf(m));
    for (const m of shaped) {
      const mm = m.morphTargetManager!;
      const ours = Array.from({ length: mm.numTargets }, (_, i) => mm.getTarget(i)).filter((x) => x.name === SHAPE_TARGET);
      expect(ours).toHaveLength(1);
    }
    // texture-mode bytes (WebGL2): one RGBA32F layer per target, width capped at the device's max texture size
    const layer = (verts: number, maxTex: number) => { const texels = verts; const w = Math.min(texels, maxTex); return Math.ceil(texels / w) * w * 16; };
    const kb = (b: number) => `${(b / 1024).toFixed(0)} KiB`;
    const rows = shaped.map((m) => `${m.name.replace(/_c\d+$/, '')} ${m.getTotalVertices()} v: +${kb(layer(m.getTotalVertices(), 4096))} (phone 4096) / +${kb(layer(m.getTotalVertices(), 16384))} (desktop)`);
    const gpuPhone = shaped.reduce((a, m) => a + layer(m.getTotalVertices(), 4096), 0);
    console.info(`[shape budget] ${shaped.length} shaped meshes; body influences ${active}/8 with every face morph on; GPU +${kb(gpuPhone)} on a phone\n  ${rows.join('\n  ')}\n  CPU prep cache ${JSON.stringify(shapeCacheStats())}`);
    s.root.dispose();
  });
});

describe('parts and the jersey plate follow the shape', () => {
  it('a part on a hand is scaled with the hand about the wrist; a part elsewhere is not', () => {
    at('casual');
    const s = spawn();
    const parts: CreatorPart[] = [
      { id: 'g1', shape: 'sphere', bone: 'RightHand', pos: [0, 0.05, 0], rot: [0, 0, 0], scale: [1, 1, 1], colour: '#FF0000', finish: 'matte', mirror: false },
      { id: 'g2', shape: 'sphere', bone: 'Spine2', pos: [0, 0.05, 0.1], rot: [0, 0, 0], scale: [1, 1, 1], colour: '#FF0000', finish: 'matte', mirror: false },
    ];
    wear(s, doc({ body: { hands: 1.5 } }, parts));
    const hand = boneNode(s.skeleton!, 'RightHand');
    const meshes = partsOn(s.root).meshes;
    const onHand = meshes.find((m) => m.parent === hand)!, onChest = meshes.find((m) => m.parent !== hand)!;
    expect(onHand.scaling.x).toBeCloseTo(1.5, 6);
    expect(onHand.position.length()).toBeLessThan(1e-3);   // the wrist IS the hand node's origin
    expect(onChest.scaling.x).toBe(1);
    wear(s, doc({ body: {} }, parts));
    expect(partsOn(s.root).meshes.find((m) => m.parent === hand)!.scaling.x).toBe(1);
    s.root.dispose();
  });
  it('the jersey plate moves out with the chest\'s bulk (absolutely, from where it was hung)', () => {
    at('casual');
    const s = spawn();
    // a stand-in plate, hung as playerIdentity.attachJerseyPlate hangs it (its canvas texture needs a DOM)
    const plate = MeshBuilder.CreatePlane(`jersey_decal_${s.id}`, { width: 0.2, height: 0.18 }, scene);
    plate.parent = boneNode(s.skeleton!, 'Spine2');
    plate.position.set(0, -0.05, -0.17);
    s.meshes.push(plate);
    wear(s, doc({ body: {}, girth: { chest: 1.5 } }));
    const out = plate.position.length();
    expect(out).toBeGreaterThan(Math.hypot(0.05, 0.17) + 0.02);
    wear(s, doc({ body: {}, girth: { chest: 1.5 } }));
    expect(plate.position.length()).toBeCloseTo(out, 9);   // never compounds
    wear(s, doc({ body: {}, girth: { chest: 1 } }));
    expect(plate.position.length()).toBeCloseTo(Math.hypot(0.05, 0.17), 9);
    s.root.dispose();
  });
});

describe('cache safety: what is measured at rest is keyed and measured the same under any shape', () => {
  it('the paint chart, the surface-map keys, the rest skin and the shape preps hold; the parts\' rest frames are unchanged', () => {
    at('casual');
    const plain = spawn(), shaped = spawn();
    wear(plain, null);
    const bodyA = bodyMeshOf(plain.meshes)! as Mesh, bodyB = bodyMeshOf(shaped.meshes)! as Mesh;
    const keyB0 = geometryKey(bodyB), shapeKeyB0 = shapeKey(bodyB), restB0 = Float32Array.from(restSkin(bodyB)!.P);
    const chart = chartForBody(bodyA);
    // the strongest shape there is, frame keys included (a casual scene applies them)
    wear(shaped, doc({ body: { head: 1.6, neck: 1.5, hands: 1.5, feet: 1.5, legs: 1.04, torso: 1.04, shoulders: 1.08 }, girth: { chest: 1.6, thighs: 0.7, head: 1.6 } }));
    expect(geometryKey(bodyB)).toBe(keyB0);
    expect(geometryKey(bodyB)).toBe(geometryKey(bodyA));
    expect(shapeKey(bodyB)).toBe(shapeKeyB0);
    expect(chartForBody(bodyB)).toBe(chart);   // the very same cached chart (a cache hit, not a rebuild)
    expect(surfaceMapKey(bodyB, keyB0, 1024)).toBe(surfaceMapKey(bodyA, geometryKey(bodyA), 1024));
    const restB1 = restSkin(bodyB)!.P;
    let maxd = 0;
    for (let i = 0; i < restB0.length; i++) maxd = Math.max(maxd, Math.abs(restB1[i] - restB0[i]));
    expect(maxd).toBe(0);
    // the garments' keys too (their maps are keyed the same way)
    for (const re of [/^Kit_tops_top_lab/, /^Kit_shoes_shoes_flight/, /^eyes/]) expect(geometryKey(meshNamed(shaped, re))).toBe(geometryKey(meshNamed(plain, re)));
    // the parts' rest frames: measured on a FRESH skeleton of a shaped body, every bone places a part exactly as on a plain one
    const fa = rigFrames(plain.skeleton!, plain.root)!, fb = rigFrames(shaped.skeleton!, shaped.root)!;
    const probe = { pos: [0.03, 0.05, 0.04] as [number, number, number], rot: [10, 20, 30] as [number, number, number], scale: [1, 2, 1] as [number, number, number] };
    for (const bone of PART_BONES) {
      const ma = nodeMatrix({ bone, ...probe }, fa, false)!.m.m, mb = nodeMatrix({ bone, ...probe }, fb, false)!.m.m;
      for (let i = 0; i < 16; i++) expect(Math.abs(ma[i] - mb[i]), `${bone}[${i}]`).toBeLessThan(1e-5);
    }
    plain.root.dispose(); shaped.root.dispose();
  });
});

describe('the Studio size reaches a body only in a Studio scene', () => {
  it('a Studio scene scales the root; the same stamp in a mode or ranked is ignored; identity never applies it', () => {
    for (const place of ['casual', 'dunk', 'ranked'] as Place[]) {
      at(place);
      const s = spawn();
      wear(s, doc({ body: { head: 1.2 } }), { presentation: 1.3 });   // the slot carries it; identityFrom must drop it
      const sc = s.root.scaling.clone();
      expect(applyPresentation(s.root)).toBe(1);                        // unstamped: nothing
      stampPresentation(scene, 'studio', 1.3);
      const applied = applyPresentation(s.root);
      expect(applied).toBe(place === 'casual' ? 1.3 : 1);              // a mode / ranked stamp is never honoured
      expect(s.root.scaling.y).toBeCloseTo(sc.y * applied, 9);
      s.root.dispose();
    }
    at('casual');
  });
});
