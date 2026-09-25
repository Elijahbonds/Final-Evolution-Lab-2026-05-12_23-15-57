import { describe, expect, it } from 'vitest';
import {
  JOIN_URL_MAX, JOIN_LINK_ERROR_COPY, normaliseJoinUrl, isSessionKey, readableKeys, mayPostJoinLink, sessionEnded, hostingRows, slotCoachId,
  privateHolders, isPrivateKey, LONGEST_SESSION_MIN,
} from './joinLink';

const refused = (raw: unknown) => {
  const r = normaliseJoinUrl(raw);
  return r.ok ? 'accepted' : r.error;
};

describe('a join link, as pasted', () => {
  it('accepts the links people actually paste, stored normalised with the host they open', () => {
    expect(normaliseJoinUrl('https://us02web.zoom.us/j/81234567890?pwd=AbC123')).toEqual({ ok: true, url: 'https://us02web.zoom.us/j/81234567890?pwd=AbC123', host: 'us02web.zoom.us' });
    expect(normaliseJoinUrl('  HTTPS://Meet.Google.com/abc-defg-hij  ')).toEqual({ ok: true, url: 'https://meet.google.com/abc-defg-hij', host: 'meet.google.com' });
    expect(normaliseJoinUrl('https://teams.microsoft.com:443/l/meetup-join/19%3ameeting')).toMatchObject({ ok: true, host: 'teams.microsoft.com' });
    // a query value may carry an @; only one in front of the host is a trick
    expect(normaliseJoinUrl('https://zoom.us/j/1?invite=coach@fel.example')).toMatchObject({ ok: true, host: 'zoom.us' });
  });

  it('keeps a non-default port in the host it shows, so the player sees it too', () => {
    expect(normaliseJoinUrl('https://jitsi.fel.example:8443/room')).toEqual({ ok: true, url: 'https://jitsi.fel.example:8443/room', host: 'jitsi.fel.example:8443' });
  });

  it('shows a look-alike host in punycode, which does not look like the real one', () => {
    const r = normaliseJoinUrl('https://zооm.us/j/1'); // Cyrillic о
    expect(r.ok && r.host.startsWith('xn--')).toBe(true);
  });

  it('refuses anything that is not https', () => {
    expect(refused('javascript:alert(1)')).toBe('url_not_https');
    expect(refused('JavaScript://zoom.us/%0aalert(1)')).toBe('url_not_https');
    expect(refused('data:text/html,<script>alert(1)</script>')).toBe('url_not_https');
    expect(refused('http://zoom.us/j/1')).toBe('url_not_https');
    expect(refused('zoom.us/j/1')).toBe('url_not_https');
    expect(refused('//zoom.us/j/1')).toBe('url_not_https');
    expect(refused('ftp://zoom.us/j/1')).toBe('url_not_https');
    // the parser would forgive both of these into https://evil.example/; the literal prefix does not
    expect(refused('https:evil.example/j/1')).toBe('url_not_https');
    expect(refused('https:\\\\evil.example/j/1')).toBe('url_not_https');
  });

  it('refuses a login in front of the host, which is how a link shows one site and opens another', () => {
    expect(refused('https://zoom.us@evil.example/j/1')).toBe('url_has_login');
    expect(refused('https://zoom.us:pass@evil.example/j/1')).toBe('url_has_login');
    expect(refused('https://@evil.example/j/1')).toBe('url_has_login');
  });

  it('refuses hosts that are not a public domain name', () => {
    expect(refused('https://127.0.0.1/j/1')).toBe('url_bad_host');
    expect(refused('https://2130706433/j/1')).toBe('url_bad_host'); // the parser turns this into 127.0.0.1
    expect(refused('https://[::1]/j/1')).toBe('url_bad_host');
    expect(refused('https://localhost/j/1')).toBe('url_bad_host');
    expect(refused('https://zoom/j/1')).toBe('url_bad_host');
    expect(refused('https://zoom.us./j/1')).toBe('url_bad_host');
    expect(refused('https://under_score.example/j/1')).toBe('url_bad_host');
  });

  it('refuses spaces, control characters and backslashes anywhere in it', () => {
    expect(refused('https://zoom.us/j/1 2')).toBe('url_invalid');
    expect(refused('https://zo\nom.us/j/1')).toBe('url_invalid');
    expect(refused('https://zoom.us/j/1\t')).toBe('accepted'); // trailing whitespace is trimmed, not refused
    expect(refused('https://zoom.us/\u0000')).toBe('url_invalid');
    expect(refused('https://zoom.us\\@evil.example/')).toBe('url_invalid');
    expect(refused('https://')).toBe('url_invalid');
  });

  it('refuses an empty or non-string paste', () => {
    for (const v of [undefined, null, '', '   ', 42, {}, ['https://zoom.us/']]) expect(refused(v)).toBe('url_required');
  });

  it(`caps the length at ${JOIN_URL_MAX}, before and after normalising`, () => {
    const base = 'https://zoom.us/j/';
    expect(refused(base + 'a'.repeat(JOIN_URL_MAX - base.length))).toBe('accepted');
    expect(refused(base + 'a'.repeat(JOIN_URL_MAX - base.length + 1))).toBe('url_too_long');
    // under the cap as typed, over it once the unicode path is percent-encoded
    expect(refused(base + 'é'.repeat(JOIN_URL_MAX - base.length))).toBe('url_too_long');
  });

  it('has plain words for every refusal the coach can meet', () => {
    for (const e of ['url_required', 'url_too_long', 'url_not_https', 'url_invalid', 'url_has_login', 'url_bad_host', 'forbidden', 'slot_unavailable', 'join_links_not_ready']) {
      expect(JOIN_LINK_ERROR_COPY[e], e).toMatch(/^[A-Z].{8,}/);
    }
  });
});

describe('who may read and post a link', () => {
  const rows = [
    { userId: 'p1', sessionKey: 'gw_2026-09-25', status: 'confirmed' },
    { userId: 'p1', sessionKey: 'gw_2026-09-30', status: 'cancelled' },
    { userId: 'p1', sessionKey: 'pv_2026-09-28_16', status: 'refunded' },
    { userId: 'p1', sessionKey: 'pv_2026-10-01_17', status: 'pending' },
    { userId: 'p2', sessionKey: 'gw_2026-10-02', status: 'confirmed' },
  ];

  const none = new Map<string, string>();

  it('a player reads only the slots they hold a CONFIRMED booking for', () => {
    expect(readableKeys('p1', rows, none)).toEqual(['gw_2026-09-25']);
  });

  it('a cancelled, refunded or pending booking reads nothing, and neither does somebody else\'s', () => {
    expect(readableKeys('p1', rows.filter((r) => r.status !== 'confirmed'), none)).toEqual([]);
    expect(readableKeys('p1', [{ userId: 'p2', sessionKey: 'gw_2026-10-02', status: 'confirmed' }], none)).toEqual([]);
    expect(readableKeys('p3', rows, none)).toEqual([]);
  });

  it('a private 1-on-1 holds one player: the first confirmed booker holds it and reads its link, a second booker never does', () => {
    const at = (min: number) => new Date(Date.parse('2026-09-24T12:00:00Z') + min * 60_000);
    const pv = 'pv_2026-09-28_16';
    const booked = [
      { id: 'b2', userId: 'p2', sessionKey: pv, status: 'confirmed', createdAt: at(1) },
      { id: 'b1', userId: 'p1', sessionKey: pv, status: 'confirmed', createdAt: at(0) },
      { id: 'b0', userId: 'p3', sessionKey: pv, status: 'cancelled', createdAt: at(-5) },
      { id: 'b9', userId: 'p3', sessionKey: 'gw_2026-09-25', status: 'confirmed', createdAt: at(-9) },
    ];
    const holders = privateHolders(booked);
    expect([...holders]).toEqual([[pv, 'p1']]);   // cancelled and group rows hold nothing
    expect(readableKeys('p1', [{ userId: 'p1', sessionKey: pv, status: 'confirmed' }], holders)).toEqual([pv]);
    expect(readableKeys('p2', [{ userId: 'p2', sessionKey: pv, status: 'confirmed' }], holders)).toEqual([]);
    expect(readableKeys('p2', [{ userId: 'p2', sessionKey: pv, status: 'confirmed' }], none)).toEqual([]);   // no holder known: no link
    // a tie on time goes to the lower row id, the same answer on every read
    expect(privateHolders([{ ...booked[0], createdAt: at(0) }, booked[1]]).get(pv)).toBe('p1');
    expect(isPrivateKey(pv)).toBe(true);
    expect(isPrivateKey('gw_2026-09-25')).toBe(false);
  });

  it('posting takes an admin or the slot\'s coach; a booking alone never does', () => {
    expect(mayPostJoinLink({ isAdmin: true, isCoach: false })).toBe(true);
    expect(mayPostJoinLink({ isAdmin: false, isCoach: true })).toBe(true);
    expect(mayPostJoinLink({ isAdmin: false, isCoach: false })).toBe(false);
  });

  it('no slot names a coach account yet, so admins post every link', () => {
    expect(slotCoachId('gw_2026-09-25')).toBeNull();
    expect(slotCoachId('pv_2026-09-28_16')).toBeNull();
  });

  it('knows the schedule\'s slot ids and nothing else', () => {
    expect(isSessionKey('gw_2026-09-25')).toBe(true);
    expect(isSessionKey('pv_2026-09-28_16')).toBe(true);
    for (const v of ['', 'gw_', 'gw_2026-9-25', 'sm_2026-09-25', 'gw_2026-09-25; drop', 'pv_2026-09-28', 7, null]) expect(isSessionKey(v), String(v)).toBe(false);
  });
});

describe('the slot around the link', () => {
  const start = '2026-09-25T00:30:00.000Z';
  const t = Date.parse(start);

  it('the longest session is the hour-long group workout, the window a booking stays listed after its start', () => {
    expect(LONGEST_SESSION_MIN).toBe(60);
  });

  it('a group workout ends 60 minutes in and a private 1-on-1 45 minutes in', () => {
    expect(sessionEnded('group_workout', start, t + 59 * 60_000)).toBe(false);
    expect(sessionEnded('group_workout', start, t + 61 * 60_000)).toBe(true);
    expect(sessionEnded('private_1on1', start, t + 44 * 60_000)).toBe(false);
    expect(sessionEnded('private_1on1', start, t + 46 * 60_000)).toBe(true);
    expect(sessionEnded('group_workout', 'not a date', t)).toBe(false);
  });

  it('hosts see every upcoming group workout plus each booked private slot, soonest first, with booked counts', () => {
    const rows = hostingRows(
      [{ sessionKey: 'gw_2026-09-25', startsAtIso: '2026-09-26T00:30:00.000Z' }, { sessionKey: 'gw_2026-09-27', startsAtIso: '2026-09-28T00:30:00.000Z' }],
      [
        { sessionKey: 'gw_2026-09-25', kind: 'group_workout', count: 3, startsAt: new Date('2026-09-26T00:30:00.000Z') },
        { sessionKey: 'pv_2026-09-26_16', kind: 'private_1on1', count: 1, startsAt: new Date('2026-09-26T23:00:00.000Z') },
        { sessionKey: 'not-a-slot', kind: 'seminar', count: 9, startsAt: new Date('2026-09-25T00:00:00.000Z') },
      ],
    );
    expect(rows.map((r) => [r.sessionKey, r.kind, r.booked])).toEqual([
      ['gw_2026-09-25', 'group_workout', 3],
      ['pv_2026-09-26_16', 'private_1on1', 1],
      ['gw_2026-09-27', 'group_workout', 0],
    ]);
  });
});
