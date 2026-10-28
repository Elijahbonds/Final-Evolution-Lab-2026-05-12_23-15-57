// lib/coach/readiness/capture.ts — COACH-READINESS (2026-10-25): the 30-second check's live read.
//
// THE EXISTING JUMP CHECK, RE-USED, NOT REBUILT. The athlete stands still for STAND_MS (the floor and the body's size are
// read there: lib/assess/calibration.ts calibrateFront, the Quick Screen's own), then jumps JUMPS_ASKED times with hands
// on hips. Flights are counted live with T5's own finder (lib/assess/graders/t5-cmj.ts detectFlights), and when the
// third has landed the whole take goes through gradeT5 — every flight re-timed by JUMP-PRO's refiner (lib/jump/refine.ts),
// its quality flagged, the set read by lib/jump/session.ts sessionStats (best, mean, typical error). Nothing here
// measures a jump its own way.
//
// What the readiness read takes from it (dayJumps): the best and the mean of the counted jumps, an outlier (a jump far
// above the others, session.ts) left out of both, and the session's typical error.
//
// Pure: frames in, a view and a result out. No camera, no clock but the frames' own.

import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { poseHz, type T5Extra } from '@/lib/assess/scoring';
import { jr } from '@/lib/jump/PROPOSED-jump';
import { JumpJudge, StandRead, countWord, standLine } from '@/lib/tools-easy/liveJump';
import { JUMP_PHASE_MS, JUMPS_ASKED, MIN_JUMPS, STAND_MS } from './thresholds';
import type { DayJumps } from './types';

export type CaptureStep = 'stand' | 'jump' | 'done';

export interface CaptureView {
  step: CaptureStep;
  /** Flights that have landed since the stand. */
  jumps: number;
  /** What to fix to get the stand read (calibrateFront's own words), while standing. */
  why: string | null;
  /**
   * TOOLS-EASY (2026-10-28): the last refused jump's reason and fix ("Your hands left your hips. Keep them there and jump
   * again."), shown and said until the next jump counts. Before, a refused jump filled a slot without a word.
   */
  refusal: string | null;
  /** TOOLS-EASY: the newest line to say aloud (the page's one voice says it in full). Its id changes per line. */
  say: { id: number; text: string } | null;
}

export type CaptureResult =
  | { ok: true; jumps: Omit<DayJumps, 'day'>; t5: T5Extra }
  | { ok: false; why: string; t5: T5Extra | null };

/** How often (frames) the stand and the flights are re-read: cheap enough at 60 Hz on a phone. */
const READ_EVERY = 6;

const r1 = (x: number) => Math.round(x * 10) / 10;

export class ReadinessCapture {
  private frames: PoseFrame[] = [];
  private front: FrontCalibration | null = null;
  private standFrom = 0;
  private calibratedAt = 0;
  private landed = 0;
  private why: string | null = null;
  private step: CaptureStep = 'stand';
  private n = 0;
  private refusal: string | null = null;
  private say: { id: number; text: string } | null = null;
  private readonly stand: StandRead;
  private judge: JumpJudge | null = null;

  constructor(private readonly o: { aspect: number; cameraFps?: number | null }) {
    this.stand = new StandRead(o.aspect, STAND_MS);
  }

  view(): CaptureView {
    return { step: this.step, jumps: this.landed, why: this.why, refusal: this.refusal, say: this.say };
  }

  private said(text: string): void { this.say = { id: (this.say?.id ?? 0) + 1, text }; }

  push(f: PoseFrame): CaptureView {
    if (this.step === 'done') return this.view();
    this.frames.push(f);
    this.n++;
    if (this.n % READ_EVERY) return this.view();
    const t = f.t;
    if (this.step === 'stand') {
      const hold = this.frames.filter((x) => x.t >= t - STAND_MS);
      // TOOLS-EASY: the same stand, with the Quick Screen's accepted sway fallback from the second refused stand
      const r = this.stand.read(hold, t);
      if (r.ok) {
        this.front = r.value;
        this.standFrom = hold[0].t;
        this.calibratedAt = t;
        this.step = 'jump';
        this.why = null;
        this.judge = new JumpJudge(this.o.aspect);
        this.said('Jump!');
        // the frames before the stand are not part of the take
        this.frames = this.frames.filter((x) => x.t >= this.standFrom);
      } else {
        this.why = standLine(r.why);
        // keep only what a stand could still use
        this.frames = this.frames.filter((x) => x.t >= t - STAND_MS - 500);
      }
      return this.view();
    }
    // jumping: each flight that has landed (long enough to be an attempt, its landing window seen) is judged as it lands,
    // by T5's own grader. TOOLS-EASY (2026-10-28; TUNED, flagged): only a jump that counts fills one of the three; a
    // refused one says its reason and its fix and the check waits for the next. Before, every landed flight filled a slot,
    // and two refused jumps meant "Do the check again" after the take. The number is still gradeT5 over the whole take.
    for (const v of this.judge!.scan(this.frames, this.front!, t)) {
      if (v.valid) { this.landed++; this.refusal = null; this.said(countWord(this.landed)); }
      else { this.refusal = v.line; this.said(v.line!); }
    }
    if (this.landed >= JUMPS_ASKED || t - this.calibratedAt >= JUMP_PHASE_MS) this.step = 'done';
    return this.view();
  }

  /** Done (or stopped early): grade the take and read the day's numbers from it. */
  finish(): CaptureResult {
    this.step = 'done';
    if (!this.front) return { ok: false, why: this.why ?? 'Stand still facing the camera, whole body in the shot, for two seconds.', t5: null };
    const hz = poseHz(this.frames);
    const test = gradeT5(this.frames, { calibration: { aspect: this.o.aspect, front: this.front, side: null }, aspect: this.o.aspect, poseHz: hz, cameraFps: this.o.cameraFps ?? null });
    return dayJumpsOf(test.t5);
  }
}

/** The day's numbers from a graded T5: best and mean of the counted jumps, an outlier left out, and the typical error. */
export function dayJumpsOf(t5: T5Extra): CaptureResult {
  const outliers = new Set(t5.session?.outliers ?? []);
  const counted = t5.jumps.filter((j) => j.valid && !outliers.has(j.index));
  if (counted.length < MIN_JUMPS) {
    const why = t5.jumps.find((j) => !j.valid)?.invalidWhy;
    return { ok: false, why: `Only ${counted.length} jump${counted.length === 1 ? '' : 's'} counted${why ? ` (one did not: ${why})` : ''}. Do the check again: three jumps, hands on hips.`, t5 };
  }
  const hs = counted.map((j) => j.heightCm);
  const te = t5.session?.typicalErrorCm;
  return {
    ok: true, t5,
    jumps: {
      bestCm: r1(Math.max(...hs)), meanCm: r1(hs.reduce((a, b) => a + b, 0) / hs.length),
      teCm: te != null && te > 0 ? r1(te) : r1((Math.max(...hs) * jr('jump.bioCvPct')) / 100), jumps: counted.length, poseHz: r1(t5.poseFps),
    },
  };
}
