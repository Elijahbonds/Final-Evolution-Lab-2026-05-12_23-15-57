// Resiliency — the Camp's owner-chosen metric (2026-09-02): the retry rate
// after failed attempts, plus whether the mentee returns after a losing
// session. Pure over a list of game-session summaries so it is unit-tested and
// so the same numbers appear on the session record and the profile.

export interface SessionOutcome {
  /** ISO timestamp or epoch ms — only ordering matters. */
  at: number;
  modeKey: string;
  /** 'win' | 'loss' | 'complete' | 'abandoned' */
  outcome: 'win' | 'loss' | 'complete' | 'abandoned';
}

export interface ResiliencyLog {
  attempts: number;
  failures: number;
  /** A failure followed by another attempt in the same mode within `retryWindowMs`. */
  retriesAfterFail: number;
  /** retriesAfterFail / failures (0 when there were no failures). */
  retryRate: number;
  /** Did the mentee play again after the most recent losing session? */
  returnedAfterLoss: boolean | null;
}

export const RETRY_WINDOW_MS = 15 * 60 * 1000;

export function computeResiliency(sessions: SessionOutcome[], retryWindowMs = RETRY_WINDOW_MS): ResiliencyLog {
  const s = [...sessions].sort((a, b) => a.at - b.at);
  let failures = 0, retries = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = s[i];
    if (cur.outcome !== 'loss' && cur.outcome !== 'abandoned') continue;
    failures++;
    const next = s.slice(i + 1).find((n) => n.modeKey === cur.modeKey);
    if (next && next.at - cur.at <= retryWindowMs) retries++;
  }
  const lastLossIdx = s.map((x) => x.outcome).lastIndexOf('loss');
  const returnedAfterLoss = lastLossIdx < 0 ? null : lastLossIdx < s.length - 1;
  return {
    attempts: s.length,
    failures,
    retriesAfterFail: retries,
    retryRate: failures ? Math.round((retries / failures) * 1000) / 1000 : 0,
    returnedAfterLoss,
  };
}
