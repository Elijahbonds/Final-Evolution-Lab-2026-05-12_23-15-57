/**
 * lib/cinematic/dunk-cinematics.ts
 * ================================
 * M14-P5 — input-selected DUNK cinematics that play BEFORE the launch.
 *
 * When the player commits to a dunk, the style they picked (POWER / FLASHY /
 * SIGNATURE) selects a distinct pre-launch cinematic: a short camera SWEEP
 * around the hero at the launch spot, a `gather` clip beat (wind-up pose), a
 * mid `pop` beat (crowd flash), and a closing `launch` beat that hands control
 * back to the live jump sim.
 *
 * The camera track is COMPOSED from the existing rig core (computeCamera +
 * orbitOffset from lib/camera/rigs) — no new mocap, no forked camera code. Each
 * style differs in sweep angle, punch-in and pacing so the three dunks read
 * differently before they even leave the floor.
 *
 * Pure math, no THREE / DOM. Both the live scene and scripts/cinematic-tests.ts
 * import THIS module. All feel constants are // TUNE(elijah).
 */

import {
  computeCamera,
  orbitOffset,
  RIGS,
  type CameraFrame,
  type Vec3,
  type Subject,
} from '../camera/rigs';
import { type Cinematic, type CameraKey, type Beat } from './timeline';

export type DunkStyle = 'POWER' | 'FLASHY' | 'SIGNATURE';

/** Per-style cinematic recipe. // TUNE(elijah) */
interface DunkCineSpec {
  /** Total pre-launch length in seconds. */
  duration: number;
  /** Peak horizontal swing around the hero (radians). */
  sweep: number;
  /** Peak vertical tilt during the sweep (radians). */
  tilt: number;
  /** FOV punch-in at the peak of the sweep (degrees subtracted). */
  fovPunch: number;
  /** Wind-up clip the `gather` beat asks the scene to play. */
  gatherClip: string;
}

export const DUNK_CINEMATIC_SPECS: Record<DunkStyle, DunkCineSpec> = {
  // Power: quick, low, aggressive orbit — barely any showboating. // TUNE(elijah)
  POWER: { duration: 0.85, sweep: 0.55, tilt: -0.12, fovPunch: 6, gatherClip: 'guard' },
  // Flashy: wider, faster swing with a stronger punch-in. // TUNE(elijah)
  FLASHY: { duration: 1.05, sweep: 0.95, tilt: 0.08, fovPunch: 9, gatherClip: 'guard' },
  // Signature: the longest, most theatrical encircle. // TUNE(elijah)
  SIGNATURE: { duration: 1.3, sweep: 1.25, tilt: 0.16, fovPunch: 11, gatherClip: 'guard' },
};

/** The airborne trick clip each style commits to (mirrors STYLE_ACTION). */
export const DUNK_STYLE_ACTION: Record<DunkStyle, string> = {
  POWER: '360_eastbay',
  FLASHY: 'off_board_windmill',
  SIGNATURE: '360_scoop',
};

function faceYaw(from: Vec3, to: Vec3): number {
  const y = Math.atan2(to.x - from.x, to.z - from.z);
  return Number.isFinite(y) ? y : 0;
}

/** Build one camera key: the broadcast framing swung by (yaw,pitch), fov punched. */
function sweptKey(t: number, base: CameraFrame, yaw: number, pitch: number, fovDelta: number): CameraKey {
  const off: Vec3 = {
    x: base.position.x - base.target.x,
    y: base.position.y - base.target.y,
    z: base.position.z - base.target.z,
  };
  const rot = orbitOffset(off, { yaw, pitch });
  const position: Vec3 = {
    x: base.target.x + rot.x,
    y: base.target.y + rot.y,
    z: base.target.z + rot.z,
  };
  const fov = Math.max(24, base.fov + fovDelta); // never invert / go too narrow // TUNE(elijah)
  return { t, frame: { position, target: base.target, fov } };
}

/**
 * Build the pre-launch cinematic for a chosen dunk style.
 * `subjectPos` = where the hero will launch from; `rimPos` = the basket. PURE
 * and deterministic — identical inputs always produce an identical cinematic.
 */
export function buildDunkCinematic(style: DunkStyle, subjectPos: Vec3, rimPos: Vec3): Cinematic {
  const spec = DUNK_CINEMATIC_SPECS[style];
  const D = spec.duration;
  const subject: Subject = { pos: subjectPos, facing: faceYaw(subjectPos, rimPos), speed01: 0 };
  const base = computeCamera(subject, RIGS.broadcast);

  // Sweep from behind (0) → out to the peak swing → ease back to a ready
  // launch framing. The camera lingers on the hero at the peak (punch-in).
  const track: CameraKey[] = [
    sweptKey(0, base, 0, 0, 0),
    sweptKey(D * 0.35, base, spec.sweep, spec.tilt, -spec.fovPunch),
    sweptKey(D * 0.7, base, spec.sweep * 0.4, spec.tilt * 0.5, -spec.fovPunch * 0.4),
    sweptKey(D, base, 0, 0, 0),
  ];

  const beats: Beat[] = [
    { t: 0, id: 'gather', clip: spec.gatherClip }, // hero wind-up pose
    { t: D * 0.5, id: 'pop' }, // crowd anticipation flash
    { t: D, id: 'launch', clip: DUNK_STYLE_ACTION[style] }, // hand back to the jump sim
  ];

  return { id: `dunk_${style.toLowerCase()}`, duration: D, track, beats };
}

/** Convenience: the airborne action clip for a style. */
export function dunkStyleAction(style: DunkStyle): string {
  return DUNK_STYLE_ACTION[style];
}
