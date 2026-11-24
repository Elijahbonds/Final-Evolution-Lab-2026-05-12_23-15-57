// hoops-gap: the pick-and-roll coverage reads (hoops/pnrCoverage) — pure geometry, no rolls.
import { afterEach, describe, expect, it } from 'vitest';
import { PNR_COVERAGE_ON, PNR_OVER_MAX_M, PNR_SCREEN_M, PNR_SHOW_M, coverageFor, onBallScreener, markIsScreening, showSpot, rollerToTag, beatenOnScreen, pnrCoverageOn } from './pnrCoverage';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const RIM = { x: 0, z: -0.6 };

describe('hoops/pnrCoverage', () => {
  it('ships off, and the knob turns it on', () => {
    expect(PNR_COVERAGE_ON).toBe(0);
    expect(pnrCoverageOn()).toBe(false);
    setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.pnrCoverageOn', 1);
    expect(pnrCoverageOn()).toBe(true);
  });
  it('the read: over a shooter in range, under one far out', () => {
    expect(coverageFor(6.0)).toBe('over');
    expect(coverageFor(PNR_OVER_MAX_M)).toBe('over');
    expect(coverageFor(PNR_OVER_MAX_M + 0.01)).toBe('under');
    expect(coverageFor(9)).toBe('under');
  });
  it('a planted attacker on the on-ball man, near the ball, is his screener; a moving one, the handler, or one far from the ball is not', () => {
    const self = { x: 0, z: 5 }, ball = { x: 0, z: 6.2 };
    const foes = [ball, { x: 0.9, z: 5.3 }, { x: -5, z: 3 }];
    expect(onBallScreener(self, ball, 0, foes, [0, 0.2, 0])).toBe(1);
    expect(onBallScreener(self, ball, 0, foes, [0, 2.0, 0])).toBe(-1);   // moving: a cutter, not a screen
    expect(onBallScreener(self, { x: 0, z: 9.5 }, 0, foes, [0, 0.2, 0])).toBe(-1);   // the ball is far from him
    expect(onBallScreener(self, ball, 0, [ball, { x: PNR_SCREEN_M + 0.2, z: 5 }, foes[2]], [0, 0, 0])).toBe(-1);
  });
  it('my man is screening when he is planted on the ally nearest the ball', () => {
    const me = { x: 1.6, z: 3.8 }, mark = { x: 0.9, z: 5.3 }, ball = { x: 0, z: 6.2 };
    const allies = [{ x: 0, z: 5 }, me, { x: -4, z: 2 }];
    expect(markIsScreening(me, mark, 0.1, ball, allies)).toBe(true);
    expect(markIsScreening(me, mark, 1.5, ball, allies)).toBe(false);
    expect(markIsScreening(me, { x: 4, z: 4 }, 0.1, ball, allies)).toBe(false);
  });
  it('the show spot is PNR_SHOW_M off the handler, on the screener\'s side and toward the rim', () => {
    const h = { x: 0, z: 7 }, s = { x: 1.2, z: 6.4 };
    const p = showSpot(h, s, RIM);
    expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeCloseTo(PNR_SHOW_M, 5);
    expect(p.x).toBeGreaterThan(0);   // the screener's side
    expect(p.z).toBeLessThan(h.z);    // toward the rim
  });
  it('the tag: the low man (the off-ball defender nearest the rim) picks up a free roll man diving at the rim — not the man on the ball, not his own man', () => {
    const ball = { x: 0, z: 7 };
    const allies = [{ x: 0.3, z: 6 }, { x: 1.2, z: 5.5 }, { x: -2.5, z: 1.5 }];   // on the ball, the screener's man (beaten up top), the weak side
    const foes = [ball, { x: 0.6, z: 3.0 }, { x: -6, z: 3 }];
    const vel = [{ x: 0, z: 0 }, { x: -0.3, z: -3.5 }, { x: 0, z: 0 }];
    expect(rollerToTag(allies[2], 2, ball, RIM, allies, foes, vel)).toBe(1);
    expect(rollerToTag(allies[0], 0, ball, RIM, allies, foes, vel)).toBe(-1);   // on the ball
    expect(rollerToTag(allies[2], 1, ball, RIM, allies, foes, vel)).toBe(-1);   // he is my own man: no tag, I guard him
    // not diving (standing at the dotted line), or someone already on him: no tag
    expect(rollerToTag(allies[2], 2, ball, RIM, allies, foes, [vel[0], { x: 0, z: 0 }, vel[2]])).toBe(-1);
    expect(rollerToTag(allies[2], 2, ball, RIM, [allies[0], { x: 0.8, z: 2.6 }, allies[2]], foes, vel)).toBe(-1);
  });
  it('beaten on the screen: the handler nearer the rim than his man, or his man too far off', () => {
    expect(beatenOnScreen({ x: 0, z: 5 }, { x: 0.5, z: 6.2 }, RIM)).toBe(false);
    expect(beatenOnScreen({ x: 0, z: 6.5 }, { x: 0.5, z: 5.0 }, RIM)).toBe(true);
    expect(beatenOnScreen({ x: -2.5, z: 5.5 }, { x: 0.5, z: 5.8 }, RIM)).toBe(true);
  });
});
