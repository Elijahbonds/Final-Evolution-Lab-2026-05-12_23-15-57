import { SCREEN_CONTACT_EMAIL } from '@/lib/screen/copy';

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** A calendar file for a coaching call. No location line, so no address is ever in the file. */
export function coachingIcs(input: { bookingId: string; startsAt: Date; endsAt: Date; url: string }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Final Evolution LLC//Coach Store//EN',
    'BEGIN:VEVENT',
    `UID:${input.bookingId}@finalevolutiongroup.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(input.startsAt)}`,
    `DTEND:${stamp(input.endsAt)}`,
    'SUMMARY:Coaching call with Elijah Bonds',
    `URL:${input.url}`,
    `ORGANIZER:mailto:${SCREEN_CONTACT_EMAIL}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// ── COACH-DELIVERY COA-05 (2026-10-26): a calendar FEED (a coach's roster sessions, an athlete's sessions) ──────────────
//
// RFC 5545 basics, held by tests/coach-delivery/schedule.test.ts: CRLF line ends; content lines folded at 75 octets with
// CRLF + one space; TEXT values escaped (backslash, semicolon, comma, newline); one VCALENDAR with VERSION 2.0, PRODID,
// CALSCALE and METHOD:PUBLISH; each VEVENT with UID, DTSTAMP, DTSTART and DTEND in UTC ('Z'); a cancelled session stays
// in the feed as STATUS:CANCELLED so a subscribed calendar removes it. LOCATION is the coach's venue name only (the form
// refuses a street address: lib/coach-store/address.ts addressRejected), never anyone's home.

/** RFC 5545 §3.3.11 TEXT escaping. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** RFC 5545 §3.1 folding: no line longer than 75 octets; a continuation starts with one space. Never splits a character. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface FeedEvent { uid: string; startsAt: Date; endsAt: Date; title: string; place?: string | null; description?: string | null; cancelled?: boolean; updatedAt?: Date }

/** A whole calendar feed. `name` is the calendar's name in the subscriber's app. */
export function calendarFeedIcs(input: { name: string; events: readonly FeedEvent[]; now?: Date }): string {
  const now = input.now ?? new Date();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Final Evolution LLC//Coach Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(input.name)}`,
  ];
  for (const e of input.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@finalevolutiongroup.com`,
      `DTSTAMP:${stamp(e.updatedAt ?? now)}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(e.endsAt)}`,
      `SUMMARY:${icsText(e.title)}`,
      ...(e.place ? [`LOCATION:${icsText(e.place)}`] : []),
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
