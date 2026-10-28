// lib/coach/weeklyDraft/copy.ts — COACH-AI-DRAFT (2026-10-24): every sentence the weekly draft says.
//
// OWNER-APPROVED (owner, in chat, 2026-10-27: "You do it. I approve." — Owner Inbox card C02, approved with its one
// recommended change: the internal document's name is out of the coach's notReady line). Product copy written by a
// lane; none of it is legal or policy text. The lines that touch pain or a professional are marked SAFETY-COPY: they
// follow the pain check-in's own wording (lib/health/painRule.ts PAIN_DECISION_COPY — "check with a clinician", "tell an
// adult") and say what to do next, never what is wrong: no diagnosis, no condition, no treatment, no promise.
//
// Client-safe: the Drafts inbox and the athlete's card import it.

/** The inbox's own lines. */
export const DRAFTS_COPY = {
  heading: 'Drafts for this week',
  explainer: 'FEL drafted these from your athletes’ logs and check-ins. Nothing changes in a program until you approve it.',
  approveAllSafe: 'Approve all safe',
  approve: 'Approve',
  edit: 'Edit',
  reject: 'Reject',
  save: 'Approve with edits',
  cancel: 'Cancel',
  noteLabel: 'Note to your athlete (optional)',
  notePlaceholder: 'One line they will see with the update',
  empty: 'Nothing to draft this week. Drafts come from logged sessions, so they appear once your athletes train.',
  notReady: 'Approvals switch on when the drafts table is set up. You can read this week’s drafts now.',
  held: 'Held back',
  context: 'What the draft read',
  ai: 'Wording by the AI coach. The changes are FEL’s rules.',
  stale: 'The program changed since this was drafted. Reload to draft again.',
} as const;

export const SAFETY_LABEL: Record<'safe' | 'review' | 'unsafe', string> = {
  safe: 'Safe',
  review: 'Review',
  unsafe: 'Held',
};

export const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const DECISION_LABEL: Record<'approved' | 'edited' | 'rejected', string> = {
  approved: 'Approved',
  edited: 'Approved with edits',
  rejected: 'Rejected',
};

/** Why a client has no draft. The teen gate's own refusals, said to the coach without a birth year or a guardian name. */
export const SKIP_COPY: Record<string, string> = {
  guardian_consent_required: 'Under 18: no draft until a guardian approves coach training.',
  under_13: 'Coaching on FEL is for players 13 and up.',
  age_required: 'No birth year on file yet: no draft until they add one.',
  out: 'You marked them Out: nothing drafted this week.',
  not_on_roster: 'Not on your roster.',
};

// ── the reasons the engine writes ──────────────────────────────────────────────────────────────────────────────────

/** SAFETY-COPY. The coach reads this on an ease-off drafted from a pain flag. */
export function easeOffReason(o: { detailed: boolean; hardStop: boolean; teen: boolean; items: string[] }): string {
  const what = o.detailed && o.items.length
    ? `They reported pain on ${o.items.join(', ')} in the last two weeks.`
    // no more than the attention board's own generic flag says (lib/health/pain.ts coachPainFlag: "Client paused an exercise")
    : 'They paused an exercise in the last two weeks (the details are shared only with their consent).';
  if (o.hardStop) {
    return `${what} The check-in told them to stop that exercise and ${o.teen ? 'tell an adult' : 'check with a clinician'}. Ease off this week, and do not load it again until they have.`;
  }
  return `${what} Ease off this week. If whatever paused it has not settled, they should see a professional before you load it again.`;
}

/** SAFETY-COPY. What the athlete reads once an ease-off is approved. */
export function easeOffClientLine(teen: boolean): string {
  return teen
    ? 'An easier week: fewer sets and lighter work. If something still hurts, stop and tell an adult and your coach.'
    : 'An easier week: fewer sets and lighter work. If something still hurts, stop, tell your coach, and check with a clinician before you load it again.';
}

export const CHECK_IN_TITLE = 'Check in with them';
export const DELOAD_CLIENT_LINE = 'A lighter week to recover: the same exercises, fewer sets, a little less weight.';
export const COMPLIANCE_CLIENT_LINE = 'A shorter week so it fits: fewer sets on the support work. The main lift stays.';

/** The athlete's line for one changed exercise. */
export function rowClientLine(kind: 'progress_load' | 'progress_volume' | 'regress_load' | 'regress_volume', name: string, what: string): string {
  switch (kind) {
    case 'progress_load': return `${name} moves up: ${what}. You earned it.`;
    case 'progress_volume': return `${name}: one more set (${what}).`;
    case 'regress_load': return `${name} comes down a step (${what}) so every rep stays clean.`;
    case 'regress_volume': return `${name}: one set fewer this week (${what}).`;
  }
}

export const swapClientLine = (to: string, from: string) => `${to} in place of ${from} this week.`;
export const correctiveClientLine = (name: string) => `New in your Prep: ${name}.`;

/**
 * Words the AI layer's text must not contain: medical claims (diagnosis, treatment, injury talk). A note that names one
 * is dropped and the rules' own words stand. Matches lib/coach/aiSystemPrompt.ts's rules (never a diagnosis, a condition
 * name, or "prevents injury"), checked in code rather than trusted to the model.
 */
export const MEDICAL_WORDS = /\b(diagnos\w*|treat(?:s|ed|ing|ment)?|cure\w*|heal(?:s|ed|ing)?|injur\w*|rehab\w*|physio\w*|tendin\w*|tear|torn|sprain\w*|strained|fractur\w*|inflam\w*|medic\w*|prescri\w*|therap\w*|condition|syndrome|disorder|surgery|doctor)\b/i;
