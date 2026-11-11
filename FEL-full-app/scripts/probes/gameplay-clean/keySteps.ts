// gameplay-clean-7: a captured clip's per-key step (°) on the arm and thigh tracks, as built on the hero.   npx tsx scripts/probes/gameplay-clean/keySteps.ts <clip>
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
async function main() {
  const APP = require('node:path').resolve(__dirname, '../../..');
  const { sanitizeImportedGroups } = await import(APP + '/lib/babylon/anim/importSanitizer.ts');
  const { buildMocapOpponentClip, MOCAP_OPPONENT_CLIPS } = await import(APP + '/lib/babylon/anim/authored/mocapOpponents.ts');
  const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(APP + '/public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop(); sanitizeImportedGroups(r.animationGroups);
  const name = process.argv[2] ?? 'dunk_mc_celebrate_big';
  const def = MOCAP_OPPONENT_CLIPS.find((c: any) => c.name === name);
  const { buildAuthoredClip } = await import(APP + '/lib/babylon/anim/authored/index.ts');
  const g = def ? buildMocapOpponentClip(scene, r.skeletons[0], def) : buildAuthoredClip(scene, r.skeletons[0], name);
  const only = process.argv[3] ? new RegExp(process.argv[3]) : /Arm|ForeArm|UpLeg/;
  for (const ta of g.targetedAnimations) {
    const n = ta.target.name; if (!only.test(n) || ta.animation.targetProperty !== 'rotationQuaternion') continue;
    const k = ta.animation.getKeys(); const fps = ta.animation.framePerSecond;
    const st = []; for (let i = 0; i + 1 < k.length; i++) { const a = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(k[i].value, k[i + 1].value)))) * 180 / Math.PI; st.push(`${(k[i].frame / fps).toFixed(2)}:${a.toFixed(0)}`); }
    console.log(n.padEnd(14), st.join(' '));
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
