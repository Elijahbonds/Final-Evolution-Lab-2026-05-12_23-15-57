// lib/coach/formReview/gate.ts — COACH-VIDEO-REVIEW (2026-10-24): who may send a set to a coach, and what they read
// when they may not.
//
// Recording a set and reading its flags happens on the phone, for anyone the Mirror already serves: nothing is sent, the
// same as the Mirror itself. SENDING the pose data to a coach is a save of movement numbers, so it passes every gate the
// app already has — none is new, none is loosened:
//
//   1. THE LIVE ROSTER LINK. The coach must be the program's coach AND the athlete's live CoachClient link (not ended):
//      a program row alone is not consent (the prescribe route's rule; lane/coach-ai-draft's roster rule).
//   2. THE TEEN GATE (lib/coach/teenGate.ts): never under 13; a blank birth year is asked for first; a 13–17 needs a
//      guardian consent that covers coach training (none does today: COACH_TRAINING_CONSENT_SINCE is null).
//   3. ADULTS: lib/privacy/scanSaveGate.ts canSaveScanNumbers — verified 18+ AND the AB-04 opt-in. The owner's rule
//      (2026-09-29): a movement-data save goes through only for a verified adult who opted in. assumption: a form review's
//      pose numbers are movement numbers under that rule, so the one AB-04 consent covers them ("There is no second
//      consent", scanSaveConsent.ts). Its wording says "jump numbers" — owner call whether the review needs its own line.
//   4. TEENS (13–17, guardian-consented): the brief covers them for POSE DATA ONLY, never video. But the owner's rule in
//      scanSaveGate.ts is that a parent's approval "is not grounds to save anybody's numbers", and lane/coach-ai-draft
//      (PR #436) keeps Mirror form data adults-only "whatever a guardian said". The two disagree, so the teen path is
//      built and gated OFF: TEEN_POSE_REVIEW_ENABLED is false until the owner decides (docs/COACH-VIDEO-REVIEW.md).
//      A guardian-consented teen still records and reads their own flags on the phone, as the Mirror lets them.
//
// Video is never part of any of this: see ./clipPolicy.ts (minors never; adults not until the owner builds the storage).
//
// Pure: rows already read in, a decision out. ./server.ts reads the rows.

import type { TeenGateResult } from '../teenGate';
import type { ReviewMovement } from './movements';
import { TEEN_GATE_COPY } from '../teenGate';

/** Owner call (docs/COACH-VIDEO-REVIEW.md §4). Off: no 13–17 account sends pose data to a coach, consent or not. */
export const TEEN_POSE_REVIEW_ENABLED = false;

export type SendRefusal =
  | 'not_on_roster'
  | 'scan_save_opt_in'
  | 'teen_pose_review_off'
  | 'under_13'
  | 'age_required'
  | 'guardian_consent_required';

export type SendDecision = { ok: true; band: 'adult' | 'teen' } | { ok: false; error: SendRefusal };

export interface SendFacts {
  /** The program is this coach's, for this athlete, and their CoachClient link is live. */
  linked: boolean;
  /** verifiedAdult(User.dobYear). */
  adult: boolean;
  /** canSaveScanNumbers (adult AND opted in). Only read for an adult. */
  canSaveScan: boolean;
  /** The teen gate's answer, for an account that is not a verified adult. */
  teen: TeenGateResult | null;
}

export function sendDecision(f: SendFacts, teenEnabled: boolean = TEEN_POSE_REVIEW_ENABLED): SendDecision {
  if (!f.linked) return { ok: false, error: 'not_on_roster' };
  if (f.adult) return f.canSaveScan ? { ok: true, band: 'adult' } : { ok: false, error: 'scan_save_opt_in' };
  const g = f.teen;
  if (!g) return { ok: false, error: 'age_required' };
  if (!g.ok) return { ok: false, error: g.error };
  if (g.band === 'adult') return f.canSaveScan ? { ok: true, band: 'adult' } : { ok: false, error: 'scan_save_opt_in' };
  return teenEnabled ? { ok: true, band: 'teen' } : { ok: false, error: 'teen_pose_review_off' };
}

/**
 * What the athlete reads when sending is refused, and where it sends them. Product lines only — the consent wording
 * itself is AB-04's (lib/privacy/scanSaveConsent.ts) and the guardian's (lib/consent/guardianGate.ts), never restated.
 */
export const SEND_COPY: Readonly<Record<SendRefusal, { message: string; href: string | null; action: string | null }>> = {
  not_on_roster: { message: 'This set can go to a coach once you are on their roster.', href: null, action: null },
  scan_save_opt_in: {
    message: 'Sending your rep data to your coach needs saving your movement numbers turned on. Your video never leaves your phone.',
    href: '/account', action: 'Open your account settings',
  },
  teen_pose_review_off: { message: 'Your flags are here for you. Sending sets to a coach is not open for players under 18 yet.', href: null, action: null },
  under_13: { message: TEEN_GATE_COPY.under_13.message, href: null, action: null },
  age_required: { message: TEEN_GATE_COPY.age_required.message, href: TEEN_GATE_COPY.age_required.href, action: TEEN_GATE_COPY.age_required.action },
  guardian_consent_required: { message: TEEN_GATE_COPY.guardian_consent_required.message, href: null, action: null },
};

/** What the record page opens with (lib/coach/formReview/server.ts recordContext reads it). */
export interface RecordContext {
  programId: string;
  sessionExerciseId: string | null;
  exerciseName: string;
  movement: ReviewMovement;
  /** Can this set be sent, and if not, what to read. Recording and the flags work either way. */
  send: { ok: true } | { ok: false; error: string; message: string; href: string | null; action: string | null };
  /** The table is there (false: the page says sending is not open yet). */
  ready: boolean;
}
