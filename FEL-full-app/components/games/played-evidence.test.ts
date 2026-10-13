// QA A1-02 — see played-evidence.ts for the full story. Both fixtures below are the actual finish payloads measured
// in eye-a1a1c5f9 (MEASURED_RUNS row 13 and the Arena Gate Crasher follow-up): a real, finished, fully-played run
// with zero discrete evidence (the exact shape a continuously-held stick or an agent-bridge-driven run leaves
// behind) still has to post played:true, because its score could not have come from an idle session.
import { describe, expect, it } from 'vitest';
import { isPlayedRun, type PlayEvidenceCounts } from './played-evidence';

const ZERO_EVIDENCE: PlayEvidenceCounts = { windowEvents: 0, harnessEvidence: 0, agentEvidence: 0 };

describe('isPlayedRun (QA A1-02: the shared client finish/session-post payload builder)', () => {
  it('hoops3v3, agent-driven, finished and lost (row 13): zero discrete evidence, real score — played', () => {
    expect(isPlayedRun({ score: 6, opponentScore: 12 }, ZERO_EVIDENCE)).toBe(true);
  });

  it('snowboarding / Gate Crasher, real keyboard+pad, finished and won: zero discrete evidence, real score — played', () => {
    expect(isPlayedRun({ score: 2479, opponentScore: 0 }, ZERO_EVIDENCE)).toBe(true);
  });

  it('a genuinely idle session (score 0, no evidence) is still NOT played — the abuse case this all exists to catch', () => {
    expect(isPlayedRun({ score: 0, opponentScore: 0 }, ZERO_EVIDENCE)).toBe(false);
    expect(isPlayedRun(null, ZERO_EVIDENCE)).toBe(false);
    expect(isPlayedRun(undefined, ZERO_EVIDENCE)).toBe(false);
  });

  it('a score-0 shutout loss with real discrete evidence is still played — the score check is additive, not a replacement', () => {
    expect(isPlayedRun({ score: 0, opponentScore: 0 }, { windowEvents: 3, harnessEvidence: 0, agentEvidence: 0 })).toBe(true);
    expect(isPlayedRun({ score: 0, opponentScore: 0 }, { windowEvents: 0, harnessEvidence: 3, agentEvidence: 0 })).toBe(true);
    expect(isPlayedRun({ score: 0, opponentScore: 0 }, { windowEvents: 0, harnessEvidence: 0, agentEvidence: 3 })).toBe(true);
  });

  it('a real opponent score alone (shut out but the rival scored) is evidence too', () => {
    expect(isPlayedRun({ score: 0, opponentScore: 2 }, ZERO_EVIDENCE)).toBe(true);
  });

  it('under the 3-count threshold on every counter, and no real score, is NOT played', () => {
    expect(isPlayedRun({ score: 0 }, { windowEvents: 2, harnessEvidence: 2, agentEvidence: 2 })).toBe(false);
  });
});
