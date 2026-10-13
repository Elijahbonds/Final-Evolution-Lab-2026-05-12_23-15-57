// vis-board (wave 2) — which board moments earn a replay, and what a landing or a carve leaves on the floor.
import { describe, expect, it } from 'vitest';
import { MAX_PER_RUN, MIN_GAP_SEC, ReplayGate, TAIL_GUARD_SEC, WINDOW_MAX_SEC, WINDOW_MIN_SEC, playbackSec, replayWindow, type BoardMoment } from './boardMoments';
import { CarveMarker, landingMarks } from './boardMarks';

const big = (weight: number, over: Partial<BoardMoment> = {}): BoardMoment => ({ kind: 'chain', weight, floor: 300, sec: 1.4, ...over });

describe('the replay window', () => {
  it('a beat of lead-in over the action, held inside the recorder range', () => {
    expect(replayWindow(2.5)).toBeCloseTo(3.3, 6);
    expect(replayWindow(1.4)).toBe(WINDOW_MIN_SEC);
    expect(replayWindow(0)).toBe(WINDOW_MIN_SEC);
    expect(replayWindow(30)).toBe(WINDOW_MAX_SEC);
    expect(replayWindow(Number.NaN)).toBe(WINDOW_MIN_SEC);
    expect(playbackSec(3)).toBe(6);
  });
});

describe('ReplayGate', () => {
  it('a plain moment (under the floor) is never a highlight', () => {
    const g = new ReplayGate();
    expect(g.consider(10, big(120))).toBeNull();
    expect(g.count).toBe(0);
  });
  it('shows a big moment once, and only a bigger one after the gap', () => {
    const g = new ReplayGate();
    expect(g.consider(10, big(500))).not.toBeNull();
    expect(g.consider(12, big(900))).toBeNull();                         // inside the gap
    expect(g.consider(10 + MIN_GAP_SEC + 1, big(450))).toBeNull();        // not the best
    expect(g.consider(10 + MIN_GAP_SEC + 1, big(900))).not.toBeNull();    // a new best
    expect(g.count).toBe(2);
  });
  it('at most MAX_PER_RUN a run; reset starts again', () => {
    const g = new ReplayGate();
    let t = 0, w = 400, shown = 0;
    for (let i = 0; i < 8; i++) { t += MIN_GAP_SEC + 1; w += 100; if (g.consider(t, big(w))) shown++; }
    expect(shown).toBe(MAX_PER_RUN);
    g.reset();
    expect(g.consider(1, big(310))).not.toBeNull();
  });
  it('never in the last stretch of a timed run: that belongs to the end card', () => {
    const g = new ReplayGate();
    const need = playbackSec(replayWindow(1.4)) + TAIL_GUARD_SEC;
    expect(g.consider(60, big(900), need - 0.1)).toBeNull();
    expect(g.count).toBe(0);                                              // a refusal leaves the bar where it was
    expect(g.consider(60, big(900), need + 0.1)).not.toBeNull();
  });
  it('a run with no clock (it ends on an event) is only gated by the event, not the tail', () => {
    expect(new ReplayGate().consider(5, big(900))).not.toBeNull();
  });
});

describe('landing marks', () => {
  it('a clean land rolls out, a sketchy one drags, a bail slides and leaves footprints either side', () => {
    expect(landingMarks({ x: 1, z: 2 }, 0.3, 'clean', 0.5, 0.2).map((m) => m.kind)).toEqual(['carve']);
    expect(landingMarks({ x: 1, z: 2 }, 0.3, 'sketchy', 0.5, 0.2).map((m) => m.kind)).toEqual(['scuff']);
    const bail = landingMarks({ x: 1, z: 2 }, 0, 'bail', 1, 1);
    expect(bail.map((m) => m.kind)).toEqual(['scuff', 'foot', 'foot']);
    expect(bail[1].x).toBeGreaterThan(bail[0].x); expect(bail[2].x).toBeLessThan(bail[0].x);
  });
  it('a bigger drop at more speed leaves a bigger mark; out-of-range inputs are held', () => {
    const small = landingMarks({ x: 0, z: 0 }, 0, 'clean', 0.2, 0.1)[0].scale;
    const large = landingMarks({ x: 0, z: 0 }, 0, 'clean', 1, 1)[0].scale;
    expect(large).toBeGreaterThan(small);
    expect(landingMarks({ x: 0, z: 0 }, 0, 'clean', 9, 9)[0].scale).toBe(large);
  });
});

describe('CarveMarker', () => {
  it('lays a mark every step of a hard carve on the ground, none in the air or when easy', () => {
    const c = new CarveMarker(1, 4, 0.35);
    expect(c.step(0, 0, 0, 8, 0.8, true)).toBeNull();                      // the line starts here
    expect(c.step(0, 0.5, 0, 8, 0.8, true)).toBeNull();                    // not a step yet
    expect(c.step(0, 1.1, 0, 8, 0.8, true)?.kind).toBe('carve');
    expect(c.step(0, 2.3, 0, 8, 0.2, true)).toBeNull();                    // the edge let go: the line ends
    expect(c.step(0, 3.5, 0, 8, 0.8, true)).toBeNull();                    // a new line starts clean
    expect(c.step(0, 5, 0, 8, 0.8, false)).toBeNull();                     // airborne
    expect(c.step(0, 6, 0, 2, 0.8, true)).toBeNull();                      // too slow to bite
  });
});
