// MUSIC-SUITE P8 FIX: "GOOD no longer drags the dancer off the grid." Regression test for dragFor (DanceMode.ts,
// module scope) — the decision that used to be unbounded ("apply 0.85x/0.95x and leave it until the next step
// resets it"), which the design audit measured as ~1.2 beats of lag on an 8-beat step (windmill / six-step —
// understand-wf_3a55346f-032.json:1705). See dragFor's own doc for the full reasoning.
import { describe, expect, it } from 'vitest';
import { dragFor, celebratingFor, resultFlashFor } from './DanceMode';
import { STAGE_BEAT_SEC, STAGE_INPUT_IDLE, stageWindow } from '../core/StagePosture';
import { bodySpeedFor, gradeFor } from '../core/danceTracks';

describe('DanceMode.dragFor — the bounded GOOD/GREAT drag', () => {
  it('a clean hit (PERFECT) never drags', () => {
    expect(dragFor('PERFECT', 'dance_power_windmill', 10)).toBeNull();
  });
  it('a MISS never drags (it has its own stumble path in onJudged)', () => {
    expect(dragFor('MISS', 'dance_power_windmill', 10)).toBeNull();
  });
  it('no currently-playing clip means nothing to drag', () => {
    expect(dragFor('GOOD', null, 10)).toBeNull();
  });
  it('a GOOD drags the current clip, bounded to STAGE_BEAT_SEC of song time — not "until the next step"', () => {
    const d = dragFor('GOOD', 'dance_power_windmill', 10);
    expect(d).not.toBeNull();
    expect(d!.clip).toBe('dance_power_windmill');
    expect(d!.untilSec).toBeCloseTo(10 + STAGE_BEAT_SEC, 9);
    // THE BUG, quantified: an 8-beat step at 120 BPM is 4 s; the old code dragged bodySpeedFor('GOOD') (0.85×) for
    // the step's entire remaining length. The fixed bound is a small fraction of that — the step catches back up
    // toward the grid instead of running its whole remainder under tempo.
    const eightBeatStepSec = (8 * 60) / 120;
    expect(d!.untilSec - 10).toBeLessThan(eightBeatStepSec * 0.5);
  });
  it('a GREAT (also < 1×, per bodySpeedFor) drags too, on the same bound', () => {
    expect(bodySpeedFor('GREAT')).toBeLessThan(1);
    const d = dragFor('GREAT', 'dance_toprock_basic', 3.5);
    expect(d).toEqual({ clip: 'dance_toprock_basic', untilSec: 3.5 + STAGE_BEAT_SEC });
  });
});

// MUSIC-SUITE P8 FIX: "a D grade gets the dejected pose at results." Regression test for celebratingFor and its
// wiring into StagePosture.stageWindow — before this fix, `bio.celebrating = ended` was unconditional (design audit
// — understand-wf_3a55346f-032.json:1697), so `bio.dejected` (which StagePosture.stageWindow already branched on)
// never won even when the run graded D.
describe('DanceMode.celebratingFor — the dejected pose no longer loses to the win pose', () => {
  it('a finished run with no dejection celebrates, same as before', () => {
    expect(celebratingFor(true, false)).toBe(true);
  });
  it('a run that ends dejected does NOT also celebrate', () => {
    expect(celebratingFor(true, true)).toBe(false);
  });
  it('a run in progress (not ended) neither celebrates nor is dejected', () => {
    expect(celebratingFor(false, false)).toBe(false);
    expect(celebratingFor(false, true)).toBe(false);   // dejected only ever gets set once ended (finish()), but the read side is defensive too
  });
  it('gradeFor(D-band accuracy) plus celebratingFor drives StagePosture.stageWindow to "dejected", not "celebrate"', () => {
    const accuracy = 0.3;   // < 0.5 => 'D' (danceTracks.gradeFor)
    const grade = gradeFor(accuracy);
    expect(grade).toBe('D');
    const dejected = grade === 'D';   // finish()'s own one-line assignment
    const celebrating = celebratingFor(true, dejected);
    expect(stageWindow({ ...STAGE_INPUT_IDLE, celebrating, dejected })).toBe('dejected');
  });
  it('a B grade still celebrates (only D is dejected — this fix is scoped to D, per the task)', () => {
    const grade = gradeFor(0.75);   // 0.7..0.85 => 'B'
    expect(grade).toBe('B');
    const dejected = grade === 'D';
    const celebrating = celebratingFor(true, dejected);
    expect(stageWindow({ ...STAGE_INPUT_IDLE, celebrating, dejected })).toBe('celebrate');
  });
});

// MUSIC-SUITE P8 FIX (2026-09-29): "an S grade no longer stacks two gold whiteouts." Regression test for
// resultFlashFor — before this fix, resultBeat's own GREAT flash (ctx.juice.flash('#FFD700', ...)) fired
// unconditionally whenever stars >= 3, completely outside beatBus's own bookkeeping; finish() then ALSO fired a
// second, separate flash for an S grade (beatBus.cheer('gradeS', ...)) a few lines later. Since an S grade is, in
// practice, almost always also a >=3-star run, both fired in the same instant: two near-identical gold whiteouts
// stacked on top of each other. See resultBeat's own doc for why beatBus's rate limiter alone (maxFlashPerSec = 3)
// could not have fixed this by itself — it still would have allowed two simultaneous flashes through.
describe('DanceMode.resultFlashFor — an S grade drops the redundant GREAT flash', () => {
  it('a >=3-star, non-S result flashes normally (rate limit permitting)', () => {
    expect(resultFlashFor(true, true, false)).toBe(true);
  });
  it('an S grade result (skipOwnFlash) never ALSO fires resultBeat\'s own flash, even if the bus would allow it', () => {
    expect(resultFlashFor(true, true, true)).toBe(false);
  });
  it('the beat bus\'s own rate limit still applies when not skipped (a flash-storm guard, independent of the S-grade case)', () => {
    expect(resultFlashFor(true, false, false)).toBe(false);
  });
  it('a GOOD (not great) result never flashes at all, skip or not', () => {
    expect(resultFlashFor(false, true, false)).toBe(false);
    expect(resultFlashFor(false, true, true)).toBe(false);
  });
});
