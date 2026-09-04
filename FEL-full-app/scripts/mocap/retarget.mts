// Ship pass 3, rung 4 — the owner's DeepMotion take → a clip for the hero.
//   inventory → SEGMENT (motion energy) → RETARGET (bone-name map, root motion
//   dropped, toes dropped) → a JSON clip under public/models/clips/mocap/.
// The runtime builds it with buildQuatClip on the live skeleton (like the
// authored suite), so nothing here depends on Blender.
//   npx tsx scripts/mocap/retarget.mts public/models/clips/golf_swing.glb golf_swing_full [--lead 0.4 --tail 0.3]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const FEL_BONES = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']);
const ENERGY_BONES = new Set(['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine', 'Hips']);
const strip = (n: string) => n.replace(/^mixamorig:?/, '');
const qAngle = (a: number[], b: number[]) => 2 * Math.acos(Math.min(1, Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])));

export interface MocapClipJson { name: string; source: string; segment: [number, number]; duration: number; tracks: Record<string, [number, number, number, number, number][]> }

export async function retargetTake(file: string, name: string, lead = 0.4, tail = 0.3): Promise<MocapClipJson> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(new Uint8Array(readFileSync(file)));
  const anim = doc.getRoot().listAnimations().find((a) => a.listChannels().length > 5) ?? doc.getRoot().listAnimations()[0];
  if (!anim) throw new Error('no animation in ' + file);
  const tracks: Record<string, { t: number[]; q: number[][] }> = {};
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(); if (!node || ch.getTargetPath() !== 'rotation') continue;
    const bone = strip(node.getName()); if (!FEL_BONES.has(bone)) continue;
    const s = ch.getSampler()!; const t = Array.from(s.getInput()!.getArray()!); const o = Array.from(s.getOutput()!.getArray()!);
    const q: number[][] = []; for (let i = 0; i + 3 < o.length; i += 4) q.push([o[i], o[i+1], o[i+2], o[i+3]]);
    tracks[bone] = { t, q };
  }
  // segment: energy over a shared time grid (union of key times, sampled by nearest key)
  const times = [...new Set(Object.values(tracks).flatMap((x) => x.t))].sort((a, b) => a - b);
  const at = (tr: { t: number[]; q: number[][] }, time: number) => { let i = tr.t.findIndex((v) => v >= time); if (i < 0) i = tr.t.length - 1; return tr.q[i]; };
  const energy = times.map((tm, i) => i === 0 ? 0 : Object.entries(tracks).filter(([b]) => ENERGY_BONES.has(b)).reduce((s, [, tr]) => s + qAngle(at(tr, times[i - 1]), at(tr, tm)) / Math.max(1e-3, tm - times[i - 1]), 0));
  const sorted = [...energy].sort((a, b) => a - b); const floor = (sorted[Math.floor(sorted.length * 0.9)] ?? 0) * 0.3;
  let best = { from: 0, to: 0, sum: 0 }, start = -1, sum = 0;
  for (let i = 0; i < times.length; i++) {
    if (energy[i] > floor) { if (start < 0) { start = i; sum = 0; } sum += energy[i]; }
    else if (start >= 0) { if (sum > best.sum) best = { from: start, to: i, sum }; start = -1; }
  }
  if (start >= 0 && sum > best.sum) best = { from: start, to: times.length - 1, sum };
  const t0 = Math.max(0, times[best.from] - lead), t1 = Math.min(times[times.length - 1], times[Math.min(best.to, times.length - 1)] + tail);
  const out: MocapClipJson = { name, source: file.split('/').pop()!, segment: [+t0.toFixed(3), +t1.toFixed(3)], duration: +(t1 - t0).toFixed(3), tracks: {} };
  for (const [bone, tr] of Object.entries(tracks)) {
    const keys: [number, number, number, number, number][] = [];
    // include the last key before t0 (held pose) and every key inside the window
    let prev = -1; for (let i = 0; i < tr.t.length; i++) { if (tr.t[i] < t0) prev = i; }
    if (prev >= 0) keys.push([0, ...tr.q[prev]] as never);
    for (let i = 0; i < tr.t.length; i++) if (tr.t[i] >= t0 && tr.t[i] <= t1) keys.push([+(tr.t[i] - t0).toFixed(4), ...tr.q[i].map((v) => +v.toFixed(5))] as never);
    if (keys.length) out.tracks[bone] = keys;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, name] = process.argv.slice(2);
  const flag = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : d; };
  const lead = flag('--lead', 0.4), tail = flag('--tail', 0.3);
  const clip = await retargetTake(file, name, lead, tail);
  mkdirSync('public/models/clips/mocap', { recursive: true });
  writeFileSync(`public/models/clips/mocap/${name}.json`, JSON.stringify(clip));
  console.log(`${name}: segment ${clip.segment[0]}s → ${clip.segment[1]}s (${clip.duration} s), ${Object.keys(clip.tracks).length} bones, ${Object.values(clip.tracks).reduce((n, k) => n + k.length, 0)} keys → public/models/clips/mocap/${name}.json`);
}
