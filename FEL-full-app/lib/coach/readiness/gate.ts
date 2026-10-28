// lib/coach/readiness/gate.ts — COACH-READINESS (2026-10-25): who may take the check, whose numbers are kept, and what a
// coach may see. Every gate is one the app already has; this file only names which applies where.
//
//   · THE CHECK ITSELF (the camera and the jump numbers): a VERIFIED ADULT only (lib/privacy/verifiedAdult.ts, the DB's
//     User.dobYear, a year gap of more than 18). The Quick Screen's camera is 18+ (SCREEN-MINOR-LOCK, PM 2026-10-21) and
//     jump numbers are adults-only data (owner 2026-10-24; the drafts lane's rule: "Mirror form and jump numbers — only for
//     a verified adult"). A teen's coaching consent (lib/coach/teenGate.ts, coachConsent.ts) covers TRAINING data only
//     and, today, no consent covers even that (COACH_TRAINING_CONSENT_SINCE is null). So no 13–17 account is covered under
//     current consent: TEENS GET NO CHECK, said plainly, and their plan is untouched. OWNER CALL: TEEN_READINESS below.
//   · KEPT ON THE SERVER (history, the coach's alert, Today's ease, the weekly draft): the movement-save gate,
//     lib/privacy/scanSaveGate.ts canSaveScanNumbers (verified 18+ AND opted in) — row 1l of SCAN_SAVE_ROUTES. An adult who
//     has not opted in still gets the check, read against a history kept on their own phone (./deviceHistory.ts).
//   · WHAT A COACH SEES: only a client on their live roster who gave them a live 'coach_view' grant (the readiness
//     check-in's rule, lib/health/readiness.ts coachReadinessView: without it, NOTHING — not a line, not a count). The
//     jump numbers on top of that need the athlete's live save opt-in (the drafts lane's numbersFor rule).
//   · TODAY'S EASE: the athlete's own saved check against their coach's rule. It needs no grant (it is the athlete's
//     data acting on the athlete's own session), and the athlete is told whether the coach was told.
//
// Pure.

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

/**
 * OWNER CALL (flagged): teens and the readiness check. false = adults only. Turning it on needs, first, a guardian
 * consent that covers camera jump numbers (none does: lib/coach/coachConsent.ts) and the Quick Screen's camera opened to
 * minors (SCREEN-MINOR-LOCK). Not a switch to flip on its own.
 */
export const TEEN_READINESS = false as const;

export type CheckAccess = { ok: true } | { ok: false; error: 'sign_in' | 'adults_only' };

/** May this account take the check at all? */
export function checkAccess(o: { signedIn: boolean; dobYear: number | null | undefined }, now: Date = new Date()): CheckAccess {
  if (!o.signedIn) return { ok: false, error: 'sign_in' };
  if (!verifiedAdult(o.dobYear ?? null, now)) return { ok: false, error: 'adults_only' };
  return { ok: true };
}

/** May this coach see this client's readiness? A live roster link AND a live coach_view grant AND the client an adult. */
export function coachMaySee(o: { onRoster: boolean; coachView: boolean; adult: boolean }): boolean {
  return o.onRoster && o.coachView && o.adult;
}
