// QA A1-05 — see timing-opponent-score.ts. Fixtures are the actual finish payloads measured in eye-a1a1c5f9
// (MEASURED_RUNS rows 4 and 9): volleyball's real stats.theirs (2) was dropped in favor of a hardcoded 0, and
// tennis's real stats.theirs (0, a legitimate 4-0 sweep) needs to keep coming from the same real field, not a
// constant that happens to agree with this particular match.
import { describe, expect, it } from 'vitest';
import { opponentScoreFor } from './timing-opponent-score';

describe('opponentScoreFor (QA A1-05)', () => {
  it('volleyball: the real stats.theirs (2), not a hardcoded 0', () => {
    expect(opponentScoreFor('volleyball', { streak: 7, style: 0, theirs: 2 })).toBe(2);
  });

  it('tennis: a 4-0 sweep really is stats.theirs 0 — reads the real field, not a constant', () => {
    expect(opponentScoreFor('tennis', { streak: 8, style: 260, theirs: 0 })).toBe(0);
  });

  it('tennis: a real, non-zero opponent games count is posted too', () => {
    expect(opponentScoreFor('tennis', { theirs: 3 })).toBe(3);
  });

  it('penalty keeps reading themGoals, unaffected by the tennis/volleyball fix', () => {
    expect(opponentScoreFor('penalty', { goals: 4, themGoals: 2, stylePts: 10 })).toBe(2);
  });

  it('golf and derby have no live opponent — 0, even if stats carries something under `theirs`', () => {
    expect(opponentScoreFor('golf', { theirs: 5 })).toBe(0);
    expect(opponentScoreFor('derby', { theirs: 5 })).toBe(0);
  });

  it('missing stats defaults to 0 for every mode', () => {
    expect(opponentScoreFor('tennis', null)).toBe(0);
    expect(opponentScoreFor('volleyball', undefined)).toBe(0);
  });
});
