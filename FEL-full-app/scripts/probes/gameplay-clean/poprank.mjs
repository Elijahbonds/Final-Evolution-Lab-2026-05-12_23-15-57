// gameplay-clean: rank what is left of the hard pops, by mode, from the audit's saved recordings (no browser).
//   node poprank.mjs <dir> <tag> [--md]     reads <dir>/<mode>-<tag>-raw.json.gz
// Per mode: hard pop events per minute (popCount.mjs: reset frames skipped), split BLEND (a crossfade running or the clip set
// changing within ±2 frames: a transition's rule or timing, or a clip's fast first frames inside its fade) and IN-CLIP (one clip,
// steady: the clip's own keys — or a runtime layer, which the rig's ?noplant=1 / ?noposture=1 / ?nomotion=1 A/B tells apart),
// each with its biggest keys (clips and bones), and the largest one-frame turn of the thighs, knees, hips and arms off reset frames.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { countPops, qang, resetFrames } from './popCount.mjs';

const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const GROUPS = { thigh: [14, 15], knee: [16, 17], hips: [0], arm: [8, 9, 10, 11] };
const [DIR, TAG = 'sweep'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MD = process.argv.includes('--md');

export function rankOne(rec) {
  const F = rec.frames, clips = rec.clips ?? [];
  const r = countPops(F, clips, QN);
  const cl = (i) => String(clips[F[Math.max(0, Math.min(F.length - 1, i))].c] ?? '?');
  const by = { blend: {}, inclip: {} };
  for (const e of r.hard) {
    let blend = false;
    for (let i = e.i; i <= e.end && !blend; i++) for (let k = i - 2; k <= i + 2; k++) if (cl(k).includes('+') || cl(k) !== cl(i)) { blend = true; break; }
    const key = `${blend ? `${cl(e.i - 3)} → ${cl(e.end + 3)}` : cl(e.i)} [${[...e.bones].slice(0, 3).join('+')}]`;
    const b = by[blend ? 'blend' : 'inclip']; b[key] = (b[key] ?? 0) + 1;
  }
  const cut = resetFrames(F); const max = {};
  for (const [g, idx] of Object.entries(GROUPS)) {
    let m = 0;
    for (let i = 1; i < F.length; i++) {
      if (cut.has(i) || F[i].ph !== 'playing' || F[i - 1].ph !== 'playing' || !F[i].q || !F[i - 1].q) continue;
      for (const b of idx) { const a = qang(F[i].q[b], F[i - 1].q[b]); if (a !== null) m = Math.max(m, a); }
    }
    max[g] = Math.round(m * 10) / 10;
  }
  const n = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${v}× ${k}`).join(' · ');
  return { hard: r.hard.length, perMin: r.perMin(r.hard.length), blend: n(by.blend), inclip: n(by.inclip), resets: r.resetFrames, topBlend: top(by.blend), topInclip: top(by.inclip), max };
}

if (DIR) {
  const rows = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(`-${TAG}-raw.json.gz`)).sort()) {
    const mode = f.replace(`-${TAG}-raw.json.gz`, '');
    const { rec } = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString());
    rows.push({ mode, ...rankOne(rec) });
  }
  rows.sort((a, b) => b.perMin - a.perMin);
  if (MD) {
    console.log('| Mode | Hard pops/min | Blend | In-clip | Max turn a frame: thigh · knee · hips · arm | Biggest in-clip | Biggest blend |');
    console.log('|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.mode} | ${r.perMin} | ${r.blend} | ${r.inclip} | ${r.max.thigh}° · ${r.max.knee}° · ${r.max.hips}° · ${r.max.arm}° | ${r.topInclip || '–'} | ${r.topBlend || '–'} |`);
  } else for (const r of rows) console.log(`${r.mode.padEnd(18)} ${String(r.perMin).padStart(6)}/min  blend ${r.blend} in-clip ${r.inclip} resets ${r.resets}  max thigh ${r.max.thigh} knee ${r.max.knee} hips ${r.max.hips} arm ${r.max.arm}\n    in-clip: ${r.topInclip}\n    blend  : ${r.topBlend}`);
}
