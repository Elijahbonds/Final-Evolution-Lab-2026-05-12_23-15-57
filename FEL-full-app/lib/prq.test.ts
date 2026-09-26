// lib/prq.ts computePrqDelta + MODE_ATTRS (MUSIC-SUITE P2, 2026-09-25).
//
// Dance and music trained only 'mental' (no MODE_ATTRS row, app/api/sessions/route.ts:81 fell back) off
// min(score / 10, 10), which saturates at 100 — one clean dance step (300 + combo × 5) or one music hit (100) already
// earned the whole gain, so a D-grade set trained as much as an S. Both now train by accuracy; every other mode is held
// to exactly what it did.
import { describe, expect, it } from 'vitest';
import { ACCURACY_PRQ_MODES, MODE_ATTRS, MODE_WEIGHTS, computePrqDelta } from './prq';

describe('the rooms\' PRQ rows', () => {
  it('the Cypher trains agility + mental, the Academy mental', () => {
    expect(MODE_ATTRS.dance).toEqual(['agility', 'mental']);
    expect(MODE_ATTRS.music).toEqual(['mental']);
    expect([...ACCURACY_PRQ_MODES].sort()).toEqual(['dance', 'music']);
  });

  it('their weight is the unchanged fallback (0.8)', () => {
    expect(MODE_WEIGHTS.dance).toBeUndefined();
    expect(MODE_WEIGHTS.music).toBeUndefined();
  });
});

describe('computePrqDelta for dance and music: scaled by accuracy', () => {
  const full = { won: true, duration: 120 };   // timeFactor 1, the win's 1.2

  it('a flawless set earns what the saturated score used to (10 × 0.1 × 0.8 × 1.2 = 0.96)', () => {
    expect(computePrqDelta({ mode: 'dance', score: 5000, accuracy: 1, ...full })).toBe(0.96);
    expect(computePrqDelta({ mode: 'music', score: 5000, accuracy: 1, ...full })).toBe(0.96);
  });

  it('gain is proportional to accuracy', () => {
    expect(computePrqDelta({ mode: 'dance', score: 5000, accuracy: 0.5, ...full })).toBe(0.48);
    expect(computePrqDelta({ mode: 'music', score: 5000, accuracy: 0.25, ...full })).toBe(0.24);
  });

  it('the score no longer decides it: one clean step at 20 % trains less than a clean short set', () => {
    const bigAndSloppy = computePrqDelta({ mode: 'dance', score: 99_999, accuracy: 0.2, won: false, duration: 120 });
    const smallAndClean = computePrqDelta({ mode: 'dance', score: 300, accuracy: 1, won: false, duration: 120 });
    expect(bigAndSloppy).toBeLessThan(smallAndClean);
    expect(bigAndSloppy).toBe(0.16);
    expect(smallAndClean).toBe(0.8);
  });

  it('no accuracy (the room sent no counts) is no gain — never the saturating score', () => {
    expect(computePrqDelta({ mode: 'dance', score: 5000, ...full })).toBe(0);
    expect(computePrqDelta({ mode: 'music', score: 5000, accuracy: null, ...full })).toBe(0);
    expect(computePrqDelta({ mode: 'music', score: 5000, accuracy: Number.NaN, ...full })).toBe(0);
  });

  it('P2 fix pass: whenNoAccuracy \'score\' (a session from a shell that cannot send counts yet) keeps the old score path', () => {
    // HEAD's gain for a won 2-minute dance: min(4000 / 10, 10) × 0.1 × 0.8 × 1.2 = 0.96 — the review's "~0.96 to 0"
    expect(computePrqDelta({ mode: 'dance', score: 4000, whenNoAccuracy: 'score', ...full })).toBe(0.96);
    expect(computePrqDelta({ mode: 'music', score: 50, accuracy: null, whenNoAccuracy: 'score', ...full })).toBe(0.48);
    expect(computePrqDelta({ mode: 'music', score: 5000, accuracy: 0.25, whenNoAccuracy: 'score', ...full })).toBe(0.24);   // counts win
    expect(computePrqDelta({ mode: 'music', score: 5000, accuracy: Number.NaN, whenNoAccuracy: 'score', ...full })).toBe(0);  // a broken one is not "none"
    expect(computePrqDelta({ mode: 'dance', score: 4000, whenNoAccuracy: 'none', ...full })).toBe(0);
  });

  it('an accuracy outside 0..1 is clamped', () => {
    expect(computePrqDelta({ mode: 'music', score: 1, accuracy: 7, ...full })).toBe(0.96);
    expect(computePrqDelta({ mode: 'music', score: 1, accuracy: -2, ...full })).toBe(0);
  });

  it('the clock still scales it (a 33 s song is a short session)', () => {
    expect(computePrqDelta({ mode: 'dance', score: 1, accuracy: 1, won: false, duration: 30 })).toBe(0.2);   // 30/120 = 0.25
  });
});

describe('every other mode is unchanged', () => {
  it('still reads the saturating score and ignores an accuracy', () => {
    expect(computePrqDelta({ mode: 'dunkContest', score: 240, won: true, duration: 120 })).toBe(1.2);        // 10 × 0.1 × 1.0 × 1.2
    expect(computePrqDelta({ mode: 'dunkContest', score: 240, won: true, duration: 120, accuracy: 0 })).toBe(1.2);
    expect(computePrqDelta({ mode: 'hoops1v1', score: 11, won: true, duration: 60 })).toBe(0.07);           // 1.1 × 0.1 × 1 × 1.2 × 0.5
    expect(computePrqDelta({ mode: 'unknownMode', score: 50, won: false, duration: 10 })).toBe(0.1);       // 5 × 0.1 × 0.8 × 0.25
  });
});
