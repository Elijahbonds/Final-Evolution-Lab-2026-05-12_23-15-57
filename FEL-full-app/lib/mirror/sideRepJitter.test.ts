// MIRROR-FIXES (2026-10-25): the live side-on stage (sideRepStage.ts) under the synth's default landmark jitter —
// the findings lane/coach-video-review measured on the live hinge and push-up (docs/COACH-VIDEO-REVIEW.md §8).
//   1. Each rep is graded on its own frames. The stage used to grade a rep on every frame since the rep before it
//      closed, so the end of a faulty rep (a head still poked, a plank still sagging at the top) leaked into the next
//      rep's grade: 12 false flags of 36 over 6 seeds (6 hinge, 6 push-up). Now 0, every injected fault still caught.
//   2. The setup hold rides out a brief dip of the rep signal (SETUP_SIGNAL_GRACE_MS). With the builder's 1.5 s hold the
//      first push-up rep was missed on 4 of 6 seeds (the plank's elbow read under the line ~1 frame in 4, and each dip
//      paused the 1 s hold). Now every rep counts, and a body that is not at the top for longer than the grace still waits.
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { SETUP_HOLD_MS, SETUP_SIGNAL_GRACE_MS, gradeRep, initialSideRep, stepSideRep, type SideRepSpec } from './sideRepStage';
import { filmBodies, SETUP_FRAMES } from './fixtures/sideRepBuild';
import { pushupPose } from './fixtures/build';
import { HINGE_LIVE } from './hingeStage';
import { PUSHUP_LIVE } from './pushupStage';
import { hingeSets, pushupSets, realNegatives, type JitterSet } from '@/tests/helpers/mirrorJitterSets';

const SEEDS = [1, 2, 3, 4, 5, 6];
/** The jittered sets' still hold before the first rep (2.5 s, sideRepStage.test.ts's own convention for jittered sets). */
const LONG_SETUP = 75;

/** Every rep of a set, through the live step (check and work sized so a 6-rep set is all counted), with where each closed. */
function live<F extends string>(spec: SideRepSpec<F>, frames: readonly PoseFrame[]) {
  const big: SideRepSpec<F> = { ...spec, checkReps: 60, workReps: 60 };
  let s = initialSideRep<F>();
  const closedAt: number[] = [];
  frames.forEach((f, i) => {
    const step = stepSideRep(big, s, { nowMs: f.t, frame: f });
    s = step.state;
    if (step.repClosed) closedAt.push(i);
  });
  return { reps: [...s.checkReps, ...s.workReps], side: s.side, closedAt };
}

const cases: [string, SideRepSpec<string>, JitterSet[]][] = [
  ['hinge', HINGE_LIVE as SideRepSpec<string>, hingeSets(SEEDS, LONG_SETUP)],
  ['push-up', PUSHUP_LIVE as SideRepSpec<string>, pushupSets(SEEDS, LONG_SETUP)],
];

describe('a side-on rep is graded on its own frames (no leak into the next rep)', () => {
  for (const [name, spec, sets] of cases) {
    it(`${name}: every rep carries exactly the faults injected on it — none on the rep after a faulty one (6 seeds)`, () => {
      const wrong: string[] = [];
      for (const s of sets) {
        const { reps } = live(spec, s.frames);
        expect(reps.length, s.name).toBe(s.reps);
        reps.forEach((r, i) => {
          const want = spec.faults.filter((f) => (s.faulty[i + 1] ?? []).includes(f));
          if (JSON.stringify(r.faults) !== JSON.stringify(want) || !r.read) wrong.push(`${s.name} rep ${i + 1}: ${r.faults.join('+') || 'clean'}${r.read ? '' : ' (not read)'}`);
        });
      }
      expect(wrong).toEqual([]);
    });

    it(`${name}: control — graded on every frame since the rep before it closed (the old window), the rep after a faulty one is flagged`, () => {
      let leaks = 0;
      for (const s of sets.filter((x) => Object.keys(x.faulty).length)) {
        const { closedAt, side } = live(spec, s.frames);
        for (const n of Object.keys(s.faulty).map(Number)) {
          if (s.faulty[n + 1] || n >= closedAt.length) continue;          // the next rep is clean and was counted
          const old = gradeRep(spec, s.frames.slice(closedAt[n - 1], closedAt[n] + 1), side!);
          if (old.faults.length) leaks++;
        }
      }
      expect(leaks).toBe(SEEDS.length);                                   // one per set: 12 of 36 flags across both
    });
  }

  it('real negatives stay negative: standing still, running in place and shuffling count no hinge and no push-up', () => {
    for (const n of realNegatives()) {
      expect(live(HINGE_LIVE, n.frames).reps, `${n.name} hinge`).toEqual([]);
      expect(live(PUSHUP_LIVE, n.frames).reps, `${n.name} push-up`).toEqual([]);
    }
  });
});

describe('the setup hold under landmark jitter (SETUP_SIGNAL_GRACE_MS)', () => {
  for (const [name, spec, sets] of [
    ['push-up', PUSHUP_LIVE as SideRepSpec<string>, pushupSets(SEEDS)],
    ['hinge', HINGE_LIVE as SideRepSpec<string>, hingeSets(SEEDS)],
  ] as const) {
    it(`${name}: with the builder's ${SETUP_FRAMES / 30} s still hold, the first rep counts on every seed (push-up was 4 of 6 missed)`, () => {
      const short = sets.map((s) => ({ s, n: live(spec, s.frames).reps.length })).filter(({ s, n }) => n !== s.reps).map(({ s, n }) => `${s.name}: ${n}/${s.reps}`);
      expect(short).toEqual([]);
    });
  }

  const stage = (frames: readonly PoseFrame[]) => {
    let s = initialSideRep<string>();
    for (const f of frames) s = stepSideRep(PUSHUP_LIVE as SideRepSpec<string>, s, { nowMs: f.t, frame: f }).state;
    return s.stage;
  };

  it('a plank held with the elbows bent (jittered, 3 s) never starts: the signal is out the whole time, not dipping', () => {
    for (const seed of SEEDS) expect(stage(filmBodies(Array.from({ length: 90 }, () => pushupPose(0.5)), seed)), `seed ${seed}`).toBe('setup');
  });

  it('at the top only 1 frame in 4 (4 s): never starts — the grace bridges a dip, not a body that is mostly elsewhere', () => {
    expect(SETUP_SIGNAL_GRACE_MS).toBeLessThan(3 * (1000 / 30) + 1000 / 30);   // 3 bent frames running outlast it at 30 fps
    const bodies = Array.from({ length: 120 }, (_, i) => pushupPose(i % 4 === 0 ? 0 : 0.5));
    expect(stage(filmBodies(bodies))).toBe('setup');
  });

  it('a dip longer than the grace pauses the hold: 0.6 s at the top, 0.5 s bent, 0.3 s at the top is still not a start', () => {
    const top = (n: number) => Array.from({ length: n }, () => pushupPose(0));
    const bodies = [...top(18), ...Array.from({ length: 15 }, () => pushupPose(0.5)), ...top(9)];
    expect(18 / 30 + 9 / 30).toBeLessThan(SETUP_HOLD_MS / 1000);
    expect(stage(filmBodies(bodies))).toBe('setup');
  });
});
