import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { BookingRow, HostingPanel, NOT_POSTED, doubleBookedNote, type BookingWithLink } from './join-links';
import { BOOKED_TOAST, BOOKING_REFUSED } from '@/components/sessions-view';

// /sessions took the shards and said "Booked! See you there." with no way in. Owner decision 2026-09-24: a join link
// the coach pastes, shown to the booked player. The server decides who gets a link (lib/sessions/joinLinkRoutes.test.ts);
// this is how the page shows one.
const start = Date.parse('2026-09-26T00:30:00.000Z');
const booking = (over: Partial<BookingWithLink> = {}): BookingWithLink => ({
  id: 'b1', kind: 'group_workout', sessionKey: 'gw_2026-09-25', startsAt: new Date(start).toISOString(), shardsPaid: 150,
  joinUrl: null, joinHost: null, ...over,
});
const row = (b: BookingWithLink, nowMs = start - 3_600_000) => renderToStaticMarkup(createElement(BookingRow, { b, nowMs }));

describe('/sessions, a booking and its join link', () => {
  it('renders a posted link as a plain link that opens in a new tab with no opener or referrer, with its host beside it', () => {
    const m = row(booking({ joinUrl: 'https://us02web.zoom.us/j/81234567890?pwd=AbC123', joinHost: 'us02web.zoom.us' }));
    expect(m).toMatch(/<a href="https:\/\/us02web\.zoom\.us\/j\/81234567890\?pwd=AbC123" target="_blank" rel="noopener noreferrer"/);
    expect(m).toContain('Join session');
    expect(m).toContain('opens us02web.zoom.us');
    expect(m).not.toContain(NOT_POSTED);
  });

  it('still names the host when the answer carried only the link', () => {
    expect(row(booking({ joinUrl: 'https://meet.google.com/abc-defg-hij', joinHost: null }))).toContain('opens meet.google.com');
  });

  it('says the link is not posted yet, and where it will appear, until it exists', () => {
    const m = row(booking());
    expect(m).toContain('Link not posted yet — it appears here before the start');
    expect(m).not.toContain('<a ');
  });

  it('never renders a link that is not https, whatever the server sent', () => {
    for (const joinUrl of ['javascript:alert(1)', 'http://zoom.us/j/1', 'data:text/html,hi']) {
      const m = row(booking({ joinUrl, joinHost: 'zoom.us' }));
      expect(m, joinUrl).not.toContain('<a ');
      expect(m, joinUrl).toContain(NOT_POSTED);
    }
  });

  it('stops promising a link once the session is over', () => {
    const m = row(booking({ joinUrl: 'https://zoom.us/j/1', joinHost: 'zoom.us' }), start + 2 * 3_600_000);
    expect(m).toContain('This session has ended.');
    expect(m).not.toContain('<a ');
  });

  it('shows the start in the viewer\'s own time zone, with the zone named, not a fixed PT', () => {
    const m = row(booking());
    const local = new Date(start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    expect(m).toContain(local);
  });
});

describe('/sessions, the host\'s panel', () => {
  it('lists each slot with its booked count, the posted link\'s host, and a box to paste into', () => {
    const m = renderToStaticMarkup(createElement(HostingPanel, {
      onChanged: () => {},
      rows: [
        { sessionKey: 'gw_2026-09-25', kind: 'group_workout', startsAtIso: new Date(start).toISOString(), booked: 12, url: 'https://meet.google.com/abc-defg-hij', host: 'meet.google.com' },
        { sessionKey: 'pv_2026-09-28_16', kind: 'private_1on1', startsAtIso: new Date(start + 3 * 86_400_000).toISOString(), booked: 1, url: null, host: null },
      ],
    }));
    expect(m).toContain('12 booked');
    expect(m).toContain('opens meet.google.com');
    expect(m).toMatch(/rel="noopener noreferrer"/);
    expect(m).toContain('No link posted yet.');
    expect(m.match(/<input type="url"/g)).toHaveLength(2);
    expect(m).toContain('maxLength="500"');
  });

  it('tells the host when two players hold one private slot, and who sees its link', () => {
    const at = new Date(start).toISOString();
    const m = renderToStaticMarkup(createElement(HostingPanel, {
      onChanged: () => {},
      rows: [
        { sessionKey: 'pv_2026-09-28_16', kind: 'private_1on1', startsAtIso: at, booked: 2, url: null, host: null },
        { sessionKey: 'pv_2026-09-28_17', kind: 'private_1on1', startsAtIso: at, booked: 1, url: null, host: null },
        { sessionKey: 'gw_2026-09-25', kind: 'group_workout', startsAtIso: at, booked: 40, url: null, host: null },
      ],
    }));
    expect(m.match(/players booked this private slot/g)).toHaveLength(1);
    expect(m).toContain(doubleBookedNote(2));
    expect(doubleBookedNote(2)).toBe('2 players booked this private slot. Only the first to book sees the link.');
  });

  it('renders nothing for a viewer who hosts nothing', () => {
    expect(renderToStaticMarkup(createElement(HostingPanel, { rows: [], onChanged: () => {} }))).toBe('');
  });
});

describe('/sessions, the copy', () => {
  it('a booking says where the join link will appear, not just "see you there"', () => {
    expect(BOOKED_TOAST).toMatch(/join link/i);
    expect(BOOKED_TOAST).toMatch(/Your upcoming sessions/);
    expect(BOOKED_TOAST).not.toMatch(/See you there/);
  });

  it('a refused booking says why in plain words: full, or a private slot somebody just took', () => {
    expect(BOOKING_REFUSED.session_full).toBe('That session is full.');
    expect(BOOKING_REFUSED.slot_taken).toBe('Someone just booked that private slot. Pick another time.');
  });

  it('the page no longer offers seminars, which the booking route refuses', () => {
    const src = readFileSync('components/sessions-view.tsx', 'utf8');
    expect(src).not.toMatch(/seminar/i);
    expect(src).not.toMatch(/grab a seat/i);
  });
});
