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
