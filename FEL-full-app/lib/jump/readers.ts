// readers — every jump reader in the app, behind one bench signature (lib/jump/bench.ts JumpReaderFn).
//   frames  T5 before JUMP-PRO: the flight finder's frame edges alone (the "before" column)
//   t5      the Mirror / Quick Screen jump: lib/assess/graders/t5-cmj.ts gradeT5 (re-timed by lib/jump/refine.ts)
//   body    the games' live reader: lib/pose/BodyReader.ts 'land' events (the dunk by body, drills)
import { detectFlights, gradeT5, heightCmOf } from '@/lib/assess/graders/t5-cmj';
import { th } from '@/lib/assess/thresholds';
import { replay as bodyReplay } from '@/lib/pose/BodyReader';
import type { JumpReaderFn } from './bench';

export const t5Reader: JumpReaderFn = (frames, calib) => {
  const r = gradeT5(frames, { calibration: calib, aspect: calib.aspect });
  return r.t5.jumps.map((j) => ({ takeoffT: j.takeoffT, landT: j.landT, heightCm: j.heightCm, valid: j.valid, ...(j.invalidWhy ? { why: j.invalidWhy } : {}) }));
};

/**
 * The finder alone, as T5 read every jump before JUMP-PRO: detectFlights' frame edges, g·T²/8, its own refusals. The
 * "before" column of docs/JUMP-PRO.md (the arm-swing refusal is left out: no bench take swings its arms).
 */
export const framesReader: JumpReaderFn = (frames, calib) => detectFlights(frames, calib.front!).flatMap((fl) => {
  const ms = fl.landT - fl.takeoffT;
  if (ms < th('t5.flightMinMs')) return [];
  const h = heightCmOf(ms);
  const why = !fl.landed ? 'the camera never saw you land' : !fl.check.ok ? fl.check.why
    : ms > th('t5.flightMaxMs') || h > th('t5.maxHeightCm') ? 'over the height limit' : undefined;
  return [{ takeoffT: fl.takeoffT, landT: fl.landT, heightCm: Math.round(h * 10) / 10, valid: !why, ...(why ? { why } : {}) }];
});

export const bodyReader: JumpReaderFn = (frames) => {
  const { events } = bodyReplay([...frames]);
  return events.flatMap((e) => (e.kind === 'land' ? [{ takeoffT: e.t - e.flightMs, landT: e.t, heightCm: e.heightM * 100, valid: true }] : []));
};

export const READERS = { frames: framesReader, t5: t5Reader, body: bodyReader } as const;
