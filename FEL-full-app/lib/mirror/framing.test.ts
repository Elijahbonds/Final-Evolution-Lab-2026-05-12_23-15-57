import { describe, expect, it } from 'vitest';
import { FramingGate, SIDE_TURNED, SIDE_WIDTH_MAX, checkFraming, sideWidth, type FramingFrame, type FramingPoint } from './framing';

/** A body standing in a good shot; each option nudges one thing out of place. */
function shot(o: { headY?: number; ankleY?: number; centre?: number; shoulderSpan?: number; hipSpan?: number; vis?: number } = {}): FramingFrame {
  const headY = o.headY ?? 0.10, ankleY = o.ankleY ?? 0.90, cx = o.centre ?? 0.5;
  const ss = o.shoulderSpan ?? 0.16, hs = o.hipSpan ?? 0.12, v = o.vis ?? 0.95;
  const L: FramingPoint[] = [];
  const put = (i: number, x: number, y: number) => { L[i] = { x, y, visibility: v }; };
  put(0, cx, headY);                                    // nose
  put(11, cx - ss / 2, headY + 0.10); put(12, cx + ss / 2, headY + 0.10);   // shoulders
  put(23, cx - hs / 2, 0.52); put(24, cx + hs / 2, 0.52);                   // hips
  put(25, cx - hs / 2, 0.70); put(26, cx + hs / 2, 0.70);                   // knees
  put(27, cx - hs / 2, ankleY); put(28, cx + hs / 2, ankleY);               // ankles
  return { landmarks: L, present: true };
}

describe('the shot before the rep', () => {
  it('passes a good shot and says so', () => {
    const c = checkFraming(shot());
    expect(c.ok).toBe(true);
    expect(c.worst).toBeNull();
    expect(c.instruction).toMatch(/good shot/i);
  });

  it('catches feet out of frame FIRST — the one that silently ruins a squat', () => {
    const c = checkFraming(shot({ ankleY: 0.99 }));
    expect(c.issues).toContain('cutOffBottom');
    expect(c.worst).toBe('cutOffBottom');
    expect(c.instruction).toMatch(/feet/i);
  });

  it('knows too close from too far, and gives the matching instruction', () => {
    const close = checkFraming(shot({ headY: 0.01, ankleY: 0.96 }));
    expect(close.issues).toContain('tooClose');
    expect(checkFraming(shot({ headY: 0.35, ankleY: 0.70 })).worst).toBe('tooFar');
    expect(checkFraming(shot({ headY: 0.35, ankleY: 0.70 })).instruction).toMatch(/come forward/i);
  });

  it('spots a body turned side-on, because knee tracking cannot be read from the side', () => {
    const c = checkFraming(shot({ shoulderSpan: 0.06 }));
    expect(c.issues).toContain('turned');
    expect(c.instruction).toMatch(/square/i);
  });

  it('spots drift out of the middle, and poor visibility', () => {
    expect(checkFraming(shot({ centre: 0.78 })).issues).toContain('offCentre');
    expect(checkFraming(shot({ vis: 0.3 })).issues).toContain('dim');
  });

  it('says ONE thing at a time even when several are wrong', () => {
    const c = checkFraming(shot({ ankleY: 0.995, centre: 0.8, vis: 0.4 }));
    expect(c.issues.length).toBeGreaterThan(1);
    expect(c.instruction).toBe('Your feet are out of shot. Tilt the phone down or step back.');
  });

  it('an empty frame asks you to step in rather than reporting six faults', () => {
    const c = checkFraming({ landmarks: [], present: false });
    expect(c.worst).toBe('noBody');
    expect(c.issues).toEqual(['noBody']);
  });

  it('the gate wants the shot held, not one lucky frame', () => {
    const gate = new FramingGate(700);
    const good = checkFraming(shot());
    expect(gate.ready(good, 1000)).toBe(false);     // good, but only just
    expect(gate.ready(good, 1500)).toBe(false);     // still inside the hold
    expect(gate.ready(good, 1800)).toBe(true);      // held long enough
    gate.ready(checkFraming(shot({ ankleY: 0.99 })), 1900);   // a bad frame resets it
    expect(gate.ready(good, 2000)).toBe(false);
  });

  it('a SIDE-on movement wants you side-on, and says so in its own words', () => {
    const squareOn = shot();                                   // shoulders wider than hips
    const sideOn = shot({ shoulderSpan: 0.05 });               // shoulders stacked
    // a hinge filmed from the front is the fault now, not the other way round
    expect(checkFraming(squareOn, 'side').issues).toContain('turned');
    expect(checkFraming(squareOn, 'side').instruction).toMatch(/side-on/i);
    expect(checkFraming(sideOn, 'side').ok).toBe(true);
    // and the squat is unchanged: square-on passes, side-on is the fault
    expect(checkFraming(squareOn, 'front').ok).toBe(true);
    expect(checkFraming(sideOn, 'front').issues).toContain('turned');
    expect(checkFraming(sideOn, 'front').instruction).toMatch(/square-on/i);
  });
});

// MIRROR-COACH P1 review (2026-09-25): a body EXACTLY side-on has its hips stacked as well as its shoulders. The old side
// test (shoulderSpan / hipSpan > 0.6, falling back to 1 when the hips collapsed) read that body as "turned" — so both
// screens stalled at the head-float station telling an athlete who was already side-on to turn side-on — and let the
// same body pass the FRONT check. The shot above only ever narrowed the shoulders, so it never saw it.
describe('side-on, read from the width against the torso', () => {
  /** Shoulders AND hips stacked (a real side-on body), the far side a hair off by perspective. */
  function sideOn(): FramingFrame {
    const L: FramingPoint[] = [];
    const put = (i: number, x: number, y: number, v = 0.95) => { L[i] = { x, y, visibility: v }; };
    put(0, 0.47, 0.10); put(2, 0.472, 0.09); put(5, 0.473, 0.092);
    put(11, 0.5, 0.20); put(12, 0.5, 0.21);                  // shoulders, one behind the other
    put(23, 0.5, 0.52); put(24, 0.5, 0.519);                 // hips, likewise: hipSpan 0
    put(25, 0.51, 0.70); put(26, 0.51, 0.70); put(27, 0.5, 0.90); put(28, 0.5, 0.90);
    return { landmarks: L, present: true };
  }

  it('a body with its hips stacked too passes the side check, and fails the front and back checks', () => {
    expect(checkFraming(sideOn(), 'side').ok).toBe(true);
    expect(checkFraming(sideOn(), 'front').issues).toContain('turned');
    expect(checkFraming(sideOn(), 'back').issues).toContain('turned');
  });

  it('the side line names no movement the station does not read (it said "I read a hinge from the side")', () => {
    const c = checkFraming(shot(), 'side');
    expect(c.instruction).toBe(SIDE_TURNED);
    expect(c.instruction).not.toMatch(/hinge/i);
  });

  it('sideWidth: ~0 side-on, wide square-on, null with no torso to divide by', () => {
    expect(sideWidth(sideOn())!).toBeLessThan(SIDE_WIDTH_MAX);
    expect(sideWidth(shot())!).toBeGreaterThan(SIDE_WIDTH_MAX);
    expect(sideWidth({ landmarks: [] })).toBeNull();
  });
});
