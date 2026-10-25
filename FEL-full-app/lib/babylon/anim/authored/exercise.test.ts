// LIBRARY-ANATOMY (2026-10-25): the exercise library's demo loops, proven on the rig (the harness of sportClips.test.ts).
// Each loop is judged on the shape its exercise makes — the hips drop in a squat, the chest nears the floor in a push-up,
// the feet leave it in a jump — on the forge hero and on the female kit body (the shortest hips the bodies have), plus
// what every loop owes the stage: it closes (no pop at the seam), planted feet stay put and above the floor, nothing goes
// through the floor, and an isometric hold's second (lib/library/demo.ts ISO_HOLD_SEC) is the end of the range it names.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { EXERCISE_BUILDERS, EXERCISE_CLIPS } from './exercise';
import { ISO_HOLD_SEC, DEMO_CLIPS } from '@/lib/library/demo';
import { suiteOfClip, OPT_IN_SUITES, scopeAllows, scopeForMode } from '../clipScope';
import { CharacterAnimator } from '../CharacterAnimator';
import { buildAuthoredClip, registerAuthoredClips } from './index';

const BODIES = { hero: process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb', female: 'public/models/candidates/fel-kit-female.glb' } as const;
type Body = keyof typeof BODIES;
const rigs: Partial<Record<Body, { scene: Scene; sk: Skeleton; bind: Map<TransformNode, { p: Vector3; q: Quaternion }>; clips: Map<string, AnimationGroup> }>> = {};

beforeAll(async () => {
  for (const [body, file] of Object.entries(BODIES) as [Body, string][]) {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(file).toString('base64'), scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
    const rig = { scene, sk, bind, clips: new Map<string, AnimationGroup>() };
    rigs[body] = rig;
    for (const [name, build] of EXERCISE_BUILDERS) { reset(body); const g = build(scene, sk); if (g) rig.clips.set(name, g); }
  }
}, 180_000);

function reset(body: Body): void {
  const r = rigs[body]!;
  for (const x of [...r.scene.animationGroups]) x.stop();
  for (const [n, t] of r.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); }
  r.scene.render();
}
function at(body: Body, clip: string, sec: number): void {
  reset(body);
  const g = rigs[body]!.clips.get(clip)!;
  g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + sec * 30); rigs[body]!.scene.render();
}
const dur = (body: Body, clip: string) => { const g = rigs[body]!.clips.get(clip)!; return (g.to - g.from) / 30; };
function pos(body: Body, name: string): Vector3 { const n = boneNode(rigs[body]!.sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }
/** A joint sampled through the whole loop. */
function track(body: Body, clip: string, joint: string, n = 24): Vector3[] { const D = dur(body, clip); return Array.from({ length: n + 1 }, (_, i) => { at(body, clip, (D * i) / n); return pos(body, joint); }); }
const BODY_LIST = Object.keys(BODIES) as Body[];
/** Ankles a loop plants (both feet on the floor the whole time). */
const PLANTED = ['ex_squat', 'ex_squat_bar', 'ex_hinge', 'ex_good_morning', 'ex_split_squat', 'ex_press', 'ex_curl', 'ex_lateral_raise', 'ex_front_raise', 'ex_row', 'ex_upright_row', 'ex_shrug', 'ex_triceps_overhead', 'ex_pushdown', 'ex_breathe', 'ex_arm_circles', 'ex_pushup', 'ex_plank', 'ex_plank_high', 'ex_bridge', 'ex_crunch', 'ex_seated_press', 'ex_seated_curl', 'ex_seated_lateral_raise', 'ex_seated_triceps', 'ex_bench_press', 'ex_floor_press', 'ex_fly', 'ex_skull_crusher', 'ex_incline_press', 'ex_incline_fly'];

describe('every exercise loop', () => {
  it('builds on both bodies, is in the opt-in exercise suite, and is owned by the library stage', () => {
    const scope = scopeForMode('library');
    for (const body of BODY_LIST) for (const name of EXERCISE_CLIPS) expect(rigs[body]!.clips.has(name), `${body} ${name}`).toBe(true);
    for (const name of EXERCISE_CLIPS) { expect(suiteOfClip(name)).toBe('exercise'); expect(scopeAllows(scope, name)).toBe(true); }
    expect(OPT_IN_SUITES).toContain('exercise');
    for (const c of DEMO_CLIPS.filter((x) => x.startsWith('ex_'))) expect(EXERCISE_CLIPS, c).toContain(c);
  });
  it('closes: the first and last frames are the same pose (no pop at the loop seam)', () => {
    const bad: string[] = [];
    for (const body of BODY_LIST) for (const name of EXERCISE_CLIPS) {
      const joints = ['Hips', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'];
      at(body, name, 0); const a = joints.map((j) => pos(body, j));
      at(body, name, dur(body, name)); const b = joints.map((j) => pos(body, j));
      const d = Math.max(...a.map((p, i) => Vector3.Distance(p, b[i])));
      if (d > 0.02) bad.push(`${body} ${name}: ${d.toFixed(3)} m`);
    }
    expect(bad).toEqual([]);
  });
  it('nothing goes through the floor; planted ankles stay put', () => {
    const bad: string[] = [];
    for (const body of BODY_LIST) for (const name of EXERCISE_CLIPS) {
      for (const j of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftHand', 'RightHand', 'Head', 'LeftLeg', 'RightLeg']) {
        const low = Math.min(...track(body, name, j, 12).map((p) => p.y));
        if (low < -0.035) bad.push(`${body} ${name} ${j} at ${low.toFixed(3)}`);
      }
      if (PLANTED.includes(name)) for (const j of ['LeftFoot', 'RightFoot']) {
        const t = track(body, name, j, 12);
        const drift = Math.max(...t.map((p) => Vector3.Distance(p, t[0])));
        if (drift > 0.04) bad.push(`${body} ${name} ${j} drifts ${drift.toFixed(3)} m`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('the library stage builds on demand (a lazy scope)', () => {
  it('spawn builds core only; an entry\'s loop is built when asked for; an unscoped body never builds the exercise suite', () => {
    const { scene, sk } = rigs.hero!;
    reset('hero');
    const scope = scopeForMode('library')!;
    expect(scope.lazy).toBe(true);
    const a = new CharacterAnimator(scene, []);
    const spawned = registerAuthoredClips(a, scene, sk, scope);
    expect(spawned.every((n) => suiteOfClip(n) === 'core')).toBe(true);
    expect(a.clipNames.has('ex_squat')).toBe(false);
    reset('hero');
    expect(buildAuthoredClip(a, scene, sk, 'ex_squat', scope)).toBe(true);
    expect(buildAuthoredClip(a, scene, sk, 'bball_layup_gather', scope)).toBe(true);
    expect(buildAuthoredClip(a, scene, sk, 'dunk_launch', scope)).toBe(false);   // outside the scope: refused, not built
    expect(a.clipNames.has('ex_squat') && a.clipNames.has('bball_layup_gather') && !a.clipNames.has('dunk_launch')).toBe(true);
    reset('hero');
    const b = new CharacterAnimator(scene, []);
    expect(registerAuthoredClips(b, scene, sk, null).some((n) => n.startsWith('ex_'))).toBe(false);
  });
});

describe('the shape each exercise makes', () => {
  for (const body of BODY_LIST) {
    it(`${body}: squats sink, hinges fold, lunges drop, the jump leaves the floor`, () => {
      const hipsRange = (c: string) => { const ys = track(body, c, 'Hips').map((p) => p.y); return Math.max(...ys) - Math.min(...ys); };
      expect(hipsRange('ex_squat')).toBeGreaterThan(0.3);
      expect(hipsRange('ex_squat_bar')).toBeGreaterThan(0.3);
      expect(hipsRange('ex_split_squat')).toBeGreaterThan(0.3);
      expect(hipsRange('ex_lunge')).toBeGreaterThan(0.3);
      expect(hipsRange('ex_reverse_lunge')).toBeGreaterThan(0.3);
      // the hinge: the head travels forward and down, the hips barely drop
      at(body, 'ex_hinge', 0); const h0 = pos(body, 'Head');
      at(body, 'ex_hinge', ISO_HOLD_SEC.ex_hinge); const h1 = pos(body, 'Head');
      expect(h1.z - h0.z).toBeGreaterThan(0.3); expect(h0.y - h1.y).toBeGreaterThan(0.3);
      expect(hipsRange('ex_hinge')).toBeLessThan(0.15);
      // the jump: both feet leave the floor
      const feetLow = track(body, 'ex_jump', 'LeftFoot').map((p) => p.y);
      expect(Math.max(...feetLow) - Math.min(...feetLow)).toBeGreaterThan(0.15);
      // the calf raise: up onto the toes, the toes stay down
      at(body, 'ex_calf_raise', ISO_HOLD_SEC.ex_calf_raise);
      expect(pos(body, 'LeftFoot').y - pos(body, 'LeftToeBase').y).toBeGreaterThan(0.05);
    });
    it(`${body}: the arms go where the lift says`, () => {
      at(body, 'ex_press', 1.0); expect(pos(body, 'LeftHand').y).toBeGreaterThan(pos(body, 'Head').y + 0.2);
      at(body, 'ex_press', 0); expect(Math.abs(pos(body, 'LeftHand').y - pos(body, 'LeftArm').y)).toBeLessThan(0.15);   // the rack: the hands at the shoulders (the Head bone is the skull's base, not its top)
      at(body, 'ex_curl', 0); const curl0 = pos(body, 'RightHand').y; at(body, 'ex_curl', 1.0); expect(pos(body, 'RightHand').y - curl0).toBeGreaterThan(0.3);
      at(body, 'ex_lateral_raise', 1.0); expect(Math.abs(pos(body, 'LeftHand').x)).toBeGreaterThan(0.5);
      at(body, 'ex_front_raise', 1.0); expect(pos(body, 'LeftHand').z).toBeGreaterThan(0.4);
      at(body, 'ex_triceps_overhead', 1.0); expect(pos(body, 'LeftHand').y).toBeGreaterThan(pos(body, 'Head').y);
      at(body, 'ex_row', 0); const row0 = pos(body, 'LeftHand'); at(body, 'ex_row', ISO_HOLD_SEC.ex_row); const row1 = pos(body, 'LeftHand');
      expect(row1.y - row0.y).toBeGreaterThan(0.08);
    });
    it(`${body}: on the floor — the push-up is one line near the floor, the plank holds, the bridge lifts the hips`, () => {
      at(body, 'ex_pushup', 0); const top = pos(body, 'Head').y;
      at(body, 'ex_pushup', ISO_HOLD_SEC.ex_pushup); const bottom = pos(body, 'Head').y;
      expect(top - bottom).toBeGreaterThan(0.2);
      expect(pos(body, 'LeftHand').y).toBeLessThan(0.2);
      expect(Math.abs(pos(body, 'Hips').y - (pos(body, 'LeftFoot').y + pos(body, 'Head').y) / 2)).toBeLessThan(0.12);   // a straight body: the hips on the line
      at(body, 'ex_bridge', 0); const b0 = pos(body, 'Hips').y; at(body, 'ex_bridge', ISO_HOLD_SEC.ex_bridge); const b1 = pos(body, 'Hips').y;
      expect(b1 - b0).toBeGreaterThan(0.15);
      expect(pos(body, 'Head').y).toBeLessThan(0.3);   // the shoulders and head stay down
      at(body, 'ex_bench_press', 0); const bp0 = pos(body, 'LeftHand').y; at(body, 'ex_bench_press', ISO_HOLD_SEC.ex_bench_press);
      expect(bp0 - pos(body, 'LeftHand').y).toBeGreaterThan(0.2);
      expect(pos(body, 'Hips').y).toBeGreaterThan(0.45); expect(pos(body, 'Hips').y).toBeLessThan(0.65);   // on the bench, not the floor
    });
  }
  it('an isometric hold\'s second is the end of the range it names', () => {
    // [joint, 'min' | 'max' of its height over the loop] — the second must be within 3 cm of it
    const ends: Record<string, [string, 'min' | 'max']> = {
      ex_squat: ['Hips', 'min'], ex_squat_bar: ['Hips', 'min'], ex_hinge: ['Head', 'min'], ex_good_morning: ['Head', 'min'], ex_split_squat: ['Hips', 'min'],
      ex_lunge: ['Hips', 'min'], ex_reverse_lunge: ['Hips', 'min'], ex_lateral_raise: ['LeftHand', 'max'], ex_front_raise: ['LeftHand', 'max'], ex_row: ['LeftHand', 'max'],
      ex_upright_row: ['LeftHand', 'max'], ex_shrug: ['LeftHand', 'max'], ex_pushdown: ['LeftHand', 'min'], ex_pushup: ['Head', 'min'], ex_bridge: ['Hips', 'max'],
      ex_calf_raise: ['Hips', 'max'], ex_crunch: ['Head', 'max'], ex_seated_lateral_raise: ['LeftHand', 'max'], ex_bench_press: ['LeftHand', 'min'],
      ex_floor_press: ['LeftHand', 'min'], ex_skull_crusher: ['LeftHand', 'min'], ex_incline_press: ['LeftHand', 'min'],
    };
    const bad: string[] = [];
    for (const [clip, sec] of Object.entries(ISO_HOLD_SEC)) {
      const end = ends[clip];
      if (!end) continue;   // a mid-range hold (the press, the curl): checked below
      const ys = track('hero', clip, end[0], 30).map((p) => p.y);
      const want = end[1] === 'min' ? Math.min(...ys) : Math.max(...ys);
      at('hero', clip, sec);
      const got = pos('hero', end[0]).y;
      if (Math.abs(got - want) > 0.03) bad.push(`${clip}: ${end[0]} ${got.toFixed(3)} vs ${end[1]} ${want.toFixed(3)}`);
    }
    // mid-range holds: part-way, not at either end
    for (const clip of ['ex_press', 'ex_curl', 'ex_triceps_overhead', 'ex_seated_press', 'ex_seated_curl', 'ex_seated_triceps']) {
      const ys = track('hero', clip, 'LeftHand', 30).map((p) => p.y);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      at('hero', clip, ISO_HOLD_SEC[clip]);
      const u = (pos('hero', 'LeftHand').y - lo) / (hi - lo);
      if (u < 0.2 || u > 0.85) bad.push(`${clip}: hold at ${(u * 100).toFixed(0)}% of the range`);
    }
    expect(bad).toEqual([]);
  });
});
