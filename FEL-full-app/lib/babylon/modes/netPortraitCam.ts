// TENNIS — the portrait hold (lane/tiebreak-cam, 2026-10-23). Pure maths plus one camera write; NetSportMode calls it after
// the director's update, for Tennis and its tiebreak variant (/play/tennis?variant=tiebreak, PR #397) only.
//
// WHY. NetSportMode's play camera ('net' preset, fitTwo) pans with 0.35 of the player's run (clamped to ±2.6 m) and aims
// halfway between that pan and the ball. On a desktop or a sideways phone the frame is wide enough to hold the player as
// well. On a phone held upright (390×844, aspect 0.46) the harness's vertical-fixed 0.8 rad lens is only
// 2·atan(tan 0.4 × 0.46) = 22° across, about ±1.4 m at the player. Measured on the rig with a driver playing the points:
// the player ran to x ±4…7 while the aim sat near the ball, his body projected to x −1.04…1.54 of the frame width, and
// FrameGuard recentered the camera (2 recenters in the first 62 s of the tiebreak variant).
//
// THE FIX. Upright only (aspect < 1), and only when he is about to leave: after the director has placed and aimed the
// camera, if the player's body is closer than PORTRAIT_HERO_MARGIN of the frame width to a side edge, the camera turns
// (yaw only, about its own position) just far enough to hold him at that margin. Its position, height, pitch, lens and
// every frame where he is already inside are the director's, untouched. A wider screen (every desktop and a sideways
// phone) is never written. The intro owns the camera while it runs and is never touched either.

import type { TargetCamera } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/**
 * (new, portrait only): the share of the frame's width kept between the player's body and each side edge. 0.15 keeps the
 * whole body in with a little room (his body is about 0.1 of an upright frame's width at the play distance).
 */
export const PORTRAIT_HERO_MARGIN = 0.15;

/** Body height (m) above the root the hold measures at: the middle of the body. */
const BODY_Y = 1.0;

/** Is this screen too narrow for the play camera to keep the player? Upright: wider than tall is not. */
export function isPortrait(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0 && aspect < 1;
}

/**
 * Where a point lands across the frame (0 = left edge, 1 = right edge) for a camera at `cam` with Babylon's yaw / pitch
 * (rotation.y, rotation.x; left-handed, +pitch looks down), and `tanHalfW` = tan of half the HORIZONTAL field of view.
 * NaN when the point is behind the camera.
 */
export function screenX(cam: { x: number; y: number; z: number }, yaw: number, pitch: number, p: { x: number; y: number; z: number }, tanHalfW: number): number {
  const hx = p.x - cam.x, hy = p.y - cam.y, hz = p.z - cam.z;
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const zc = hx * sy * cp - hy * sp + hz * cy * cp;   // along the forward (sin y cos p, −sin p, cos y cos p)
  if (zc <= 1e-6) return NaN;
  const xc = hx * cy - hz * sy;                        // along the right (cos y, 0, −sin y)
  return 0.5 + 0.5 * (xc / zc) / tanHalfW;
}

/**
 * The yaw (rad) to ADD so the point sits inside [margin, 1 − margin] of the frame's width: 0 when it already does. The
 * smallest turn that does it (the point lands on the near margin), found by bisection between "no turn" and "turned
 * straight at it".
 */
export function heroHoldYaw(cam: { x: number; y: number; z: number }, yaw: number, pitch: number, p: { x: number; y: number; z: number }, tanHalfW: number, margin: number): number {
  const inside = (a: number): boolean => {
    const s = screenX(cam, yaw + a, pitch, p, tanHalfW);
    return s >= margin && s <= 1 - margin;
  };
  if (inside(0)) return 0;
  const dx = p.x - cam.x, dz = p.z - cam.z;
  if (dx * dx + dz * dz < 0.25) return 0;   // right under the camera: a turn is no answer
  let beta = Math.atan2(dx, dz) - yaw;       // straight at it
  beta = Math.atan2(Math.sin(beta), Math.cos(beta));
  if (!inside(beta)) return 0;               // a pitch this steep cannot hold it by turning; leave the director's frame
  let lo = 0, hi = beta;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

const fwd = new Vector3();
const body = new Vector3();
const aim = new Vector3();

/**
 * NetSportMode, after camDirector.update(): upright only, turn the camera just enough to keep the player in. Returns the
 * yaw added (0 = the director's frame untouched). Never writes on a wide screen or during the intro.
 */
export function holdHeroInPortrait(camera: TargetCamera, aspect: number, hero: Vector3, inIntro: boolean, margin = feel('tennis.portraitHeroMargin', PORTRAIT_HERO_MARGIN)): number {
  if (inIntro || !isPortrait(aspect)) return 0;
  const tanHalfW = Math.tan(camera.fov / 2) * aspect;   // the lens is vertical-fixed: width = height × aspect
  body.set(hero.x, hero.y + BODY_Y, hero.z);
  const yaw = camera.rotation.y, pitch = camera.rotation.x;
  const a = heroHoldYaw(camera.position, yaw, pitch, body, tanHalfW, margin);
  if (a === 0) return 0;
  const y = yaw + a;
  fwd.set(Math.sin(y) * Math.cos(pitch), -Math.sin(pitch), Math.cos(y) * Math.cos(pitch));
  camera.position.addToRef(fwd.scaleInPlace(10), aim);
  camera.setTarget(aim);
  return a;
}
