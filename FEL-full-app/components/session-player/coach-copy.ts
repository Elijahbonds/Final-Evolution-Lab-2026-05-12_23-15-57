// components/session-player/coach-copy.ts — PLAT-P06 (2026-10-28): the coached session's own words, on Today's launcher
// and in the player. DRAFT PRODUCT COPY for the Owner Inbox: short, plain, no medical words
// (tests/coach-athlete-loop/copy.test.ts screens them). Every movement word (names, set-ups, cues) is the route's,
// unchanged; the coach's reply is the coach's.

export const COACH_PLAYER_COPY = {
  /** Today's one primary. */
  start: "Start today's session",
  /** The finish button. */
  backToToday: 'Back to Today',
  /** The finish line once the session saved. */
  saved: 'Saved. Your coach will see it.',
  /** The log row's heading in a rest: "Set 2 · Goblet Squat". */
  setOf: (n: number, name: string) => `Set ${n} · ${name}`,
  /** The launcher's rows: one line each, each opening its own sheet. */
  rows: {
    feel: 'How you feel',
    checkin: 'Check-in',
    habits: 'Habits',
    plan: 'Full session',
    thread: 'Messages',
    schedule: 'Schedule',
  },
  rowsLabel: 'Today',
  /** The reply card's label. */
  replyFrom: (coach: string) => `Coach ${coach}`,
  close: 'Close',
  /** No program, no coach link (moved here from /training). */
  noCoachTitle: 'No coach yet',
  noCoachLine: "Accept a coach's invite link and their plan shows up here.",
  noCoachCta: 'Go and train',
  /** A coach link, no program yet. */
  noProgramTitle: 'No program yet',
  noProgramLine: 'Your coach has not sent a plan yet.',
} as const;
