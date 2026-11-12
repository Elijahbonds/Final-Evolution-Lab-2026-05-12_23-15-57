// switch-on (2026-11-10): an A/B table of the gameplay-clean rig's recordings, several runs a side, with the control that the knob
// really went active. Reads <dir>/<mode>-<tag>-raw.json.gz (audit.mjs); tags are grouped by their prefix before the run number
// (off1, off2 → off; on1, on2 → on).
//   SO_DIR=<dir> node scripts/probes/switch-on/abtable.mjs [--md]
// Per mode and side: the hard pops in each run (popCount.mjs, the reset-aware counter) and their sum per minute of play, the
// largest one-frame turn (thigh · knee · arm, reset frames left out), and the control: the share of playing frames with a hero clip
// at a weight strictly between 0.05 and 0.95 (a linear crossfade in flight). The inertial blend never shows one (a switch puts the
// new clip at weight 1 at once), so an "on" run that still shows them did not take the knob.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { countPops, qang, resetFrames } from '../gameplay-clean/popCount.mjs';

const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const GROUPS = { thigh: [14, 15], knee: [16, 17], arm: [8, 9, 10, 11] };
const DIR = process.env.SO_DIR; const MD = process.argv.includes('--md');
if (!DIR) { console.error('SO_DIR=<dir> node abtable.mjs'); process.exit(2); }

function one(rec) {
  const F = rec.frames, r = countPops(F, rec.clips ?? [], QN), cut = resetFrames(F);
  const max = {};
  for (const [g, idx] of Object.entries(GROUPS)) {
    let m = 0;
    for (let i = 1; i < F.length; i++) {
      if (cut.has(i) || F[i].ph !== 'playing' || F[i - 1].ph !== 'playing' || !F[i].q || !F[i - 1].q) continue;
      for (const b of idx) { const a = qang(F[i].q[b], F[i - 1].q[b]); if (a !== null) m = Math.max(m, a); }
    }
    max[g] = m;
  }
  const play = F.filter((f) => f.ph === 'playing');
  const mid = rec.cwv === 2 ? play.filter((f) => (f.cw ?? []).some(([, w]) => w > 0.05 && w < 0.95)).length / Math.max(1, play.length) : NaN;
  return { hard: r.hard.length, playN: play.length, max, mid };
}

const runs = {};
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('-raw.json.gz'))) {
  const m = f.match(/^(.+)-([a-z]+)(\d+)-raw\.json\.gz$/); if (!m) continue;
  const [, mode, side, n] = m;
  const { rec } = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString());
  ((runs[mode] ??= {})[side] ??= []).push({ n, ...one(rec) });
}
const r1 = (x) => Math.round(x * 10) / 10;
const side = (rs) => {
  if (!rs?.length) return null;
  const hard = rs.reduce((a, r) => a + r.hard, 0), min = rs.reduce((a, r) => a + r.playN, 0) / 3600;
  const mx = (g) => r1(Math.max(...rs.map((r) => r.max[g])));
  return { runs: rs.map((r) => r.hard).join('+'), perMin: r1(hard / Math.max(1e-6, min)), max: `${mx('thigh')}° · ${mx('knee')}° · ${mx('arm')}°`, mid: rs.map((r) => `${Math.round(r.mid * 100)}%`).join('/') };
};
const sides = [...new Set(Object.values(runs).flatMap((o) => Object.keys(o)))].sort();
if (MD) {
  console.log(`| Mode | ${sides.map((s) => `${s}: hard pops (runs) · per min`).join(' | ')} | ${sides.map((s) => `${s}: max turn thigh · knee · arm`).join(' | ')} | ${sides.map((s) => `${s}: crossfade frames`).join(' | ')} |`);
  console.log(`|---|${sides.map(() => '---|').join('').repeat(3)}`);
}
for (const mode of Object.keys(runs).sort()) {
  const S = sides.map((s) => side(runs[mode][s]));
  if (MD) console.log(`| ${mode} | ${S.map((x) => (x ? `${x.runs} · ${x.perMin}` : '–')).join(' | ')} | ${S.map((x) => x?.max ?? '–').join(' | ')} | ${S.map((x) => x?.mid ?? '–').join(' | ')} |`);
  else console.log(`${mode.padEnd(14)} ${sides.map((s, i) => `${s}: ${S[i] ? `${S[i].runs} (${S[i].perMin}/min) max ${S[i].max} xfade ${S[i].mid}` : '–'}`).join('   ')}`);
}
