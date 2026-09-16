import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { buildRig } from './lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from './lib/babylon/characters/proceduralClips';
import { registerAuthoredClips } from './lib/babylon/anim/authored';
import { CharacterAnimator } from './lib/babylon/anim/CharacterAnimator';
import { boneNode } from './lib/babylon/anim/boneLookup';
const scene = new Scene(new NullEngine());
new FreeCamera('c', new Vector3(0,0,-5), scene);
const rig = buildRig(scene, 'default');
const an = new CharacterAnimator(scene, []);
registerProceduralClips(an, scene, rig.skeleton); registerAuthoredClips(an, scene, rig.skeleton);
const y=(b:string)=>{const n=boneNode(rig.skeleton,b); if(!n) return NaN; n.computeWorldMatrix(true); return n.getAbsolutePosition().y;};
for (const clip of ['dunk_mocap','dunk_charge_gather','dunk_launch','dunk_score_hang','dunk_land_crouch']) {
  const g = scene.animationGroups.find(x=>x.name===clip); if(!g){ console.log(`${clip} missing`); continue; }
  g.start(true); g.pause();
  console.log(`\n${clip}`);
  for(let i=0;i<=10;i++){ const f=g.from+(g.to-g.from)*i/10; g.goToFrame(f); scene.render();
    const lo=Math.min(y('LeftFoot'),y('RightFoot')), hips=y('Hips'), rh=y('RightHand');
    const flag = lo < -0.05 ? '  <-- foot under the floor' : '';
    console.log(`  t=${(i/10).toFixed(1)}  foot ${lo.toFixed(3)}  hips ${hips.toFixed(2)}  rHand ${rh.toFixed(2)}${flag}`); }
  g.stop();
}
