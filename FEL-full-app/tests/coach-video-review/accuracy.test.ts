// COACH-VIDEO-REVIEW (2026-10-24): rep counting and flag accuracy on the Mirror's pose fixtures.
//
// The labelled sets are tests/helpers/formReviewSets.ts: the stored one-rep fixtures chained (noise-free), whole sets
// filmed with lib/pose/synth.ts's default jitter, drops and misses (seeds 1–4 here; the probe
// scripts/probes/_coach-form-review-accuracy.ts runs 6 and prints the table), and the owner's real standing / running /
// shuffling takes as negatives. Measured 2026-10-24 (6 seeds): 337 of 337 reps counted, none extra; 54 flags, every one
// on a rep that carried an injected fault and naming it; no flag on any clean set. The 6 injected reps NOT flagged are
// the heel lifts — detected on every one (asserted below) but scored 75, over FLAG_BELOW_SCORE, and never the set's worst
// beside a caving knee: the owner's threshold call, not a miss.
import { describe, expect, it } from 'vitest';
import { readSet } from '@/lib/coach/formReview/reader';
import { flagsFor, scoreReps } from '@/lib/coach/formReview/score';
import { REVIEW_MOVEMENTS } from '@/lib/coach/formReview/movements';
import { labelledSets, realNegatives } from '../helpers/formReviewSets';
import { scoreSet } from '../helpers/formReviewAccuracy';

const SETS = labelledSets([1, 2, 3, 4]);

describe('rep counting on labelled sets', () => {
  it('counts every rep of every set, stored and jittered, and never an extra one', () => {
    const wrong = SETS.map((s) => ({ name: s.name, ...scoreSet(s) })).filter((r) => r.counted !== r.trueReps).map((r) => `${r.name}: ${r.counted}/${r.trueReps}`);
    expect(wrong).toEqual([]);
    expect(SETS.reduce((a, s) => a + s.truth.reps, 0)).toBeGreaterThanOrEqual(200);
  });

  it('a body standing still in the owner\'s real take counts no rep for any movement', () => {
    const still = realNegatives().find((n) => n.name === 'stand_still')!;
    for (const m of REVIEW_MOVEMENTS) expect(readSet(m, still.frames), m).toEqual([]);
  });

  it('running in place and shuffling (real takes): no lunge, hinge or push-up rep; at most one squat-shaped dip', () => {
    // measured 2026-10-24: run_in_place reads ONE squat rep (a hip dip deep enough to arm squatStage's REP_MIN_DROP);
    // shuffle_lateral none. The review only ever runs on the movement the slot names, so this is a bound, not a goal.
    for (const n of realNegatives().filter((x) => x.name !== 'stand_still')) {
      for (const m of ['lunge', 'hinge', 'pushup'] as const) expect(readSet(m, n.frames), `${n.name} ${m}`).toEqual([]);
      expect(readSet('squat', n.frames).length, n.name).toBeLessThanOrEqual(1);
    }
  });

  it('a frame handed over twice (a 60 Hz display on a 30 fps camera) changes no count', () => {
    for (const s of SETS.filter((x) => x.kind === 'stored')) {
      const doubled = s.frames.flatMap((f) => [f, f]);
      expect(readSet(s.movement, doubled).length, s.name).toBe(s.truth.reps);
    }
  });
});

describe('flag accuracy on labelled sets', () => {
  const scored = SETS.map((s) => ({ s, r: scoreSet(s) }));

  it('every flag lands on a rep that carried an injected fault, and names that fault (precision 100% on these sets)', () => {
    const bad = scored.filter(({ r }) => r.truePositiveFlags !== r.flags).map(({ s, r }) => `${s.name}: ${r.detail.join(' ')}`);
    expect(bad).toEqual([]);
  });

  it('a clean set flags nothing', () => {
    const noisy = scored.filter(({ s, r }) => !Object.keys(s.truth.faulty).length && r.flags > 0).map(({ s, r }) => `${s.name}: ${r.detail.join(' ')}`);
    expect(noisy).toEqual([]);
  });

  it('every injected knee, lunge, hinge and push-up fault is flagged; heel lifts are detected and scored, below the flag line', () => {
    for (const { s, r } of scored) {
      const heel = Object.entries(s.truth.faulty).filter(([, f]) => f.includes('heelRise')).map(([n]) => Number(n));
      expect(r.injectedFlagged, s.name).toBe(r.injected - heel.length);
      if (heel.length) {
        const reps = scoreReps(s.movement, readSet(s.movement, s.frames));
        for (const n of heel) {
          expect(reps[n - 1].faults, `${s.name} rep ${n}`).toEqual(['heelRise']);
          expect(reps[n - 1].score, `${s.name} rep ${n}`).toBe(75);
        }
      }
    }
  });

  it('the knee flag names its side: "Left knee caves on rep 3", "Both knees cave on rep 5", "Right knee caves on rep 6"', () => {
    const s = SETS.find((x) => x.name.startsWith('stored squat'))!;
    const flags = flagsFor('squat', scoreReps('squat', readSet('squat', s.frames)));
    expect(flags.map((f) => f.reason).sort()).toEqual(['Both knees cave on rep 5', 'Left knee caves on rep 3', 'Right knee caves on rep 6']);
  });
});
