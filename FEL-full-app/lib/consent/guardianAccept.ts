// lib/consent/guardianAccept.ts — MIRROR-COACH P6 (2026-09-29): WHO MAY SAY YES to a guardian-consent request the
// athlete asked for themselves.
//
// WHAT WAS LEFT OPEN. P5 made app/api/v1/camp/consent's accept (GET ?token=) refuse the one caller it could name — a
// session signed in AS the mentee the request is for (403 self_accept_blocked). It could not name the other two
// callers who are, in practice, the same minor: the same link opened SIGNED OUT (a private window, a second browser,
// a signed-out tab), and the same link opened on a SECOND ACCOUNT the minor made. The accept link is shown on the
// minor's own screen (app/play/mirror/_components/guardian-consent-gate.tsx — FEL sends no email, owner decision #21),
// so "the token is the credential" meant "whoever holds the minor's phone is the guardian".
//
// THE RULE, for a PLAYER-REQUESTED consent only (GuardianConsent.selfRequested — see the route for how that is set):
//   1. the accepter is signed in (a guardian now confirms from their own FEL account, free to make);
//   2. the accepter is not the mentee (P5's rule, kept, same error code so the accept button's copy still fits);
//   3. the accepter's User.dobYear reads as an ADULT by lib/mirror/youth.ts isMinorForMirror — the one age truth in
//      this app (blank reads as a minor, owner decision #20). An account with no birth year on file may declare one
//      here, ONCE: it is written only when the account's dobYear is blank (lib/health/intake.ts's own rule — an
//      existing dobYear is never overwritten), and only when it reads as an adult. A declaration that reads as a minor
//      is refused and NOT written, so a parent who fat-fingers 2019 for 1979 is not locked out of their own account's
//      age forever; the minor who types an adult year instead gets nothing they could not already get (see below).
//
// WHAT THIS DOES NOT STOP — said here and in the route, not left for someone to discover: a minor who makes a second
// account and declares an adult birth year on it can still accept their own request. Every age in FEL is
// self-declared; no link flow can close that without verified identity, which FEL does not have. The owner's options
// are in ~/Claude/outbox/finish-release/painfree/p6/GUARDIAN-RESIDUAL.md.
//
// DEPENDENCY-FREE on purpose, like guardianGate.ts beside it: no Prisma, no session, no fetch. The route reads the
// caller's User row and hands this module plain values, so the rule is testable without a database and the accept
// page (app/consent/guardian/[token]/page.tsx) can ask the SAME function what to show — the page and the route cannot
// disagree about who may confirm, because there is only one answer.
import { isMinorForMirror } from '../mirror/youth';

/** Every way a player-requested accept can be refused, with the HTTP status the route answers it with. */
export const PLAYER_ACCEPT_REFUSALS = {
  /** No session. A guardian confirms from their own account now — this is the signed-out path P5 could not close. */
  guardian_sign_in_required: 401,
  /** Signed in as the athlete this request is for. P5's code, unchanged, so accept-button.tsx's copy still matches. */
  self_accept_blocked: 403,
  /** A declared birth year that is not a plausible year — the same bounds the request's own menteeBirthYear uses. */
  birth_year_invalid: 400,
  /** Signed in, not the mentee, but the account has no birth year on file and none was declared with this accept. */
  guardian_birth_year_required: 403,
  /** The account's birth year (stored, or declared just now) reads as under 18 by isMinorForMirror. */
  guardian_not_adult: 403,
} as const;

export type PlayerAcceptRefusal = keyof typeof PLAYER_ACCEPT_REFUSALS;

export interface PlayerAcceptInput {
  /** The GuardianConsent row's menteeId — the athlete the request is for. */
  menteeId: string;
  /** The accepting session's user id, or null when nobody is signed in (or the session's user row no longer exists). */
  callerId: string | null;
  /** The caller's User.dobYear as stored. Null/undefined = never answered. */
  callerDobYear: number | null | undefined;
  /** A birth year typed on the accept page, straight from the request body (so `unknown`). Read ONLY when the
   *  caller's own dobYear is blank — a stored birth year is never replaced by a typed one. */
  declaredBirthYear?: unknown;
}

export type PlayerAcceptDecision =
  | {
      ok: true;
      /** Recorded on the consent row (GuardianConsent.acceptedById): the account that said yes. */
      acceptedById: string;
      /** Write this to the caller's User.dobYear (only-when-blank), or null when the account already had one. */
      declareDobYear: number | null;
    }
  | { ok: false; error: PlayerAcceptRefusal; status: number };

const refuse = (error: PlayerAcceptRefusal): PlayerAcceptDecision => ({ ok: false, error, status: PLAYER_ACCEPT_REFUSALS[error] });

/** Same plausibility bounds app/api/v1/camp/consent's POST applies to menteeBirthYear: a whole year, 1900..this year. */
export function plausibleBirthYear(value: unknown, now: Date = new Date()): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{4}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1900 || n > now.getFullYear()) return null;
  return n;
}

/**
 * May this caller accept a PLAYER-REQUESTED guardian consent? The checks run in a fixed order, and the order is part
 * of the rule: the mentee check comes BEFORE anything reads or writes a birth year, so a minor on their own account
 * can never reach the "declare a birth year" step, even with a blank dobYear of their own.
 */
export function decidePlayerAccept(input: PlayerAcceptInput, now: Date = new Date()): PlayerAcceptDecision {
  const { menteeId, callerId } = input;
  if (!callerId) return refuse('guardian_sign_in_required');
  if (callerId === menteeId) return refuse('self_accept_blocked');

  const stored = input.callerDobYear ?? null;
  if (stored !== null) {
    // A birth year on file decides it; anything typed alongside is ignored rather than allowed to argue with it.
    return isMinorForMirror(stored, now) ? refuse('guardian_not_adult') : { ok: true, acceptedById: callerId, declareDobYear: null };
  }

  const raw = input.declaredBirthYear;
  if (raw === null || raw === undefined || raw === '') return refuse('guardian_birth_year_required');
  const declared = plausibleBirthYear(raw, now);
  if (declared === null) return refuse('birth_year_invalid');
  // Refused and NOT written (see the header): a typo that reads as a child should not stick to a parent's account.
  if (isMinorForMirror(declared, now)) return refuse('guardian_not_adult');
  return { ok: true, acceptedById: callerId, declareDobYear: declared };
}

/** What the accept page shows a caller BEFORE they tap anything — the same decision, asked with nothing declared. */
export type PlayerAcceptStep = 'sign_in' | 'is_mentee' | 'declare_birth_year' | 'not_adult' | 'confirm';

export function playerAcceptStep(input: Omit<PlayerAcceptInput, 'declaredBirthYear'>, now: Date = new Date()): PlayerAcceptStep {
  const d = decidePlayerAccept({ ...input, declaredBirthYear: undefined }, now);
  if (d.ok) return 'confirm';
  switch (d.error) {
    case 'guardian_sign_in_required': return 'sign_in';
    case 'self_accept_blocked': return 'is_mentee';
    case 'guardian_birth_year_required': return 'declare_birth_year';
    case 'guardian_not_adult': return 'not_adult';
    // unreachable with nothing declared (birth_year_invalid needs a typed value); the careful answer if it ever isn't
    case 'birth_year_invalid': return 'declare_birth_year';
    default: {
      const exhaustive: never = d.error;
      return exhaustive;
    }
  }
}

/**
 * Is a request being created a PLAYER request? Derived on the server from who is asking, never from anything the
 * client sends: a request the mentee makes for themselves (menteeId omitted, or equal to the caller) is one the minor
 * holds the link to. A certified facilitator requesting for someone else is the coach-managed camp flow, unchanged.
 */
export function isSelfRequest(menteeId: string, requesterId: string): boolean {
  return menteeId === requesterId;
}
