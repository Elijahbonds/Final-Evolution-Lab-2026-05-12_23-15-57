// gameplay-clean-7: the dunk run-up's first fade frame on the BARE hero (no carry, no layer), headless.
//   npx tsx scripts/probes/gameplay-clean/runupFill.ts [from=idle_stand] [to=bball_dribble_run] [fade=0.15] [knob=value ...]
//   env BLEND=inertial (the body inertial), HOOPS=1 (the bball_* clips mirrored right-handed and the left twins built, as a hoops body)
// The rig sees the left forearm turn 100–123° on the frame the run-up's dribble fades in at 0.11 over `idle_stand` (which keys 7
// bones, not the forearm). This plays the same switch with nothing else mounted, frame by frame: if the bare blend shows the jump it
// is the blend's weight-below-1 fill; if not, it is a layer's.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { installOpponentMotion, HERO_CAPTURE } from '../../../lib/babylon/anim/opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from '../../../lib/babylon/anim/importSanitizer';
import { boneNode } from '../../../lib/babylon/anim/boneLookup';
import { leftDribbleTwins, rightHandHoops } from '../../../lib/babylon/anim/hoopsHand';

const BONES = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'Spine2'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
async function main() {
  const [from = 'idle_stand', to = 'bball_dribble_run', fadeS = '0.15', ...kv] = process.argv.slice(2);
  const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  setFeelUser(true); setFeelSession(null);
  for (const p of kv) { const [k, v] = p.split('='); setFeelOverride(k, Number(v)); }
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  const sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
  const A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); neverBindPose(A, 'idle_stand');
  installOpponentMotion(A, scene, sk, undefined, HERO_CAPTURE);
  if (process.env.HOOPS === '1') { rightHandHoops(A, sk); leftDribbleTwins(A, sk); }
  if (process.env.BLEND === 'inertial') A.setBlendMode('inertial');
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
  const pose = () => BONES.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
  const w = (n: string) => { const g = scene.animationGroups.find((x) => x.name.replace(/_c\d+$/, '') === n && x.isPlaying); const a = g?.animatables[0]?.weight; return g ? (a == null || a < 0 ? 1 : a).toFixed(2) : '-'; };
  for (const lead of ['bball_mc_dribble_idle', 'run', 'karate_guard_step']) {
    A.play(lead, { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 30; i++) scene.render();
    A.play(from, { loop: true, fadeSec: 0.2 }); for (let i = 0; i < 40; i++) scene.render();
    let prev = pose(); A.play(to, { loop: true, fadeSec: Number(fadeS) });
    const cur = (A as unknown as { currentName: string }).currentName;
    console.log(`${lead} → ${from} → ${to} (plays ${cur}), fade ${fadeS}`);
    for (let f = 0; f < Number(process.env.FRAMES ?? 6); f++) { scene.render(); const now = pose(); console.log(`  f${f} ${from} ${w(from)} + ${cur} ${w(cur)}   ${BONES.map((b, k) => `${b} ${ang(now[k], prev[k]).toFixed(1)}`).join(' · ')}`); prev = now; }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
