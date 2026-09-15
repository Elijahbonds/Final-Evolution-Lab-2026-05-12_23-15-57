// opponentMotion — an AI body moves like a person who was captured, not like keyframes (EVERYONE-BODY-MOCAP-OPPONENTS,
// 2026-09-14).
//
// Owner: "improve what their AI opponent animations look like, can't be procedural. Make it look nice." The opponents
// played the same authored pose clips as the player (three keys for a crossover). The captured clips in
// authored/mocapOpponents.ts each name the authored clip they REPLACE; this installs them on an opponent's animator and
// swaps the name at play time. So no mode changes: the 1v1 foe's tree still asks for `bball_crossover_left`, and the
// body plays the capture.
//
// ONLY OPPONENTS. The player's clips are tuned against his controls — the meter-paced shot, the dribble IK, the dunk
// hands — and swapping them is a different pass with its own sign-off. CharacterLibrary installs this on every spawn it
// decides is not the player (athleteRoster's rule), so it is one place, not N modes.
//
// Build cost is paid only for what the mode may play: a clip is built when its SCOPE allows it (a board mode's rival
// builds none of the hoops captures).

import type { Scene, Skeleton } from '@babylonjs/core';
import type { CharacterAnimator, PlayOpts } from './CharacterAnimator';
import { CLIP_ALIASES } from './clipAliases';
import { scopeAllows, scopeForScene, type ClipScope } from './clipScope';
import { MOCAP_OPPONENT_CLIPS, buildMocapOpponentClip } from './authored/mocapOpponents';

/** authored clip name → captured clip name. */
export const OPPONENT_VARIANTS: ReadonlyMap<string, string> = new Map(MOCAP_OPPONENT_CLIPS.map((c) => [c.replaces, c.name]));

/** The name an opponent should really play for a request, given what its rig owns. Pure. */
export function variantFor(requested: string, owned: Set<string>): string {
  // the request itself, or the clip its ALIAS names — never the resolver's fuzzy fallback, which hands an unknown
  // name whatever the rig owns (measured: `idle_stand` on a rig without it swapped to a captured crossover)
  const v = OPPONENT_VARIANTS.get(requested) ?? OPPONENT_VARIANTS.get(CLIP_ALIASES[requested]?.[0] ?? '');
  return v && owned.has(v) ? v : requested;
}

type Tagged = CharacterAnimator & { __opponentMotion?: string[] };

/**
 * Build this scope's captured clips onto an opponent's rig and route its plays through them. Idempotent. Returns the
 * clip names installed. Call AFTER registerAuthoredClips / neverBindPose / installSafePlay so the swap is the outermost
 * wrapper (the name the inner wrappers see is already the captured one).
 */
export function installOpponentMotion(animator: CharacterAnimator, scene: Scene, skeleton: Skeleton, scope: ClipScope | null = scopeForScene(scene)): string[] {
  const a = animator as Tagged;
  if (a.__opponentMotion) return a.__opponentMotion;
  const installed: string[] = [];
  for (const clip of MOCAP_OPPONENT_CLIPS) {
    if (!scopeAllows(scope, clip.name)) continue;
    try {
      const g = buildMocapOpponentClip(scene, skeleton, clip);
      if (g) { animator.register(g); installed.push(clip.name); }
    } catch (e) {
      // a capture that cannot fit this rig must never cost the spawn its authored clip
      console.warn(`[FEL-ANIM] opponent capture "${clip.name}" failed to build: ${(e as Error)?.message ?? e}`);
    }
  }
  a.__opponentMotion = installed;
  if (!installed.length) return installed;
  const rawPlay = animator.play.bind(animator);
  const rawScale = animator.setPlaybackScale.bind(animator);
  animator.play = (name: string, opts: PlayOpts = {}) => rawPlay(variantFor(name, animator.clipNames), opts);
  animator.setPlaybackScale = (name: string, scale: number) => rawScale(variantFor(name, animator.clipNames), scale);
  console.info(`[FEL-ANIM] opponent captures: ${installed.join(', ')}`);
  return installed;
}
