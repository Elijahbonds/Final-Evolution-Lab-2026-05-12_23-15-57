import { describe, expect, it } from 'vitest';
import { REPLAY_WINDOW_S } from '../scene/ReplayDirector';
import {
  HOOPS_REPLAY_CAP, HOOPS_REPLAY_EVERY, HoopsMomentLog, HoopsReplayPlanner, MOMENT_LEAD_S, MOMENT_MAX_AGE_S, RECORDER_WINDOW_S, REPLAY_MAX_S, REPLAY_MIN_S,
  momentOfReport, replayLength,
} from './hoopsMoments';

describe('what the momentum bus says is a moment', () => {
  it('maps the basketball kinds and ignores the rest', () => {
    expect(momentOfReport({ kind: 'posterize' })).toBe('poster');
    expect(momentOfReport({ kind: 'ankle_break' })).toBe('ankles');
    expect(momentOfReport({ kind: 'block' })).toBe('block');
    expect(momentOfReport({ kind: 'highlight_dunk' })).toBe('dunk');
    expect(momentOfReport({ kind: 'big_make' })).toBeNull();
    expect(momentOfReport({ kind: 'miss' })).toBeNull();
    expect(momentOfReport({ kind: 'turnover' })).toBeNull();
  });
  it('3v3 reports a drift that broke an ankle as a heavy clean_hit; a light clean_hit is not a moment', () => {
    expect(momentOfReport({ kind: 'clean_hit', weight: 14 })).toBe('ankles');
    expect(momentOfReport({ kind: 'clean_hit', weight: 9 })).toBeNull();
    expect(momentOfReport({ kind: 'clean_hit' })).toBeNull();
  });
});

describe('the recorder window the planner assumes is the recorder window', () => {
  it('RECORDER_WINDOW_S equals the replay director\'s buffer', () => { expect(RECORDER_WINDOW_S).toBe(REPLAY_WINDOW_S); });
  it('the longest replay fits the buffer; the lead is inside it', () => { expect(REPLAY_MAX_S).toBeLessThanOrEqual(REPLAY_WINDOW_S); expect(MOMENT_LEAD_S + MOMENT_MAX_AGE_S).toBeLessThan(REPLAY_WINDOW_S); });
});

describe('the possession\'s best moment', () => {
  it('picks the heaviest, the latest of equals, and never an old one', () => {
    const l = new HoopsMomentLog();
    l.note('ankles', 10); l.note('poster', 11); l.note('block', 12);
    expect(l.best(12.5)?.kind).toBe('poster');
    l.clear(); l.note('block', 10); l.note('ankles', 11);
    expect(l.best(11.5)?.kind).toBe('ankles');   // equal weight: the later one
    expect(l.best(11 + MOMENT_MAX_AGE_S + 0.1)).toBeNull();   // fell out of the window
  });
  it('a steal alone is not worth a replay', () => { const l = new HoopsMomentLog(); l.note('steal', 5); expect(l.best(5.5)).toBeNull(); });
  it('a moment that has not happened yet is not picked (clock skew)', () => { const l = new HoopsMomentLog(); l.note('poster', 9); expect(l.best(8)).toBeNull(); });
});

describe('replay length', () => {
  it('runs from the lead before the moment to now, between the floor and the buffer', () => {
    expect(replayLength(10, 12)).toBeCloseTo(2 + MOMENT_LEAD_S, 5);
    expect(replayLength(10, 10.2)).toBe(REPLAY_MIN_S);
    expect(replayLength(0, 100)).toBe(REPLAY_MAX_S);
  });
});

describe('the planner at a dead ball', () => {
  const play = (p: HoopsReplayPlanner, kind: Parameters<HoopsMomentLog['note']>[0], at: number, now: number, opts = {}) => { p.log.note(kind, at); return p.atDeadBall(now, opts); };
  it('replays the first worthy moment at once, ending now', () => {
    const p = new HoopsReplayPlanner();
    const r = play(p, 'ankles', 10, 12);
    expect(r).toEqual({ kind: 'ankles', lastSeconds: replayLength(10, 12), endAt: 12 });
    expect(p.count).toBe(1);
  });
  it('NEVER replays the moment that ends the match, and the moment is spent', () => {
    const p = new HoopsReplayPlanner();
    expect(play(p, 'poster', 10, 11, { final: true })).toBeNull();
    expect(p.log.size).toBe(0);
    expect(p.count).toBe(0);
  });
  it('never in reduced motion', () => { const p = new HoopsReplayPlanner(); expect(play(p, 'poster', 10, 11, { reduced: true })).toBeNull(); });
  it('nothing noted, nothing replayed', () => { expect(new HoopsReplayPlanner().atDeadBall(5)).toBeNull(); });
  it('paces: at least HOOPS_REPLAY_EVERY dead balls apart', () => {
    const p = new HoopsReplayPlanner();
    let t = 100, plays = 0, replays = 0;
    for (let i = 0; i < 12; i++) { t += 9; plays++; if (play(p, 'block', t - 1, t)) replays++; }
    expect(replays).toBeLessThanOrEqual(Math.ceil(plays / HOOPS_REPLAY_EVERY));
    expect(replays).toBeGreaterThan(1);
  });
  it('caps a run', () => {
    const p = new HoopsReplayPlanner();
    let t = 0, replays = 0;
    for (let i = 0; i < 60; i++) { t += 9; if (play(p, 'poster', t - 1, t)) replays++; }
    expect(replays).toBe(HOOPS_REPLAY_CAP);
  });
  it('a rematch starts clean', () => {
    const p = new HoopsReplayPlanner();
    let t = 0; for (let i = 0; i < 60; i++) { t += 9; play(p, 'poster', t - 1, t); }
    p.reset();
    expect(play(p, 'poster', t + 8, t + 9)).not.toBeNull();
  });
});
