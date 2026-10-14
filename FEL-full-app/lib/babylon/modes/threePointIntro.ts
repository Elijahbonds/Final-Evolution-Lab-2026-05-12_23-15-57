// 3-POINT'S BROADCAST INTRO (owner, 2026-10-14: add the crane intro to the shootout; the 60 s clock waits for it).
//
// The kit (CameraDirector.establish, A9.12) flies a crane over the venue and a shot on the player, then hands the frame to
// the play camera; any press skips it (the harness calls skipIntro on the first counted input), and reduced motion gets no
// intro at all (establish declines). What the kit leaves to a mode is HOLDING it: the shootout's clock started on the first
// frame of play, so a crane over the venue would have spent four of the player's sixty seconds. Here, as on the courts lane's
// serve / pitch / penalty clocks (they wait on camDirector.inIntro), nothing of the run moves while the intro is on screen —
// not the clock, not the jog to the first rack — and the press that skips it is the intro's, never a shot.
//
// Camera only. The clock's LENGTH is unchanged (GAME_LEN); only its start moves, from the first frame of play to the end of
// the intro (TUNED-adjacent, flagged). The #220 corner camera (the play camera underneath, untouched: the kit runs it under
// the intro so the hand-back is exact) and the trees' occlusion fade (run on the intro's line too) are the mode's own.
//
// The shot: 'walkIn' — the crane, then the low shot on the shooter at the first rack. Measured on the rig (SwiftShader, Venice
// court, every frame of the intro): the camera never comes within 0.3 m of any mesh's box — the palms, lamps and tents one
// thin instance at a time — from the crane's top (-11.5, 13, 16.4) down to the player shot (4.4, 0.9, -0.4); the probe was
// checked first against points inside a palm, a lamp post and a tent (all three caught). 1080p and phone frames looked at.

import { Vector3 } from '@babylonjs/core';
import type { IntroKind } from '../scene/broadcastShots';

/** The intro 3-Point opens on. */
export const THREE_POINT_INTRO: IntroKind = 'walkIn';

/** What the hold needs of the camera director (structurally CameraDirector). */
export interface IntroCamera {
  readonly inIntro: boolean;
  update(subject: Vector3, velocity: Vector3, objective: Vector3 | null): void;
}

const STILL = Vector3.Zero();

/**
 * The mode's hold, each frame before its clock: while the intro is on screen the director runs it (and the play camera
 * under it) and the caller returns, so the clock and the run wait. False = no intro: play on.
 */
export function holdForIntro(cam: IntroCamera, subject: Vector3, objective: Vector3): boolean {
  if (!cam.inIntro) return false;
  cam.update(subject, STILL, objective);
  return true;
}
