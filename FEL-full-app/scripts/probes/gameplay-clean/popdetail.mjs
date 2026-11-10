// gameplay-clean: every hard pop of one recording, frame by frame (no browser), and the layer A/B beside it.
//   node popdetail.mjs <dir> <mode> [tag=sweep] [--ab=noplant,noposture,nomotion] [--all] [--win=f0,f1]
// Reads <dir>/<mode>-<tag>-raw.json.gz (audit.mjs's saved recording). For each hard pop event (popCount.mjs: ≥ 1500°/s, reset frames
// skipped): the time and frame, the bones that popped with their turn that frame in degrees, the hero's clips and their weights on
// the frame before → the frame of → the frame after (clean-5's `cw` readout: a clip dropped at a weight, a third clip under a fade),
// the root's step, and the keys held. --all lists the soft events (≥ 600°/s) too.
// --ab=<tags>: the same mode's runs with one layer off (?noplant=1 / ?noposture=1 / ?nomotion=1, dev build), as one table: hard pop
// events, and the largest one-frame turn of the thighs, knees, hips, spine and arms off reset frames. A pop that goes with a layer off
// is that layer's; one that stays in every run is the clip's or the transition's.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { countPops, qang, resetFrames } from './popCount.mjs';

export const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
export const GROUPS = { thigh: [14, 15], knee: [16, 17], hips: [0], spine: [1, 2, 3], head: [4, 5], arm: [8, 9, 10, 11], hand: [12, 13], foot: [18, 19] };
const r1 = (x) => Math.round(x * 10) / 10;

export function load(dir, mode, tag) {
  const f = path.join(dir, `${mode}-${tag}-raw.json.gz`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()).rec;
}
/** The hero's clips with their weights on frame i ("run 0.4 + jab 0.6"), or the >0.3 clip-set name on a recording without `cw`. */
export function clipsAt(rec, i) {
  const f = rec.frames[Math.max(0, Math.min(rec.frames.length - 1, i))];
  if (f.cw && rec.gNames && rec.cwv === 2) return f.cw.filter(([, w]) => w > 0.005).map(([g, w]) => `${rec.gNames[g]} ${w}`).join(' + ') || '(none)';
  if (f.cw && rec.gNames) return f.cw.map(([g]) => rec.gNames[g]).join(' + ') + ' (weights not recorded)';
  return String(rec.clips?.[f.c] ?? '?');
}
/** Frames f0..f1 one per line: every bone that turned ≥ `minDeg` that frame, the clips and weights, the root's step, the keys. */
export function window_(rec, f0, f1, minDeg = 5) {
  const F = rec.frames, out = [];
  for (let i = Math.max(1, f0); i <= Math.min(F.length - 1, f1); i++) {
    const turns = [];
    for (let b = 0; b < QN.length; b++) { const a = qang(F[i].q?.[b], F[i - 1].q?.[b]); if (a !== null && a >= minDeg) turns.push(`${QN[b]} ${r1(a)}`); }
    const step = F[i].r && F[i - 1].r ? Math.hypot(F[i].r[0] - F[i - 1].r[0], F[i].r[1] - F[i - 1].r[1], F[i].r[2] - F[i - 1].r[2]) : 0;
    out.push(`  f=${i} t=${F[i].t} ${F[i].ph} [${F[i].k ?? ''}] root ${Math.round(step * 1000) / 1000} y=${F[i].r ? F[i].r[1] : '?'} | ${clipsAt(rec, i)} | ${turns.join(', ')}`);
  }
  return out;
}
/** The largest one-frame turn (degrees) of each bone group over the playing frames that are not cuts, with the frame it fell on. */
export function maxTurns(rec) {
  const F = rec.frames, cut = resetFrames(F), out = {};
  for (const [g, idx] of Object.entries(GROUPS)) {
    let m = 0, at = -1, bone = '';
    for (let i = 1; i < F.length; i++) {
      if (cut.has(i) || F[i].ph !== 'playing' || F[i - 1].ph !== 'playing' || !F[i].q || !F[i - 1].q) continue;
      for (const b of idx) { const a = qang(F[i].q[b], F[i - 1].q[b]); if (a !== null && a > m) { m = a; at = i; bone = QN[b]; } }
    }
    out[g] = { deg: r1(m), i: at, t: at >= 0 ? F[at].t : null, bone };
  }
  return out;
}
/** One hard event, described. */
export function describe(rec, e) {
  const F = rec.frames;
  // the frame of the event's peak
  let pi = e.i, pk = 0;
  for (let i = e.i; i <= e.end; i++) for (let b = 0; b < QN.length; b++) { const a = qang(F[i].q?.[b], F[i - 1].q?.[b]); if (a !== null && a > pk) { pk = a; pi = i; } }
  const turns = [];
  for (let b = 0; b < QN.length; b++) { const a = qang(F[pi].q?.[b], F[pi - 1].q?.[b]); if (a !== null && a >= 10) turns.push([QN[b], r1(a)]); }
  turns.sort((x, y) => y[1] - x[1]);
  const step = F[pi].r && F[pi - 1].r ? Math.hypot(F[pi].r[0] - F[pi - 1].r[0], F[pi].r[1] - F[pi - 1].r[1], F[pi].r[2] - F[pi - 1].r[2]) : null;
  return { t: F[pi].t, i: pi, span: e.end - e.i + 1, peak: e.peak, turns, before: clipsAt(rec, pi - 1), at: clipsAt(rec, pi), after: clipsAt(rec, pi + 1), step: step === null ? null : Math.round(step * 1000) / 1000, keys: F[pi].k ?? '' };
}

const args = process.argv.slice(2); const pos = args.filter((a) => !a.startsWith('--'));
const [DIR, MODE, TAG = 'sweep'] = pos;
if (DIR && MODE && import.meta.url === `file://${process.argv[1]}`) {
  const rec = load(DIR, MODE, TAG);
  if (!rec) { console.error(`no recording ${MODE}-${TAG}`); process.exit(1); }
  const r = countPops(rec.frames, rec.clips ?? [], QN);
  const playN = rec.frames.filter((f) => f.ph === 'playing').length;
  console.log(`${MODE} [${TAG}]: ${playN} playing frames (${r1(playN / 60)} s), ${r.hard.length} hard pop events (${r.perMin(r.hard.length)}/min), ${r.events.length} events in all, ${r.resetFrames} reset frames skipped`);
  for (const e of args.includes('--all') ? r.events : r.hard) {
    const d = describe(rec, e);
    console.log(`  t=${d.t}s f=${d.i} (${d.span}f) peak ${d.peak}°/s  ${d.turns.slice(0, 6).map(([b, a]) => `${b} ${a}°`).join(', ')}\n      clips: ${d.before}  →  ${d.at}  →  ${d.after}   root ${d.step} m   keys [${d.keys}]`);
  }
  const win = args.find((a) => a.startsWith('--win='));
  if (win) { const [f0, f1] = win.slice(6).split(',').map(Number); console.log(window_(rec, f0, f1).join('\n')); }
  const mt = maxTurns(rec);
  console.log(`  max turn a frame: ${Object.entries(mt).map(([g, v]) => `${g} ${v.deg}° (${v.bone} t=${v.t})`).join(' · ')}`);
  const ab = args.find((a) => a.startsWith('--ab='));
  if (ab) {
    console.log(`\n| ${MODE} run | hard pops | thigh | knee | hips | spine | arm |\n|---|---|---|---|---|---|---|`);
    for (const tag of [TAG, ...ab.slice(5).split(',')]) {
      const x = load(DIR, MODE, tag); if (!x) { console.log(`| ${tag} | (no run) | | | | | |`); continue; }
      const c = countPops(x.frames, x.clips ?? [], QN), m = maxTurns(x);
      console.log(`| ${tag} | ${c.hard.length} | ${m.thigh.deg}° | ${m.knee.deg}° | ${m.hips.deg}° | ${m.spine.deg}° | ${m.arm.deg}° |`);
    }
  }
}
