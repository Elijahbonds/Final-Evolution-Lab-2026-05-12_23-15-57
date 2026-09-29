// hoopsHand — the whole hoops vocabulary right-handed on screen (HOOPS MOTION phase 3, 2026-09-25; owner round 2: "right-handed
// everywhere: shots, layups, handles and the carry, on every body. The clips are mirrored, as the dunk pass did").
//
// The spawn resets the importer's (1, 1, −1) root, so every body renders as its model's mirror image (groupMirror.ts): a clip
// authored around rig RightHand — every `bball_*` clip, authored or captured — plays left-handed on screen. The dunk pass fixed the
// dunks by mirroring the `dunk_*` family onto the other side of the body and carrying the ball in rig LeftHand (dunkHand.ts). This
// does the same for the `bball_*` family, on every hoops body, AFTER installOpponentMotion has built the captures (so they are
// mirrored too); mirrorGroupsInPlace is idempotent per group (felMirrored), so a second call — or a clip built later — is safe.
// With it, a clip's name and its side agree with the athlete as drawn: `bball_layup_right` finishes with the hand on his right.
import type { AbstractMesh, AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import { mirrorGroupsInPlace } from './groupMirror';
import { gatherBallToHand, attachBallToHand, trackDrawnBall } from './ballRig';
import { rigHandOnSide, type AthleteSide, type RigHand } from './athleteSide';
import { variantFor } from './opponentMotion';

/** The families a hoops body plays mirrored (the dunks are dunkHand's). */
export const HOOPS_MIRROR = /^bball_/;

/** Mirror this body's `bball_*` groups onto its other side, in place — once per group. Returns how many were mirrored now. */
export function rightHandHoops(animator: unknown, skeleton: Skeleton): number {
  const groups = (animator as { groups?: Map<string, AnimationGroup> }).groups;
  if (!groups) return 0;
  return mirrorGroupsInPlace([...groups.values()].filter((g) => HOOPS_MIRROR.test(g.name)), skeleton).length;
}

/** The ball opts into the mirrored left palm (ballRig.palmOffsetOf): in rig LeftHand it sits IN the palm, not through the wrist. */
export function rightHandBall(ball: AbstractMesh): void { (ball.metadata ??= {}).felPalmMirrorLeft = true; trackDrawnBall(ball); }

/** The rig hand drawn on the athlete's `side` for this body (athleteSide). */
export function hoopsHand(body: { skeleton: Skeleton; root: TransformNode }, side: AthleteSide = 'right'): RigHand {
  return rigHandOnSide(body.skeleton, body.root, side);
}

/** The ball into the hand drawn on the athlete's `side` — a gather when it is within reach, straight in on a reset. */
export function ballToAthleteHand(ball: AbstractMesh, body: { skeleton: Skeleton; root: TransformNode }, side: AthleteSide = 'right', gather = true): boolean {
  const hand = hoopsHand(body, side);
  return gather ? gatherBallToHand(ball, body.skeleton, hand) : attachBallToHand(ball, body.skeleton, hand);
}

/** HOOPS MOTION phase 4b (plan §3.5, U4): the dribble loops the `_left` twins are made of (the tree's CLIP_FOR names — each resolves to
 *  the capture this rig plays for it, installOpponentMotion's variantFor). */
export const LEFT_TWIN_LOOPS = ['bball_dribble_idle', 'bball_dribble_walk', 'bball_dribble_jog', 'bball_dribble_run'] as const;
/**
 * The dribble loops with the ball in the athlete's LEFT hand, made at spawn as runtime mirrors (the groupMirror path phase 3 uses — no
 * manifest row, no generated clip): each loop this rig plays (the capture for its name, or the authored clip) is cloned — its animations
 * and their keys copied — and mirrored across the body again, so the right-handed-on-screen loop plays left-handed, and registered under
 * the name the tree asks for (`bball_dribble_idle_left` …: basketballTree.leftTwinOf). Call AFTER rightHandHoops (the source must already
 * be right-handed on screen). Idempotent. Returns the names registered now.
 */
export function leftDribbleTwins(animator: unknown, skeleton: Skeleton): string[] {
  const a = animator as { groups?: Map<string, AnimationGroup>; register?: (g: AnimationGroup) => void; clipNames?: Set<string> };
  const groups = a.groups; if (!groups || typeof a.register !== 'function') return [];
  const made: string[] = [];
  for (const base of LEFT_TWIN_LOOPS) {
    const name = `${base}_left`;
    if (groups.has(name)) continue;
    const src = groups.get(variantFor(base, new Set(groups.keys())));
    if (!src || !(src.metadata as { felMirrored?: boolean } | null)?.felMirrored) continue;   // not right-handed yet: nothing to twin
    const twin = src.clone(name, undefined, true, true);
    twin.metadata = { ...(src.metadata ?? {}), felMirrored: false, felLeftTwinOf: src.name };   // (clone shares the metadata object)
    mirrorGroupsInPlace([twin], skeleton);
    a.register(twin);
    made.push(name);
  }
  return made;
}
