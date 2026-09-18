// stream-sheet — a contact sheet for ANY mocap source (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14): the moves are picked by
// time window, and a window is only as good as the eye that picked it. Front + side stick figures every STEP seconds.
//
//   npx tsx scripts/mocap/stream-sheet.mts OUT=<dir> STEP=0.25 cmu:<file.bvh> ual:<file.glb>#<anim> deepmotion:<file.bvh>
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright-core';
import { readBvhStream, readGlbStream, type JointStream } from './sources.mts';
import { chromiumExe } from '../probes/_chromium.mts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
const OUT = opt('OUT', 'shots/stream-sheet').replace(/^~/, process.env.HOME ?? '~');
const STEP = Number(opt('STEP', '0.25'));
/** FROM= / TO= (seconds): a WINDOW of the take (dunk-finder, 2026-09-18) — the sheet names it, and the clip window is what you check. */
const FROM = Number(opt('FROM', '0')), TO = Number(opt('TO', '0'));
mkdirSync(OUT, { recursive: true });
const BONES: [string, string][] = [['Hips', 'Chest'], ['Chest', 'Neck'], ['Neck', 'Head'], ['Chest', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['Chest', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['LeftFoot', 'LeftToe'], ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['RightFoot', 'RightToe']];

function svgOf(s: JointStream, title: string): string {
  const dur = s.frames.length / s.fps, n = Math.max(1, Math.floor(dur / STEP));
  const cols = 16, cw = Number(opt('CW', '80')), ch = Number(opt('CH', '120')), rows = Math.ceil(n / cols);   // CW= / CH= (px): a jump + a reach wants a taller cell
  // scale: the first frame's hips→head to 50 px
  const f0 = s.frames[0], torso = Math.hypot(f0.Head[0] - f0.Hips[0], f0.Head[1] - f0.Hips[1], f0.Head[2] - f0.Hips[2]) || 1;
  const sc = Number(opt('PX', '48')) / torso;   // PX= : pixels per torso length
  const floor = Math.min(...s.frames.map((f) => Math.min(f.LeftFoot[1], f.RightFoot[1])));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch * 2 + 20}" style="background:#0b0f14;font:10px monospace"><text x="4" y="13" fill="#fff">${title} · ${dur.toFixed(2)} s · top FRONT(x) / bottom SIDE(z)</text>`;
  for (let k = 0; k < n; k++) {
    const t = k * STEP, fr = s.frames[Math.min(s.frames.length - 1, Math.round(t * s.fps))] as Record<string, [number, number, number]>;
    const cx = (k % cols) * cw + cw / 2, row = Math.floor(k / cols);
    for (const view of [0, 1]) {
      const oy = 20 + row * ch * 2 + view * ch + ch - 8;
      svg += `<rect x="${(k % cols) * cw + 1}" y="${oy - ch + 9}" width="${cw - 2}" height="${ch - 2}" fill="none" stroke="#1f2937"/>`;
      if (view === 0) svg += `<text x="${(k % cols) * cw + 3}" y="${oy - ch + 20}" fill="#9ca3af">${t.toFixed(2)}</text>`;
      for (const [a, b] of BONES) {
        const pa = fr[a], pb = fr[b], hx = fr.Hips[view === 0 ? 0 : 2];
        const ax = (view === 0 ? pa[0] : pa[2]) - hx, bx = (view === 0 ? pb[0] : pb[2]) - hx;
        const col = a.startsWith('Left') || b.startsWith('Left') ? '#f472b6' : a.startsWith('Right') || b.startsWith('Right') ? '#4ade80' : '#e5e7eb';
        svg += `<line x1="${(cx + ax * sc).toFixed(1)}" y1="${(oy - (pa[1] - floor) * sc).toFixed(1)}" x2="${(cx + bx * sc).toFixed(1)}" y2="${(oy - (pb[1] - floor) * sc).toFixed(1)}" stroke="${col}" stroke-width="2"/>`;
      }
    }
  }
  return svg + '</svg>';
}

const browser = await chromium.launch({ executablePath: chromiumExe() });
const page = await browser.newPage();
for (const spec of args.filter((a) => /^(cmu|ual|deepmotion|meshy):/.test(a))) {
  const [kind, rest] = [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)];
  const [file, anim] = rest.split('#');
  let s = kind === 'ual' || kind === 'meshy' ? await readGlbStream(file, anim, 30, kind) : readBvhStream(file, kind as 'cmu' | 'deepmotion');
  if (TO > FROM) s = { ...s, frames: s.frames.slice(Math.round(FROM * s.fps), Math.round(TO * s.fps)) };
  const title = `${kind}:${basename(file)}${anim ? '#' + anim : ''}${TO > FROM ? ` ${FROM}-${TO}s` : ''}`;
  const safe = title.replace(/[^A-Za-z0-9_-]+/g, '_');
  await page.setContent(`<body style="margin:0;background:#0b0f14">${svgOf(s, title)}</body>`);
  await (await page.$('svg'))!.screenshot({ path: `${OUT}/${safe}.png` });
  console.log(`${safe}.png  ${(s.frames.length / s.fps).toFixed(2)}s @ ${s.fps.toFixed(0)} fps`);
}
await browser.close();
