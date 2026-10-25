// Test and rig support for COACH-LIVE (2026-10-25): a program set built from the Mirror's own deterministic fixtures
// (lib/mirror/fixtures — synthetic bodies, no person filmed), one fixture take per rep, laid end to end on one clock.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { filmFixture } from '@/lib/mirror/fixtures';
import { hingeSet } from '@/lib/mirror/fixtures/sideRepBuild';

export type SquatRep = 'clean' | 'kneeInLeft' | 'kneeInRight';
const TAKE: Record<SquatRep, string> = { clean: 'squat_clean', kneeInLeft: 'squat_knee_in_left', kneeInRight: 'squat_knee_in_right' };

/** One squat take per rep, end to end. `t0` moves the whole set onto another clock. */
export function squatSet(reps: readonly SquatRep[], t0 = 0): PoseFrame[] {
  const out: PoseFrame[] = [];
  let base = t0;
  for (const r of reps) {
    const take = filmFixture(TAKE[r]);
    const start = take[0].t;
    for (const f of take) out.push({ ...f, t: base + (f.t - start), arrive: undefined });
    base = out[out.length - 1].t + 1000 / 30;
  }
  return out.map(({ arrive: _a, ...f }) => f);
}

export { hingeSet };
