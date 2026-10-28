// armsFree — "Measure my vertical" reads a NATURAL jump, arms free (owner decision, 2026-10-27: "allow arm swing";
// docs/VERTICAL-EASY-AUDIT.md §7). The jump check's own read, with ONE rule lifted: T5's "your hands left your hips"
// (lib/assess/graders/t5-cmj.ts, the last refusal it checks — a jump it refuses for anything else stays refused). The
// set is then summed up again with JUMP-TESTS' own function (lib/jump/protocols.ts resummarise, as its cmjArms test does).
//
// Why the height holds with the arms moving: nothing in the flight read keys on the hands. The finder reads the feet
// (footLowY), a scoring frame needs the hips, knees and feet only (t5-cmj.ts SCORING_POINTS), the re-timing fits the hips'
// parabola (lib/jump/refine.ts, points 23/24) and checks the athlete did not move toward the lens on shoulder and hip width.
// The wrists are read in exactly one place, the refusal lifted here. Measured: the same 36 bench jumps filmed with and
// without an arm swing read identical heights (tests/vertical-easy/arms-free.test.ts). Honest limit (protocols.ts): an arm
// swing moves the centre of mass against the hips, which the bench does not model — the arm-swing number is its own series,
// never compared with the hands-on-hips one (lib/vertical/series.ts).
//
// ONE GUARD THE HANDS RULE USED TO HIDE (TUNED, new: vertical.standDrift). The owner's recorded take
// (jump_two_foot_high) travels 40 cm; read from a stand where it ended, its first jump came back 62.5 cm against 30.5 cm
// of truth — refused before only because the hands left the hips. So an arms-free jump whose feet, just before take-off,
// sit more than vertical.standDrift (0.08 body heights) off the stand's floor line is refused: "You moved from your spot".
// The bench's own jumps never drift past 0.021 (360 jumps, every condition); a 25 cm step toward the lens reads 0.072
// (kept, and read right), the owner's travelled take 0.161 (refused).
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import type { JumpRead, T5Extra, TestResult } from '@/lib/assess/scoring';
import { footLowY } from '@/lib/assess/geometry';
import { th } from '@/lib/assess/thresholds';
import { resummarise, T5_ARMS_WHY } from '@/lib/jump/protocols';

/** The refusal for a jump taken away from where the stand was read (lib/assess/rejection.ts says it plainly). */
export const MOVED_WHY = 'you jumped away from where you stood';

/** How far the feet sat from the stand's floor line just before this take-off, in standing body heights (null: unseen). */
export function standDrift(frames: readonly PoseFrame[], front: FrontCalibration, takeoffT: number): number | null {
  const ys = frames
    .filter((f) => f.present && f.image.length >= 33 && f.t >= takeoffT - 500 && f.t <= takeoffT - 150)
    .map((f) => Math.max(footLowY(f.image, 'left'), footLowY(f.image, 'right')))
    .sort((a, b) => a - b);
  if (!ys.length || !(front.bodyHeight > 0)) return null;
  return Math.abs(ys[ys.length >> 1] - front.floorY) / front.bodyHeight;
}

/** The read with the hands-on-hips refusal lifted, and (given the frames) a jump away from the stand refused. */
export function liftArms(t5: T5Extra, ctx?: { frames: readonly PoseFrame[]; front: FrontCalibration | null }): T5Extra {
  const max = th('vertical.standDrift');
  let changed = false;
  const jumps = t5.jumps.map((j): JumpRead => {
    let out = j;
    if (j.invalidWhy === T5_ARMS_WHY) {
      const { invalidWhy: _why, ...rest } = j;
      void _why;
      out = { ...rest, valid: true };
      changed = true;
    }
    if (out.valid && ctx?.front) {
      const d = standDrift(ctx.frames, ctx.front, out.takeoffT);
      if (d !== null && d > max) { out = { ...out, valid: false, invalidWhy: MOVED_WHY }; changed = true; }
    }
    return out;
  });
  return changed ? resummarise(t5, jumps) : t5;
}

/** A graded T5 with its read lifted (any other test is returned as it is). */
export function liftArmsTest<T extends TestResult>(t: T, ctx?: { frames: readonly PoseFrame[]; front: FrontCalibration | null }): T {
  return t.id === 'T5' && t.t5 ? { ...t, t5: liftArms(t.t5, ctx) } : t;
}
