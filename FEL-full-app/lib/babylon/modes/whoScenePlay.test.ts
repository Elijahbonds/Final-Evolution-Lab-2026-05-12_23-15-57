// IMPROVE (2026-10-06): Spot the Scene's pure rules from the owner-picked pass (whoScenePlay.ts).
import { describe, expect, it } from 'vitest';
import {
  armRival, canSkipReveal, comparedRun, pickAutoStarts, recapRows, REVEAL_SKIP_S, rivalChoice, roundVenues, SCENE_RIVAL,
  SCENE_ZOOM, tickSecond, venueNeededFrom, zoomShare,
} from './whoScenePlay';
import { WHO_SCENE_IT, type QuizQuestion } from '../core/QuizCore';
import type { SceneRound } from '../core/SceneBuzz';
import { SCENE_CATEGORIES } from '../core/SceneBuzz';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
const q = (id: string, venue?: string): QuizQuestion => ({
  id, prompt: '?', difficulty: 1, sceneVenueId: venue, answer: 'b',
  options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
});
const round = (...qs: QuizQuestion[]): SceneRound => ({ category: SCENE_CATEGORIES[0], questions: qs });

describe('#5 skipping the reveal', () => {
  it('refuses inside the beat, allows after it, and never when no reveal is up', () => {
    expect(canSkipReveal(1.5, 1.5)).toBe(false);
    expect(canSkipReveal(1.5 - REVEAL_SKIP_S + 0.01, 1.5)).toBe(false);
    expect(canSkipReveal(1.5 - REVEAL_SKIP_S, 1.5)).toBe(true);
    expect(canSkipReveal(0.1, 1.5)).toBe(true);
    expect(canSkipReveal(0, 1.5)).toBe(false);
  });
});

describe('#6 the pick screen', () => {
  it('starts itself only with no pad', () => {
    expect(pickAutoStarts(true, 0)).toBe(true);
    expect(pickAutoStarts(true, 1)).toBe(false);
    expect(pickAutoStarts(false, 0)).toBe(false);
  });
});

describe('#7 the CPU rival', () => {
  it('stays out of compared runs', () => {
    expect(comparedRun('?arena=x')).toBe(true);
    expect(comparedRun('?mp=1')).toBe(true);
    expect(comparedRun('?c=abc')).toBe(true);
    expect(comparedRun('?players=1')).toBe(false);
    expect(comparedRun('')).toBe(false);
    expect(comparedRun(null)).toBe(false);
  });
  it('commits inside QuizRound\'s window and is right at its skill rate', () => {
    const lo = WHO_SCENE_IT.timeLimit * 0.15, hi = WHO_SCENE_IT.timeLimit * (1 - SCENE_RIVAL.speed * 0.7);
    expect(armRival(WHO_SCENE_IT, seq(0, 0)).at).toBeCloseTo(lo);
    expect(armRival(WHO_SCENE_IT, seq(0.999999, 0)).at).toBeCloseTo(hi, 3);
    expect(armRival(WHO_SCENE_IT, seq(0.5, SCENE_RIVAL.skill - 0.01)).right).toBe(true);
    expect(armRival(WHO_SCENE_IT, seq(0.5, SCENE_RIVAL.skill)).right).toBe(false);
    // it never answers after the clock
    for (let i = 0; i < 50; i++) expect(armRival(WHO_SCENE_IT, Math.random).at).toBeLessThan(WHO_SCENE_IT.timeLimit);
  });
  it('presses the right card when right, and a wrong one when wrong', () => {
    const question = q('q1');
    expect(rivalChoice(question, true, seq(0.9))).toBe(1);
    for (const r of [0, 0.34, 0.67, 0.999]) {
      const i = rivalChoice(question, false, seq(r));
      expect(i).not.toBe(1);
      expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(4);
    }
  });
});

describe('#8 tight to wide', () => {
  it('opens at the start share, widens monotonically, and is full by wideAt of the clock', () => {
    const T = WHO_SCENE_IT.timeLimit;
    expect(zoomShare(0, T)).toBeCloseTo(SCENE_ZOOM.start);
    let last = 0;
    for (let s = 0; s <= T; s += 0.5) { const z = zoomShare(s, T); expect(z).toBeGreaterThanOrEqual(last); last = z; }
    expect(zoomShare(T * SCENE_ZOOM.wideAt, T)).toBeCloseTo(1);
    expect(zoomShare(T, T)).toBe(1);
  });
});

describe('#12 the last three seconds', () => {
  it('ticks once on each of 3, 2, 1 and on nothing else', () => {
    const ticks: number[] = [];
    for (let c = 14, dt = 1 / 60; c > 0; c -= dt) { const s = tickSecond(c, c - dt); if (s !== null) ticks.push(s); }
    expect(ticks).toEqual([3, 2, 1]);
    expect(tickSecond(0.01, -0.01)).toBeNull();
  });
});

describe('#15 the recap', () => {
  it('names each venue, who took it and how fast', () => {
    expect(recapRows([
      { venue: 'Neon Cage', by: 'P1', sec: 3.24, points: 230 },
      { venue: 'The Pit', by: null, sec: null, points: 0 },
    ])).toEqual([
      { name: 'Neon Cage', line: 'P1 · 3.2 s', score: 230 },
      { name: 'The Pit', line: 'nobody', score: 0 },
    ]);
  });
});

describe('#17 the venues a match needs', () => {
  const rounds = [round(q('1', 'a'), q('2', 'b')), round(q('3', 'a'), q('4'))];
  it('lists each venue once, in first-use order, with the fallback for a venue-less question', () => {
    expect(roundVenues(rounds, 'vault')).toEqual(['a', 'b', 'vault']);
  });
  it('keeps a venue while the current or a later question asks about it', () => {
    expect(venueNeededFrom(rounds, 0, 0, 'a', 'vault')).toBe(true);
    expect(venueNeededFrom(rounds, 0, 1, 'a', 'vault')).toBe(true);    // round 2 asks 'a' again
    expect(venueNeededFrom(rounds, 1, 1, 'a', 'vault')).toBe(false);
    expect(venueNeededFrom(rounds, 0, 1, 'b', 'vault')).toBe(true);
    expect(venueNeededFrom(rounds, 1, 0, 'b', 'vault')).toBe(false);
    expect(venueNeededFrom(rounds, 1, 1, 'vault', 'vault')).toBe(true);
  });
});
