import { describe, expect, it } from 'vitest';
import { DEAD_HEAT_S, PACER_FINISH_S, PHOTO_HOLD_MS, RULER, finishMargin, lineRow01, printTime, ruler, tickStep } from './photoFinish';

describe('the photo finish margin', () => {
  it('the pacer\'s time is the signed-off 13.4 s (SprintMode.RIVAL_TIME_S)', () => {
    expect(PACER_FINISH_S).toBe(13.4);
  });
  it('the player first: YOU BY the gap to the hundredth; the pacer first: PACER BY', () => {
    expect(finishMargin(12.84)).toEqual({ winner: 'you', marginS: 0.56, call: 'YOU BY 0.56 s' });
    expect(finishMargin(13.71)).toEqual({ winner: 'pacer', marginS: 0.31, call: 'PACER BY 0.31 s' });
  });
  it('a dead heat inside half a hundredth', () => {
    expect(finishMargin(13.4).winner).toBe('tie');
    expect(finishMargin(13.4 - DEAD_HEAT_S / 2).call).toBe('DEAD HEAT');
    expect(finishMargin(13.4 - 0.01).winner).toBe('you');
  });
  it('junk is a dead heat, not a crash', () => {
    expect(finishMargin(NaN).winner).toBe('tie');
    expect(finishMargin(Infinity).winner).toBe('tie');
  });
});

describe('the ruler', () => {
  it('the winner sits on the line, the loser to its right by the margin; the player\'s marker is the loser\'s when the pacer won', () => {
    const you = ruler(finishMargin(12.84));
    expect(you.youX).toBe(RULER.lineX); expect(you.pacerX).toBeGreaterThan(you.youX);
    const pace = ruler(finishMargin(13.71));
    expect(pace.pacerX).toBe(RULER.lineX); expect(pace.youX).toBeGreaterThan(pace.pacerX);
  });
  it('the scale opens to fit: the margin takes about 55 % of the ruler, a close finish and a wide one both read', () => {
    for (const you of [13.39, 13.2, 12.9, 12.0, 10.5]) {
      const r = ruler(finishMargin(you));
      const m = finishMargin(you);
      expect((r.pacerX - r.youX) / (RULER.endX - RULER.lineX)).toBeLessThanOrEqual(0.9);
      expect(m.marginS).toBeGreaterThan(0);
      expect(r.clipped).toBe(false);
    }
    const near = ruler(finishMargin(13.39)), far = ruler(finishMargin(10.5));
    expect(far.spanS).toBeGreaterThan(near.spanS);
  });
  it('a dead heat: both on the line, a minimal ruler', () => {
    const r = ruler(finishMargin(13.4));
    expect(r.youX).toBe(r.pacerX); expect(r.spanS).toBe(RULER.minSpanS);
  });
  it('ticks: about ten across, in steps a person can read (0.01 ... 5 s)', () => {
    expect(tickStep(0.2)).toBe(0.02);
    expect(tickStep(1)).toBe(0.1);
    expect(tickStep(4.5)).toBe(0.5);
    expect(tickStep(100)).toBe(5);
    for (const span of [0.2, 0.5, 1.2, 3, 7]) { const n = span / tickStep(span); expect(n).toBeLessThanOrEqual(10.01); expect(n).toBeGreaterThan(1.9); }
  });
  it('the loser is never drawn past the ruler\'s end', () => {
    for (const you of [13.4, 13.3, 12, 8]) { const r = ruler(finishMargin(you)); expect(Math.max(r.youX, r.pacerX)).toBeLessThanOrEqual(RULER.endX + 1e-9); }
  });
});

describe('the print', () => {
  it('times to two places', () => { expect(printTime(12.8449)).toBe('12.84 s'); expect(printTime(NaN)).toBe('—'); });
  it('the finish line\'s row in the photo: a fraction down the frame, none when it is off the frame or behind the lens', () => {
    expect(lineRow01(540, 1080, 0.5)).toBe(0.5);
    expect(lineRow01(-30, 1080, 0.5)).toBeNull();
    expect(lineRow01(1200, 1080, 0.5)).toBeNull();
    expect(lineRow01(540, 1080, 1.2)).toBeNull();      // behind the lens (Babylon wraps those to z > 1)
    expect(lineRow01(540, 0, 0.5)).toBeNull();
    expect(lineRow01(NaN, 1080, 0.5)).toBeNull();
  });
  it('the host holds the result a couple of seconds for it, never a long wait', () => { expect(PHOTO_HOLD_MS).toBeGreaterThanOrEqual(1500); expect(PHOTO_HOLD_MS).toBeLessThanOrEqual(3500); });
});
