/**
 * lib/sessions/unpaidCopy.ts — ECONOMY-SESSIONS-HARDEN (2026-09-28): what the end card says when a run paid nothing, in
 * the server's terms. The card shows only what the server's answer granted; when it granted nothing, it says why rather
 * than showing a row of +0 tiles with no explanation. PURE.
 */

const TITLES: Readonly<Record<string, string>> = {
  AGENT: 'PRACTICE RUN — NOT PAID',
  PLAYTEST: 'PRACTICE RUN — NOT PAID',
  TEST_ACCOUNT: 'TEST ACCOUNT — NOT PAID',
  SCORE_INVALID: 'RESULT NOT ACCEPTED',
  NO_RULES: 'REWARDS PAUSED FOR THIS MODE',
  RUN_MISSING: 'RUN NOT STARTED — NOT PAID',
  RUN_UNKNOWN: 'RUN NOT FOUND — NOT PAID',
  RUN_MODE_MISMATCH: 'RESULT NOT ACCEPTED',
  RUN_EXPIRED: 'RUN TIMED OUT — NOT PAID',
  RUN_CLOSED: 'ALREADY RECORDED',
  RUN_IN_FLIGHT: 'STILL RECORDING',
};

const LINES: Readonly<Record<string, string>> = {
  AGENT: 'An automated run: your score is recorded, rewards are not paid.',
  PLAYTEST: 'A playtest run: your score is recorded, rewards are not paid.',
  TEST_ACCOUNT: 'This account is a test account: scores are recorded, rewards are not paid.',
  SCORE_INVALID: 'This result is outside what the mode allows, so nothing was paid.',
  NO_RULES: 'Rewards for this mode are paused while its limits are set, so nothing was paid.',
  RUN_MISSING: 'The run never reached the server (offline or signed out), so nothing was paid.',
  RUN_UNKNOWN: 'The server has no record of this run, so nothing was paid.',
  RUN_MODE_MISMATCH: 'This result names a different mode from its run, so nothing was paid.',
  RUN_EXPIRED: 'The run was open too long to be paid. Play again to earn.',
  RUN_CLOSED: 'This run was already recorded.',
  RUN_IN_FLIGHT: 'This run is being recorded in another tab.',
};

/** The key the card is written from: a SCORE_INVALID for a mode with no measured rules yet is its own case, not a bad result. */
export function unpaidReason(reason: unknown, detail?: unknown): string {
  const r = String(reason ?? 'UNPAID');
  return r === 'SCORE_INVALID' && detail === 'no_rules' ? 'NO_RULES' : r;
}

export function unpaidTitle(reason: string): string {
  return TITLES[reason] ?? 'NOT PAID';
}

export function unpaidLine(reason: string): string {
  return LINES[reason] ?? 'Nothing was paid for this run.';
}
