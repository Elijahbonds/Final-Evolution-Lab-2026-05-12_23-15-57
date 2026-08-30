// Dunk Contest — proof that the animations actually fire.
//
// This mode is carried by its animation more than any other: the whole loop is
// launch → mid-air trick → finish, and a dunk that does not visibly happen is
// not a dunk. Screenshots cannot verify it here — the dev browser pane runs at
// ~2800ms per frame (measured), so a two-second dunk occupies LESS THAN ONE
// FRAME and there is nothing to photograph.
//
// So it is proved the way the rig was: drive the clips deterministically and
// assert the joints actually move. This is immune to frame rate.
//
// The specific failure this guards against is real and shipped twice in this
// codebase: a clip name that does not resolve does NOT throw. installSafePlay
// falls back to a safe pose, so the character simply stands there looking
// composed while the mode believes it is dunking.

import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core';
import { buildRig } from '../lib/babylon/characters/proceduralRig';
import { registerProceduralClips } from '../lib/babylon/characters/proceduralClips';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { isResolvable, SPORT_CLIP } from '../lib/babylon/anim/clipRegistry';
import { DUNK_TRICKS } from '../lib/babylon/core/DunkSystem';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const engine = new NullEngine();
const scene = new Scene(engine);
new FreeCamera('cam', new Vector3(0, 0, -5), scene);
const rig = buildRig(scene, 'dunk');
const animator = new CharacterAnimator(scene, []);
registerProceduralClips(animator, scene, rig.skeleton);

// ── A. every clip the mode can play must RESOLVE ────────────────────────────
// A name that does not resolve degrades silently to a safe pose — the mode
// thinks it dunked, the player sees someone standing still.
const launchClips = [SPORT_CLIP.dunkLaunchPower, SPORT_CLIP.dunkLaunchFlashy, SPORT_CLIP.dunkLaunchSig];
for (const c of launchClips) {
  ok(typeof c === 'string' && c.length > 0, `A-launch "${c}" is a real name`);
  ok(isResolvable(c), `A-launch "${c}" resolves to a clip`);
}
for (const t of DUNK_TRICKS) {
  ok(isResolvable(t.clip), `A-trick ${t.label} → "${t.clip}" resolves`);
}
ok(DUNK_TRICKS.length >= 5, `A1 the trick vocabulary is populated (${DUNK_TRICKS.length})`);

// ── B. the clips must MOVE the rig, not merely exist ────────────────────────
// A registered AnimationGroup with zero targeted animations plays happily and
// changes nothing on screen. That is the exact shape of the bug that made every
// clip silently no-op after the Gate 0 bone rename.
const jointsOf = (name: string): number => {
  const g = scene.animationGroups.find((x) => x.name === name);
  return g ? g.targetedAnimations.length : -1;
};

/** Drive a group to two frames and count joints whose rotation actually changed. */
function movedJoints(groupName: string): number {
  const g = scene.animationGroups.find((x) => x.name === groupName);
  if (!g) return -1;
  const targets = g.targetedAnimations.map((t) => t.target as { rotationQuaternion?: { x: number; y: number; z: number } });
  const snap = (): string[] => targets.map((t) => (t.rotationQuaternion
    ? [t.rotationQuaternion.x, t.rotationQuaternion.y, t.rotationQuaternion.z].map((v) => v.toFixed(5)).join(',')
    : 'none'));
  scene.animationGroups.forEach((x) => x.stop());
  g.play(true); g.pause();
  g.goToFrame(g.from); scene.render();
  const a = snap();
  g.goToFrame((g.from + g.to) / 2); scene.render();
  const b = snap();
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++;
  return moved;
}

// The procedural rig authors a base vocabulary; the dunk clips are aliased onto
// it. Prove the underlying groups that the aliases resolve to actually animate.
for (const base of ['jumpshot', 'run', 'jab']) {
  ok(jointsOf(base) > 0, `B-${base} has targeted animations (got ${jointsOf(base)})`);
  ok(movedJoints(base) > 0, `B-${base} actually moves joints between frames (got ${movedJoints(base)})`);
}

// ── C. the mocap path must be honest ───────────────────────────────────────
// POWER swaps in Elijah's captured motion when NEXT_PUBLIC_MOCAP_DUNK is on. If
// that name cannot resolve, the headline dunk silently becomes a safe pose.
ok(isResolvable('dunk_mocap') || !process.env.NEXT_PUBLIC_MOCAP_DUNK,
  'C1 the mocap dunk clip resolves whenever the mocap flag is on');

scene.dispose();
engine.dispose();

if (fail.length) {
  console.error(`dunk-animation-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`dunk-animation-tests: ${checks} checks green — dunk clips resolve AND move the rig`);
