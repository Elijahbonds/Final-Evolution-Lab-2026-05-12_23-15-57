// hoops-items item 6: the behind-the-back's hand whip on the hoops NODE rig (tests/helpers/hoopsNodeRig: the carry, its reach and wrists,
// the arm ease — every runtime hand writer — on a plain two-arm rig, no clip). Per move: each hand / forearm's worst one-frame turn (deg)
// and the frame, and the palm gap (the repo's palm read) worst, with the hand ease off and on. Headless, a few seconds.
//   npx tsx scripts/probes/hoops-items/btb-node.mts [move ...]       (default: behind_back, crossover, between_legs)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { Quaternion } = await import('@babylonjs/core');
const { hoopsNodeRig } = await import(APP + '/tests/helpers/hoopsNodeRig.ts');
const { quatAngle } = await import(APP + '/lib/babylon/anim/MoveEase.ts');
const { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } = await import(APP + '/lib/feel-panel/feel.ts');

const DT = 1 / 60;
const BONES = ['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'LeftArm', 'RightArm'];
const moves = process.argv.slice(2).length ? process.argv.slice(2) : ['behind_back', 'crossover', 'between_legs'];
for (const move of moves) for (const hand of ['right', 'left'] as const) for (const ease of [0, 1]) {
  resetFeelForTests(); setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.moveHandEaseOn', ease);
  const r = hoopsNodeRig(hand);
  let n = 0; while (n++ < 400 && !(n > 90 && r.carry.phase < 0.03)) r.frame(DT, 0.3);
  const last = BONES.map((b) => r.nodes[b].rotationQuaternion!.clone());
  r.carry.runMove(move);
  const worst = BONES.map(() => ({ d: 0, f: -1 })); let palm = 0;
  for (let i = 0; i < 60; i++) {
    r.frame(DT, 0.3);
    BONES.forEach((b, k) => { const q = r.nodes[b].rotationQuaternion ?? Quaternion.Identity(); const d = quatAngle(last[k], q) * 180 / Math.PI; if (d > worst[k].d) worst[k] = { d, f: i }; last[k].copyFrom(q); });
    const p = r.palm(); palm = Math.max(palm, Math.min(p.right, p.left));
  }
  r.dispose();
  console.log(`${move.padEnd(13)} ball ${hand.padEnd(5)} hand-ease ${ease}: ${BONES.map((b, k) => `${b} ${worst[k].d.toFixed(0)}°@${worst[k].f}`).join(' · ')} · palm gap worst ${(palm * 100).toFixed(1)} cm`);
}
resetFeelForTests();
