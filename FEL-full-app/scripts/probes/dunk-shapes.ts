#!/usr/bin/env -S npx tsx
// dunk-shapes — what every authored dunk actually does to the body, in metres.
//
// The scorpion pass established the method and the reason: the keys cannot be read by eye, because the leg bones
// take +X as a backward swing while the spine takes +X as forward flexion, so "58" on a thigh and "32" on a chest
// lean opposite ways. The only honest way to know what a dunk looks like is to drive it on the rig and measure.
//
// This runs the whole vocabulary and prints, for each clip at its deepest moment, the handful of numbers that decide
// whether a dunk reads as the move it is named after:
//
//   ball hand   — where the dunking hand is, relative to the head (a tomahawk cocks it BEHIND and ABOVE)
//   off hand    — the other one (a cradle brings it to the chest; a windmill sweeps it wide)
//   hand gap    — how far apart the hands are (a double clutch has them together at the chest)
//   heels       — above/behind the hips (the scorpion's tail)
//   spine       — how far the chest is from vertical
//
//   npx tsx scripts/probes/dunk-shapes.ts [clipName]
import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { buildRig } from '../../lib/babylon/characters/proceduralRig';
import * as T from '../../lib/babylon/anim/authored/dunkTricks';

const engine = new NullEngine();
const scene = new Scene(engine);
new FreeCamera('c', new Vector3(0, 1.6, -4), scene);
const rig = buildRig(scene, 'shapes');
const sk = (rig as unknown as { skeleton: import('@babylonjs/core').Skeleton }).skeleton;

const nodeOf = (n: string) => {
  const b = sk.bones.find((x) => x.name === n || x.name.endsWith(':' + n));
  return b ? b.getTransformNode() : null;
};
const at = (n: string) => { const nd = nodeOf(n); if (!nd) return null; nd.computeWorldMatrix(true); return nd.getAbsolutePosition(); };

type Clip = { from: number; to: number; start: (l: boolean, s: number, f: number, t: number) => void; pause: () => void; goToFrame: (f: number) => void; dispose: () => void };
type Builder = (s: Scene, k: import('@babylonjs/core').Skeleton) => Clip | null;
const BUILDERS: Record<string, Builder> = Object.fromEntries(
  Object.entries(T).filter(([k, v]) => k.startsWith('build') && typeof v === 'function'),
) as unknown as Record<string, Builder>;

const only = process.argv[2];
console.log('clip                   | BALL hand (dy,dz vs head) | off hand      | gap  | heels (dy,dz) | chest dz   (hand)');
console.log('-----------------------+---------------------------+---------------+------+---------------+---------');

for (const [name, build] of Object.entries(BUILDERS)) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
  let g: Clip | null = null;
  try { g = build(scene, sk); } catch { /* a clip the rig cannot build */ }
  if (!g) { console.log(`${name.replace('build', '').padEnd(22)} | (did not build)`); continue; }
  g.start(false, 1, g.from, g.to); g.pause();

  // Sample the whole clip and keep the frame where EITHER hand is highest — the moment the dunk is at the rim.
  //
  // This read RightHand only at first, and reported the eastbay peaking 7 cm above the head when every other dunk
  // reached 30. The eastbay finishes LEFT-handed: the ball goes under the lead thigh and comes out the far side, so
  // the measuring hand was the one NOT holding the ball. A probe that assumes a handedness will libel every dunk
  // that swaps, which is most of the interesting ones.
  let best = { u: 0, y: -Infinity, hand: 'RightHand' };
  for (let u = 0; u <= 1.0001; u += 0.05) {
    g.goToFrame(g.from + (g.to - g.from) * u); scene.render();
    for (const h of ['RightHand', 'LeftHand']) {
      const pos = at(h);
      if (pos && pos.y > best.y) best = { u, y: pos.y, hand: h };
    }
  }
  g.goToFrame(g.from + (g.to - g.from) * best.u); scene.render();

  const head = at('Head'), hips = at('Hips'), foot = at('RightFoot'), chest = at('Spine2');
  // the BALL hand is whichever one is at the rim; the other is the off hand
  const rh = at(best.hand), lh = at(best.hand === 'RightHand' ? 'LeftHand' : 'RightHand');
  if (!head || !hips || !rh || !lh || !foot || !chest) { console.log(`${name.replace('build', '').padEnd(22)} | (bones missing)`); continue; }
  const f = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);
  const gap = Math.hypot(rh.x - lh.x, rh.y - lh.y, rh.z - lh.z);
  console.log(
    `${name.replace('build', '').padEnd(22)} | ${f(rh.y - head.y)}, ${f(rh.z - head.z)}`.padEnd(51)
    + `| ${f(lh.y - head.y)}, ${f(lh.z - head.z)}`.padEnd(16)
    + `| ${gap.toFixed(2)} `
    + `| ${f(foot.y - hips.y)}, ${f(foot.z - hips.z)}`.padEnd(16)
    + `| ${f(chest.z - hips.z)}   ${best.hand === 'RightHand' ? 'R' : 'L'}`,
  );
  g.dispose();
}
