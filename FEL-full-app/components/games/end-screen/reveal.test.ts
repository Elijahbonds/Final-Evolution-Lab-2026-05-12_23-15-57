// END SCREEN — the reveal: what plays, in what order, how long it takes, and what A does at each moment.
import { describe, it, expect } from 'vitest';
import {
  buildSteps, stepDurations, initialReveal, revealReducer, isShown, revealDone, pressIntent, cueFor,
  REVEAL_BUDGET_MS, ARM_MS, BASE_MS, type StepData, type RevealState,
} from './reveal';

const base: StepData = {
  hasGrade: false, recap: null, coins: null, hasCallouts: false,
  storyReward: false, storyRefused: false, arena: false, mp: false, challenge: false, hasProgress: false,
};
const paid = { xp: 120, shards: 2, credits: 15, prqDelta: 0.4, season: { tierUps: [{}] }, mastery: { ups: [{}] } };

describe('the order', () => {
  it('the moment plays while the server answers; nothing else waits on screen until it does', () => {
    expect(buildSteps(base)).toEqual(['moment', 'score']);
    expect(buildSteps({ ...base, hasGrade: true })).toEqual(['moment', 'score', 'grade']);
  });

  it('a paid run: callouts, then each reward it earned in order, the outcomes, the season, mastery, progress', () => {
    const steps = buildSteps({ ...base, hasGrade: true, recap: paid, coins: { coins: 40, capped: false }, hasCallouts: true, storyReward: true, arena: true, mp: true, challenge: true, hasProgress: true });
    expect(steps).toEqual(['moment', 'score', 'grade', 'callouts', 'xp', 'coins', 'shards', 'credits', 'prq', 'story', 'mp', 'challenge', 'arena', 'season', 'mastery', 'progress']);
  });

  it('only what was earned: a zero reward is not a beat (no "+0")', () => {
    const steps = buildSteps({ ...base, recap: { xp: 50, shards: 0, credits: 0, prqDelta: 0 }, coins: null });
    expect(steps).toEqual(['moment', 'score', 'xp']);
  });

  it('NO PLAY replaces every reward beat', () => {
    const steps = buildSteps({ ...base, recap: { ...paid, noPlay: true }, coins: { coins: 40, capped: false } });
    expect(steps).toContain('noplay');
    for (const r of ['xp', 'coins', 'shards', 'credits', 'prq']) expect(steps).not.toContain(r);
  });

  it('an unpaid / refused run says why and reveals no reward tile, even if numbers came back', () => {
    const steps = buildSteps({ ...base, recap: { ...paid, unpaid: 'SCORE_INVALID' }, coins: { coins: 40, capped: false } });
    expect(steps.slice(0, 3)).toEqual(['moment', 'score', 'unpaid']);
    for (const r of ['xp', 'coins', 'shards', 'credits', 'prq']) expect(steps).not.toContain(r);
  });

  it('a capped run says so; coins capped to nothing are no tile (ECONOMY-CAPS F-P1: no "+0"), capped coins are', () => {
    const steps = buildSteps({ ...base, recap: { xp: 10, shards: 0, credits: 0, prqDelta: 0, capMessage: 'Daily cap reached' }, coins: { coins: 0, capped: true } });
    expect(steps).toEqual(['moment', 'score', 'cap', 'xp']);
    expect(buildSteps({ ...base, recap: { xp: 10, shards: 0, credits: 0, prqDelta: 0 }, coins: { coins: 12, capped: true } })).toContain('coins');
  });

  it('a story node refused is said before anything else story-shaped', () => {
    expect(buildSteps({ ...base, recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0 }, storyRefused: true })).toEqual(['moment', 'score', 'storyRefused']);
  });
});

describe('the pace: the whole finish fits the budget', () => {
  it('a full run is scaled to REVEAL_BUDGET_MS, never past it', () => {
    const steps = buildSteps({ ...base, hasGrade: true, recap: paid, coins: { coins: 40, capped: false }, hasCallouts: true, storyReward: true, arena: true, mp: true, challenge: true, hasProgress: true });
    const d = stepDurations(steps, 3);
    expect(d.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(REVEAL_BUDGET_MS + steps.length);   // rounding
    expect(Math.min(...d)).toBeGreaterThan(0);
  });

  it('a short run plays at its natural pace (never stretched)', () => {
    const d = stepDurations(['moment', 'score']);
    expect(d).toEqual([BASE_MS.moment, BASE_MS.score]);
  });

  it('each tier crossed lengthens the season beat (capped at three)', () => {
    const [s0] = stepDurations(['season'], 0, 1e9), [s2] = stepDurations(['season'], 2, 1e9), [s9] = stepDurations(['season'], 9, 1e9);
    expect(s2).toBeGreaterThan(s0);
    expect(s9).toBe(stepDurations(['season'], 3, 1e9)[0]);
  });
});

describe('skip and reduced motion', () => {
  it('advance shows one beat at a time and stops at the end', () => {
    let s: RevealState = initialReveal(false);
    expect(s).toEqual({ shown: 1, skipped: false });
    s = revealReducer(s, { type: 'advance', total: 3 });
    s = revealReducer(s, { type: 'advance', total: 3 });
    expect(s.shown).toBe(3);
    expect(revealReducer(s, { type: 'advance', total: 3 })).toBe(s);
    expect(revealDone(s, 3)).toBe(true);
    expect(revealDone(s, 5)).toBe(false);   // the server's answer added beats: the reveal goes on
  });

  it('A skips: every beat — including ones the server has not sent yet — shows at once', () => {
    const s = revealReducer(initialReveal(false), { type: 'skip' });
    for (let i = 0; i < 20; i++) expect(isShown(s, i)).toBe(true);
    expect(revealDone(s, 20)).toBe(true);
  });

  it('reduced motion starts revealed', () => {
    const s = initialReveal(true);
    expect(isShown(s, 0) && isShown(s, 12)).toBe(true);
  });

  it('A: ignored before ARM_MS (a mashed button at the whistle), then skip while beats remain, then activate', () => {
    const playing = initialReveal(false);
    expect(pressIntent(playing, 5, 0)).toBe('ignore');
    expect(pressIntent(playing, 5, ARM_MS - 1)).toBe('ignore');
    expect(pressIntent(playing, 5, ARM_MS)).toBe('skip');
    expect(pressIntent(revealReducer(playing, { type: 'skip' }), 5, ARM_MS)).toBe('activate');
    // nothing blocks Play again for more than ~0.5 s: armed by then, and one press reveals all
    expect(ARM_MS).toBeLessThanOrEqual(500);
  });
});

describe('cues', () => {
  it('a win cheers, a record and a tier-up level up, an honest refusal is soft', () => {
    expect(cueFor('moment', { won: true, newBest: false, tierUps: 0 })).toBe('win');
    expect(cueFor('moment', { won: false, newBest: false, tierUps: 0 })).toBe('soft');
    expect(cueFor('callouts', { won: false, newBest: true, tierUps: 0 })).toBe('record');
    expect(cueFor('season', { won: false, newBest: false, tierUps: 1 })).toBe('levelUp');
    expect(cueFor('season', { won: false, newBest: false, tierUps: 0 })).toBe('tick');
    expect(cueFor('unpaid', { won: true, newBest: true, tierUps: 2 })).toBe('soft');
  });
});
