// lib/every-screen/notices — EVERY-SCREEN P6 (owner, 2026-11-11): "Approved notices don't count toward the 40-word
// budget. Medical, privacy and consent text is the owner's approved wording: it stays word for word but no longer counts.
// Everything else still counts."
//
// HOW A NOTICE IS MARKED, honestly: the element that renders one gets `{...notice(kind)}` (data-notice="medical" etc.), and
// the scorer (scripts/every-screen/inpage.ts) leaves the words inside it out of the first screen's count. Nothing guesses
// from the words. tests/every-screen/notices.test.ts holds every use to this list: each `notice(...)` renders one of the
// constants below, imported from the module named here, with the kind named here. A paragraph that is not on this list
// cannot be marked, and an unmarked paragraph always counts.
//
// Client-safe; pure.

export type NoticeKind = 'medical' | 'privacy' | 'consent';

/** The approved notices: the copy module, the constant's name, and its kind. Adding one is adding its wording here. */
export const APPROVED_NOTICES: readonly { from: string; name: string; kind: NoticeKind }[] = [
  { from: '@/lib/screen/copy', name: 'DISCLAIMER', kind: 'medical' },
  { from: '@/lib/screen/copy', name: 'STOP_LINE', kind: 'medical' },
  { from: '@/lib/screen/copy', name: 'NOT_SAVED_BODY', kind: 'privacy' },
  { from: '@/lib/screen/copy', name: 'DEVICE_ONLY_LINE', kind: 'privacy' },
  { from: '@/lib/coach/readiness/copy', name: 'NOT_A_DIAGNOSIS', kind: 'medical' },
  { from: '@/lib/vbt/copy', name: 'PRIVACY_LINE', kind: 'privacy' },
  { from: '@/lib/sprint/copy', name: 'PRIVACY_LINE', kind: 'privacy' },
  { from: '@/lib/hoops-cam/copy', name: 'PRIVACY_LINE', kind: 'privacy' },
  { from: '@/lib/consent/guardian-copy', name: 'CONSENT_DONE_LINE', kind: 'consent' },
  { from: '@/lib/consent/guardian-copy', name: 'CONSENT_UNDER_18_LINE', kind: 'privacy' },
  // COACH-WORDS (2026-11-12): proposed by lane/coach-words, word for word as the screens showed them; the owner approves or
  // rejects each in docs/COACH-WORDING-REVIEW.md
  { from: '@/lib/coach-business/highlight-copy', name: 'HIGHLIGHT_CONSENT_LINE', kind: 'consent' },
  { from: '@/lib/session-setup/copy', name: 'COURT_NAMES_LINE', kind: 'privacy' },
  { from: '@/lib/session-setup/copy', name: 'COURT_NUMBERS_KEPT_LINE', kind: 'privacy' },
  { from: '@/lib/session-setup/copy', name: 'COURT_NUMBERS_NOT_SENT_LINE', kind: 'privacy' },
];

/** The attribute for an approved notice's element: `<p {...notice('medical')}>{DISCLAIMER}</p>`. */
export const notice = (kind: NoticeKind): { 'data-notice': NoticeKind } => ({ 'data-notice': kind });
