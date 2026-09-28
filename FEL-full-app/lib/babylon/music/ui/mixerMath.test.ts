// MUSIC-SUITE P4 (2026-09-25): the mixer's readouts (ui/mixerMath.ts) — meter fill, the clip lights and their hold, and
// the words on a strip.
import { describe, expect, it } from 'vitest';
import {
  CLIP_HOLD_MS, LIMIT_CLIP_DB, MASTER_CLIP_DB, METER_FLOOR_DB, STRIP_CLIP_DB, clipLit, clipUntil, dbLabel, faderLabel, limiterLabel, masterOver,
  meterFill, overUntil, panLabel, sendLabel,
} from './mixerMath';
import { CEILING, CEILING_DBFS, LIMITER } from '../mixGraph';
import { DRAG_DECIDE_PX, dragIntent, faderValueAt } from './mixerMath';

const lin = (db: number): number => Math.pow(10, db / 20);

describe('meters', () => {
  it('fill from −60 dBFS (empty) to 0 dBFS (full), linear in dB', () => {
    expect(meterFill(0)).toBe(0);
    expect(meterFill(lin(METER_FLOOR_DB - 5))).toBe(0);
    expect(meterFill(1)).toBeCloseTo(1, 9);
    expect(meterFill(lin(-30))).toBeCloseTo(0.5, 6);
    expect(meterFill(lin(-6))).toBeCloseTo(0.9, 6);
    expect(meterFill(2)).toBe(1);
    expect(meterFill(-0.5)).toBeCloseTo(meterFill(0.5), 9);   // a negative sample is a level too
  });
  it('labels', () => {
    expect(dbLabel(0)).toBe('−∞');
    expect(dbLabel(lin(-12.34))).toBe('−12.3 dB');
    expect(dbLabel(1)).toBe('0.0 dB');
    expect(limiterLabel(0)).toBe('');
    expect(limiterLabel(-0.05)).toBe('');
    expect(limiterLabel(-3.14)).toBe('LIMIT −3.1 dB');
    expect(limiterLabel(Number.NaN)).toBe('');
  });
});

describe('clip lights', () => {
  it('the master’s lights when the ceiling is working (within 0.1 dB of −0.3 dBFS), not below it', () => {
    expect(MASTER_CLIP_DB).toBeCloseTo(CEILING_DBFS - 0.1, 9);
    expect(clipUntil(0, CEILING, 1000, MASTER_CLIP_DB)).toBe(1000 + CLIP_HOLD_MS);
    expect(clipUntil(0, lin(-0.35), 1000, MASTER_CLIP_DB)).toBe(1000 + CLIP_HOLD_MS);
    expect(clipUntil(0, lin(-1), 1000, MASTER_CLIP_DB)).toBe(0);
  });
  it('the master’s also lights while the limiter pulls ≥ 1.5 dB (the bus reached full scale) — its meter alone sits near −2 dBFS', () => {
    expect(LIMIT_CLIP_DB).toBe(-1.5);
    expect(LIMITER.threshold).toBe(-1.5);                     // 1.5 dB of pull over a −1.5 dBFS threshold ≈ a full-scale bus
    expect(masterOver(lin(-2), -1.6)).toBe(true);
    expect(masterOver(lin(-2), -1.4)).toBe(false);
    expect(masterOver(lin(-0.3), 0)).toBe(true);              // the ceiling acting
    expect(masterOver(lin(-2), Number.NaN)).toBe(false);      // a browser that does not report the pull
    expect(overUntil(0, true, 10)).toBe(10 + CLIP_HOLD_MS);
    expect(overUntil(7, false, 10)).toBe(7);
  });
  it('a strip’s lights on a true over (0 dBFS at its pre-bus tap)', () => {
    expect(STRIP_CLIP_DB).toBe(0);
    expect(clipUntil(0, 1.2, 50, STRIP_CLIP_DB)).toBe(50 + CLIP_HOLD_MS);
    expect(clipUntil(0, 0.99, 50, STRIP_CLIP_DB)).toBe(0);
  });
  it('holds CLIP_HOLD_MS after the LAST over, so one hit is seen', () => {
    let until = clipUntil(0, 1.1, 1000, STRIP_CLIP_DB);
    expect(clipLit(until, 1000)).toBe(true);
    until = clipUntil(until, 0.2, 1500, STRIP_CLIP_DB);      // quiet frames keep the time
    expect(clipLit(until, 1500 + CLIP_HOLD_MS - 600)).toBe(true);
    expect(clipLit(until, 1000 + CLIP_HOLD_MS)).toBe(false);
    until = clipUntil(until, 1.3, 2000, STRIP_CLIP_DB);      // a new over re-arms it
    expect(clipLit(until, 2000 + CLIP_HOLD_MS - 1)).toBe(true);
  });
});

describe('strip words', () => {
  it('pan, fader, send', () => {
    expect(panLabel(0)).toBe('C');
    expect(panLabel(-0.3)).toBe('L 30');
    expect(panLabel(1)).toBe('R 100');
    expect(panLabel(4)).toBe('R 100');
    expect(faderLabel(1)).toBe('0.0 dB');
    expect(faderLabel(0.5)).toBe('−6.0 dB');
    expect(faderLabel(1.5)).toBe('+3.5 dB');
    expect(faderLabel(0)).toBe('−∞');
    expect(sendLabel(0.25)).toBe('25 %');
    expect(sendLabel(2)).toBe('100 %');
  });
});

// MUSIC-SUITE P4 FIX PASS (2026-09-25): a phone fader moves only from a sideways drag.

describe('P4 FIX PASS: the phone fader', () => {
  it('reads a touch: sideways = a fader drag, up / down = the page\'s scroll, a small wobble = not yet', () => {
    expect(dragIntent(0, 0)).toBe('wait');
    expect(dragIntent(3, -4)).toBe('wait');
    expect(dragIntent(DRAG_DECIDE_PX, 0)).toBe('fader');
    expect(dragIntent(-20, 6)).toBe('fader');
    expect(dragIntent(4, -30)).toBe('scroll');                           // the review's 200 px scroll, at its first 30 px
    expect(dragIntent(12, 12)).toBe('scroll');                           // diagonal: the page keeps it
    expect(dragIntent(NaN, 0)).toBe('wait');
  });
  it('the value under the finger: clamped to the track, on the step', () => {
    const t = { left: 100, width: 300 };
    expect(faderValueAt(100, t, 0, 1.5, 0.01)).toBe(0);
    expect(faderValueAt(250, t, 0, 1.5, 0.01)).toBe(0.75);
    expect(faderValueAt(999, t, 0, 1.5, 0.01)).toBe(1.5);
    expect(faderValueAt(0, t, -1, 1, 0.01)).toBe(-1);
    expect(faderValueAt(175, t, -1, 1, 0.01)).toBe(-0.5);
    expect(faderValueAt(160, { left: 100, width: 0 }, 0, 1, 0.01)).toBe(1);   // a track with no width: no NaN
  });
});
