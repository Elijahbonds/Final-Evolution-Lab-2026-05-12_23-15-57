// GAMEPLAY-CLEAN-7 — the made-shot celebration's elbow swing (anim.celebrateEase). The capture `dunk_mc_celebrate_big` (what
// `bball_score_celebrate` plays on every hoops and dunk body) turns the upper arms 28–32° a 60 fps frame by itself at 0.43–0.57 s; the
// audit's hard pop is 25°. The listed bones are re-keyed under SPEED_CAP_DEG_PER_SEC when the clip is built; 0 builds it as captured.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', async (orig) => ({ ...(await orig<object>()), feel: (id: string, def: number) => knob.v.get(id) ?? def }));

import { CELEBRATE_EASE_ON, SPEED_CAP_CLIPS, SPEED_CAP_DEG_PER_SEC, capTrackSpeed, stepSpeeds, type QuatTrack } from './clipDesnap';
import { MOCAP_OPPONENT_CLIPS, buildMocapOpponentClip } from './authored/mocapOpponents';
import { sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';

const yaw = (deg: number) => Quaternion.RotationAxis(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;

describe('capTrackSpeed (pure)', () => {
  it('spreads a fast stretch until no step is over the cap; the stretch\'s end poses and a hold stay', () => {
    const t = (i: number) => i / 30;   // 30 fps keys, the built clips' rate
    const deg = [0, 2, 4, 6, 20, 61, 127, 157, 171, 174, 176, 178, 180, 182];   // a peaked swing: 41, 66, 30° a key in the middle
    const track: QuatTrack = deg.map((d, i) => [t(i), yaw(d)]);
    expect(Math.max(...stepSpeeds(track))).toBeGreaterThan(1900);
    const ends = [track[0][1].clone(), track[track.length - 1][1].clone()];
    const moved = capTrackSpeed(track, SPEED_CAP_DEG_PER_SEC, [t(12)]);
    expect(moved).toBeGreaterThan(0);
    expect(Math.max(...stepSpeeds(track))).toBeLessThanOrEqual(SPEED_CAP_DEG_PER_SEC + 1e-6);
    expect(ang(track[0][1], ends[0])).toBeLessThan(1e-4);
    expect(ang(track[track.length - 1][1], ends[1])).toBeLessThan(1e-4);
    expect(ang(track[12][1], yaw(180))).toBeLessThan(1e-4);   // the hold
    expect(track.map(([tt]) => tt)).toEqual(deg.map((_, i) => t(i)));   // no key time moved
  });
  it('leaves a track already under the cap alone', () => {
    const track: QuatTrack = [0, 10, 20, 30, 40].map((d, i) => [i / 30, yaw(d)]);
    expect(capTrackSpeed(track)).toBe(0);
  });
});

let sk: Skeleton, scene: Scene;
beforeAll(async () => {
  const engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
}, 120_000);

/** The clip built on the hero, sampled at 60 fps from 0.05 s to its end: the largest one-frame turn of each listed bone. */
function worst(): Record<string, number> {
  const def = MOCAP_OPPONENT_CLIPS.find((c) => c.name === 'dunk_mc_celebrate_big')!;
  const g = buildMocapOpponentClip(scene, sk, def)!;
  const bones = SPEED_CAP_CLIPS.get('dunk_mc_celebrate_big')!;
  const out: Record<string, number> = {};
  g.start(false, 1, g.from, g.to); g.pause();
  let prev: Quaternion[] | null = null;
  const fps = 60, n = Math.floor(def.duration * fps);
  for (let f = 3; f <= n; f++) {
    g.goToFrame(g.from + (f / fps) * (g.to - g.from) / def.duration); scene.render();
    const now = bones.map((b) => boneNode(sk, b)!.rotationQuaternion!.clone());
    if (prev) now.forEach((q, k) => { out[bones[k]] = Math.max(out[bones[k]] ?? 0, ang(q, prev![k])); });
    prev = now;
  }
  g.stop(); g.dispose();
  return out;
}

describe('anim.celebrateEase on the hero', () => {
  it('defaults on; the celebration\'s upper arms stay under the 25° hard pop (28–32° as captured); 0 builds the clip as captured', () => {
    expect(CELEBRATE_EASE_ON).toBe(1);
    const on = worst();
    knob.v.set('anim.celebrateEase', 0);
    const off = worst();
    knob.v.clear();
    expect(Math.max(off.LeftArm, off.RightArm), JSON.stringify(off)).toBeGreaterThan(27);
    expect(Math.max(on.LeftArm, on.RightArm), JSON.stringify(on)).toBeLessThan(21);
    for (const b of ['LeftForeArm', 'RightForeArm']) expect(on[b], b).toBeLessThanOrEqual(off[b] + 0.5);
  }, 120_000);
});
