// MUSIC-SUITE P4 (2026-09-25): the 8-tap timing check's math (ui/timingCheck.ts) — which taps count, which click each is
// for, and that the offset is rhythm-calibrate's computeOffsetMs over those pairs (snapped 25 ms, clamped ±400).
import { describe, expect, it } from 'vitest';
import { CHECK_BEAT_SEC, CHECK_BPM, CHECK_TAPS, acceptsTap, checkLine, checkWindow, formatOffset, readTimingCheck } from './timingCheck';
import { CALIBRATION, computeOffsetMs } from '@/lib/feel/rhythm-calibrate';
import { countInClicks } from '../AudioEngine';
import { CHECK_COUNT_BARS, CHECK_LEAD_BARS, checkClicks, heardClicks } from './timingCheck';
import { COMPRESSOR_DELAY_S, graphLatencySec } from '../mixGraph';

// the engine's own count-in: 2 bars at the check's tempo, starting 1 s into the clock
const clicks = countInClicks(1, 2, CHECK_BPM).map((c) => c.at);
const beat = CHECK_BEAT_SEC;
const taps = (lagMs: number, jitterMs: readonly number[] = []): number[] => clicks.map((c, i) => c + (lagMs + (jitterMs[i] ?? 0)) / 1000);

describe('the check', () => {
  it('is 2 bars of the engine’s count-in = 8 clicks at the calibrate screen’s 80 BPM', () => {
    expect(CHECK_BPM).toBe(CALIBRATION.BPM);
    expect(clicks).toHaveLength(CHECK_TAPS);
    expect(clicks[1] - clicks[0]).toBeCloseTo(0.75, 9);
  });

  it('reads a player 75 ms late as +75 ms — the same number computeOffsetMs gives for the true pairs', () => {
    const t = taps(75, [5, -8, 3, 0, -4, 6, -2, 0]);
    const r = readTimingCheck(clicks, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offsetMs).toBe(75);
    expect(r.offsetMs).toBe(computeOffsetMs(clicks, t));
    expect(r.pairs.map((p) => p.click)).toEqual(clicks.map((c) => expect.closeTo(c, 9)));
    expect(checkLine(r)).toMatch(/^your offset \+75 ms — saved/);
  });

  it('early taps read negative; exact taps read 0', () => {
    const early = readTimingCheck(clicks, taps(-50));
    expect(early.ok && early.offsetMs).toBe(-50);
    const exact = readTimingCheck(clicks, taps(0));
    expect(exact.ok && exact.offsetMs).toBe(0);
  });

  it('BLUETOOTH: 300 ms late is +300, never "early" — a tap is paired by the players’ consensus, not the nearest click', () => {
    const r = readTimingCheck(clicks, taps(300, [10, -10, 0, 5, -5, 0, 10, -10]));
    expect(r.ok && r.offsetMs).toBe(300);
    // nearest-click pairing (the pre-P2 screen) at a 600 ms beat would have paired 300 ms late with the NEXT click
    expect(computeOffsetMs(clicks.map((c) => c + 0.6), taps(300)) < 0).toBe(true);
  });

  it('the 8 clicks it played are what it reads: a tap on the beat AFTER the count is outside, a stray early tap is ignored', () => {
    // came in on the 2nd click, and tapped the downbeat after the count as the 8th: only 7 were on the clicks
    const late = [...clicks.slice(1), clicks[7] + beat].map((c) => c + 0.1);
    expect(readTimingCheck(clicks, late)).toMatchObject({ ok: false, reason: 'few', taps: 7 });
    // a nervous tap 400 ms before the first click, then all 8: the stray one is outside the window, the 8 read +100
    const r = readTimingCheck(clicks, [clicks[0] - 0.4, ...taps(100)]);
    expect(r.ok && r.offsetMs).toBe(100);
  });

  it('fewer than 8 taps, or taps that disagree, are refused and say so (nothing saved)', () => {
    const few = readTimingCheck(clicks, taps(50).slice(0, 5));
    expect(few).toMatchObject({ ok: false, reason: 'few', taps: 5 });
    expect(checkLine(few)).toMatch(/^5 of 8 taps landed/);
    // taps scattered across the beat: steadiness under 0.8
    const scattered = clicks.map((c, i) => c + [0, 0.3, -0.15, 0.25, 0.1, -0.1, 0.35, 0.05][i]);
    const uneven = readTimingCheck(clicks, scattered);
    expect(uneven).toMatchObject({ ok: false, reason: 'uneven' });
    expect(checkLine(uneven)).toMatch(/uneven .* nothing was saved/);
  });

  it('the window: from 200 ms before the first click to beat − 200 ms after the last (before bar 0 sounds)', () => {
    const w = checkWindow(clicks)!;
    expect(w.open).toBeCloseTo(clicks[0] - 0.2, 9);
    expect(w.close).toBeCloseTo(clicks[7] + beat - 0.2, 9);
    const bar0 = clicks[0] + 8 * beat;                     // countIn(2): bar 0 starts after the 8 clicks
    expect(w.close).toBeLessThan(bar0);
    expect(acceptsTap(clicks[0] - 0.25, [], clicks)).toBe(false);
    expect(acceptsTap(clicks[0] - 0.15, [], clicks)).toBe(true);
    expect(acceptsTap(w.close, [], clicks)).toBe(false);
    expect(acceptsTap(clicks[3], new Array(8).fill(0), clicks)).toBe(false);   // 8 already in
    expect(checkWindow([])).toBeNull();
  });

  it('the result is snapped to 25 ms and clamped to ±400 ms, as every stored offset is', () => {
    const r = readTimingCheck(clicks, taps(62));
    expect(r.ok && r.offsetMs).toBe(50);   // 62 → 50 (nearest 25)
    const far = readTimingCheck(clicks, taps(540));
    expect(far.ok && far.offsetMs).toBe(400);
  });

  it('formatOffset: +75 ms, −50 ms, 0 ms', () => {
    expect(formatOffset(75)).toBe('+75 ms');
    expect(formatOffset(-50)).toBe('−50 ms');
    expect(formatOffset(0)).toBe('0 ms');
  });
});

// MUSIC-SUITE P4 FIX PASS (2026-09-25): the lead-in bar, and the clicks read as they leave the desk.

describe('P4 FIX PASS: a lead-in bar before the 8 read clicks', () => {
  // what the room does: the engine counts in 3 bars (12 clicks), the check reads the last 8
  const all = countInClicks(1, CHECK_COUNT_BARS, CHECK_BPM).map((c) => c.at);
  const read = checkClicks(all);

  it('counts in one bar more than it reads; the read clicks are the last 8', () => {
    expect(CHECK_LEAD_BARS).toBe(1);
    expect(all).toHaveLength(12);
    expect(read).toEqual(all.slice(4));
    expect(checkClicks(all.slice(0, 7))).toEqual([]);                     // too few to read: the room refuses to start
  });

  it('a REACTION-late tap on the first click (+300 ms, the old check read that as "uneven") is in the lead-in and never read', () => {
    const t = [all[0] + 0.3, all[1] + 0.02, ...read.map((c) => c)];        // stray lead-in taps, then the 8 on time
    const r = readTimingCheck(read, t);
    expect(r.ok && r.offsetMs).toBe(0);
    expect(acceptsTap(all[0] + 0.3, [], read)).toBe(false);                // the room does not even keep it
    expect(acceptsTap(read[0] - 0.1, [], read)).toBe(true);
  });

  it('the old 2-bar check, for the record: a reaction-late first tap biased or broke the reading', () => {
    const old = countInClicks(1, 2, CHECK_BPM).map((c) => c.at);
    const late = (ms: number) => [old[0] + ms / 1000, ...old.slice(1)];
    expect(readTimingCheck(old, late(200))).toMatchObject({ ok: true, offsetMs: 25 });
    expect(readTimingCheck(old, late(350))).toMatchObject({ ok: false, reason: 'uneven' });
  });

  it('the clicks as heard: the desk\'s 6 ms (12 ms with MASTER) is not the player\'s — a tap 6 ms after the scheduled click reads 0', () => {
    expect(graphLatencySec(false)).toBeCloseTo(COMPRESSOR_DELAY_S, 12);
    expect(graphLatencySec(true)).toBeCloseTo(2 * COMPRESSOR_DELAY_S, 12);
    for (const polished of [false, true]) {
      const lat = graphLatencySec(polished);
      const heard = heardClicks(read, lat);
      expect(heard[3] - read[3]).toBeCloseTo(lat, 12);
      // a device with no delay of its own: the taps land exactly as the clicks leave the desk
      const r = readTimingCheck(heard, heard.map((c) => c));
      expect(r.ok && r.offsetMs).toBe(0);
    }
    expect(heardClicks([1, 2], NaN)).toEqual([1, 2]);
  });
});
