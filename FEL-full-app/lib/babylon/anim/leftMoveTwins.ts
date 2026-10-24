// leftMoveTwins — THE SPIN FROM THE LEFT HAND (hoops round 2, owner 2026-10-20: "New moves: … the spin from the left hand").
//
// The spin's body (`bball_spin`: the authored M6 pose clip, or the CMU 78_13 capture that replaces it on a captured rig) is ONE clip,
// made right-handed on screen by hoopsHand.rightHandHoops: the ball arm pulls the ball round on the athlete's RIGHT, the hips wind one
// way. Since #375 the ball lives in the left hand as often as the right, and a spin thrown from the left hand played that same
// right-handed body: the carry pulled the ball round on the LEFT (the spin's path, mirrored — handlePaths.mirrorPath) under an arm that
// was reaching for a ball on the other side. The left-hand spin is the same clip mirrored once more (the path hoopsHand.leftDribbleTwins
// makes the left-hand dribble loops by): the ball arm, the swing leg and the wind all on the other side, registered as `bball_spin_left`
// at spawn. The mode picks it when the spin's ball starts in the left hand (spinClipFor / spinStartHand).
import type { AnimationGroup, Skeleton } from '@babylonjs/core';
import { mirrorGroupsInPlace } from './groupMirror';
import { variantFor } from './opponentMotion';

/** The move clips that get a `_left` twin (the right-handed clip a mode beats for a move that has no sided clip of its own). */
export const LEFT_TWIN_MOVES = ['bball_spin'] as const;

/** Make the `_left` twins of LEFT_TWIN_MOVES on this body (after rightHandHoops: the source must already be right-handed on screen).
 *  Idempotent. Returns the names registered now. */
export function leftMoveTwins(animator: unknown, skeleton: Skeleton): string[] {
  const a = animator as { groups?: Map<string, AnimationGroup>; register?: (g: AnimationGroup) => void };
  const groups = a.groups; if (!groups || typeof a.register !== 'function') return [];
  const made: string[] = [];
  for (const base of LEFT_TWIN_MOVES) {
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

/** The hand the spin's ball path starts in — what handleMotion.requestMove starts it from: the running move's END hand when a move is
 *  still running (the spin queues behind it — the rotation's entry flick is usually a between-the-legs still in flight), else the hand
 *  that holds the ball. (Read off `hand` alone, a spin thrown out of a running crossing picked the body for the hand the ball was
 *  LEAVING: the ball pulled round on one side under the other side's arm — the rig's resume capture, 2026-10-22.) */
export function spinStartHand(carry: SpinCarry | null | undefined): 'Left' | 'Right' {
  if (!carry) return 'Right';
  const m = carry.move;
  if (m) return m.endHand === 'left' ? 'Left' : 'Right';
  return carry.hand === 'Left' ? 'Left' : 'Right';
}
export interface SpinCarry { hand: 'Left' | 'Right'; move: { endHand: 'left' | 'right' } | null }

/** The spin's body for the hand its ball starts in (spinStartHand): the left twin when there is one and that hand is the left. */
export function spinClipFor(carry: SpinCarry | null | undefined, animator: { groups?: Map<string, unknown> } | unknown): string {
  const groups = (animator as { groups?: Map<string, unknown> } | null)?.groups;
  return spinStartHand(carry) === 'Left' && !!groups?.has('bball_spin_left') ? 'bball_spin_left' : 'bball_spin';
}
