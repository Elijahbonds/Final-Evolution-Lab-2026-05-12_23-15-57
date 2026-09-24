// Rig tests for the quiz podium's gestures (BRAINBRAWL-MAJOR, 2026-09-24): each one must make the shape a stranger reads
// without a caption, judged in world space against the body's own head, shoulders and hips on the forge hero — and none
// of them may pass through a T (both hands out at shoulder height) at any point of its length.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildIdleStand } from './locomotion';
import {
  buildPartyThink, buildPartyBuzz, buildPartyLocked, buildPartyYes, buildPartyFacepalm, buildPartyShrug, buildPartyWin, buildPartyWinIn, buildPartyLose,
  PARTY_THINK_SEC, PARTY_BUZZ_SEC, PARTY_LOCKED_SEC, PARTY_YES_SEC, PARTY_FACEPALM_SEC, PARTY_SHRUG_SEC, PARTY_WIN_SEC, PARTY_WIN_IN_SEC, PARTY_LOSE_SEC,
  PODIUM_TOP_M, PODIUM_AHEAD_M,
} from './party';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync(process.env.FEL_HERO_GLB ?? 'public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});
function reset(): void { for (const x of [...scene.animationGroups]) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } scene.render(); }
function fresh<T>(f: () => T): T { reset(); return f(); }
function at(g: AnimationGroup, sec: number): void { reset(); g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render(); }
function pos(name: string): Vector3 { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }
/** Both hands out at shoulder height — the scarecrow. */
function isT(): boolean {
  return (['Left', 'Right'] as const).every((s) => {
    const sh = pos(`${s}Arm`), h = pos(`${s}Hand`);
    return Math.abs(h.y - sh.y) < 0.15 && Math.hypot(h.x - sh.x, h.z - sh.z) > 0.4;
  });
}
/** The body's forward axis in world z (the hero faces +z at yaw 0; read it off the rig so a flip cannot pass silently). */
const fwd = () => Math.sign(pos('LeftFoot').z + pos('RightFoot').z - 2 * pos('Hips').z + 1e-6) || 1;

const CLIPS: [string, () => AnimationGroup | null, number][] = [
  ['think', () => buildPartyThink(scene, sk), PARTY_THINK_SEC], ['buzz', () => buildPartyBuzz(scene, sk), PARTY_BUZZ_SEC],
  ['locked', () => buildPartyLocked(scene, sk), PARTY_LOCKED_SEC], ['yes', () => buildPartyYes(scene, sk), PARTY_YES_SEC],
  ['facepalm', () => buildPartyFacepalm(scene, sk), PARTY_FACEPALM_SEC], ['shrug', () => buildPartyShrug(scene, sk), PARTY_SHRUG_SEC],
  ['win', () => buildPartyWin(scene, sk), PARTY_WIN_SEC], ['win_in', () => buildPartyWinIn(scene, sk), PARTY_WIN_IN_SEC], ['lose', () => buildPartyLose(scene, sk), PARTY_LOSE_SEC],
];

describe('the quiz podium', () => {
  it('every gesture builds on the hero and never passes through a T', () => {
    for (const [name, build, sec] of CLIPS) {
      const g = fresh(build);
      expect(g, name).toBeTruthy();
      for (let t = 0; t <= sec + 1e-6; t += 0.05) { at(g!, t); expect(isT(), `${name} @ ${t.toFixed(2)}s`).toBe(false); }
    }
  });

  it('the loops close: think, locked, win and lose end where they start (no pop at the seam)', () => {
    for (const [name, build, sec] of CLIPS.filter(([n]) => ['think', 'locked', 'win', 'lose'].includes(n))) {
      const g = fresh(build)!;
      at(g, 0); const a = [pos('LeftHand'), pos('RightHand'), pos('Head')];
      at(g, sec); const b = [pos('LeftHand'), pos('RightHand'), pos('Head')];
      a.forEach((v, i) => expect(Vector3.Distance(v, b[i]), `${name} seam`).toBeLessThan(0.01));
    }
  });

  it('THINK: a fist under the chin, the other forearm across the belly under that elbow', () => {
    const g = fresh(() => buildPartyThink(scene, sk)!);
    for (const t of [0, 0.75, 1.5]) {
      at(g, t);
      expect(Vector3.Distance(pos('RightHand'), pos('Head')), `chin @${t}`).toBeLessThan(0.2);
      expect(pos('RightHand').y).toBeGreaterThan(pos('RightArm').y);                                  // up at the face, not hanging
      expect(Math.sign(pos('LeftHand').x), 'the left arm crosses the midline').toBe(-Math.sign(pos('LeftArm').x));
      expect(pos('LeftHand').y).toBeLessThan(pos('RightForeArm').y + 0.08);                           // …under the right elbow
    }
  });

  it('BUZZ: the hand goes UP, then comes down ON the podium top in front — the slap', () => {
    const g = fresh(() => buildPartyBuzz(scene, sk)!);
    at(g, 0.13); expect(pos('RightHand').y).toBeGreaterThan(pos('RightArm').y + 0.1);
    at(g, 0.24);
    expect(Math.abs(pos('RightHand').y - PODIUM_TOP_M), 'on the podium top').toBeLessThan(0.1);
    expect((pos('RightHand').z - pos('Hips').z) * fwd(), 'in front, over the podium').toBeGreaterThan(PODIUM_AHEAD_M - 0.12);
  });

  it('LOCKED: both hands flat on the podium, in front', () => {
    const g = fresh(() => buildPartyLocked(scene, sk)!);
    for (const t of [0, 0.8, 1.6]) {
      at(g, t);
      for (const s of ['Left', 'Right']) {
        expect(Math.abs(pos(`${s}Hand`).y - PODIUM_TOP_M), `${s} @${t}`).toBeLessThan(0.1);
        expect((pos(`${s}Hand`).z - pos('Hips').z) * fwd()).toBeGreaterThan(PODIUM_AHEAD_M - 0.15);
      }
    }
  });

  it('YES: the fist pumps — up by the ear, yanked down to the hip, twice', () => {
    const g = fresh(() => buildPartyYes(scene, sk)!);
    at(g, 0.16); const up = pos('RightHand').y; expect(up).toBeGreaterThan(pos('RightArm').y + 0.08);
    at(g, 0.34); const down = pos('RightHand').y; expect(down).toBeLessThan(up - 0.3);
    at(g, 0.52); expect(pos('RightHand').y).toBeGreaterThan(down + 0.2);
    at(g, 0.7); expect(pos('RightHand').y).toBeLessThan(up - 0.3);
  });

  it('FACEPALM: the palm at the brow and the head dropped into it', () => {
    const g0 = fresh(() => buildIdleStand(scene, sk)!); at(g0, 0); const headRest = pos('Head');
    const g = fresh(() => buildPartyFacepalm(scene, sk)!);
    at(g, 0.7);
    expect(Vector3.Distance(pos('RightHand'), pos('Head')), 'the hand at the face').toBeLessThan(0.2);
    expect(pos('RightHand').y).toBeGreaterThan(pos('Neck').y);
    const drop = headRest.y - pos('Head').y + (pos('Head').z - headRest.z) * fwd();
    expect(drop, 'head down and forward into the hand').toBeGreaterThan(0.02);
  });

  it('SHRUG: palms out wide at the waist, elbows tucked under the shoulders', () => {
    const g = fresh(() => buildPartyShrug(scene, sk)!);
    at(g, 0.6);
    expect(Math.abs(pos('LeftHand').x - pos('RightHand').x), 'wide').toBeGreaterThan(0.75);
    for (const s of ['Left', 'Right']) {
      expect(pos(`${s}Hand`).y).toBeGreaterThan(pos('Hips').y);
      expect(pos(`${s}Hand`).y).toBeLessThan(pos(`${s}Arm`).y - 0.15);
      expect(pos(`${s}ForeArm`).y, `${s} elbow low`).toBeLessThan(pos(`${s}Arm`).y - 0.12);
    }
  });

  it('WIN: both fists above the head, in a V', () => {
    const g = fresh(() => buildPartyWin(scene, sk)!);
    for (const t of [0, 0.3, 0.6]) {
      at(g, t);
      expect(Math.min(pos('LeftHand').y, pos('RightHand').y), `over the head @${t}`).toBeGreaterThan(pos('Head').y + 0.15);
      expect(Math.abs(pos('LeftHand').x - pos('RightHand').x), 'a V, not a column').toBeGreaterThan(0.55);
    }
  });

  it('WIN IN hands over to the V with no seam, and its first frame is the hang (the fade INTO it is trivial)', () => {
    const gin = fresh(() => buildPartyWinIn(scene, sk)!); at(gin, PARTY_WIN_IN_SEC); const end = [pos('LeftHand'), pos('RightHand')];
    const gw = fresh(() => buildPartyWin(scene, sk)!); at(gw, 0); const start = [pos('LeftHand'), pos('RightHand')];
    end.forEach((v, i) => expect(Vector3.Distance(v, start[i])).toBeLessThan(0.01));
    // on the way up the hands stay in FRONT of the shoulders' line — never out to the side at shoulder height
    for (let t = 0.1; t < PARTY_WIN_IN_SEC; t += 0.04) {
      at(gin, t);
      for (const s of ['Left', 'Right']) {
        const h = pos(`${s}Hand`), sh = pos(`${s}Arm`);
        if (Math.abs(h.y - sh.y) < 0.15) expect(Math.abs(h.x) - Math.abs(sh.x), `${s} @${t.toFixed(2)} out to the side`).toBeLessThan(0.2);
      }
    }
  });

  it('LOSE: head hung lower and forward of where it stands, hands on the podium', () => {
    const g0 = fresh(() => buildIdleStand(scene, sk)!); at(g0, 0); const headRest = pos('Head');
    const g = fresh(() => buildPartyLose(scene, sk)!);
    at(g, 0);
    expect(headRest.y - pos('Head').y, 'hung').toBeGreaterThan(0.05);
    for (const s of ['Left', 'Right']) expect(Math.abs(pos(`${s}Hand`).y - PODIUM_TOP_M)).toBeLessThan(0.1);
  });
});
