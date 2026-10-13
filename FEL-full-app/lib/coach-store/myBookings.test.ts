// "Your bookings" (owner 2026-10-13): each action on a row is decided by the rule the rest of the store already uses.
import { describe, expect, it } from 'vitest';
import { JOIN_EARLY_MIN, JOIN_LATE_MIN } from './constants';
import { HIDDEN_BOOKING_STATUSES, bookingRowView, formatWhen, type BookingRowInput } from './myBookings';
import { reviewHref } from './reviewLink';

const NOW = new Date('2026-10-13T20:00:00.000Z');
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const ics = (id: string, s: Date, e: Date) => `ICS:${id}:${s.toISOString()}:${e.toISOString()}`;

function row(over: Partial<BookingRowInput>): BookingRowInput {
  return {
    id: 'bk_1', kind: 'video_review', status: 'PAID', startsAt: null, endsAt: null, submittedAt: null, deliveredAt: null,
    dueAt: null, createdAt: NOW, clientTimeZone: 'America/Los_Angeles', ...over,
  };
}
const call = (startOffsetMin: number, over: Partial<BookingRowInput> = {}) =>
  row({ kind: 'live_1on1', startsAt: min(startOffsetMin), endsAt: min(startOffsetMin + 30), ...over });

describe('video review rows', () => {
  it('a paid review with no clips yet says Upload clips, to the review studio', () => {
    const v = bookingRowView(row({}), NOW, ics);
    expect(v.review).toEqual({ label: 'Upload clips', href: reviewHref('bk_1') });
    expect(v.statusLine).toBe('Waiting for your clips');
    expect(v.join).toBeNull();
    expect(v.calendarIcs).toBeNull();
    expect(v.whenLine).toBeNull();
  });

  it('once clips are submitted, or the review is delivered, it says Open review', () => {
    expect(bookingRowView(row({ submittedAt: NOW }), NOW, ics).review).toEqual({ label: 'Open review', href: '/coach/review/bk_1' });
    const delivered = bookingRowView(row({ submittedAt: NOW, deliveredAt: NOW }), NOW, ics);
    expect(delivered.review?.label).toBe('Open review');
    expect(delivered.statusLine).toBe('Review delivered');
  });

  it('a review that is not paid has no studio link (refunded, refund due, cancelled)', () => {
    for (const status of ['REFUNDED', 'REFUND_DUE', 'CANCELED', 'REVERSED', 'DISPUTED']) {
      expect(bookingRowView(row({ status }), NOW, ics).review, status).toBeNull();
    }
  });
});

describe('live call rows: Join call, inside the join window only', () => {
  it('opens JOIN_EARLY_MIN before the start, to the call room', () => {
    expect(bookingRowView(call(JOIN_EARLY_MIN + 1), NOW, ics).join).toBeNull();
    expect(bookingRowView(call(JOIN_EARLY_MIN), NOW, ics).join).toEqual({ label: 'Join call', href: '/session/bk_1' });
    expect(bookingRowView(call(0), NOW, ics).join?.href).toBe('/session/bk_1');
    expect(bookingRowView(call(0), NOW, ics).statusLine).toBe('Ready to join');
  });

  it('before the window it says when the room opens; there is no Join button', () => {
    const v = bookingRowView(call(120), NOW, ics);
    expect(v.join).toBeNull();
    expect(v.joinHint).toContain(`${JOIN_EARLY_MIN} minutes before`);
    expect(v.statusLine).toBe('Booked');
  });

  it('stays open JOIN_LATE_MIN after the end, then the call has ended', () => {
    const endedMinAgo = (n: number) => call(-30 - n); // ends n minutes ago
    expect(bookingRowView(endedMinAgo(JOIN_LATE_MIN), NOW, ics).join).not.toBeNull();
    const gone = bookingRowView(endedMinAgo(JOIN_LATE_MIN + 1), NOW, ics);
    expect(gone.join).toBeNull();
    expect(gone.statusLine).toBe('Call ended');
    expect(gone.joinHint).toBeNull();
  });

  it('no Join for an unpaid or refunded call, or one with no times', () => {
    for (const status of ['REFUNDED', 'REFUND_DUE', 'CANCELED']) {
      expect(bookingRowView(call(0, { status }), NOW, ics).join, status).toBeNull();
    }
    expect(bookingRowView(call(0, { startsAt: null, endsAt: null }), NOW, ics).join).toBeNull();
  });
});

describe('Add to calendar', () => {
  it('is offered for a paid live call that has not ended, built by the injected icsFor', () => {
    const v = bookingRowView(call(120), NOW, ics);
    expect(v.calendarIcs).toBe(`ICS:bk_1:${min(120).toISOString()}:${min(150).toISOString()}`);
  });
  it('not for an ended call, a review, an unpaid call, or when no site origin gives it a URL', () => {
    expect(bookingRowView(call(-120), NOW, ics).calendarIcs).toBeNull();
    expect(bookingRowView(row({}), NOW, ics).calendarIcs).toBeNull();
    expect(bookingRowView(call(120, { status: 'REFUNDED' }), NOW, ics).calendarIcs).toBeNull();
    expect(bookingRowView(call(120), NOW, () => null).calendarIcs).toBeNull();
  });
});

describe('Receipt and the rest of the row', () => {
  it('a receipt link only for a PAID booking (the receipt route 404s otherwise)', () => {
    expect(bookingRowView(row({}), NOW, ics).receipt).toEqual({ label: 'Receipt', href: '/api/coach-store/receipt/bk_1' });
    expect(bookingRowView(call(5), NOW, ics).receipt?.href).toBe('/api/coach-store/receipt/bk_1');
    for (const status of ['REFUNDED', 'REFUND_DUE', 'CANCELED', 'COMPLETED']) {
      expect(bookingRowView(row({ status }), NOW, ics).receipt, status).toBeNull();
    }
  });

  it('ids are encoded in every link', () => {
    const v = bookingRowView(call(5, { id: 'a/b' }), NOW, ics);
    expect(v.join?.href).toBe('/session/a%2Fb');
    expect(v.receipt?.href).toBe('/api/coach-store/receipt/a%2Fb');
  });

  it('an unpaid hold or an expired one is not a booking to the buyer', () => {
    expect([...HIDDEN_BOOKING_STATUSES].sort()).toEqual(['EXPIRED', 'HELD']);
  });

  it('shows the call time in the buyer\'s own zone, and falls back to UTC for a missing or bad zone', () => {
    const at = new Date('2026-10-13T23:30:00.000Z');
    expect(formatWhen(at, 'America/Los_Angeles')).toContain('4:30 PM PDT');
    expect(formatWhen(at, null)).toContain('11:30 PM UTC');
    expect(formatWhen(at, 'Not/AZone')).toContain('11:30 PM UTC');
  });

  it('titles are plain words', () => {
    expect(bookingRowView(row({}), NOW, ics).title).toBe('Video review');
    expect(bookingRowView(call(5), NOW, ics).title).toBe('Live 1:1 call');
  });
});
