// gameplay-clean-7: the hoops made-shot celebration on the hero, headless (no browser).
//   npx tsx scripts/probes/gameplay-clean/celebrate.ts [from=bball_mc_dribble_idle] [fade=0.26]
// The hero as a hoops mode spawns it (the captures installed with HERO_CAPTURE, as CharacterLibrary does). Plays `from` (a loop), then
// the tree's celebrate beat (`bball_score_celebrate`, which resolves to dunk_celebrate_big → the capture dunk_mc_celebrate_big) and
// prints, frame by frame, every arm bone's turn (°) and the clip playing. Then the clip alone from its own first frame (fade 0).
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { installOpponentMotion, HERO_CAPTURE } from '../../../lib/babylon/anim/opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from '../../../lib/babylon/anim/importSanitizer';
import { boneNode } from '../../../lib/babylon/anim/boneLookup';

const ARMS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
async function main() {
  const [from = 'bball_mc_dribble_idle', fadeS = '0.26', ...kv] = process.argv.slice(2);
  const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  setFeelUser(true); setFeelSession(null);
  for (const p of kv) { const [k, v] = p.split('='); setFeelOverride(k, Number(v)); }
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  const sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
  const A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); neverBindPose(A, 'idle_stand');
  installOpponentMotion(A, scene, sk, undefined, HERO_CAPTURE);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
  const pose = () => ARMS.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
  const cur = () => (A as unknown as { currentName: string }).currentName;
  const run = (label: string, fade: number, pre: number) => {
    A.play(from, { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < pre; i++) scene.render();
    let prev = pose(); A.play('bball_score_celebrate', { fadeSec: fade, restart: true });
    const max = ARMS.map(() => 0); const lines: string[] = [];
    for (let f = 0; f < 60; f++) {
      scene.render(); const now = pose();
      const t = now.map((q, k) => ang(q, prev[k])); t.forEach((a, k) => { max[k] = Math.max(max[k], a); });
      if (t.some((a) => a >= 12)) lines.push(`    f${String(f).padStart(2)} ${cur().padEnd(24)} ${t.map((a, k) => a >= 12 ? `${ARMS[k]} ${a.toFixed(1)}` : '').filter(Boolean).join(', ')}`);
      prev = now;
    }
    console.log(`${label}: max a frame ${ARMS.map((b, k) => `${b} ${max[k].toFixed(1)}`).join(' · ')}`);
    console.log(lines.join('\n'));
    return Math.max(...max);
  };
  for (const pre of [20, 33]) run(`${from} (${pre} f) → celebrate, fade ${fadeS}`, Number(fadeS), pre);
  run('the clip alone (fade 0)', 0, 20);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
