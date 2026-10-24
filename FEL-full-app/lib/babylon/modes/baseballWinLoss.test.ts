// BASEBALL-FEEL win/loss (BASEBALL-FEEL-WINLOSS-REVIEW-2026-10-23.md §1): BB-20..BB-23, headless against baseballGame.ts
// and baseballSlots.ts. WIN at runs ≥ the saved best, LOSS below it; GHOST_RUNS stands in for the best in the first game.

import { describe, expect, it } from 'vitest';
import { BaseballGame, GHOST_RUNS, baseballOutcome, baseballResult, crossSec, gradeSwing, loadBaseballBest, saveBaseballBestIfHigher, BASEBALL_BEST_KEY, type BaseballResult, type SwingKind } from './baseballGame';
import { pitchSpec, PITCH_RELEASE_SEC } from './baseballPitch';
import { BaseballSlots } from './baseballSlots';
import { chooseBaseballClip, type BaseballAnimState } from '../anim/baseballTree';

const DT = 1 / 60;
const offsetFor = (kind: SwingKind | 'take', speed: number): number | null => {
  if (kind === 'take') return null;
  if (kind === 'whiff') return -0.4;
  const p = { speed, label: 'FB' };
  const cross = crossSec(p, PITCH_RELEASE_SEC);
  for (let o = 0; o <= 0.15; o += 0.001) for (const s of [o, -o]) if (gradeSwing(cross + s, p, PITCH_RELEASE_SEC).kind === kind) return s;
  throw new Error(`no offset for ${kind}`);
};

/** A seeded game against `best`; the batter's slot every frame, and its beats after the last press. */
function play(best: number | null, script: (SwingKind | 'take')[], seed = 7) {
  const slots = new BaseballSlots(PITCH_RELEASE_SEC);
  let end: BaseballResult | null = null, result: BaseballResult | null = null;
  const states: BaseballAnimState[] = []; let lastPressFrame = -1;
  const game = new BaseballGame({
    windup: (p) => slots.windup(p), release: () => {}, swing: (g) => slots.swing(g), contact: (g) => slots.contact(g),
    strikeout: () => slots.strikeout(), scored: (r) => slots.scored(r), result: (r) => { result = r; slots.gameOver(r.outcome); },
    banner: () => {}, hud: () => {}, end: (r) => { end = r; },
  }, (n) => pitchSpec(n, seed), PITCH_RELEASE_SEC, best);
  game.start();
  let pressAt: number | null = null, pitchNo = 0;
  for (let i = 0; i < 60 * 900 && !end; i++) {
    if (game.phase === 'pitch' && game.pitchNo !== pitchNo && game.pitch) {
      pitchNo = game.pitchNo;
      const o = offsetFor(script[(pitchNo - 1) % script.length], game.pitch.speed);
      pressAt = o == null ? null : crossSec(game.pitch, PITCH_RELEASE_SEC) + o;
    }
    if (pressAt != null && game.phase === 'pitch' && game.pitchSec >= pressAt) { game.press(); pressAt = null; lastPressFrame = states.length; }
    game.tick(DT);
    states.push(chooseBaseballClip(slots.tick(DT).batter).state);
  }
  for (let i = 0; i < 60 * 4; i++) states.push(chooseBaseballClip(slots.tick(DT).batter).state);   // let the last beats play out
  const beats: BaseballAnimState[] = [];
  for (let i = Math.max(0, lastPressFrame); i < states.length; i++) if (states[i] !== states[i - 1]) beats.push(states[i]);
  return { end: end as BaseballResult | null, result: result as BaseballResult | null, beats, game };
}
const lastBeat = (beats: BaseballAnimState[]) => beats.filter((b) => b !== 'stance').at(-1);

describe('win/loss rule', () => {
  it('WIN at runs ≥ the best (a new or matched best), LOSS below; GHOST_RUNS (≥ 1) when no best is saved', () => {
    expect(GHOST_RUNS).toBeGreaterThanOrEqual(1);
    expect(baseballOutcome(3, 3)).toBe('win'); expect(baseballOutcome(4, 3)).toBe('win'); expect(baseballOutcome(2, 3)).toBe('loss');
    expect(baseballOutcome(GHOST_RUNS, null)).toBe('win'); expect(baseballOutcome(GHOST_RUNS - 1, null)).toBe('loss');
    const r = baseballResult({ runs: 5, hits: 6, homers: 1, strikeouts: 2, outs: 9, pitches: 30, innings: 3 }, 9);
    expect(r).toMatchObject({ outcome: 'loss', score: 5 });
  });
  it('the best lives in localStorage only (the football pattern): read, kept when beaten or first set, never lowered', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    expect(loadBaseballBest(store)).toBeNull();
    expect(saveBaseballBestIfHigher(0, store)).toBe(true); expect(loadBaseballBest(store)).toBe(0);
    expect(saveBaseballBestIfHigher(4, store)).toBe(true); expect(saveBaseballBestIfHigher(3, store)).toBe(false);
    expect(m.get(BASEBALL_BEST_KEY)).toBe('4');
    expect(loadBaseballBest(null)).toBeNull();
  });
});

describe('BB-20 a seeded game that beats the saved best ends win, last batter beat celebrate', () => {
  it('win', () => {
    const r = play(1, ['homer', 'single', 'whiff']);
    expect(r.end!.score).toBeGreaterThanOrEqual(1);
    expect(r.end!.outcome).toBe('win');
    expect(r.result).toStrictEqual(r.end);
    expect(lastBeat(r.beats)).toBe('celebrate');
  });
});

describe('BB-21 a seeded game below the best ends loss, last beat dejected', () => {
  it('loss', () => {
    const r = play(50, ['homer', 'single', 'whiff']);
    expect(r.end!.score).toBeLessThan(50);
    expect(r.end!.outcome).toBe('loss');
    expect(lastBeat(r.beats)).toBe('dejected');
  });
});

describe('BB-22 the first game with 0 runs is a loss', () => {
  it('no best saved, 0 runs → loss (against GHOST_RUNS)', () => {
    const r = play(null, ['whiff']);
    expect(r.end!.score).toBe(0);
    expect(r.end!.outcome).toBe('loss');
  });
});

describe('BB-23 a last-out strikeout on a losing game plays dejected exactly once', () => {
  it('one dejected beat after the final swing, not two', () => {
    const r = play(null, ['whiff']);
    expect(r.end!.outcome).toBe('loss');
    expect(r.beats.filter((b) => b === 'dejected')).toHaveLength(1);
  });
});
