// Owner, 2026-09-24: "Cap only Arena sets — staked Arena sets end after 32 bars; free play stays endless". Hotfix 6/6
// capped EVERY PERFORM set at 32 bars so the Arena could bound a staked score; free play stakes nothing, so the cap left
// free play. Proven here on the real PerformSet, the line the player reads, and the loader that tells the room which
// run it is. The ceiling itself is pinned in lib/arena-score-integrity.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The loader reads ?arena= through the app router and mounts the room through GameShell; both are stood in for, so the
// test sees exactly what the loader hands the shell.
let query = '';
let shellProps: Record<string, unknown> | null = null;
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/games/game-shell', () => ({
  GameShell: (p: Record<string, unknown>) => { shellProps = p; return null; },
}));

import { MusicLoader } from '@/app/play/music/_components/loader';
import {
  PerformSet, performSetMax, performStatusLine, ARENA_SET_NOTE,
  PERFORM_SET_BARS, PERFORM_SET_NOTES, PERFORM_STEPS_PER_BAR, PERFORM_EXPIRE_S,
  PERFORM_PERFECT_S, PERFORM_WIN_MIN_ACCURACY, PERFORM_WIN_MIN_BARS, PERFORM_TAP_KEYS, PERFORM_MAX_OUTPUT_LATENCY_S,
  performAccuracy, performGrade, performSetWon, performLatencySec, performTapLabel, performNoteAt, performResultStats,
  isPerformTapKey, isRepeatedActivation, PERFORM_SPAM_LOCK_S, type PerformResult,
} from './performSet';
// MUSIC-SUITE P6 (2026-09-25): the lanes, the band, the recap
import {
  PERFORM_LANES, PERFORM_LANE_LABELS, PERFORM_LANE_COLORS, PERFORM_LANE_PAIR_STEPS, PERFORM_BAND_JOIN, PERFORM_BAND_DROP,
  PERFORM_BAND_FOUNDATION, PERFORM_HIST_BIN_MS, PerformBand, isPerformLane, performLaneOf, performLanesOf, performCapLanes,
  performHistogram, performTimingLine, laneStatKey, PERFORM_CHORD_S, type PerformLane,
  performFoundationFor, performLanesWithNotes, performFoundationHint, performBandMap, performBandLive,
} from './performSet';
import { cellFoundation } from './studioEdit';
import { KIT_SLOTS } from './SynthKit';
import { SPAM_LOCK_SEC } from '@/lib/babylon/core/DanceCore';
import { PAD_KEYS } from './Flip';
import { gradeFor } from '@/lib/babylon/core/danceTracks';

/** Plays `bars` bars at `bpm`, every note tapped dead on. Returns the set and the first step at which it was over. */
function play(arena: boolean, bars: number, bpm = 92): { set: PerformSet; overAtStep: number; offeredPast32: number } {
  const set = new PerformSet({ arena });
  const stepSec = 60 / bpm / 4;
  let overAtStep = -1, offeredPast32 = 0;
  for (let i = 0; i < bars * PERFORM_STEPS_PER_BAR; i++) {
    const t = i * stepSec;
    const { offered } = set.note(i % PERFORM_STEPS_PER_BAR, t, t);
    if (offered && i >= PERFORM_SET_NOTES) offeredPast32++;
    // MUSIC-SUITE P6: the player taps the notes the set offers. (This tapped every step, past an Arena set's end too: those
    // taps are EXTRAs, and since P6 the spam lock works both ways — a stray tap 163 ms after the last note takes it back to
    // GOOD — so a set played on past its end is no longer "exactly the ceiling".)
    if (offered) set.tap(t);
    if (overAtStep < 0 && set.over(t)) overAtStep = i;
  }
  return { set, overAtStep, offeredPast32 };
}

describe('an Arena (staked) PERFORM set', () => {
  it(`ends on its own after ${PERFORM_SET_BARS} bars`, () => {
    const { set, overAtStep, offeredPast32 } = play(true, PERFORM_SET_BARS + 8);
    expect(set.bars).toBe(PERFORM_SET_BARS);
    expect(set.notes).toBe(PERFORM_SET_NOTES);
    expect(offeredPast32).toBe(0);                                      // bar 33 is music, not notes
    // over once the last note's window has closed, which at 92 BPM is the second step of bar 33
    const stepSec = 60 / 92 / 4;
    expect(overAtStep).toBe(PERFORM_SET_NOTES - 1 + Math.floor(PERFORM_EXPIRE_S / stepSec) + 1);
    expect(set.bar).toBe(PERFORM_SET_BARS);                             // the count holds at its last bar
    expect(set.score).toBe(performSetMax());                            // a perfect set is exactly the ceiling
  });

  it('counts the bar a note is in: the last step of bar 1 is bar 1, the first of bar 2 is bar 2', () => {
    const set = new PerformSet({ arena: true });
    expect(set.bar).toBe(1);
    for (let i = 0; i < PERFORM_STEPS_PER_BAR; i++) set.note(i, i * 0.1, i * 0.1);
    expect(set.bar).toBe(1);
    set.note(0, 1.6, 1.6);
    expect(set.bar).toBe(2);
  });

  it('is not over a moment early: every note of bar 32 is still open to hit', () => {
    const { set, overAtStep } = play(true, PERFORM_SET_BARS);
    expect(overAtStep).toBe(-1);                                        // the last note's window is still open
    expect(set.over(1e9)).toBe(true);                                   // and it closes
  });
});

describe('a free-play PERFORM set', () => {
  it(`passes ${PERFORM_SET_BARS} bars and keeps going`, () => {
    const { set, overAtStep, offeredPast32 } = play(false, PERFORM_SET_BARS * 2);
    expect(set.bars).toBeNull();
    expect(overAtStep).toBe(-1);                                        // it never ends itself
    expect(set.over(1e9)).toBe(false);                                  // not even long after its last note
    expect(set.notes).toBe(PERFORM_SET_NOTES * 2);
    expect(offeredPast32).toBe(PERFORM_SET_NOTES);                      // bars 33–64 are all notes
    expect(set.bar).toBe(PERFORM_SET_BARS * 2);                         // the bar count is not held at 32
    expect(set.score).toBe(performSetMax(PERFORM_SET_NOTES * 2));       // and they all score
  });

  it('scores the first 32 bars exactly as an Arena set does: the judge is the same, only the length differs', () => {
    const free = new PerformSet({ arena: false }), arena = new PerformSet({ arena: true });
    const pattern = [0, 0.03, 0.12, -0.2, 0.3, 0.05];                   // PERFECT and GOOD hits, and a missed note
    for (let i = 0; i < PERFORM_SET_NOTES; i++) {
      const t = i * 0.2, off = pattern[i % pattern.length];
      for (const s of [free, arena]) { s.note(0, t, t); if (Math.abs(off) < PERFORM_EXPIRE_S) s.tap(t + off); }
    }
    // MUSIC-SUITE P2: a late tap can wait for the next step to be scheduled (a nearer note may come), so the tallies are
    // read at the set's end, where result() decides what is still waiting — the Arena set's last taps never wait
    const end = PERFORM_SET_NOTES * 0.2 + 1;
    expect(free.result(end).score).toBe(arena.result(end).score);
    expect(free.combo).toBe(arena.combo);
  });
});

describe('what the player reads', () => {
  it('free play mentions no bar limit', () => {
    const line = performStatusLine({ bars: null, bar: 40, score: 1200, combo: 4, judgement: 'PERFECT' });
    expect(line).toBe('score 1200 · combo x4 · PERFECT');
    expect(line).not.toMatch(/bar|\/\s*\d/);
  });

  it(`an Arena set counts its bars out of ${PERFORM_SET_BARS} and says it ends there`, () => {
    expect(performStatusLine({ bars: PERFORM_SET_BARS, bar: 3, score: 1200, combo: 4, judgement: 'GOOD' }))
      .toBe(`bar 3/${PERFORM_SET_BARS} · score 1200 · combo x4 · GOOD`);
    expect(ARENA_SET_NOTE).toBe(`Arena set: it ends on its own after ${PERFORM_SET_BARS} bars.`);
  });

  it('StudioMode shows the bar count from the set that scores, and the Arena note only on an Arena run', () => {
    const studio = readFileSync(join(process.cwd(), 'lib/babylon/music/StudioMode.tsx'), 'utf8');
    expect(studio).toContain('performStatusLine({ bars: setRef.current.bars, bar: perfBar, score, combo, judgement })');
    expect(studio).toContain('{arenaSet && <span style={{ fontSize: 12, color: \'#ffd75e\' }}>{ARENA_SET_NOTE}</span>}');
    expect(studio).toContain('arenaSet = false,');                      // a room nobody told otherwise is free play
    expect(studio).not.toMatch(/PERFORM_SET_BARS\}/);                   // no hard-coded "/32" left in the markup
  });
});

describe('the loader tells the room which run it is', () => {
  const mount = (q: string) => {
    query = q; shellProps = null;
    renderToStaticMarkup(createElement(MusicLoader));
    return (shellProps as { gameProps?: Record<string, unknown> } | null)?.gameProps ?? {};
  };

  it('an Arena duel (?arena=<matchId>) gets the staked set', () => {
    expect(mount('arena=cm_123').arenaSet).toBe(true);
  });

  it('free play, a story node or a friend challenge does not', () => {
    for (const q of ['', 'story=node_1', 'mp=ABCD', 'arena=']) expect(mount(q).arenaSet, q || '(none)').toBe(false);
  });

  it('still hands over the shards seam beside it', () => {
    expect(typeof mount('arena=cm_123').spendShards).toBe('function');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P2 (2026-09-25): "PERFORM JUDGES THE TRUTH". P1 measured (outbox musicsuite/BASELINE.md 2d): a note entered
// the judge only after it had sounded, so a tap dead on a lone note scored EARLY (25 of 25 timer phases) and with music
// running an on-time tap took the PREVIOUS note late; a steady on-time player scored 24,850 of 68,000; one tap won a set.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const STEP_92 = 60 / 92 / 4;
const LEAD = 0.05;

/**
 * Drive a set the way StudioMode does now: step i sounds at LEAD + i·step and is OFFERED `ahead` seconds before it
 * sounds (AudioEngine.onStepScheduled; the scheduler looks 100 ms ahead), its window is swept when it sounds
 * (onStepAudible → expire), and each tap lands at its own time. `note(i)` says whether step i is a note or a rest.
 * Returns the result a moment after the last event (every window closed).
 */
function drive(set: PerformSet, o: { bars: number; taps: number[]; ahead?: number; bpm?: number; note?: (i: number) => boolean }): PerformResult {
  const step = 60 / (o.bpm ?? 92) / 4, ahead = o.ahead ?? 0.1;
  const ev: { at: number; kind: 0 | 1 | 2; i: number }[] = [];
  for (let i = 0; i < o.bars * PERFORM_STEPS_PER_BAR; i++) {
    const t = LEAD + i * step;
    ev.push({ at: t - ahead, kind: 0, i }, { at: t, kind: 2, i });
  }
  for (const t of o.taps) ev.push({ at: t, kind: 1, i: -1 });
  ev.sort((a, b) => a.at - b.at || a.kind - b.kind);
  let last = 0;
  for (const e of ev) {
    last = e.at;
    const t = LEAD + e.i * step;
    if (e.kind === 0) { if (o.note?.(e.i) ?? true) set.note(e.i % PERFORM_STEPS_PER_BAR, t, e.at); else set.rest(e.i % PERFORM_STEPS_PER_BAR, t, e.at); }
    else if (e.kind === 1) set.tap(e.at);
    else set.expire(e.at);
  }
  return set.result(last + PERFORM_EXPIRE_S + 0.01);
}
const noteTimes = (bars: number, bpm = 92): number[] => Array.from({ length: bars * PERFORM_STEPS_PER_BAR }, (_, i) => LEAD + i * (60 / bpm / 4));

describe('P2: a note is known when it is scheduled, and a tap is judged by its signed error', () => {
  it('a tap dead on a note that is scheduled but not yet sounded is PERFECT (P1: EARLY)', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9);                                              // scheduled 100 ms before it sounds
    expect(set.tap(1.0)).toBe('PERFECT');
    expect(set.lastTap).toEqual({ judgement: 'PERFECT', errorSec: 0, side: null });
  });

  it('a tap before the note takes THAT note, marked EARLY — never the note before it', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9);                                              // note A, left unhit
    set.note(1, 1.0 + STEP_92, 1.0);                                    // note B, 163 ms later, already known
    expect(set.tap(1.0 + STEP_92 - 0.03)).toBe('PERFECT');              // 30 ms before B: B, not A (A is 133 ms back)
    expect(set.lastTap?.side).toBe('EARLY');
    expect(set.lastTap?.errorSec).toBeCloseTo(-0.03, 9);
    const r = set.result(2);                                            // A's window closed unhit
    expect([r.perfects, r.goods, r.misses, r.notes]).toEqual([1, 0, 1, 2]);
  });

  it('GOOD says which side it landed: EARLY or LATE, with the error', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9);
    expect(set.tap(1.12)).toBe('WAIT');                                 // 120 ms late: the next step could be nearer
    set.rest(1, 1.25, 1.15);                                            // it is not (130 ms away, and a rest)
    expect(performTapLabel(set.lastTap)).toBe('GOOD · LATE 120ms');
    set.note(0, 2.0, 1.9);
    expect(set.tap(1.9)).toBe('GOOD');
    expect(performTapLabel(set.lastTap)).toBe('GOOD · EARLY 100ms');
    expect(performTapLabel(null)).toBe('');
  });

  it('the windows are two-sided and the same size either way', () => {
    for (const off of [-0.2, -0.079, 0.079, 0.2, -0.26, 0.26]) {
      const set = new PerformSet({ arena: false });
      set.note(0, 1.0, 0.7);
      set.tap(1.0 + off);
      set.rest(1, 2.0, 1.9);                                            // the schedule moves on: whatever waited is decided
      const want = Math.abs(off) < PERFORM_PERFECT_S ? 'PERFECT' : Math.abs(off) < PERFORM_EXPIRE_S ? 'GOOD' : 'EXTRA';
      expect(set.lastTap?.judgement, `${off}`).toBe(want);
      if (want !== 'EXTRA') expect(set.lastTap?.side, `${off}`).toBe(off < 0 ? 'EARLY' : 'LATE');
    }
  });

  it('a late tap waits while a nearer note could still be scheduled, then takes whichever is nearer', () => {
    // 60 BPM, 16ths 250 ms apart: A at 1.0 (open), B at 1.25 not yet scheduled, a tap at 1.16 (A +160 ms, B −90 ms)
    const nearerNext = new PerformSet({ arena: false });
    nearerNext.note(0, 1.0, 0.9);
    expect(nearerNext.tap(1.16)).toBe('WAIT');
    nearerNext.note(1, 1.25, 1.16);                                     // B arrives, 90 ms from the tap: B it is
    expect(nearerNext.lastTap).toEqual({ judgement: 'GOOD', errorSec: expect.closeTo(-0.09, 9), side: 'EARLY' });
    // the same tap at 1.10 (A +100 ms, B −150 ms): A it is, decided when B is scheduled
    const nearerKnown = new PerformSet({ arena: false });
    nearerKnown.note(0, 1.0, 0.9);
    expect(nearerKnown.tap(1.1)).toBe('WAIT');
    nearerKnown.note(1, 1.25, 1.16);
    expect(nearerKnown.lastTap).toEqual({ judgement: 'GOOD', errorSec: expect.closeTo(0.1, 9), side: 'LATE' });
    const r = nearerKnown.result(1.2);                                  // END SET before B sounds: A hit, B not counted
    expect([r.hits, r.misses, r.notes]).toEqual([1, 0, 1]);
  });

  it('a tap no unscheduled note could beat is decided at once (the usual case: on time, or early on a known note)', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9); set.note(1, 1.163, 1.063);                  // both known
    expect(set.tap(1.02)).toBe('PERFECT');                             // 20 ms late on A; B is known and farther
    expect(set.tap(1.12)).toBe('PERFECT');                             // 43 ms early on B
    expect(set.lastTap?.side).toBe('EARLY');
    // 60 BPM once two gaps are seen: the next step is at least 250 ms after the last, so a tap 10 ms late is decided
    // at once (the browser run before this bound: an on-time tap at 60 BPM waited ~150 ms for its verdict)
    const slow = new PerformSet({ arena: false });
    for (const t of [0.25, 0.5, 0.75]) slow.note(0, t, t - 0.1);       // (in time order: each scheduled 100 ms ahead)
    expect(slow.tap(0.76)).toBe('PERFECT');                            // the next step cannot sound before 1.0
    slow.note(0, 1.0, 0.9);
    expect(slow.tap(1.01)).toBe('PERFECT');
    // swing: gaps alternate long/short; the SHORTER one bounds the next step (40 % swing at 60 BPM: 300 / 200 ms)
    const swung = new PerformSet({ arena: false });
    for (const t of [0, 0.3, 0.5]) swung.note(0, t, t - 0.1);          // the next step (not yet known) will be 0.8
    expect(swung.tap(0.52)).toBe('PERFECT');                            // 20 ms late: nothing unknown (>= 0.7) is nearer
    const swung2 = new PerformSet({ arena: false });
    for (const t of [0, 0.3, 0.5]) swung2.note(0, t, t - 0.1);
    expect(swung2.tap(0.62)).toBe('WAIT');                              // 120 ms late on 0.5: a step at 0.7 would be nearer
    swung2.note(0, 0.8, 0.7);                                           // it is at 0.8 (180 ms away): 0.5 it is
    expect(swung2.lastTap).toEqual({ judgement: 'GOOD', errorSec: expect.closeTo(0.12, 9), side: 'LATE' });
  });

  it('a tap with no note in reach, and none scheduled into its window, is an EXTRA tap: no points, the combo breaks', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9); set.tap(1.0);
    set.note(0, 1.2, 1.1); set.tap(1.2);
    expect(set.combo).toBe(2);
    const before = set.score;
    expect(set.tap(1.21)).toBe('WAIT');                                 // both notes already taken: wait for the next
    expect(set.combo).toBe(2);                                          // nothing is decided yet
    expect(set.expire(1.21 + PERFORM_EXPIRE_S + 0.01)).toBe(0);         // its window closed with no note in it
    expect(performTapLabel(set.lastTap)).toBe('EXTRA TAP');
    // no points of its own — but MUSIC-SUITE P6's lock works both ways: the two PERFECTs within 0.25 s before it (1.00 and
    // 1.20) are taken back to GOOD, 50 points each (combo 0 and 1: × 1)
    expect([set.score, set.combo, set.extras]).toEqual([before - 100, 0, 1]);
    expect([set.perfects, set.goods]).toEqual([0, 2]);
    expect(set.maxCombo).toBe(2);
  });

  it('a tap before its note is SCHEDULED waits, and the note takes it EARLY when it is (60 BPM: 16ths 250 ms apart)', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9); expect(set.tap(1.0)).toBe('PERFECT');       // note A, hit
    expect(set.tap(1.13)).toBe('WAIT');                                 // 120 ms before B, which is not scheduled yet
    set.note(1, 1.25, 1.15);                                            // the scheduler reaches B (100 ms ahead)
    expect(set.lastTap).toEqual({ judgement: 'GOOD', errorSec: expect.closeTo(-0.12, 9), side: 'EARLY' });
    expect(performTapLabel(set.lastTap)).toBe('GOOD · EARLY 120ms');
    expect([set.combo, set.goods, set.extras]).toEqual([2, 1, 0]);
  });

  it('a waiting tap that a rest steps past, or an Arena set past its end, meets no note: EXTRA', () => {
    const free = new PerformSet({ arena: false });
    expect(free.tap(1.0)).toBe('WAIT');
    free.rest(0, 1.1, 1.0);                                             // inside its window: still waiting
    expect(free.extras).toBe(0);
    free.rest(1, 1.3, 1.2);                                             // past its window, and steps come in time order
    expect(free.extras).toBe(1);
    const arena = new PerformSet({ arena: true });
    for (let i = 0; i < PERFORM_SET_NOTES; i++) arena.rest(i % 16, i * 0.1, i * 0.1);
    expect(arena.tap(PERFORM_SET_NOTES * 0.1)).toBe('EXTRA');          // no step can come any more
    const ended = new PerformSet({ arena: false });
    ended.tap(5);
    expect(ended.result(5).extras).toBe(1);                             // still waiting at END SET: it met no note
  });

  it('the best combo is the longest run, not the one the set ended on (P1: the final combo was called "best")', () => {
    const set = new PerformSet({ arena: false });
    const hits = [true, true, true, true, true, true, true, false, true, true, true];
    hits.forEach((h, i) => { const t = 1 + i * 0.3; set.note(0, t, t - 0.1); if (h) set.tap(t); set.expire(t + 0.29); });
    expect(set.combo).toBe(3);
    expect(set.maxCombo).toBe(7);
    expect(set.result(10).maxCombo).toBe(7);
  });

  it('a steady on-time player scores the perfect set (P1: 24,850 of 68,000 over 5 bars)', () => {
    const r = drive(new PerformSet({ arena: false }), { bars: 5, taps: noteTimes(5) });
    expect(r.score).toBe(performSetMax(5 * PERFORM_STEPS_PER_BAR));
    expect(r.score).toBe(68_000);
    expect([r.perfects, r.goods, r.misses, r.extras, r.maxCombo]).toEqual([80, 0, 0, 0, 80]);
  });

  it('whatever the scheduler lead (25–100 ms ahead), an on-time tap is PERFECT', () => {
    for (const ahead of [0.025, 0.05, 0.075, 0.1]) {
      const r = drive(new PerformSet({ arena: false }), { bars: 2, taps: noteTimes(2), ahead });
      expect(r.accuracy, `${ahead}`).toBe(1);
    }
  });
});

describe('P2: the judge listens where the player listens (latency)', () => {
  it('the saved calibration wins and is NOT added to the output delay (it already contains it)', () => {
    expect(performLatencySec({ savedOffsetMs: 120, outputLatency: 0.05, baseLatency: 0.01 })).toBeCloseTo(0.12, 12);
    expect(performLatencySec({ savedOffsetMs: -50, outputLatency: 0.05 })).toBeCloseTo(-0.05, 12);   // taps early by habit
    expect(performLatencySec({ savedOffsetMs: 0, outputLatency: 0.05 })).toBe(0);                    // a saved 0 is a calibration
  });

  it('never calibrated: the context\'s outputLatency, else its baseLatency, else 0 (capped)', () => {
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: 0.042, baseLatency: 0.01 })).toBeCloseTo(0.042, 12);
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: 0, baseLatency: 0.01 })).toBeCloseTo(0.01, 12);
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: undefined, baseLatency: undefined })).toBe(0);
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: Number.NaN })).toBe(0);
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: 3 })).toBe(PERFORM_MAX_OUTPUT_LATENCY_S);
  });

  it('P4 FIX PASS: + the Academy desk\'s own delay (the limiter\'s 6 ms, 12 with MASTER) on EVERY path — neither knows it', () => {
    expect(performLatencySec({ savedOffsetMs: 120, outputLatency: 0.05, graphLatencySec: 0.006 })).toBeCloseTo(0.126, 12);
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: 0.042, graphLatencySec: 0.012 })).toBeCloseTo(0.054, 12);
    expect(performLatencySec({ savedOffsetMs: null, graphLatencySec: 0.006 })).toBeCloseTo(0.006, 12);
    expect(performLatencySec({ savedOffsetMs: null, outputLatency: 3, graphLatencySec: 0.006 })).toBeCloseTo(PERFORM_MAX_OUTPUT_LATENCY_S + 0.006, 12);
    expect(performLatencySec({ savedOffsetMs: 0, graphLatencySec: Number.NaN })).toBe(0);           // absent / broken = the P2 rule
  });

  it('a tap that arrives exactly one latency after the note\'s clock time is dead on; windows close on the heard clock', () => {
    const set = new PerformSet({ arena: false });
    set.latencySec = 0.04;
    set.note(0, 1.0, 0.9);
    expect(set.tap(1.04)).toBe('PERFECT');
    expect(set.lastTap?.errorSec).toBeCloseTo(0, 12);
    set.note(0, 2.0, 1.9);
    expect(set.expire(2.0 + PERFORM_EXPIRE_S + 0.02)).toBe(0);          // heard at 2.04: still open at +0.27 on the clock
    expect(set.expire(2.0 + PERFORM_EXPIRE_S + 0.05)).toBe(1);
  });

  it('with a latency, the same late-by-the-speaker taps that were GOOD are PERFECT', () => {
    // quarter notes (a 16th grid would hand a 120 ms-late tap to the NEXT 16th — see the P6 pin below)
    const quarter = (i: number) => i % 4 === 0;
    const late = noteTimes(4).filter((_, i) => quarter(i)).map((t) => t + 0.12);   // everything heard 120 ms late
    const raw = drive(new PerformSet({ arena: false }), { bars: 4, taps: late, note: quarter });
    const cal = new PerformSet({ arena: false }); cal.latencySec = 0.12;
    const fixed = drive(cal, { bars: 4, taps: late, note: quarter });
    expect([raw.perfects, raw.goods]).toEqual([0, 16]);
    expect([fixed.perfects, fixed.goods]).toEqual([16, 0]);
  });
});

describe('P2: the win (owner decision #13) and the result contract', () => {
  it('accuracy = (perfects + 0.5 × goods) / notes; the grade is the dance room\'s scale', () => {
    expect(performAccuracy(6, 4, 10)).toBeCloseTo(0.8, 12);
    expect(performAccuracy(0, 0, 0)).toBe(0);
    expect(performAccuracy(-3, 2, 4)).toBeCloseTo(0.25, 12);
    for (let a = 0; a <= 1.0001; a += 0.005) expect(performGrade(a), `${a}`).toBe(gradeFor(a));
    expect(performGrade(Number.NaN)).toBe('D');
  });

  it('won = accuracy ≥ 0.5 AND bars ≥ 8, nothing else', () => {
    expect([PERFORM_WIN_MIN_ACCURACY, PERFORM_WIN_MIN_BARS]).toEqual([0.5, 8]);
    expect(performSetWon({ accuracy: 0.5, bars: 8 })).toBe(true);
    expect(performSetWon({ accuracy: 0.4999, bars: 8 })).toBe(false);
    expect(performSetWon({ accuracy: 1, bars: 7 })).toBe(false);
    expect(performSetWon({ accuracy: Number.NaN, bars: 99 })).toBe(false);
  });

  it('a perfect 7-bar set is not won; the 8th bar wins it', () => {
    expect(drive(new PerformSet({ arena: false }), { bars: 7, taps: noteTimes(7) }).won).toBe(false);
    const r8 = drive(new PerformSet({ arena: false }), { bars: 8, taps: noteTimes(8) });
    expect([r8.won, r8.bars, r8.grade, r8.accuracy]).toEqual([true, 8, 'S', 1]);
  });

  it('half the notes PERFECT over 8 bars is exactly grade C and won; one note fewer is not', () => {
    const t = noteTimes(8);
    const half = drive(new PerformSet({ arena: false }), { bars: 8, taps: t.filter((_, i) => i % 2 === 0) });
    expect([half.accuracy, half.grade, half.won]).toEqual([0.5, 'C', true]);
    const less = drive(new PerformSet({ arena: false }), { bars: 8, taps: t.filter((_, i) => i % 2 === 0).slice(1) });
    expect(less.won).toBe(false);
  });

  it('ONE TAP no longer wins a set (P1: score 100, won, 15 LC)', () => {
    const r = drive(new PerformSet({ arena: false }), { bars: 8, taps: [noteTimes(8)[16]] });
    expect(r.score).toBe(100);
    expect([r.won, r.grade]).toEqual([false, 'D']);
  });

  it('notes scheduled but not yet heard when the set ends are not counted; heard and unhit ones are misses', () => {
    const set = new PerformSet({ arena: false });
    for (let i = 0; i < 16; i++) { const t = 1 + i * 0.1; set.note(i, t, t - 0.1); if (i < 10) set.tap(t); }
    const r = set.result(1 + 12 * 0.1);                                 // steps 0–12 heard, 13–15 scheduled ahead
    expect([r.hits, r.misses, r.notes]).toEqual([10, 3, 13]);           // 10, 11, 12 heard and never hit
    expect(r.bars).toBe(0);                                             // not one whole bar heard yet
    expect(set.result(10).bars).toBe(1);
  });

  it('the stats carry exactly the shared contract (and the EXTRA taps), accuracy on 0..1', () => {
    // quarter notes, every third one tapped 120 ms late (GOOD), the rest on time
    const quarter = (i: number) => i % 4 === 0;
    const taps = noteTimes(8).filter((_, i) => quarter(i)).map((t, k) => t + (k % 3 === 0 ? 0.12 : 0));
    const r = drive(new PerformSet({ arena: true }), { bars: 8, taps, note: quarter });
    const stats = performResultStats(r);
    expect(Object.keys(stats).sort()).toEqual(
      ['accuracy', 'arena', 'bars', 'extras', 'goods', 'grade', 'hits', 'maxCombo', 'misses', 'notes', 'perfects'].sort());
    expect(stats.arena).toBe(true);
    expect(stats.accuracy).toBeCloseTo((r.perfects + 0.5 * r.goods) / r.notes, 12);
    expect(r.hits).toBe(r.perfects + r.goods);
    expect(r.notes).toBe(r.hits + r.misses);
    expect(r.accuracy).toBeGreaterThan(0.8);
    expect(r.accuracy).toBeLessThan(1);
  });
});

describe('P2: an empty grid offers no notes', () => {
  it('performNoteAt: a step is a note only where the beat HITS (MUSIC-SUITE P2 FIX PASS: it was every step of a live grid)', () => {
    expect(performNoteAt({ hits: 0, gridLive: true })).toBe(false);    // a rest step of a real beat is a rest now
    expect(performNoteAt({ hits: 2, gridLive: true })).toBe(true);
    expect(performNoteAt({ hits: 1, gridLive: true })).toBe(true);
    expect(performNoteAt({ hits: 0, gridLive: false })).toBe(false);
  });

  it('a silent grid: zero notes offered, no bar played, the taps are misses, nothing to win — and an Arena set still ends after 32 bars', () => {
    const free = drive(new PerformSet({ arena: false }), { bars: 10, taps: [1, 2, 3], note: () => false });
    // MUSIC-SUITE P2 FIX PASS: the three EXTRA taps are judged misses (notes = hits + misses), and a rest bar is not a bar
    expect([free.notes, free.bars, free.hits, free.extras, free.misses, free.accuracy, free.won]).toEqual([3, 0, 0, 3, 3, 0, false]);
    const arena = new PerformSet({ arena: true });
    let overAt = -1;
    for (let i = 0; i < (PERFORM_SET_BARS + 2) * PERFORM_STEPS_PER_BAR && overAt < 0; i++) {
      const t = LEAD + i * STEP_92;
      arena.rest(i % 16, t, t - 0.1);
      if (arena.over(t)) overAt = i;
    }
    expect(arena.notes).toBe(0);
    expect(overAt).toBeGreaterThan(PERFORM_SET_NOTES - 1);              // it ends after its 512th step, not before
    expect(overAt).toBeLessThan(PERFORM_SET_NOTES + 4);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P2 FIX PASS (2026-09-25): DECISION #13 WAS LETTING THE WRONG PLAYERS WIN. The phase review measured, on this
// file's drive(): an on-beat quarter-note player 25 % (D) at every tempo; a masher at 4/s 65.6 % (C), 6/s 96.5 % (S),
// 20–30/s 50.4 % (C); a held Enter on the focused TAP button a hands-free C; one tap after 8 silent bars an S. Now:
// notes only where the beat hits, an EXTRA tap is a miss (the Cypher's rule), a hit just after one is capped at GOOD
// (the Cypher's spam lock), and only bars that offered a note count toward the 8.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** The P2 fix pass's grids: which of the 16 steps of every bar the beat hits. */
const GRIDS: Record<string, (i: number) => boolean> = {
  quarters: (i) => i % 4 === 0,                                            // four on the floor
  kickSnare: (i) => [0, 4, 8, 12].includes(i % 16),                        // kick 1 & 3, snare 2 & 4 (cellFoundation's core)
  backbeat: (i) => i % 16 === 4 || i % 16 === 12,
  eighths: (i) => i % 2 === 0,
  cell: (i) => [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15].includes(i % 16),   // a dense Cell foundation (hats, bass, lead)
  sixteenths: () => true,
};
const TEMPOS = [60, 92, 120, 160];
const PHASES = [0, 0.013, 0.03, 0.05, 0.07, 0.11];
const timesOn = (bars: number, bpm: number, note: (i: number) => boolean): number[] =>
  Array.from({ length: bars * PERFORM_STEPS_PER_BAR }, (_, i) => i).filter(note).map((i) => LEAD + i * (60 / bpm / 4));
const mash = (perSec: number, phase: number, bars: number, bpm: number): number[] => {
  const out: number[] = [];
  for (let t = phase; t < LEAD + bars * PERFORM_STEPS_PER_BAR * (60 / bpm / 4); t += 1 / perSec) out.push(t);
  return out;
};

describe('P2 fix pass: the win follows WHEN you tap, not how often', () => {
  it('a player who taps every note of the beat dead on wins with an S, on every grid, at every tempo', () => {
    for (const bpm of TEMPOS) {
      for (const [g, note] of Object.entries(GRIDS)) {
        const r = drive(new PerformSet({ arena: false }), { bars: 8, bpm, note, taps: timesOn(8, bpm, note) });
        expect([r.won, r.grade, r.bars], `${g} @ ${bpm}`).toEqual([true, 'S', 8]);
      }
    }
  });

  it('a quarter-note player on a kick-and-snare beat wins at 60, 92, 120 and 160 BPM (review: 25 %, D, at every tempo)', () => {
    for (const bpm of TEMPOS) {
      const r = drive(new PerformSet({ arena: false }), { bars: 8, bpm, note: GRIDS.kickSnare, taps: timesOn(8, bpm, GRIDS.quarters) });
      expect([r.won, r.accuracy, r.extras], `${bpm}`).toEqual([true, 1, 0]);
    }
  });

  it('a masher at 4–30 taps/s loses on a kick-and-snare, a four-on-the-floor and a backbeat grid, at every tempo and phase', () => {
    for (const bpm of TEMPOS) {
      for (const g of ['kickSnare', 'quarters', 'backbeat'] as const) {
        for (const rate of [4, 6, 8, 12, 20, 30]) {
          for (const ph of PHASES) {
            const r = drive(new PerformSet({ arena: false }), { bars: 8, bpm, note: GRIDS[g], taps: mash(rate, ph, 8, bpm) });
            expect(r.won, `${g} @ ${bpm}, ${rate}/s, phase ${ph}: ${r.accuracy.toFixed(3)}`).toBe(false);
          }
        }
      }
    }
  });

  it('a masher at twice the beat\'s note rate or faster loses on EVERY grid (the spare taps are misses)', () => {
    for (const bpm of TEMPOS) {
      for (const [g, note] of Object.entries(GRIDS)) {
        const perBar = Array.from({ length: 16 }, (_, i) => i).filter(note).length;
        const noteRate = perBar / (16 * (60 / bpm / 4));
        for (const rate of [4, 6, 8, 12, 20, 30].filter((x) => x >= 2 * noteRate)) {
          for (const ph of PHASES) {
            const r = drive(new PerformSet({ arena: false }), { bars: 8, bpm, note, taps: mash(rate, ph, 8, bpm) });
            expect(r.won, `${g} @ ${bpm}, ${rate}/s, phase ${ph}: ${r.accuracy.toFixed(3)}`).toBe(false);
          }
        }
      }
    }
  });

  it('an EXTRA tap is a miss: notes = hits + misses, the extras inside the misses, and the accuracy divides by them', () => {
    const note = GRIDS.kickSnare;
    const onTime = timesOn(8, 92, note);
    const spare = onTime.map((t) => t + 0.33);                           // one stray tap between every pair of notes
    const r = drive(new PerformSet({ arena: false }), { bars: 8, note, taps: [...onTime, ...spare].sort((a, b) => a - b) });
    expect(r.extras).toBe(32);
    expect(r.misses).toBe(32);                                           // every note hit: the misses are the extras
    expect(r.notes).toBe(r.hits + r.misses);
    expect(r.accuracy).toBeCloseTo((r.perfects + 0.5 * r.goods) / r.notes, 12);
    // every note PERFECT (each stray is 0.32 s before the next note: outside the lock) and one stray per note: exactly C
    expect([r.perfects, r.accuracy, r.grade, r.won]).toEqual([32, 0.5, 'C', true]);
    const two = drive(new PerformSet({ arena: false }), { bars: 8, note, taps: [...onTime, ...spare, ...onTime.map((t) => t + 0.28)].sort((a, b) => a - b) });
    expect([two.extras, two.won]).toEqual([64, false]);                  // two strays a note: under C
    const stats = performResultStats(r);
    expect([stats.notes, stats.misses, stats.extras]).toEqual([r.notes, r.misses, r.extras]);
  });

  it('a hit inside 0.25 s after an EXTRA tap is capped at GOOD (the Cypher\'s spam lock); outside it, PERFECT stands', () => {
    expect(PERFORM_SPAM_LOCK_S).toBe(SPAM_LOCK_SEC);
    const note = (i: number) => i % 16 === 8;                             // one note a bar: nothing else in reach
    const T = LEAD + 8 * STEP_92;
    const locked = drive(new PerformSet({ arena: false }), { bars: 1, note, taps: [T - 0.28, T - 0.05] });
    expect([locked.extras, locked.perfects, locked.goods]).toEqual([1, 0, 1]);   // 50 ms early, 0.23 s after the extra
    const free = drive(new PerformSet({ arena: false }), { bars: 1, note, taps: [T - 0.4, T - 0.05] });
    expect([free.extras, free.perfects, free.goods]).toEqual([1, 1, 0]);         // 0.35 s after it: the lock is gone
  });

  it('only bars that offered a note count toward the 8: silent bars plus one on-time tap is not a set (review: bars 8, S, won)', () => {
    // PLAY on the empty grid, 8 silent bars, one cell on, one tap dead on its note, END SET 20 ms later
    const set = new PerformSet({ arena: false });
    const at = (i: number) => LEAD + i * STEP_92;
    for (let i = 0; i < 128; i++) set.rest(i % 16, at(i), at(i) - 0.1);
    set.note(0, at(128), at(128) - 0.1);
    expect(set.tap(at(128))).toBe('PERFECT');
    const r = set.result(at(128) + 0.02);
    expect([r.bars, r.notes, r.perfects, r.accuracy, r.won]).toEqual([0, 1, 1, 1, false]);
    // a real beat with two silent bars in the middle: 10 bars heard, 8 of them played
    const gap = drive(new PerformSet({ arena: false }), {
      bars: 10, note: (i) => GRIDS.kickSnare(i) && Math.floor(i / 16) !== 3 && Math.floor(i / 16) !== 4,
      taps: timesOn(10, 92, (i) => GRIDS.kickSnare(i) && Math.floor(i / 16) !== 3 && Math.floor(i / 16) !== 4),
    });
    expect([gap.bars, gap.won]).toEqual([8, true]);
    const short = drive(new PerformSet({ arena: false }), {
      bars: 10, note: (i) => GRIDS.kickSnare(i) && Math.floor(i / 16) >= 3,
      taps: timesOn(10, 92, (i) => GRIDS.kickSnare(i) && Math.floor(i / 16) >= 3),
    });
    expect([short.bars, short.won]).toEqual([7, false]);                  // 10 bars long, 7 of them with a note
  });

  it('a late-by-the-speaker tap reads LATE on its own note, never PERFECT on the next 16th (review: 120 ms late read PERFECT)', () => {
    const note = GRIDS.kickSnare;
    const r = drive(new PerformSet({ arena: false }), { bars: 8, note, taps: timesOn(8, 92, note).map((t) => t + 0.12) });
    expect([r.perfects, r.goods, r.extras]).toEqual([0, 32, 0]);
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9); set.rest(1, 1.163, 1.063); set.rest(2, 1.326, 1.226);
    set.tap(1.12);
    set.rest(3, 1.489, 1.389);
    expect(performTapLabel(set.lastTap)).toBe('GOOD · LATE 120ms');
  });
});

describe('P2: the bots (the P1 mechanics drivers, on the judge)', () => {
  const masher = (perSec: number, phase: number, bars = 8): number[] => {
    const out: number[] = [];
    for (let t = phase; t < LEAD + bars * PERFORM_STEPS_PER_BAR * STEP_92; t += 1 / perSec) out.push(t);
    return out;
  };

  it('on the beat beats "offered" (tapping the moment a note is scheduled), and a masher is far under both', () => {
    const onBeat = drive(new PerformSet({ arena: false }), { bars: 8, taps: noteTimes(8) });
    const offered = drive(new PerformSet({ arena: false }), { bars: 8, taps: noteTimes(8).map((t) => t - 0.1 + 1e-6) });
    expect(onBeat.score).toBe(performSetMax(128));
    expect(offered.score).toBeLessThan(onBeat.score);                   // P1: offered 235,700 vs on-beat 10,350
    for (const rate of [4, 8, 12]) {
      for (const ph of [0, 0.03, 0.07]) {
        const m = drive(new PerformSet({ arena: false }), { bars: 8, taps: masher(rate, ph) });
        expect(m.score, `${rate}/s`).toBeLessThan(0.1 * onBeat.score);   // P1: the masher (13,050) beat on-beat (10,350)
      }
    }
  });

  // THE P6 TARGET, pinned the way P1 pinned P2's (it.fails passes while the room still fails it). REWRITTEN in the P2 fix
  // pass (2026-09-25): the old pin drove every 16th as a note (drive()'s default), so no phase-6 change to StudioMode
  // could ever flip it — and with sparse notes it was already false for the wrong reason (EXTRA taps were free, so a
  // mash's first tap in each note's early reach took it as a GOOD: exactly C). Extras are misses now and sparse grids
  // are pinned above as losses for every masher. What ONE lane still cannot do: on a grid that hits nearly every 16th,
  // every tap lands within half a 16th of SOME note, so a steady random tapper near the note rate reads as a sloppy
  // player — measured with drive(): 92 BPM 16ths at 6 taps/s 98 % (S), a dense Cell foundation at 4/s 74 % (B). Phase 6's
  // lanes (kick / snare / hats / Flip) split that stream so each lane is sparse again.
  // MUSIC-SUITE P6 (2026-09-25): FLIPPED — it passes now. The same dense grids as SONGS (a groove with hats on every 16th,
  // and six Cell foundations), the same tappers at the same rates and phases: one stream of steady taps has to go in
  // SOME lane, a lane holds only its part's notes (one per 8th), and a tap in the wrong lane is never a hit. The wider
  // sweep (every lane, 2–12 taps/s, every tempo; a random-lane and a lane-cycling tapper) is in "P6: the steady tapper".
  it('P6: on a dense grid, a steady random tapper near the note rate does not win (lanes split the stream)', () => {
    for (const [g, rate] of [['groove16', 6], ['cell', 4]] as const) {
      for (const [song, lanes] of Object.entries(SONGS).filter(([k]) => k.startsWith(g))) {
        for (const lane of LANES) {
          for (const ph of PHASES) {
            const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, lanes, taps: mash(rate, ph, 8, 92).map((t) => ({ t, lane })) });
            expect(r.won, `${song} lane ${lane} ${rate}/s ${ph}: ${r.accuracy.toFixed(3)}`).toBe(false);
          }
        }
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P6 (2026-09-25): "PERFORM PLAYS YOUR SONG" — four lanes (kick / snare / hats / Flip), a note only where its
// part hits, a tap only in its own lane, one note per lane per 8th, the lock both ways, the band that builds, the recap.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const LANES: readonly PerformLane[] = [0, 1, 2, 3];
/** A bar of rows as the grid holds them: row id → the 16 steps it hits. */
const bar = (on: Record<string, number[]>): Record<string, boolean[]> =>
  Object.fromEntries(Object.entries(on).map(([id, steps]) => [id, Array.from({ length: 16 }, (_, i) => steps.includes(i))]));
/** The lanes the rows starting a sound on grid step i play in (what StudioMode reads off AudioEngine's StepSound.rows). */
const lanesOfRows = (rows: Record<string, boolean[]>) => (i: number): PerformLane[] =>
  performLanesOf(Object.entries(rows).filter(([, p]) => p[i % 16]).map(([id]) => id));
/** The songs: a busy groove (hats on every 16th — the old pin's "sixteenths" as a song) and six Cell foundations. */
const SONGS: Record<string, (i: number) => PerformLane[]> = {
  groove16: lanesOfRows(bar({ hat: Array.from({ length: 16 }, (_, i) => i), kick: [0, 4, 8, 12], snare: [4, 12], bass: [0, 3, 6, 8, 11, 14] })),
  ...Object.fromEntries([1, 7, 42, 99, 1234, 13].map((seed) => [`cell${seed}`, lanesOfRows(cellFoundation(seed))])),
};

/**
 * drive() with LANES: step i is offered `ahead` before it sounds with the lanes whose parts hit on it (PerformSet.step —
 * the 8th cap applies there, as live), windows are swept when each step sounds, and each tap lands in its lane.
 */
function driveLanes(set: PerformSet, o: { bars: number; lanes: (i: number) => PerformLane[]; taps: { t: number; lane: PerformLane }[]; ahead?: number; bpm?: number }): PerformResult {
  const step = 60 / (o.bpm ?? 92) / 4, ahead = o.ahead ?? 0.1;
  const ev: { at: number; kind: 0 | 1 | 2; i: number; lane?: PerformLane }[] = [];
  for (let i = 0; i < o.bars * PERFORM_STEPS_PER_BAR; i++) {
    const t = LEAD + i * step;
    ev.push({ at: t - ahead, kind: 0, i }, { at: t, kind: 2, i });
  }
  for (const tp of o.taps) ev.push({ at: tp.t, kind: 1, i: -1, lane: tp.lane });
  ev.sort((a, b) => a.at - b.at || a.kind - b.kind);
  let last = 0;
  for (const e of ev) {
    last = e.at;
    const t = LEAD + e.i * step;
    if (e.kind === 0) set.step(e.i % PERFORM_STEPS_PER_BAR, t, e.at, o.lanes(e.i));
    else if (e.kind === 1) set.tap(e.at, e.lane!);
    else set.expire(e.at);
  }
  return set.result(last + PERFORM_EXPIRE_S + 0.01);
}
/** Every note the song OFFERS (after the 8th cap), tapped dead on in its own lane — a player who plays all of it. */
function playedNotes(lanes: (i: number) => PerformLane[], bars: number, bpm = 92, keep: (i: number, lane: PerformLane) => boolean = () => true): { t: number; lane: PerformLane }[] {
  const probe = new PerformSet({ arena: false }), step = 60 / bpm / 4, out: { t: number; lane: PerformLane }[] = [];
  for (let i = 0; i < bars * PERFORM_STEPS_PER_BAR; i++) {
    for (const lane of probe.step(i % PERFORM_STEPS_PER_BAR, LEAD + i * step, -Infinity, lanes(i)).lanes) if (keep(i, lane)) out.push({ t: LEAD + i * step, lane });
  }
  return out;
}

describe('P6: four lanes, and a note only where its part hits', () => {
  it('the kit\'s drums have their own lanes; every other row — the Flip rows AND the melody rows — is the fourth', () => {
    expect(PERFORM_LANES).toEqual(['kick', 'snare', 'hats', 'flip']);
    expect(['kick', 'snare', 'clap', 'hat', 'open'].map(performLaneOf)).toEqual([0, 1, 1, 2, 2]);
    // a song with a melody row folds its bass / lead (and the FX) into the Flip lane
    expect(['flip_0', 'flip_12', 'bass', 'lead', 'fx', 'keys', 'anything-new'].map(performLaneOf)).toEqual([3, 3, 3, 3, 3, 3, 3]);
    for (const id of KIT_SLOTS.map((s) => s.id)) expect(LANES, id).toContain(performLaneOf(id));
    expect(performLanesOf(['hat', 'kick', 'open', 'bass', 'lead'])).toEqual([0, 2, 3]);   // each lane once, in lane order
    expect(performLanesOf([])).toEqual([]);
    expect(PERFORM_LANE_COLORS).toHaveLength(4);
    expect(PERFORM_LANE_LABELS).toEqual(['KICK', 'SNARE', 'HATS', 'FLIP']);
    expect([0, 3, 4, -1, 1.5, '1', null].map(isPerformLane)).toEqual([true, true, false, false, false, false, false]);
  });

  it('each lane offers exactly its part\'s hits — a lane whose part never hits has no notes at all', () => {
    // kick on 1 and 3, the snare on 2 and 4, a bass note on the "a" of 2 — no hats, no Flip row
    const lanes = lanesOfRows(bar({ kick: [0, 8], snare: [4, 12], bass: [7] }));
    const r = driveLanes(new PerformSet({ arena: false }), { bars: 2, lanes, taps: [] });
    expect(r.lanes.map((l) => [l.lane, l.notes])).toEqual([[0, 4], [1, 4], [3, 2]]);   // no HATS lane: nothing hits there
    expect(r.notes).toBe(10);
    // a chord (kick + snare on one step) is one note in EACH lane
    const chord = new PerformSet({ arena: false });
    expect(chord.step(0, 1, 0.9, [0, 1]).lanes).toEqual([0, 1]);
    expect(chord.notes).toBe(2);
    expect(chord.step(1, 1.2, 1.1, []).offered).toBe(false);          // nothing hits: a rest
  });

  it('a player who plays every note of the song in its lane scores the perfect set, on every song and tempo', () => {
    for (const bpm of TEMPOS) {
      for (const [song, lanes] of Object.entries(SONGS)) {
        const taps = playedNotes(lanes, 8, bpm);
        const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps });
        expect([r.accuracy, r.grade, r.won, r.extras], `${song} @ ${bpm}`).toEqual([1, 'S', true, 0]);
        expect(r.score, `${song} @ ${bpm}`).toBe(performSetMax(taps.length));
      }
    }
  });
});

describe('P6: a tap belongs to its lane', () => {
  it('a tap in the wrong lane is never a hit: WRONG LANE, a miss — and the note is still a miss if nobody plays it', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, 1.0, 0.9, [1]);                                        // a snare note
    expect(set.tap(1.0, 0)).toBe('WAIT');                               // dead on its time, in the KICK lane (a kick may come)
    set.step(4, 2.0, 1.9, []);                                          // the schedule moves on: no kick came
    expect(set.lastTap).toEqual({ judgement: 'EXTRA', errorSec: null, side: null, lane: 0, wrongLane: true });
    expect(performTapLabel(set.lastTap)).toBe('WRONG LANE');
    const r = set.result(2);
    expect([r.hits, r.perfects, r.goods, r.extras, r.wrongLanes, r.misses, r.notes, r.accuracy]).toEqual([0, 0, 0, 1, 1, 2, 2, 0]);
    expect(r.lanes.map((l) => [l.lane, l.notes, l.misses, l.extras])).toEqual([[0, 1, 1, 1], [1, 1, 1, 0]]);
  });

  it('…its own lane still takes the note inside its window — capped at GOOD (the spam lock): a slip costs, it is not final', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, 1.0, 0.9, [1]);
    set.tap(0.98, 0);                                                   // wrong lane first (it waits: a kick may come)
    set.tap(1.0, 1);                                                    // then the snare, on time
    set.step(4, 2.0, 1.9, []);                                          // the wrong tap settles as an EXTRA 20 ms before the hit…
    expect(set.lastTap).toMatchObject({ judgement: 'EXTRA', lane: 0 }); // (plain EXTRA: the note it went for is taken by now)
    const r = set.result(2);                                            // …so the lock takes the snare's PERFECT back to GOOD
    expect([r.hits, r.goods, r.extras, r.misses, r.notes]).toEqual([1, 1, 1, 1, 2]);
  });

  it('a tap with no note of any lane near is a plain EXTRA TAP (not WRONG LANE)', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, 1.0, 0.9, [2]);
    set.step(4, 3.0, 2.9, []);
    set.tap(2.0, 2);
    expect(performTapLabel(set.lastTap)).toBe('EXTRA TAP');
    expect(set.lastTap?.wrongLane).toBe(false);
  });

  it('a tap takes the nearest note OF ITS LANE even when another lane\'s note is nearer', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, 1.0, 0.9, [0]);                                         // kick at 1.00
    set.step(1, 1.1, 1.0, [2]);                                         // hats at 1.10
    set.tap(1.09, 0);                                                   // 10 ms from the hat, 90 ms after the kick
    set.step(2, 1.2, 1.1, []); set.step(3, 1.3, 1.2, []);              // no nearer kick comes
    expect(set.lastTap?.judgement).toBe('GOOD');                        // the kick, 90 ms late — never the hat
    expect(set.lastTap).toMatchObject({ lane: 0, side: 'LATE' });
    expect(set.lastTap?.errorSec).toBeCloseTo(0.09, 9);
  });

  it('a waiting lane tap adopts only a note of its own lane when the schedule catches up', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, 1.0, 0.9, [0]); set.tap(1.0, 0);                        // kick hit
    expect(set.tap(1.13, 2)).toBe('WAIT');                              // a hats tap, nothing of its lane known yet
    set.step(1, 1.25, 1.15, [0]);                                       // the next note is a KICK: not the tap's
    set.step(2, 1.5, 1.4, [2]);                                         // a hats note, but 370 ms away: out of reach
    expect(set.lastTap).toMatchObject({ judgement: 'EXTRA', lane: 2 });
  });

  it('the P2 one-lane API is unchanged: a note with no lane is any tap\'s, and a tap with no lane takes any note', () => {
    const set = new PerformSet({ arena: false });
    set.note(0, 1.0, 0.9);
    expect(set.tap(1.0, 3)).toBe('PERFECT');
    set.step(0, 2.0, 1.9, [1]);
    expect(set.tap(2.0)).toBe('PERFECT');
    expect(set.lastTap).toEqual({ judgement: 'PERFECT', errorSec: 0, side: null });   // no lane on a lane-less tap's verdict
  });
});

describe('P6: one note per lane per 8th', () => {
  it('performCapLanes: the 16th after a lane\'s note on the 8th offers none in that lane; other lanes and other 8ths are untouched', () => {
    expect(PERFORM_LANE_PAIR_STEPS).toBe(2);
    expect(performCapLanes(1, [2, 0], { stepInBar: 0, lanes: [2] })).toEqual([0]);   // hats capped, the kick is new
    expect(performCapLanes(2, [2], { stepInBar: 1, lanes: [2] })).toEqual([2]);      // a new 8th: never capped
    expect(performCapLanes(1, [2], { stepInBar: 0, lanes: [] })).toEqual([2]);       // nothing on the 8th: the "e" is a note
    expect(performCapLanes(1, [2], { stepInBar: 15, lanes: [2] })).toEqual([2]);     // not the step before (a restart)
    expect(performCapLanes(0, [1, 1, 0], null)).toEqual([0, 1]);                     // each lane once, in order
  });

  it('a part on every 16th charts every 8th (the second 16th still SOUNDS — the chart is not the song)', () => {
    const lanes = lanesOfRows(bar({ hat: Array.from({ length: 16 }, (_, i) => i) }));
    const r = driveLanes(new PerformSet({ arena: false }), { bars: 1, lanes, taps: [] });
    expect(r.notes).toBe(8);
    // across a bar line the cap starts again (step 15 → step 0 is a new 8th)
    const set = new PerformSet({ arena: false });
    set.step(14, 1.0, 0.9, [2]); set.step(15, 1.1, 1.0, [2]); set.step(0, 1.2, 1.1, [2]);
    expect(set.notes).toBe(2);
  });

  it('a curated chart (the Arena\'s house beat) is offered AS CHARTED: chartStep never caps (a snare fill\'s 16ths are meant)', () => {
    const set = new PerformSet({ arena: true });
    for (const [s, t] of [[12, 1.0], [13, 1.1], [14, 1.2], [15, 1.3]] as const) set.chartStep(s, t, t - 0.1, [1]);
    expect(set.notes).toBe(4);
    expect(set.stepCount).toBe(4);
  });
});

describe('P6: the lock both ways', () => {
  it('a PERFECT is taken back to GOOD when an EXTRA lands within 0.25 s AFTER it; outside that it stands', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, 1.0, 0.9, [0]);
    expect(set.tap(1.0, 0)).toBe('PERFECT');
    expect(set.score).toBe(100);
    set.step(4, 2.0, 1.9, []);
    set.tap(1.2, 1);                                                    // a stray snare 200 ms after the hit
    expect([set.score, set.perfects, set.goods, set.extras]).toEqual([50, 0, 1, 1]);
    const far = new PerformSet({ arena: false });
    far.step(0, 1.0, 0.9, [0]); far.tap(1.0, 0);
    far.step(4, 2.0, 1.9, []); far.tap(1.3, 1);                          // 300 ms after: the PERFECT stands
    expect([far.score, far.perfects]).toEqual([100, 1]);
    expect(far.result(3).lanes.find((l) => l.lane === 0)?.perfects).toBe(1);
    expect(set.result(3).lanes.find((l) => l.lane === 0)).toMatchObject({ perfects: 0, goods: 1 });   // the lane's tally follows
  });
});

describe('P6: the steady tapper, the masher and the lane-cycler lose (the pin\'s wider sweep)', () => {
  it('ONE lane, steady at 2–12 taps/s, any phase, any tempo, on every song: never a win (a lane is at most ~40 % of a song)', () => {
    for (const bpm of TEMPOS) {
      for (const [song, lanes] of Object.entries(SONGS)) {
        for (const lane of LANES) {
          for (const rate of [2, 4, 6, 8, 12]) {
            for (const ph of [0, 0.03, 0.07]) {
              const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps: mash(rate, ph, 8, bpm).map((t) => ({ t, lane })) });
              expect(r.won, `${song} @ ${bpm}: lane ${lane} ${rate}/s ${ph} → ${r.accuracy.toFixed(3)}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('a steady tapper on a RANDOM lane each tap never wins; one CYCLING the four lanes locked to the song\'s 16ths is at most a bare C', () => {
    for (const bpm of TEMPOS) {
      for (const [song, lanes] of Object.entries(SONGS)) {
        for (const rate of [4, 6, 8, 12, 16]) {
          let x = rate * 9973;
          const rnd = (): number => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
          const random = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps: mash(rate, 0.05, 8, bpm).map((t) => ({ t, lane: Math.floor(rnd() * 4) as PerformLane })) });
          expect(random.won, `${song} @ ${bpm} random ${rate}/s → ${random.accuracy.toFixed(3)}`).toBe(false);
        }
        // the cycler at exactly one tap per 16th, phase-locked to the grid — K on the beat, S on the "e", H on the "and", F on
        // the "a" is a drum pattern in time, not a random stream. Measured before the lock both ways: 52–54 % (C) at 120
        // BPM; now it wins only exactly at the line, 50.0 %, at 160 BPM (10.7 taps a second) on one Cell foundation, where a
        // 16th (94 ms) is inside the ±80 ms PERFECT window's reach — and it never outscores playing the beat's own notes.
        const honest = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps: playedNotes(lanes, 8, bpm, (i) => i % 4 === 0) });
        for (const ph of [0, 0.02, 0.05]) {
          const step = 60 / bpm / 4;
          const taps = Array.from({ length: 8 * 16 }, (_, k) => ({ t: ph + k * step, lane: (k % 4) as PerformLane }));
          const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps });
          expect(r.accuracy, `${song} @ ${bpm} cycling ${ph}`).toBeLessThanOrEqual(0.5);
          if (bpm < 160) expect(r.won, `${song} @ ${bpm} cycling ${ph} → ${r.accuracy.toFixed(3)}`).toBe(false);
          expect(r.accuracy, `${song} @ ${bpm} cycling ${ph}`).toBeLessThan(honest.accuracy);
        }
      }
    }
  });

  it('four keys on every beat scores LESS than playing only the beat\'s real notes, and never above C', () => {
    // the one masher lanes do not sink outright: a groove's beats hold half its notes, so "everything on the beat" is close
    // to the honest skeleton — measured 43–54 % (C on some Cell foundations at 160 BPM; 59–67 % before the lock both ways)
    // MUSIC-SUITE P6 FIX PASS (2026-09-26): that measure was on the beat only — 50–70 ms EARLY the chord won at 120 BPM too
    // (6 of 7 songs), not only at 160 as said here; see the chord pin below (PERFORM_CHORD_S)
    for (const bpm of TEMPOS) {
      for (const [song, lanes] of Object.entries(SONGS)) {
        const honest = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps: playedNotes(lanes, 8, bpm, (i) => i % 4 === 0) });
        for (const ph of [0, 0.02, 0.05, 0.09]) {
          const step = 60 / bpm / 4;
          const taps = Array.from({ length: 32 }, (_, k) => k).flatMap((k) => LANES.map((lane) => ({ t: ph + k * 4 * step, lane })));
          const m = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps });
          expect(m.accuracy, `${song} @ ${bpm} ${ph}`).toBeLessThan(honest.accuracy);
          expect(m.accuracy, `${song} @ ${bpm} ${ph}`).toBeLessThan(0.7);
        }
      }
    }
  });

  // MUSIC-SUITE P6 FIX PASS (2026-09-26): THE CHORD IS ONE MOMENT (PERFORM_CHORD_S). The review drove this file's
  // driveLanes with four keys pressed together on every quarter, a little early: it WON at 120 BPM on 6 of 7 songs (50–70 ms
  // early, 50.0–52.4 %) and at 160 BPM on 6 of 7 (30–70 ms, up to 55 %) — each key found an off-beat neighbour of its own
  // lane inside ±250 ms. Re-measured before the fix: 59 of 336 cases won; after: 0.
  it('P6 fix pass: four keys pressed together on every beat never win — at any offset from −90 to +50 ms, 60–160 BPM, every song', () => {
    for (const bpm of TEMPOS) {
      const step = 60 / bpm / 4;
      for (const [song, lanes] of Object.entries(SONGS)) {
        for (let k = -9; k <= 5; k++) {
          const off = k / 100;
          const taps = Array.from({ length: 32 }, (_, q) => q).flatMap((q) => LANES.map((lane) => ({ t: LEAD + q * 4 * step + off, lane })));
          const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps });
          expect(r.won, `${song} @ ${bpm} ${off.toFixed(2)} → ${r.accuracy.toFixed(3)}`).toBe(false);
        }
      }
    }
  });

  it('P6 fix pass: an honest chord is untouched — every note of the song, ±60 ms, chords (kick + hat on one step) and all, still wins', () => {
    for (const bpm of TEMPOS) {
      for (const [song, lanes] of Object.entries(SONGS)) {
        for (const shift of [-0.06, 0, 0.06]) {
          const taps = playedNotes(lanes, 8, bpm).map((x) => ({ ...x, t: x.t + shift }));
          expect(taps.some((x, i) => i > 0 && x.t === taps[i - 1].t), `${song}: the song has chords`).toBe(true);
          const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, bpm, lanes, taps });
          expect(r.won, `${song} @ ${bpm} ${shift} → ${r.accuracy.toFixed(3)}`).toBe(true);
          if (shift === 0) expect(r.accuracy, `${song} @ ${bpm}`).toBe(1);
        }
      }
    }
    expect(PERFORM_CHORD_S).toBe(0.03);
  });

  it('P6 fix pass: in a chord, the key whose lane has no note at that moment is an EXTRA (it does not take a neighbour)', () => {
    // kick and snare on 1/2/3/4 of a groove whose snare is on 2 and 4 only: on 1 and 3 the snare key has no note — it was
    // taking the snare 250 ms away (GOOD); now it is an EXTRA, and the kick on that beat still counts
    const lanes = lanesOfRows(bar({ kick: [0, 4, 8, 12], snare: [4, 12] }));
    const step = 60 / 120 / 4;
    const taps = Array.from({ length: 8 }, (_, q) => q).flatMap((q) => ([0, 1] as PerformLane[]).map((lane) => ({ t: LEAD + q * 4 * step, lane })));
    const r = driveLanes(new PerformSet({ arena: false }), { bars: 2, bpm: 120, lanes, taps });
    expect(r.lanes.find((l) => l.lane === 0)).toMatchObject({ hits: 8 });
    expect(r.lanes.find((l) => l.lane === 1)).toMatchObject({ hits: 4, extras: 4 });
  });

  it('a player who plays three of the four parts perfectly still wins (the lanes punish mashing, not a missing part)', () => {
    for (const [song, lanes] of Object.entries(SONGS)) {
      const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, lanes, taps: playedNotes(lanes, 8, 92, (_i, lane) => lane !== 3) });
      expect(r.won, `${song}: ${r.accuracy.toFixed(3)}`).toBe(true);
    }
  });
});

describe('P6: the band builds', () => {
  it('the kick always plays; the first lane you hit joins at once; the others after four hits in a row in their lane', () => {
    expect([PERFORM_BAND_JOIN, PERFORM_BAND_DROP, PERFORM_BAND_FOUNDATION]).toEqual([4, 3, 0]);
    const b = new PerformBand();
    expect(b.parts).toEqual([0]);
    expect(b.levels()).toEqual([1, 0, 0, 0]);
    expect(b.hit(2)).toBe(2);                                           // the hats: the part you're on, in at once
    for (let i = 0; i < 3; i++) expect(b.hit(1)).toBeNull();            // the snare: three in a row…
    expect(b.hit(1)).toBe(1);                                           // …the fourth brings it in
    expect(b.parts).toEqual([0, 2, 1]);
    expect(b.levels()).toEqual([1, 1, 1, 0]);
  });

  it('a lane\'s streak is its own: hits in other lanes between do not break it; a miss IN it does', () => {
    const b = new PerformBand();
    b.hit(0);                                                           // first hit on the kick (already in): nothing joins
    expect(b.parts).toEqual([0]);
    b.hit(3); b.hit(2); b.hit(3); b.hit(2); b.hit(3);                  // Flip ×3, hats ×2, interleaved
    expect(b.has(3)).toBe(false);
    b.miss(3);                                                          // a Flip note missed: its count starts again
    b.hit(3); b.hit(3); b.hit(3);
    expect(b.has(3)).toBe(false);
    b.hit(3);
    expect(b.has(3)).toBe(true);
  });

  it('three misses in a row drop the NEWEST part (last in, first out), then three more the next; the kick never goes', () => {
    const b = new PerformBand();
    b.hit(2);                                                           // hats in (first)
    for (let i = 0; i < 4; i++) b.hit(1);                               // snare in
    for (let i = 0; i < 4; i++) b.hit(3);                               // Flip in
    expect(b.parts).toEqual([0, 2, 1, 3]);
    b.miss(null); b.miss(0);
    expect(b.parts).toEqual([0, 2, 1, 3]);                              // two misses: nothing yet
    expect(b.miss(2)).toBe(3);                                          // the third drops the newest — the Flip
    b.miss(null); b.miss(null);
    expect(b.miss(null)).toBe(1);                                       // three more: the snare
    b.hit(0);                                                           // a hit breaks the run
    b.miss(null); b.miss(null);
    expect(b.parts).toEqual([0, 2]);
    expect(b.miss(null)).toBe(2);
    expect(b.miss(null)).toBeNull();
    for (let i = 0; i < 5; i++) b.miss(null);
    expect(b.parts).toEqual([0]);                                       // the foundation stays
    expect(b.log.map((e) => `${e.kind}${e.lane}`)).toEqual(['join2', 'join1', 'join3', 'drop3', 'drop1', 'drop2']);
  });

  it('a dropped part rejoins the same way (four in a row)', () => {
    const b = new PerformBand();
    b.hit(1); b.miss(null); b.miss(null); b.miss(null);
    expect(b.has(1)).toBe(false);
    for (let i = 0; i < 3; i++) b.hit(1);
    expect(b.has(1)).toBe(false);
    b.hit(1);
    expect(b.has(1)).toBe(true);
  });

  it('the set drives its band: hits join parts, expired notes and EXTRA taps drop them', () => {
    const set = new PerformSet({ arena: false });
    const lanes = lanesOfRows(bar({ kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] }));
    const taps = playedNotes(lanes, 2);
    driveLanes(set, { bars: 2, lanes, taps });
    expect(set.band.parts).toEqual([0, 2, 1]);                          // hats first (bar 1's first non-kick note), snare after four
    const lost = new PerformSet({ arena: false });
    driveLanes(lost, { bars: 4, lanes, taps: playedNotes(lanes, 2) });   // plays two bars, then stops: the misses drop both
    expect(lost.band.parts).toEqual([0]);
    expect(lost.band.log.filter((e) => e.kind === 'drop').map((e) => e.lane)).toEqual([1, 2]);
  });
});

describe('P6: the real recap', () => {
  it('per-lane counts add up to the set\'s; each lane\'s accuracy is the set\'s rule on that lane', () => {
    const lanes = lanesOfRows(bar({ kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14], lead: [7] }));
    // kicks on time, snares 120 ms late (GOOD), hats every other one, the lead never; two stray Flip taps
    const taps = [
      ...playedNotes(lanes, 8, 92, (_i, l) => l === 0),
      ...playedNotes(lanes, 8, 92, (_i, l) => l === 1).map((x) => ({ ...x, t: x.t + 0.12 })),
      ...playedNotes(lanes, 8, 92, (i, l) => l === 2 && i % 8 === 2),
      // (two stray Flip taps with no hit and no Flip note within 0.25 s: between a bar's late snare and the next downbeat)
      { t: LEAD + 14 * STEP_92 + 0.06, lane: 3 as PerformLane }, { t: LEAD + (3 * 16 + 14) * STEP_92 + 0.06, lane: 3 as PerformLane },
    ];
    const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, lanes, taps });
    const sum = (k: 'notes' | 'perfects' | 'goods' | 'misses' | 'extras' | 'hits') => r.lanes.reduce((a, l) => a + l[k], 0);
    expect([sum('notes'), sum('perfects'), sum('goods'), sum('misses'), sum('extras'), sum('hits')]).toEqual([r.notes, r.perfects, r.goods, r.misses, r.extras, r.hits]);
    const by = Object.fromEntries(r.lanes.map((l) => [l.lane, l]));
    expect([by[0].accuracy, by[1].accuracy, by[2].accuracy]).toEqual([1, 0.5, 0.5]);
    expect(by[3]).toMatchObject({ notes: 10, hits: 0, misses: 10, extras: 2, accuracy: 0 });
    for (const l of r.lanes) expect(l.accuracy).toBeCloseTo(performAccuracy(l.perfects, l.goods, l.notes), 12);
  });

  it('the early / late histogram: signed 25 ms bins over the ±250 ms window, every hit counted once', () => {
    expect(PERFORM_HIST_BIN_MS).toBe(25);
    const h = performHistogram([-240, -80, -10, 0, 0, 12, 79, 249, 250, Number.NaN]);
    expect(h).toHaveLength(20);
    expect(h[0]).toEqual({ fromMs: -250, toMs: -225, count: 1 });
    expect(h.find((b) => b.fromMs === -100)?.count).toBe(1);            // −80 is in [−100, −75)
    expect(h.find((b) => b.fromMs === -25)?.count).toBe(1);             // −10
    expect(h.find((b) => b.fromMs === 0)?.count).toBe(3);               // 0, 0, 12
    expect(h[19]).toEqual({ fromMs: 225, toMs: 250, count: 2 });        // 249, and the edge 250 is kept in the last bin
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(9);                 // the NaN is not a hit
  });

  it('a set\'s histogram, mean offset and timing line read the player: consistently 30 ms late = "you drag"', () => {
    const lanes = lanesOfRows(bar({ kick: [0, 4, 8, 12] }));
    const r = driveLanes(new PerformSet({ arena: false }), { bars: 8, lanes, taps: playedNotes(lanes, 8).map((x) => ({ ...x, t: x.t + 0.03 })) });
    expect(r.meanErrorMs).toBeCloseTo(30, 6);
    expect(r.hist.find((b) => b.fromMs === 25)?.count).toBe(32);
    expect(performTimingLine(r.meanErrorMs)).toBe('you drag — 30 ms late on average');
    expect(performTimingLine(-18.4)).toBe('you rush — 18 ms early on average');
    expect(performTimingLine(4)).toBe('dead centre (+4 ms)');
    expect(performTimingLine(null)).toBe('no hits to read your timing from');
    expect([r.maxCombo, r.bars, r.grade]).toEqual([32, 8, 'S']);        // best streak and bars played ride along
  });

  it('the stats: the P2 contract unchanged, plus each played lane\'s accuracy, the WRONG LANE taps and the mean offset', () => {
    const lanes = lanesOfRows(bar({ kick: [0, 8], hat: [4, 12] }));
    const r = driveLanes(new PerformSet({ arena: true }), { bars: 8, lanes, taps: [...playedNotes(lanes, 8, 92, (_i, l) => l === 0), { t: 1.0, lane: 1 }] });
    const stats = performResultStats(r);
    expect(Object.keys(stats).sort()).toEqual(
      ['accuracy', 'arena', 'bars', 'extras', 'goods', 'grade', 'hits', 'maxCombo', 'misses', 'notes', 'perfects', 'kickAcc', 'snareAcc', 'hatsAcc', 'wrongLanes', 'meanErrorMs'].sort());
    expect([stats.kickAcc, stats.snareAcc, stats.hatsAcc]).toEqual([1, 0, 0]);
    expect(stats.flipAcc).toBeUndefined();                              // no Flip part, no Flip taps: no key
    expect(laneStatKey(3)).toBe('flipAcc');
    // a P2 one-lane set's stats are exactly the contract, as before
    const p2 = drive(new PerformSet({ arena: false }), { bars: 1, taps: noteTimes(1) });
    expect(Object.keys(performResultStats(p2)).sort()).toEqual(['accuracy', 'arena', 'bars', 'extras', 'goods', 'grade', 'hits', 'maxCombo', 'misses', 'notes', 'perfects'].sort());
    expect(p2.lanes).toEqual([]);
  });
});

describe('P2: input', () => {
  it('Space and J tap; a modifier (Cmd+J, Ctrl+Space) does not', () => {
    expect(isPerformTapKey({ key: ' ' })).toBe(true);
    expect(isPerformTapKey({ key: 'Unidentified', code: 'Space' })).toBe(true);
    expect(isPerformTapKey({ key: 'j' })).toBe(true);
    expect(isPerformTapKey({ key: 'J' })).toBe(true);
    expect(isPerformTapKey({ key: 'j', metaKey: true })).toBe(false);
    expect(isPerformTapKey({ key: ' ', ctrlKey: true })).toBe(false);
    expect(isPerformTapKey({ key: 'k' })).toBe(false);
  });

  it('P2 fix pass: a held Enter (or Space) on the focused TAP button is ONE tap — its key repeats are cancelled', () => {
    // the browser clicks a focused button on Enter keydown; StudioMode's TAP taps on a detail-0 click and cancels a repeat
    const press = [{ key: 'Enter', repeat: false }, ...Array.from({ length: 20 }, () => ({ key: 'Enter', repeat: true })), { key: 'Enter', repeat: false }];
    const taps = press.filter((e) => !isRepeatedActivation(e)).length;   // a keydown not cancelled clicks, and taps
    expect(taps).toBe(2);                                                // the held press, then a second real press
    expect(isRepeatedActivation({ key: ' ', code: 'Space', repeat: true })).toBe(true);
    expect(isRepeatedActivation({ key: 'Unidentified', code: 'NumpadEnter', repeat: true })).toBe(true);
    expect(isRepeatedActivation({ key: 'j', repeat: true })).toBe(false);   // not a button-activation key
    expect(isRepeatedActivation({ key: 'Enter' })).toBe(false);
    const studio = readFileSync(join(process.cwd(), 'lib/babylon/music/StudioMode.tsx'), 'utf8');
    expect(studio).toContain('onKeyDown={(e) => { if (isRepeatedActivation(e)) e.preventDefault(); }}');
  });

  it('no tap key is a Flip pad key, and no pad key taps', () => {
    for (const k of PERFORM_TAP_KEYS) expect(PAD_KEYS).not.toContain(k);
    for (const k of PAD_KEYS) expect(isPerformTapKey({ key: k }), k).toBe(false);
  });

  it('StudioMode: a lane taps on pointerdown, the keyboard plays the lanes in PERFORM, the Flip keys stay on the FLIP tab', () => {
    const studio = readFileSync(join(process.cwd(), 'lib/babylon/music/StudioMode.tsx'), 'utf8');
    const lanes = readFileSync(join(process.cwd(), 'lib/babylon/music/ui/PerformLanes.tsx'), 'utf8');
    const flipPad = readFileSync(join(process.cwd(), 'lib/babylon/music/FlipPad.tsx'), 'utf8');
    // MUSIC-SUITE P6 (2026-09-25): the one TAP button became four lane pads (ui/PerformLanes) — the same P2 rules on each
    expect(studio).not.toContain('data-qa="perform-tap"');
    expect(lanes).toContain('onPointerDown: (e: React.PointerEvent) => { if (e.button === 0) onLane(lane); },');
    expect(lanes).toContain('onClick: (e: React.MouseEvent) => { if (e.detail === 0) onLane(lane); },');
    expect(lanes).toContain('onKeyDown: (e: React.KeyboardEvent) => { if (isRepeatedActivation(e)) e.preventDefault(); },');
    expect(studio).toContain('onLane={(l) => performLaneTap(l)}');
    // MUSIC-SUITE P4 FIX PASS: and only once the room is on screen (never behind the splash)
    expect(studio).toContain("if (mode !== 'perform' || view !== 'studio' || !roomShown) return;");
    expect(studio).toContain('if (lane !== null) { e.preventDefault(); if (!e.repeat) performLaneTap(lane); return; }');
    expect(studio).toContain('if (isPerformPauseKey(e)) { e.preventDefault(); if (!e.repeat) pauseRef.current(); }');
    // FlipPad's key listener lives in FlipPad, which StudioMode mounts only on the FLIP tab
    expect(flipPad).toMatch(/window\.addEventListener\('keydown', onKey\)/);
    expect(studio).toMatch(/\{view === 'flip' && \(\s*<>[\s\S]*?<FlipPad /);
  });

  it('StudioMode: notes on onStepScheduled, the latency, the result contract, and a Calibrate link that keeps the room', () => {
    const studio = readFileSync(join(process.cwd(), 'lib/babylon/music/StudioMode.tsx'), 'utf8');
    expect(studio).toContain('eng.onStepScheduled = (s, t, sound) => {');
    expect(studio).toContain('performNoteAt(sound) ? set.note(s, t, now) : set.rest(s, t, now)');
    expect(studio).toContain('savedOffsetMs: savedOffsetRef.current, outputLatency: eng.context.outputLatency, baseLatency: eng.context.baseLatency,');
    expect(studio).toContain('won: r.won,');
    expect(studio).toContain('maxCombo: r.maxCombo,');
    expect(studio).toContain('...performResultStats(r)');
    expect(studio).not.toMatch(/^\s*won: score > 0/m);
    // MUSIC-SUITE P2 FIX PASS: a NEW TAB (the same-tab link with ?return= remounted the room on an empty grid — no autosave
    // until phase 3), labelled for an old undated reading the room now ignores
    expect(studio).toContain('<a href="/play/calibrate" target="_blank" rel="noopener noreferrer" data-qa="academy-calibrate"');
    expect(studio).not.toMatch(/href=\{`\/play\/calibrate\?return=/);
    expect(studio).toContain("{calStale ? 'Recalibrate (old reading ignored) ↗' : 'Calibrate ↗'}");
    expect(studio).toContain('return loadRoomCalibration().offsetMs;');
    expect(studio).toContain('data-qa="perform-status"');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MUSIC-SUITE P6 FIX PASS (2026-09-26): PAUSE, the song's own foundation, one missed chord = one miss, the band's desk map.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('P6 fix pass: PAUSE costs nothing it did not play', () => {
  const kickQuarters = lanesOfRows(bar({ kick: [0, 4, 8, 12] }));
  it('the review\'s case: kick hit twice (combo 2), the next note offered, PAUSE, resume 5 s later → no MISS, the combo kept', () => {
    const step = STEP_92, ahead = 0.1;
    const set = new PerformSet({ arena: false });
    const at = (i: number) => LEAD + i * step;
    for (const i of [0, 4]) { set.step(i, at(i), at(i) - ahead, kickQuarters(i)); set.tap(at(i), 0); set.expire(at(i)); }
    expect(set.combo).toBe(2);
    set.step(8, at(8), at(8) - ahead, kickQuarters(8));                // step 8 scheduled (offered), not yet sounded
    const pausedAt = at(8) - 0.05;
    expect(set.pause(pausedAt, 9)).toBe(1);                           // the pause took one open note off the chart
    // resume 5 s later at the top of the bar: the bar's steps come again from 0
    const t0 = pausedAt + 5;
    set.step(0, t0, t0 - ahead, kickQuarters(0));
    expect(set.expire(t0 + 0.5)).toBe(1);                             // (this is the NEW bar's first note, unhit — a real miss)
    const fresh = new PerformSet({ arena: false });
    for (const i of [0, 4]) { fresh.step(i, at(i), at(i) - ahead, kickQuarters(i)); fresh.tap(at(i), 0); fresh.expire(at(i)); }
    fresh.step(8, at(8), at(8) - ahead, kickQuarters(8));
    fresh.pause(pausedAt, 9);
    fresh.step(0, t0, t0 - ahead, kickQuarters(0));
    fresh.tap(t0, 0);
    expect(fresh.expire(t0 + 0.5)).toBe(0);
    expect([fresh.combo, fresh.result(t0 + 1).misses]).toEqual([3, 0]);   // the paused note was never a miss; the combo lived
  });

  it('the bar that plays again after a resume is counted once (the scheduled steps of it come off the set\'s length)', () => {
    const set = new PerformSet({ arena: false });
    for (let i = 0; i < 16 + 6; i++) set.rest(i % 16, LEAD + i * STEP_92, LEAD + i * STEP_92 - 0.1);
    expect(set.bar).toBe(2);
    set.pause(LEAD + 21 * STEP_92, 6);                                // 6 steps of bar 2 were scheduled: they come off
    expect(set.stepCount).toBe(16);
    expect(set.pause(0, 1_000)).toBe(0);                              // rewinding past the start stops at 0
    expect(set.stepCount).toBe(0);
  });

  it('a WAITING tap is decided at the pause, on what was known', () => {
    const set = new PerformSet({ arena: false });
    set.step(0, LEAD, LEAD - 0.1, [0]);
    set.step(1, LEAD + STEP_92, LEAD + STEP_92 - 0.1, []);            // a gap, so the next step's time is known
    expect(set.tap(LEAD + 0.02, 0)).toBe('PERFECT');                  // decided at once (nothing nearer can come)
    set.step(2, LEAD + 2 * STEP_92, LEAD + 2 * STEP_92 - 0.1, [0]);
    const w = set.tap(LEAD + 2 * STEP_92 - 0.2, 0);                   // 200 ms early for the note just offered: it waits or hits
    set.pause(LEAD + 2 * STEP_92 - 0.15, 3);
    expect(['GOOD', 'WAIT']).toContain(w);
    expect(set.result(LEAD + 5).hits).toBe(2);                         // decided on its candidate at the pause
  });
});

describe('P6 fix pass: the band builds on the SONG\'s foundation', () => {
  it('performFoundationFor: the kick when it has notes, else the lowest lane with notes, else none (every part in)', () => {
    expect(performFoundationFor([0, 1, 2])).toBe(0);
    expect(performFoundationFor([2, 1])).toBe(1);
    expect(performFoundationFor([3])).toBe(3);
    expect(performFoundationFor([])).toBeNull();
    expect(performLanesWithNotes([{ sampleId: 'kick', pattern: [false, false] }, { sampleId: 'hat', pattern: [true] }, { sampleId: 'flip_2', pattern: [false, true] }])).toEqual([2, 3]);
  });

  it('a kickless song (hats + snare + bass) starts with a part IN at PLAY — it started in silence', () => {
    const rows = [{ sampleId: 'hat', pattern: [true, false, true, false] }, { sampleId: 'snare', pattern: [false, false, false, true] }, { sampleId: 'bass', pattern: [true, false, false, false] }];
    const set = new PerformSet({ arena: false, foundation: performFoundationFor(performLanesWithNotes(rows)) });
    expect(set.band.foundation).toBe(1);
    expect(set.band.levels()).toEqual([0, 1, 0, 0]);
    expect(set.band.levels().some((l) => l === 1)).toBe(true);
    const flipOnly = new PerformSet({ arena: false, foundation: performFoundationFor(performLanesWithNotes([{ sampleId: 'flip_0', pattern: [true] }])) });
    expect(flipOnly.band.levels()).toEqual([0, 0, 0, 1]);            // a chop-only Flip beat: its FLIP lane is the pulse
    const none = new PerformBand(null);
    expect([none.levels(), none.parts, none.hit(2), none.miss(0), none.missChord([0, 1, 2])]).toEqual([[1, 1, 1, 1], [0, 1, 2, 3], null, null, null]);
    expect(new PerformSet({ arena: false }).band.foundation).toBe(0); // no foundation given: the kick, as before
  });

  it('the hint says the song\'s own foundation', () => {
    expect(performFoundationHint(0)).toMatch(/the kick alone/);
    expect(performFoundationHint(2)).toMatch(/the hats alone/);
    expect(performFoundationHint(null)).toMatch(/whole song plays/);
  });

  it('one missed CHORD is one miss in a row, not three (the header\'s promise); three missed moments still drop', () => {
    const b = new PerformBand();
    b.hit(2); for (let i = 0; i < 4; i++) b.hit(1);
    expect(b.parts).toEqual([0, 2, 1]);
    expect(b.missChord([0, 2, 3])).toBeNull();                        // kick + hats + Flip on one downbeat
    expect(b.parts).toEqual([0, 2, 1]);
    b.missChord([1]);
    expect(b.missChord([2])).toBe(1);                                  // the third missed moment drops the newest
    // …and the set feeds it by moment: a three-lane chord expiring unhit
    const set = new PerformSet({ arena: false });
    set.step(0, LEAD, LEAD - 0.1, [0]); set.tap(LEAD, 0);
    for (let i = 1; i <= 4; i++) { set.step(i * 2, LEAD + i * 2 * STEP_92, LEAD + i * 2 * STEP_92 - 0.1, [2]); set.tap(LEAD + i * 2 * STEP_92, 2); }
    expect(set.band.parts).toEqual([0, 2]);
    const t = LEAD + 12 * STEP_92;
    set.step(12, t, t - 0.1, [0, 2, 3]);
    expect(set.expire(t + 0.3)).toBe(3);                               // three notes missed…
    expect(set.band.parts).toEqual([0, 2]);                            // …one moment: nothing dropped
  });

  it('the desk map: each row at its lane\'s level; the takes follow the Flip lane when the song has Flip notes, else are in', () => {
    const levels = [1, 0, 1, 0];
    expect(performBandMap(['kick', 'snare', 'hat', 'flip_0', 'bass'], levels)).toEqual({ kick: 1, snare: 0, hat: 1, flip_0: 0, bass: 0 });
    expect(performBandMap(['kick'], levels, { takesId: '__takes', flipHasNotes: true })).toEqual({ kick: 1, __takes: 0 });
    expect(performBandMap(['kick'], [1, 0, 0, 1], { takesId: '__takes', flipHasNotes: true })).toEqual({ kick: 1, __takes: 1 });
    expect(performBandMap(['kick'], levels, { takesId: '__takes', flipHasNotes: false })).toEqual({ kick: 1, __takes: 1 });
  });

  it('the band is on the desk only while a free-play set RUNS on the STUDIO view (the FLIP tab and a stopped set hear every pad)', () => {
    expect(performBandLive({ mode: 'perform', running: true, view: 'studio', arena: false })).toBe(true);
    expect(performBandLive({ mode: 'perform', running: false, view: 'studio', arena: false })).toBe(false);   // before PLAY / paused
    expect(performBandLive({ mode: 'perform', running: true, view: 'flip', arena: false })).toBe(false);      // on FLIP
    expect(performBandLive({ mode: 'build', running: true, view: 'studio', arena: false })).toBe(false);
    expect(performBandLive({ mode: 'perform', running: true, view: 'studio', arena: true })).toBe(false);     // the house beat plays whole
  });
});
