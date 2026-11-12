// CHALLENGES-2: the pure rules — the 48-hour clock, who won, what a challenge is on, the name a stranger sees.
import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_TTL_FROM_MS, CHALLENGE_TTL_MS, REP_METRICS, challengeExpiresAt, challengeTitle, displayTag, extraFor,
  formatChallengeScore, isChallengeExpired, outcomeOf, termsOf, timeLeftLabel,
} from './challenge-terms';
import { canonicalV2 } from './challenge-sign';
import { ChallengeLinkCore } from './challenge-link-core';
import { firstName } from './challenge-identity';

const T = CHALLENGE_TTL_FROM_MS + 3_600_000; // a link signed an hour after the 48-hour rule began

describe('the 48-hour clock', () => {
  it('a link closes exactly 48 h after its signed time: open at 47:59:59.999, closed at 48:00:00', () => {
    expect(CHALLENGE_TTL_MS).toBe(48 * 3_600_000);
    expect(challengeExpiresAt({ t: T })).toBe(T + CHALLENGE_TTL_MS);
    expect(isChallengeExpired({ t: T }, T + CHALLENGE_TTL_MS - 1)).toBe(false);
    expect(isChallengeExpired({ t: T }, T + CHALLENGE_TTL_MS)).toBe(true);
    expect(isChallengeExpired({ t: T }, T)).toBe(false);
  });

  it('a link signed before the rule began keeps the old rule (no clock); junk t has no clock either', () => {
    expect(challengeExpiresAt({ t: CHALLENGE_TTL_FROM_MS - 1 })).toBeNull();
    expect(isChallengeExpired({ t: CHALLENGE_TTL_FROM_MS - 1 }, CHALLENGE_TTL_FROM_MS + 365 * 864e5)).toBe(false);
    expect(challengeExpiresAt({ t: CHALLENGE_TTL_FROM_MS })).toBe(CHALLENGE_TTL_FROM_MS + CHALLENGE_TTL_MS);
    for (const t of [undefined, null, 'x', NaN, Infinity]) expect(challengeExpiresAt({ t } as { t: unknown })).toBeNull();
  });

  it('time left reads in hours, then minutes, then Ended', () => {
    expect(timeLeftLabel(T + CHALLENGE_TTL_MS, T)).toBe('48 h left');
    expect(timeLeftLabel(T + CHALLENGE_TTL_MS, T + CHALLENGE_TTL_MS - 35 * 60_000)).toBe('35 min left');
    expect(timeLeftLabel(T + CHALLENGE_TTL_MS, T + CHALLENGE_TTL_MS - 1)).toBe('1 min left');
    expect(timeLeftLabel(T + CHALLENGE_TTL_MS, T + CHALLENGE_TTL_MS)).toBe('Ended');
    expect(timeLeftLabel(null, T)).toBeNull();
  });
});

describe('who won', () => {
  it('higher wins, equal is a tie', () => {
    expect(outcomeOf(40, 46)).toBe('won');
    expect(outcomeOf(40, 39)).toBe('lost');
    expect(outcomeOf(40, 40)).toBe('tie');
  });
});

describe('what a challenge is on', () => {
  it('a plain score challenge carries no `x`, so it signs the bytes it always did', () => {
    expect(extraFor({})).toBeUndefined();
    const { payload } = ChallengeLinkCore.mint({ modeKey: 'threePoint', score: 21 });
    expect('x' in payload).toBe(false);
    expect(canonicalV2(payload)).not.toContain('"x"');
    expect(termsOf(payload)).toEqual({ kind: 'score', metric: null, re: null });
  });

  it('a rep challenge and a rematch round-trip through the signed payload', () => {
    const extra = extraFor({ metric: 'jump', re: { code: 'abc', score: 245, tag: 'ATHLETE' } });
    const { payload } = ChallengeLinkCore.mint({ modeKey: 'mirror:jump', score: 250, extra });
    const back = JSON.parse(JSON.stringify(payload));
    expect(termsOf(back)).toEqual({ kind: 'rep', metric: 'jump', re: { code: 'abc', score: 245, tag: 'ATHLETE' } });
  });

  it('an unknown metric reads as a plain score challenge (never guessed into a rep)', () => {
    expect(termsOf({ x: { kind: 'rep', metric: 'bench' } }).kind).toBe('score');
  });

  it('a jump reads in inches from tenths; form in percent; a game score as a whole number', () => {
    expect(formatChallengeScore({ metric: 'jump' }, 245)).toBe('24.5 in');
    expect(formatChallengeScore({ metric: 'form' }, 82)).toBe('82% clean reps');
    expect(formatChallengeScore({ metric: null }, 1234)).toBe('1,234');
    expect(challengeTitle('threePoint', { metric: null })).toBe('Downtown');
    expect(challengeTitle('mirror:jump', { metric: 'jump' })).toBe('Jump (Mirror)');
    expect(REP_METRICS.jump.measureHref).toBe('/play/mirror/assess?run=jump');
  });
});

describe('the name a stranger sees', () => {
  it('the anonymous tags read "A friend"; a chosen name reads as itself', () => {
    for (const t of ['ATHLETE', 'athlete', 'GUEST', 'CHALLENGER', '', null, undefined]) expect(displayTag(t)).toBe('A friend');
    expect(displayTag('Maya')).toBe('Maya');
  });

  it('firstName keeps one word, letters and digits only, 16 characters at most; "Athlete" is no name', () => {
    expect(firstName('Maya Lopez')).toBe('Maya');
    expect(firstName('  Jo!!<> x')).toBe('Jo');
    expect(firstName('A'.repeat(30))).toBe('A'.repeat(16));
    expect(firstName('Athlete')).toBeNull();
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
