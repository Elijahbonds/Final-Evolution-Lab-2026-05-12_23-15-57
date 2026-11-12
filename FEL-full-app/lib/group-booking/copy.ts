// lib/group-booking/copy.ts — GROUP-BOOKING: the words. DRAFT PRODUCT COPY for the owner, short and plain. Every amount
// comes from config.ts; no refund term is written here. The cancel line is the owner's rule of 2026-11-02, shown as one
// line at booking — it is NOT terms text (no terms page was touched; adding it to the terms is the owner's call).
import { dollars, type GroupConfig } from './config';
import type { JoinKind, MakeupRefusal } from './rules';

/** The owner's cancel rule, one line (2026-11-02). */
export function cancelRuleLine(cfg: GroupConfig): string {
  return `Cancel ${cfg.cancelFreeHours}h+ ahead: free (a package keeps the session). Later, or a no-show: the session counts as used.`;
}

export function joinTitle(kind: JoinKind, cfg: GroupConfig): string {
  if (kind === 'drop_in') return 'Drop in · 1 session';
  if (kind === 'package') return `${cfg.packageWeeks} weeks · ${cfg.packageSessions} sessions`;
  return `Full ${cfg.weeks} weeks · ${cfg.packageSessions * Math.max(1, Math.round(cfg.weeks / cfg.packageWeeks))} sessions`;
}

/** "$65 · pay at the gym". */
export const payAtGymPrice = (cents: number) => `${dollars(cents)} · pay at the gym`;

export const lateJoinLine = (dropInCents: number) => `Joining late? Drop in for ${dollars(dropInCents)} a session.`;

export const GROUP_COPY = {
  title: 'Groups',
  lede: (min: number, max: number, weeks: number) => `Small-group training at a gym near you. ${min}–${max} people, ${weeks} weeks.`,
  opensSoon: 'Opens soon',
  reserve: 'Reserve, pay at the gym',
  reserving: 'Reserving…',
  join: 'Join',
  full: 'Full · join the waitlist',
  waitlistJoin: 'Join the waitlist',
  waitlisted: "You're on the waitlist. The coach will reach out if a seat opens.",
  reserved: 'Reserved. Pay at the gym when you arrive.',
  reservedOnline: 'Reserved. Opening checkout…',
  signIn: 'Sign in to reserve',
  seatsLeft: (n: number) => (n === 1 ? '1 seat left' : `${n} seats left`),
  any: 'All',
  makeup: 'Make-up',
  mine: 'Your sessions',
  noneMine: 'No sessions booked yet.',
  bookOneOnOne: 'Book a 1:1 session',
  addressSoon: 'Address coming soon',
  /** EVERY-SCREEN P5: the Train rows' line: the groups page's own eyebrow (app/groups/page.tsx), not new words */
  inPerson: 'Train in person',
} as const;

// EVERY-SCREEN P1 (2026-11-10): what a switched-off booking screen says besides "Opens soon": why, and what to do
// instead (docs/PLAN-EVERY-SCREEN-10PHASE.md, phase 1's gate). DRAFT PRODUCT COPY for the owner, like the rest of this
// file: no date is promised, no price is named, and nothing about how the app is built is said.
export const GROUP_DARK = {
  groups: { why: "Group training isn't open for booking yet.", instead: { href: '/train', label: 'Train on your own today' } },
  oneOnOne: { why: "1:1 sessions aren't open for booking yet.", instead: { href: '/train', label: 'Train on your own today' } },
  coach: { why: "Group classes aren't switched on yet. Your roster and programs work today.", instead: { href: '/coach', label: 'Back to your roster' } },
} as const;

export const MAKEUP_REFUSAL_COPY: Record<MakeupRefusal, string> = {
  not_package: 'Make-ups come with a package.',
  not_missed: 'Only a missed or cancelled session can be made up.',
  already_made_up: 'That session has been made up already.',
  wrong_gym: 'Make-ups are at your group\'s gym.',
  not_makeup_slot: 'Pick a Friday or Saturday make-up time.',
  wrong_week: 'Make up a session the same week or the next.',
  past_package_end: 'Make-ups end when your package does.',
  past: 'That time has passed.',
  full: 'That make-up time is full. Pick another.',
};

/** What each refusal from the routes reads as. */
export const ERROR_COPY: Record<string, string> = {
  group_booking_not_ready: 'Opens soon.',
  unauthorized: 'Sign in first.',
  full: 'That group just filled. Join the waitlist instead.',
  already_booked: "You're already booked in one of those sessions.",
  not_open: 'That group is not taking people right now.',
  bad_option: 'That option is not available any more.',
  not_found: 'Not found.',
  under_13: 'Training on FEL is for players 13 and up.',
  age_required: 'Tell us the year you were born first.',
  guardian_consent_required: 'A parent or guardian needs to say yes first.',
  slot_taken: 'That time was just taken. Pick another.',
  bad_slot: 'That time is not open. Pick another.',
  not_bookable: 'That coach is not taking bookings yet.',
  bad_gym: 'Pick one of the gyms.',
  too_late: 'That session has started.',
};

export const errorLine = (code: unknown): string => ERROR_COPY[String(code)] ?? 'Not saved. Try again.';
