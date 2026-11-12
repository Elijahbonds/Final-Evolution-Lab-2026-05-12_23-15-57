// TEAMS-SQUADS: who may join (or start) a group. Pure: rows in, a decision out (server.ts reads the rows).
//
// TEAM = a coach's roster. Joining a team puts the athlete on the coach's roster (a CoachClient row, as the coach
// invite does), so it runs the coach loop's own teen gate unchanged (lib/coach/teenGate.ts): adults yes; 13–17 only with
// a guardian consent asked under the coach-training wording (none is live: every teen fails closed today,
// docs/COACH-LOOP.md §1); under 13 never; a blank birth year is asked for first.
//
// SQUAD = friends. Same age lines, and the SAME consent rule in a new scope: a 13–17 joins or starts a squad only with
// a current guardian consent asked under wording that covers squads. The owner APPROVED that wording on 2026-10-27 (in
// chat, card C08: lib/consent/guardianGate.ts squadsConsentWords), but no guardian has been asked it yet: it goes live
// with the withdraw path and the go-live date (guardianGate.ts lists the steps), so SQUADS_CONSENT_SINCE is still null
// and every teen fails closed, as before. assumption: the request-date
// proxy is the coach loop's (lib/coach/coachConsent.ts) and holds only if the words and the date ship together.

import { guardianStatus } from '@/lib/consent/guardianGate';
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { teenGate, teenGateBody, type TeenGateConsent, type TeenGateRefusal } from '@/lib/coach/teenGate';
import type { GroupKind } from './types';

/** The day the guardian's screen started asking for squads. null = not yet: no consent covers squads. (owner call) */
export const SQUADS_CONSENT_SINCE: Date | null = null;

export interface GateInput {
  dobYear: number | null | undefined;
  consents: readonly TeenGateConsent[];
}

export type GroupGate = { ok: true; band: 'adult' | 'teen' } | { ok: false; error: TeenGateRefusal };

function latest(consents: readonly TeenGateConsent[]) {
  return [...consents].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
}

export function squadsConsented(consents: readonly TeenGateConsent[], since: Date | null = SQUADS_CONSENT_SINCE): boolean {
  if (since == null || guardianStatus(consents) !== 'accepted') return false;
  const l = latest(consents);
  return !!l && l.requestedAt.getTime() >= since.getTime();
}

/** May this account join (or start) a group of this kind right now? */
export function groupGate(kind: GroupKind, input: GateInput, now: Date = new Date(), squadsSince: Date | null = SQUADS_CONSENT_SINCE): GroupGate {
  if (kind === 'team') return teenGate(input, now);
  // a blank year reads an accepted consent's recorded year, as the coach gate does
  let year = typeof input.dobYear === 'number' ? input.dobYear : null;
  if (year == null && guardianStatus(input.consents) === 'accepted') {
    const y = latest(input.consents)?.menteeBirthYear;
    year = typeof y === 'number' ? y : null;
  }
  if (year == null) return { ok: false, error: 'age_required' };
  const outcome = ageScreenOutcome(year, now);
  if (outcome === 'invalid') return { ok: false, error: 'age_required' };
  if (outcome === 'blocked') return { ok: false, error: 'under_13' };
  if (outcome === 'adult') return { ok: true, band: 'adult' };
  return squadsConsented(input.consents, squadsSince) ? { ok: true, band: 'teen' } : { ok: false, error: 'guardian_consent_required' };
}

/** The 403 body. A team refusal is the coach loop's own words; a squad's says squads. No birth year or guardian detail. */
export function groupGateBody(kind: GroupKind, error: TeenGateRefusal): { error: TeenGateRefusal; message: string; href: string | null } {
  if (kind === 'team') return teenGateBody(error);
  if (error === 'under_13') return { error, message: 'Squads on FEL are for players 13 and up.', href: null };
  if (error === 'age_required') return { error, message: 'Tell us the year you were born first.', href: '/age?next=%2Fsquads' };
  return {
    error,
    message: 'A parent or guardian needs to approve squads before you can join one.',
    href: SQUADS_CONSENT_SINCE != null ? '/consent/guardian' : null,
  };
}
