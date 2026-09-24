// dunkHand — a game dunk goes up in the DUNKING hand (DUNK MOTION phase 11, 2026-09-24).
//
// Owner decision (2026-09-23): right-handed, "every dunk, every body" — the contest, Dunk Duel, the rival, and the 1v1 / 3v3 game
// dunks. The spawn resets the importer's (1, 1, −1) root, so every body renders as its model's mirror image: the rig's RIGHT hand is
// the one on the screen's LEFT, and the dunk family (authored around RightHand) dunked left-handed. The contest's fix (DunkMode, phase
// 8) is the one used here: mirror the dunk family onto the other side of the body (groupMirror) and put the ball in the rig's LEFT
// hand — the one that renders as the right.
//
// A game dunk comes off a live dribble, and the dribble goes wherever the handle put it (a crossover leaves it in either hand), so the
// ball is handed to the dunking hand over the take-off — both palms are on it there — instead of snapping across the body.
import type { AbstractMesh, AnimationGroup, Skeleton } from '@babylonjs/core';
import { attachBallToHand, runHandOffPath, type HandOffSpec } from './ballRig';
import { mirrorGroupsInPlace } from './groupMirror';

/** The rig hand a right-handed body dunks with (it renders as the body's right). */
export const DUNK_HAND: 'LeftHand' | 'RightHand' = 'LeftHand';
/** The take-off's pass into the dunking hand, on the dunk's own clock (seconds): centred here, blended either side. */
export const DUNK_PASS_AT = 0.1, DUNK_PASS_BLEND = 0.08;

/** Mirror this body's dunk family (`dunk_*`) onto its other side — once; a second call is a no-op. Returns how many were mirrored. */
export function rightHandDunks(animator: unknown, skeleton: Skeleton): number {
  const groups = (animator as { groups?: Map<string, AnimationGroup> }).groups;
  if (!groups) return 0;
  return mirrorGroupsInPlace([...groups.values()].filter((g) => g.name.startsWith('dunk_')), skeleton).length;
}

/** Which rig hand holds the ball now (by its parent), or null when it is loose. */
export function ballHandOf(ball: AbstractMesh): 'LeftHand' | 'RightHand' | null {
  const n = ball.parent?.name ?? '';
  return /LeftHand/.test(n) ? 'LeftHand' : /RightHand/.test(n) ? 'RightHand' : null;
}

/**
 * The ball into the dunking hand for a dunk starting now. A loose ball is put straight in it; a ball already there stays; a ball in
 * the other hand is passed across over the take-off. Call the returned stepper every frame of the dunk with its clock in seconds.
 */
export function dunkHandPass(ball: AbstractMesh, skeleton: Skeleton): (tSec: number) => void {
  const from = ballHandOf(ball);
  if (from === DUNK_HAND) return () => {};
  if (!from) { attachBallToHand(ball, skeleton, DUNK_HAND); return () => {}; }
  const spec: HandOffSpec = { at: DUNK_PASS_AT, from, to: DUNK_HAND, blend: DUNK_PASS_BLEND };
  const state = { inLeftHand: from === 'LeftHand' };
  let done = false;
  return (t: number) => {
    if (done) return;
    runHandOffPath(ball, skeleton, t, spec, state);
    if (t >= spec.at + DUNK_PASS_BLEND) done = true;
  };
}
