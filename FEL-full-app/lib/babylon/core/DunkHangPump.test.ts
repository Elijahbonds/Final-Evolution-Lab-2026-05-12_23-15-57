import { describe, it, expect } from 'vitest';
import {
  gradePump, pumpOpen, pumpMsAt, pumpEndsAt, pumpRefusalLine, PUMP_BEAT_T, PUMP_REACH_SEC, PUMP_SLOW, PUMP_MS, PUMP_MIN_MS, PUMP_CLEAR_SEC,
  PUMP_STYLE_CLEAN, PUMP_STYLE_LOOSE, PUMP_EXTRA_MS, type PumpRefusal,
} from './DunkHangPump';
import { BEAT_TOL_SEC } from './DunkBeats';
import { CUE_BEAT_T } from './DunkSystem';
import { arcTopT, slamBufferSec, ARC_TOP_FRAC } from './DunkLegs';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { dunkCard } from './DunkCard';
import { GUEST_SLAM_FACTORS } from './DunkAssist';
import { FACTOR_MIN, FACTOR_MAX } from '../../controller-link/tvMode';

// The mode's own sums (DunkMode: SLAM_APEX_T, SLAM_BUFFER_SEC, qteWindowSec 0.28, the update's window and read) — pinned there by the
// wiring scan, so this file and the mode cannot drift apart.
const SLAM_APEX_T = arcTopT(EASTBAY_TIMING.extend, ARC_TOP_FRAC);
const SLAM_BUFFER_SEC = 0.22, QTE_WINDOW_SEC = 0.28;
const windowOf = (tv: number, guest: number, taps: number, trickScale: number): number => QTE_WINDOW_SEC * tv * guest * (1 - taps * 0.25) * trickScale;
const readOf = (w: number): { openAt: number; readAt: number } => {
  const openAt = EASTBAY_TIMING.extend - w / 2;
  return { openAt, readAt: openAt - slamBufferSec(openAt, SLAM_APEX_T, SLAM_BUFFER_SEC) };
};
const SHIPPED = readOf(windowOf(1, 1, 0, 1));

describe('the hang pump — when it is a pump', () => {
  it('is timed to the bar\'s HANG beat, with a reach either side', () => {
    expect(PUMP_BEAT_T).toBe(CUE_BEAT_T.hang);
    expect(pumpOpen(PUMP_BEAT_T)).toBe(true);
    expect(pumpOpen(PUMP_BEAT_T - PUMP_REACH_SEC)).toBe(true);
    expect(pumpOpen(PUMP_BEAT_T + PUMP_REACH_SEC)).toBe(true);
    expect(pumpOpen(PUMP_BEAT_T - PUMP_REACH_SEC - 0.01)).toBe(false);
    expect(pumpOpen(PUMP_BEAT_T + PUMP_REACH_SEC + 0.01)).toBe(false);
    expect(pumpOpen(NaN)).toBe(false);
    // the reach stays between the rise and the pre-slam beats: it is the HANG's
    expect(PUMP_BEAT_T - PUMP_REACH_SEC).toBeGreaterThan(CUE_BEAT_T.rise);
    expect(PUMP_BEAT_T + PUMP_REACH_SEC).toBeLessThan(CUE_BEAT_T.preSlam);
  });
  it('ON the beat (the beat bar\'s tolerance) is CLEAN; inside the reach but off it is LOOSE; outside is refused and says when', () => {
    const o = { tol: BEAT_TOL_SEC, used: false, slamReadAt: SHIPPED.readAt };
    expect(gradePump(PUMP_BEAT_T, o)).toMatchObject({ ok: true, grade: 'clean', style: PUMP_STYLE_CLEAN });
    expect(gradePump(PUMP_BEAT_T - BEAT_TOL_SEC, o)).toMatchObject({ ok: true, grade: 'clean' });
    expect(gradePump(PUMP_BEAT_T - BEAT_TOL_SEC - 0.01, o)).toMatchObject({ ok: true, grade: 'loose', style: PUMP_STYLE_LOOSE });
    expect(gradePump(PUMP_BEAT_T - PUMP_REACH_SEC - 0.01, o)).toEqual({ ok: false, why: 'tooEarly' });
    expect(gradePump(PUMP_BEAT_T + PUMP_REACH_SEC + 0.01, o)).toEqual({ ok: false, why: 'tooLate' });
    expect(gradePump(PUMP_BEAT_T, { ...o, used: true })).toEqual({ ok: false, why: 'spent' });
    expect(gradePump(NaN, o)).toEqual({ ok: false, why: 'tooEarly' });
    // the TV factor widens the beat as it widens the tricks' (the mode passes BEAT_TOL_SEC × tvFactor)
    expect(gradePump(PUMP_BEAT_T + BEAT_TOL_SEC * 1.3, { ...o, tol: BEAT_TOL_SEC * 1.35 })).toMatchObject({ ok: true, grade: 'clean' });
    // a nonsense tolerance is the bar's own
    expect(gradePump(PUMP_BEAT_T + BEAT_TOL_SEC * 0.9, { ...o, tol: NaN })).toMatchObject({ ok: true, grade: 'clean' });
  });
  it('a clean pump pays more style than a loose one, and both are small next to a perfect flight (+1)', () => {
    expect(PUMP_STYLE_CLEAN).toBeGreaterThan(PUMP_STYLE_LOOSE);
    expect(PUMP_STYLE_LOOSE).toBeGreaterThan(0);
    expect(PUMP_STYLE_CLEAN).toBeLessThanOrEqual(0.5);
  });
  it('every refusal says something', () => {
    for (const w of ['tooEarly', 'tooLate', 'noRoom', 'spent'] as PumpRefusal[]) expect(pumpRefusalLine(w).length).toBeGreaterThan(8);
  });
});

describe('the hang pump CANNOT break the slam window', () => {
  it('on the shipped flight a pump on the beat runs whole — the hang is PUMP_EXTRA_MS longer — and is over before the slam read', () => {
    const v = gradePump(PUMP_BEAT_T, { tol: BEAT_TOL_SEC, used: false, slamReadAt: SHIPPED.readAt });
    expect(v.ok && v.ms).toBe(PUMP_MS);
    expect(PUMP_EXTRA_MS).toBe(150);
    if (v.ok) expect(pumpEndsAt(PUMP_BEAT_T, v.ms)).toBeLessThanOrEqual(SHIPPED.readAt - PUMP_CLEAR_SEC + 1e-9);
  });
  it('for EVERY legal window — TV factor 1–2, the first-jump widening, style taps, any trick tax — every accepted pump is over before the read opens', () => {
    let accepted = 0, refused = 0;
    for (let tv = FACTOR_MIN; tv <= FACTOR_MAX + 1e-9; tv += 0.05) for (const guest of [1, ...GUEST_SLAM_FACTORS]) for (const taps of [0, 1, 2])
      for (const ts of [1, 0.85, 0.7, 0.5, 0.3]) {
        const { openAt, readAt } = readOf(windowOf(tv, guest, taps, ts));
        for (let k = 0; k <= 48; k++) {
          const t = PUMP_BEAT_T - PUMP_REACH_SEC + (2 * PUMP_REACH_SEC * k) / 48;
          const v = gradePump(t, { tol: BEAT_TOL_SEC * tv, used: false, slamReadAt: readAt });
          if (!v.ok) { expect(['noRoom']).toContain(v.why); refused++; continue; }
          accepted++;
          const end = pumpEndsAt(t, v.ms);
          expect(end).toBeLessThanOrEqual(readAt - PUMP_CLEAR_SEC + 1e-9);
          expect(end).toBeLessThan(openAt);
          expect(v.ms).toBeGreaterThanOrEqual(PUMP_MIN_MS);
          expect(v.ms).toBeLessThanOrEqual(PUMP_MS);
        }
      }
    expect(accepted).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);   // the widest windows really do leave no room — and the pump says so instead of overlapping
  });
  it('the slow is the only thing it does to the flight: the speed it slows to never stops the clock', () => {
    expect(PUMP_SLOW).toBeGreaterThan(0);
    expect(PUMP_SLOW).toBeLessThan(1);
    expect(pumpMsAt(NaN, 1)).toBe(0);
    expect(pumpMsAt(0.7, NaN)).toBe(0);
    expect(pumpMsAt(0.95, 0.9)).toBe(0);
  });
});

describe('the pump on the card', () => {
  it('pays style through flowStyle, and the style stays inside the 0–10 card however much else the flight has', () => {
    const base = { trickDifficulty: 6, runwayDifficulty: 2, propBonus: 1, charge: 1, launchSpeed01: 1, styleTier: 8, styleTaps: 2, hype: 100, hang: true, repeat: false, execution01: 1, chainTricks: 2, beatExec: 1.2 };
    const without = dunkCard({ ...base, flowStyle: 0 });
    const withPump = dunkCard({ ...base, flowStyle: PUMP_STYLE_CLEAN });
    expect(withPump.style).toBeLessThanOrEqual(10);
    expect(withPump.style).toBeGreaterThanOrEqual(without.style);
    const plain = { ...base, styleTier: 3, styleTaps: 0, hype: 0, hang: false, chainTricks: 0 };
    expect(dunkCard({ ...plain, flowStyle: PUMP_STYLE_CLEAN }).style - dunkCard({ ...plain, flowStyle: 0 }).style).toBeCloseTo(PUMP_STYLE_CLEAN);
    expect(withPump.difficulty).toBe(without.difficulty);
    expect(withPump.execution).toBe(without.execution);
  });
});
