// bvh-sheet — SEE what each of the owner's DeepMotion takes is before choosing clips from it
// (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14). The files are named IMG_0948 / My Movie 197, which says nothing.
//
// Per take: duration, a motion-energy strip (summed limb rotation change per 0.25 s), and a contact sheet of stick
// figures — FRONT (x,y) and SIDE (z,y) — at even times, rendered to PNG through the probes' browser (no new deps).
//
//   npx tsx scripts/mocap/bvh-sheet.mts OUT=~/Claude/outbox/everyone-body-mocap/takes <file.bvh> [...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright-core';
import type { Bvh, Quat } from '../../lib/babylon/anim/bvh.ts';
import * as bvhNs from '../../lib/babylon/anim/bvh.ts';
// tsx loads the lib file as CommonJS; its named exports sit on the default object when the lexer cannot see them
const B = ((bvhNs as unknown as { default?: typeof bvhNs }).default ?? bvhNs) as typeof bvhNs;
const { parseBvh, forwardKinematics, localRotation, jointIndex } = B;
import { chromiumExe } from '../probes/_chromium.mts';

const args = process.argv.slice(2);
const OUT = (args.find((a) => a.startsWith('OUT='))?.slice(4) ?? 'shots/bvh-sheet').replace(/^~/, process.env.HOME ?? '~');
const files = args.filter((a) => !a.startsWith('OUT='));
mkdirSync(OUT, { recursive: true });

const BONES: [string, string][] = [
  ['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'],
  ['Spine2', 'LeftShoulder'], ['LeftShoulder', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'],
  ['Spine2', 'RightShoulder'], ['RightShoulder', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'],
  ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'],
];
const LIMBS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine'];
const qAngle = (a: Quat, b: Quat) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

function energy(bvh: Bvh, bin = 0.25): number[] {
  const idx = LIMBS.map((n) => jointIndex(bvh, n)).filter((i) => i >= 0);
  const per = Math.max(1, Math.round(bin / bvh.frameTime));
  const out: number[] = [];
  let prev = idx.map((j) => localRotation(bvh, j, 0));
  let acc = 0;
  for (let f = 1; f < bvh.frames.length; f++) {
    const cur = idx.map((j) => localRotation(bvh, j, f));
    acc += cur.reduce((s, q, k) => s + qAngle(q, prev[k]), 0);
    prev = cur;
    if (f % per === 0) { out.push(acc); acc = 0; }
  }
  return out;
}

function sheet(bvh: Bvh, name: string): string {
  const dur = bvh.frames.length * bvh.frameTime;
  const cols = 12, n = Math.min(48, Math.max(12, Math.round(dur)));
  const rows = Math.ceil(n / cols);
  const cw = 110, ch = 150, head = 70;
  const W = cols * cw * 2, H = head + rows * ch;
  const e = energy(bvh), eMax = Math.max(...e, 1e-6);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#0b0f14;font:11px monospace">`;
  svg += `<text x="8" y="16" fill="#fff" font-size="14">${name} · ${dur.toFixed(1)} s · ${bvh.frames.length} f @ ${(1 / bvh.frameTime).toFixed(0)} fps · FRONT | SIDE</text>`;
  e.forEach((v, k) => {
    const x = 8 + (k / e.length) * (W - 16), h = (v / eMax) * 36;
    svg += `<rect x="${x.toFixed(1)}" y="${(60 - h).toFixed(1)}" width="${Math.max(1, (W - 16) / e.length - 0.5).toFixed(1)}" height="${h.toFixed(1)}" fill="#22d3ee"/>`;
  });
  const j = (nm: string) => jointIndex(bvh, nm);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * (dur / n);
    const f = Math.min(bvh.frames.length - 1, Math.floor(t / bvh.frameTime));
    const fk = forwardKinematics(bvh, f);
    const hips = fk.pos[j('Hips')];
    const cx0 = (k % cols) * cw * 2, cy0 = head + Math.floor(k / cols) * ch;
    const s = 0.62;   // cm → px
    for (const view of [0, 1]) {
      const ox = cx0 + view * cw + cw / 2, oy = cy0 + ch - 12;
      svg += `<rect x="${cx0 + view * cw + 1}" y="${cy0 + 1}" width="${cw - 2}" height="${ch - 2}" fill="none" stroke="#1f2937"/>`;
      for (const [a, b] of BONES) {
        const ia = j(a), ib = j(b); if (ia < 0 || ib < 0) continue;
        const pa = fk.pos[ia], pb = fk.pos[ib];
        const ax = view === 0 ? pa[0] - hips[0] : pa[2] - hips[2], bx = view === 0 ? pb[0] - hips[0] : pb[2] - hips[2];
        const col = a.startsWith('Left') || b.startsWith('Left') ? '#f472b6' : b.startsWith('Right') || a.startsWith('Right') ? '#4ade80' : '#e5e7eb';
        svg += `<line x1="${(ox + ax * s).toFixed(1)}" y1="${(oy - pa[1] * s).toFixed(1)}" x2="${(ox + bx * s).toFixed(1)}" y2="${(oy - pb[1] * s).toFixed(1)}" stroke="${col}" stroke-width="2"/>`;
      }
      if (view === 0) svg += `<text x="${cx0 + 4}" y="${cy0 + 12}" fill="#9ca3af">${t.toFixed(1)}s</text>`;
    }
  }
  return svg + '</svg>';
}

const browser = await chromium.launch({ executablePath: chromiumExe() });
const page = await browser.newPage();
const index: string[] = [];
const seen = new Set<string>();
for (const f of files) {
  const name = basename(f).replace(/_customModel.*$/, '').replace(/\.bvh$/, '');
  if (seen.has(name)) continue; seen.add(name);
  const bvh = parseBvh(readFileSync(f, 'utf8'));
  const svg = sheet(bvh, name);
  const safe = name.replace(/[^A-Za-z0-9_-]+/g, '_');
  writeFileSync(`${OUT}/${safe}.svg`, svg);
  await page.setContent(`<body style="margin:0;background:#0b0f14">${svg}</body>`);
  const el = await page.$('svg');
  await el!.screenshot({ path: `${OUT}/${safe}.png` });
  const hipsY = bvh.frames.map((_, i) => forwardKinematics(bvh, i).pos[0][1]);
  index.push(`${safe}\t${(bvh.frames.length * bvh.frameTime).toFixed(1)}s\thipsY ${Math.min(...hipsY).toFixed(0)}..${Math.max(...hipsY).toFixed(0)} cm\tjoints ${bvh.joints.length}`);
  console.log(index[index.length - 1]);
}
writeFileSync(`${OUT}/index.tsv`, index.join('\n') + '\n');
await browser.close();
