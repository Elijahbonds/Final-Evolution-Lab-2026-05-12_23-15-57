// lib/motion-lesson/playback.ts — EDU-05 motion lessons, phase B (2026-11-10): what the PLAYER decides, with no 3D in it.
// The stage (components/motion-lesson/motion-stage.tsx) builds a clip from clipKeys() and plays it; the player
// (motion-player.tsx) reads the cue, the phrase and the weak stretch for the moment on screen. Tested in node.
//
//   · a clip is the whole lesson or one phrase, as recorded or mirrored (a student facing the screen copies a mirror);
//   · a recording is not a loop: its last pose is not its first. So every clip ends with a short RETURN to its first
//     pose (RETURN_S), and the loop's seam is a move the body makes, not a jump cut;
//   · the camera's framing is one for the whole lesson (the highest the hands or the head go, jump included), so
//     switching phrases never moves it.
// Pure. Client-safe.
import type { PoseKey } from '@/lib/babylon/anim/poseClip';
import { mirrorKey } from '@/lib/babylon/anim/mocapRetarget';
import type { MotionLesson } from './format';

/** (new) Seconds the body takes to come back to a clip's first pose before the loop starts again. */
export const RETURN_S = 0.5;
/** (new) A cue stays up this long after its moment (s): the cue rule's read time for up to five words. */
export const CUE_SHOW_S = 1.2;
/** (new) The slow speed: half. */
export const SPEEDS = [1, 0.5] as const;
export type Speed = typeof SPEEDS[number];
/** The stage's clip frames per second (poseClip SMOOTH_FPS; exercise-stage.tsx reads clips the same way). */
export const CLIP_FPS = 30;

export interface ClipAsk { from: number; to: number; mirror: boolean }
export interface ClipKeys {
  keys: PoseKey[];
  /** Seconds of movement (the recording's own). */
  movement: number;
  /** movement + RETURN_S: the clip's length. */
  total: number;
}

/** The whole lesson, as recorded. */
export const wholeOf = (l: Pick<MotionLesson, 'duration'>): ClipAsk => ({ from: 0, to: l.duration, mirror: false });

/** A stable name part for a clip ask (the stage caches a built clip under it). */
export const askKey = (a: ClipAsk): string => `${Math.round(a.from * 100)}_${Math.round(a.to * 100)}${a.mirror ? '_m' : ''}`;

/** The keys of one clip: the stretch asked for, from 0, mirrored if asked, then the return. null: under two keys in it. */
export function clipKeys(lessonKeys: readonly PoseKey[], ask: ClipAsk): ClipKeys | null {
  const EPS = 1e-3;
  const inside = lessonKeys.filter((k) => k.t >= ask.from - EPS && k.t <= ask.to + EPS);
  if (inside.length < 2) return null;
  const t0 = inside[0].t;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const moved = inside.map((k) => { const m = ask.mirror ? mirrorKey(k) : k; return { ...m, t: r3(k.t - t0) }; });
  const movement = moved[moved.length - 1].t;
  if (!(movement > 0)) return null;
  const total = r3(movement + RETURN_S);
  return { keys: [...moved, { ...moved[0], t: total }], movement, total };
}

/** The cue to show at `t` seconds into the lesson: the latest one whose moment has come, for CUE_SHOW_S. */
export function cueAt(l: Pick<MotionLesson, 'cues'>, t: number): string | null {
  let best: { t: number; text: string } | null = null;
  for (const c of l.cues) if (c.t <= t && t - c.t <= CUE_SHOW_S && (!best || c.t >= best.t)) best = c;
  return best?.text ?? null;
}

/** The index of the phrase `t` is in, or -1. */
export const phraseAt = (l: Pick<MotionLesson, 'phrases'>, t: number): number => l.phrases.findIndex((p) => t >= p.from && t < p.to);

/** Is `t` inside a stretch the camera saw poorly? */
export const weakAt = (l: Pick<MotionLesson, 'weak'>, t: number): boolean => l.weak.some(([a, b]) => t >= a && t <= b);

export interface Framing { targetY: number; radius: number }
/** The standing head's top on the reference body (m): the shoulders (poseClip REF_SHOULDER_Y 1.42) and a head over them. */
const REF_HEAD_TOP = 1.8;
/** The stage camera's half field of view (Babylon's default fov 0.8 rad), and the air kept over the highest point (m). */
const HALF_FOV = 0.4, HEADROOM_M = 0.3;

/** One framing for the whole lesson: tall enough for its highest moment (hands up, or the top of a jump). */
export function framingOf(keys: readonly PoseKey[]): Framing {
  let top = REF_HEAD_TOP;
  for (const k of keys) {
    const up = k.hipsY ?? 0;
    top = Math.max(top, REF_HEAD_TOP + up, (k.hands?.Left?.[1] ?? 0) + up, (k.hands?.Right?.[1] ?? 0) + up);
  }
  const span = top + HEADROOM_M;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { targetY: r2(span / 2), radius: r2(Math.max(2.55, span / 2 / Math.tan(HALF_FOV))) };
}
