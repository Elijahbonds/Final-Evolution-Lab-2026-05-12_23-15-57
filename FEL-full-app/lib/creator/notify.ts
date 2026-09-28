/**
 * Booking notifications — a stub. No email is sent in Phase 1.
 *
 * The webhook calls this once a booking is confirmed (or lands in CONFLICT, which needs a person). When
 * sending is built, it goes here and nowhere else, so the webhook does not change.
 */

import type { BookingRecord } from './creatorStore';

export interface NotifyResult {
  sent: false;
  reason: 'NOT_IMPLEMENTED';
}

export async function notifyBooking(booking: BookingRecord): Promise<NotifyResult> {
  void booking;
  return { sent: false, reason: 'NOT_IMPLEMENTED' };
}
