// DUNK-LAND-CELEBRATE — dunk_land_absorb rig tests (feet-first, stagger, absorb, knees over toes).
// Thresholds stated in-test; measured on fel-hero (the forge body shared by the male kit and athletes).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../boneLookup';
import { buildDunkLandAbsorb, buildDunkLandAbsorbDeep, LAND_ABSORB_SEC, HEEL_DOWN_T, ABSORB_BOTTOM_T, DEEP_HEEL_DOWN_T, DEEP_BOTTOM_T, RISE_START_T } from './dunkLandAbsorb';

let scene: Scene; let sk: Skeleton;
const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
const HIP_DROP_SNAP_MAX = 0.06;
const VALGUS_DEG_MAX = 10;
const STAGGER_MIN = 0.06;
const STAGGER_MAX = 0.12;
const FLOOR_MIN = -0.03;   // measured on fel-hero: absorb bottom peaks at −0.026 m

beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
});

function reset(): void { for (const x of [...scene.animationGroups]) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } scene.render(); }
function at(g: AnimationGroup, sec: number): void { reset(); g.start(false, 1, g.from, g.to, false); g.goToFrame(sec * 30); scene.render(); }
function pos(name: string): Vector3 { const n = boneNode(sk, name)!; n.computeWorldMatrix(true); return n.getAbsolutePosition(); }
const footY = (side: 'Left' | 'Right', part: 'Foot' | 'ToeBase') => pos(`${side}${part}`).y;

describe('dunk_land_absorb', () => {
  it('toe/ball before heel, heels within 0.1 s, both down before absorb bottom', () => {
    const g = buildDunkLandAbsorb(scene, sk)!;
    at(g, 0);
    expect(footY('Right', 'ToeBase')).toBeLessThanOrEqual(footY('Right', 'Foot') + 0.02);
    expect(footY('Left', 'ToeBase')).toBeLessThanOrEqual(footY('Left', 'Foot') + 0.02);
    at(g, HEEL_DOWN_T);
    expect(footY('Right', 'Foot')).toBeGreaterThan(FLOOR_MIN);
    expect(footY('Left', 'Foot')).toBeGreaterThan(FLOOR_MIN);
    at(g, ABSORB_BOTTOM_T);
    expect(footY('Right', 'Foot')).toBeGreaterThan(FLOOR_MIN);
    expect(footY('Left', 'Foot')).toBeGreaterThan(FLOOR_MIN);
  });

  it('absorb bottom 0.20–0.30 s after contact, no frame-to-frame hip snap', () => {
    const g = buildDunkLandAbsorb(scene, sk)!;
    at(g, 0); const hips0 = pos('Hips').y;
    let lowest = hips0; let lowestT = 0; let prevH = hips0;
    for (let f = 0; f <= Math.round(LAND_ABSORB_SEC * 60); f++) {
      at(g, f / 60);
      const h = pos('Hips').y;
      expect(h - prevH).toBeGreaterThan(-HIP_DROP_SNAP_MAX);
      if (h < lowest) { lowest = h; lowestT = f / 60; }
      prevH = h;
    }
    expect(lowestT).toBeGreaterThanOrEqual(0.20);
    expect(lowestT).toBeLessThanOrEqual(0.30);
    expect(hips0 - lowest).toBeGreaterThan(0.08);
  });

  it('knees stay over toes (frontal valgus ≤ 10°)', () => {
    const g = buildDunkLandAbsorb(scene, sk)!;
    const valgus = (side: 'Left' | 'Right') => {
      const hip = pos(`${side}UpLeg`), knee = pos(`${side}Leg`), ankle = pos(`${side}Foot`);
      const hx = hip.x, ax = ankle.x, kx = knee.x;
      const inside = side === 'Left' ? kx > hx && kx < ax : kx < hx && kx > ax;
      if (!inside) return 0;
      const span = Math.abs(ax - hx) || 0.01;
      return (Math.abs(kx - (hx + ax) / 2) / span) * 90;
    };
    for (const t of [HEEL_DOWN_T, ABSORB_BOTTOM_T, 0.35]) {
      at(g, t);
      expect(valgus('Left')).toBeLessThanOrEqual(VALGUS_DEG_MAX);
      expect(valgus('Right')).toBeLessThanOrEqual(VALGUS_DEG_MAX);
    }
  });

  it('lead foot 6–12 cm ahead; hands in front of hips at bottom, not a T', () => {
    const g = buildDunkLandAbsorb(scene, sk)!;
    at(g, ABSORB_BOTTOM_T);
    expect(pos('RightFoot').z - pos('LeftFoot').z).toBeGreaterThanOrEqual(STAGGER_MIN);
    expect(pos('RightFoot').z - pos('LeftFoot').z).toBeLessThanOrEqual(STAGGER_MAX + 0.02);
    const hips = pos('Hips');
    expect(pos('RightHand').z).toBeGreaterThan(hips.z);
    expect(pos('LeftHand').z).toBeGreaterThan(hips.z);
    expect(Math.abs(pos('RightHand').x - pos('LeftHand').x)).toBeLessThan(0.7);
  });
});

// DUNK SWITCH-ON (owner 2026-11-10, GATE 0 sign-off given): the deep absorb — the knees take the fall from the rim. The old clip's
// tests above are unchanged (it is still what dunk.landAbsorbDeep 0 plays).
describe('dunk_land_absorb_deep', () => {
  it('reaches its bottom 0.10–0.16 s after contact (the old clip: 0.20–0.30 s), at least 0.10 m down, with no one-frame snap', () => {
    const g = buildDunkLandAbsorbDeep(scene, sk)!;
    at(g, 0); const hips0 = pos('Hips').y;
    let lowest = hips0, lowestT = 0, prevH = hips0;
    for (let f = 0; f <= Math.round(LAND_ABSORB_SEC * 60); f++) {
      at(g, f / 60); const h = pos('Hips').y;
      expect(h - prevH, `frame ${f}`).toBeGreaterThan(-HIP_DROP_SNAP_MAX);
      if (h < lowest) { lowest = h; lowestT = f / 60; }
      prevH = h;
    }
    console.info(`[land] deep: hips down ${(hips0 - lowest).toFixed(3)} m at ${lowestT.toFixed(3)} s`);
    expect(hips0 - lowest).toBeGreaterThanOrEqual(0.10);   // the clip's own share; DunkMode's LandingAbsorb adds up to 0.11 m by the fall's speed (DunkMode scan)
    expect(lowestT).toBeGreaterThanOrEqual(0.10); expect(lowestT).toBeLessThanOrEqual(0.16);
  });
  it('no lower toe than the old clip: the old one\'s lowest toe over its own absorb is the bar', () => {
    const lowToe = (g: AnimationGroup, ts: number[]) => Math.min(...ts.map((t) => { at(g, t); return Math.min(footY('Left', 'ToeBase'), footY('Right', 'ToeBase')); }));
    const old = lowToe(buildDunkLandAbsorb(scene, sk)!, [HEEL_DOWN_T, ABSORB_BOTTOM_T, RISE_START_T]);
    const deep = lowToe(buildDunkLandAbsorbDeep(scene, sk)!, [DEEP_HEEL_DOWN_T, DEEP_BOTTOM_T, RISE_START_T]);
    console.info(`[land] lowest toe: old ${old.toFixed(3)} m, deep ${deep.toFixed(3)} m`);
    expect(deep).toBeGreaterThanOrEqual(old - 0.01);
  });
  it('the feet stay on the floor through the absorb, the knees over the toes, the lead foot ahead', () => {
    const g = buildDunkLandAbsorbDeep(scene, sk)!;
    for (const t of [DEEP_HEEL_DOWN_T, DEEP_BOTTOM_T, RISE_START_T]) {
      at(g, t);
      console.info(`[land] t ${t}: feet ${footY('Left', 'Foot').toFixed(3)} ${footY('Right', 'Foot').toFixed(3)}`);
      for (const side of ['Left', 'Right'] as const) expect(footY(side, 'Foot'), `${side} ${t}`).toBeGreaterThan(FLOOR_MIN);
      for (const side of ['Left', 'Right'] as const) {
        const hip = pos(`${side}UpLeg`), knee = pos(`${side}Leg`), ankle = pos(`${side}Foot`);
        const inside = side === 'Left' ? knee.x > hip.x && knee.x < ankle.x : knee.x < hip.x && knee.x > ankle.x;
        expect(inside ? (Math.abs(knee.x - (hip.x + ankle.x) / 2) / (Math.abs(ankle.x - hip.x) || 0.01)) * 90 : 0, `${side} valgus ${t}`).toBeLessThanOrEqual(VALGUS_DEG_MAX);
      }
    }
    at(g, DEEP_BOTTOM_T);
    expect(pos('RightFoot').z - pos('LeftFoot').z).toBeGreaterThanOrEqual(STAGGER_MIN);
  });
  it('the same length and rise start as the old clip, so the celebration and the card keep their beats', () => {
    expect(buildDunkLandAbsorbDeep(scene, sk)!.to / 30).toBeCloseTo(buildDunkLandAbsorb(scene, sk)!.to / 30, 3);
    expect(DEEP_BOTTOM_T).toBeLessThan(RISE_START_T);
  });
});
