// PHYSICS ARENA — POV: the court through the player's own eyes (owner 2026-11-23: "And POV-").
//
// A first-person view for the arena's sports, on the camera button (SELECT / C), behind cam.pov. While it is on the mode owns the
// camera (CameraDirector.suspended: the follow camera and its frame guard stand down) and the player's own body is hidden (the
// eye would otherwise sit inside the head). The right stick turns the view; the left stick moves you where you look; you aim by
// looking (arena.aimAssist forgives most of a look off the rim, so a phone player is not punished for a thumb). Head-bob is off
// by default (cam.povBobM 0): a bouncing horizon is what makes first person sickening.
//
// The maths is pure (povPose, fovForAspect, aimYawErr) and tested; applyPov writes the camera.

import { Vector3 } from '@babylonjs/core';
import type { TargetCamera } from '@babylonjs/core';
import type { P3 } from './hoopGeometry';

/** Pitch limits (degrees): down to see the ball at your feet, up to see the ring from under it. */
export const POV_PITCH_MIN_DEG = -45;
export const POV_PITCH_MAX_DEG = 55;
/** The eye sits this far in front of the body's axis (in front of the face, not inside the skull). */
export const POV_EYE_FORWARD_M = 0.14;

export interface PovView { yaw: number; pitch: number; bobPhase: number }

const D2R = Math.PI / 180;

/** Turn the view by the right stick (x right, y down on screen = look down). */
export function povLook(v: PovView, rx: number, ry: number, degPerSec: number, dt: number): void {
  const dz = (a: number) => (Math.abs(a) < 0.12 ? 0 : a);
  v.yaw += dz(rx) * degPerSec * D2R * dt;
  v.pitch = Math.max(POV_PITCH_MIN_DEG * D2R, Math.min(POV_PITCH_MAX_DEG * D2R, v.pitch - dz(ry) * degPerSec * 0.7 * D2R * dt));
}

/** The eye and the point it looks at. `eyeY` is the eye's height above the feet (the head bone's, or POV_EYE_M); `speed` the
 *  body's planar speed for the bob; `bobM` the bob's height (0 = none). */
export function povPose(feet: Readonly<P3>, v: PovView, eyeY: number, speed: number, bobM: number, dt: number): { eye: P3; target: P3 } {
  if (bobM > 0 && speed > 0.3) v.bobPhase += dt * (4 + speed * 1.6);
  const bob = bobM > 0 ? Math.sin(v.bobPhase * 2) * bobM * Math.min(1, speed / 5) : 0;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const eye = { x: feet.x + fx * POV_EYE_FORWARD_M, y: feet.y + eyeY + bob, z: feet.z + fz * POV_EYE_FORWARD_M };
  const cp = Math.cos(v.pitch);
  return { eye, target: { x: eye.x + fx * cp * 10, y: eye.y + Math.sin(v.pitch) * 10, z: eye.z + fz * cp * 10 } };
}

/** The vertical field of view (radians) that gives `hDeg` across a screen of this aspect (width / height), clamped 50–90° (past 90 an
 *  upright phone saw the top edge of the sky backdrop: the arena contact sheet, 2026-11-23). */
export function fovForAspect(hDeg: number, aspect: number): number {
  const v = 2 * Math.atan(Math.tan((hDeg * D2R) / 2) / Math.max(0.2, aspect));
  return Math.max(50 * D2R, Math.min(90 * D2R, v));
}

/** The shot's yaw error in POV: how far the view looks off the ring, less the assist's share. */
export function aimYawErr(viewYaw: number, eye: Readonly<P3>, rim: Readonly<P3>, assist: number): number {
  const toRim = Math.atan2(rim.x - eye.x, rim.z - eye.z);
  let d = viewYaw - toRim;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d * (1 - Math.max(0, Math.min(1, assist)));
}

/** Write the pose to the camera. */
export function applyPov(camera: TargetCamera, pose: { eye: P3; target: P3 }, fov: number): void {
  camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
  camera.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z));
  camera.fov = fov;
  camera.minZ = 0.05;
}
