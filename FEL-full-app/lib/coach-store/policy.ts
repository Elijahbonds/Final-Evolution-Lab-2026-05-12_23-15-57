import { CHECKOUT_EXPIRE_MINUTES, HOLD_MINUTES, JOIN_EARLY_MIN, JOIN_LATE_MIN } from './constants';

export interface CancelPolicy {
  /** Hours before start during which cancel and reschedule are still free. */
  clientFullRefundHours: number;
  reschedulesUsed: number;
  startsAt: Date;
  now: Date;
}

export type CancelDecision =
  | { ok: true; refund: true; consumesReschedule: false }
  | { ok: true; refund: false; consumesReschedule: true }
  | { ok: false; error: 'too_late' | 'reschedule_used' | 'no_start' };

/** Free until the configured window. Inside it: no refund, and one reschedule. Connection-failure reschedule is a different path. */
export function decideCancel(input: CancelPolicy, mode: 'cancel' | 'reschedule'): CancelDecision {
  if (!input.startsAt) return { ok: false, error: 'no_start' };
  const hours = (input.startsAt.getTime() - input.now.getTime()) / 3_600_000;
  const free = hours >= input.clientFullRefundHours;
  if (mode === 'cancel') {
    if (free) return { ok: true, refund: true, consumesReschedule: false };
    return { ok: false, error: 'too_late' };
  }
  if (free) return { ok: true, refund: true, consumesReschedule: false };
  if (input.reschedulesUsed >= 1) return { ok: false, error: 'reschedule_used' };
  return { ok: true, refund: false, consumesReschedule: true };
}

/** A connection failure is always a free reschedule and does not consume the one inside-window reschedule. */
export function connectionFailureReschedule(): { refund: false; consumesReschedule: false } {
  return { refund: false, consumesReschedule: false };
}

export type JoinDecision =
  | { ok: true }
  | { ok: false; status: 403; error: 'not_open_yet' }
  | { ok: false; status: 410; error: 'session_ended' }
  | { ok: false; status: 403; error: 'not_adult' }
  | { ok: false; status: 404; error: 'not_found' };

export function decideJoin(input: {
  isParty: boolean;
  isAdult: boolean;
  status: string;
  kind: string;
  startsAt: Date | null;
  endsAt: Date | null;
  now: Date;
}): JoinDecision {
  if (!input.isParty) return { ok: false, status: 404, error: 'not_found' };
  if (input.kind !== 'live_1on1' || input.status !== 'PAID') return { ok: false, status: 404, error: 'not_found' };
  if (!input.isAdult) return { ok: false, status: 403, error: 'not_adult' };
  if (!input.startsAt || !input.endsAt) return { ok: false, status: 403, error: 'not_open_yet' };
  const open = input.startsAt.getTime() - JOIN_EARLY_MIN * 60_000;
  const close = input.endsAt.getTime() + JOIN_LATE_MIN * 60_000;
  if (input.now.getTime() < open) return { ok: false, status: 403, error: 'not_open_yet' };
  if (input.now.getTime() > close) return { ok: false, status: 410, error: 'session_ended' };
  return { ok: true };
}

export function holdExpiresAt(now: Date): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

export function checkoutExpiresAtUnix(now: Date): number {
  return Math.floor(now.getTime() / 1000) + CHECKOUT_EXPIRE_MINUTES * 60;
}
