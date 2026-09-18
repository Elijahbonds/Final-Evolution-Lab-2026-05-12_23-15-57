// bvh-segments — cut the owner's DeepMotion takes into MOVES and describe each one in body terms
// (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
//
// A segment is a run of motion energy above the take's floor (limb rotation change, smoothed), 0.4–3.5 s long.
// Each gets features read off forward kinematics, all in body-relative units so a 170 cm and a 190 cm capture compare:
//   crouch   — standing hips height minus the segment's lowest, over leg length
//   spread   — widest ankle separation over leg length
//   handUp   — highest wrist above the head, over leg length (a block, a shot release, a celebration)
//   reach    — furthest wrist in front of / beside the hips horizontally, over leg length (a punch, a steal)
//   jump     — lowest ankle's rise off the take's floor, cm
//   lateral / forward — hips travel over the segment across / along the take's facing, over leg length
//   kick     — highest ankle, over leg length
//   flip     — the hips' largest tilt off vertical, degrees (a take whose root tumbles is capture noise or tricking)
//   jitter   — the median per-frame wrist jump in cm (video mocap noise; high = unusable)
// It also writes a strip of 8 FRONT stick figures per segment so a shortlist can be LOOKED at.
//
//   npx tsx scripts/mocap/bvh-segments.mts OUT=<dir> <file.bvh> [...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import type { Bvh, Quat, Vec3 } from '../../lib/babylon/anim/bvh.ts';
import * as bvhNs from '../../lib/babylon/anim/bvh.ts';
const B = ((bvhNs as unknown as { default?: typeof bvhNs }).default ?? bvhNs) as typeof bvhNs;
const { parseBvh, forwardKinematics, localRotation, jointIndex, qRot } = B;

const args = process.argv.slice(2);
const OUT = (args.find((a) => a.startsWith('OUT='))?.slice(4) ?? 'shots/bvh-segments').replace(/^~/, process.env.HOME ?? '~');
const files = args.filter((a) => !a.startsWith('OUT='));
mkdirSync(OUT, { recursive: true });

const LIMBS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine'];
const qAngle = (a: Quat, b: Quat) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export interface Segment {
  take: string; id: string; t0: number; t1: number;
  crouch: number; spread: number; handUp: number; reach: number; jump: number; lateral: number; forward: number;
  kick: number; flip: number; jitter: number; guess: string;
}

function guess(s: Omit<Segment, 'guess'>): string {
  if (s.flip > 70 || s.jitter > 4 || s.spread > 1.6 || s.jump > 120) return 'noise/tumble';
  if (s.jump > 35 && s.handUp > 0.25) return 'jump-reach (block/dunk/shot)';
  if (s.jump > 35) return 'jump';
  if (s.kick > 0.75) return 'kick';
  if (s.reach > 0.62 && s.handUp < 0.1) return 'strike/reach';
  if (s.handUp > 0.3) return 'hands-up (shot/celebrate/contest)';
  if (Math.abs(s.lateral) > 0.6 && s.crouch > 0.12) return 'lateral shuffle (defense slide?)';
  if (Math.abs(s.forward) > 1.2) return 'travel (run/walk)';
  if (s.crouch > 0.18 && s.spread > 0.5) return 'low wide stance';
  return 'gesture/other';
}

const all: Segment[] = [];
const seen = new Set<string>();
for (const f of files) {
  const take = basename(f).replace(/_customModel.*$/, '').replace(/\.bvh$/, '');
  if (seen.has(take)) continue; seen.add(take);
  const bvh: Bvh = parseBvh(readFileSync(f, 'utf8'));
  const J = (n: string) => jointIndex(bvh, n);
  const iH = J('Hips'), iHead = J('Head'), iLH = J('LeftHand'), iRH = J('RightHand'), iLF = J('LeftFoot'), iRF = J('RightFoot'), iLU = J('LeftUpLeg');
  const N = bvh.frames.length, dt = bvh.frameTime;
  const fk = Array.from({ length: N }, (_, i) => forwardKinematics(bvh, i));
  const leg = dist(fk[0].pos[iLU], fk[0].pos[iLF]) || 90;
  // standing hips height: a high percentile of hips-above-lowest-ankle
  const hipsAbove = fk.map((k) => k.pos[iH][1] - Math.min(k.pos[iLF][1], k.pos[iRF][1]));
  const standH = [...hipsAbove].sort((a, b) => a - b)[Math.floor(N * 0.8)] ?? hipsAbove[0];
  const floor = median(fk.map((k) => Math.min(k.pos[iLF][1], k.pos[iRF][1])));
  // energy, smoothed over ~0.2 s
  const idx = LIMBS.map(J).filter((i) => i >= 0);
  const e = new Array(N).fill(0);
  let prev = idx.map((j) => localRotation(bvh, j, 0));
  for (let i = 1; i < N; i++) { const cur = idx.map((j) => localRotation(bvh, j, i)); e[i] = cur.reduce((s, q, k) => s + qAngle(q, prev[k]), 0) / dt; prev = cur; }
  const w = Math.max(1, Math.round(0.1 / dt));
  const es = e.map((_, i) => { let s = 0, n = 0; for (let k = i - w; k <= i + w; k++) if (k >= 0 && k < N) { s += e[k]; n++; } return s / n; });
  const thr = median(es) * 1.25;
  let k = 0, segN = 0;
  while (k < N) {
    if (es[k] <= thr) { k++; continue; }
    let a = k; while (k < N && es[k] > thr) k++;
    let b = k;
    // pad a little so the move has its lead-in and settle
    a = Math.max(0, a - Math.round(0.12 / dt)); b = Math.min(N - 1, b + Math.round(0.12 / dt));
    const len = (b - a) * dt;
    if (len < 0.4) continue;
    if (len > 3.5) b = a + Math.round(3.5 / dt);
    const r = fk.slice(a, b + 1);
    const face0 = qRot(r[0].rot[iH], [0, 0, 1]);           // hips facing at the start
    const fwd: Vec3 = [face0[0], 0, face0[2]]; const fl = Math.hypot(fwd[0], fwd[2]) || 1; fwd[0] /= fl; fwd[2] /= fl;
    const side: Vec3 = [fwd[2], 0, -fwd[0]];
    const d: Vec3 = [r[r.length - 1].pos[iH][0] - r[0].pos[iH][0], 0, r[r.length - 1].pos[iH][2] - r[0].pos[iH][2]];
    const seg = {
      take, id: `${take.replace(/[^A-Za-z0-9]+/g, '_')}_s${String(segN++).padStart(2, '0')}`, t0: +(a * dt).toFixed(2), t1: +(b * dt).toFixed(2),
      crouch: +((standH - Math.min(...r.map((x, i2) => x.pos[iH][1] - Math.min(x.pos[iLF][1], x.pos[iRF][1])))) / leg).toFixed(2),
      spread: +(Math.max(...r.map((x) => Math.hypot(x.pos[iLF][0] - x.pos[iRF][0], x.pos[iLF][2] - x.pos[iRF][2]))) / leg).toFixed(2),
      handUp: +(Math.max(...r.map((x) => Math.max(x.pos[iLH][1], x.pos[iRH][1]) - x.pos[iHead][1])) / leg).toFixed(2),
      reach: +(Math.max(...r.map((x) => Math.max(Math.hypot(x.pos[iLH][0] - x.pos[iH][0], x.pos[iLH][2] - x.pos[iH][2]), Math.hypot(x.pos[iRH][0] - x.pos[iH][0], x.pos[iRH][2] - x.pos[iH][2])))) / leg).toFixed(2),
      jump: +(Math.max(...r.map((x) => Math.min(x.pos[iLF][1], x.pos[iRF][1]))) - floor).toFixed(0),
      lateral: +((d[0] * side[0] + d[2] * side[2]) / leg).toFixed(2),
      forward: +((d[0] * fwd[0] + d[2] * fwd[2]) / leg).toFixed(2),
      kick: +(Math.max(...r.map((x) => Math.max(x.pos[iLF][1], x.pos[iRF][1]) - Math.min(x.pos[iLF][1], x.pos[iRF][1]))) / leg).toFixed(2),
      flip: +Math.max(...r.map((x) => { const up = qRot(x.rot[iH], [0, 1, 0]); return (Math.acos(Math.max(-1, Math.min(1, up[1]))) * 180) / Math.PI; })).toFixed(0),
      // tracking noise, not speed: the wrist's second difference relative to the hips, resampled to a 30 fps step
      jitter: +median(r.slice(2).map((x, i2) => { const st = Math.max(1, Math.round((1 / 30) / dt)); const a0 = r[i2], a1 = r[Math.min(r.length - 1, i2 + st)], a2 = r[Math.min(r.length - 1, i2 + 2 * st)]; const rel = (q: typeof x) => [q.pos[iRH][0] - q.pos[iH][0], q.pos[iRH][1] - q.pos[iH][1], q.pos[iRH][2] - q.pos[iH][2]]; const p0 = rel(a0), p1 = rel(a1), p2 = rel(a2); return Math.hypot(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1], p2[2] - 2 * p1[2] + p0[2]); })).toFixed(1),
    };
    all.push({ ...seg, guess: guess(seg) });
    // strip
    const cw = 90, ch = 130; let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw * 8}" height="${ch + 18}" style="background:#0b0f14;font:10px monospace"><text x="4" y="12" fill="#fff">${seg.id} ${seg.t0}-${seg.t1}s · ${all[all.length - 1].guess}</text>`;
    const BONES: [number, number][] = [['Hips', 'Spine2'], ['Spine2', 'Head'], ['Spine2', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['Spine2', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot']].map(([p, q]) => [J(p), J(q)]);
    for (let s = 0; s < 8; s++) {
      const x = r[Math.floor((s / 7) * (r.length - 1))]; const hp = x.pos[iH];
      const ox = s * cw + cw / 2, oy = ch + 10; const sc = 0.55;
      for (const [p, q] of BONES) {
        if (p < 0 || q < 0) continue;
        const col = bvh.joints[q].name.startsWith('Left') ? '#f472b6' : bvh.joints[q].name.startsWith('Right') ? '#4ade80' : '#e5e7eb';
        svg += `<line x1="${(ox + (x.pos[p][0] - hp[0]) * sc).toFixed(1)}" y1="${(oy - (x.pos[p][1] - floor) * sc).toFixed(1)}" x2="${(ox + (x.pos[q][0] - hp[0]) * sc).toFixed(1)}" y2="${(oy - (x.pos[q][1] - floor) * sc).toFixed(1)}" stroke="${col}" stroke-width="2"/>`;
      }
    }
    writeFileSync(`${OUT}/${seg.id}.svg`, svg + '</svg>');
  }
}
writeFileSync(`${OUT}/segments.json`, JSON.stringify(all, null, 1));
const by = new Map<string, number>(); for (const s of all) by.set(s.guess, (by.get(s.guess) ?? 0) + 1);
console.log(`${all.length} segments from ${seen.size} takes`); for (const [g, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), g);
