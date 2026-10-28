// slowmo — a slow-motion video's jump, lab-grade (JUMP-PRO, 2026-10-24; owner: "an OPTIONAL slow-mo upload (240 fps)
// for a lab-grade jump").
//
// The browser decodes the file frame by frame and runs the app's own pose model on each (components/jump/
// slowmo-upload.tsx); this file turns those frames into the jump. The hard part is the CLOCK. A phone's slow-mo comes
// out of the share sheet two ways: as the real 120/240 fps file, or stretched to play at 30 fps (each real 1/240 s
// shown for 1/30 s: everything 8× slower). The file cannot be trusted to say which. GRAVITY CAN: in the air the hips
// fall at g, so a clip stretched k× falls k² too slowly against the body's own size. Each stretch the phones use
// (1, 2, 4, 8) is tried; the one whose free-fall ruler agrees with the body's height (within RULER_TOL) is the clock.
// No agreement: the file is refused with that reason, never guessed.
//
// Then the frames are the T5 jump at the real rate: lib/assess/graders/t5-cmj.ts gradeT5, re-timed by
// lib/jump/refine.ts, with source 'slowmo' for the verified rule (lib/jump/session.ts verifyJump).
//
// Pure: frames in, result out. Nothing here touches the file, and nothing is kept or sent.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { calibrateFront, type Calibration } from '@/lib/assess/calibration';
import { detectFlights, gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { poseHz } from '@/lib/assess/scoring';
import { th } from '@/lib/assess/thresholds';
import type { T5Extra, TestResult } from '@/lib/assess/scoring';
import { refineFlight } from './refine';

/** The stretches a phone's slow-mo export can carry (240 → 30 is 8×, 120 → 30 is 4×, 60 → 30 is 2×). */
export const STRETCHES = [1, 2, 4, 8] as const;
/** The free-fall ruler must agree with the body's size within this share (log distance) for a stretch to be the clock. */
export const RULER_TOL = 0.3;
/** The athlete stands still this long (real ms) at the start: the floor and the body's size are read there. */
export const STAND_MS = 800;

export type SlowMoResult =
  | { ok: true; stretch: number; fps: number; t5: T5Extra; test: TestResult; rulerAgreement: number; calibration: Calibration }
  | { ok: false; why: string };

const rescale = (frames: readonly PoseFrame[], k: number): PoseFrame[] =>
  k === 1 ? [...frames] : frames.map((f) => ({ ...f, t: f.t / k, ...(f.arrive !== undefined ? { arrive: f.arrive / k } : {}) }));

function calibrateOn(frames: readonly PoseFrame[], aspect: number): Calibration | null {
  // the stand at the start: the longest opening window that is still (a window that reaches the dip is not)
  if (!frames.length) return null;
  const t0 = frames[0].t;
  for (const w of [2500, 1800, 1200, STAND_MS + 100]) {
    const r = calibrateFront(frames.filter((f) => f.t <= t0 + w), aspect, STAND_MS);
    if (r.ok) return { aspect, front: r.value, side: null };
  }
  return null;
}

/** How far a stretch's free fall is from the body's size: |log(ruler / nominal)| over its flights (null: no flight). */
export function stretchAgreement(frames: readonly PoseFrame[], cal: Calibration): number | null {
  const front = cal.front!;
  const nominal = (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
  const logs: number[] = [];
  for (const fl of detectFlights(frames, front)) {
    if (!fl.landed || fl.landT - fl.takeoffT < th('t5.flightMinMs')) continue;
    const rf = refineFlight(frames, front, fl.takeoffT, fl.landT);
    if (rf && Number.isFinite(rf.ruler) && rf.ruler > 0) logs.push(Math.log(rf.ruler / nominal));
  }
  if (!logs.length) return null;
  logs.sort((a, b) => a - b);
  return Math.abs(logs[logs.length >> 1]);
}

/**
 * A slow-mo clip's frames (t = the file's media time, ms) → its jumps at the real rate. `aspect` is the video's
 * width ÷ height.
 */
export function analyseSlowMo(fileFrames: readonly PoseFrame[], aspect: number): SlowMoResult {
  const present = fileFrames.filter((f) => f.present);
  if (present.length < 30) return { ok: false, why: 'The video did not show a body clearly enough. Film from the front, whole body in the shot.' };
  let best: { k: number; agree: number; frames: PoseFrame[]; cal: Calibration } | null = null;
  for (const k of STRETCHES) {
    const frames = rescale(fileFrames, k);
    const cal = calibrateOn(frames, aspect);
    if (!cal) continue;
    const agree = stretchAgreement(frames, cal);
    if (agree === null) continue;
    if (!best || agree < best.agree) best = { k, agree, frames, cal };
  }
  if (!best) return { ok: false, why: 'No jump was found. Stand still facing the camera for two seconds, then jump with your hands on your hips.' };
  if (best.agree > RULER_TOL) return { ok: false, why: 'The video\'s timing could not be worked out from the jump. Share the original slow-motion file.' };
  const fps = poseHz(best.frames);
  const test = gradeT5(best.frames, { calibration: best.cal, aspect, poseHz: fps, cameraFps: fps });
  return { ok: true, stretch: best.k, fps, t5: test.t5, test, rulerAgreement: Math.round(best.agree * 1000) / 1000, calibration: best.cal };
}
