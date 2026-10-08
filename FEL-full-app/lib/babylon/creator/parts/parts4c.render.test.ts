// Phase 4c's part tools on the REAL kit bodies (fel-kit-male/female.glb in a NullEngine) — IMPROVE (2026-10-06),
// CREATOR-PLAN phase 4c: the new shapes where they start, two-tone parts at no draw-call cost, and the cosmetic guards.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, HemisphericLight, NullEngine, Ray, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../../anim/boneLookup';
import type { CreatorPart, PartShape } from '../../../creator/look/doc';
import { newPart, PART_START } from '../../../creator/look/parts';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { partsOn, syncParts } from './renderParts';

const NEW_SHAPES: PartShape[] = ['bolt', 'skirt', 'helmet', 'hood', 'ear', 'tailSeg', 'beard', 'bootShell', 'gloveShell', 'strand'];

let scene: Scene; const kits: Record<'male' | 'female', AssetContainer> = {} as never;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  new HemisphericLight('h', new Vector3(0, 1, 0), scene);
  for (const k of ['male', 'female'] as const) {
    kits[k] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${k}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 90_000);

let n = 0;
function body(k: 'male' | 'female' = 'male'): SpawnedCharacter {
  const inst = kits[k].instantiateModelsToScene((x) => `${x}_q${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `q${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
function settle(root: TransformNode): void {
  root.computeWorldMatrix(true);
  for (const c of root.getDescendants(false)) (c as TransformNode).computeWorldMatrix?.(true);
}
const P = (o: Partial<CreatorPart> & { id: string }): CreatorPart => ({
  shape: 'spike', bone: 'Head', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], colour: '#FF0000', finish: 'matte', mirror: false, ...o,
});
const hits = (m: Mesh, from: Vector3, to: Vector3) => { m.refreshBoundingInfo(); const d = to.subtract(from); const len = d.length(); return new Ray(from, d.normalize(), len).intersectsMesh(m as never).hit; };

describe('the new shapes on the body', () => {
  for (const k of ['male', 'female'] as const) {
    it(`${k}: every new shape renders at its start placement, cosmetic only`, () => {
      const s = body(k); settle(s.root);
      const before = [...s.meshes];
      let parts: CreatorPart[] = [];
      for (const shape of NEW_SHAPES) parts = [...parts, newPart(parts, shape, '#FFAA00')!];
      const sum = syncParts(s, parts);
      expect(sum.skipped).toBe(0);
      expect(sum.drawn).toBe(parts.reduce((a, p) => a + (p.mirror ? 2 : 1), 0));
      for (const m of partsOn(s.root).meshes) { expect(m.isPickable).toBe(false); expect(m.checkCollisions).toBe(false); }
      expect(s.meshes).toEqual(before);
      s.root.dispose();
    });
  }

  it('the helmet covers the crown but leaves the face open (rays from above and from the front)', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'h', shape: 'helmet', ...PART_START.helmet })]);
    settle(s.root);
    const m = partsOn(s.root).meshes[0];
    const eyes = s.root.getChildMeshes().find((x) => x.name.startsWith('eyes'))!;
    eyes.refreshBoundingInfo(true);
    const eye = eyes.getBoundingInfo().boundingBox.centerWorld;
    const head = boneNode(s.skeleton, 'Head')!.getAbsolutePosition();
    expect(hits(m, eye.add(new Vector3(0, 0, 0.5)), eye), 'the face opening').toBe(false);
    expect(hits(m, head.add(new Vector3(0, 0.6, 0)), head.add(new Vector3(0, 0.05, 0))), 'the crown').toBe(true);
    expect(hits(m, head.add(new Vector3(0, 0.08, -0.6)), head.add(new Vector3(0, 0.08, 0))), 'the back of the head').toBe(true);
    s.root.dispose();
  });

  it('a boot shell closes over the toes, a glove shell over the fingers', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'b', shape: 'bootShell', ...PART_START.bootShell, mirror: false }), P({ id: 'g', shape: 'gloveShell', ...PART_START.gloveShell, mirror: false })]);
    settle(s.root);
    const [boot, glove] = ['LeftFoot', 'LeftHand'].map((b) => partsOn(s.root).meshes.find((m) => m.parent === boneNode(s.skeleton, b))!);
    const toe = boneNode(s.skeleton, 'LeftToeBase')!.getAbsolutePosition(), ankle = boneNode(s.skeleton, 'LeftFoot')!.getAbsolutePosition();
    const out = toe.subtract(ankle).normalize();
    expect(hits(boot, toe.add(out.scale(0.4)), toe.add(out.scale(0.04))), 'past the toes').toBe(true);
    const hand = boneNode(s.skeleton, 'LeftHand')!.getAbsolutePosition(), elbow = boneNode(s.skeleton, 'LeftForeArm')!.getAbsolutePosition();
    const along = hand.subtract(elbow).normalize();
    expect(hits(glove, hand.add(along.scale(0.5)), hand.add(along.scale(0.05))), 'past the fingers').toBe(true);
    s.root.dispose();
  });
});

describe('two-tone parts', () => {
  const rgbOf = (m: Mesh) => { const c = m.getVerticesData('color')!; const set = new Set<string>(); for (let i = 0; i < c.length; i += 4) set.add(`${c[i].toFixed(3)},${c[i + 1].toFixed(3)},${c[i + 2].toFixed(3)}`); return set; };

  it('cost no draw call and no material: a two-tone build has exactly the one-colour build\'s meshes and materials', () => {
    const one = body(), two = body();
    const parts = (tone: boolean) => [
      ...[0, 1, 2, 3, 4].map((i) => P({ id: `h${i}`, shape: 'horn', pos: [(i - 2) * 0.03, 0.12, -0.04], rot: [-120, 0, 0], colour: '#111111', ...(tone ? { colour2: '#C8102E', tone: 'band' as const, toneAt: 0.6 } : {}) })),
      P({ id: 'p', shape: 'plate', bone: 'Spine2', pos: [0, 0.03, 0.165], colour: '#556B2F', finish: 'metal', ...(tone ? { colour2: '#D4A017', toneAxis: 'x' as const } : {}) }),
    ];
    const a = syncParts(one, parts(false)), b = syncParts(two, parts(true));
    expect(b.meshes).toBe(a.meshes);
    expect(b.materials).toBe(a.materials);
    const horns = partsOn(two.root).meshes.find((m) => m.parent === boneNode(two.skeleton, 'Head'))!;
    expect(rgbOf(horns).size).toBe(2);
    expect(rgbOf(partsOn(one.root).meshes.find((m) => m.parent === boneNode(one.skeleton, 'Head'))!).size).toBe(1);
    one.root.dispose(); two.root.dispose();
  });

  it('changing only the second colour re-bakes only its own group', () => {
    const s = body();
    const parts = [P({ id: 'a', colour2: '#00FF00' }), P({ id: 'b', bone: 'LeftFoot', shape: 'wedge' })];
    syncParts(s, parts);
    const foot = partsOn(s.root).meshes.find((m) => m.parent === boneNode(s.skeleton, 'LeftFoot'))!;
    const footColours = Array.from(foot.getVerticesData('color')!);
    const head = partsOn(s.root).meshes.find((m) => m.parent === boneNode(s.skeleton, 'Head'))!;
    const headColours = Array.from(head.getVerticesData('color')!);
    syncParts(s, [{ ...parts[0], colour2: '#0000FF' }, parts[1]]);
    expect(Array.from(foot.getVerticesData('color')!)).toEqual(footColours);
    expect(Array.from(head.getVerticesData('color')!)).not.toEqual(headColours);
    s.root.dispose();
  });
});

describe('parts that follow the bulk', () => {
  it('a chest plate marked `follow` rides out by the chest\'s bulk ((g − 1) × its radius); unmarked, it stays (and sinks)', async () => {
    const { applyCreatorLayers } = await import('../../core/creatorLook');
    const { bodyMeshOf, measureBody } = await import('../shape/renderShape');
    const { sanitizeCreatorDoc } = await import('../../../creator/look/sanitize');
    const plate = (follow: boolean) => ({ id: follow ? 'f' : 'n', shape: 'plate', bone: 'Spine2', pos: [follow ? 0.06 : -0.06, 0.03, 0.165], colour: '#808080', ...(follow ? { follow: true } : {}) });
    const centre = (s: SpawnedCharacter, i: number) => {
      settle(s.root);
      const m = partsOn(s.root).meshes[0]; const p = m.getVerticesData('position')!; const W = m.computeWorldMatrix(true);
      // the two plates are baked into one mesh: average each half's vertices
      const n = p.length / 3 / 2; const c = Vector3.Zero();
      for (let v = i * n; v < (i + 1) * n; v++) c.addInPlace(Vector3.TransformCoordinates(new Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]), W));
      return c.scale(1 / n);
    };
    const s = body(); settle(s.root);
    const doc = (girth: number) => sanitizeCreatorDoc({ v: 1, parts: [plate(false), plate(true)], shape: { face: {}, body: {}, girth: { chest: girth } } });
    applyCreatorLayers(s, doc(1));
    const flat = [centre(s, 0), centre(s, 1)];
    applyCreatorLayers(s, doc(1.4));
    const bulked = [centre(s, 0), centre(s, 1)];
    const r = measureBody(bodyMeshOf(s.meshes)!)!.radius.Spine2;
    expect(r).toBeGreaterThan(0.05);
    expect(Vector3.Distance(flat[0], bulked[0]), 'not following: it stays').toBeLessThan(1e-6);
    const moved = bulked[1].subtract(flat[1]);
    expect(moved.length()).toBeCloseTo(0.4 * r, 3);
    expect(moved.z, 'outward: forward, off the chest').toBeGreaterThan(0.8 * moved.length());
    // and back when the bulk goes
    applyCreatorLayers(s, doc(1));
    expect(Vector3.Distance(centre(s, 1), flat[1])).toBeLessThan(1e-6);
    s.root.dispose();
  });
});
