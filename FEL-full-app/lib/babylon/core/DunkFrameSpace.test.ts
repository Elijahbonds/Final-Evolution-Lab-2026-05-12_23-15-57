// DUNK-GARBAGE (owner 2026-10-16, "Dunk garbage fix"). DunkMode's posture copy now does its frame-space math through
// DunkFrameSpace on scratch instead of the allocating chainRotation / Identity / Inverse / multiply / Forward / Up. Proven here:
//  1. SAME NUMBERS — over randomized chains (reflected root, mixed quaternion / Euler nodes, a node straight under the frame, a
//     detached node) every helper gives the frozen pre-change closure's quaternions and vectors BIT FOR BIT (Object.is: −0 ≠ 0).
//  2. NO GARBAGE — a call constructs no Quaternion and no Vector3 (counted in Babylon's own constructors). The counter is checked
//     first against a known answer: the frozen helpers construct exactly 9 quaternions and 2 vectors per round.
//  3. THE WIRING — DunkMode's per-frame helpers call DunkFrameSpace and no allocating form is left in them.
//  4. THE REST OF THE COPY — the world-matrix walk visits the same nodes in the same order as the getChildTransformNodes walk (same
//     matrices, no Babylon child list), and the stance's bindFrame.keyedToRef gives keyed's quaternion bit for bit, no construction.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bone, FreeCamera, Matrix, Mesh, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3, type Node, type Nullable } from '@babylonjs/core';
import * as Legacy from '@/tests/helpers/dunkFrameSpaceLegacy';
import { countConstructions } from '@/tests/helpers/constructionCount';
import { chainDeltaToRef, computeWorldMatricesDown, forwardByToRef, localDeltaToRef, parentChainToRef, rotateInFrame } from './DunkFrameSpace';
import { bindFrame } from '../anim/bindFrame';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const scene = new Scene(new NullEngine());
const s = (rnd: () => number) => rnd() * 2 - 1;
/** A random rotation; now and then a slightly non-unit one (a clip's slerped key is not exactly unit either). */
function randQ(rnd: () => number): Quaternion {
  const q = new Quaternion(s(rnd), s(rnd), s(rnd), s(rnd)).normalize();
  return rnd() < 0.15 ? q.scaleInPlace(0.98 + rnd() * 0.04) : q;
}
interface Chain { frame: TransformNode; nodes: TransformNode[] }
/** frame (a glTF-style reflected root) → 1..7 joints; `euler` lets some joints carry Euler rotation only. */
function randChain(rnd: () => number, euler: boolean): Chain {
  const frame = new TransformNode('__root__', scene);
  frame.scaling.set(1, 1, -1); frame.rotationQuaternion = randQ(rnd);
  const nodes: TransformNode[] = [];
  let parent = frame;
  const depth = 1 + Math.floor(rnd() * 7);
  for (let i = 0; i < depth; i++) {
    const n = new TransformNode(`j${i}`, scene); n.parent = parent;
    n.position.set(s(rnd), s(rnd), s(rnd));
    if (euler && rnd() < 0.3) { n.rotationQuaternion = null; n.rotation.set(s(rnd) * 3, s(rnd) * 3, s(rnd) * 3); } else n.rotationQuaternion = randQ(rnd);
    nodes.push(n); parent = n;
  }
  return { frame, nodes };
}
const bits = (q: Quaternion | Vector3) => ('w' in q ? [q.x, q.y, q.z, q.w] : [q.x, q.y, q.z]);
function same(a: Quaternion | Vector3, b: Quaternion | Vector3, what: string): void {
  const x = bits(a), y = bits(b);
  for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) throw new Error(`${what}[${i}] ${x[i]} != ${y[i]}`);
}

describe('DunkFrameSpace: the posture copy without garbage', () => {
  it('matches the frozen allocating helpers bit for bit over randomized chains', () => {
    const rnd = mulberry32(20261016);
    const out = new Quaternion(), fwd = new Vector3(), fwd2 = new Vector3();
    let rounds = 0, underFrame = 0, detached = 0, euler = 0;
    for (let trial = 0; trial < 400; trial++) {
      const { frame, nodes } = randChain(rnd, trial % 2 === 1);
      if (nodes.some((n) => !n.rotationQuaternion)) euler++;
      for (const n of nodes) {
        if (!n.rotationQuaternion) continue;   // the posture nodes always carry a quaternion (ppNodeFor sets one)
        if (n.parent === frame) underFrame++;
        const bind = randQ(rnd), local = randQ(rnd);
        // ppDelta
        Legacy.ppDelta(n, frame, bind);
        expect(chainDeltaToRef(n, frame, bind, out)).toBe(out);
        same(out, Legacy._ppD, 'ppDelta');
        // frameYawOf (the hips: `local` is the clip's raw value, not the node's own)
        const yawOld = Legacy.frameYawOf(n, local, bind, frame);
        localDeltaToRef(n, local, frame, bind, out); forwardByToRef(out, fwd);
        same(out, Legacy._ppD, 'frameYawOf delta'); same(fwd, Legacy._ppV, 'frameYawOf forward');
        expect(Object.is(Math.atan2(fwd.x, fwd.z), yawOld)).toBe(true);
        // frameForwardOf
        const fOld = Legacy.frameForwardOf(n, bind, fwd2, frame);
        chainDeltaToRef(n, frame, bind, out); expect(forwardByToRef(out, fwd)).toBe(fwd);
        same(out, Legacy._ppD, 'frameForwardOf delta'); same(fwd, fOld, 'frameForwardOf forward');
        // rotateInFrame: same start, same rho, same written value — and the node keeps its quaternion object
        const rho = Quaternion.RotationAxis(new Vector3(s(rnd), s(rnd), s(rnd)), s(rnd) * Math.PI);
        const q = n.rotationQuaternion, start = q.clone();
        Legacy.rotateInFrame(n, rho, frame); const want = q.clone();
        q.copyFrom(start);
        rotateInFrame(n, frame, rho);
        expect(n.rotationQuaternion).toBe(q);
        same(q, want, 'rotateInFrame');
        rounds++;
      }
      frame.dispose();
    }
    // a node with no parent (the hips of a rig with no frame above): the identity branch, and a chain to nowhere
    for (let i = 0; i < 20; i++) {
      const lone = new TransformNode('lone', scene); lone.rotationQuaternion = randQ(rnd);
      const other = new TransformNode('other', scene);
      const bind = randQ(rnd), local = randQ(rnd);
      Legacy.frameYawOf(lone, local, bind, other); localDeltaToRef(lone, local, other, bind, out); same(out, Legacy._ppD, 'detached yaw');
      Legacy.ppDelta(lone, other, bind); chainDeltaToRef(lone, other, bind, out); same(out, Legacy._ppD, 'detached delta');
      expect(bits(parentChainToRef(lone, other, out))).toEqual([0, 0, 0, 1]);
      detached++; lone.dispose(); other.dispose();
    }
    // coverage: the run really went through the branches it claims
    expect(rounds).toBeGreaterThan(1000);
    expect(underFrame).toBeGreaterThan(100);
    expect(euler).toBeGreaterThan(50);
    expect(detached).toBe(20);
  });

  it('constructs no Quaternion and no Vector3 per call (the counter checked against a known answer first)', () => {
    const rnd = mulberry32(7);
    const chains = Array.from({ length: 40 }, () => randChain(rnd, false));
    const work = chains.map(({ frame, nodes }) => ({ frame, n: nodes[nodes.length - 1]!, bind: randQ(rnd), local: randQ(rnd), rho: randQ(rnd) }));
    const out = new Quaternion(), fwd = new Vector3();
    // control: the frozen helpers — chainRotation 1 + (Rp 1 + Inverse 1) + (chain 1 + Inverse 1) + (Rp 1 + Inverse 1 + 2 multiply)
    // = 9 quaternions a round; Vector3.Forward() twice = 2 vectors
    const before = countConstructions(() => {
      for (const w of work) { Legacy.ppDelta(w.n, w.frame, w.bind); Legacy.frameYawOf(w.n, w.local, w.bind, w.frame); Legacy.frameForwardOf(w.n, w.bind, fwd, w.frame); Legacy.rotateInFrame(w.n, w.rho, w.frame); }
    });
    expect(before).toEqual({ quaternions: 9 * work.length, vector3s: 2 * work.length });
    // a single Identity() is seen, and the prototype is clean afterwards (a construction outside the count is not counted)
    expect(countConstructions(() => { Quaternion.Identity(); })).toEqual({ quaternions: 1, vector3s: 0 });
    expect(Object.getOwnPropertyDescriptor(Quaternion.prototype, '_isDirty')).toBeUndefined();
    const after = countConstructions(() => {
      for (let rep = 0; rep < 5; rep++) for (const w of work) {
        chainDeltaToRef(w.n, w.frame, w.bind, out);
        localDeltaToRef(w.n, w.local, w.frame, w.bind, out); forwardByToRef(out, fwd);
        chainDeltaToRef(w.n, w.frame, w.bind, out); forwardByToRef(out, fwd);
        rotateInFrame(w.n, w.frame, w.rho);
      }
    });
    expect(after).toEqual({ quaternions: 0, vector3s: 0 });
    for (const c of chains) c.frame.dispose();
  });

  it('DunkMode\'s per-frame posture helpers go through DunkFrameSpace, with no allocating form left in them', () => {
    const src = readFileSync('lib/babylon/modes/DunkMode.ts', 'utf8');
    const from = src.indexOf('const ppAxis = (x: number'), helpers = src.slice(from, src.indexOf('const qEq = (a: Quaternion', from));
    expect(helpers.length).toBeGreaterThan(200);
    for (const bad of ['chainRotation(', 'Quaternion.Identity()', 'Quaternion.Inverse(', '.multiply(', 'Vector3.Forward()', 'new Quaternion', 'new Vector3', '.clone()']) expect(helpers).not.toContain(bad);
    for (const good of ['chainDeltaToRef(p.n, ppFrame!, p.bindChain, _ppD)', 'localDeltaToRef(n, local, ppFrame!, bindChain, _ppD)', 'forwardByToRef(_ppD, _ppV)', 'rotateInFrameOf(n, ppFrame!, rho)']) expect(helpers).toContain(good);
    const at = src.indexOf('function applyPostureLayer'), apply = src.slice(at, src.indexOf('computeWorldMatricesDown(hipsNode);', at) + 40);
    expect(apply.length).toBeGreaterThan(2000);
    expect(apply).not.toContain('Vector3.Up()');
    expect(apply.match(/RotationAxisToRef\(PP_UP, /g)?.length).toBe(2);
    // the stance's key into scratch, and the walk on pooled lists
    expect(apply).toContain('Quaternion.SlerpToRef(base, bf.keyedToRef(p.n, deg, _ppK), ww, _ppQ)');
    expect(apply).not.toContain('bf.keyed(');
    expect(apply).not.toContain('getChildTransformNodes');
    expect(apply).toContain('computeWorldMatricesDown(hipsNode);');
  });
});

describe('DunkFrameSpace: the world-matrix walk and the stance key, without garbage', () => {
  /** A random hierarchy under a reflected root: TransformNodes, Meshes (TransformNodes too), and nodes that are NOT
   *  TransformNodes (a camera) whose subtree the walk must skip, exactly as getChildTransformNodes(true) skips it. */
  function randTree(rnd: () => number): TransformNode {
    const root = new TransformNode('root', scene); root.scaling.set(1, 1, -1);
    const all: Node[] = [root];
    for (let i = 0; i < 40; i++) {
      const parent = all[Math.floor(rnd() * all.length)]!;
      const k = rnd();
      const n: Node = k < 0.1 ? new FreeCamera(`cam${i}`, Vector3.Zero(), scene, false) : k < 0.3 ? new Mesh(`m${i}`, scene) : new TransformNode(`t${i}`, scene);
      n.parent = parent;
      if (n instanceof TransformNode && !(n instanceof FreeCamera)) { n.position.set(s(rnd), s(rnd), s(rnd)); n.rotationQuaternion = randQ(rnd); }
      all.push(n);
    }
    return root;
  }
  /** Which nodes computeWorldMatrix(true) runs on, in order, while `fn` runs. */
  function visits(fn: () => void): string[] {
    const seen: string[] = []; const orig = TransformNode.prototype.computeWorldMatrix;
    TransformNode.prototype.computeWorldMatrix = function (this: TransformNode, force?: boolean, camWorld?: Nullable<Matrix>) { if (force === true) seen.push(this.name); return orig.call(this, force, camWorld); };
    try { fn(); } finally { TransformNode.prototype.computeWorldMatrix = orig; }
    return seen;
  }
  it('visits exactly the nodes the getChildTransformNodes walk visited, in the same order, with the same matrices', () => {
    const rnd = mulberry32(420);
    let total = 0;
    for (let t = 0; t < 30; t++) {
      const root = randTree(rnd);
      const start = root.getChildTransformNodes(true)[0] ?? root;
      const a = visits(() => Legacy.walk(start)); const ma = start.getChildTransformNodes(false).map((n) => n.getWorldMatrix().asArray().slice());
      const b = visits(() => computeWorldMatricesDown(start)); const mb = start.getChildTransformNodes(false).map((n) => n.getWorldMatrix().asArray().slice());
      expect(b).toEqual(a);
      expect(mb.every((m, i) => m.every((v, j) => Object.is(v, ma[i]![j])))).toBe(true);
      total += a.length;
      root.dispose();
    }
    expect(total).toBeGreaterThan(300);
    // no Babylon child-list call, and no node kept alive by the pool
    const root = randTree(rnd); let lists = 0; const orig = TransformNode.prototype.getChildTransformNodes;
    TransformNode.prototype.getChildTransformNodes = function (this: TransformNode, ...a: Parameters<typeof orig>) { lists++; return orig.apply(this, a); };
    try { computeWorldMatricesDown(root); } finally { TransformNode.prototype.getChildTransformNodes = orig; }
    expect(lists).toBe(0);
    root.dispose();
  });
  it('the stance key: bindFrame.keyedToRef gives keyed\'s quaternion bit for bit, with no construction (randomized skeletons)', () => {
    const rnd = mulberry32(99);
    const out = new Quaternion(); let n = 0;
    for (let t = 0; t < 20; t++) {
      const root = new TransformNode('__root__', scene); root.scaling.set(1, 1, -1);
      const sk = new Skeleton(`sk${t}`, `sk${t}`, scene);
      let pb: Bone | null = null; let pn: TransformNode = root; const nodes: TransformNode[] = [];
      for (let i = 0; i < 6; i++) {
        const rest = Matrix.Compose(Vector3.One(), randQ(rnd).normalize(), new Vector3(s(rnd), s(rnd), s(rnd)));
        const b: Bone = new Bone(`b${i}`, sk, pb, rest, rest);
        const tn = new TransformNode(`n${i}`, scene); tn.parent = pn; tn.rotationQuaternion = randQ(rnd); b.linkTransformNode(tn);
        nodes.push(tn); pb = b; pn = tn;
      }
      const bf = bindFrame(sk);
      for (const node of nodes) for (let k = 0; k < 10; k++) {
        const deg: [number, number, number] = [s(rnd) * 90, s(rnd) * 90, s(rnd) * 90];
        const want = bf.keyed(node, deg);
        expect(bf.keyedToRef(node, deg, out)).toBe(out);
        same(out, want, 'keyedToRef'); n++;
      }
      const c = countConstructions(() => { for (const node of nodes) bf.keyedToRef(node, [10, -20, 30], out); });
      expect(c).toEqual({ quaternions: 0, vector3s: 0 });
      sk.dispose(); root.dispose();
    }
    expect(n).toBe(1200);
  });
});
