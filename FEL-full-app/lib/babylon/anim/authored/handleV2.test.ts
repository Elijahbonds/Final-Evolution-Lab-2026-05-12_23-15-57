// HOOPS MOTION phase 4c (plan §4.1–4.7, §6 `basketball.test.ts`): THE CROSSING CLIPS v2 on real bodies — the forge hero and the female kit
// (her hip joints sit where the male's do, her Hips bone 8 cm lower; the candidate the plan names). Each clip is built on the body the way
// the modes build it (at bind), scrubbed, and read in the body's own frame: every hand key that says 'on' puts the wrist within 0.05 m of the
// point the carry reaches for on THAT body (its own path, its own stance), the IK really gets there, the between-the-legs drops the hips
// ≥ 0.15 m, the behind-the-back's wrapping elbow never folds forward across the body, and the clip is as long as the path it rides.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { plantLeg } from '../FootPlanting';
import { armChain, reachArm, shapeReach } from '../HandIK';
import { BALL_ELBOW_POLE } from '../ballCarry';
import { pathAt } from '../handlePaths';
import { buildPoseClip } from '../poseClip';
import {
  buildCrossover, buildMomentumCross, buildInAndOut, buildBetweenLegsDribble, buildBehindBackDribble, buildDoubleCross, buildShammgod, buildBtbSlide, SLIDE_V2_KEYS, buildHesiV2, buildYoyoV2, buildPausin,
  carryStanceAtBind, handleV2Keys, mirrorKey, buildHesi, BASKETBALL_CLIPS, V2_KEYS as KEYS_OF, V2_BALL_POLE,
} from './basketball';
import { pathFor, strokeStretch, type PathMove } from '../handlePaths';
import type { V2Key as V2KeyT } from './basketball';
import { HOOPS_DRIBBLE } from '../Dribble';

const BODIES = { hero: 'public/models/fel-hero.glb', 'kit-female': 'public/models/candidates/fel-kit-female.glb' } as const;
interface Rig { scene: Scene; sk: Skeleton; bind: Map<TransformNode, { p: Vector3; q: Quaternion }>; root: TransformNode }
const rigs = new Map<string, Rig>();
beforeAll(async () => {
  for (const [key, file] of Object.entries(BODIES)) {
    const scene = new Scene(new NullEngine());
    scene.metadata = { felModeId: 'onevone' };
    new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(file).toString('base64'), scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk = r.skeletons[0];
    const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
    for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
    const hips = boneNode(sk, 'Hips')!;
    rigs.set(key, { scene, sk, bind, root: (hips.parent as TransformNode) ?? hips });
  }
}, 120_000);

const rest = (r: Rig) => { for (const x of r.scene.animationGroups) x.stop(); for (const [n, t] of r.bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } };
function at(r: Rig, g: AnimationGroup, sec: number): (bone: string) => Vector3 {
  rest(r);
  g.start(false, 1, g.from, g.to, false); g.goToFrame(Math.min(g.to, sec * 30)); r.scene.render();
  return (bone: string) => { const n = boneNode(r.sk, bone)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
}
/** The body frame poseClip keys in (read at bind): right = the hip line, up, front = up × right (the toes settle the sign). */
function bodyFrame(r: Rig): { o: Vector3; right: Vector3; up: Vector3; front: Vector3 } {
  rest(r); for (const n of r.bind.keys()) n.computeWorldMatrix(true);
  const lu = boneNode(r.sk, 'LeftUpLeg')!.getAbsolutePosition(), ru = boneNode(r.sk, 'RightUpLeg')!.getAbsolutePosition();
  const right = ru.subtract(lu); right.y = 0; right.normalize();
  let front = Vector3.Cross(Vector3.Up(), right).normalize();
  const f = boneNode(r.sk, 'LeftFoot')!.getAbsolutePosition(), t = boneNode(r.sk, 'LeftToeBase')?.getAbsolutePosition();
  if (t) { const d = t.subtract(f); d.y = 0; if (Vector3.Dot(d, front) < 0) front = front.scale(-1); }
  r.root.computeWorldMatrix(true);
  return { o: r.root.getAbsolutePosition().clone(), right, up: Vector3.Up(), front };
}
const local = (fr: ReturnType<typeof bodyFrame>, w: Vector3): [number, number, number] => { const d = w.subtract(fr.o); return [Vector3.Dot(d, fr.right), Vector3.Dot(d, fr.up), Vector3.Dot(d, fr.front)]; };

const CLIPS: { name: string; move: PathMove; build: (s: Scene, k: Skeleton) => AnimationGroup | null; mirrored: boolean; keys?: readonly V2KeyT[] }[] = [
  { name: 'bball_crossover_left', move: 'crossover', build: (s, k) => buildCrossover(s, k, 'left'), mirrored: false },
  { name: 'bball_crossover_right', move: 'crossover', build: (s, k) => buildCrossover(s, k, 'right'), mirrored: true },
  { name: 'bball_momentum_cross_left', move: 'momentum_cross', build: (s, k) => buildMomentumCross(s, k, 'left'), mirrored: false },
  { name: 'bball_in_and_out_right', move: 'in_and_out', build: (s, k) => buildInAndOut(s, k, 'right'), mirrored: false },
  { name: 'bball_in_and_out_left', move: 'in_and_out', build: (s, k) => buildInAndOut(s, k, 'left'), mirrored: true },
  { name: 'bball_between_legs_left', move: 'between_legs', build: (s, k) => buildBetweenLegsDribble(s, k, 'left'), mirrored: false },
  { name: 'bball_behind_back_left', move: 'behind_back', build: (s, k) => buildBehindBackDribble(s, k, 'left'), mirrored: false },
  { name: 'bball_behind_back_right', move: 'behind_back', build: (s, k) => buildBehindBackDribble(s, k, 'right'), mirrored: true },
  { name: 'bball_double_cross_right', move: 'double_cross', build: (s, k) => buildDoubleCross(s, k, 'right'), mirrored: false },
  { name: 'bball_shammgod_left', move: 'shammgod', build: (s, k) => buildShammgod(s, k, 'left'), mirrored: false },
  // H2 (owner 2026-10-16): the BTB slide — the behind-the-back's path, its own keys; held to every line the crossing clips are
  { name: 'bball_btb_slide_left', move: 'behind_back', build: (s, k) => buildBtbSlide(s, k, 'left'), mirrored: false, keys: SLIDE_V2_KEYS },
  { name: 'bball_btb_slide_right', move: 'behind_back', build: (s, k) => buildBtbSlide(s, k, 'right'), mirrored: true, keys: SLIDE_V2_KEYS },
  // H2b (plan §4.8): the hesitation v2 on the hesi's float path
  { name: 'bball_hesi_v2_right', move: 'hesi', build: (s, k) => buildHesiV2(s, k, 'right'), mirrored: false },
  { name: 'bball_hesi_v2_left', move: 'hesi', build: (s, k) => buildHesiV2(s, k, 'left'), mirrored: true },
  { name: 'bball_yoyo_v2_right', move: 'yoyo', build: (s, k) => buildYoyoV2(s, k, 'right'), mirrored: false },   // H2b (plan §4.9)
  { name: 'bball_yoyo_v2_left', move: 'yoyo', build: (s, k) => buildYoyoV2(s, k, 'left'), mirrored: true },
  { name: 'bball_pausin_right', move: 'pausin', build: (s, k) => buildPausin(s, k, 'right'), mirrored: false },   // H2b (plan §4.18)
  { name: 'bball_pausin_left', move: 'pausin', build: (s, k) => buildPausin(s, k, 'left'), mirrored: true },
];

for (const body of Object.keys(BODIES)) {
  describe(`the crossing clips v2 on the ${body}`, () => {
    it('the stance is the carry\'s (a fitted stroke never shorter than the default) and each clip is as long as its path on this body', () => {
      const r = rigs.get(body)!; rest(r);
      const st = carryStanceAtBind(r.sk);
      expect(st.P).toBeGreaterThanOrEqual(HOOPS_DRIBBLE.palmY); expect(st.S).toBe(HOOPS_DRIBBLE.side);
      for (const c of CLIPS) {
        rest(r); const g = c.build(r.scene, r.sk)!;
        expect(g, c.name).toBeTruthy();
        const want = pathFor(c.move, 'right', 1, st)!.duration;
        expect((g.to - g.from) / 30, c.name).toBeCloseTo(want, 1);
        expect(want).toBeCloseTo(pathFor(c.move, 'right', 1)!.duration * strokeStretch(st), 6);
      }
    });
    it('every hand key on the path (on the ball, and arriving at / leaving it): the wrist within 0.05 m of the point the carry reaches for on this body', () => {
      const r = rigs.get(body)!; const fr = bodyFrame(r); const st = carryStanceAtBind(r.sk);
      let checked = 0; const misses: string[] = [];
      for (const c of CLIPS) {
        rest(r); const g = c.build(r.scene, r.sk)!;
        const { keys } = handleV2Keys(c.move, c.keys ?? KEYS_OF[c.move]!, st);
        for (const k of keys) {
          for (const side of ['Right', 'Left'] as const) {
            const tgt = k.handsBody?.[side]; if (!tgt) continue;
            const hand = c.mirrored ? (side === 'Right' ? 'LeftHand' : 'RightHand') : `${side}Hand`;
            const want: [number, number, number] = c.mirrored ? [-tgt[0], tgt[1], tgt[2]] : tgt;
            const got = local(fr, at(r, g, k.t)(hand));
            const miss = Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]);
            if (!(miss < 0.05)) misses.push(`${c.name} @${k.t.toFixed(3)} ${hand}: miss ${miss.toFixed(3)} got ${got.map((v) => v.toFixed(3))} want ${want.map((v) => v.toFixed(3))}`);
            checked++;
          }
        }
      }
      expect(misses).toEqual([]);
      expect(checked).toBeGreaterThan(30);
    });
    it('between the legs: the hips drop ≥ 0.15 m at the floor contact — against the clip\'s first key AND the dribble loops\' own stance (plan §4.3 / G2)', () => {
      const r = rigs.get(body)!; rest(r);
      for (const n of r.bind.keys()) n.computeWorldMatrix(true);
      const hipsN = boneNode(r.sk, 'Hips')!; hipsN.computeWorldMatrix(true); const yBind = hipsN.getAbsolutePosition().y;
      const g = buildBetweenLegsDribble(r.scene, r.sk, 'left')!;
      const st = carryStanceAtBind(r.sk), floorT = 0.19 * strokeStretch(st);
      const y0 = at(r, g, 0)('Hips').y, y1 = at(r, g, floorT)('Hips').y;
      expect(y0 - y1).toBeGreaterThanOrEqual(0.15);
      // the probe reads the drop against the 300 ms before the move — the dribble loops, whose hips sit 0.15 under bind (bball_mc_dribble_*
      // hipsY −0.15): 4c's first cut dropped 0.22 from its own first key and read 0.108 on the probe
      expect((yBind - 0.15) - y1).toBeGreaterThanOrEqual(0.15);
    });
    it('no foot goes through the floor: over every clip the lowest ankle stays within 2 cm of its height at bind (the momentum cross 4 cm)', () => {
      // 4c's first cut keyed the legs by bones under hips 0.16–0.27 m down: the Shammgod's trail ankle went 0.146 m through the floor at
      // bind (0.13 m on the probe's frames), the between's 0.139, the double's 0.068, the in-and-out's 0.053 — those four key their ankles
      // now (V2Key.feet). The momentum cross runs over a sprint's loop (its bones-keyed legs dip 0.038).
      const r = rigs.get(body)!; rest(r); for (const n of r.bind.keys()) n.computeWorldMatrix(true);
      const ank = (p: (b: string) => Vector3) => Math.min(p('LeftFoot').y, p('RightFoot').y);
      const a0 = ank((b) => { const n = boneNode(r.sk, b)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); });
      const bad: string[] = [];
      for (const c of CLIPS) {
        rest(r); const g = c.build(r.scene, r.sk)!; const T = (g.to - g.from) / 30; let low = 9;
        for (let i = 0; i <= Math.round(T * 60); i++) low = Math.min(low, ank(at(r, g, i / 60)));
        if (!(a0 - low <= (c.move === 'momentum_cross' ? 0.04 : 0.02))) bad.push(`${c.name}: ${(a0 - low).toFixed(3)} m under`);
      }
      expect(bad).toEqual([]);
    });
    it('the knees sit on the foot planter\'s pole (poseClip kneesFront): FootPlanting at zero drift twists no thigh over 3°, the ankles where the bones put them', () => {
      // 4c's probe: every crossing clip popped a thigh 1000–2100°/s for one frame — the planter twists a held leg's knee to root.forward
      // and lets the clip's own knee show on a touchdown frame; the v2 legs sat 22–39° off that pole (the phase-1 hesi: 7°)
      const r = rigs.get(body)!; rest(r); r.root.computeWorldMatrix(true);
      const qAng = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
      const twistAt = (g: AnimationGroup, t: number): { twist: number; ankles: Vector3[] } => {
        at(r, g, t); let twist = 0; const ankles: Vector3[] = [];
        for (const side of ['Left', 'Right'] as const) {
          const hip = boneNode(r.sk, `${side}UpLeg`)!, knee = boneNode(r.sk, `${side}Leg`)!, ank = boneNode(r.sk, `${side}Foot`)!;
          for (const n of [hip, knee, ank]) n.computeWorldMatrix(true);
          const q0 = hip.rotationQuaternion!.clone(), a0 = ank.getAbsolutePosition().clone(); ankles.push(a0);
          plantLeg(hip, knee, ank, a0.clone(), r.root.forward);
          twist = Math.max(twist, qAng(q0, hip.rotationQuaternion!));
        }
        return { twist, ankles };
      };
      const st = carryStanceAtBind(r.sk), bad: string[] = [];
      for (const c of CLIPS) {
        rest(r); const g = c.build(r.scene, r.sk)!;
        const T = (g.to - g.from) / 30;
        for (let i = 0; i <= Math.round(T * 60); i++) { const { twist } = twistAt(g, i / 60); if (!(twist <= 3)) bad.push(`${c.name} @${(i / 60).toFixed(2)}: ${twist.toFixed(1)}°`); }
        // the same keys without kneesFront: the ankles at every key agree within 1 cm (only the knee's swivel changed)
        const keys = handleV2Keys(c.move, c.keys ?? KEYS_OF[c.move]!, st).keys.map((k) => (c.mirrored ? mirrorKey(k) : k));
        rest(r); const raw = buildPoseClip(r.scene, r.sk, `${c.name}_raw`, T, keys.map((k) => ({ ...k, kneesFront: false })), { smooth: true, prefilter: 0, periodic: false })!;
        for (const k of keys) {
          const a = twistAt(raw, k.t).ankles, b = twistAt(g, k.t).ankles;
          for (let s2 = 0; s2 < 2; s2++) expect(Vector3.Distance(a[s2], b[s2]), `${c.name} @${k.t.toFixed(3)} ankle ${s2}`).toBeLessThan(0.01);
        }
        raw.dispose();
      }
      expect(bad).toEqual([]);
      // the control: a phase-1 clip without kneesFront still reads its old 6–7° (the measure is live)
      rest(r); const hesi = buildHesi(r.scene, r.sk)!;
      expect(twistAt(hesi, 0.2).twist).toBeGreaterThan(4);
    });
    it('the hand-over: where the carry takes a hand for the ball or gives it back (0 < reach < 1), its solve keeps the clip\'s elbow (≤ 22°; the Shammgod 26°)', () => {
      // 4c's probe: arm pops at every push and catch — the carry reaches the hand on the path with BALL_ELBOW_POLE (shapeReach at the reach
      // weight) and fades it back to the clip over 0.06 s; a clip elbow on the default pole sat 22–28° from the carry's there (behind 17°).
      // Measured (hero): crossover 2°, momentum 9°, between 13°, behind 0°, double 2°, Shammgod 19°, in-and-out 1°.
      const r = rigs.get(body)!; rest(r); r.root.computeWorldMatrix(true);
      const st = carryStanceAtBind(r.sk);
      const qAng = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
      const worstFade = (g: AnimationGroup, move: PathMove, mirrored: boolean): { deg: number; at: string } => {
        const path = pathFor(move, 'right', 1, st)!; let worst = { deg: 0, at: '' };
        for (let i = 0; i <= Math.round(path.duration * 60); i++) {
          const t = i / 60, smp = pathAt(path, t);
          for (const h of ['right', 'left'] as const) {
            const w = smp.reach[h] ?? 0; if (!(w > 1e-3 && w < 0.999)) continue;
            at(r, g, t);
            const rig = (h === 'right') !== mirrored ? 'Right' : 'Left', arm = armChain(r.sk, rig)!;
            for (const n of [arm.shoulder, arm.elbow, arm.hand]) n.computeWorldMatrix(true);
            const u0 = arm.shoulder.rotationQuaternion!.clone(), hd = arm.hand.getAbsolutePosition().clone();
            const pole = new Vector3((rig === 'Right' ? 1 : -1) * BALL_ELBOW_POLE[0], BALL_ELBOW_POLE[1], BALL_ELBOW_POLE[2]);
            const shaped = shapeReach(arm.shoulder.getAbsolutePosition(), arm.elbow.getAbsolutePosition(), hd, hd.clone(), pole, undefined, (Math.PI / 2) * w);
            reachArm(arm, shaped.target, shaped.pole, 1);
            const d = qAng(u0, arm.shoulder.rotationQuaternion!);
            if (d > worst.deg) worst = { deg: d, at: `${h} @${t.toFixed(2)} w ${w.toFixed(2)}` };
          }
        }
        return worst;
      };
      const bad: string[] = [];
      // (the Shammgod's line is 26°: its push goes out on a nearly straight arm, where the solve's roll about the shoulder→hand line is
      // ill-conditioned — hero 19°, the female kit 25.5° at the push's release; its default-pole reading was 28°)
      for (const c of CLIPS) { rest(r); const w = worstFade(c.build(r.scene, r.sk)!, c.move, c.mirrored); if (!(w.deg <= (c.move === 'shammgod' ? 26 : 22))) bad.push(`${c.name}: ${w.deg.toFixed(1)}° (${w.at})`); }
      expect(bad).toEqual([]);
      // the pole is the carry's own numbers; and the measure is live: the same keys on the default elbow pole read over the line
      expect([...V2_BALL_POLE]).toEqual([...BALL_ELBOW_POLE]);
      const keys = handleV2Keys('crossover', KEYS_OF.crossover!, st).keys.map((k) => ({ ...k, poles: undefined }));
      rest(r); const raw = buildPoseClip(r.scene, r.sk, 'bball_crossover_left_rawpoles', keys[keys.length - 1].t, keys, { smooth: true, prefilter: 0, periodic: false })!;
      expect(worstFade(raw, 'crossover', false).deg).toBeGreaterThan(22);
      raw.dispose();
    });
    it('behind the back: the wrapping arm\'s elbow points BACK through the wrap and never crosses the body\'s midline', () => {
      const r = rigs.get(body)!; const fr = bodyFrame(r); rest(r);
      const g = buildBehindBackDribble(r.scene, r.sk, 'left')!;
      const st = carryStanceAtBind(r.sk), k = strokeStretch(st);
      for (const t of [0.08, 0.11, 0.14]) {
        const p = at(r, g, t * k);
        const sh = local(fr, p('RightArm')), el = local(fr, p('RightForeArm'));
        expect(el[2], `@${t}: the elbow behind the shoulder`).toBeLessThan(sh[2]);
        expect(el[0], `@${t}: the elbow on the body's own side of the midline`).toBeGreaterThan(0);
      }
    });
  });
}

describe('the names', () => {
  it('the momentum cross has its own clip, registered', () => {
    expect(BASKETBALL_CLIPS).toContain('bball_momentum_cross_left'); expect(BASKETBALL_CLIPS).toContain('bball_momentum_cross_right');
  });
  it('H2: the BTB slide has its own clip, registered (a generic name: no real names on the floor)', () => {
    expect(BASKETBALL_CLIPS).toContain('bball_btb_slide_left'); expect(BASKETBALL_CLIPS).toContain('bball_btb_slide_right');
  });
});
