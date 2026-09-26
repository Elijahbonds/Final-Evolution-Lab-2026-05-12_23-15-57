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
    set.tap(t);
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
    expect([set.score, set.combo, set.extras]).toEqual([before, 0, 1]);
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
  it.fails('P6: on a dense grid, a steady random tapper near the note rate does not win (lanes split the stream)', () => {
    for (const [g, rate] of [['sixteenths', 6], ['cell', 4]] as const) {
      for (const ph of PHASES) {
        expect(drive(new PerformSet({ arena: false }), { bars: 8, note: GRIDS[g], taps: mash(rate, ph, 8, 92) }).won, `${g} ${rate}/s ${ph}`).toBe(false);
      }
    }
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

  it('StudioMode: TAP fires on pointerdown, the keyboard taps in PERFORM, the Flip keys stay on the FLIP tab', () => {
    const studio = readFileSync(join(process.cwd(), 'lib/babylon/music/StudioMode.tsx'), 'utf8');
    const flipPad = readFileSync(join(process.cwd(), 'lib/babylon/music/FlipPad.tsx'), 'utf8');
    expect(studio).toContain("onPointerDown={(e) => { if (e.button === 0) performTap(); }}");
    expect(studio).toContain("onClick={(e) => { if (e.detail === 0) performTap(); }}>TAP</button>");
    expect(studio).not.toContain('onClick={performTap}');                // the release is not the tap
    // MUSIC-SUITE P4 FIX PASS: and only once the room is on screen (never behind the splash)
    expect(studio).toContain("if (mode !== 'perform' || view !== 'studio' || !roomShown) return;");
    expect(studio).toContain('if (!e.repeat) performTap();');
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
