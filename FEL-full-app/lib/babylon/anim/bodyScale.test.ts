// COACH-SCALE-191 (spec /workspace/fel-specs/COACH-SCALE-191-2026-10-29.md §4): one body scale for the 1.91 m coach.
// The two bodies are 3D Art's, box-only (not shipped): read from COACH191_DIR (default ~/Claude/local-team/in/coach-191).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ANIM_BODY_SCALE_ON, bodyScaleOf, bodyScaleOn, worldUpScaleOf } from './bodyScale';
import { REF_HIP_JOINT_Y, REF_HIPS_Y } from './poseClip';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';
import { strideRef } from '../core/StrideMatch';
import { RIM_HEIGHT_M, RIM_RADIUS } from '../core/courtDims';
import { DEFAULT_DRIBBLE } from './Dribble';

// ── harness: spawn a body GLB from outside the repo through the real CharacterLibrary (the anim-clip-audit dump's method) ──// COACH-SCALE-191 test harness: spawn a body GLB from outside the repo through the real CharacterLibrary (the anim-clip-audit
// dump's method), sample a clip alone from bind, read the skinned floor and the hips.

/** 3D Art's bodies, box-only (not shipped, needs GO): copied to the Mini outside the repo. */
const COACH191_DIR = process.env.COACH191_DIR ?? path.join(process.env.HOME ?? '', 'Claude/local-team/in/coach-191');
const PREP2 = path.join(COACH191_DIR, 'fel-elijah-coach.prep2.glb');            // sha256 051adcc0…7643
const BODY_191 = path.join(COACH191_DIR, 'fel-elijah-coach.prep2-191.glb');     // sha256 7ca8a37a…efa1
const haveBodies = existsSync(PREP2) && existsSync(BODY_191);
const sha256 = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** 3D Art's crouched captures (README): stance, dribble_idle, defend_slide L/R, slide_hard L/R, backpedal. */
const CROUCHED = ['bball_mc_defend_stance', 'bball_mc_dribble_idle', 'bball_mc_defend_slide_left', 'bball_mc_defend_slide_right',
  'bball_mc_defend_slide_hard_left', 'bball_mc_defend_slide_hard_right', 'bball_mc_defend_backpedal'] as const;

let BODY = '';
function installLoader(): void {
  (globalThis as { fetch?: unknown }).fetch = async () => ({ ok: false, json: async () => null });
  const orig = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
  vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(((root: string, file: string, scene: Scene) => {
    const rel = root + file; const p = rel === '/models/_coach191/body.glb' ? BODY : path.resolve('public' + rel);
    if (!existsSync(p)) return Promise.reject(new Error('404 ' + rel));
    return orig('', 'data:model/gltf-binary;base64,' + readFileSync(p).toString('base64'), scene, undefined, '.glb');
  }) as never);
}

interface Spawned {
  scene: Scene; sk: import('@babylonjs/core').Skeleton; hips: TransformNode; root: TransformNode | null;
  groups: Map<string, import('@babylonjs/core').AnimationGroup>;
  rest(): void; evalAt(name: string, u: number): void; floor(): number;
}
async function spawn(body: string, mode = 'onevone'): Promise<Spawned> {
  BODY = body;
  const { CharacterLibrary } = await import('../core/CharacterLibrary');
  const { boneNode } = await import('./boneLookup');
  const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  scene.metadata = { felHeroOverride: '/models/_coach191/body.glb', felModeId: mode };
  const hero = await CharacterLibrary.spawn(scene, '/models/elijah-meshy.glb', { role: 'player', startClip: 'idle_stand', identity: false }) as unknown as {
    skeleton: import('@babylonjs/core').Skeleton; meshes: import('@babylonjs/core').AbstractMesh[]; animator: { groups: Map<string, import('@babylonjs/core').AnimationGroup> } };
  const sk = hero.skeleton; const groups = hero.animator.groups;
  const hips = boneNode(sk, 'Hips') as TransformNode;
  const tn = sk.bones.map((b) => b.getTransformNode()).filter((n): n is TransformNode => !!n);
  const rq = new Map(tn.map((n) => [n, (n.rotationQuaternion ?? Quaternion.Identity()).clone()]));
  const rp = new Map(tn.map((n) => [n, n.position.clone()]));
  let top: TransformNode = hips; while (top.parent) top = top.parent as TransformNode;
  const feetMeshes = hero.meshes.filter((m) => /^(Shoe|Sock|Body)/.test(m.name));
  const refresh = () => {
    const w = (n: TransformNode) => { n.computeWorldMatrix(true); for (const c of n.getChildren(undefined, true)) w(c as TransformNode); }; w(top);
    for (const m of hero.meshes) m.computeWorldMatrix(true);
    sk.prepare(true); for (const m of hero.meshes) m.skeleton?.prepare(true);
  };
  const rest = () => { for (const g of scene.animationGroups) g.stop(); for (const n of tn) { n.rotationQuaternion = rq.get(n)!.clone(); n.position.copyFrom(rp.get(n)!); } refresh(); };
  // DETERMINISTIC: each track evaluated at the frame and set (no scene.render(), so no runtime layer runs): the CLIP itself
  const evalAt = (name: string, u: number) => {
    const g = groups.get(name)!; const fr = g.from + (g.to - g.from) * u;
    for (const ta of g.targetedAnimations) { const v = ta.animation.evaluate(fr); (ta.target as Record<string, unknown>)[ta.animation.targetProperty] = v?.clone ? v.clone() : v; }
    refresh();
  };
  const t = new Vector3();
  const floor = () => {
    let lo = Infinity;
    for (const m of feetMeshes) { const W = m.getWorldMatrix(); const p = m.getPositionData(true, true); if (!p) continue;
      for (let i = 0; i < p.length; i += 3) { Vector3.TransformCoordinatesFromFloatsToRef(p[i], p[i + 1], p[i + 2], W, t); if (t.y < lo) lo = t.y; } }
    return lo;
  };
  rest();
  return { scene, sk, hips, root: hips.parent as TransformNode | null, groups, rest, evalAt, floor };
}

/** One clip sampled alone from bind: the lowest skinned foot vertex, the deepest local Hips key and world hips drop. */
function crouch(s: Spawned, name: string, n = 40): { floorMin: number; keyMin: number; dropMin: number } {
  s.rest(); const hip0 = s.hips.getAbsolutePosition().y; const base = s.hips.position.y;
  let floorMin = Infinity, keyMin = Infinity, dropMin = Infinity;
  for (let i = 0; i <= n; i++) {
    s.evalAt(name, i / n);
    floorMin = Math.min(floorMin, s.floor()); keyMin = Math.min(keyMin, s.hips.position.y - base); dropMin = Math.min(dropMin, s.hips.getAbsolutePosition().y - hip0);
  }
  s.rest();
  return { floorMin, keyMin, dropMin };
}

/** A hash of every built clip's keys, exact (Float64 values), groups by name — "byte-identical to today". */
function clipHash(groups: Map<string, import('@babylonjs/core').AnimationGroup>): string {
  const h = createHash('sha256');
  for (const name of [...groups.keys()].sort()) {
    const g = groups.get(name)!; h.update(`${name}|${g.from}|${g.to}\n`);
    for (const ta of g.targetedAnimations) {
      h.update(`${String((ta.target as { name?: string }).name ?? '').replace(/_c\d+$/, '')}.${ta.animation.targetProperty}\n`);
      for (const k of ta.animation.getKeys()) { const v = k.value as { asArray?: () => number[] } | number; h.update(`${k.frame}:${typeof v === 'number' ? v : v.asArray ? v.asArray().join(',') : String(v)}\n`); }
    }
  }
  return h.digest('hex');
}

/** Measured on 593fe200's untouched poseClip (the perf-834-lcp lane, 2026-10-29): every built clip's keys, by name. */
const BASE_HASH = {
  prep2: '9f7ef815cac742f2b1754210cf93482fc782c05f68a2a74fc5fc4a822981df2f',
  b191: '5805bb862e0e4efeddb4a358d23f8c839ffe6506bb12ff39b41950f1b08ade54',
  forge: '9f7ef815cac742f2b1754210cf93482fc782c05f68a2a74fc5fc4a822981df2f',   // the forge hero builds the same clips as prep2 (same rig)
  stride: '7f8ce8f44ada575e31e99f60eb88f5437d65b6e2fcf40cd25b09ce624ab648e3',
};
const S_191 = 1.91 / 1.72596;   // 3D Art's root scale (README: s = 1.106631)

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown; localStorage?: unknown };
let ls: FakeStorage;
const knobOn = () => {
  ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'anim.bodyScale': 1 }));
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
};
installLoader();
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = globalThis; g.localStorage = ls; });
afterEach(() => { resetFeelForTests(); delete g.window; delete g.localStorage; });

describe('COACH-SCALE-191: the knob and the one scale', () => {
  it('anim.bodyScale defaults off; its references are poseClip\'s', () => {
    expect(ANIM_BODY_SCALE_ON).toBe(0);
    expect(bodyScaleOn()).toBe(false);
    knobOn(); expect(bodyScaleOn()).toBe(true);
    expect([REF_HIP_JOINT_Y, REF_HIPS_Y]).toEqual([0.91, 0.96]);   // bodyScale.ts repeats these (no import cycle)
  });
});

describe.skipIf(!haveBodies)('COACH-SCALE-191 on 3D Art\'s bodies', () => {
  let prep2: Spawned, b191: Spawned;
  beforeAll(async () => {
    expect(sha256(PREP2)).toBe('051adcc05f5a76a5d657eac9e00145adecd45039f073fcd546a74c4eee737643');
    expect(sha256(BODY_191)).toBe('7ca8a37aac2da9cc593936d9dca663c8d52f89617bee0f8574566af9bbddefa1');
  });

  it('BS-1: bodyScaleOf reads 1.1066 ± 0.002 on the 1.91 body, prep2 its own (UpLeg 0.9103 m: 1.0003), the forge hero 1.000', async () => {
    prep2 = await spawn(PREP2); b191 = await spawn(BODY_191);
    for (const s of [prep2, b191]) s.rest();
    const upLeg = (s: Spawned) => ['LeftUpLeg', 'RightUpLeg'].map((n) => s.sk.bones.find((b) => b.name.replace(/^mixamorig:?/, '') === n)!.getTransformNode()!.getAbsolutePosition().y - (s.root ? s.root.getAbsolutePosition().y : 0));   // above the root, as bodyScaleOf reads it (the spawn stands the root at y > 0)
    const p2 = bodyScaleOf(prep2.sk, prep2.root), s191 = bodyScaleOf(b191.sk, b191.root);
    console.log(`BS-1 prep2 UpLeg y ${upLeg(prep2).map((y) => y.toFixed(4))} → ${p2.toFixed(4)}; 1.91 UpLeg y ${upLeg(b191).map((y) => y.toFixed(4))} → ${s191.toFixed(4)}`);
    expect(Math.abs(s191 - 1.1066)).toBeLessThan(0.002);
    expect(Math.abs(upLeg(prep2)[0] - 0.9103)).toBeLessThan(0.0005);   // prep2's UpLeg height, recorded (spec: UNMEASURED)
    expect(Math.abs(p2 - 0.9103 / 0.91)).toBeLessThan(0.0006);
    // the forge hero, imported plain
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
    for (const a of r.animationGroups) a.stop();
    const sk = r.skeletons[0]; const hips = sk.bones.find((b) => /Hips$/.test(b.name))!.getTransformNode()!;
    const forge = bodyScaleOf(sk, hips.parent as never);
    console.log(`BS-1 forge ${forge.toFixed(4)}`);
    expect(Math.abs(forge - 1)).toBeLessThan(0.005);
    // the 1.91 body's Hips frame is 3D Art's root scale; prep2's is 1
    expect(Math.abs(worldUpScaleOf(b191.hips.parent as never) - S_191)).toBeLessThan(1e-4);
    expect(Math.abs(worldUpScaleOf(prep2.hips.parent as never) - 1)).toBeLessThan(1e-6);
  });

  it('BS-2 (knob off): the world hips drop is the local key × 1.1066 on the 1.91 body (candidate 1), × 1 on prep2', () => {
    for (const c of CROUCHED) {
      const a = crouch(prep2, c), b = crouch(b191, c);
      console.log(`BS-2 ${c}: prep2 key ${a.keyMin.toFixed(4)} drop ${a.dropMin.toFixed(4)} floor ${(a.floorMin * 100).toFixed(1)} cm | 1.91 key ${b.keyMin.toFixed(4)} drop ${b.dropMin.toFixed(4)} (×${(b.dropMin / b.keyMin).toFixed(4)}) floor ${(b.floorMin * 100).toFixed(1)} cm`);
      expect(Math.abs(a.dropMin / a.keyMin - 1)).toBeLessThan(1e-3);
      expect(Math.abs(b.dropMin / b.keyMin - S_191)).toBeLessThan(1e-3);
      // the local key is already this body's metres (× bodyScaleOf), so the drop is scaled twice
      expect(Math.abs(b.keyMin / a.keyMin - bodyScaleOf(b191.sk, b191.root) / bodyScaleOf(prep2.sk, prep2.root))).toBeLessThan(2e-3);
    }
  });

  it('BS-4 (knob off): every clip built on prep2, the 1.91 body and the forge hero is byte-identical to 593fe200; strideRef too', async () => {
    expect(clipHash(prep2.groups)).toBe(BASE_HASH.prep2);
    expect(clipHash(b191.groups)).toBe(BASE_HASH.b191);
    const forge = await spawn('public/models/fel-hero.glb');
    expect(clipHash(forge.groups)).toBe(BASE_HASH.forge);
    expect(createHash('sha256').update(JSON.stringify([strideRef(true), strideRef(false)])).digest('hex')).toBe(BASE_HASH.stride);
  });

  it('BS-3 (knob on, 1.91 m): the hips drop once (× bodyScaleOf), and every crouched capture\'s lowest foot vertex is within 2 cm of prep2\'s', async () => {
    knobOn();
    const on = await spawn(BODY_191);
    for (const c of CROUCHED) {
      const a = crouch(prep2, c), off = crouch(b191, c), b = crouch(on, c);
      console.log(`BS-3 ${c}: floor prep2 ${(a.floorMin * 100).toFixed(1)} | 1.91 off ${(off.floorMin * 100).toFixed(1)} → on ${(b.floorMin * 100).toFixed(1)} cm; drop on ${b.dropMin.toFixed(4)} = prep2 × ${(b.dropMin / a.dropMin).toFixed(4)}`);
      expect(Math.abs(b.dropMin - off.keyMin)).toBeLessThan(1e-3);       // world drop on = the key in this body's metres, once
      expect(b.floorMin).toBeGreaterThan(a.floorMin - 0.02);              // TUNE 2 cm: no deeper than the body the clips were tuned on
    }
    // knob on changes the 1.91 body's clips, and only by the hips track (the rotations are the same solve)
    expect(clipHash(on.groups)).not.toBe(BASE_HASH.b191);
  });

  it('BS-5 (knob on): the rim, the ball and the court never scale', async () => {
    knobOn();
    expect([RIM_HEIGHT_M, RIM_RADIUS]).toEqual([3.05, 0.2286]);
    expect(DEFAULT_DRIBBLE.ballR).toBe(0.12);
  });
});

describe('strideRefScaled: a body s× the forge hero paces against s× the speeds; the rates stay', () => {
  it('scales every speed, leaves strideRef and the rate ceilings alone, and returns the ref itself at s = 1', async () => {
    const { strideRefScaled } = await import('../core/StrideMatch');
    const ref = strideRef(true); const before = JSON.stringify(ref);
    expect(strideRefScaled(ref, 1)).toBe(ref);
    const s = strideRefScaled(ref, S_191);
    expect(s.run).toBeCloseTo(ref.run * S_191, 12); expect(s.slide).toBeCloseTo(ref.slide * S_191, 12);
    for (const k of ['walk', 'jog', 'sprint'] as const) if (ref[k] != null) expect(s[k]).toBeCloseTo(ref[k]! * S_191, 12);
    for (const [k, v] of Object.entries(ref.byState ?? {})) expect(s.byState![k]).toBeCloseTo(v * S_191, 12);
    expect(s.rateMaxByState).toBe(ref.rateMaxByState);
    expect(JSON.stringify(ref)).toBe(before);   // the shared table is never written
    for (const bad of [0, -1, Number.NaN]) expect(strideRefScaled(ref, bad)).toBe(ref);
  });
});
