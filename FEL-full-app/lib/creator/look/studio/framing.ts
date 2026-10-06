// THE STUDIO'S CAMERA (CREATOR-PLAN phase 4d, 2026-10-06): three shots — full body, bust and face — and which one the
// editor wants for the tab or the thing selected, plus the smoothing that moves the camera between them. Pure: numbers in,
// numbers out; lib/babylon/creator/studio/stageRig.ts drives an ArcRotateCamera with it.
//
// SHOTS ARE IN BODY HEIGHTS. A shot names where the camera looks (a fraction of the body's height) and how far it stands
// (in body heights), so a giant (presentation 1.35) and a mascot (0.6) frame the same way. The camera's field of view is
// vertical (Babylon's default), so a portrait phone and a landscape TV frame the same height of body.
//
// FACING. A selection on the back (a cape, a back emblem) or on one side (a left-arm stamp) also turns the turntable so
// that side faces the camera: `facing` is the body yaw (radians) that shows it, null to leave the turntable alone.

import type { PaintRegion, PartBone } from '../doc';

export const STUDIO_SHOTS = ['full', 'bust', 'face'] as const;
export type StudioShot = typeof STUDIO_SHOTS[number];

export interface ShotDef {
  /** where the camera looks: a fraction of the body's height above the floor */
  look: number;
  /** how far the camera stands from that point, in body heights */
  distance: number;
  /** the camera's polar angle (rad, from straight up): a little above eye level for the full body */
  beta: number;
}

/** TUNED (2026-10-06, phase 4d — never seen on screen; the owner's eye is the judge): full 3.15 m at a 1.8 m body (the
 *  Closet preview's 3.1), bust frames head to mid-chest, face frames the head and a little hair above it. */
export const SHOTS: Record<StudioShot, ShotDef> = {
  full: { look: 0.52, distance: 1.75, beta: 1.33 },
  bust: { look: 0.8, distance: 0.72, beta: 1.4 },
  face: { look: 0.925, distance: 0.38, beta: 1.47 },
};

/** The kit body's standing height (m) — the fallback when the stage has not measured one. */
export const BODY_HEIGHT = 1.8;

/** The Closet's editor tabs (components/closet-view.tsx). */
export type StudioTab = 'face' | 'shape' | 'parts' | 'paint' | 'wear' | 'skins';

/** What is selected on the body, as far as the camera cares. */
export type StudioFocus =
  | { kind: 'part'; bone: PartBone }
  | { kind: 'layer'; region: PaintRegion }
  | null;

export interface Framing { shot: StudioShot; facing: number | null }

const HEAD_BONES: readonly PartBone[] = ['Head', 'Neck'];
const BUST_BONES: readonly PartBone[] = ['Spine2', 'Spine1', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm'];

/** The shot for a part on this bone: head parts in the bust (a crest or a helmet needs room above the head), the chest
 *  and upper arms in the bust, the rest in the full body. */
export function shotForBone(bone: PartBone): StudioShot {
  if (HEAD_BONES.includes(bone) || BUST_BONES.includes(bone)) return 'bust';
  return 'full';
}

/** The shot for a layer on this region. */
export function shotForRegion(region: PaintRegion): StudioShot {
  switch (region) {
    case 'face': case 'ears': return 'face';
    case 'head': case 'neck': case 'torsoFront': case 'torsoBack': case 'upperArmLeft': case 'upperArmRight': return 'bust';
    default: return 'full';
  }
}

/** The body yaw that shows a region or a bone's side to the camera: the back half-turned, a side a quarter-turn, the
 *  front (or a region that wraps the body) null. The camera looks down the body's −forward at yaw 0. */
export function facingFor(focus: StudioFocus): number | null {
  if (!focus) return null;
  if (focus.kind === 'layer') {
    if (focus.region === 'torsoBack') return Math.PI;
    const side = /Left$/.test(focus.region) ? 'L' : /Right$/.test(focus.region) ? 'R' : null;
    return side === 'L' ? -Math.PI / 4 : side === 'R' ? Math.PI / 4 : null;
  }
  if (focus.bone.startsWith('Left')) return -Math.PI / 4;
  if (focus.bone.startsWith('Right')) return Math.PI / 4;
  return null;
}

/** The framing the editor wants: the selection decides when there is one, else the tab. */
export function framingFor(tab: StudioTab, focus: StudioFocus): Framing {
  if (tab === 'parts' && focus?.kind === 'part') return { shot: shotForBone(focus.bone), facing: facingFor(focus) };
  if (tab === 'paint' && focus?.kind === 'layer') return { shot: shotForRegion(focus.region), facing: facingFor(focus) };
  return { shot: tab === 'face' ? 'face' : 'full', facing: null };
}

export interface CameraPose { targetY: number; radius: number; beta: number }

/** A shot as camera numbers for a body of `height` m shown at `presentation` (the Studio size, 1 = as played). */
export function frameShot(shot: StudioShot, height = BODY_HEIGHT, presentation = 1): CameraPose {
  const h = Math.max(0.3, height) * Math.max(0.1, presentation);
  const s = SHOTS[shot];
  return { targetY: s.look * h, radius: Math.max(0.35, s.distance * h), beta: s.beta };
}

/** The next shot in or out (a pad's d-pad, the keyboard's 1/2/3 neighbours). */
export function stepShot(shot: StudioShot, dir: 1 | -1): StudioShot {
  const i = STUDIO_SHOTS.indexOf(shot) + dir;
  return STUDIO_SHOTS[Math.min(STUDIO_SHOTS.length - 1, Math.max(0, i))];
}

// ── smoothing ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Exponential approach with a half-life (s): frame-rate independent, never overshoots. */
export function approach(current: number, target: number, dt: number, halfLife: number): number {
  if (!(halfLife > 0) || !(dt > 0)) return dt > 0 ? target : current;
  const k = 1 - Math.pow(2, -dt / halfLife);
  return current + (target - current) * k;
}

const TAU = Math.PI * 2;
/** An angle's shortest signed difference to another, in (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d <= -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}

/** approach() for an angle, the short way round. */
export function approachAngle(current: number, target: number, dt: number, halfLife: number): number {
  return current + (approach(0, angleDelta(current, target), dt, halfLife));
}

/** The camera's half-life between shots (s). TUNED (phase 4d): about a third of a second to settle. */
export const SHOT_HALF_LIFE = 0.09;

/** Close enough to stop moving (and stop rendering for it). */
export function settled(a: CameraPose, b: CameraPose, eps = 1e-3): boolean {
  return Math.abs(a.targetY - b.targetY) < eps && Math.abs(a.radius - b.radius) < eps && Math.abs(a.beta - b.beta) < eps;
}

/** One frame of the camera moving toward a pose. */
export function stepCamera(cur: CameraPose, tgt: CameraPose, dt: number, halfLife = SHOT_HALF_LIFE): CameraPose {
  return {
    targetY: approach(cur.targetY, tgt.targetY, dt, halfLife),
    radius: approach(cur.radius, tgt.radius, dt, halfLife),
    beta: approach(cur.beta, tgt.beta, dt, halfLife),
  };
}

// ── the turntable ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The turntable's own slow spin (rad/s) — the Closet preview's 0.0004 rad/ms. */
export const AUTO_SPIN = 0.4;
/** How fast a flung spin dies away: its half-life (s). TUNED (phase 4d). */
export const SPIN_HALF_LIFE = 0.35;
/** Below this (rad/s) a flung spin stops. */
export const SPIN_REST = 0.02;
/** Radians of turn per CSS pixel of drag. TUNED (phase 4d): a full turn across about 630 px. */
export const SPIN_PER_PX = 0.01;

/** A flung spin, one frame later. */
export function decaySpin(velocity: number, dt: number): number {
  const v = velocity * Math.pow(2, -Math.max(0, dt) / SPIN_HALF_LIFE);
  return Math.abs(v) < SPIN_REST ? 0 : v;
}

/** The zoom range, as a multiple of the shot's own distance (pinch, wheel, triggers). */
export const ZOOM_RANGE = [0.55, 1.8] as const;
export const clampZoom = (z: number): number => Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], Number.isFinite(z) ? z : 1));
/** The orbit tilt the player may add to a shot's beta (rad). */
export const TILT_RANGE = [-0.6, 0.45] as const;
export const clampTilt = (t: number): number => Math.min(TILT_RANGE[1], Math.max(TILT_RANGE[0], Number.isFinite(t) ? t : 0));
