// find-signature — search every capture on disk for the moment a named move is UNMISTAKABLE (2026-09-15, owner: "The
// animations need to be recognizable on sight", fighting moves). The first cuts for The Hundred were proxies picked off
// contact sheets — a "whirlwind" that is a side kick, a "hammer fist" that is a low sweeping block, a "typhoon" that is a
// 180° jumping twist with no kick — and on a clean frame sheet they read as nothing. This scores raw joints (so a spin is
// not clipped by the retarget's ±110° hip key) for the shape each move is named for:
//   cross     a hand driven ≥ 0.6 m in front at shoulder height while the hips turn through it
//   uppercut  a hand rising ≥ 0.5 m in 0.3 s to above the chin, in front
//   hammer    both fists above the head, then both driven below the chest within 0.5 s, in front
//   highkick  a foot ≥ 1.35 m off the floor, in front
//   whirl     a ≥ 300° turn inside a second with a foot ≥ 0.85 m (a spinning kick)
//   typhoon   the whirl, airborne: both feet ≥ 0.25 m off the floor at once
// Everything is normalised by the take's own leg length and reported in forge-hero metres.
//   npx tsx scripts/mocap/find-signature.mts [subjects=135,141,143,144,80] [move=all] [top=5]
import fs from 'node:fs';
import { readBvhStream } from './sources.mts';
import type { JointStream, V3 } from '../../lib/babylon/anim/mocapRetarget.ts';
const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
const ROOT = `${process.env.HOME}/Downloads/fel-mocap-sources/cmu`;
const subjects = opt('subjects', '135,141,143,144,80').split(',');
const want = opt('move', 'all');
const TOP = Number(opt('top', '5'));
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
type Hit = { move: string; file: string; t: number; score: number; from: number; to: number; note: string };
const hits: Hit[] = [];
for (const subj of subjects) {
  const dir = `${ROOT}/${subj}`; if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.bvh')).sort()) {
    const file = `${dir}/${f}`;
    let s: JointStream;
    try { s = readBvhStream(file, 'cmu'); } catch { continue; }
    const up: V3 = s.up ?? [0, 1, 0];
    const step = Math.max(1, Math.round(s.fps / 30)), fps = s.fps / step;
    const F = s.frames.filter((_, i) => i % step === 0);
    if (F.length < 20) continue;
    const legs = F.map((fr) => (len(sub(fr.LeftUpLeg, fr.LeftFoot)) + len(sub(fr.RightUpLeg, fr.RightFoot))) / 2).sort((a, b) => a - b);
    const L = legs[Math.floor(legs.length / 2)] || 1;
    const M = (v: number) => (v / L) * 0.84;                      // to forge-hero metres (leg 0.84)
    const floor = Math.min(...F.map((fr) => Math.min(dot(fr.LeftFoot, up), dot(fr.RightFoot, up))));
    // front sign for the take: toes ahead of the heel-ish (foot → toe) on average
    let fs0 = 0; for (const fr of F) { const r = norm(sub(fr.RightUpLeg, fr.LeftUpLeg)); const fw = cross(r, up); fs0 += dot(sub(fr.RightToe, fr.RightFoot), fw) + dot(sub(fr.LeftToe, fr.LeftFoot), fw); }
    const sign = fs0 >= 0 ? 1 : -1;
    const yaw: number[] = []; let prev = 0, acc = 0;
    const rows = F.map((fr, i) => {
      const right = norm(sub(fr.RightUpLeg, fr.LeftUpLeg)); const fw = norm(cross(right, up)); const front: V3 = [fw[0] * sign, fw[1] * sign, fw[2] * sign];
      const a = Math.atan2(right[2], right[0]);
      if (i) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; acc += d; }
      prev = a; yaw.push(acc * 180 / Math.PI);
      const hand = (h: V3) => ({ h: M(dot(h, up) - floor), f: M(dot(sub(h, fr.Hips), front)) });
      return {
        L: hand(fr.LeftHand), R: hand(fr.RightHand),
        fl: M(dot(fr.LeftFoot, up) - floor), fr: M(dot(fr.RightFoot, up) - floor),
        flf: M(dot(sub(fr.LeftFoot, fr.Hips), front)), frf: M(dot(sub(fr.RightFoot, fr.Hips), front)),
      };
    });
    const n = rows.length, k = (sec: number) => Math.round(sec * fps);
    const add = (move: string, i: number, score: number, lead: number, tail: number, note: string) => {
      if (want !== 'all' && want !== move) return;
      const t = i / fps; hits.push({ move, file: `cmu/${subj}/${f}`, t: +t.toFixed(2), score: +score.toFixed(3), from: +Math.max(0, t - lead).toFixed(2), to: +Math.min(n / fps, t + tail).toFixed(2), note });
    };
    for (let i = k(0.35); i < n - k(0.35); i++) {
      const r = rows[i];
      for (const side of ['L', 'R'] as const) {
        const h = r[side];
        // cross: long reach at shoulder height, hips turned into it over the last 0.3 s
        const turn = Math.abs(yaw[i] - yaw[i - k(0.3)]);
        if (h.f >= Number(opt("reach", "0.58")) && h.h >= 1.2 && h.h <= Number(opt("maxh", "1.7")) && turn >= Number(opt("turn", "18")) && h.f >= Math.max(rows[i - 1][side].f, rows[i + 1][side].f)) add('cross', i, h.f + turn / 200, 0.3, 0.22, `${side} reach ${h.f.toFixed(2)} at ${h.h.toFixed(2)}, hips ${turn.toFixed(0)}°`);
        // uppercut: a fast rise to above the chin, in front
        const h0 = rows[i - k(0.3)][side];
        if (h.h - h0.h >= 0.5 && h.h >= 1.6 && h.f >= 0.12 && h.h >= Math.max(rows[i - 1][side].h, rows[i + 1][side].h)) add('uppercut', i, h.h - h0.h, 0.32, 0.2, `${side} rise ${(h.h - h0.h).toFixed(2)} to ${h.h.toFixed(2)}, front ${h.f.toFixed(2)}`);
      }
      // hammer (one arm): a fist above the head driven down past the chest in front within 0.45 s — the hammer fist
      for (const side of ['L', 'R'] as const) {
        if (r[side].h < 1.78) continue;
        for (let j = i + k(0.12); j <= Math.min(n - 1, i + k(0.45)); j++) {
          const q = rows[j][side];
          if (q.h <= 1.2 && q.f >= 0.2) { add('hammer1', i, r[side].h - q.h + q.f * 0.5, 0.3, (j - i) / fps + 0.2, `${side} ${r[side].h.toFixed(2)} → ${q.h.toFixed(2)} front ${q.f.toFixed(2)} in ${((j - i) / fps).toFixed(2)} s`); break; }
        }
      }
      // hammer: both fists high, then both low within 0.5 s
      if (r.L.h >= 1.72 && r.R.h >= 1.72) {
        for (let j = i + k(0.15); j <= Math.min(n - 1, i + k(0.5)); j++) {
          const q = rows[j];
          if (q.L.h <= 1.2 && q.R.h <= 1.2 && q.L.f >= 0.05 && q.R.f >= 0.05) { add('hammer', i, (r.L.h + r.R.h - q.L.h - q.R.h) / 2, 0.25, (j - i) / fps + 0.2, `both ${((r.L.h + r.R.h) / 2).toFixed(2)} → ${((q.L.h + q.R.h) / 2).toFixed(2)} in ${((j - i) / fps).toFixed(2)} s`); break; }
        }
      }
      // high kick: a foot above ~head-ish, in front
      for (const [fh, ff, nm] of [[r.fl, r.flf, 'L'], [r.fr, r.frf, 'R']] as const) {
        const prevH = nm === 'L' ? rows[i - 1].fl : rows[i - 1].fr, nextH = nm === 'L' ? rows[i + 1].fl : rows[i + 1].fr;
        if (fh >= 1.35 && ff >= 0.3 && fh >= prevH && fh >= nextH) add('highkick', i, fh, 0.4, 0.3, `${nm} foot ${fh.toFixed(2)}, front ${ff.toFixed(2)}`);
      }
    }
    // spins: a ≥300° turn inside a second, with a high foot; airborne = both feet up at once
    for (let i = 0; i + k(1) < n; i += k(0.1)) {
      const j = i + k(1);
      const turn = Math.abs(yaw[j] - yaw[i]);
      if (turn < Number(opt("minturn", "240"))) continue;
      let footMax = 0, air = 0, at = i;
      for (let q = i; q <= j; q++) { const fm = Math.max(rows[q].fl, rows[q].fr); if (fm > footMax) { footMax = fm; at = q; } air = Math.max(air, Math.min(rows[q].fl, rows[q].fr)); }
      if (footMax >= Number(opt("whirlfoot", "0.8")) && air < 0.25) add('whirl', at, turn / 360 + footMax, (at - i) / fps + 0.15, (j - at) / fps + 0.1, `turn ${turn.toFixed(0)}°, foot ${footMax.toFixed(2)}, air ${air.toFixed(2)}`);
      if (turn >= 300 && footMax >= 0.9 && air >= 0.25) add('typhoon', at, turn / 360 + footMax + air, (at - i) / fps + 0.2, (j - at) / fps + 0.1, `turn ${turn.toFixed(0)}°, foot ${footMax.toFixed(2)}, both feet up ${air.toFixed(2)}`);
    }
  }
}
const moves = [...new Set(hits.map((h) => h.move))];
for (const m of ['cross', 'uppercut', 'hammer', 'hammer1', 'highkick', 'whirl', 'typhoon']) {
  const best: Hit[] = [];
  for (const h of hits.filter((x) => x.move === m).sort((a, b) => b.score - a.score)) {
    if (best.some((b) => b.file === h.file && Math.abs(b.t - h.t) < 1)) continue;
    best.push(h); if (best.length >= TOP) break;
  }
  console.log(`== ${m} (${hits.filter((x) => x.move === m).length} candidates)`);
  for (const b of best) console.log(`  ${b.score.toFixed(2)}  ${b.file} @${b.t}  window ${b.from}–${b.to}  ${b.note}`);
}
void moves;
