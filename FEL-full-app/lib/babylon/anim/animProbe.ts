// animProbe — the body readout a QA eye can take on the PRODUCTION server (SHARED-ANIM-BUS, 2026-09-14).
//
// The skate H1 grade ("dunk-clips / stiff arms") was read off two things a production page could not give it: a
// console line truncated at 500 characters, and bone positions through `__FEL_DEV__.scene`, which only a development
// build publishes. So the recorder ran zero frames, the elbow check defaulted to FAIL, and the clip check matched `dunk`
// in the first 500 characters of a registration log. This hands the eye the answer as data: the clip scope, what is
// registered / out of scope / refused, what is playing on the hero, and the hero's hands in the chest frame with the
// LocoBus arms verdict for the window its clip belongs to. Plain values only — nothing it returns holds the scene.

import type { Scene, TransformNode } from '@babylonjs/core';
import { animReadout, type AnimReadout } from './clipScope';
import { boneNode } from './boneLookup';
import { armsVerdict, handsInChest, type ArmWindow, type ArmsVerdict, type HandInChest } from './LocoBus';

/** The arms window a clip is judged in — strict for loops a body lives in, free for strikes, tricks and flushes. */
export function armWindowOf(clip: string): ArmWindow {
  if (/^(baseball_stance|golf_address_idle|keeper_set|tennis_ready|volleyball_ready)$/.test(clip)) return 'stance';
  if (/^(board_ride_idle|board_push)$/.test(clip)) return 'ride';
  if (/^(football_carry_run)$/.test(clip)) return 'carry';
  if (/(td_spike|celebrate)/.test(clip)) return 'celebrate';
  if (/^(idle_stand|walk|run|strafe_left|strafe_right)$/.test(clip)) return 'loco';
  return 'free';
}

export interface HeroBodyReadout {
  playing: { clip: string; weight: number }[];
  window: ArmWindow;
  hands: { left: HandInChest; right: HandInChest } | null;
  arms: ArmsVerdict | null;
}

export function readHeroBody(scene: Scene, root: TransformNode | null): HeroBodyReadout | null {
  if (!root) return null;
  const under = new Set(root.getDescendants(false));
  const sk = scene.skeletons.find((s) => s.bones.some((b) => { const n = b.getTransformNode(); return !!n && under.has(n); }));
  if (!sk) return null;
  const node = (name: string) => boneNode(sk, name);   // Gate 0: the shared lookup (prefix / suffix tolerant), never an exact match
  const bones = { hips: node('Hips'), neck: node('Neck'), leftShoulder: node('LeftArm'), rightShoulder: node('RightArm'), leftHand: node('LeftHand'), rightHand: node('RightHand') };
  const targets = new Set(sk.bones.map((b) => b.getTransformNode()).filter(Boolean));
  const weight = (g: { weight?: number }) => (g.weight === undefined || g.weight < 0 ? 1 : g.weight);
  const playing = scene.animationGroups
    .filter((g) => g.isPlaying && weight(g) > 0.05 && g.targetedAnimations.some((t) => targets.has(t.target)))
    .map((g) => ({ clip: g.name, weight: +weight(g).toFixed(2) }));
  const top = playing[playing.length - 1]?.clip ?? '';
  const window = armWindowOf(top);
  if (Object.values(bones).some((b) => !b)) return { playing, window, hands: null, arms: null };
  const at = (n: TransformNode | null) => { n!.computeWorldMatrix(true); const p = n!.getAbsolutePosition(); return { x: p.x, y: p.y, z: p.z }; };
  const m = root.computeWorldMatrix(true).m;
  const hands = handsInChest({
    hips: at(bones.hips), neck: at(bones.neck), leftShoulder: at(bones.leftShoulder), rightShoulder: at(bones.rightShoulder),
    leftHand: at(bones.leftHand), rightHand: at(bones.rightHand),
  }, { x: m[8], y: m[9], z: m[10] });
  const round = (h: HandInChest): HandInChest => ({ fwd: +h.fwd.toFixed(3), up: +h.up.toFixed(3), out: +h.out.toFixed(3) });
  return { playing, window, hands: { left: round(hands.left), right: round(hands.right) }, arms: armsVerdict(window, hands.left, hands.right) };
}

export type AnimProbeReadout = AnimReadout & { hero: HeroBodyReadout | null };

/** The probe handle's `anim()` — scene held weakly, so a probe that keeps the handle does not keep a disposed mount. */
export function makeAnimProbe(scene: Scene, hero: () => TransformNode | null): () => AnimProbeReadout | null {
  // WeakRef is ES2021 (this tree's lib is es2020); every browser the game runs in has it
  const WR = (globalThis as { WeakRef?: new (t: Scene) => { deref(): Scene | undefined } }).WeakRef;
  const ref = WR ? new WR(scene) : { deref: () => scene };
  return () => {
    const s = ref.deref();
    if (!s || s.isDisposed) return null;
    return { ...animReadout(s), hero: readHeroBody(s, hero()) };
  };
}
