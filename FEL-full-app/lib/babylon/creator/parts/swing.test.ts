// Bendable parts (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): the spring's pure maths (fixed step, frame-rate
// independence, damping, the clamp, no allocation), and the rig on the REAL kit body (fel-kit-male.glb in a NullEngine):
// rides its bone, bends the right way under acceleration and tilt, follows the tier's cap, cosmetic only.
import { readFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, Matrix, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import { TransformNode } from '@babylonjs/core';
import type { AssetContainer, Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../../anim/boneLookup';
import type { CreatorPart } from '../../../creator/look/doc';
import { sanitizePart } from '../../../creator/look/sanitize';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { partsOn, syncParts } from './renderParts';
import { shapeGeo, swingGeo } from './shapes';
import {
  CHAIN_FLOATS, SWING_MAX_ANGLE, SWING_MAX_CHAINS, SWING_SEGMENTS, chainWeights, rotationTo, springFor, springStep, stepSwing, stepsFor,
  SWING_FRAME_PATH, swingRigCount, type SwingRig,
} from './swing';

describe('the spring (pure)', () => {
  it('settles on its target, damped (no overshoot past 35 %), and never blows up at the slowest step', () => {
    for (const swing of [0.05, 0.5, 1]) {
      const { k, c } = springFor(swing);
      for (const h of [1 / 60, 1 / 30]) {
        const st = new Float32Array(CHAIN_FLOATS);
        let peak = 0;
        for (let i = 0; i < 600; i++) { springStep(st, 0, 0.5, -0.3, k, c, h); peak = Math.max(peak, st[0]); expect(Number.isFinite(st[0])).toBe(true); }
        expect(st[0]).toBeCloseTo(0.5, 3); expect(st[1]).toBeCloseTo(-0.3, 3);
        expect(peak).toBeLessThan(0.5 * 1.35);
      }
    }
  });
  it('is clamped to ±75° per axis, and a clamped axis stops', () => {
    const st = new Float32Array(CHAIN_FLOATS);
    for (let i = 0; i < 400; i++) springStep(st, 0, 5, -5, 160, 1, 1 / 60);
    expect(st[0]).toBeCloseTo(SWING_MAX_ANGLE); expect(st[1]).toBeCloseTo(-SWING_MAX_ANGLE);
    expect(st[2]).toBe(0); expect(st[3]).toBe(0);
  });
  it('fixed step: 60 fps and 30 fps frames take the same steps over the same time; a long frame drops time', () => {
    const o = [0];
    let n60 = 0, n30 = 0;
    for (let i = 0; i < 120; i++) n60 += stepsFor(o[0], 1 / 60, 1 / 60, 3, o);
    o[0] = 0;
    for (let i = 0; i < 60; i++) n30 += stepsFor(o[0], 1 / 30, 1 / 60, 3, o);
    expect(n60).toBe(120); expect(n30).toBe(120);
    expect(stepsFor(0, 1, 1 / 60, 3, o)).toBe(3); expect(o[0]).toBe(0);
    expect(stepsFor(0, 1, 1 / 30, 1, o)).toBe(1); expect(o[0]).toBe(0);
  });
  it('rotationTo turns the rest direction onto the target (checked with Babylon\'s own rotation, the one the bones use)', () => {
    const out = new Float32Array(2);
    for (const sign of [1, -1] as const) for (const u of [[0.3, -0.9, 0.2], [0, -1, 0], [0.8, 0.1, -0.5], [-0.2, 0.6, 0.7]]) {
      const n = new Vector3(u[0], u[1], u[2]).normalize();
      rotationTo(sign, n.x, n.y, n.z, out);
      const ang = Math.hypot(out[0], out[1]);
      const q = ang > 1e-9 ? Quaternion.RotationAxis(new Vector3(out[0] / ang, 0, out[1] / ang), ang) : Quaternion.Identity();
      const m = new Matrix(); Matrix.FromQuaternionToRef(q, m);
      const d = Vector3.TransformNormal(new Vector3(0, sign, 0), m);
      expect(Vector3.Distance(d, n), `${sign} ${u}`).toBeLessThan(1e-5);
    }
  });
  it('every vertex is weighted to its chain\'s links, weights summing to 1, the tip on the last link', () => {
    for (const shape of ['capeStrip', 'strand', 'tailSeg'] as const) {
      const g = swingGeo(shape);
      const w = chainWeights(g, shape, 10);
      for (let v = 0; v < g.positions.length / 3; v++) {
        expect(w.weights[v * 4] + w.weights[v * 4 + 1]).toBeCloseTo(1);
        for (let k = 0; k < 2; k++) if (w.weights[v * 4 + k] > 0) { expect(w.indices[v * 4 + k]).toBeGreaterThanOrEqual(10); expect(w.indices[v * 4 + k]).toBeLessThan(10 + SWING_SEGMENTS); }
      }
      const tip = [...Array(g.positions.length / 3).keys()].sort((a, b) => Math.abs(g.positions[b * 3 + 1]) - Math.abs(g.positions[a * 3 + 1]))[0];
      expect(w.indices[tip * 4]).toBe(10 + SWING_SEGMENTS - 1);
    }
    // the bendable cape strip is denser along its length than the rigid one
    expect(swingGeo('capeStrip').positions.length).toBeGreaterThan(shapeGeo('capeStrip').positions.length);
  });
});

// ── on the body ──────────────────────────────────────────────────────────────────────────────────────────────────────
let scene: Scene, mobile: Scene, kit: AssetContainer, kitM: AssetContainer;
const GLB = () => `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, Vector3.Zero(), scene);
  mobile = new Scene(new NullEngine()); mobile.activeCamera = new ArcRotateCamera('c', 0, 1, 3, Vector3.Zero(), mobile); mobile.metadata = { felTier: 'mobile' };
  kit = await SceneLoader.LoadAssetContainerAsync('', GLB(), scene, undefined, '.glb');
  kitM = await SceneLoader.LoadAssetContainerAsync('', GLB(), mobile, undefined, '.glb');
}, 90_000);
let n = 0;
function body(c: AssetContainer = kit): SpawnedCharacter {
  const inst = c.instantiateModelsToScene((x) => `${x}_w${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `w${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
function settle(root: TransformNode): void { root.computeWorldMatrix(true); for (const c of root.getDescendants(false)) (c as TransformNode).computeWorldMatrix?.(true); }
const P = (o: Partial<CreatorPart> & { id: string }): CreatorPart => sanitizePart({ shape: 'strand', bone: 'Spine2', pos: [0, 0.1, -0.13], rot: [0, 0, 0], scale: [1.5, 4, 1.5], colour: '#202020', finish: 'matte', mirror: false, ...o })!;
const findRig = (root: TransformNode): SwingRig => (root.metadata as { felSwingRig?: SwingRig }).felSwingRig!;
/** CPU skinning of one vertex of a swing mesh, in the world. */
function skinned(m: Mesh, v: number): Vector3 {
  const sk = m.skeleton!; sk.prepare(true);
  const p = m.getVerticesData('position')!, ix = m.getVerticesData('matricesIndices')!, w = m.getVerticesData('matricesWeights')!;
  const at = new Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
  const out = Vector3.Zero();
  for (let k = 0; k < 4; k++) {
    if (!w[v * 4 + k]) continue;
    const b = sk.bones[ix[v * 4 + k]];
    const M = b.getAbsoluteInverseBindMatrix().multiply(b.getAbsoluteMatrix());
    out.addInPlace(Vector3.TransformCoordinates(at, M).scale(w[v * 4 + k]));
  }
  return Vector3.TransformCoordinates(out, m.computeWorldMatrix(true));
}
/** The world position of the vertex furthest down the chain. */
function tipOf(m: Mesh): Vector3 {
  const p = m.getVerticesData('position')!; let best = 0, lo = Infinity;
  for (let v = 0; v < p.length / 3; v++) if (p[v * 3 + 1] < lo) { lo = p[v * 3 + 1]; best = v; }
  return skinned(m, best);
}

describe('a bendable part on the body', () => {
  it('rides its bone exactly as the rigid part would at rest (same vertices), on its own skeleton, cosmetic only', () => {
    const rigid = body(), bend = body();
    settle(rigid.root); settle(bend.root);
    syncParts(rigid, [P({ id: 'a' })]);
    syncParts(bend, [P({ id: 'a', swing: 0.8 })]);
    settle(bend.root);
    const r = partsOn(rigid.root).meshes[0];
    const s = partsOn(bend.root).meshes.find((m) => m.metadata?.felSwing)!;
    expect(s).toBeTruthy();
    expect(s.skeleton).not.toBe(bend.skeleton);
    expect(s.skeleton!.bones).toHaveLength(SWING_SEGMENTS);
    expect(s.isPickable).toBe(false); expect(s.checkCollisions).toBe(false);
    expect(bend.meshes).not.toContain(s);
    const rp = r.getVerticesData('position')!;
    const W = r.computeWorldMatrix(true);
    for (const v of [0, 17, 40, rp.length / 3 - 1]) {
      const a = Vector3.TransformCoordinates(new Vector3(rp[v * 3], rp[v * 3 + 1], rp[v * 3 + 2]), W);
      expect(Vector3.Distance(a, skinned(s, v)), `vertex ${v}`).toBeLessThan(1e-4);
    }
    rigid.root.dispose(); bend.root.dispose();
  });

  it('streams back when the body accelerates forward, swings through when it stops, and settles where it hangs', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 'a', swing: 1 })]);
    const mesh = partsOn(s.root).meshes.find((m) => m.metadata?.felSwing)!;
    const rig = findRig(s.root);
    for (let i = 0; i < 60; i++) { settle(s.root); stepSwing(rig, 1 / 60); }
    const rest = tipOf(mesh).subtract(s.root.position);
    // accelerate forward (+z in the world) for a third of a second
    let v = 0;
    for (let i = 0; i < 20; i++) { v += 12 / 60; s.root.position.z += v / 60; settle(s.root); stepSwing(rig, 1 / 60); }
    const running = tipOf(mesh).subtract(s.root.position);
    expect(running.z - rest.z, 'the tip trails behind').toBeLessThan(-0.01);
    // keep going at that speed until it has settled, then stop over a fifth of a second: it swings through forward
    for (let i = 0; i < 240; i++) { s.root.position.z += v / 60; settle(s.root); stepSwing(rig, 1 / 60); }
    const cruising = tipOf(mesh).subtract(s.root.position).z;
    let ahead = -Infinity;
    for (let i = 0; i < 40; i++) { v = Math.max(0, v - 20 / 60); s.root.position.z += v / 60; settle(s.root); stepSwing(rig, 1 / 60); ahead = Math.max(ahead, tipOf(mesh).subtract(s.root.position).z - cruising); }
    expect(ahead, 'it swings through when the body stops').toBeGreaterThan(0.03);
    for (let i = 0; i < 400; i++) { settle(s.root); stepSwing(rig, 1 / 60); }
    expect(Vector3.Distance(tipOf(mesh).subtract(s.root.position), rest), 'it settles back').toBeLessThan(0.003);
    s.root.dispose();
  });

  it('a cape that hangs keeps hanging when the body leans (swing 1); with a little swing it mostly leans with the body', () => {
    const lean = (swing: number) => {
      const s = body(); settle(s.root);
      syncParts(s, [P({ id: 'a', shape: 'capeStrip', scale: [3, 6, 1], swing })]);
      const mesh = partsOn(s.root).meshes.find((m) => m.metadata?.felSwing)!;
      const rig = findRig(s.root);
      // the chain's own root (where it hangs from), in the world
      const top = { getAbsolutePosition: () => { mesh.skeleton!.prepare(true); return Vector3.TransformCoordinates(mesh.skeleton!.bones[0].getAbsoluteMatrix().getTranslation(), mesh.computeWorldMatrix(true)); } };
      for (let i = 0; i < 30; i++) { settle(s.root); stepSwing(rig, 1 / 60); }
      const hang0 = tipOf(mesh).subtract(top.getAbsolutePosition()).normalize();
      // lean 35° forward about the world x axis (a parent node: the root keeps its own glTF turn)
      const lean = new TransformNode('lean', scene);
      s.root.parent = lean;
      lean.rotation.x = (35 * Math.PI) / 180;
      for (let i = 0; i < 400; i++) { lean.computeWorldMatrix(true); settle(s.root); stepSwing(rig, 1 / 60); }
      const hang = tipOf(mesh).subtract(top.getAbsolutePosition()).normalize();
      s.root.dispose(); lean.dispose();
      return Math.acos(Math.min(1, Vector3.Dot(hang0, hang))) * (180 / Math.PI);
    };
    const free = lean(1), stiff = lean(0.1);
    expect(free, 'a free cape hangs as it did').toBeLessThan(6);
    expect(stiff, 'a stiff one leans with the body').toBeGreaterThan(25);
  });

  it('a tail placed pointing back and up stays where it was placed at rest (the swing is measured from how it was placed)', () => {
    const s = body(); settle(s.root);
    syncParts(s, [P({ id: 't', shape: 'tailSeg', bone: 'Hips', pos: [0, -0.02, -0.12], rot: [-120, 0, 0], scale: [1.2, 5, 1.2], swing: 1 })]);
    const mesh = partsOn(s.root).meshes.find((m) => m.metadata?.felSwing)!;
    const rig = findRig(s.root);
    const far = () => { const p = mesh.getVerticesData('position')!; let best = 0, d = -1; for (let v = 0; v < p.length / 3; v++) { const q = skinned(mesh, v); const l = Vector3.Distance(q, s.root.position); if (l > d) { d = l; best = v; } } return best; };
    const tip = far();
    const placed = skinned(mesh, tip);
    for (let i = 0; i < 300; i++) { settle(s.root); stepSwing(rig, 1 / 60); }
    expect(Vector3.Distance(skinned(mesh, tip), placed), 'it does not droop to hang').toBeLessThan(0.003);
    s.root.dispose();
  });

  it('a phone swings at 30 Hz, one step a frame, and only the first chains', () => {
    const s = body(kitM); settle(s.root);
    const many = Array.from({ length: 8 }, (_, i) => P({ id: `s${i}`, pos: [(i - 4) * 0.03, 0.1, -0.13], swing: 0.6 }));
    syncParts(s, many);
    const rig = findRig(s.root);
    expect(rig.tier).toBe('mobile');
    expect(rig.chains.filter((c) => c.live)).toHaveLength(SWING_MAX_CHAINS.mobile);
    expect(stepSwing(rig, 1 / 10)).toBe(1);
    s.root.dispose();
  });

  it('allocates nothing per frame: 20 000 steps of a 12-chain rig do not grow the heap', () => {
    const s = body(); settle(s.root);
    syncParts(s, Array.from({ length: 12 }, (_, i) => P({ id: `s${i}`, pos: [(i - 6) * 0.02, 0.1, -0.13], swing: 0.7 })));
    const rig = findRig(s.root);
    for (let i = 0; i < 2000; i++) { s.root.position.x = Math.sin(i / 10) * 0.2; stepSwing(rig, 1 / 60); }   // warm the JIT
    // a real collection before each reading (node's gc, switched on for this test), so garbage cannot hide in the heap
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc') as () => void;
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 20_000; i++) { s.root.position.x = Math.sin(i / 10) * 0.2; s.root.computeWorldMatrix(true); stepSwing(rig, 1 / 60); }
    gc();
    const grown = process.memoryUsage().heapUsed - before;
    // and the per-frame path's source makes nothing: no `new`, no literals, no allocating Babylon maths (clone, multiply,
    // add, subtract, scale, normalizeToNew …), only the …ToRef / in-place forms (a deterministic check; heap garbage on a
    // shared machine is too noisy to pin, measured ~10 B per chain-step of V8 number boxing)
    for (const f of SWING_FRAME_PATH) {
      const src = f.toString().replace(/\/\/[^\n]*/g, '');
      expect(src, f.name).not.toMatch(/\bnew\s|\[\s*\]|\{\s*\}|\.clone\(|\.multiply\(|\.add\(|\.subtract\(|\.scale\(|\.invert\(|ToNew|\.map\(|\.filter\(|\.slice\(|=>/);
    }
    expect(grown).toBeLessThan(200_000);
    s.root.dispose();
  });

  it('never moves a body bone; turning swing off, or disposing the body, takes the rig away', () => {
    const s = body(); settle(s.root);
    const hands = () => ['LeftHand', 'RightHand', 'Head'].map((b) => boneNode(s.skeleton, b)!.getAbsolutePosition().clone());
    const before = hands();
    syncParts(s, [P({ id: 'a', swing: 1 })]);
    const rig = findRig(s.root);
    for (let i = 0; i < 30; i++) { s.root.position.z += 0.02; settle(s.root); stepSwing(rig, 1 / 60); }
    s.root.position.z = 0; settle(s.root);
    hands().forEach((p, i) => expect(Vector3.Distance(p, before[i])).toBeLessThan(1e-9));
    const count = swingRigCount(scene);
    syncParts(s, [P({ id: 'a' })]);   // swing 0: rigid again
    expect(swingRigCount(scene)).toBe(count - 1);
    expect(partsOn(s.root).meshes.some((m) => m.metadata?.felSwing)).toBe(false);
    syncParts(s, [P({ id: 'a', swing: 0.5 })]);
    expect(swingRigCount(scene)).toBe(count);
    s.root.dispose();
    expect(swingRigCount(scene)).toBe(count - 1);
  });
});

describe('rotationBetween', () => {
  it('turns a onto b (Babylon\'s rotation), for directions round the chain\'s axis', async () => {
    const { rotationBetween } = await import('./swing');
    const out = new Float32Array(2);
    for (const [a, b] of [[[0, -1, 0], [0.4, -0.9, 0.1]], [[0.1, -0.95, 0.2], [-0.3, -0.8, -0.4]], [[0, -1, 0], [0, -1, 0]]]) {
      const A = new Vector3(a[0], a[1], a[2]).normalize(), B = new Vector3(b[0], b[1], b[2]).normalize();
      rotationBetween(A.x, A.y, A.z, B.x, B.y, B.z, out);
      const ang = Math.hypot(out[0], out[1]);
      const q = ang > 1e-9 ? Quaternion.RotationAxis(new Vector3(out[0] / ang, 0, out[1] / ang), ang) : Quaternion.Identity();
      const m = new Matrix(); Matrix.FromQuaternionToRef(q, m);
      // only the x–z part of the turn is kept: close when a and b are near the chain's axis
      expect(Vector3.Distance(Vector3.TransformNormal(A, m), B)).toBeLessThan(0.05);
    }
  });
});
