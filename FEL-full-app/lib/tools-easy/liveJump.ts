// liveJump — what the readiness check and the combine jump station read LIVE, shared (TOOLS-EASY, 2026-10-28).
//
// Both takes (lib/coach/readiness/capture.ts, lib/combine/jumpTake.ts) stand still, then count jumps as they land. Before
// this lane they counted every landed flight and judged them only after the take: a jump with the hands off the hips
// filled a slot without a word, and the athlete found out — if at all — when the check said "Do the check again". The
// Quick Screen's runner (lib/assess/runner.ts feedJump) already judges each jump as it lands; this is the same move for
// the two small takes, with the same grader and the same words:
//
//   standRead   the stand (lib/assess/calibration.ts calibrateFront, unchanged), with VERTICAL-EASY's accepted sway
//               fallback (calib.swayFallback, signed off 2026-10-27) from the second stand that is refused for sway.
//   JumpJudge   each flight that has landed and settled is graded with T5's own grader on the take so far (gradeT5,
//               unchanged) and handed back with its verdict and, when refused, the reason and the fix (the vertical's
//               lines, lib/assess/rejection.ts, plus a fix for the reasons that had none).
//
// Nothing is measured here a new way: the final number is still gradeT5 over the whole take, read by each take's own
// finish(). Pure: frames in, verdicts out.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { calibrateFront, type CalibrationResult, type FrontCalibration } from '@/lib/assess/calibration';
import { detectFlights, gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { rejectionFromInvalidWhy } from '@/lib/assess/rejection';
import { th } from '@/lib/assess/thresholds';

/** calibrateFront's sway refusal (its own words): the one the fallback may read again. */
const SWAY_WHY = 'Hold still for a moment';

/**
 * The stand, read on a sliding window. A window refused for SWAY is remembered; once a whole fresh window (`ms` later) is
 * refused for sway too, that window is read once more at calib.swayFallback — the runner's "second stand", the same
 * number. Every other check (enough usable frames, facing the camera, the body's size) is unchanged.
 */
export class StandRead {
  private swayRefusedAt: number | null = null;
  constructor(private readonly aspect: number, private readonly ms: number) {}

  read(hold: readonly PoseFrame[], t: number): CalibrationResult<FrontCalibration> {
    const r = calibrateFront(hold, this.aspect, this.ms);
    if (r.ok || !r.why.startsWith(SWAY_WHY)) return r;
    if (this.swayRefusedAt === null) { this.swayRefusedAt = t; return r; }
    if (t - this.swayRefusedAt < this.ms) return r;
    const loose = calibrateFront(hold, this.aspect, this.ms, th('calib.swayFallback'));
    return loose.ok ? loose : r;
  }
}

export interface JumpVerdict {
  /** 1-based, in take order. */
  index: number;
  valid: boolean;
  heightCm: number;
  /** The grader's own reason (lib/assess/graders/t5-cmj.ts invalidWhy), when refused. */
  why: string | null;
  /** What the athlete reads and hears: the reason and the fix, one line (null when it counted). */
  line: string | null;
}

/** A refused jump's line: the vertical's reason-and-fix where there is one, else the grader's reason with a fix. */
export function refusalLine(why: string | null | undefined): string {
  const r = rejectionFromInvalidWhy(why);
  if (r.reason !== 'other') return r.text;
  const w = (why ?? '').trim().replace(/\.$/, '');
  return w ? `That one did not count: ${w}. Stand still on your spot, then jump again.` : 'That one did not count. Stand still on your spot, then jump again.';
}

/**
 * Judges each jump once it has landed and the landing has settled (t5.landingWindowMs, the takes' own wait). `scan` is
 * cheap when nothing new has landed (the flight finder only); the grader runs once per new jump.
 */
export class JumpJudge {
  private graded = 0;
  constructor(private readonly aspect: number) {}

  /** New verdicts since the last scan (usually none, sometimes one). */
  scan(frames: readonly PoseFrame[], front: FrontCalibration, t: number): JumpVerdict[] {
    const minMs = th('t5.flightMinMs'), settle = th('t5.landingWindowMs');
    const landed = detectFlights(frames, front).filter((x) => x.landed && x.landT - x.takeoffT >= minMs && x.landT + settle <= t).length;
    if (landed <= this.graded) return [];
    const res = gradeT5(frames, { calibration: { aspect: this.aspect, front, side: null }, aspect: this.aspect });
    const out: JumpVerdict[] = [];
    for (let k = this.graded; k < Math.min(landed, res.t5.jumps.length); k++) {
      const j = res.t5.jumps[k];
      out.push({ index: k + 1, valid: j.valid, heightCm: j.heightCm, why: j.valid ? null : j.invalidWhy ?? null, line: j.valid ? null : refusalLine(j.invalidWhy) });
    }
    this.graded += out.length;
    return out;
  }
}

/** The counted jump's spoken number ("One.", "Two.", …), the Quick Screen's own words. */
export const countWord = (n: number): string => ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'][n - 1] ?? `${n}.`;

/**
 * The stand's refusal in this take's words. calibrateFront speaks for the Quick Screen ("arms by your sides", "for three
 * seconds"); these takes stand with the hands on the hips for two seconds, so its two lines that say otherwise are
 * said the way the take asks. Its other lines (step back, …) pass through.
 */
export function standLine(why: string | null): string | null {
  if (!why) return null;
  if (why.startsWith(SWAY_WHY)) return 'Stand still, hands on hips.';
  if (why.startsWith('Stand still facing the camera')) return 'Face the camera, whole body in the shot, and stand still.';
  return why;
}
