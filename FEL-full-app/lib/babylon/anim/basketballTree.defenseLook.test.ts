import { describe, expect, it } from 'vitest';
import { retreatFor, closeoutFor } from './basketballTree';

// HOOPS-10PHASE-2 phase 7: DEFENSE-LOOK's two defender-stance reads (retreatFor / closeoutFor) drive which
// animation a defender plays in BOTH 1v1 and 3v3 — but neither had a single direct test anywhere before this
// phase (confirmed by grep: no *.test.ts referenced either name, and no ci-suite script exercised them directly;
// only a prose comment near their call sites). They are pure and cheap to test, so this closes that gap rather
// than leaving the only proof of correctness buried in mode-file wiring.

describe('retreatFor — is this body backpedaling away from the man it faces?', () => {
  it('is false with no man to guard', () => {
    expect(retreatFor({ x: 0, z: 0 }, { x: -1, z: 0 }, null)).toBe(false);
  });
  it('is false standing still, even facing straight away from the man', () => {
    expect(retreatFor({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 3 })).toBe(false);
  });
  it('is true moving directly away from the man (backpedal)', () => {
    // man is at +z; moving toward -z is moving away from him
    expect(retreatFor({ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 0, z: 3 })).toBe(true);
  });
  it('is false moving directly TOWARD the man (that is a closeout/press, not a retreat)', () => {
    expect(retreatFor({ x: 0, z: 0 }, { x: 0, z: 2 }, { x: 0, z: 3 })).toBe(false);
  });
  it('is false sliding sideways across the man, not away from him', () => {
    expect(retreatFor({ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 3 })).toBe(false);
  });
  it('is false on a body standing right on top of its man (degenerate zero-distance case)', () => {
    expect(retreatFor({ x: 1, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 1 })).toBe(false);
  });
});

describe('closeoutFor — is this body closing the last stretch fast and ON the man?', () => {
  const man = { x: 0, z: 3 };
  it('is false with no man to close out on', () => {
    expect(closeoutFor({ x: 0, z: 0 }, { x: 0, z: 3 }, null, 1)).toBe(false);
  });
  it('is false below the speed01 floor (a slow shuffle is not a closeout sprint)', () => {
    expect(closeoutFor({ x: 0, z: 0 }, { x: 0, z: 3 }, man, 0.2)).toBe(false);
  });
  it('is true moving fast, straight at the man, inside the 0.9-2.6m closing band', () => {
    expect(closeoutFor({ x: 0, z: 1 }, { x: 0, z: 2 }, man, 1)).toBe(true);
  });
  it('is false too close (already on him, inside 0.9m) — that is on-ball D, not a closeout', () => {
    expect(closeoutFor({ x: 0, z: 2.5 }, { x: 0, z: 2 }, man, 1)).toBe(false);
  });
  it('is false too far (outside 2.6m) — that is a recover sprint, not the last-stretch close', () => {
    expect(closeoutFor({ x: 0, z: -3 }, { x: 0, z: 2 }, man, 1)).toBe(false);
  });
  it('is false moving fast but AWAY from the man, even inside the band (a retreat is not a closeout)', () => {
    expect(closeoutFor({ x: 0, z: 1 }, { x: 0, z: -2 }, man, 1)).toBe(false);
  });
  it('is false standing still inside the band (no velocity = no closeout, however close)', () => {
    expect(closeoutFor({ x: 0, z: 1 }, { x: 0, z: 0 }, man, 1)).toBe(false);
  });
});
