// lib/combine/jumpTake.ts — COMBINE-DAY (2026-10-25): one athlete's standing jumps at the jump station, read live.
//
// THE JUMP CHECK'S OWN CODE, RE-USED, NOT REBUILT — the readiness check's take (lib/coach/readiness/capture.ts) with the
// number of jumps set by the station's attempts instead of fixed at three. The athlete stands still for STAND_MS (the
// floor and the body's size: lib/assess/calibration.ts calibrateFront, the Quick Screen's own), then jumps, hands on
// hips; flights are counted live with T5's finder (detectFlights) and the take is graded by gradeT5, every flight
// re-timed by JUMP-PRO's refiner. Each counted jump is one attempt; a jump the grader refused or flagged as an outlier
// (lib/jump/session.ts) is a no-mark, as a coach would call a jump with the hands off the hips.
//
// NO ACCURACY CLAIM (owner, until the force-plate pilot): the heights are kept as numbers; no ± is passed on.
// Pure: frames in, a view and the attempts out. Nothing here keeps or sends a frame.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { poseHz, type T5Extra } from '@/lib/assess/scoring';
import { JUMP_PHASE_MS, STAND_MS } from '@/lib/coach/readiness/thresholds';
import { JumpJudge, StandRead, countWord, standLine } from '@/lib/tools-easy/liveJump';

export type TakeStep = 'stand' | 'jump' | 'done';
/**
 * TOOLS-EASY (2026-10-28): `refusal` is the last no-mark's reason and fix (a refused jump is still a no-mark, the coach's
 * call — now with the why, so the coach can tell the athlete what to change); `say` is the newest line to say aloud.
 */
export interface TakeView { step: TakeStep; jumps: number; asked: number; why: string | null; refusal?: string | null; say?: { id: number; text: string } | null }
export type TakeResult =
  | { ok: true; attempts: { value: number | null }[] }
  | { ok: false; why: string };

const READ_EVERY = 6;
const r1 = (x: number) => Math.round(x * 10) / 10;

export class JumpTake {
  private frames: PoseFrame[] = [];
  private front: FrontCalibration | null = null;
  private standFrom = 0;
  private calibratedAt = 0;
  private landed = 0;
  private why: string | null = null;
  private step: TakeStep = 'stand';
  private n = 0;
  private refusal: string | null = null;
  private say: { id: number; text: string } | null = null;
  private readonly stand: StandRead;
  private judge: JumpJudge | null = null;
  readonly asked: number;

  constructor(private readonly o: { jumps: number; aspect: number; cameraFps?: number | null }) {
    this.asked = Math.max(1, Math.round(o.jumps));
    this.stand = new StandRead(o.aspect, STAND_MS);
  }

  view(): TakeView {
    return { step: this.step, jumps: this.landed, asked: this.asked, why: this.why, refusal: this.refusal, say: this.say };
  }

  private said(text: string): void { this.say = { id: (this.say?.id ?? 0) + 1, text }; }

  push(f: PoseFrame): TakeView {
    if (this.step === 'done') return this.view();
    this.frames.push(f);
    this.n++;
    if (this.n % READ_EVERY) return this.view();
    const t = f.t;
    if (this.step === 'stand') {
      const hold = this.frames.filter((x) => x.t >= t - STAND_MS);
      // TOOLS-EASY: the readiness check's stand, with the Quick Screen's accepted sway fallback
      const r = this.stand.read(hold, t);
      if (r.ok) {
        this.front = r.value;
        this.standFrom = hold[0].t;
        this.calibratedAt = t;
        this.step = 'jump';
        this.why = null;
        this.judge = new JumpJudge(this.o.aspect);
        this.said('Jump!');
        this.frames = this.frames.filter((x) => x.t >= this.standFrom);
      } else {
        this.why = standLine(r.why);
        this.frames = this.frames.filter((x) => x.t >= t - STAND_MS - 500);
      }
      return this.view();
    }
    // every landed flight is an attempt, as before; TOOLS-EASY: each is judged as it lands, so a no-mark says why
    for (const v of this.judge!.scan(this.frames, this.front!, t)) {
      this.landed++;
      if (v.valid) { this.refusal = null; this.said(countWord(this.landed)); }
      else { this.refusal = v.line; this.said(`No mark. ${v.line}`); }
    }
    if (this.landed >= this.asked || t - this.calibratedAt >= JUMP_PHASE_MS) this.step = 'done';
    return this.view();
  }

  finish(): TakeResult {
    this.step = 'done';
    if (!this.front) return { ok: false, why: this.why ?? 'Stand still facing the camera, whole body in the shot, for two seconds.' };
    const hz = poseHz(this.frames);
    const test = gradeT5(this.frames, { calibration: { aspect: this.o.aspect, front: this.front, side: null }, aspect: this.o.aspect, poseHz: hz, cameraFps: this.o.cameraFps ?? null });
    return takeAttempts(test.t5, this.asked);
  }
}

/** The take's jumps as attempts, in order: a counted jump's height, else a no-mark. At most `asked`. */
export function takeAttempts(t5: T5Extra | undefined, asked: number): TakeResult {
  const jumps = t5?.jumps ?? [];
  if (!jumps.length) return { ok: false, why: 'No jump was seen. Whole body in the shot, then jump straight up, hands on hips.' };
  const outliers = new Set(t5?.session?.outliers ?? []);
  const attempts = jumps.slice(0, asked).map((j) => ({ value: j.valid && !outliers.has(j.index) && Number.isFinite(j.heightCm) ? r1(j.heightCm) : null }));
  return { ok: true, attempts };
}
