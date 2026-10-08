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
