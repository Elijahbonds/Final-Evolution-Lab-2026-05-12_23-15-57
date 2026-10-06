// The ARCHETYPE BENCHMARK, render half (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): each of the ten test-only recipes
// dressed on the REAL kit body (its own body: male or female) through the real path — the slot as stored, read by
// identityFrom, applied by applyIdentity — in a `dunk` scene (a standard-frame mode). Asserted per recipe:
//   - the doc that was applied is the one stamped on the body (root.metadata.felCreator);
//   - parts stay inside the phase-2 bar (≤ 24 merged part draws, ≤ 4 part materials), are never pickable and never
//     join spawn.meshes; the paint texture is the tier's size;
//   - COSMETIC ONLY: both hand bones' world positions and the root's scale are IDENTICAL with and without the recipe
//     (its eyes, hide flags, paint, parts and its own height / build included) — no reach, no hitbox drift.
//   - phase 4b (shape v2): still identical with each recipe's head / neck / hand / foot scale, its bulk, its legs /
//     torso / shoulders (exactly 1.0 here, a standard-frame mode) and its Studio-only presentation size (never in a mode).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ARCHETYPES } from '../../creator/look/__fixtures__/archetypes';
import { applyIdentity, identityFrom } from '../core/playerIdentity';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { boneNode } from '../anim/boneLookup';
import { partsOn } from './parts/renderParts';
import { PAINT_SIZES, flushPaint, paintStats, setPaintBaseReader } from './paint/renderPaint';
import { defaultFace } from '../../closet/wearable-catalog';
import { isEyeMesh } from './eyes/renderEyes';
import { bodyMeshOf, shapeTargetOf } from './shape/renderShape';
import { FRAME_KEYS, REACH_SAFE_KEYS } from '../../creator/look/doc';

const kits: Record<'male' | 'female', AssetContainer> = {} as never;
let scene: Scene;
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felModeId: 'dunk', felTier: 'mobile' };
  for (const sex of ['male', 'female'] as const) {
    kits[sex] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);
afterAll(() => setPaintBaseReader(null));

let n = 0;
function spawn(sex: 'male' | 'female'): SpawnedCharacter {
  const inst = kits[sex].instantiateModelsToScene((x) => `${x}_a${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `a${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
/** The world positions of both hands and the root's scale (what reach and the hitbox read). */
function frameOf(s: SpawnedCharacter): number[] {
  s.root.computeWorldMatrix(true);
  for (const t of s.root.getDescendants(false) as TransformNode[]) t.computeWorldMatrix?.(true);
  const out: number[] = [s.root.scaling.x, s.root.scaling.y, s.root.scaling.z];
  for (const b of ['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm']) {
    const p = boneNode(s.skeleton!, b)!.getAbsolutePosition();
    out.push(p.x, p.y, p.z);
  }
  return out;
}
const HERO = (body: 'male' | 'female') => ({ body: body === 'female' ? 'kit-female' : 'kit-male', frame: { heightScale: 100, buildScale: 100 }, scanOwned: false }) as const;

describe('the ten archetypes on the real kit (a dunk scene)', () => {
  for (const a of ARCHETYPES) {
    it(a.name, () => {
      const sex = a.slot.body === 'female' ? 'female' : 'male';
      const s = spawn(sex);
      const pickable0 = s.meshes.map((m) => [m.name, m.isPickable, m.checkCollisions]);
      const count0 = s.meshes.length;
      // without the recipe: the same account, a plain look
      applyIdentity(s, identityFrom({ look: { face: defaultFace(), equipped: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' } } }, HERO(sex), null));
      const plain = frameOf(s);
      // with it: the slot as the server stores it, read the way every mode reads it
      const id = identityFrom({ look: { face: { ...defaultFace(), creatorSlots: [a.slot], activeSlot: a.slot.id }, equipped: {} } }, HERO(sex), null);
      expect(id.creator).toEqual(a.slot.doc);
      applyIdentity(s, id);
      flushPaint(s.root);
      // COSMETIC ONLY: not a millimetre of reach, not a hair of scale
      expect(frameOf(s)).toEqual(plain);
      // the doc that was applied is stamped
      expect(s.root.metadata.felCreator).toEqual({ v: 1, parts: a.slot.doc.parts.length, paint: a.slot.doc.paint.length, suit: a.slot.doc.flags.suit });
      // parts: inside the phase-2 bar, never pickable, never in spawn.meshes
      const parts = partsOn(s.root);
      expect(parts.meshes.length).toBeLessThanOrEqual(24);
      expect(parts.materials.length).toBeLessThanOrEqual(4);
      for (const m of parts.meshes) { expect(m.isPickable).toBe(false); expect(m.checkCollisions).toBe(false); expect(s.meshes).not.toContain(m); }
      // phase 4c: bendable parts are skinned to their own chain, one mesh per finish, on a skeleton that is never the body's
      const swing = parts.meshes.filter((m) => m.metadata?.felSwing);
      if (a.slot.doc.parts.some((p) => (p.swing ?? 0) > 0)) expect(swing.length).toBeGreaterThan(0);
      for (const m of swing) expect(m.skeleton).not.toBe(s.skeleton);
      const glow = (paintStats(s.root)?.targets ?? []).filter((t) => t.glowSize > 0);
      console.info(`[4c draws] ${a.name}: ${parts.meshes.length} part draws (${swing.length} bendable), ${parts.materials.length} materials, ${glow.length} glow textures${glow.length ? ` at ${glow[0].glowSize}²` : ''}`);
      expect(s.meshes.length).toBe(count0);
      expect(s.meshes.map((m) => [m.name, m.isPickable, m.checkCollisions])).toEqual(pickable0);
      // paint at the tier's size
      const st = paintStats(s.root);
      if (a.slot.doc.paint.length || a.slot.doc.flags.hide?.head || a.slot.doc.flags.hide?.ears) {
        for (const t of st!.targets) expect(t.size).toBe(PAINT_SIZES.mobile[t.kind as 'skin' | 'garment']);
      }
      // the eyes follow the hide flag
      // phase 4b: the frame keys play at 1.0 in this standard-frame mode; the reach-safe keys and the bulk are the recipe's
      const sh = a.slot.doc.shape;
      const shaped = Object.keys(sh.body).length || Object.keys(sh.girth ?? {}).length;
      if (shaped) {
        const applied = s.root.metadata.felShape;
        for (const k of FRAME_KEYS) expect(applied.body[k]).toBe(1);
        for (const k of REACH_SAFE_KEYS) expect(applied.body[k]).toBe(sh.body[k] ?? 1);
        const morphs = Object.keys(sh.girth ?? {}).length || (sh.body.hands ?? 1) !== 1 || (sh.body.feet ?? 1) !== 1;
        if (morphs) expect(shapeTargetOf(bodyMeshOf(s.meshes)!)!.influence).toBe(1);
      }
      // the Studio size is never applied in a mode: the root scale check above already includes it
      expect(s.root.metadata.felPresentationScale).toBeUndefined();
      const eyes = s.meshes.find(isEyeMesh)!;
      const hid = !!(a.slot.doc.flags.hide?.eyes || a.slot.doc.flags.hide?.head);
      expect(eyes.isVisible).toBe(!hid);
      s.root.dispose();
    });
  }
});
