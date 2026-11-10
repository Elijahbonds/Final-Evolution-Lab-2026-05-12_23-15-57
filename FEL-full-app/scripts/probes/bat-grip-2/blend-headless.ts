// BAT-GRIP-2 (2026-11-10): the fists through the batter's clip changes, headless on the procedural rig (the rig
// rig-grip-tests measures on). No browser: prints, per 60 Hz frame, the distance between the fists (placeTwoHandBat's own
// fist points) while one clip blends into the next, the way each baseball mode asks for it.
// Usage: npx tsx scripts/probes/bat-grip-2/blend-headless.ts
import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { buildRig } from '../../../lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from '../../../lib/babylon/characters/proceduralClips';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { boneNode } from '../../../lib/babylon/anim/boneLookup';
import { BASEBALL_CLIP_FOR } from '../../../lib/babylon/anim/baseballTree';
import { BAT_PALM_M } from '../../../lib/babylon/modes/baseballBat';

const engine = new NullEngine(); const scene = new Scene(engine);
new FreeCamera('cam', new Vector3(0, 0, -5), scene);
(engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
scene.useConstantAnimationDeltaTime = true;
const rig = buildRig(scene, 'default');
const animator = new CharacterAnimator(scene, []);
registerProceduralClips(animator, scene, rig.skeleton);
registerAuthoredClips(animator, scene, rig.skeleton);
const b = (n: string) => boneNode(rig.skeleton, n)!;
const fist = (h: string, f: string) => { const H = b(h), F = b(f); H.computeWorldMatrix(true); F.computeWorldMatrix(true); const p = H.getAbsolutePosition().clone(); return p.add(p.subtract(F.getAbsolutePosition()).normalize().scale(BAT_PALM_M)); };
const sep = () => Vector3.Distance(fist('LeftHand', 'LeftForeArm'), fist('RightHand', 'RightForeArm'));

function blend(from: string, to: string, fadeSec: number, opts: { loop?: boolean; speedRatio?: number } = {}): number[] {
  animator.play(from, { loop: true, fadeSec: 0 });
  for (let i = 0; i < 40; i++) scene.render();
  animator.play(to, { loop: opts.loop ?? true, fadeSec, speedRatio: opts.speedRatio });
  const out: number[] = [];
  for (let i = 0; i < 30; i++) { scene.render(); out.push(+sep().toFixed(3)); }
  return out;
}
const S = BASEBALL_CLIP_FOR;
const rows: [string, string, string, number][] = [
  ['dejected/idle → stance (innings, after a strikeout or a fly out)', S.dejected.clip, S.stance.clip, S.stance.fadeSec],
  ['run → stance (innings, after a hit)', S.run.clip, S.stance.clip, S.stance.fadeSec],
  ['celebrate → stance (innings, after a run scores)', S.celebrate.clip, S.stance.clip, S.stance.fadeSec],
  ['slide → stance', S.slide.clip, S.stance.clip, S.stance.fadeSec],
  ['stance → swing_contact', S.stance.clip, S.swing_contact.clip, S.swing_contact.fadeSec],
  ['stance → swing_power', S.stance.clip, S.swing_power.clip, S.swing_power.fadeSec],
  ['swing_contact → stance', S.swing_contact.clip, S.stance.clip, S.stance.fadeSec],
  ['stance → stance (control: one grip throughout)', S.stance.clip, S.stance.clip, S.stance.fadeSec],
];
for (const [label, from, to, fade] of rows) {
  const s = blend(from, to, fade);
  const apart = s.filter((x) => x > 0.15).length;
  console.log(`${label}\n  fade ${fade}s  first ${s[0]}  max ${Math.max(...s)}  frames > 0.15 m: ${apart}  frames > 0.30 m: ${s.filter((x) => x > 0.30).length}  frames > 0.40 m: ${s.filter((x) => x > 0.40).length}\n  ${s.slice(0, 16).join(' ')}`);
}
scene.dispose(); engine.dispose();
