// Ship pass 3 groundwork — inventory the owner's DeepMotion takes: duration,
// rig, and a motion-energy timeline (summed per-frame rotation change of the
// arm and leg bones) with candidate segments where the energy rises above a
// floor and falls back. usage: npx tsx scripts/mocap/_inventory.mts public/models/clips/golf_swing.glb ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const LIMBS = new Set(['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine', 'Hips']);
const strip = (n: string) => n.replace(/^mixamorig:?/, '');
function qAngle(a: number[], b: number[]): number { const d = Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]); return 2 * Math.acos(Math.min(1, d)); }
for (const f of process.argv.slice(2)) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(f)));
  const root = doc.getRoot();
  const anim = root.listAnimations().find((a) => a.listChannels().length > 5) ?? root.listAnimations()[0];
  if (!anim) { console.log(basename(f), 'no animation'); continue; }
  const bones = root.listNodes().map((n) => strip(n.getName())).filter(Boolean);
  let fps = 0, frames = 0, dur = 0;
  const perBone: { name: string; times: number[]; quats: number[][] }[] = [];
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(); const path = ch.getTargetPath();
    if (!node || path !== 'rotation') continue;
    const name = strip(node.getName()); if (!LIMBS.has(name)) continue;
    const s = ch.getSampler()!; const t = Array.from(s.getInput()!.getArray()!); const o = Array.from(s.getOutput()!.getArray()!);
    const quats: number[][] = []; for (let i = 0; i + 3 < o.length; i += 4) quats.push([o[i], o[i+1], o[i+2], o[i+3]]);
    perBone.push({ name, times: t, quats }); frames = Math.max(frames, t.length); dur = Math.max(dur, t[t.length - 1]);
  }
  fps = frames > 1 ? Math.round((frames - 1) / dur) : 0;
  // energy per frame index (assume shared timeline)
  const n = Math.max(...perBone.map((b) => b.quats.length));
  const energy = new Array(n).fill(0);
  for (const b of perBone) for (let i = 1; i < b.quats.length; i++) energy[i] += qAngle(b.quats[i - 1], b.quats[i]);
  // smooth (window 5) and segment above 30% of the 90th percentile
  const sm = energy.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < n) { s += energy[j]; c++; } } return s / c; });
  const sorted = [...sm].sort((a, b) => a - b); const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0; const floor = p90 * 0.3;
  const segs: { from: number; to: number; peak: number }[] = []; let start = -1, peak = 0;
  for (let i = 0; i < n; i++) { if (sm[i] > floor) { if (start < 0) { start = i; peak = 0; } peak = Math.max(peak, sm[i]); } else if (start >= 0) { if (i - start >= Math.max(4, fps * 0.4)) segs.push({ from: start, to: i, peak }); start = -1; } }
  if (start >= 0) segs.push({ from: start, to: n, peak });
  const t0 = perBone[0]?.times ?? [];
  console.log(`\n${basename(f)}  ${dur.toFixed(1)} s  ~${fps} fps  ${frames} frames  limb bones ${perBone.length}  rig ${bones.length} nodes (${bones.slice(0, 4).join(', ')}…)  anim "${anim.getName()}"`);
  console.log(`  ${segs.length} movement segment(s):`);
  for (const s of segs) console.log(`   ${(t0[s.from] ?? 0).toFixed(2).padStart(7)}s → ${(t0[Math.min(s.to, t0.length - 1)] ?? dur).toFixed(2).padStart(7)}s  (${((t0[Math.min(s.to, t0.length - 1)] ?? dur) - (t0[s.from] ?? 0)).toFixed(2)} s, peak ${s.peak.toFixed(2)} rad/frame)`);
}
