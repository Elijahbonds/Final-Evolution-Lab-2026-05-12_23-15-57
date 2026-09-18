// STYLE MOTION — a fighting style you pick brings its own MOVES, not only its numbers (2026-09-15, owner: "add more dynamic
// moves like 360 hook kicks, capoeira like movements like youre break dancing if you choose that style, advanced taekwando
// and tricking, parkour"). Decisions: styles in The Hundred AND the versus fights; parkour in Free Run AND The Hundred.
//
// A school (combat/schools.ts) scaled speed / reach / guard and every school threw the same strikes. A VOCABULARY is the
// other half: CAPOEIRA (armada, au, au kick, macaco, esquiva, a breaker's windmill, helicopter and footwork sweep) and TRICKING (the 360
// hook, butterfly, 540, flash kick, backflip, side flip), each a set of captures (authored/mocapStyles.ts) that stand in
// for the base moves the fight modes already ask for. Like opponentMotion, it is a name swap at play time — no fight mode
// changes the clip names it requests — installed OUTERMOST, so a style move wins over the plain capture it replaces.
// Parkour clips (pk_*) are installed alongside and played by name where a mode has a parkour beat.

import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import type { CharacterAnimator, PlayOpts } from './CharacterAnimator';
import { MOCAP_STYLE_CLIPS, buildMocapStyleClip, type StyleVocab } from './authored/mocapStyles';
import { MoveRootLayer } from './MoveRootLayer';

export type { StyleVocab };

/** base clip name → the style clip that stands in for it, per vocabulary. */
const VARIANTS: ReadonlyMap<StyleVocab, ReadonlyMap<string, string>> = (() => {
  const m = new Map<StyleVocab, Map<string, string>>();
  for (const c of MOCAP_STYLE_CLIPS) (m.get(c.style) ?? m.set(c.style, new Map()).get(c.style)!).set(c.replaces, c.name);
  return m;
})();

/**
 * Where a vocabulary has no capture of its own for a base move, it BORROWS a clean one: capoeira's light links are kicks,
 * never a boxer's jab. (The "monkey sequence" crescents CMU has are a crouched ape walk and read as crawling — dropped.)
 */
export const STYLE_BORROWS: Readonly<Record<StyleVocab, Readonly<Record<string, string>>>> = {
  capoeira: { jab: 'karate_mc_roundhouse', karate_cross: 'karate_mc_backspin', high_kick: 'karate_mc_high_kick', karate_heavy: 'cap_armada' },
  tricking: { jab: 'karate_mc_high_kick', karate_heavy: 'trick_jump_spin_kick' },
  parkour: {},
};

/** What a request for `requested` plays under `vocab`, given the rig's clips. Pure. */
export function styleVariant(requested: string, vocab: StyleVocab | null, owned: Set<string>): string {
  if (!vocab) return requested;
  const v = VARIANTS.get(vocab)?.get(requested);
  if (v && owned.has(v)) return v;
  const b = STYLE_BORROWS[vocab]?.[requested];
  return b && owned.has(b) ? b : requested;
}

/** The name a style move is called on the banner (null for a base move). */
export function styleLabel(name: string): string | null {
  return MOCAP_STYLE_CLIPS.find((c) => c.name === name)?.label ?? null;
}

/** Does this clip turn the body over with a root track? (A mode's own spin layer stands down for it.) */
export function hasRootTrack(name: string): boolean {
  return !!MOCAP_STYLE_CLIPS.find((c) => c.name === name)?.root?.length;
}

/** The style clip names of a vocabulary. */
export function vocabClips(vocab: StyleVocab): string[] {
  return MOCAP_STYLE_CLIPS.filter((c) => c.style === vocab).map((c) => c.name);
}

type Tagged = CharacterAnimator & { __styleMotion?: { vocab: StyleVocab | null; installed: string[]; layer: MoveRootLayer } };

/**
 * Build `vocab`'s moves (and, with `parkour`, the parkour set) onto a rig, route plays through the swap, and start the root
 * layer for every clip that carries a track. Idempotent per animator. Call AFTER installOpponentMotion so this is the
 * outermost wrapper.
 */
export function installStyleMotion(
  animator: CharacterAnimator, scene: Scene, skeleton: Skeleton, root: TransformNode,
  vocab: StyleVocab | null, opts: { parkour?: boolean } = {},
): { installed: string[]; layer: MoveRootLayer } {
  const a = animator as Tagged;
  if (a.__styleMotion) return a.__styleMotion;
  const want = new Set<StyleVocab>([...(vocab ? [vocab] : []), ...(opts.parkour ? ['parkour' as const] : [])]);
  const installed: string[] = [];
  for (const clip of MOCAP_STYLE_CLIPS) {
    if (!want.has(clip.style)) continue;
    try {
      const g = buildMocapStyleClip(scene, skeleton, clip);
      if (g) { animator.register(g); installed.push(clip.name); }
    } catch (e) {
      console.warn(`[FEL-STYLE] "${clip.name}" failed to build: ${(e as Error)?.message ?? e}`);
    }
  }
  const layer = new MoveRootLayer(scene, root, skeleton,
    MOCAP_STYLE_CLIPS.filter((c) => installed.includes(c.name) && c.root?.length).map((c) => ({ name: c.name, duration: c.duration, keys: c.root! })));
  a.__styleMotion = { vocab, installed, layer };
  if (vocab && installed.length) {
    const rawPlay = animator.play.bind(animator);
    const rawScale = animator.setPlaybackScale.bind(animator);
    const rawDur = animator.durationOf.bind(animator);
    animator.play = (name: string, o: PlayOpts = {}) => rawPlay(styleVariant(name, vocab, animator.clipNames), o);
    animator.setPlaybackScale = (name: string, scale: number) => rawScale(styleVariant(name, vocab, animator.clipNames), scale);
    animator.durationOf = (name: string) => rawDur(styleVariant(name, vocab, animator.clipNames));
  }
  scene.onDisposeObservable.addOnce(() => layer.dispose());
  console.info(`[FEL-STYLE] ${vocab ?? 'no vocabulary'}${opts.parkour ? ' + parkour' : ''}: ${installed.length} captured moves`);
  return a.__styleMotion;
}

/** The style layer on an animator, if one was installed (a mode reads it to know what a move really plays). */
export function styleMotionOf(animator: CharacterAnimator): { vocab: StyleVocab | null; installed: string[]; layer: MoveRootLayer } | null {
  return (animator as Tagged).__styleMotion ?? null;
}
