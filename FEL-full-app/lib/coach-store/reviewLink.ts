/**
 * Who reaches the video review studio, and how.
 *
 * KNOWN GAP (found 2026-10-08 by #105's nested orphan walk): /coach/review/[bookingId] had no link anywhere. The coach
 * dashboard listed bookings without one, the buyer's thanks page had none, and the page never told the studio it was
 * the coach looking — so the reply tools could not open even from a typed URL. This module is the one place that says
 * which booking gets a studio and which side of it a signed-in person sees. No imports: the thanks page is a client
 * component and must not pull the storage signer into the browser bundle.
 */

export type ReviewRole = 'coach' | 'client';

export function reviewHref(bookingId: string): string {
  return `/coach/review/${encodeURIComponent(bookingId)}`;
}

/** A paid video review has a studio. Delivery does not change the status, so a delivered one keeps its link. */
export function reviewStudioOpen(booking: { kind: string; status: string }): boolean {
  return booking.kind === 'video_review' && booking.status === 'PAID';
}

/**
 * The coach side needs the booking's coach AND the allowlist, the same pair deliverReview checks. The client side is
 * the buyer. Anyone else gets nothing (the page 404s, matching the API's not_found).
 */
export function reviewRole(
  booking: { coachUserId: string; clientUserId: string },
  userId: string,
  allowlistedCoach: boolean,
): ReviewRole | null {
  if (booking.coachUserId === userId && allowlistedCoach) return 'coach';
  if (booking.clientUserId === userId) return 'client';
  return null;
}
