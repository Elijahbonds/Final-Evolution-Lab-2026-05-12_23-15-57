// teenGate — who may join a coach's roster and save training data (coach-loop P1, 2026-10-20).
//
// THE GAP THIS CLOSES. The platform roadmap (§1.2) flagged, from a read of the code, that nothing on the coach loop
// checked an age or a guardian: POST /api/coach/invite/[token] wrote a CoachClient row and POST /api/coach/me/log
// wrote ExerciseLog / SetLog rows for any signed-in account. lib/coach/teen-gate-routes.test.ts measured it on the
// unmodified routes — a 15-year-old with no consent, a 12-year-old and a blank-year account all got 200 — and pins
// the gate below.
//
// THE OWNER'S RULE (ATHLETES, 2026-10-20): teens save TRAINING data — set logs, sessions, goals, program progress —
// with guardian consent. Mirror scans and health data stay adult-only (lib/privacy/scanSaveGate.ts and
// healthWriteGate.ts already hold that line; nothing here loosens them). Under 13: never (Terms §2, no account under
// 13), whatever a guardian said.
//
// THE AGE LINES are the ones this app already uses for the account itself, not new ones:
//   · under 13 = lib/privacy/ageScreen.ts ageScreenOutcome 'blocked' (a year gap of 13 or less — the year that turns 13
//     this calendar year may still be 12);
//   · adult = verifiedAdult (a year gap of MORE than 18 — exactly 18 by year may still be 17, so it is a teen here);
//   · blank = a minor until answered (decision #20), so it is asked for before anything is written. A blank account
//     year with an accepted GuardianConsent reads the consent's menteeBirthYear, as app/api/v1/camp/plans does.
// The consent is lib/consent/guardianGate.ts guardianStatus: the most recently requested row decides, so a revoked
// consent is not an accepted one. AND it must cover coach training (owner, 2026-10-23: "ask guardians again"): a
// consent asked under the old camp-plan wording does not (lib/coach/coachConsent.ts). Today no consent does, so every
// teen fails closed until the new wording is approved and live (docs/COACH-LOOP.md §1).
//
// Pure: plain rows in, a decision out. lib/coach/teenGateServer.ts reads the rows.

import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { guardianStatus, type GuardianConsentLike } from '@/lib/consent/guardianGate';
import { coachConsentAskHref, coversCoachTraining } from './coachConsent';

export interface TeenGateConsent extends GuardianConsentLike {
  menteeBirthYear?: number | null;
}

export interface TeenGateInput {
  /** User.dobYear — null when never answered. */
  dobYear: number | null | undefined;
  /** Every GuardianConsent naming this account as the mentee, any order. */
  consents: readonly TeenGateConsent[];
}

export type TeenGateRefusal = 'under_13' | 'age_required' | 'guardian_consent_required';
export type TeenGateResult = { ok: true; band: 'adult' | 'teen' } | { ok: false; error: TeenGateRefusal };

/** The birth year to judge by: the account's own, else the year an accepted guardian consent recorded. */
const latestOf = (consents: readonly TeenGateConsent[]) => [...consents].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];

function yearFor(input: TeenGateInput): number | null {
  if (typeof input.dobYear === 'number') return input.dobYear;
  if (guardianStatus(input.consents) !== 'accepted') return null;
  const latest = latestOf(input.consents);
  return typeof latest?.menteeBirthYear === 'number' ? latest.menteeBirthYear : null;
}

/** The current consent is accepted AND was asked under the coach-training wording. */
export function coachTrainingConsented(consents: readonly TeenGateConsent[]): boolean {
  if (guardianStatus(consents) !== 'accepted') return false;
  const latest = latestOf(consents);
  return !!latest && coversCoachTraining(latest);
}

/** May this account join a coach's roster, or save coached training, right now? */
export function teenGate(input: TeenGateInput, now: Date = new Date()): TeenGateResult {
  const year = yearFor(input);
  if (year == null) return { ok: false, error: 'age_required' };
  const outcome = ageScreenOutcome(year, now);
  if (outcome === 'invalid') return { ok: false, error: 'age_required' };
  if (outcome === 'blocked') return { ok: false, error: 'under_13' };
  if (outcome === 'adult') return { ok: true, band: 'adult' };
  return coachTrainingConsented(input.consents) ? { ok: true, band: 'teen' } : { ok: false, error: 'guardian_consent_required' };
}

/**
 * What the athlete reads, and where it sends them. No birth year, no guardian name or email: the refusal says what
 * is needed, never what is on file. Plain product lines, not policy text — the guardian's consent wording itself is
 * lib/consent/guardianGate.ts's and the owner's.
 */
export const TEEN_GATE_COPY: Record<TeenGateRefusal, { message: string; href: string | null; action: string | null }> = {
  under_13: { message: 'Coaching on FEL is for players 13 and up.', href: null, action: null },
  age_required: { message: 'Tell us the year you were born first.', href: '/age?next=%2Fcoach', action: 'Add your birth year' },
  // href is filled in by teenGateBody: there is somewhere to ask only once the coach-training wording is live
  guardian_consent_required: {
    message: 'A parent or guardian needs to approve coach training before you can train with a coach here.',
    href: null, action: 'Ask your guardian to approve coach training',
  },
};

/** The JSON a route answers with when the gate refuses (always 403). */
export function teenGateBody(error: TeenGateRefusal): { error: TeenGateRefusal; message: string; href: string | null } {
  const c = TEEN_GATE_COPY[error];
  return { error, message: c.message, href: error === 'guardian_consent_required' ? coachConsentAskHref() : c.href };
}
