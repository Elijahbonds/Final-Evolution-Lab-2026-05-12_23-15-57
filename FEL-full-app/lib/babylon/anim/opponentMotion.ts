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

/** authored clip name → the captured clips that stand in for it, one per sport (a hoops rig builds `bball_mc_run`, a
 *  football rig `football_mc_run`; each plays whichever its scope built). */
export const OPPONENT_VARIANTS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const c of MOCAP_OPPONENT_CLIPS) (m.get(c.replaces) ?? m.set(c.replaces, []).get(c.replaces)!).push(c.name);
  return m;
})();

/** The name an opponent should really play for a request, given what its rig owns. Pure. */
export function variantFor(requested: string, owned: Set<string>): string {
  // the request itself, or the clip its ALIAS names — never the resolver's fuzzy fallback, which hands an unknown
  // name whatever the rig owns (measured: `idle_stand` on a rig without it swapped to a captured crossover)
  // — and an alias only when the rig does NOT own the requested clip itself: idle_stand, jump_land and fall_loop all alias to
  // `guard`, and a captured guard must not replace an idle the rig really has
  const pick = (name: string | undefined) => (name ? OPPONENT_VARIANTS.get(name)?.find((v) => owned.has(v)) : undefined);
  return pick(requested) ?? (owned.has(requested) ? undefined : pick(CLIP_ALIASES[requested]?.[0])) ?? requested;
}

type Tagged = CharacterAnimator & { __opponentMotion?: string[] };

// THE PLAYER MOVES LIKE A CAPTURED PERSON TOO (HOOPS MOVEMENT, owner 2026-09-15: "real basketball like movements and
// animations happening consistently" · "the arm movement isn't natural"). The hero's hoops clips were three-key authored
// poses while the rival right beside him ran CMU captures — the two bodies on one court moved like two different games.
// Owner decisions: one shared hoops motion set, you and the AI, every body, every hoops mode. So the hero installs the
// same captures, limited to the hoops set (the fight, football and board captures stay the opponents' until their own
// passes), and every timing the modes read off a clip — its duration, its release frame — follows the clip that PLAYS.
export const HERO_CAPTURE = (name: string): boolean => name.startsWith('bball_mc_') || name.startsWith('karate_mc_');
// THE HUNDRED (owner 2026-09-15, "mocap on disk… onto the HERO too"): the fighter's strikes, reactions and get-up are the
// captures as well, so a string you throw looks like a person throwing it — and like the partner and the horde beside you.

/** Where the ball leaves the hand, as a fraction of each shot clip. The authored `jumpshot` releases at 0.45
 *  (BallHandling.RELEASE_FRAME_01). The CMU 06_15 window (2.20–3.10 s) sets at the chin, dips 2.30–2.55, rises, and
 *  the shooting hand extends forward 2.80–2.95 (hoops-timeline.mts): the release is 0.68 s in, 0.75 of the clip. */
export const CAPTURE_RELEASE_01: Readonly<Record<string, number>> = { bball_mc_jumpshot: 0.75 };

/** The release fraction of whatever clip a request for `name` really plays on this animator. */
export function releaseFrameOf(animator: CharacterAnimator, name: string, fallback: number): number {
  const played = variantFor(name, animator.clipNames);
  return CAPTURE_RELEASE_01[played] ?? fallback;
}

/**
 * Build this scope's captured clips onto an opponent's rig and route its plays through them. Idempotent. Returns the
 * clip names installed. Call AFTER registerAuthoredClips / neverBindPose / installSafePlay so the swap is the outermost
 * wrapper (the name the inner wrappers see is already the captured one).
 */
export function installOpponentMotion(animator: CharacterAnimator, scene: Scene, skeleton: Skeleton, scope: ClipScope | null = scopeForScene(scene), only: (name: string) => boolean = () => true): string[] {
  const a = animator as Tagged;
  if (a.__opponentMotion) return a.__opponentMotion;
  const installed: string[] = [];
  for (const clip of MOCAP_OPPONENT_CLIPS) {
    if (!only(clip.name) || !scopeAllows(scope, clip.name)) continue;
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
  const rawDur = animator.durationOf.bind(animator);
  animator.play = (name: string, opts: PlayOpts = {}) => rawPlay(variantFor(name, animator.clipNames), opts);
  animator.setPlaybackScale = (name: string, scale: number) => rawScale(variantFor(name, animator.clipNames), scale);
  // a mode paces a shot off `durationOf('jumpshot')` — it must read the clip that will actually play
  animator.durationOf = (name: string) => rawDur(variantFor(name, animator.clipNames));
  console.info(`[FEL-ANIM] opponent captures: ${installed.join(', ')}`);
  return installed;
}
