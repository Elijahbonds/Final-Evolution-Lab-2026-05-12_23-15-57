// MIRROR-RESULTS (2026-11-03): the Mirror's lunge, hip hinge and push-up reviews on the P3 result card's "no number"
// variant, as the squat's — "<Movement> · N reps" and the verdict. Pure.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lungeVerdict, mirrorReviewView } from '@/lib/coach-tools/reviewResult';

const ROOT = join(__dirname, '..', '..');

describe('the Mirror reviews on the result card', () => {
  it('the lunge\'s line is each side\'s own "what we saw", left then right, word for word', () => {
    const v = lungeVerdict([{ result: { saw: 'Left leg forward: 5 reps, nothing to fix.' } }, { result: { saw: 'Right leg forward: 5 reps. Knees cave in on 3 of 5.' } }]);
    expect(v).toBe('Left leg forward: 5 reps, nothing to fix. Right leg forward: 5 reps. Knees cave in on 3 of 5.');
    expect(mirrorReviewView('Lunge', 10, v)).toMatchObject({ measure: 'Lunge · 10 reps', value: null, line: v });
  });
  it('every review (squat, lunge, hinge, push-up) is a ResultCard with no number and its verdict', () => {
    const harness = readFileSync(join(ROOT, 'app/play/mirror/_components/mirror-harness.tsx'), 'utf8');
    const panels = readFileSync(join(ROOT, 'app/play/mirror/_components/side-rep-panels.tsx'), 'utf8');
    expect(harness).toMatch(/mirrorReviewView\(MOVEMENT_NAMES\.squat, squatWorkReps\.length/);
    expect(harness).toMatch(/mirrorReviewView\(MOVEMENT_NAMES\.lunge,/);
    expect(harness).toContain('movement={MOVEMENT_NAMES.hinge}');
    expect(harness).toContain('movement={MOVEMENT_NAMES.pushup}');
    expect(panels).toMatch(/mirrorReviewView\(movement, r\.check\.reps \+ r\.work\.reps, r\.verdict\)/);
  });
});
