// pose-shape — where an authored dunk clip actually puts the body, measured on the rig rather than read off its keys.
//
// The keys cannot be read by eye: the leg bones take +X as a BACKWARD swing while the spine takes +X as forward
// flexion, so "58" on a thigh and "32" on a chest lean opposite ways. This drives the clip and reports the shape in
// metres — heel height against the head, and the horizontal gap between them, which is what makes a curl a curl.
//
//   npx tsx scripts/probes/pose-shape.ts
import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { buildRig } from '../../lib/babylon/characters/proceduralRig';
import { buildScorpion } from '../../lib/babylon/anim/authored/dunkTricks';

const engine = new NullEngine();
const scene = new Scene(engine);
new FreeCamera('c', new Vector3(0, 1.6, -4), scene);
const rig = buildRig(scene, 'pose');
const sk = (rig as unknown as { skeleton: import('@babylonjs/core').Skeleton }).skeleton ?? (rig as any).skel ?? null;
if (!sk) { console.log('NO SKELETON', Object.keys(rig as object)); process.exit(1); }
const g = buildScorpion(scene, sk);
if (!g) { console.log('NO CLIP'); process.exit(1); }
// the authored clips drive the bones' TRANSFORM NODES, so that is what has to be read
const nodeOf = (n: string) => {
  const b = sk.bones.find((x) => x.name === n || x.name.endsWith(':' + n));
  return b ? b.getTransformNode() : null;
};
g.start(false, 1, g.from, g.to); g.pause();
const at = (u: number) => {
  const f = g.from + (g.to - g.from) * u;
  g.goToFrame(f);
  scene.render();
  const hipsN = nodeOf('Hips'); if (!hipsN) { console.log('no hips node'); return; }
  hipsN.computeWorldMatrix(true);
  const hips = hipsN.getAbsolutePosition();
  const get = (n: string) => { const nd = nodeOf(n); if (!nd) return null; nd.computeWorldMatrix(true); return nd.getAbsolutePosition(); };
  const foot = get('RightFoot')!, head = get('Head')!, hand = get('RightHand')!;
  const gap = Math.hypot(foot.z - head.z, foot.x - head.x);
  const row = [
    `heel dy=${(foot.y - hips.y).toFixed(2)} dz=${(foot.z - hips.z).toFixed(2)}`,
    `head dy=${(head.y - hips.y).toFixed(2)} dz=${(head.z - hips.z).toFixed(2)}`,
    `heel-vs-head: ${(foot.y - head.y >= 0 ? 'ABOVE' : 'below')} by ${Math.abs(foot.y - head.y).toFixed(2)}`,
    `curl gap=${gap.toFixed(2)}`,
    `hand dy=${(hand.y - hips.y).toFixed(2)}`,
  ];
  console.log(`u=${u.toFixed(2)} hipsY=${hips.y.toFixed(2)} | ${row.join(' | ')}`);
};
console.log('SCORPION — feet relative to the hips: dy>0 = above the hips, dz<0 = behind the back (the rig faces +z)');
for (const u of [0, 0.25, 0.5, 0.7, 1]) at(u);
