// Creator parts on the REAL kit body (fel-kit-male.glb in a NullEngine) — IMPROVE (2026-10-06), CREATOR-PLAN phase 2.
// Placement maths against the rig, mirroring, merging per (bone, material), the 64 budget, disposal, the cosmetic guards
// (never pickable, never colliding, never in spawn.meshes, no bone moved), the Nexus Visor, and the draw-call numbers.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, HemisphericLight, MeshBuilder, NullEngine, Quaternion, Ray, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../../anim/boneLookup';
import type { CreatorPart, PartBone, PartShape } from '../../../creator/look/doc';
import { PART_SHAPES } from '../../../creator/look/doc';
import { newPart, spikeCluster } from '../../../creator/look/parts';
import { applyIdentity, type PlayerIdentity } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';
import { wornPartsForEquipped } from '../../../closet/wearableAccessories';
import { sanitizeCreatorDoc } from '../../../creator/look/sanitize';
import { clearParts, partsOn, syncParts } from './renderParts';
import { rootMatrix } from './placement';
import { rigFrames } from './rigFrames';

let scene: Scene; let kit: AssetContainer;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  new HemisphericLight('h', new Vector3(0, 1, 0), scene);
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 60_000);

let n = 0;
function body(): SpawnedCharacter {
  const inst = kit.instantiateModelsToScene((x) => `${x}_r${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `r${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
function settle(root: TransformNode): void {
  root.computeWorldMatrix(true);
  for (const c of root.getDescendants(false)) (c as TransformNode).computeWorldMatrix?.(true);
}
const P = (o: Partial<CreatorPart> & { id: string }): CreatorPart => ({
  shape: 'spike', bone: 'Head', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], colour: '#FF0000', finish: 'matte', mirror: false, ...o,
});
/** A part mesh's vertex `i` in world space. */
function worldVert(m: Mesh, i: number): Vector3 {
  const p = m.getVerticesData('position')!;
  return Vector3.TransformCoordinates(new Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), m.computeWorldMatrix(true));
}
const near = (a: Vector3, b: Vector3, tol: number) => expect(Vector3.Distance(a, b), `${a} vs ${b}`).toBeLessThan(tol);

describe('placement maths on the rig', () => {
  it('the body frame is read off the rig: right, up and forward match the body in the world', () => {
    const s = body(); settle(s.root);
    const f = rigFrames(s.skeleton, s.root)!;
    const W = s.root.getWorldMatrix();
    const toWorld = (v: Vector3) => Vector3.TransformNormal(v, W).normalize();
    // the kit faces +z with its right at +x in the world (its toes and its RightArm say so)
    near(toWorld(f.axes.right), new Vector3(1, 0, 0), 0.02);
    near(toWorld(f.axes.up), new Vector3(0, 1, 0), 0.03);
    near(toWorld(f.axes.fwd), new Vector3(0, 0, 1), 0.03);
    s.root.dispose();
  });

  it('a part sits at its bone\'s joint plus pos along the bone\'s frame (head: x right, y up, z forward)', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', pos: [0.05, 0.2, 0.03] })]);
    settle(s.root);
    const head = boneNode(s.skeleton, 'Head')!.getAbsolutePosition();
    const m = partsOn(s.root).meshes[0];
    expect(m.parent?.name).toMatch(/^Head/);
    // the spike's base centre is its first ring's centre: average the base disc's ring
    const pos = m.getVerticesData('position')!;
    let lowest = new Vector3(0, Infinity, 0);
    for (let i = 0; i < pos.length / 3; i++) { const w = worldVert(m, i); if (w.y < lowest.y - 1e-6) lowest = w; }
    near(new Vector3(head.x + 0.05, head.y + 0.2, head.z + 0.03), new Vector3(lowest.x, lowest.y, lowest.z), 0.02);
    s.root.dispose();
  });

  it('along a limb, y runs down the bone towards the next joint (the forearm, to the hand)', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', bone: 'LeftForeArm', pos: [0, 0.1, 0], scale: [0.2, 0.2, 0.2], shape: 'sphere' })]);
    settle(s.root);
    const fa = boneNode(s.skeleton, 'LeftForeArm')!.getAbsolutePosition(), hand = boneNode(s.skeleton, 'LeftHand')!.getAbsolutePosition();
    const m = partsOn(s.root).meshes[0];
    m.refreshBoundingInfo();
    const c = m.getBoundingInfo().boundingBox.centerWorld;
    near(c, fa.add(hand.subtract(fa).normalize().scale(0.1)), 0.01);
    s.root.dispose();
  });

  it('a part rides its bone: turn the forearm and the part turns with it', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', bone: 'LeftForeArm', pos: [0.03, 0.12, 0.02] })]);
    settle(s.root);
    const node = boneNode(s.skeleton, 'LeftForeArm')!;
    const m = partsOn(s.root).meshes[0];
    const local0 = Vector3.TransformCoordinates(worldVert(m, 0), node.getWorldMatrix().clone().invert());
    const before = worldVert(m, 0);
    node.rotationQuaternion = (node.rotationQuaternion ?? Quaternion.Identity()).multiply(Quaternion.RotationAxis(Vector3.Forward(), 1.1));
    settle(s.root);
    const after = worldVert(m, 0);
    expect(Vector3.Distance(before, after)).toBeGreaterThan(0.05);   // it moved with the bone…
    near(Vector3.TransformCoordinates(after, node.getWorldMatrix().clone().invert()), local0, 1e-4);   // …and stayed put on it
    s.root.dispose();
  });

  it('placement does not depend on the live pose (worked out from the rest matrices)', () => {
    const a = body(), b = body(); settle(a.root); settle(b.root);
    const node = boneNode(b.skeleton, 'LeftForeArm')!;
    node.rotationQuaternion = (node.rotationQuaternion ?? Quaternion.Identity()).multiply(Quaternion.RotationAxis(Vector3.Up(), 0.9));
    settle(b.root);
    const part = P({ id: 'a', bone: 'LeftForeArm', pos: [0.03, 0.12, 0.02], rot: [10, 20, 30] });
    syncParts(a, [part]); syncParts(b, [part]);
    // same bone-local geometry on both bodies, whatever pose b was in when the part was placed
    const pa = partsOn(a.root).meshes[0].getVerticesData('position')!, pb = partsOn(b.root).meshes[0].getVerticesData('position')!;
    expect(Array.from(pb).map((v, i) => Math.abs(v - pa[i])).reduce((x, y) => Math.max(x, y), 0)).toBeLessThan(1e-6);
    a.root.dispose(); b.root.dispose();
  });
});

describe('mirroring', () => {
  it('the mirror copy is the exact reflection of the part through the body\'s midline, on the opposite bone', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', shape: 'wing', bone: 'LeftForeArm', pos: [0.02, 0.1, 0.03], rot: [15, 30, -20], scale: [1, 1.5, 0.7], mirror: true })]);
    settle(s.root);
    const ms = partsOn(s.root).meshes;
    expect(ms.map((m) => m.parent?.name.replace(/_r\d+$/, '')).sort()).toEqual(['LeftForeArm', 'RightForeArm']);
    const left = ms.find((m) => m.parent!.name.startsWith('Left'))!, right = ms.find((m) => m.parent!.name.startsWith('Right'))!;
    const f = rigFrames(s.skeleton, s.root)!;
    const W = s.root.getWorldMatrix();
    const reflect = (w: Vector3) => {   // world → root → reflect → world
      const r = Vector3.TransformCoordinates(w, W.clone().invert());
      return Vector3.TransformCoordinates(Vector3.TransformCoordinates(r, f.mirror), W);
    };
    const nv = left.getTotalVertices();
    expect(right.getTotalVertices()).toBe(nv);
    for (let i = 0; i < nv; i += 7) near(reflect(worldVert(left, i)), worldVert(right, i), 1e-4);
    // a reflection: the two placements have opposite handedness
    const pl = rootMatrix(P({ id: 'a', bone: 'LeftForeArm', mirror: true }), f, false)!, pr = rootMatrix(P({ id: 'a', bone: 'LeftForeArm', mirror: true }), f, true)!;
    expect(Math.sign(pl.determinant())).toBe(-Math.sign(pr.determinant()));
    s.root.dispose();
  });

  it('a centre bone mirrors onto itself (a horn pair on the head), both copies in one merged mesh', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', shape: 'horn', pos: [0.06, 0.15, 0.05], rot: [0, 0, -25], mirror: true })]);
    settle(s.root);
    const ms = partsOn(s.root).meshes;
    expect(ms).toHaveLength(1);
    ms[0].refreshBoundingInfo();
    const bb = ms[0].getBoundingInfo().boundingBox;
    const head = boneNode(s.skeleton, 'Head')!.getAbsolutePosition();
    expect(bb.minimumWorld.x - head.x).toBeLessThan(-0.07);
    expect(bb.maximumWorld.x - head.x).toBeGreaterThan(0.07);
    s.root.dispose();
  });

  it('the same numbers on the right bone land in the mirrored place (right frames are reflected)', () => {
    const s = body(); settle(s.root);
    const f = rigFrames(s.skeleton, s.root)!;
    const part = P({ id: 'a', bone: 'LeftArm', pos: [0.04, 0.12, 0.02], rot: [0, 0, -90] });
    const mirrorCopy = rootMatrix(part, f, true)!;
    const onRight = rootMatrix({ ...part, bone: 'RightArm' }, f, false)!;
    // the kit is symmetric to a couple of centimetres (its hands differ by 1.4 cm in height)
    near(onRight.getTranslation(), mirrorCopy.getTranslation(), 0.02);
    const ax = (m: typeof onRight, k: number) => new Vector3(m.m[k * 4], m.m[k * 4 + 1], m.m[k * 4 + 2]).normalize();
    for (const k of [0, 1, 2]) expect(Vector3.Dot(ax(onRight, k), ax(mirrorCopy, k))).toBeGreaterThan(0.99);
    s.root.dispose();
  });
});

describe('merging and materials', () => {
  it('ten spikes of one colour on the head are ONE mesh and ONE material', () => {
    const s = body();
    syncParts(s, spikeCluster([], { count: 10, colour: '#336699' }));
    expect(partsOn(s.root).meshes).toHaveLength(1);
    expect(partsOn(s.root).materials).toHaveLength(1);
    expect(partsOn(s.root).meshes[0].getTotalVertices()).toBe(10 * 28);
    s.root.dispose();
  });

  it('groups by bone and finish; colour rides in the vertex colours; materials are one per finish, shared across bones', () => {
    const s = body();
    const parts = [
      P({ id: 'a' }), P({ id: 'b', colour: '#00FF00' }), P({ id: 'c', finish: 'metal' }),
      P({ id: 'd', bone: 'LeftForeArm' }), P({ id: 'e', bone: 'LeftForeArm', mirror: true }),
    ];
    const sum = syncParts(s, parts);
    // Head: matte (a red + b green), metal (c); LeftForeArm: matte (d + e); RightForeArm: matte (e's mirror)
    expect(sum).toEqual({ asked: 5, drawn: 6, meshes: 4, materials: 2, skipped: 0 });
    const headMatte = partsOn(s.root).meshes.find((m) => m.parent!.name.startsWith('Head') && (m.material?.name ?? '').endsWith('matte'))!;
    const col = headMatte.getVerticesData('color')!;
    const vs = headMatte.getTotalVertices();
    expect(Array.from(col.slice(0, 4))).toEqual([1, 0, 0, 1]);                       // a, red
    expect(Array.from(col.slice((vs - 1) * 4, vs * 4))).toEqual([0, 1, 0, 1]);      // b, green
    // a colour change re-colours the group without a new material
    const mats = partsOn(s.root).materials.slice();
    syncParts(s, parts.map((p) => ({ ...p, colour: '#123456' })));
    expect(partsOn(s.root).materials).toEqual(mats);
    s.root.dispose();
  });

  it('the finishes read as finishes: matte is rough, gloss smooth, metal metallic, glow unlit', () => {
    const s = body();
    syncParts(s, (['matte', 'gloss', 'metal', 'glow'] as const).map((finish, i) => P({ id: `f${i}`, finish })));
    const by = Object.fromEntries(partsOn(s.root).materials.map((m) => [m.name.split('_').pop(), m]));
    expect(by.matte.roughness).toBeGreaterThan(0.7);
    expect(by.gloss.roughness).toBeLessThan(0.3);
    expect(by.metal.metallic).toBeGreaterThan(0.8);
    expect(by.glow.unlit).toBe(true);
    s.root.dispose();
  });

  it('only the group an edit touches is rebuilt (an editor drag re-bakes one mesh)', () => {
    const s = body();
    const a = P({ id: 'a' }), b = P({ id: 'b', bone: 'Spine2', colour: '#0000FF' });
    syncParts(s, [a, b]);
    const meshes = partsOn(s.root).meshes;
    const spine = meshes.find((m) => m.parent!.name.startsWith('Spine2'))!, head = meshes.find((m) => m.parent!.name.startsWith('Head'))!;
    const spineVB = spine.getVertexBuffer('position'), headPos = Array.from(head.getVerticesData('position')!);
    syncParts(s, [{ ...a, pos: [0, 0.1, 0] }, b]);
    expect(partsOn(s.root).meshes).toContain(spine);
    expect(spine.getVertexBuffer('position')).toBe(spineVB);               // untouched: not even re-uploaded
    expect(partsOn(s.root).meshes).toContain(head);                        // same mesh…
    expect(Array.from(head.getVerticesData('position')!)).not.toEqual(headPos);   // …new vertices
    s.root.dispose();
  });

  it('the budget holds on the body: 40 mirrored entries draw 64 copies', () => {
    const s = body();
    const parts = Array.from({ length: 40 }, (_, i) => P({ id: `p${i}`, bone: 'LeftArm', pos: [0, 0.01 * i, 0], mirror: true }));
    expect(syncParts(s, parts).drawn).toBe(64);
    s.root.dispose();
  });
});

describe('disposal (nothing leaks)', () => {
  it('doc changes neither stack nor leak meshes or materials; clearing returns to the baseline', () => {
    const s = body();
    const m0 = scene.meshes.length, t0 = scene.materials.length;
    for (let i = 0; i < 25; i++) {
      const parts = spikeCluster([], { count: 1 + (i % 7), colour: i % 2 ? '#112233' : '#445566' });
      if (i % 3 === 0) parts.push(P({ id: 'z', bone: 'LeftHand', shape: PART_SHAPES[i % PART_SHAPES.length] as PartShape, finish: 'glow', mirror: true }));
      syncParts(s, parts);
      expect(scene.meshes.length - m0).toBe(partsOn(s.root).meshes.length);
      expect(scene.materials.length - t0).toBe(partsOn(s.root).materials.length);
    }
    syncParts(s, []);
    expect(scene.meshes.length).toBe(m0);
    expect(scene.materials.length).toBe(t0);
    s.root.dispose();
  });

  it('disposing the body takes every part mesh and material with it', () => {
    const m0 = scene.meshes.length, t0 = scene.materials.length;
    const s = body();
    const bodyMeshes = scene.meshes.length - m0;
    syncParts(s, [P({ id: 'a' }), P({ id: 'b', bone: 'LeftFoot', colour: '#00FF00', mirror: true })]);
    const made = [...partsOn(s.root).meshes, ...partsOn(s.root).materials];
    expect(made.length).toBe(3 + 1);   // head, left foot, right foot; one matte material
    s.root.dispose();
    expect(scene.meshes.length).toBe(m0);
    expect(scene.materials.length).toBe(t0);
    expect(bodyMeshes).toBeGreaterThan(0);
  });

  it('clearParts empties the body', () => {
    const s = body();
    syncParts(s, [P({ id: 'a' })]);
    clearParts(s.root);
    expect(partsOn(s.root).meshes).toHaveLength(0);
    s.root.dispose();
  });
});

describe('cosmetic only', () => {
  it('parts are never pickable, never collide, carry no physics and are not in spawn.meshes', () => {
    const s = body();
    const meshesBefore = [...s.meshes];
    const finishes = ['matte', 'gloss', 'metal', 'glow'] as const;
    const bones: PartBone[] = ['Spine2', 'Head', 'LeftHand', 'RightFoot'];
    const sum = syncParts(s, PART_SHAPES.map((shape, i) => P({ id: `p${i}`, shape: shape as PartShape, bone: bones[i % 4], finish: finishes[(i >> 2) % 4], scale: [3, 3, 3] })));
    expect(sum.drawn).toBe(PART_SHAPES.length);
    const ms = partsOn(s.root).meshes;
    expect(ms.length).toBeGreaterThan(8);
    for (const m of ms) {
      expect(m.isPickable).toBe(false);
      expect(m.checkCollisions).toBe(false);
      expect((m as unknown as { physicsBody?: unknown }).physicsBody ?? null).toBeNull();
      expect((m as unknown as { physicsImpostor?: unknown }).physicsImpostor ?? null).toBeNull();
      expect(m.metadata?.felCreatorPart).toBe(true);
    }
    expect(s.meshes).toEqual(meshesBefore);
    s.root.dispose();
  });

  // NOTE (measured): Babylon skips the isPickable test when a pick passes its own predicate. Every predicate in lib/babylon
  // (2026-10-06) is a whitelist (ground lists, a prop's meshes), asks isPickable itself (CameraDirector, VenueProps), or
  // excludes the hero root's descendants (ModeHarness's ring probe), so none can reach a part. This test pins the default.
  it('a pick through a big part passes straight through it (control: the same ray hits a pickable box there)', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', shape: 'sphere', bone: 'Spine2', pos: [0, 0, 0.6], scale: [8, 8, 8] })]);
    settle(s.root);
    const m = partsOn(s.root).meshes[0];
    m.refreshBoundingInfo();
    const c = m.getBoundingInfo().boundingBox.centerWorld.clone();
    const ray = new Ray(c.add(new Vector3(0, 0, 2)), new Vector3(0, 0, -1), 4);
    const hit = scene.pickWithRay(ray);
    expect(hit?.hit && partsOn(s.root).meshes.includes(hit.pickedMesh as Mesh)).toBe(false);
    // the predicates the modes use: isPickable-gated (CameraDirector) and not-the-hero (ModeHarness)
    expect(scene.pickWithRay(ray, (x: AbstractMesh) => x.isPickable && partsOn(s.root).meshes.includes(x as Mesh))?.hit ?? false).toBe(false);
    expect(scene.pickWithRay(ray, (x: AbstractMesh) => !x.isDescendantOf(s.root) && partsOn(s.root).meshes.includes(x as Mesh))?.hit ?? false).toBe(false);
    const control = MeshBuilder.CreateBox('ctl', { size: 0.4 }, scene); control.position.copyFrom(c); control.computeWorldMatrix(true);
    expect(scene.pickWithRay(ray, (x: AbstractMesh) => x === control)?.hit).toBe(true);
    control.dispose();
    s.root.dispose();
  });

  it('no bone moves: the hands and feet (reach, contact) are where they were without parts', () => {
    const s = body(); settle(s.root);
    const joints: PartBone[] = ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head', 'Hips'];
    const at = () => joints.map((j) => boneNode(s.skeleton, j)!.getAbsolutePosition().clone());
    const before = at();
    syncParts(s, PART_SHAPES.map((shape, i) => P({ id: `p${i}`, shape: shape as PartShape, bone: joints[i % joints.length], scale: [8, 8, 8], mirror: true })).slice(0, 32));
    settle(s.root);
    at().forEach((p, i) => near(p, before[i], 1e-9));
    s.root.dispose();
  });
});

describe('through the identity pipe (the Creator hook)', () => {
  const ID = (o: Partial<PlayerIdentity> = {}): PlayerIdentity => ({
    proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
    jersey: null, wardrobe: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, custom: true, body: 'kit-male', ...o,
  });

  it('applyIdentity renders the doc\'s parts, follows doc edits, and clears with the doc', () => {
    const s = body();
    const creator = sanitizeCreatorDoc({ v: 1, parts: [P({ id: 'a' }), P({ id: 'b', bone: 'LeftHand', colour: '#00FF00', mirror: true })] })!;
    applyIdentity(s, ID({ creator }));
    expect(partsOn(s.root).meshes).toHaveLength(3);
    applyIdentity(s, ID({ creator: { ...creator, parts: creator.parts.slice(0, 1) } }));
    expect(partsOn(s.root).meshes).toHaveLength(1);
    applyIdentity(s, ID({ creator: null }));
    expect(partsOn(s.root).meshes).toHaveLength(0);
    s.root.dispose();
  });

  it('the bought Nexus Visor renders as a visor part, in its accent, over the eyes — with or without a doc', () => {
    const worn = wornPartsForEquipped({ headwear: 'cap_nexus' });
    expect(worn).toEqual([expect.objectContaining({ shape: 'visor', bone: 'Head', colour: '#00E5FF', finish: 'glow' })]);
    expect(wornPartsForEquipped({ headwear: 'band_flow' })).toEqual([]);
    const s = body();
    applyIdentity(s, ID({ creator: null, wornParts: worn }));
    settle(s.root);
    const ms = partsOn(s.root).meshes;
    expect(ms).toHaveLength(1);
    const visor = ms[0]; visor.refreshBoundingInfo();
    const eyes = s.root.getChildMeshes().find((m) => m.name.startsWith('eyes'))!;
    eyes.refreshBoundingInfo(true);
    const v = visor.getBoundingInfo().boundingBox, e = eyes.getBoundingInfo().boundingBox;
    expect(v.minimumWorld.x).toBeLessThan(e.minimumWorld.x);
    expect(v.maximumWorld.x).toBeGreaterThan(e.maximumWorld.x);
    expect(v.maximumWorld.z).toBeGreaterThan(e.maximumWorld.z);
    const eyeY = e.centerWorld.y;
    expect(v.minimumWorld.y).toBeLessThan(eyeY);
    expect(v.maximumWorld.y).toBeGreaterThan(eyeY);
    // and it stays with a doc on, outside the player's own parts
    applyIdentity(s, ID({ creator: sanitizeCreatorDoc({ v: 1, parts: [P({ id: 'a', bone: 'LeftHand' })] }), wornParts: worn }));
    expect(partsOn(s.root).meshes).toHaveLength(2);
    // unequipped: gone
    applyIdentity(s, ID({ creator: null, wornParts: [] }));
    expect(partsOn(s.root).meshes).toHaveLength(0);
    s.root.dispose();
  });
});

describe('draw calls and materials (measured: 0 vs 20 vs 64 parts)', () => {
  // a clean scene: one kit body in its default identity, a camera framing it, nothing left over from the cases above
  let clean: Scene; let s: SpawnedCharacter;
  beforeAll(async () => {
    clean = new Scene(new NullEngine());
    clean.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), clean);
    new HemisphericLight('h', new Vector3(0, 1, 0), clean);
    const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, clean, undefined, '.glb');
    const inst = c.instantiateModelsToScene((x) => `${x}_m`, false, { doNotInstantiate: true });
    for (const g of inst.animationGroups) g.stop();
    const root = inst.rootNodes[0] as TransformNode;
    s = { id: 'm', root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
    applyIdentity(s, { proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' }, jersey: null, wardrobe: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, custom: true, body: 'kit-male' });
  }, 60_000);
  /** Draws a frame would issue: the submeshes of every active (visible, in-frustum) mesh. NullEngine does not count GPU draws. */
  function frame(): { draws: number; materials: number } {
    clean.render();
    let draws = 0;
    for (const m of clean.getActiveMeshes().data.slice(0, clean.getActiveMeshes().length)) draws += m.subMeshes?.length ?? 1;
    return { draws, materials: clean.materials.length };
  }
  /** A realistic build: `count` parts spread over the body in four colours, a third of them mirrored. */
  function build(count: number): CreatorPart[] {
    const bones: PartBone[] = ['Head', 'Spine2', 'LeftArm', 'LeftForeArm', 'LeftUpLeg', 'LeftFoot', 'Hips'];
    const colours = ['#E02020', '#2050E0', '#F0F0F0', '#202020'];
    const out: CreatorPart[] = [];
    for (let i = 0; out.reduce((k, p) => k + (p.mirror ? 2 : 1), 0) < count; i++) {
      const left = count - out.reduce((k, p) => k + (p.mirror ? 2 : 1), 0);
      const p = newPart(out, PART_SHAPES[i % PART_SHAPES.length] as PartShape, colours[i % colours.length])!;
      out.push({ ...p, bone: bones[i % bones.length], mirror: left >= 2 && i % 3 === 0 });
    }
    return out;
  }

  it('reports the numbers, and parts add one draw per (bone, material) group, never one per part', () => {
    settle(s.root);
    const base = frame();
    const rows: string[] = [];
    for (const count of [0, 20, 64]) {
      const parts = build(count);
      const sum = syncParts(s, parts);
      const f = frame();
      rows.push(`${String(count).padStart(2)} parts → ${sum.drawn} drawn, ${sum.meshes} merged meshes, +${f.draws - base.draws} draw calls (${f.draws} total), +${f.materials - base.materials} materials, ${partsOn(s.root).meshes.reduce((k, m) => k + m.getTotalVertices(), 0)} part vertices`);
      expect(sum.drawn).toBe(count);
      expect(f.draws - base.draws).toBe(sum.meshes);
      expect(f.materials - base.materials).toBe(sum.materials);
      if (count) expect(sum.meshes).toBeLessThan(count);
    }
    console.info(`[CREATOR-PARTS] body alone ${base.draws} draw calls, ${base.materials} materials\n  ${rows.join('\n  ')}`);
    expect(partsOn(s.root).materials.length).toBeLessThanOrEqual(4);   // one per finish, at most
  });
});
