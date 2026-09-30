// MUSIC-SUITE P9 (2026-09-29): the press-only additions to DanceCore — press holds (pressHoldBeats + release()),
// freestyle variety (pressFree + varietyFactor), and the display-only accents / double taps (pressKind) — and the
// movement-play terms they were approved on: none of them changes what a BODY step scores, and a chart without them
// judges exactly as before (DanceCore.equivalence.test.ts holds the second against the frozen pre-P9 core).

import { describe, it, expect } from 'vitest';
import {
  DancePerformance, varietyFactor, VARIETY_PENALTY, VARIETY_FLOOR, HOLD_RELEASE_EARLY_SEC, HOLD_KEPT_POINTS, MISS_AFTER,
  holdReleaseEarlySec, HOLD_RELEASE_EARLY_SHARE,
  isPressHold, isFreeSlot, type DanceStep, type Judgement,
} from './DanceCore';

const BPM = 60;   // one beat = 1 s: times below read as beats
const step = (beat: number, extra: Partial<DanceStep> = {}): DanceStep => ({ clipId: 'dance_toprock_basic', beat, holdBeats: 4, mirrored: false, ...extra });

function run(steps: DanceStep[], start = 10): { p: DancePerformance; judged: [Judgement, number, number][]; holds: [boolean, number][] } {
  const p = new DancePerformance(BPM);
  p.setRoutine(steps);
  const judged: [Judgement, number, number][] = [];
  const holds: [boolean, number][] = [];
  p.onJudged = (l, pts, combo) => { judged.push([l, pts, combo]); };
  p.onHoldEnd = (kept, _s, pts) => { holds.push([kept, pts]); };
  p.start(start);
  return { p, judged, holds };
}

describe('press holds (pressHoldBeats)', () => {
  const chart = () => [step(0, { pressHoldBeats: 2 }), step(4)];

  it('held through its end: the head, then a kept PERFECT tail when the clock passes the end — no release needed', () => {
    const { p, holds } = run(chart());
    p.update(10);
    expect(p.hit(10.01, { key: 'A' })).toBe('PERFECT');
    expect(p.holding).toBe(true);
    expect(p.holdLeftSec(11)).toBeCloseTo(1, 6);
    p.update(11.99);
    expect(p.holding).toBe(true);
    p.update(12);
    expect(p.holding).toBe(false);
    expect(holds).toEqual([[true, HOLD_KEPT_POINTS]]);
    expect(p.counts).toEqual({ PERFECT: 2, GREAT: 0, GOOD: 0, MISS: 0 });
    expect(p.combo).toBe(2);
    // head 300 + 5, tail 300 + 10
    expect(p.score).toBe(300 + 5 + HOLD_KEPT_POINTS + 10);
    expect(p.result().holds).toEqual({ kept: 1, dropped: 0 });
  });

  it('let go inside the last HOLD_RELEASE_EARLY_SEC: kept; earlier: dropped (a MISS tail, the combo breaks)', () => {
    {
      const { p, holds } = run(chart());
      p.update(10); p.hit(10, { key: 'A' });
      expect(p.release(12 - HOLD_RELEASE_EARLY_SEC, 'A')).toBe(true);
      expect(holds).toEqual([[true, HOLD_KEPT_POINTS]]);
    }
    {
      const { p, holds } = run(chart());
      p.update(10); p.hit(10, { key: 'A' });
      expect(p.release(12 - HOLD_RELEASE_EARLY_SEC - 0.01, 'A')).toBe(false);
      expect(holds).toEqual([[false, 0]]);
      expect(p.combo).toBe(0);
      expect(p.counts).toEqual({ PERFECT: 1, GREAT: 0, GOOD: 0, MISS: 1 });
      expect(p.result().holds).toEqual({ kept: 0, dropped: 1 });
      p.update(13);                                          // nothing more happens at the end: the hold is over
      expect(holds).toHaveLength(1);
    }
  });

  it('only the key that pressed the head ends it; any other release is a free no-op', () => {
    const { p, holds } = run(chart());
    p.update(10); p.hit(10, { key: 'B' });
    expect(p.release(10.5, 'A')).toBeNull();
    expect(p.release(10.5, undefined)).toBeNull();
    expect(p.holding).toBe(true);
    expect(p.release(10.6, 'B')).toBe(false);
    expect(holds).toEqual([[false, 0]]);
    expect(p.release(11, 'B')).toBeNull();                 // nothing held any more
  });

  it('a caller that never names keys (hit(t) / release(t)) still holds and releases', () => {
    const { p, holds } = run(chart());
    p.update(10); p.hit(10);
    expect(p.release(11.9)).toBe(true);
    expect(holds).toEqual([[true, HOLD_KEPT_POINTS]]);
  });

  it('a hold whose head is never pressed drops its tail too: two MISSes, so skipping a hold is never better than dropping it', () => {
    const { p, judged, holds } = run(chart());
    for (let t = 10; t <= 10.3; t += 0.05) p.update(t);
    expect(judged.map((j) => j[0])).toEqual(['MISS']);
    expect(holds).toEqual([[false, 0]]);
    expect(p.counts.MISS).toBe(2);
  });

  it('an EARLY head (hit() before the step fires) starts the hold on the step\'s own time', () => {
    const { p, holds } = run(chart());
    p.update(9.9);
    expect(p.hit(9.95, { key: 'A' })).toBe('GREAT');       // 50 ms early, taken ahead of the frame that fires it
    expect(p.holding).toBe(true);
    p.update(11.9);
    expect(holds).toEqual([]);                              // ends on the step's time + 2 beats (12), not the press's + 2
    p.update(12);
    expect(holds).toEqual([[true, HOLD_KEPT_POINTS]]);
  });

  it('a GO AGAIN on the same instance starts with no hold down', () => {
    const { p, holds } = run(chart());
    p.update(10); p.hit(10, { key: 'A' });
    p.start(100);
    expect(p.holding).toBe(false);
    expect(p.release(100.5, 'A')).toBeNull();
    expect(holds).toEqual([]);
  });

  it('a hand-made chart that starts a hold inside another settles the first (the validator refuses such a chart)', () => {
    const { p, holds } = run([step(0, { pressHoldBeats: 4 }), step(1, { pressHoldBeats: 1 })]);
    p.update(10); p.hit(10, { key: 'A' });
    p.update(11); p.hit(11, { key: 'B' });
    expect(holds).toEqual([[false, 0]]);                    // the first was 3 s from its end: dropped
    p.update(12);
    expect(holds).toEqual([[false, 0], [true, HOLD_KEPT_POINTS]]);
  });

  it('the result carries no `holds` key on a chart without one', () => {
    const { p } = run([step(0), step(1)]);
    p.update(10); p.hit(10); p.update(11); p.hit(11); p.update(13);
    expect(Object.keys(p.result()).sort()).toEqual(['accuracy', 'counts', 'maxCombo', 'score', 'stars']);
  });
});

describe('double taps and accents (pressKind): plain press steps', () => {
  const dbl = () => [step(0), step(0.5, { pressKind: 'double' }), step(2, { pressKind: 'accent' })];

  it('both taps of a double score; the judge never reads pressKind (same answer with it stripped)', () => {
    const judge = (steps: DanceStep[]): [Judgement, number, number][] => {
      const { p, judged } = run(steps);
      for (const t of [10, 10.02, 10.5, 10.53, 12, 12.01, 14]) { p.update(t); if ([10.02, 10.53, 12.01].includes(t)) p.hit(t); }
      return judged;
    };
    const withKinds = judge(dbl());
    const plain = judge(dbl().map(({ pressKind: _k, ...s }) => s));
    expect(withKinds).toEqual([['PERFECT', 300, 1], ['PERFECT', 300, 2], ['PERFECT', 300, 3]]);
    expect(withKinds).toEqual(plain);
  });

  it('one press on a double scores one tap and the other expires a MISS', () => {
    const { p, judged } = run(dbl());
    p.update(10); p.hit(10.01);
    for (let t = 10.05; t < 11; t += 0.05) p.update(t);
    expect(judged.map((j) => j[0])).toEqual(['PERFECT', 'MISS']);
  });

  it('a mash through a double is still wild taps, capped at GOOD after them (the spam rules are unchanged)', () => {
    const { p } = run(dbl());
    p.update(9.78);
    expect(p.hit(9.78)).toBe('MISS');                      // 220 ms early: past the window, a wild tap
    p.update(10);
    expect(p.hit(10)).toBe('GOOD');                        // on time, but inside SPAM_LOCK_SEC (0.25 s) of the wild tap
  });

  it('isPressHold / isFreeSlot never call a body step one', () => {
    const body = step(0, { move: 'jump', pressHoldBeats: 2, pressFree: true });
    expect(isPressHold(body)).toBe(false);
    expect(isFreeSlot(body)).toBe(false);
    expect(isPressHold(step(0, { pressHoldBeats: 2 }))).toBe(true);
    expect(isPressHold(step(0, { pressHoldBeats: 0 }))).toBe(false);
    expect(isFreeSlot(step(0, { pressFree: true }))).toBe(true);
  });
});

describe('freestyle variety (pressFree + varietyFactor)', () => {
  it('the table the doc promises', () => {
    expect(VARIETY_PENALTY).toEqual([0.5, 0.3, 0.15]);
    expect(varietyFactor([], 'A')).toBe(1);
    expect(varietyFactor(['A'], 'A')).toBe(0.5);                          // the same move twice in a row
    expect(varietyFactor(['A', 'B'], 'A')).toBeCloseTo(0.7, 12);          // two moves alternating
    expect(varietyFactor(['A', 'B', 'X'], 'A')).toBeCloseTo(0.85, 12);    // three in turn
    expect(varietyFactor(['A', 'B', 'X', 'Y'], 'A')).toBe(1);             // four in turn: A is four back, unread
    expect(varietyFactor(['A', 'A', 'A'], 'A')).toBe(VARIETY_FLOOR);      // spam: 1 − 0.95, floored
    expect(varietyFactor(['B', 'A', 'A'], 'A')).toBe(VARIETY_FLOOR);             // 1 − 0.8 = 0.2, floored
  });

  const free = (n: number, every = 1) => Array.from({ length: n }, (_, i) => step(i * every, { pressFree: true }));

  function play(picks: string[]): { p: DancePerformance; awards: number[]; factors: number[] } {
    const p = new DancePerformance(BPM);
    p.setRoutine(free(picks.length));
    const awards: number[] = [];
    const factors: number[] = [];
    p.start(10);
    let last = 0;
    p.onJudged = () => { awards.push(p.score - last); last = p.score; factors.push(p.lastFree?.factor ?? NaN); };
    picks.forEach((m, i) => { p.update(10 + i); p.hit(10 + i, { key: 'A', move: m }); });
    return { p, awards, factors };
  }

  it('spamming one move decays to the floor; four moves in turn keep full marks', () => {
    const spam = play(['A', 'A', 'A', 'A', 'A', 'A']);
    expect(spam.factors).toEqual([1, 0.5, VARIETY_FLOOR, VARIETY_FLOOR, VARIETY_FLOOR, VARIETY_FLOOR]);
    const turn = play(['A', 'B', 'X', 'Y', 'A', 'B']);
    expect(turn.factors).toEqual([1, 1, 1, 1, 1, 1]);
    expect(turn.p.score).toBeGreaterThan(spam.p.score * 2);                 // 1,905 vs 783 over six slots
    // the award is (points + 5 × combo) × factor, rounded
    expect(spam.awards[1]).toBe(Math.round((300 + 10) * 0.5));
    expect(turn.awards[5]).toBe(300 + 30);
  });

  it('variety scores points only: the judgements, the accuracy and the grade stay pure timing', () => {
    const spam = play(['A', 'A', 'A', 'A']);
    const turn = play(['A', 'B', 'X', 'Y']);
    expect(spam.p.counts).toEqual(turn.p.counts);
    expect(spam.p.result().accuracy).toBe(turn.p.result().accuracy);
    expect(spam.p.result().stars).toBe(turn.p.result().stars);
    expect(spam.p.result().variety).toBeCloseTo((1 + 0.5 + VARIETY_FLOOR + VARIETY_FLOOR) / 4, 12);
    expect(turn.p.result().variety).toBe(1);
  });

  it('a press with no pick dances the slot\'s own clip (and repeats of it decay like any move)', () => {
    const p = new DancePerformance(BPM);
    p.setRoutine(free(2));
    p.start(10);
    p.update(10); p.hit(10);
    expect(p.lastFree).toEqual({ move: 'dance_toprock_basic', factor: 1 });
    p.update(11); p.hit(11);
    expect(p.lastFree).toEqual({ move: 'dance_toprock_basic', factor: 0.5 });
  });

  it('lastFree is null for every judgement but a freestyle hit, and the pick is ignored on a called step', () => {
    const p = new DancePerformance(BPM);
    p.setRoutine([step(0), step(1, { pressFree: true })]);
    p.start(10);
    const seen: (string | null)[] = [];
    p.onJudged = () => { seen.push(p.lastFree?.move ?? null); };
    p.update(10); p.hit(10, { move: 'dance_wave_arm' });   // a called step: the move is not read
    p.update(11); p.hit(11, { move: 'dance_wave_arm' });
    p.update(11.5); p.hit(11.5);                            // wild
    expect(seen).toEqual([null, 'dance_wave_arm', null]);
    expect(p.score).toBe((300 + 5) + (300 + 10) - 20);
  });

  it('a chart without a freestyle slot reports no `variety` key', () => {
    const p = new DancePerformance(BPM);
    p.setRoutine([step(0)]);
    p.start(10); p.update(10); p.hit(10);
    expect('variety' in p.result()).toBe(false);
  });
});

describe('movement play\'s terms: a BODY step judges exactly as before, whatever press fields it carries', () => {
  it('hitBody on a body step with pressHoldBeats / pressFree / pressKind = hitBody on the same step without them', () => {
    const base: DanceStep = { clipId: 'x', beat: 1, holdBeats: 1, mirrored: false, move: 'jump', windowScale: 1.5, lateGraceSec: 0.1 };
    const extra: DanceStep = { ...base, pressHoldBeats: 2, pressFree: true, pressKind: 'accent' };
    const judge = (s: DanceStep) => {
      const p = new DancePerformance(BPM);
      p.setRoutine([s, { ...s, beat: 3 }]);
      p.setBody({ latencySec: 0.1, poseHz: 24 });
      const out: unknown[] = [];
      p.onJudged = (l, pts, combo, _st, d) => out.push([l, pts, combo, d]);
      p.onHoldEnd = () => out.push('hold!');
      p.start(10);
      p.update(10.9);
      out.push(p.hitBody(11.12, { move: 'jump' }));
      out.push(p.hit(11.2, { key: 'A', move: 'dance_wave_arm' }));   // a press never answers a body step
      for (let t = 11; t < 14; t += 0.05) p.update(t);                // the second body step expires
      out.push(p.release(13, 'A'), p.holding, p.result());
      return out;
    };
    expect(judge(extra)).toEqual(judge(base));
    expect(judge(extra)).not.toContain('hold!');
  });

  it('a press MISS (a dropped hold) resets the shared combo exactly as a press MISS always has — never a body step\'s label', () => {
    const p = new DancePerformance(BPM);
    p.setRoutine([step(0, { pressHoldBeats: 1 }), { clipId: 'x', beat: 3, holdBeats: 1, mirrored: false, move: 'jump' }]);
    p.start(10);
    p.update(10); p.hit(10, { key: 'A' });
    p.release(10.2, 'A');                                    // dropped
    p.update(12.9);
    expect(p.hitBody(13, { move: 'jump' })).toBe('PERFECT');
    expect(p.counts).toEqual({ PERFECT: 2, GREAT: 0, GOOD: 0, MISS: 1 });
  });

  // MUSIC-SUITE P9 FIX PASS (2026-09-29): NAMED FOR MOVEMENT PLAY'S SIGN-OFF (their condition (1): hold judging must
  // "never change what a body step scores"). A press hold's TAIL is a judgement on the shared combo, like every press
  // judgement: a kept tail adds one to it, a dropped tail resets it — so a body step that FOLLOWS a press hold in a mixed
  // routine gets a different combo bonus (hitBody awards points + combo × 5) than it would after a plain press. Its LABEL,
  // its windows and whether it is taken do not change (the test above); only the combo it inherits does, exactly as any
  // press hit or press MISS before it has always moved that combo. No shipped routine mixes the two today (the charts are
  // press-only, and DanceMode's judgeBody is still the no-op seam), so this is latent — pinned here so it is deliberate.
  it('NAMED DIFFERENCE: a press hold\'s tail moves the SHARED combo, so a following body step\'s combo bonus moves with it', () => {
    const body: DanceStep = { clipId: 'x', beat: 3, holdBeats: 1, mirrored: false, move: 'jump' };
    const scoreAfter = (release: number | null): { bodyPts: number; label: Judgement; combo: number } => {
      const p = new DancePerformance(BPM);
      p.setRoutine([step(0, { pressHoldBeats: 1 }), body]);
      let bodyCombo = 0;
      p.onJudged = (_l, _pts, combo, st) => { if (st === body) bodyCombo = combo; };
      p.start(10);
      p.update(10); p.hit(10, { key: 'A' });                          // the head: PERFECT, combo 1
      if (release !== null) p.release(release, 'A');                   // dropped (early) — or held through its end
      p.update(12.9);
      const before = p.score;
      const label = p.hitBody(13, { move: 'jump' })!;
      return { bodyPts: p.score - before, label, combo: bodyCombo };
    };
    const kept = scoreAfter(null), dropped = scoreAfter(10.2);
    expect(kept.label).toBe('PERFECT');
    expect(dropped.label).toBe('PERFECT');                            // the body step's judgement never moves
    expect(kept.combo).toBe(3);                                       // head 1, kept tail 2, the body step 3
    expect(dropped.combo).toBe(1);                                    // the dropped tail reset it: the body step starts again
    expect(kept.bodyPts).toBe(300 + 3 * 5);
    expect(dropped.bodyPts).toBe(300 + 1 * 5);
  });

  it('the release allowance: the GOOD window, but never more than a quarter of a short hold', () => {
    expect(HOLD_RELEASE_EARLY_SEC).toBe(MISS_AFTER);
    expect(HOLD_RELEASE_EARLY_SHARE).toBe(0.25);
    expect(holdReleaseEarlySec(3 * 60 / 88)).toBe(MISS_AFTER);                  // a three-beat hold at 88 BPM: 200 ms
    expect(holdReleaseEarlySec(60 / 126)).toBeCloseTo(60 / 126 / 4, 12);         // a one-beat hold at 126 BPM: 119 ms
    expect(holdReleaseEarlySec(-1)).toBe(0);
    // a half-beat hold at 60 BPM (500 ms) keeps only its last 125 ms: a release 150 ms early drops it
    const p = new DancePerformance(BPM);
    p.setRoutine([step(0, { pressHoldBeats: 0.5 })]);
    p.start(10); p.update(10); p.hit(10, { key: 'A' });
    expect(p.release(10.35, 'A')).toBe(false);
    const q = new DancePerformance(BPM);
    q.setRoutine([step(0, { pressHoldBeats: 0.5 })]);
    q.start(10); q.update(10); q.hit(10, { key: 'A' });
    expect(q.release(10.375, 'A')).toBe(true);
  });
});
