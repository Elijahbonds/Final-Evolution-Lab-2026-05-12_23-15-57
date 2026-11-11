// gameplay-clean-7: the legs after a move that ran to its end, headless on the hero (no browser).
//   npx tsx scripts/probes/gameplay-clean/legHold.ts
// A hit react and a knockdown each run out into `idle_stand` (neverBindPose plays it from their end callback; it keys 7 bones, not the
// legs). Per case and blend: the largest one-frame turn of each thigh over the 40 frames from the settle, how many frames a thigh turns
// ≥ 5°, and where the thigh ends against the pose it showed on the settle frame. Blends: linear (as shipped), inertial with
// `anim.inertialEndedHold` 0 (the legs eased onto their bind pose — clean-6) and 1 (they hold, as linear does).
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { installOpponentMotion } from '../../../lib/babylon/anim/opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from '../../../lib/babylon/anim/importSanitizer';
import { boneNode } from '../../../lib/babylon/anim/boneLookup';

async function main() {
const LEGS = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
const A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); neverBindPose(A, 'idle_stand'); installOpponentMotion(A, scene, sk, null);
(engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
setFeelUser(true); setFeelSession(null);
const pose = () => LEGS.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
const cur = () => (A as unknown as { currentName: string }).currentName;

type Case = { name: string; settle?: string; steps: [string, { loop?: boolean; fadeSec: number }, number][] };
const CASES: Case[] = [
  { name: 'guard step → hit react → idle', steps: [['karate_guard_step', { loop: true, fadeSec: 0.16 }, 30], ['karate_hit_react', { fadeSec: 0.05 }, 90]] },
  { name: 'guard step → knockdown → idle', steps: [['karate_guard_step', { loop: true, fadeSec: 0.16 }, 20], ['karate_knockdown', { fadeSec: 0.08 }, 150]] },
  { name: 'guard step → mc hit react → idle', steps: [['karate_guard_step', { loop: true, fadeSec: 0.16 }, 30], ['karate_mc_hit_react', { fadeSec: 0.05 }, 90]] },
  // a CUT, not an end: the react's beat ended by a timer into the 7-bone guard (the hold does not apply: the clip is still playing)
  { name: 'guard step → mc hit react, CUT at 20 f → guard', settle: 'guard', steps: [['karate_guard_step', { loop: true, fadeSec: 0.16 }, 30], ['karate_mc_hit_react', { fadeSec: 0.05 }, 20], ['guard', { loop: true, fadeSec: 0.2 }, 60]] },
];
function run(c: Case, mode: 'linear' | 'inertial', hold: number) {
  setFeelOverride('anim.inertialEndedHold', hold);
  A.setBlendMode('linear'); A.setBlendMode(mode); A.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 20; i++) scene.render();
  let prev = pose(), prevClip = cur(), at = -1, f = 0, settlePose: Quaternion[] | null = null;
  const max = LEGS.map(() => 0); let over5 = 0;
  for (const [clip, o, frames] of c.steps) {
    A.play(clip, o);
    for (let i = 0; i < frames; i++, f++) {
      scene.render(); const now = pose(); const cc = cur();
      const st = c.settle ?? 'idle_stand';
      if (at < 0 && cc === st && prevClip !== st) { at = f; settlePose = prev; }
      if (at >= 0 && f - at < 40) { let big = false; now.forEach((q, k) => { const a = ang(q, prev[k]); max[k] = Math.max(max[k], a); if (k < 2 && a >= 5) big = true; }); if (big) over5++; }
      prev = now; prevClip = cc;
    }
  }
  const drift = settlePose ? LEGS.map((_, k) => ang(prev[k], settlePose![k])) : null;
  A.setBlendMode('linear');
  return { settled: at >= 0, max: max.map((x) => Math.round(x * 10) / 10), over5, drift: drift?.map((x) => Math.round(x * 10) / 10) };
}
for (const c of CASES) {
  console.log(`\n${c.name}   (max turn a frame ${LEGS.join(' / ')}; frames a thigh turns ≥ 5°; end pose vs the settle frame)`);
  for (const [label, mode, hold] of [['linear', 'linear', 1], ['inertial, hold 0 (clean-6)', 'inertial', 0], ['inertial, hold 1', 'inertial', 1]] as const) {
    const o = run(c, mode, hold);
    console.log(`  ${label.padEnd(28)} ${o.settled ? '' : '(NO SETTLE) '}max ${o.max.join(' / ')}°   ≥5°: ${o.over5} frames   end-vs-settle ${o.drift?.join(' / ')}°`);
  }
}
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
