// CLIP-SMOOTH (2026-11-03): the snaps inside the clips. The pure re-keying (clipDesnap.ts) on a synthetic track, and the
// measurement it answers: every gameplay clip played on the hero and sampled at 60 fps, counted with the gameplay-clean audit's
// own rule (a bone ≥ 600°/s and ≥ 3.5× its ±6-frame median; events within 10 frames are one; HARD = a peak ≥ 1500°/s).
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ on: 1 }));
vi.mock('../../feel-panel/feel', async (orig) => ({ ...(await orig<object>()), feel: (id: string, def: number) => (id === 'anim.clipSmooth' ? knob.on : def) }));

import { DESNAP_CLIPS, SNAP_DEG_PER_SEC, desnapTrack, snapSteps, stepSpeeds, type QuatTrack } from './clipDesnap';
import { CharacterAnimator } from './CharacterAnimator';
import { buildAuthoredClip } from './authored';
import { MOCAP_OPPONENT_CLIPS, buildMocapOpponentClip } from './authored/mocapOpponents';
import { MOCAP_STYLE_CLIPS, buildMocapStyleClip } from './authored/mocapStyles';
import { boneNode } from './boneLookup';

const yaw = (deg: number) => Quaternion.RotationAxis(new Vector3(0, 1, 0), (deg * Math.PI) / 180);

describe('the re-keying', () => {
  it('spreads a one-step snap over the keys either side; the poses before and after, and a hold, stay', () => {
    // 30 fps keys: slow (2° a key), then one 40° step (1200°/s… at 30 fps that is 40° in 33 ms = 1200°/s: make it 60°), then slow
    const t = (i: number) => i / 30;
    const deg = [0, 2, 4, 6, 66, 68, 70, 72, 74];
    const track: QuatTrack = deg.map((d, i) => [t(i), yaw(d)]);
    expect(snapSteps(track)).toEqual([3]);
    const before = track.map(([, q]) => q.clone());
    const moved = desnapTrack(track, [t(6)]);
    expect(moved).toBeGreaterThan(0);
    expect(snapSteps(track)).toEqual([]);
    expect(Math.max(...stepSpeeds(track))).toBeLessThan(SNAP_DEG_PER_SEC);
    // the ends of the spread, the first and last keys, and the hold are untouched
    for (const k of [0, 1, 6, 7, 8]) expect(Quaternion.Dot(track[k][1], before[k]) > 0.99999, `key ${k}`).toBe(true);
    // the times are never moved
    expect(track.map(([tt]) => tt)).toEqual(deg.map((_, i) => t(i)));
  });
  it('leaves a fast but steady move alone (no snap against its own speed)', () => {
    const track: QuatTrack = Array.from({ length: 10 }, (_, i) => [i / 30, yaw(i * 60)]);   // 1800°/s throughout
    expect(snapSteps(track)).toEqual([]);
    expect(desnapTrack(track)).toBe(0);
  });
});

// ── on the rig ──────────────────────────────────────────────────────────────────────────────────────────────────────
const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
/** The gameplay clips the audit's modes play (karate, karate VS, showdown, football, derby, skateboard, penalty), authored and captured,
 *  and every style capture (the parkour, trick, capoeira and breaking moves). */
const GAMEPLAY = /^(karate_|football_|baseball_|board_|skate_|pk_|soccer_)/;
let scene: Scene, sk: Skeleton, reset: () => void;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
  reset = () => { for (const x of [...scene.animationGroups]) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } scene.render(); };
}, 120_000);

function build(name: string): AnimationGroup | null {
  reset();
  for (const g of scene.animationGroups.filter((x) => x.name === name)) g.dispose();
  const mc = MOCAP_OPPONENT_CLIPS.find((c) => c.name === name);
  if (mc) return buildMocapOpponentClip(scene, sk, mc);
  const st = MOCAP_STYLE_CLIPS.find((c) => c.name === name);
  if (st) return buildMocapStyleClip(scene, sk, st);
  return buildAuthoredClip(new CharacterAnimator(scene, []), scene, sk, name, null) ? scene.animationGroups.find((x) => x.name === name) ?? null : null;
}
/** The clip's hard pop events at 60 fps (the audit's rule). */
function hardPops(g: AnimationGroup): number {
  const n = Math.round(((g.to - g.from) / 30) * 60), qs: Quaternion[][] = [];
  for (let i = 0; i <= n; i++) {
    reset(); g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + (i / 60) * 30); scene.render();
    qs.push(QN.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone())); g.stop();
  }
  const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
  const sp = qs.map((f, i) => (i ? f.map((q, b) => ang(q, qs[i - 1][b]) * 60) : []));
  const pops: { i: number; w: number }[] = [];
  for (let b = 0; b < QN.length; b++) for (let i = 1; i < sp.length; i++) {
    const w = sp[i][b]; if (w < 600) continue;
    const nb: number[] = []; for (let k = i - 6; k <= i + 6; k++) if (k !== i && k >= 1 && k < sp.length) nb.push(sp[k][b]);
    nb.sort((x, y) => x - y); if (w >= 3.5 * Math.max(nb.length ? nb[Math.floor(nb.length / 2)] : 0, 60)) pops.push({ i, w });
  }
  pops.sort((a, b) => a.i - b.i); const ev: { end: number; peak: number }[] = [];
  for (const p of pops) { const l = ev[ev.length - 1]; if (l && p.i - l.end <= 10) { l.end = p.i; l.peak = Math.max(l.peak, p.w); } else ev.push({ end: p.i, peak: p.w }); }
  return ev.filter((e) => e.peak >= 1500).length;
}
function gameplayClips(): string[] {
  const src = readFileSync('lib/babylon/anim/authored/index.ts', 'utf8');
  const authored = [...src.matchAll(/^\s+\['([a-z0-9_]+)', \(\) =>/gm)].map((m) => m[1]);
  return [...new Set([...[...authored, ...MOCAP_OPPONENT_CLIPS.map((c) => c.name)].filter((n) => GAMEPLAY.test(n)), ...MOCAP_STYLE_CLIPS.map((c) => c.name)])].sort();
}

describe('the clips, measured', () => {
  it('with the knob off, the listed clips — and only they — snap inside their own keys (the list is the measurement)', () => {
    knob.on = 0;
    const snapping = gameplayClips().filter((n) => { const g = build(n); const k = g ? hardPops(g) : 0; g?.dispose(); return k > 0; });
    knob.on = 1;
    expect(snapping).toEqual([...DESNAP_CLIPS].sort());
  }, 300_000);
  it('with it on (the default), no gameplay clip snaps inside its keys; the listed ones keep their bones and their length', () => {
    const bad: string[] = [];
    for (const n of gameplayClips()) {
      const g = build(n); if (!g) continue;
      const k = hardPops(g); if (k) bad.push(`${n}: ${k}`);
      g.dispose();
    }
    expect(bad).toEqual([]);
    for (const n of DESNAP_CLIPS) {
      knob.on = 0; const a = build(n)!; const ta = a.targetedAnimations.map((x) => `${(x.target as TransformNode).name}:${x.animation.getKeys().length}`).sort(); const la = a.to - a.from; a.dispose();
      knob.on = 1; const b = build(n)!; const tb = b.targetedAnimations.map((x) => `${(x.target as TransformNode).name}:${x.animation.getKeys().length}`).sort(); const lb = b.to - b.from; b.dispose();
      expect(tb, n).toEqual(ta);
      expect(lb, n).toBe(la);
    }
  }, 300_000);
});
