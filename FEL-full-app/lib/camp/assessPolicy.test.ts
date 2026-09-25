import { describe, expect, it } from 'vitest';
import { ASSESS_POLICY, attemptGate, describeGate, discloseResult, type AttemptRow } from './assessPolicy';
import { CURRICULUM_VERSION } from '../curriculum/blueprint';

// HOTFIX (2026-09-24): the certification gate — cooldown, cap, and what a result may say — as pure helpers.

const NOW = new Date('2026-09-24T12:00:00Z');
const S = 1000, M = 60 * S, H = 60 * M;
const fail = (agoMs: number, version = CURRICULUM_VERSION): AttemptRow => ({ earnedAt: new Date(NOW.getTime() - agoMs), passed: false, curriculumVersion: version });
const pass = (agoMs: number, version = CURRICULUM_VERSION): AttemptRow => ({ ...fail(agoMs, version), passed: true });

describe('the policy is the old education contract, plus a cap', () => {
  it('300 s cooldown, 3 attempts per 24 h', () => {
    expect(ASSESS_POLICY).toEqual({ cooldownSec: 300, cap: 3, windowSec: 86_400 });
    expect(Object.isFrozen(ASSESS_POLICY)).toBe(true);
  });
});

describe('attemptGate — cooldown', () => {
  it('a first attempt is open, with the full allowance', () => {
    expect(attemptGate([], NOW)).toEqual({ open: true, reason: null, retryAfterSec: null, attemptsLeft: 3 });
  });

  it('a miss ten seconds ago closes the module for the rest of the 300 s', () => {
    expect(attemptGate([fail(10 * S)], NOW)).toEqual({ open: false, reason: 'cooldown', retryAfterSec: 290, attemptsLeft: 2 });
  });

  it('the cooldown ends exactly at 300 s', () => {
    expect(attemptGate([fail(300 * S - 1)], NOW)).toMatchObject({ open: false, reason: 'cooldown', retryAfterSec: 1 });
    expect(attemptGate([fail(300 * S)], NOW)).toEqual({ open: true, reason: null, retryAfterSec: null, attemptsLeft: 2 });
  });

  it('only the most recent miss sets the cooldown', () => {
    expect(attemptGate([fail(2 * H), fail(60 * S)], NOW)).toMatchObject({ reason: 'cooldown', retryAfterSec: 240, attemptsLeft: 1 });
  });

  it('a row stamped in the future (clock skew) never stretches the cooldown past 300 s', () => {
    expect(attemptGate([fail(-30 * S)], NOW)).toMatchObject({ reason: 'cooldown', retryAfterSec: 300 });
  });

  it('rows may carry ISO strings or epoch numbers (what JSON and Prisma hand back)', () => {
    const iso = { earnedAt: new Date(NOW.getTime() - 10 * S).toISOString(), passed: false, curriculumVersion: CURRICULUM_VERSION };
    const num = { earnedAt: NOW.getTime() - 10 * S, passed: false, curriculumVersion: CURRICULUM_VERSION };
    expect(attemptGate([iso], NOW)).toMatchObject({ reason: 'cooldown', retryAfterSec: 290 });
    expect(attemptGate([num], NOW)).toMatchObject({ reason: 'cooldown', retryAfterSec: 290 });
  });
});

describe('attemptGate — cap per rolling window', () => {
  it('three misses in 24 h close the module until the oldest leaves the window', () => {
    const g = attemptGate([fail(20 * H), fail(10 * H), fail(1 * H)], NOW);
    expect(g).toEqual({ open: false, reason: 'attempt_cap', retryAfterSec: 4 * 3600, attemptsLeft: 0 });
  });

  it('with more attempts than the cap in the window, it waits for enough of them to leave', () => {
    // four in the window (a race, or a lowered cap): count must drop to 2 before a 3rd is allowed → the
    // SECOND oldest has to leave, at 24 h after it was made
    const g = attemptGate([fail(23 * H), fail(22 * H), fail(2 * H), fail(1 * H)], NOW);
    expect(g).toMatchObject({ reason: 'attempt_cap', retryAfterSec: 2 * 3600, attemptsLeft: 0 });
  });

  it('an attempt older than the window does not count', () => {
    expect(attemptGate([fail(25 * H), fail(10 * H), fail(1 * H)], NOW)).toEqual({ open: true, reason: null, retryAfterSec: null, attemptsLeft: 1 });
  });

  it('when both bind, the longer wait is the one quoted', () => {
    // cap frees in 30 s (oldest at 23h59m30s), but the last miss was 10 s ago: the cooldown is the real wait
    const g = attemptGate([fail(24 * H - 30 * S), fail(5 * H), fail(10 * S)], NOW);
    expect(g).toMatchObject({ open: false, reason: 'cooldown', retryAfterSec: 290 });
    // and the other way round: cooldown long over, cap frees in 4 h
    expect(attemptGate([fail(20 * H), fail(10 * H), fail(1 * H)], NOW).reason).toBe('attempt_cap');
  });

  it('a nonsense cap of 0 is treated as 1, never as "closed forever" or a crash', () => {
    const policy = { ...ASSESS_POLICY, cap: 0 };
    expect(attemptGate([], NOW, CURRICULUM_VERSION, policy)).toMatchObject({ open: true, attemptsLeft: 1 });
    expect(attemptGate([fail(1 * H)], NOW, CURRICULUM_VERSION, policy)).toMatchObject({ open: false, reason: 'attempt_cap', retryAfterSec: 23 * 3600 });
  });
});

describe('attemptGate — passes and versions', () => {
  it('a pass on the current version closes the module for good', () => {
    expect(attemptGate([fail(2 * H), pass(1 * H)], NOW)).toEqual({ open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 });
  });

  it('a pass or misses on an OLD version neither lock nor ration the new paper', () => {
    const old = '2020.01';
    expect(attemptGate([pass(1 * H, old), fail(2 * H, old), fail(3 * H, old), fail(10 * S, old)], NOW))
      .toEqual({ open: true, reason: null, retryAfterSec: null, attemptsLeft: 3 });
  });
});

describe('discloseResult — per-question flags only on a pass', () => {
  const graded = [
    { questionKey: 'a', chosen: 2, correct: true },
    { questionKey: 'b', chosen: 0, correct: false },
  ];

  it('a fail says the score and the counts, and nothing about which answers were wrong', () => {
    const r = discloseResult({ score: 50, passed: false, correct: 1, total: 2, graded });
    expect(r).toEqual({ score: 50, passed: false, correct: 1, total: 2 });
    expect(JSON.stringify(r)).not.toMatch(/questionKey|chosen|"a"|"b"/);
  });

  it('a pass adds which of YOUR answers were right — never the chosen index, never the correct option', () => {
    const r = discloseResult({ score: 100, passed: true, correct: 2, total: 2, graded });
    expect(r.graded).toEqual([{ questionKey: 'a', correct: true }, { questionKey: 'b', correct: false }]);
    expect(JSON.stringify(r)).not.toMatch(/chosen|answer/);
  });
});

describe('describeGate — the copy a closed module shows', () => {
  it('is null when the module is open', () => {
    expect(describeGate({ open: true, reason: null, retryAfterSec: null })).toBeNull();
  });
  it('names the wait in plain units', () => {
    expect(describeGate({ open: false, reason: 'cooldown', retryAfterSec: 290 })).toBe('Next attempt in 5 min. A missed module rests for 5 min before a retake.');
    expect(describeGate({ open: false, reason: 'cooldown', retryAfterSec: 42 })).toMatch(/^Next attempt in 42 s\./);
    expect(describeGate({ open: false, reason: 'attempt_cap', retryAfterSec: 4 * 3600 + 60 })).toBe('3 attempts in 24 h used. Next attempt in 4 h 1 min.');
    expect(describeGate({ open: false, reason: 'attempt_cap', retryAfterSec: 2 * 3600 })).toBe('3 attempts in 24 h used. Next attempt in 2 h.');
    expect(describeGate({ open: false, reason: 'already_passed', retryAfterSec: null })).toBe('Passed on this curriculum version.');
  });
});
