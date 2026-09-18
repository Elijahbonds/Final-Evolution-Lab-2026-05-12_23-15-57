// gen-opponent-clips — scripts/mocap/opponent-clips.json → lib/babylon/anim/authored/mocapOpponents.ts
// (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14). The captures stay on the owner's disk (~/Downloads/fel-mocap-sources);
// only the retargeted POSE KEYS are committed.
//
//   npx tsx scripts/mocap/gen-opponent-clips.mts [--only name,name]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readBvhStream, readGlbStream, LICENSE, type JointStream, type SourceKind } from './sources.mts';
import * as rtNs from '../../lib/babylon/anim/mocapRetarget.ts';
const RT = ((rtNs as unknown as { default?: typeof rtNs }).default ?? rtNs) as typeof rtNs;

interface Entry {
  name: string; replaces: string; source: SourceKind; file: string; anim?: string; from: number; to: number;
  duration?: number; loop?: boolean; mirror?: boolean; refineLoop?: [number, number]; hipsYRange?: [number, number]; aim?: 'hand' | 'foot'; note?: string;
  /** LAYUP EXTENSION (2026-09-17): a hand override blended over the TAIL of the capture — from `from01` of the clip the
   *  captured wrist targets ease (smoothstep) to these body-local metres, reaching them at `peak01` and holding. Authored
   *  in the un-mirrored (right-hand) frame; a mirrored clip gets it mirrored. `poles` swap in at half weight. */
  extend?: { from01: number; peak01: number; release01?: number; Right?: [number, number, number]; Left?: [number, number, number]; polesRight?: [number, number, number]; polesLeft?: [number, number, number] };   // release01: from here the override eases back OUT to the capture by the end
  /** STYLE CLIPS: the vocabulary this clip belongs to, and whether it carries a root track (mocapRetarget.rootTrack). */
  style?: string; rootTrack?: boolean; label?: string;
  /** LOWER STANCES ON MOVES (owner, 2026-09-17) — NOT USABLE YET: measured on the kit rig, the UpLeg/Leg keys of a capture do
   *  not move the feet (the ankle height only followed hipsY, both flexion signs identical), so a crouch here only sinks the
   *  feet. A lower stance needs the leg solve (planted feet / leg IK) in poseClip. Extra flexion in degrees — the thighs come forward by `crouch`, the knees bend by
   *  2×crouch (the shins stay near their line) and the hips drop by the leg's shortening (0.9·(1−cos crouch)), so the feet stay
   *  on the floor. A crouch of 18° lowers the hips ~4.4 cm and reads as a low, set handle. */
  crouch?: number;
}
const ROOT = join(process.env.HOME ?? '', 'Downloads/fel-mocap-sources');
const CROUCH_DROP_K = Number(process.env.CROUCH_DROP_K ?? 1);   // LOWER STANCES: the drop's calibration against the floor test
const rootFor = (e: Entry) => (e.source === 'meshy' ? join(process.env.HOME ?? '', 'Downloads/FEL_hero_upload') : ROOT);
// --styles: the style-clip manifest → authored/mocapStyles.ts (the same retarget, plus the root tracks and the vocabulary)
const STYLES = process.argv.includes('--styles');
const OUT = STYLES ? 'lib/babylon/anim/authored/mocapStyles.ts' : 'lib/babylon/anim/authored/mocapOpponents.ts';
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? new Set(process.argv[i + 1].split(',')) : null; })();
const manifest = JSON.parse(readFileSync(STYLES ? 'scripts/mocap/style-clips.json' : 'scripts/mocap/opponent-clips.json', 'utf8')) as { clips: Entry[] };

/** Slide a loop window so its last frame's pose matches its first (hips-relative joints + their velocity). */
function refineLoop(s: JointStream, from: number, to: number, [minD, maxD]: [number, number]): [number, number] {
  const J = RT.CANON;
  const rel = (f: number) => J.map((j) => { const p = s.frames[f][j], h = s.frames[f].Hips; return [p[0] - h[0], p[1] - h[1], p[2] - h[2]]; });
  const cost = (a: number, b: number) => {
    const A = rel(a), Bf = rel(b), A2 = rel(Math.min(s.frames.length - 1, a + 2)), B2 = rel(Math.min(s.frames.length - 1, b + 2));
    let c = 0;
    for (let k = 0; k < J.length; k++) for (let d = 0; d < 3; d++) c += (A[k][d] - Bf[k][d]) ** 2 + 0.5 * ((A2[k][d] - A[k][d]) - (B2[k][d] - Bf[k][d])) ** 2;
    return c;
  };
  let best: [number, number, number] = [from, to, Infinity];
  const step = Math.max(1, Math.round(s.fps / 60));
  for (let a = Math.round((from - 0.15) * s.fps); a <= Math.round((from + 0.15) * s.fps); a += step) {
    if (a < 0) continue;
    for (let L = Math.round(minD * s.fps); L <= Math.round(maxD * s.fps); L += step) {
      const b = a + L; if (b >= s.frames.length - 2) break;
      const c = cost(a, b); if (c < best[2]) best = [a / s.fps, b / s.fps, c];
    }
  }
  return [+best[0].toFixed(3), +best[1].toFixed(3)];
}

const streams = new Map<string, JointStream>();
const out: string[] = [];
for (const e of manifest.clips) {
  if (only && !only.has(e.name)) continue;
  const key = `${e.source}:${e.file}#${e.anim ?? ''}`;
  let s = streams.get(key);
  if (!s) {
    const path = e.file.startsWith('/') ? e.file : join(rootFor(e), e.file);
    s = e.source === 'ual' || e.source === 'meshy' ? await readGlbStream(path, e.anim!, 30, e.source) : readBvhStream(path, e.source);
    streams.set(key, s);
  }
  let [from, to] = [e.from, e.to];
  if (e.loop && e.refineLoop) [from, to] = refineLoop(s, from, to, e.refineLoop);
  const r = RT.retargetToPoseKeys(s, { from, to, duration: e.duration, loop: e.loop, mirror: e.mirror, hipsYRange: e.hipsYRange, aim: e.aim, rootTrack: e.rootTrack });
  if (e.extend) {
    const ex = e.extend; const m = !!e.mirror;
    const tgt = (side: 'Left' | 'Right') => { const src = m ? (side === 'Left' ? ex.Right : ex.Left) : ex[side]; return src ? [m ? -src[0] : src[0], src[1], src[2]] as [number, number, number] : null; };
    const pole = (side: 'Left' | 'Right') => { const src = m ? (side === 'Left' ? ex.polesRight : ex.polesLeft) : (side === 'Left' ? ex.polesLeft : ex.polesRight); return src ? [m ? -src[0] : src[0], src[1], src[2]] as [number, number, number] : null; };
    for (const k of r.keys) {
      const t01 = k.t / r.duration; if (t01 < ex.from01) continue;
      let w = Math.min(1, (t01 - ex.from01) / Math.max(1e-3, ex.peak01 - ex.from01));
      if (ex.release01 !== undefined && t01 > ex.release01) w *= Math.max(0, 1 - (t01 - ex.release01) / Math.max(1e-3, 1 - ex.release01));
      const ws = w * w * (3 - 2 * w);
      for (const side of ['Left', 'Right'] as const) {
        const g = tgt(side); const h = k.hands?.[side]; if (!g || !h) continue;
        k.hands![side] = [h[0] + (g[0] - h[0]) * ws, h[1] + (g[1] - h[1]) * ws, h[2] + (g[2] - h[2]) * ws];
        const pl = pole(side); if (pl && ws >= 0.5) { (k.poles ??= {})[side] = pl; }
      }
    }
  }
  if (e.crouch) {   // LOWER STANCES ON MOVES: deeper hips + knees, the hips down by exactly the leg's shortening
    const d = e.crouch, drop = 0.9 * (1 - Math.cos(d * Math.PI / 180));
    for (const k of r.keys) {
      const b = k.bones ?? (k.bones = {});
      // measured on the kit rig (2026-09-17): +thigh / −knee is the flexion direction of these absolute keys (the first cut, the
      // other way round, put the feet 6 cm under the floor); CROUCH_DROP_K scales the analytic shortening to the rig's own leg
      for (const up of ['LeftUpLeg', 'RightUpLeg']) { const v = b[up] ?? [0, 0, 0]; b[up] = [v[0] + d, v[1], v[2]]; }
      for (const lg of ['LeftLeg', 'RightLeg']) { const v = b[lg] ?? [0, 0, 0]; b[lg] = [v[0] - 2 * d, v[1], v[2]]; }
      k.hipsY = +(((k.hipsY ?? 0) - drop * CROUCH_DROP_K).toFixed(3));
    }
  }
  const hands = r.keys.map((k) => Math.max(k.hands!.Left![1], k.hands!.Right![1]));
  console.log(`${e.name.padEnd(28)} ${from.toFixed(2)}–${to.toFixed(2)}s → ${r.duration}s ${r.keys.length} keys  scale ${r.scale}  facing ${r.baseYawDeg}°  front ${r.frontSign > 0 ? '+' : '−'}  hands ${Math.min(...hands).toFixed(2)}..${Math.max(...hands).toFixed(2)} m`);
  out.push(`  {
    name: '${e.name}', replaces: '${e.replaces}', duration: ${r.duration}, loop: ${!!e.loop},${STYLES ? ` style: '${e.style}', label: '${e.label ?? e.name}',` : ''}
    source: '${e.source}:${e.file.split('/').pop()}${e.anim ? '#' + e.anim : ''} ${from.toFixed(2)}–${to.toFixed(2)}s${e.mirror ? ' mirrored' : ''}', license: ${JSON.stringify(LICENSE[e.source])},
    keys: [
${r.keys.map((k) => `      ${JSON.stringify(k).replace(/"(\w+)":/g, '$1: ')},`).join('\n')}
    ],${r.root ? `\n    root: [\n${r.root.map((k) => `      ${JSON.stringify(k)},`).join('\n')}\n    ],` : ''}
  },`);
}

if (only) { console.log('(--only: module not written)'); process.exit(0); }
if (STYLES) {
  writeFileSync(OUT, `// mocapStyles — the STYLE vocabularies' moves, from real captures (2026-09-15, owner: capoeira / breaking, taekwondo /
// tricking, parkour). GENERATED by scripts/mocap/gen-opponent-clips.mts --styles from scripts/mocap/style-clips.json.
//
// Each clip is pose keys INSIDE the pelvis frame plus a ROOT TRACK (the pelvis orientation + hips height), because a
// cartwheel, a flip or a windmill turns the whole body over (mocapRetarget.rootTrack). anim/styleMotion.ts builds a
// vocabulary's clips onto a rig and swaps the base move names; anim/MoveRootLayer.ts plays the root tracks.
// Source: CMU Graphics Lab Motion Capture Database — free in commercial products, the data may not be resold.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type PoseKey } from '../poseClip';
import type { RootKey } from '../mocapRetarget';

export type StyleVocab = 'capoeira' | 'tricking' | 'parkour';
export interface MocapStyleClip {
  name: string; replaces: string; duration: number; loop: boolean; style: StyleVocab; label: string; source: string; license: string; keys: PoseKey[]; root?: RootKey[];
}

export const MOCAP_STYLE_CLIPS: MocapStyleClip[] = [
${out.join('\n')}
];

export function buildMocapStyleClip(scene: Scene, sk: Skeleton, clip: MocapStyleClip): AnimationGroup | null {
  return buildPoseClip(scene, sk, clip.name, clip.duration, clip.keys);
}
`);
  console.log(`wrote ${OUT} (${out.length} clips)`);
  process.exit(0);
}
writeFileSync(OUT, `// mocapOpponents — the AI bodies' motion, from REAL captures (EVERYONE-BODY-MOCAP-OPPONENTS, 2026-09-14).
// GENERATED by scripts/mocap/gen-opponent-clips.mts from scripts/mocap/opponent-clips.json — edit those, not this file.
//
// Every clip is a window of a capture retargeted to POSE KEYS (lib/babylon/anim/mocapRetarget.ts), so the two-bone
// solver fits it to whichever body plays. \`replaces\` names the authored clip an opponent plays this instead of
// (lib/babylon/anim/opponentMotion.ts). Sources and licenses ride on every clip:
//   cmu  — CMU Graphics Lab Motion Capture Database, subject 06 (basketball). Free to include in commercially-sold
//          products; the data may not be resold, even converted. (mocap.cs.cmu.edu)
//   ual  — Quaternius Universal Animation Library 2 [Standard]. CC0 1.0.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type PoseKey } from '../poseClip';

export interface MocapOpponentClip {
  name: string; replaces: string; duration: number; loop: boolean; source: string; license: string; keys: PoseKey[];
}

export const MOCAP_OPPONENT_CLIPS: MocapOpponentClip[] = [
${out.join('\n')}
];

export function buildMocapOpponentClip(scene: Scene, sk: Skeleton, clip: MocapOpponentClip): AnimationGroup | null {
  return buildPoseClip(scene, sk, clip.name, clip.duration, clip.keys);
}
`);
console.log(`wrote ${OUT} (${out.length} clips)`);
