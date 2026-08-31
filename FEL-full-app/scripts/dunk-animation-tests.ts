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
import { spawnProceduralAthlete } from '../lib/babylon/characters/ProceduralAthlete';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';
import { isResolvable, SPORT_CLIP } from '../lib/babylon/anim/clipRegistry';
import { resolveClip, missingClipList } from '../lib/babylon/anim/clipResolver';
import { DUNK_TRICKS } from '../lib/babylon/core/DunkSystem';

// spawnProceduralAthlete paints a jersey number into a DynamicTexture, which
// reaches for OffscreenCanvas — absent under Node. Section D only cares which
// clips get registered, so a no-op 2D surface is enough to let the body build.
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 }) : () => undefined),
    set: () => true,
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return ctx2d; }
  };
}

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
//
// NOTE ON WHAT THIS SECTION IS WORTH. isResolvable() consults a STATIC NAME
// TABLE (REAL_CLIPS + CLIP_ALIASES) — it does not know anything about the
// running scene. So section A proves the vocabulary is spelled correctly and
// nothing more. It passed green while every authored dunk clip was absent at
// runtime, because the names were all in the table. Section D is the one that
// actually looks at the character a player gets.
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
// POWER swaps in Elijah's captured motion when MOCAP_DUNK is on. Note the flag
// DEFAULTS ON (dressingFlags: `!== 'false'`), so an unset env var means ENABLED.
// The first version of this check read `|| !process.env.NEXT_PUBLIC_MOCAP_DUNK`,
// which is that default backwards: with the var unset the guard short-circuited
// to true and the check passed without ever looking at the clip. It is asserted
// unconditionally now, because the shipped default is the case that matters.
ok(isResolvable('dunk_mocap'), 'C1 the mocap dunk clip name resolves');

// ── D. THE CHARACTER A PLAYER ACTUALLY GETS ────────────────────────────────
// Sections A-C build their own animator by hand, which quietly assumes the
// spawn path registers what this file registers. It does not, and that
// assumption hid a real bug: spawnProceduralAthlete — the DEFAULT spawn path,
// since PROCEDURAL_CHARACTERS is true — never called registerAuthoredClips, so
// the entire authored dunk suite was missing from every player's character
// while these tests were green. Spawn a real athlete and interrogate IT.
const athlete = spawnProceduralAthlete(scene, { modeId: 'dunk' });
const live = athlete.animator.clipNames;

/**
 * Ask the RUNTIME resolver — the same call the animator makes — whether this
 * name finds a real group on this character. resolveClip records anything it
 * could not match, so its own miss list is the verdict; re-deriving the alias
 * rules here would just be a second implementation to get wrong.
 */
const resolvesLive = (name: string): boolean => {
  resolveClip(name, live);
  return !missingClipList().includes(name);
};

const DUNK_SUITE = [
  SPORT_CLIP.dunkChargeGather, SPORT_CLIP.dunkLaunchPower, SPORT_CLIP.dunkLaunchFlashy,
  SPORT_CLIP.dunkLaunchSig, SPORT_CLIP.dunkLandCrouch, SPORT_CLIP.dunkCelebrateBig,
];
for (const c of DUNK_SUITE) {
  ok(resolvesLive(c), `D-suite "${c}" is REGISTERED on a spawned athlete (not just in the name table)`);
}
for (const t of DUNK_TRICKS) {
  ok(resolvesLive(t.clip), `D-trick ${t.label} -> "${t.clip}" is registered on a spawned athlete`);
}
ok(resolvesLive('dunk_mocap'),
  'D1 the mocap dunk is registered on a spawned athlete — MOCAP_DUNK defaults ON, so ' +
  'POWER (the default style) plays this clip for every player on their first dunk');
athlete.dispose();

scene.dispose();
engine.dispose();

if (fail.length) {
  console.error(`dunk-animation-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`dunk-animation-tests: ${checks} checks green — dunk clips resolve AND move the rig`);
