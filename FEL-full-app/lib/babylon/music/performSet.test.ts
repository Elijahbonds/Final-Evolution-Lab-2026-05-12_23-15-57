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
} from './performSet';

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
    expect(free.score).toBe(arena.score);
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
