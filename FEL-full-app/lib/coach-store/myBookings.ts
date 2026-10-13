/**
 * "Your bookings" (/account/bookings): what a buyer sees for each coach-store purchase they made as the client, and which
 * actions that row offers. Pure: no prisma, no next/*, so the rules are testable without a database.
 *
 * Owner 2026-10-13: a buyer could not get back to a paid video review or live call after leaving the thanks page.
 * Every action reuses the rule that already decides it, so this page cannot disagree with the rest of the store:
 *   Upload clips / Open review  reviewHref + reviewStudioOpen (lib/coach-store/reviewLink.ts): a PAID video_review
 *   Join call                   decideJoin (lib/coach-store/policy.ts): the same window and checks the call route uses
 *   Add to calendar             icsFor (lib/coach-store/api.ts), injected, for a PAID live_1on1 that has not ended
 *   Receipt                     /api/coach-store/receipt/[id]: exists only for a PAID booking (receiptFor)
 */

import { JOIN_EARLY_MIN } from './constants';
import { decideJoin } from './policy';
import { reviewHref, reviewStudioOpen } from './reviewLink';

/** Rows that never became a purchase (an unpaid hold, an expired hold) are not "bookings" to the buyer. */
export const HIDDEN_BOOKING_STATUSES = ['HELD', 'EXPIRED'] as const;

export interface BookingRowInput {
  id: string;
  kind: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  submittedAt: Date | null;
  deliveredAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  clientTimeZone: string | null;
}

export interface BookingAction { label: string; href: string }

export interface BookingRowView {
  id: string;
  /** "Live call" / "Video review" (a friendly kind). */
  title: string;
  /** Plain-words state. */
  statusLine: string;
  /** When the call is, in the buyer's own time zone; null for a review. */
  whenLine: string | null;
  /** Upload clips / Open review. */
  review: BookingAction | null;
  /** Join call, only inside the join window. */
  join: BookingAction | null;
  /** Why there is no Join button yet or any more. */
  joinHint: string | null;
  /** A calendar file for a live call that has not ended; the page hands it to the Add to calendar button. */
  calendarIcs: string | null;
  /** Receipt, only for a PAID row. */
  receipt: BookingAction | null;
}

const KIND_TITLE: Record<string, string> = { live_1on1: 'Live 1:1 call', video_review: 'Video review' };

function zoneOrUtc(zone: string | null): string {
  if (!zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

/** "Tue, Oct 13, 2026, 4:30 PM PDT", in the zone the buyer booked in (UTC when it is missing or not a zone). */
export function formatWhen(startsAt: Date, zone: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: zoneOrUtc(zone), timeZoneName: 'short',
  }).format(startsAt);
}

const STATUS_TEXT: Record<string, string> = {
  PAID: 'Paid',
  REFUND_DUE: 'Refund on its way',
  REFUNDED: 'Refunded',
  CANCELED: 'Cancelled',
  CANCELLED: 'Cancelled',
  REVERSED: 'Reversed',
  DISPUTED: 'Under dispute',
  COMPLETED: 'Completed',
};

export function bookingRowView(
  b: BookingRowInput,
  now: Date,
  makeIcs: (bookingId: string, startsAt: Date, endsAt: Date) => string | null,
): BookingRowView {
  const paid = b.status === 'PAID';
  const live = b.kind === 'live_1on1';
  let statusLine = STATUS_TEXT[b.status] ?? 'In progress';

  let review: BookingAction | null = null;
  if (reviewStudioOpen(b)) {
    if (b.deliveredAt) {
      statusLine = 'Review delivered';
      review = { label: 'Open review', href: reviewHref(b.id) };
    } else if (b.submittedAt) {
      statusLine = 'Waiting for your coach';
      review = { label: 'Open review', href: reviewHref(b.id) };
    } else {
      statusLine = 'Waiting for your clips';
      review = { label: 'Upload clips', href: reviewHref(b.id) };
    }
  }

  let join: BookingAction | null = null;
  let joinHint: string | null = null;
  let calendarIcs: string | null = null;
  if (live && paid && b.startsAt && b.endsAt) {
    // The same decision the call route makes (joinCall). Adult is passed true: a minor cannot buy a live call (18+),
    // and the route still checks it when the buyer joins.
    const decision = decideJoin({ isParty: true, isAdult: true, status: b.status, kind: b.kind, startsAt: b.startsAt, endsAt: b.endsAt, now });
    if (decision.ok) {
      join = { label: 'Join call', href: `/session/${encodeURIComponent(b.id)}` };
      statusLine = 'Ready to join';
    } else if (decision.status === 410) {
      statusLine = 'Call ended';
    } else {
      joinHint = `The room opens ${JOIN_EARLY_MIN} minutes before your call.`;
      statusLine = 'Booked';
    }
    if (b.endsAt.getTime() > now.getTime()) calendarIcs = makeIcs(b.id, b.startsAt, b.endsAt);
  }

  return {
    id: b.id,
    title: KIND_TITLE[b.kind] ?? 'Coaching',
    statusLine,
    whenLine: live && b.startsAt ? formatWhen(b.startsAt, b.clientTimeZone) : null,
    review,
    join,
    joinHint,
    calendarIcs,
    receipt: paid ? { label: 'Receipt', href: `/api/coach-store/receipt/${encodeURIComponent(b.id)}` } : null,
  };
}
