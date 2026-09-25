// How often a facilitator may sit a certification module, and what a result is allowed to say. Pure.
//
// HOTFIX (2026-09-24): the paid facilitator certification had no cooldown and no attempt cap, and every
// submit answered with a correct/incorrect flag per question — so the fastest route to "certified" was to
// submit, read which answers were wrong, change them, and submit again seconds later. The old education
// contract (FEL-app infra/EDUCATION_INTEGRITY_CONTRACT.md, backend/routers/education_tracks.py) had
// already solved this for the kinesiology final: a 300 s cooldown after a failed attempt, and a result of
// score + counts only. This is that contract, for the Camp, plus a cap per rolling window.
//
// No answer data lives here, so the client may import it (camp-view uses describeGate for its copy).
import { CURRICULUM_VERSION } from '@/lib/curriculum/blueprint';

export interface AttemptPolicy {
  /** After a FAILED attempt, the module stays closed this long. The old education contract's figure. */
  cooldownSec: number;
  /** Attempts per module per rolling window. */
  cap: number;
  windowSec: number;
}

export const ASSESS_POLICY: Readonly<AttemptPolicy> = Object.freeze({
  cooldownSec: 300,
  // Three a day. A score is itself a signal (it says how many answers were right), so an uncapped
  // five-minute cooldown still allowed ~288 probes a day; three makes changing one answer at a time a week
  // of work rather than an afternoon, and is still generous for somebody who is actually studying.
  cap: 3,
  windowSec: 24 * 60 * 60,
});

export interface AttemptRow {
  earnedAt: Date | string | number;
  passed: boolean;
  curriculumVersion: string;
}

export type AttemptBlock = 'already_passed' | 'cooldown' | 'attempt_cap';

export interface AttemptGate {
  open: boolean;
  reason: AttemptBlock | null;
  /** Whole seconds until the module opens again; null when open, or when it never will (already passed). */
  retryAfterSec: number | null;
  /** Attempts still available in the current window. */
  attemptsLeft: number;
}

/**
 * May this facilitator sit this module now? `rows` are their Credential rows for ONE module.
 *
 * Only rows on the current curriculum version count, matching certificationStatusFor: a pass on an old
 * version does not certify, so it must not lock the module either, and a version bump is the owner's
 * decision that everybody re-sits — it should not arrive already rationed by attempts on the old paper.
 *
 * When the cap and the cooldown both bind, the gate reports whichever keeps the module closed longer, so
 * the wait it quotes is the real one.
 */
export function attemptGate(
  rows: readonly AttemptRow[],
  now: Date,
  version: string = CURRICULUM_VERSION,
  policy: AttemptPolicy = ASSESS_POLICY,
): AttemptGate {
  const t = now.getTime();
  const cap = Math.max(1, Math.floor(policy.cap));
  const windowMs = policy.windowSec * 1000;
  const cooldownMs = policy.cooldownSec * 1000;
  const mine = rows
    .filter((r) => r.curriculumVersion === version)
    .map((r) => ({ at: new Date(r.earnedAt).getTime(), passed: r.passed }))
    .filter((r) => Number.isFinite(r.at));

  if (mine.some((r) => r.passed)) return { open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 };

  // A row stamped slightly in the future (app and database clocks disagree) is inside the window, never
  // outside it: the conservative reading.
  const inWindow = mine.filter((r) => t - r.at < windowMs).sort((a, b) => a.at - b.at);
  const attemptsLeft = Math.max(0, cap - inWindow.length);

  let reason: AttemptBlock | null = null;
  let waitMs = 0;
  if (inWindow.length >= cap) {
    // The attempt whose exit from the window brings the count back under the cap.
    const freeing = inWindow[inWindow.length - cap];
    waitMs = Math.min(windowMs, freeing.at + windowMs - t);
    reason = 'attempt_cap';
  }
  const last = inWindow[inWindow.length - 1];
  if (last) {
    const cooldownLeft = Math.min(cooldownMs, last.at + cooldownMs - t);
    if (cooldownLeft > 0 && cooldownLeft > waitMs) { waitMs = cooldownLeft; reason = 'cooldown'; }
  }
  if (reason && waitMs > 0) return { open: false, reason, retryAfterSec: Math.ceil(waitMs / 1000), attemptsLeft };
  return { open: true, reason: null, retryAfterSec: null, attemptsLeft };
}

// ── what a result may say ────────────────────────────────────────────────────
//
// The brief offered two options: per-question correctness "until passed", or "after the attempt closes".
// This takes the stricter: per-question flags are returned ONLY on a pass, never on a fail, closed or not.
// Flags on a closed failed attempt are the same answer key, one cooldown later: the facilitator learns
// exactly which answers to change and passes on the next try without learning anything. A pass reveals
// only which of the facilitator's OWN answers were wrong (they already cleared the mark), and the correct
// option is never sent in either case. A fail says the score and how many were right, which is what the
// old education contract returned.

export interface GradedLike {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  graded: readonly { questionKey: string; correct: boolean }[];
}

export interface AssessResult {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  /** Present only when passed. */
  graded?: { questionKey: string; correct: boolean }[];
}

export function discloseResult(g: GradedLike): AssessResult {
  const base: AssessResult = { score: g.score, passed: g.passed, correct: g.correct, total: g.total };
  if (!g.passed) return base;
  return { ...base, graded: g.graded.map(({ questionKey, correct }) => ({ questionKey, correct })) };
}

// ── copy ─────────────────────────────────────────────────────────────────────

function formatWait(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** One line for a closed module, or null when it is open. */
export function describeGate(gate: Pick<AttemptGate, 'open' | 'reason' | 'retryAfterSec'>, policy: AttemptPolicy = ASSESS_POLICY): string | null {
  if (gate.open || !gate.reason) return null;
  if (gate.reason === 'already_passed') return 'Passed on this curriculum version.';
  const wait = gate.retryAfterSec != null ? formatWait(gate.retryAfterSec) : 'a while';
  if (gate.reason === 'cooldown') return `Next attempt in ${wait}. A missed module rests for ${formatWait(policy.cooldownSec)} before a retake.`;
  return `${policy.cap} attempts in ${formatWait(policy.windowSec)} used. Next attempt in ${wait}.`;
}
