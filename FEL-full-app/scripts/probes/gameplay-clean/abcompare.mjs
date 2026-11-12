// gameplay-clean: an A/B of two tags on the same build, per mode (no browser).
//   node abcompare.mjs <dir> <tagA> <tagB> [--md]        reads <dir>/<mode>-<tag>-raw.json.gz
// Per mode: hard pop events (popCount.mjs, reset frames skipped) A → B, all pop events, the largest one-frame turn of the thighs,
// knees, hips, spine and arms off reset frames, and the BLEND SHARE of each run: the share of playing frames on which two or more of
// the hero's clips are weighted between 0.02 and 0.98. The inertial blend switches clips at once, so an inertial run reads ~0 there:
// that is how a run proves the knob it asked for (`&feel=anim.inertial:1`) really took (it is read once, at spawn). A run recorded
// before clean-5's weights (`cwv` missing) reads "?".
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { countPops } from './popCount.mjs';
import { QN, maxTurns } from './popdetail.mjs';

const args = process.argv.slice(2); const [DIR, A, B] = args.filter((a) => !a.startsWith('--')); const MD = args.includes('--md');
const load = (mode, tag) => { const f = path.join(DIR, `${mode}-${tag}-raw.json.gz`); return fs.existsSync(f) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()).rec : null; };
export function blendShare(rec) {
  if (rec.cwv !== 2) return null;
  const P = rec.frames.filter((f) => f.ph === 'playing' && f.cw);
  if (!P.length) return 0;
  return P.filter((f) => f.cw.filter(([, w]) => w > 0.02 && w < 0.98).length >= 2).length / P.length;
}
function summary(rec) {
  const c = countPops(rec.frames, rec.clips ?? [], QN), m = maxTurns(rec), b = blendShare(rec);
  return { hard: c.hard.length, all: c.events.length, m, blend: b === null ? '?' : `${Math.round(b * 100)}%` };
}
if (DIR && A && B) {
  const modes = [...new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(`-${A}-raw.json.gz`)).map((f) => f.replace(`-${A}-raw.json.gz`, '')))].sort();
  const rows = [];
  for (const mode of modes) { const a = load(mode, A), b = load(mode, B); if (!a || !b) continue; rows.push({ mode, a: summary(a), b: summary(b) }); }
  rows.sort((x, y) => (y.a.hard - y.b.hard) - (x.a.hard - x.b.hard));
  const t = (s) => `${s.m.thigh.deg}° · ${s.m.knee.deg}° · ${s.m.hips.deg}° · ${s.m.spine.deg}° · ${s.m.arm.deg}°`;
  if (MD) {
    console.log(`| Mode | Hard pops ${A} → ${B} | All pop events | Max turn a frame: thigh · knee · hips · spine · arm (${A} → ${B}) | Blend share ${A} / ${B} |`);
    console.log('|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.mode} | ${r.a.hard} → **${r.b.hard}** | ${r.a.all} → ${r.b.all} | ${t(r.a)} → ${t(r.b)} | ${r.a.blend} / ${r.b.blend} |`);
  } else for (const r of rows) console.log(`${r.mode.padEnd(17)} hard ${String(r.a.hard).padStart(2)} → ${String(r.b.hard).padStart(2)}   all ${String(r.a.all).padStart(2)} → ${String(r.b.all).padStart(2)}   blend ${r.a.blend.padStart(4)} / ${r.b.blend.padStart(4)}   ${t(r.a)}  →  ${t(r.b)}`);
  const sa = rows.reduce((s, r) => s + r.a.hard, 0), sb = rows.reduce((s, r) => s + r.b.hard, 0);
  console.log(`total hard pops over ${rows.length} modes: ${sa} → ${sb}; modes worse: ${rows.filter((r) => r.b.hard > r.a.hard).map((r) => `${r.mode} (${r.a.hard} → ${r.b.hard})`).join(', ') || 'none'}`);
}
