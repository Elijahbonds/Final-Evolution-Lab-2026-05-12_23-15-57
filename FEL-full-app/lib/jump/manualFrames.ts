// manualFrames — the take-off and landing frames picked by hand in a video, and the height they give (JUMP-TESTS,
// 2026-10-25). The slow-mo review (components/jump/frame-review.tsx) steps through the video frame by frame, the way My
// Jump 2 does: the take-off frame is the FIRST frame with both feet off the floor, the landing frame the FIRST frame
// with a foot back on it. Flight = landing frame's time − take-off frame's time; height = g·T²/8 (the flight-time
// height: no landing posture is taken out, as the app's own read does — a hand-picked jump is a different method, and
// says so). Its ± is one frame of timing on that flight, as the jump check's one-frame band is (t5-cmj.ts).
//
// VERIFIED: never. assumption: (owner call) a frame a person chose cannot be checked by the app, so a manual-frame jump
// is kept and shown as "manual frames", and session.ts verifyJump blocks it ('manual'). Moving the frames and moving
// them back to the app's own is not manual: nothing was changed.
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';

const G = 9.81;

export interface FrameEdges { takeoffIdx: number; landIdx: number }

export interface ManualRead {
  takeoffT: number;
  landT: number;
  flightMs: number;
  /** g·T²/8 (cm). */
  heightCm: number;
  /** One frame of timing on that flight (cm): g·T·dt/4. */
  plusMinusCm: number;
  /** Frames apart, and the frame's length (ms) here. */
  frames: number;
  frameMs: number;
}

/** The first frame at or after t (the frames are in time order). */
export function frameAt(frames: readonly PoseFrame[], t: number): number {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return -1;
  if (frames[hi].t < t) return hi;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

/** The app's own read as frames: the first airborne frame after its take-off, the first frame down after its landing. */
export function autoEdges(frames: readonly PoseFrame[], jump: { takeoffT: number; landT: number }): FrameEdges {
  return { takeoffIdx: frameAt(frames, jump.takeoffT), landIdx: frameAt(frames, jump.landT) };
}

/** Move one edge by `delta` frames, kept inside the clip and with the take-off before the landing. */
export function nudge(frames: readonly PoseFrame[], e: FrameEdges, which: 'takeoff' | 'land', delta: number): FrameEdges {
  const last = frames.length - 1;
  if (which === 'takeoff') return { ...e, takeoffIdx: Math.max(0, Math.min(e.landIdx - 1, e.takeoffIdx + delta)) };
  return { ...e, landIdx: Math.min(last, Math.max(e.takeoffIdx + 1, e.landIdx + delta)) };
}

/** The frames' median gap (ms): one frame here. */
export function frameMs(frames: readonly PoseFrame[]): number {
  const g = frames.slice(1).map((f, i) => f.t - frames[i].t).filter((x) => x > 0).sort((a, b) => a - b);
  return g.length ? g[g.length >> 1] : 0;
}

/** The height two hand-picked frames give. Null when they do not make a flight. */
export function manualRead(frames: readonly PoseFrame[], e: FrameEdges): ManualRead | null {
  const a = frames[e.takeoffIdx], b = frames[e.landIdx];
  if (!a || !b || b.t <= a.t) return null;
  const T = (b.t - a.t) / 1000, dt = frameMs(frames) / 1000;
  return {
    takeoffT: a.t, landT: b.t, flightMs: Math.round(T * 1000),
    heightCm: Math.round(((G * T * T) / 8) * 1000) / 10,
    plusMinusCm: Math.round(((G * T * dt) / 4) * 1000) / 10,
    frames: e.landIdx - e.takeoffIdx, frameMs: Math.round(dt * 10000) / 10,
  };
}

/** Did the person move either frame off the app's own? */
export const changed = (now: FrameEdges, auto: FrameEdges) => now.takeoffIdx !== auto.takeoffIdx || now.landIdx !== auto.landIdx;
