// Test-only (coach-loop P1, owner 2026-10-23 "ask guardians again"): lib/coach/coachConsent.ts holds the day the
// coach-training consent wording went live, and it is null until the owner approves that wording — so in the real
// module every teen fails closed. A test about something else (an off day, a guardian report, Today's last-time line)
// that needs a consented teen uses this to stand in the world AFTER go-live, with the go-live day before its fixtures'
// consents were requested. Usage, at the top of a test file:
//
//   const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
//   vi.mock('@/lib/coach/coachConsent', async (orig) =>
//     (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));
//
// Set cc.since = null in a test to pin today's fail-closed state.
import type * as CoachConsent from '@/lib/coach/coachConsent';

/** A go-live day earlier than every fixture consent in the suites (they are requested 2026-09-01). */
export const COACH_CONSENT_LIVE_FROM = new Date('2026-01-01');

export function coachConsentAt(real: typeof CoachConsent, since: () => Date | null): typeof CoachConsent {
  return {
    ...real,
    coversCoachTraining: (c: { requestedAt: Date }) => real.coversCoachTraining(c, since()),
    coachConsentAskHref: () => real.coachConsentAskHref(since()),
  };
}
