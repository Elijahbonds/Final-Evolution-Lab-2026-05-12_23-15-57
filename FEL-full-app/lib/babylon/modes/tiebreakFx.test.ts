// Tiebreak's tension and ball trail (vis-party, 2026-10-13).
import { describe, expect, it } from 'vitest';
import { TARGET, TIEBREAK_MAX_PTS, matchCall } from '../core/TiebreakBlitz';
import { TRAIL_LOOK } from '../visual/EffectsKit';
import {
  HEART_BPM, TENSION, heartRate, heartbeat, tensionLevel, tensionPulse, tensionRest, trailFor,
} from './tiebreakFx';

describe('tension: the level follows the scoreboard\'s own call', () => {
  it('zero in the warm-up, whatever the score', () => {
    expect(tensionLevel(6, 6, 2)).toBe(0);
    expect(tensionLevel(0, 0, 1)).toBe(0);
  });
  it('rises through set point, win by two and sudden death, in the order the board names them', () => {
    const early = tensionLevel(1, 0, 0), setPoint = tensionLevel(TARGET - 1, 2, 0), winBy2 = tensionLevel(TARGET - 1, TARGET - 1, 0), sudden = tensionLevel(TIEBREAK_MAX_PTS - 1, TIEBREAK_MAX_PTS - 1, 0);
    expect(early).toBeLessThan(setPoint);
    expect(setPoint).toBeLessThan(winBy2);
    expect(winBy2).toBeLessThan(sudden);
    expect(sudden).toBe(1);
  });
  it('a set point for the AI is as tense as one for you', () => {
    expect(matchCall(2, TARGET - 1)).toBe('SET POINT · AI');
    expect(tensionLevel(2, TARGET - 1, 0)).toBe(tensionLevel(TARGET - 1, 2, 0));
  });
  it('stays in 0..1 across every score the rules can reach', () => {
    for (let a = 0; a <= TIEBREAK_MAX_PTS; a++) for (let b = 0; b <= TIEBREAK_MAX_PTS; b++) {
      const v = tensionLevel(a, b, 0); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('tension: the heartbeat and the grade', () => {
  it('a heart has a lub and a softer dub, and is quiet between', () => {
    expect(heartbeat(0.02)).toBeGreaterThan(0.9);
    expect(heartbeat(0.2)).toBeGreaterThan(0.4);
    expect(heartbeat(0.2)).toBeLessThan(heartbeat(0.02));
    expect(heartbeat(0.6)).toBeLessThan(0.05);
    expect(heartbeat(1.02)).toBeCloseTo(heartbeat(0.02), 9);
  });
  it('the heart speeds up with the tension, within its range', () => {
    expect(heartRate(0)).toBe(HEART_BPM.min);
    expect(heartRate(1)).toBe(HEART_BPM.max);
    expect(heartRate(0.5)).toBeGreaterThan(heartRate(0.2));
    expect(heartRate(9)).toBe(HEART_BPM.max);
  });
  const base = { exposure: 1.1, vignette: 1.0 };
  it('no tension leaves the rig\'s grade exactly as it was', () => {
    expect(tensionRest(base, 0, { exposure: 0, vignette: 0 })).toEqual(base);
  });
  it('full tension dims the frame and tightens the vignette; it never touches the base it was handed', () => {
    const out = { exposure: 0, vignette: 0 };
    tensionRest(base, 1, out);
    expect(out.exposure).toBeCloseTo(1.1 * (1 - TENSION.dim), 9);
    expect(out.vignette).toBeCloseTo(1.0 + TENSION.vignette, 9);
    expect(base).toEqual({ exposure: 1.1, vignette: 1.0 });
  });
  it('the dimming is a few percent: the court stays readable', () => {
    expect(TENSION.dim).toBeLessThan(0.15);
  });
  it('the heartbeat comes and goes through a beat, between 0 and 1', () => {
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < 4; t += 0.01) { const p = tensionPulse(1, t, true); min = Math.min(min, p); max = Math.max(max, p); }
    expect(min).toBeGreaterThanOrEqual(0); expect(min).toBeLessThan(0.05);
    expect(max).toBeGreaterThan(0.9); expect(max).toBeLessThanOrEqual(1);
  });
  it('reduced flashing: no pulse at all, at any tension and time', () => {
    for (let t = 0; t < 4; t += 0.05) for (const k of [0.6, 0.75, 1]) expect(tensionPulse(k, t, false)).toBe(0);
  });
  it('no pulse below "set point" even with flashes allowed (a faint lean-in, not a heartbeat)', () => {
    for (let t = 0; t < 4; t += 0.05) expect(tensionPulse(0.12, t, true)).toBe(0);
  });
  it('the pulse is on the vignette and small: the vignette\'s swing is a fraction of its resting weight', () => {
    expect(TENSION.pulse).toBeLessThan(0.5);
  });
});

describe('the ball\'s trail', () => {
  it('nothing out of play (a trail at a resting ball would be a blob), soft in, brighter out', () => {
    expect(trailFor(false, false)).toBe('off');
    expect(trailFor(false, true)).toBe('off');
    expect(trailFor(true, false)).toBe('soft');
    expect(trailFor(true, true)).toBe('hang');
    expect(TRAIL_LOOK[trailFor(true, true)].rate).toBeGreaterThan(TRAIL_LOOK[trailFor(true, false)].rate);
    expect(TRAIL_LOOK[trailFor(false, false)].rate).toBe(0);
  });
});
