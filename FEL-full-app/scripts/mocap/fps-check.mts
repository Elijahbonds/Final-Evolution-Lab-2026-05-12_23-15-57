// fps-check — is a cgspeed CMU subject really the 120 fps its header says? (HOOPS MOTION phase 2b, 2026-09-25)
//
// Every cgspeed header carries `Frame Time: 0.00833333`, but CMU captured some subjects at 60 Hz. Two things in the
// motion cannot lie about the time base:
//   - GRAVITY: a body in the air falls at 9.8 m/s². A parabola fitted over a real flight gives ~9.8 at the true rate and
//     4× that (~39) when a 60-fps file is read at 120 (g scales with the square of the rate).
//       · HIPS: the mid-thighs' height, the fit lib/pose/synth.test.ts gates (scripts/body/synth-streams.mts gravityFit).
//       · COM: the whole-body centre of mass (de Leva 1996 segment masses and centres), printed beside it.
//   - CADENCE: the hips bob once per step. A person runs at 150–200 steps per minute; a 60-fps run read at 120 shows
//     330–400, which no human does, and a 120-fps run read at 60 shows < 100 with flight phases, which no human does
//     either. Cadence is a pure time measure: no body scale in it.
// A flight is both feet ≥ 4 cm over their own LOCAL floor (the foot's 5th percentile within ±1 s), both hands ≥ 30 cm up
// (no cartwheels / handstands), ≥ 8 header frames, with the hips travelling ≥ 4 cm; the middle 70% is fitted (touch-down
// and toe-off frames trimmed). A standing wobble that slips through fits g ≈ 0, so flights under 3 m/s² at the header rate
// are dropped (a real flight fits ≥ 9 at either rate). Body scale: the leg to 0.82 m, the retarget's own ruler (cgspeed
// retargeted every subject onto one Daz skeleton, leg 82.2 cm, so the scale is the same for all of them).
//
// JUMPS vs RUN STRIDES. The flights are split by the trial: a file the CMU index calls a run (and not also a jump, dive,
// vault or duck) gives STRIDE flights (70–170 ms), every other file gives jumps, hops and flips. A stride flight's fit scatters and reads HIGH: on the
// subjects where both exist, the strides read ~12–16 at the rate their jumps put at ~10 (141, 143: the run trials against
// the jump trials). So the 9.8 ± 1.5 band is read on the jump flights, the fit synth.test.ts gates; a subject with only
// stride flights (78: runs, moves, drills, no jump) is marked "strides only" and settled by the vote and the cadence.
// 120 vs 60 are 4× apart in g, so the vote (each flight nearer 9.81 at the header rate or at half of it) settles the
// time base where one flight cannot.
//
//   node node_modules/tsx/dist/cli.mjs scripts/mocap/fps-check.mts [06,75,78,88,124,141,143] [--files] [--json out.json]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bvhNs from '../../lib/babylon/anim/bvh.ts';
import { trueFps } from './sources.mts';
const B = ((bvhNs as unknown as { default?: typeof bvhNs }).default ?? bvhNs) as typeof bvhNs;
const ROOT = join(process.env.HOME ?? '', 'Downloads/fel-mocap-sources');
type V3 = [number, number, number];
const args = process.argv.slice(2);
const subjects = (args.find((a) => !a.startsWith('--')) ?? '06,75,78,88,124,141,143').split(',');
const perFile = args.includes('--files');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const index = existsSync(join(ROOT, 'cmu-index.txt')) ? readFileSync(join(ROOT, 'cmu-index.txt'), 'utf8') : '';
const isRun = (trial: string) => new RegExp(`^${trial}\\t.*run`, 'im').test(index);
/** a PURE run trial (its flights are strides): a run the index does not also call a jump, dive, vault or duck */
const isStride = (trial: string) => isRun(trial) && !new RegExp(`^${trial}\\t.*(jump|dive|over|duck|roll|flip)`, 'im').test(index);

/** least-squares parabola y = a t² + b t + c → g = −2a */
function fitG(pts: [number, number][]): number {
  const tm = pts.reduce((s, [t]) => s + t, 0) / pts.length;
  const P = pts.map(([t, y]) => [t - tm, y] as const);
  const S = (p: number) => P.reduce((s, [t]) => s + t ** p, 0), Y = (p: number) => P.reduce((s, [t, y]) => s + t ** p * y, 0);
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[S(4), S(3), S(2)], [S(3), S(2), S(1)], [S(2), S(1), P.length]];
  return -2 * det([[Y(2), S(3), S(2)], [Y(1), S(2), S(1)], [Y(0), S(1), P.length]]) / det(M);
}
// de Leva (1996) male segment masses (fraction of the body) and centres (fraction from the proximal joint)
const SEG: [string, string, number, number][] = [
  // [proximal, distal, mass, centre]
  ['hip', 'abdomen', 0.1117, 0.5], ['abdomen', 'chest', 0.1633, 0.5], ['chest', 'neck', 0.1596, 0.5], ['head', 'EYES', 0.0694, 0.5],
  ...(['l', 'r'] as const).flatMap((s) => [
    [`${s}Shldr`, `${s}ForeArm`, 0.0271, 0.5772], [`${s}ForeArm`, `${s}Hand`, 0.0162, 0.4574], [`${s}Hand`, `${s}Hand`, 0.0061, 0],
    [`${s}Thigh`, `${s}Shin`, 0.1416, 0.4095], [`${s}Shin`, `${s}Foot`, 0.0433, 0.4459], [`${s}Foot`, `${s}FootEnd`, 0.0137, 0.5],
  ] as [string, string, number, number][]),
];

interface Flight { file: string; frames: number; hips: number; com: number; run: boolean }
interface Sub { files: number; flights: Flight[]; cad: number[]; headerFps: number }
const report: Record<string, unknown> = {};
const row = (label: string, s: Sub) => {
  // the rate sources.mts reads this subject at (trueFps: the table rescales the header's own rate), and its nominal value
  const rate = trueFps(`cmu/${label}/${label}_01.bvh`, 'cmu', s.headerFps), table = Math.round(rate), k2 = (rate / s.headerFps) ** 2;
  const m = (xs: number[], mul = 1) => (xs.length ? `${(q(xs, 0.5) * mul).toFixed(1)} (${(q(xs, 0.25) * mul).toFixed(1)}–${(q(xs, 0.75) * mul).toFixed(1)})` : '—');
  const hips = s.flights.map((f) => f.hips), com = s.flights.map((f) => f.com);
  const jumps = s.flights.filter((f) => !f.run).map((f) => f.hips), strides = s.flights.filter((f) => f.run).map((f) => f.hips);
  // each flight VOTES for the rate its fit is nearer 9.81 at (in ratio): the header's, or half of it (g/4 → 4 g apart, so the
  // boundary is 2 × 9.81 at the header rate)
  const at120 = hips.filter((g) => g < 2 * 9.81).length;
  const basis = jumps.length ? jumps : strides;
  const g = basis.length ? q(basis, 0.5) * k2 : NaN;
  const band = basis.length ? `${Math.abs(g - 9.8) <= 1.5 ? 'in' : 'OUT'}${jumps.length ? '' : ' (strides only)'}` : '—';
  report[label] = { files: s.files, flights: s.flights.length, headerFps: s.headerFps, tableFps: rate, votes120: at120, votes60: hips.length - at120,
    hipsAtHeader: q(hips, 0.5), comAtHeader: q(com, 0.5), hipsAtTable: q(hips, 0.5) * k2, comAtTable: q(com, 0.5) * k2,
    jumpFlights: jumps.length, jumpsAtTable: q(jumps, 0.5) * k2, strideFlights: strides.length, stridesAtTable: q(strides, 0.5) * k2,
    band, cadenceAtHeader: q(s.cad, 0.5), cadenceAtTable: q(s.cad, 0.5) * rate / s.headerFps, runTrials: s.cad.length, perFlight: s.flights };
  return `${label.padEnd(8)} ${String(s.files).padStart(5)} ${String(s.flights.length).padStart(7)}   ${m(hips).padEnd(18)} ${m(com).padEnd(18)} ${hips.length ? `${at120} : ${hips.length - at120}` : '—'}`.padEnd(76) +
    ` ${String(table).padStart(5)}   ${m(hips, k2).padEnd(18)} ${m(com, k2).padEnd(18)} ${`${m(jumps, k2)} n${jumps.length}`.padEnd(24)} ${`${m(strides, k2)} n${strides.length}`.padEnd(24)} ${band.padEnd(20)} ${
    s.cad.length ? `${q(s.cad, 0.5).toFixed(0)} → ${(q(s.cad, 0.5) * rate / s.headerFps).toFixed(0)} (${s.cad.length} runs)` : '— (no run trial)'}`;
};

console.log('gravity, m/s², median (p25–p75) of one parabola per real flight — HIPS (the fit synth.test.ts gates) and the whole-body COM.');
console.log('votes = flights nearer 9.81 at the header rate : nearer 9.81 at half of it. "table" = the rate sources.mts trueFps reads the');
console.log('subject at. JUMPS = flights in trials the CMU index does not call a run; STRIDES = flights in run trials. The band is');
console.log('9.8 ± 1.5 on the HIPS median of the jumps at the table rate (of the strides when a subject has no jump, marked).');
console.log('subject  files flights   HIPS @header       COM @header        votes 120:60  table   HIPS @table        COM @table         JUMPS @table             STRIDES @table           9.8±1.5              run cadence header → table (steps/min)');
for (const subj of subjects) {
  const dir = join(ROOT, 'cmu', subj);
  if (!existsSync(dir)) { console.log(`${subj.padEnd(8)} MISSING (${dir})`); continue; }
  const files = readdirSync(dir).filter((f) => f.endsWith('.bvh')).sort();
  const acc: Sub = { files: files.length, flights: [], cad: [], headerFps: 120 };
  for (const f of files) {
    const bvh = B.parseBvh(readFileSync(join(dir, f), 'utf8'));
    const fps = 1 / bvh.frameTime; acc.headerFps = fps;
    const ix = (n: string) => B.jointIndex(bvh, n);
    const J = { lT: ix('lThigh'), rT: ix('rThigh'), lS: ix('lShin'), lF: ix('lFoot'), rF: ix('rFoot'), lE: ix('lFootEnd'), rE: ix('rFootEnd'), lH: ix('lHand'), rH: ix('rHand') };
    const eyes = [ix('leftEye'), ix('rightEye')];
    const seg = SEG.map(([a, b, m, c]) => ({ a: ix(a), b: b === 'EYES' ? -1 : ix(b), m, c }));
    const rows = bvh.frames.map((_, i) => {
      const fk = B.forwardKinematics(bvh, i); const p = (k: number) => fk.pos[k] as V3;
      let com = 0;
      for (const s of seg) { const ya = p(s.a)[1], yb = s.b < 0 ? (p(eyes[0])[1] + p(eyes[1])[1]) / 2 : p(s.b)[1]; com += s.m * (ya + s.c * (yb - ya)); }
      return { y: (p(J.lT)[1] + p(J.rT)[1]) / 2, com, l: Math.min(p(J.lF)[1], p(J.lE)[1]), r: Math.min(p(J.rF)[1], p(J.rE)[1]), h: Math.min(p(J.lH)[1], p(J.rH)[1]), leg: Math.hypot(...[0, 1, 2].map((k) => p(J.lT)[k] - p(J.lS)[k])) + Math.hypot(...[0, 1, 2].map((k) => p(J.lS)[k] - p(J.lF)[k])) };
    }).slice(1);   // frame 0 is cgspeed's T-pose
    const S = 0.82 / rows[0].leg;   // source units → metres by the leg (the retarget's own scale)
    // the floor is LOCAL (each foot's 5th percentile within ±1 s): a long take's floor drifts by 3–6 cm and a marker glitch
    // dips 8 cm under it, so one floor for the whole file (the 2nd percentile) read a standing foot as 4 cm up and a
    // freestyle dribble's stance as a "flight" (06_13: four at 6–8 m/s², which is no free fall at either rate)
    const localFloor = (xs: number[]) => { const w = Math.round(fps); return xs.map((_, i) => q(xs.slice(Math.max(0, i - w), i + w + 1), 0.05)); };
    const fl = localFloor(rows.map((r) => r.l)), fr = localFloor(rows.map((r) => r.r));
    const up = rows.map((r, i) => r.l > fl[i] + 0.04 / S && r.r > fr[i] + 0.04 / S && r.h > Math.min(fl[i], fr[i]) + 0.30 / S);
    const fh: number[] = [], fc: number[] = [], fn: number[] = []; let a = -1;
    for (let i = 0; i <= up.length; i++) {
      if (i < up.length && up[i]) { if (a < 0) a = i; continue; }
      if (a >= 0) {
        const b = i - 1;
        if (b - a + 1 >= 8) {
          const ys = rows.slice(a, b + 1).map((r) => r.y * S);
          if (Math.max(...ys) - Math.min(...ys) >= 0.04) {
            const m = Math.round((b - a) * 0.15); const ph: [number, number][] = [], pc: [number, number][] = [];
            for (let k = a + m; k <= b - m; k++) { ph.push([k / fps, rows[k].y * S]); pc.push([k / fps, rows[k].com * S]); }
            const gh = fitG(ph), gc = fitG(pc);
            if (Math.max(gh, gc) >= 3) { fh.push(gh); fc.push(gc); fn.push(b - a + 1); }
          }
        }
        a = -1;
      }
    }
    const trial = f.replace('.bvh', ''), run = isRun(trial), stride = isStride(trial);
    fh.forEach((g, k) => acc.flights.push({ file: f, frames: fn[k], hips: +g.toFixed(2), com: +fc[k].toFixed(2), run: stride }));
    // cadence: the hips bob once per step — the first autocorrelation peak of hipsY (lags 4..n/2) is the step period
    let cad = NaN;
    if (run) {
      const y = rows.map((r) => r.y * S), mean = y.reduce((s, v) => s + v, 0) / y.length, yc = y.map((v) => v - mean);
      const ac = (lag: number) => { let s = 0, n = 0; for (let i = 0; i + lag < yc.length; i++) { s += yc[i] * yc[i + lag]; n++; } return s / (n || 1); };
      const a0 = ac(0) || 1; let best = -1, bestLag = 0;
      for (let lag = 4; lag <= Math.floor(yc.length / 2); lag++) { const v = ac(lag) / a0; if (v > best && v > ac(lag - 1) / a0 && v >= ac(lag + 1) / a0) { best = v; bestLag = lag; } }
      if (bestLag && best > 0.3) { cad = (60 * fps) / bestLag; acc.cad.push(cad); }
    }
    if (perFile && (fc.length || Number.isFinite(cad))) console.log(`  ${subj}/${f.padEnd(11)} ${String(rows.length).padStart(5)} fr  flights hips/COM at the header (frames) ${fh.map((g, k) => `${g.toFixed(0)}/${fc[k].toFixed(0)}(${fn[k]})`).join(' ').padEnd(48)} ${Number.isFinite(cad) ? `run cadence ${cad.toFixed(0)} spm at the header rate` : ''}`);
  }
  console.log(row(subj, acc));
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(report, null, 1)); console.log(`wrote ${jsonOut}`); }
