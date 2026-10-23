// coachConsent — does a guardian's yes cover COACH TRAINING? (coach-loop P1; owner decision 2026-10-23)
//
// THE OWNER'S ANSWER: "ask guardians again". A consent given under the old wording — the guardian was told their yes lets
// a camp plan go live (lib/consent/guardianGate.ts GUARDIAN_CONSENT_COVERS) — must NOT unlock joining a coach's roster
// or saving training data.
//
// WHAT A CONSENT ROW CAN TELL US, WITHOUT A SCHEMA CHANGE. GuardianConsent (prisma/schema.prisma) records no wording, no
// version and no scope: only requestedAt / acceptedAt / revokedAt. So the one honest way to tell a coach-training
// consent from an old one is WHEN it was requested: a request made on or after the day the new wording went live was
// asked with that wording. COACH_TRAINING_CONSENT_SINCE is that day.
//
// IT IS NULL TODAY, SO EVERY TEEN FAILS CLOSED. The new wording is a proposal awaiting the owner (docs/COACH-LOOP.md
// §1); no guardian has been asked it, so no consent on file covers coach training. Until the wording is approved, live
// on the guardian's screen, and this date set to its go-live day (the steps are in docs/COACH-LOOP.md §1), no 13–17
// account joins a roster or saves coached training. Adults are unaffected; under-13s were never allowed.
//
// assumption: the request date is a sound proxy only if the accept screen shows the new wording from that date on. The
// go-live steps say so; a `covers` column on GuardianConsent would make it exact (a schema change, not in this lane).

/** The day the guardian's screen started asking for coach training. null = not yet: no consent covers it. */
export const COACH_TRAINING_CONSENT_SINCE: Date | null = null;

/** Was this consent requested under the coach-training wording? */
export function coversCoachTraining(c: { requestedAt: Date }, since: Date | null = COACH_TRAINING_CONSENT_SINCE): boolean {
  return since != null && c.requestedAt.getTime() >= since.getTime();
}

/** Where a teen goes to ask: nowhere yet while the wording is not live (there is no request that could satisfy it). */
export function coachConsentAskHref(since: Date | null = COACH_TRAINING_CONSENT_SINCE): string | null {
  return since != null ? '/consent/guardian' : null;
}
