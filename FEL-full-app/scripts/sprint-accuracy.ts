// sprint-accuracy — the camera sprint timer's bench on synthetic sprinters (SPRINT-SPEED, 2026-10-25).
//
//   npx tsx scripts/sprint-accuracy.ts
//
// Prints, per frame rate, how far each read lands from the synthetic truth and how often the truth is inside the read's
// own ±2 SD. SYNTHETIC: a stick figure through a pinhole camera with seeded landmark noise (tests/helpers/sprintSynth.ts),
// so it bounds the maths, not a real phone — real blur, rolling shutter and pose failures are the validation pilot's job.
// Not a ci suite (no assertions; tests/sprint-speed holds those).
import { makeCamera, project } from '../lib/pose/synth';
import { bodyPoint, markerScale, markerScaleSdPct, type Line } from '../lib/sprint/geometry';
import { firstCrossing } from '../lib/sprint/crossing';
import { detectOnset } from '../lib/sprint/start';
import { readFlying, readGateRun } from '../lib/sprint/timing';
import { readTrace } from '../lib/sprint/trace';
import { readAgility } from '../lib/sprint/agility';
import { agilityRunState, bisect, film, lineSeq, sprinter } from '../tests/helpers/sprintSynth';

const W = 1280, H = 720;
const stats = (errs: number[], inside: number) => {
  const a = errs.map(Math.abs).sort((x, y) => x - y);
  const mean = a.reduce((s, x) => s + x, 0) / (a.length || 1);
  return { n: a.length, meanAbsMs: +mean.toFixed(2), p95Ms: +(a[Math.floor(0.95 * (a.length - 1))] ?? NaN).toFixed(2), insidePct: Math.round((inside / (a.length || 1)) * 100) };
};
const torsoPicX = (img: { x: number }[]) => (img[11].x + img[12].x + img[23].x + img[24].x) / 4;
const out: Record<string, unknown> = {};

for (const fps of [30, 60, 120, 240]) {
  // 1. the crossing core: 1.5 picture heights/s, σ 0.004
  { const e: number[] = []; let ins = 0; for (let seed = 1; seed <= 300; seed++) { const c = firstCrossing(lineSeq({ fps, tc: 3000, v: 1.5, sd: 0.004, seed }), { pointSd: 0.004 })!; e.push(c.t - 3000); if (Math.abs(c.t - 3000) <= 2 * c.sdMs) ins++; } out[`crossing@${fps}`] = stats(e, ins); }
  // 2. a 40 yd to a finish-line phone 4 m from the lane (finish only)
  { const e: number[] = []; let ins = 0; for (let seed = 1; seed <= 40; seed++) {
    const { frames, aspect, render } = film(sprinter({ vmax: 9 + (seed % 5) * 0.2, tau: 1.15, startX: -36.576 }), 1.8, 4.2, 6.2, 0, { fps, camera: { width: W, height: H, hfovDeg: 66, distance: 4, heightM: 1.1 }, noise: 0.002, jitterMs: 0.3, dropP: 0.04, seed });
    const truth = bisect((t) => torsoPicX(render(t)) - 0.5, 4.3, 6.1);
    const r = readGateRun({ frames, aspect, line: { a: { x: 0.5, y: 0.15 }, b: { x: 0.5, y: 0.85 } }, point: 'torso', start: { kind: 'go', read: { kind: 'go', t: 0, sdMs: 0, reactionIncluded: true } }, from: 0 });
    if (r.ok) { const d = (r.timeS - truth) * 1000; e.push(d); if (Math.abs(d) <= 2 * r.sdS * 1000) ins++; }
  } out[`gate40yd@${fps}`] = stats(e, ins); }
  // 3. first movement (start in view, 7 m away)
  { const e: number[] = []; let ins = 0; for (let seed = 1; seed <= 40; seed++) {
    const { frames, aspect } = film(sprinter({ vmax: 8.5, tau: 1.2, startX: -2 }), 1.8, -1.2, 1.2, 5000, { fps, camera: { width: W, height: H, hfovDeg: 66, distance: 7 }, noise: 0.002, seed });
    const on = detectOnset(frames.map((f) => ({ t: f.t, p: bodyPoint(f, 'torso') })), aspect);
    if (on.ok) { e.push(on.t - 5000); if (Math.abs(on.t - 5000) <= 2 * on.sdMs) ins++; }
  } out[`onset@${fps}`] = stats(e, ins); }
  // 4. flying 10 m, two poles in one frame 15 m away, on the marker line
  { const cam = makeCamera({ width: W, height: H, hfovDeg: 66, distance: 15, heightM: 1.1 });
    const L = (X: number): Line => { const a = project(cam, [X, 0, 0]), b = project(cam, [X, 1.6, 0]); return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }; };
    const e: number[] = []; let ins = 0; for (let seed = 1; seed <= 30; seed++) {
      const run = sprinter({ vmax: 9.5, tau: 1.1, startX: -35 });
      const { frames, aspect } = film(run, 1.8, 2.5, 5.6, 0, { fps, camera: { width: W, height: H, hfovDeg: 66, distance: 15, heightM: 1.1 }, noise: 0.0015, seed });
      const tx = (t: number) => { const s = run(t).s; return s.hipX + 0.5 * s.lean * (0.818 - 0.53) * 1.8; };
      const truth = bisect((t) => tx(t) - 5, 2.5, 5.5) - bisect((t) => tx(t) + 5, 2.5, 5.5);
      const r = readFlying({ frames, aspect, first: L(-5), second: L(5), point: 'torso', distanceM: 10, cameraM: 15, from: 0 });
      if (r.ok) { const d = (r.timeS - truth) * 1000; e.push(d); if (Math.abs(d) <= 2 * r.sdS * 1000) ins++; }
    } out[`flying10@${fps}`] = stats(e, ins); }
  // 5. the trace: v_max and τ, 25 m away, markers 28 m apart
  if (fps <= 120) { const cam = makeCamera({ width: W, height: H, hfovDeg: 66, distance: 25, heightM: 1.1 });
    const p = (X: number) => { const q = project(cam, [X, 0, 0]); return { x: q.x, y: q.y }; };
    const sc = markerScale(p(-14), p(14), 28, W / H); if (!sc.ok) throw new Error(sc.why);
    const ev: number[] = [], et: number[] = []; let ins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const vmax = 8.6 + seed * 0.1, tau = 1.0 + (seed % 4) * 0.1;
      const { frames } = film(sprinter({ vmax, tau, startX: -14 }), 1.8, -0.8, 4.4, 1000, { fps, camera: { width: W, height: H, hfovDeg: 66, distance: 25, heightM: 1.1 }, noise: 0.0015, seed });
      const r = readTrace({ frames, scale: sc.scale, t0Ms: 1000, startAtOrigin: true, scaleSdPct: markerScaleSdPct(sc.scale) });
      if (r.ok && r.model) { ev.push(((r.model.vmax - vmax) / vmax) * 100); et.push(((r.model.tau - tau) / tau) * 100); if (Math.abs(r.model.vmax - vmax) <= 2 * r.model.vmaxSd) ins++; }
    }
    out[`trace@${fps}`] = { n: ev.length, vmaxMeanAbsPct: +(ev.reduce((s, x) => s + Math.abs(x), 0) / ev.length).toFixed(2), tauMeanAbsPct: +(et.reduce((s, x) => s + Math.abs(x), 0) / et.length).toFixed(2), vmaxInside2SdPct: Math.round((ins / ev.length) * 100) };
  }
  // 6. the 5-10-5
  if (fps <= 60) { const cam = makeCamera({ width: W, height: H, hfovDeg: 70, distance: 9, heightM: 1.0 });
    const p = (X: number) => { const q = project(cam, [X, 0, 0]); return { x: q.x, y: q.y }; };
    const cones = { left: p(-4.572), middle: p(0), right: p(4.572) };
    const e: number[] = []; let ins = 0, caught = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const a = agilityRunState({ firstSide: seed % 2 ? 1 : -1, t1: 1.2 + seed * 0.02, t2: 2.1 });
      const { frames, aspect } = film(a.state, 1.8, -1.3, a.turnsS[1] + 1.4, 0, { fps, camera: { width: W, height: H, hfovDeg: 70, distance: 9, heightM: 1.0 }, noise: 0.0015, seed });
      const r = readAgility({ frames, aspect, cones, from: -Infinity });
      if (r.ok) { const d = (r.timeS - a.finishS()) * 1000; e.push(d); if (Math.abs(d) <= 2 * r.sdS * 1000) ins++; }
      const s = agilityRunState({ firstSide: 1, t1: 1.3, t2: 2.1, shortM: 0.3, shortTurn: seed % 2 ? 1 : 2 });
      const f2 = film(s.state, 1.8, -1.3, s.turnsS[1] + 1.4, 0, { fps, camera: { width: W, height: H, hfovDeg: 70, distance: 9, heightM: 1.0 }, noise: 0.0015, seed: seed + 100 });
      if (!readAgility({ frames: f2.frames, aspect: f2.aspect, cones, from: -Infinity }).ok) caught++;
    }
    out[`agility505@${fps}`] = { ...stats(e, ins), shortTurn30cmCaughtPct: Math.round((caught / 20) * 100) };
  }
}
console.log(JSON.stringify(out, null, 1));
