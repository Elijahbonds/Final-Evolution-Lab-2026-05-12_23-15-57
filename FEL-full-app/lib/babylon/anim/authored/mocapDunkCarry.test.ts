// DUNK-BALL-ARMS-RIM R3 (2026-09-14): the mocap dunk's BALL hand on the real rig, in node, at 60 fps.
//
// Measured live on 8586f1e + the WIP (probe _dunk-ball-arms-rim-probe, per rendered frame): on every power make AND on the
// miss the right palm — with the ball in it — moved 0.31–0.47 m a frame (~20 m/s) for six frames at clip 0.89–0.98 s, and
// on one of them sat at its own shoulder. The keys put the ball hand BEHIND the hip at 0.75–0.85 (z −0.25…−0.46) and then
// through the belly (0.9: x 0.12, y 1.24, z 0.10) to over the head by 0.95 — the capture's wind-up, 2.67× time-compressed.
// This pins the carry: the ball hand stays in front of the chest and never outruns a real arm through the wind-up.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { describe, it, expect } from 'vitest';
import { boneNode } from '../boneLookup';
import { buildMocapDunk, DUNK_MOCAP_DURATION } from './mocapDunk';

describe('dunk_mocap — the ball hand carries, it does not whip through the body', () => {
  // DUNK MOTION phase 5 (2026-09-23): the clip is the JUMP now (capture frames 49..59, 0.82 s): the ball goes up the front in both
  // hands from the plant to over the head by the apex. The carry is pinned over the whole clip.
  it('up the front, under a real arm speed, never inside the torso, never cocked far behind (the whole jump)', async () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    for (const g of r.animationGroups) g.stop();
    const sk: Skeleton = r.skeletons[0];
    const g: AnimationGroup = buildMocapDunk(scene, sk)!;
    const at = (n: string) => { const b = boneNode(sk, n)! as TransformNode; b.computeWorldMatrix(true); return b.getAbsolutePosition().clone(); };
    const FPS = 60, rows: { t: number; rh: Vector3; lh: Vector3; fwdR: number; shY: number; inTorsoR: boolean; inTorsoL: boolean }[] = [];
    g.start(false, 1, g.from, g.to, false);
    g.pause();   // sampled by goToFrame only: a playing group ALSO advances by the wall-clock delta on render(), which under the full
    // suite's load put up to a frame of real time into every sample (the whip read 12.9 m/s in the suite, 8.1 alone)
    let sign = 1;
    for (let i = 0; i <= DUNK_MOCAP_DURATION * FPS; i++) {
      const t = i / FPS; g.goToFrame(t * 30); scene.render();
      const hips = at('Hips'), neck = at('Neck'), la = at('LeftArm'), ra = at('RightArm'), rh = at('RightHand'), lh = at('LeftHand');
      const up = neck.subtract(hips).normalize(), across = ra.subtract(la).normalize();
      let fwd = Vector3.Cross(across, up).normalize();
      // the chest's forward is signed ONCE off the first key, whose ball hand is keyed 0.46 m in front of the root (the runtime
      // root is x-mirrored against the node, so the shoulder cross alone does not know front from back)
      if (i === 0) sign = Vector3.Dot(rh.subtract(ra), fwd) >= 0 ? 1 : -1;
      fwd = fwd.scale(sign);
      const inTorso = (h: Vector3) => {
        const d = h.subtract(hips), along = Vector3.Dot(d, up), len = neck.subtract(hips).length();
        if (along < 0 || along > len) return false;
        return Math.abs(Vector3.Dot(d, across)) < 0.12 && Math.abs(Vector3.Dot(d, fwd)) < 0.09;
      };
      rows.push({ t, rh, lh, fwdR: Vector3.Dot(rh.subtract(ra), fwd), shY: ra.y, inTorsoR: inTorso(rh), inTorsoL: inTorso(lh) });
    }
    const win = rows.filter((x) => x.t >= 0 && x.t <= DUNK_MOCAP_DURATION);
    const peak = (hand: 'rh' | 'lh') => { let v = 0, at = 0; for (let i = 1; i < win.length; i++) { const s = Vector3.Distance(win[i][hand], win[i - 1][hand]) * FPS; if (s > v) { v = s; at = win[i].t; } } return { v, at }; };
    const { v: vMax, at: vAt } = peak('rh'), off = peak('lh');
    const minFwd = Math.min(...win.map((x) => x.fwdR)), torso = win.filter((x) => x.inTorsoR);   // (logged; the limits are split at the plant below)
    console.info(`[mocap carry] ball hand: peak ${vMax.toFixed(1)} m/s @${vAt.toFixed(2)} s · furthest behind the shoulder ${(-minFwd).toFixed(2)} m · inside the torso ${torso.length} frames`);
    expect(vMax).toBeLessThan(9);          // a pro's dunk arm at the top of the throw-down; the live whip was ~20 m/s
    // the plant rips the ball back to the hip (≤ 0.3 m behind the shoulder, the trunk leaning over it); after it, overhead and cocked
    // at the apex (the capture's own −0.17) but never swung back behind the body
    // what the old whip did was LOW and behind — the ball swung back past the hip mid-flight. Overhead, a two-hand power dunk cocks
    // the ball back behind the head on purpose (the capture's apex), so only a hand under the shoulder is held to the tight limit.
    expect(Math.min(...win.filter((x) => x.t < 0.2).map((x) => x.fwdR))).toBeGreaterThan(-0.3);   // the take-off: the trunk leans over the plant, so a ball at the hip reads up to 0.3 m behind the shoulder
    const lowAfter = win.filter((x) => x.t >= 0.2 && x.rh.y < x.shY);
    console.info(`[mocap carry] low + behind after the plant: ${lowAfter.filter((x) => x.fwdR < -0.15).map((x) => x.t.toFixed(2)).join(' ') || 'none'} · worst overall @${win.reduce((a, x) => (x.fwdR < a.fwdR ? x : a)).t.toFixed(2)} s`);
    expect(Math.min(0, ...lowAfter.map((x) => x.fwdR))).toBeGreaterThan(-0.15);
    expect(Math.min(...win.map((x) => x.fwdR))).toBeGreaterThan(-0.32);
    // and it goes UP: from the plant (the waist) to over the head by the apex
    const y0 = rows[0].rh.y, yTop = Math.max(...rows.filter((x) => x.t >= 0.3 && x.t <= 0.7).map((x) => x.rh.y));
    expect(yTop - y0).toBeGreaterThan(0.6);
    expect(torso.length).toBe(0);
    // the OFF hand rises into the reach with the body, not in one 50 ms step: the capture's 0.9 → 0.95 key climbs 0.62 m, and
    // live (self-lob make, 59518ab) the left palm moved 0.34 m in one frame at clip 0.94 — a probe R3 pop
    console.info(`[mocap carry] off hand: peak ${off.v.toFixed(1)} m/s @${off.at.toFixed(2)} s · inside the torso ${win.filter((x) => x.inTorsoL).length} frames`);
    expect(off.v).toBeLessThan(9);
    expect(win.filter((x) => x.inTorsoL).length).toBe(0);
  }, 120000);
});
