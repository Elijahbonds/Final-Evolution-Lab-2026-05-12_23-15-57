import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertDigest, complianceAlerts, expectedPerWeek, missedFactsFor, missedThisWeek, MISSED_ALERT_MIN, type MissedFacts } from './alerts';
import { driftFor, type DriftRow } from './compliance';
import { missedRows } from '@/components/coach/alerts-strip';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');

describe('expectedPerWeek / missedThisWeek', () => {
  it('training sessions over weeks, summed across active programs; off days do not count', () => {
    expect(expectedPerWeek([{ startMs: 0, durationWeeks: 4, trainingSessions: 12 }])).toBe(3);
    expect(expectedPerWeek([{ startMs: 0, durationWeeks: 4, trainingSessions: 12 }, { startMs: 0, durationWeeks: 2, trainingSessions: 3 }])).toBe(4.5);
    expect(expectedPerWeek([{ startMs: 0, durationWeeks: 0, trainingSessions: 3 }, { startMs: 0, durationWeeks: 4, trainingSessions: 0 }])).toBeNull();
  });
  it('a program younger than a week, or no plan, has missed nothing', () => {
    expect(missedThisWeek({ expectedPerWeek: 3, doneLast7: 0, programAgeDays: 6 })).toBe(0);
    expect(missedThisWeek({ expectedPerWeek: null, doneLast7: 0, programAgeDays: 30 })).toBe(0);
    expect(missedThisWeek({ expectedPerWeek: 3, doneLast7: 1, programAgeDays: 30 })).toBe(2);
    expect(missedThisWeek({ expectedPerWeek: 3, doneLast7: 5, programAgeDays: 30 })).toBe(0);
  });
  it('facts from what the route holds: only the last seven days count', () => {
    const f = missedFactsFor([{ startMs: NOW - 20 * DAY, durationWeeks: 4, trainingSessions: 12 }], [NOW - DAY, NOW - 8 * DAY], NOW);
    expect(f).toEqual({ expectedPerWeek: 3, doneLast7: 1, programAgeDays: 20 });
  });
});

describe('complianceAlerts', () => {
  const row = (clientId: string, name: string, completed: number[], joinedDaysAgo = 60): DriftRow =>
    driftFor({ clientId, name, hasProgram: true, joinedAtMs: NOW - joinedDaysAgo * DAY, completedAtMs: completed }, NOW);
  const facts = (m: Record<string, MissedFacts>) => new Map(Object.entries(m));

  it('one alert per athlete, the most serious kind: stalled, then missed, then slowing', () => {
    const stalled = row('a', 'Ana', [NOW - 12 * DAY]);
    const missed = row('b', 'Ben', [NOW - 2 * DAY, NOW - 9 * DAY, NOW - 10 * DAY]);
    const slowing = row('c', 'Cy', [NOW - 3 * DAY, NOW - 15 * DAY, NOW - 16 * DAY, NOW - 17 * DAY]);
    const steady = row('d', 'Di', [NOW - DAY, NOW - 3 * DAY, NOW - 5 * DAY]);
    expect([stalled.state, missed.state, slowing.state, steady.state]).toEqual(['stalled', 'steady', 'slowing', 'steady']);
    const alerts = complianceAlerts([steady, slowing, missed, stalled], facts({
      a: { expectedPerWeek: 3, doneLast7: 0, programAgeDays: 40 },
      b: { expectedPerWeek: 3, doneLast7: 1, programAgeDays: 40 },
      c: { expectedPerWeek: 1, doneLast7: 1, programAgeDays: 40 },
      d: { expectedPerWeek: 3, doneLast7: 3, programAgeDays: 40 },
    }));
    expect(alerts.map((x) => [x.name, x.kind, x.line])).toEqual([
      ['Ana', 'stalled', 'no coached session in 12 days.'],
      ['Ben', 'missed', '1 of 3 planned sessions in the last 7 days.'],
      ['Cy', 'slowing', '1 coached session in two weeks, down from 3.'],
    ]);
  });

  it(`one missed session is a busy week, not an alert (MISSED_ALERT_MIN = ${MISSED_ALERT_MIN})`, () => {
    const r = row('b', 'Ben', [NOW - 2 * DAY, NOW - 3 * DAY]);
    expect(complianceAlerts([r], facts({ b: { expectedPerWeek: 3, doneLast7: 2, programAgeDays: 40 } }))).toEqual([]);
  });

  it('the coach\'s own backlog and a brand-new athlete are not athlete alerts', () => {
    const waiting = driftFor({ clientId: 'w', name: 'Wes', hasProgram: false, completedAtMs: [] }, NOW);
    const fresh = row('n', 'Nia', [], 1);
    expect(complianceAlerts([waiting, fresh], facts({ n: { expectedPerWeek: 3, doneLast7: 0, programAgeDays: 1 } }))).toEqual([]);
  });

  it('the board strip adds only the missed rows the panel has not named', () => {
    const alerts = [
      { clientId: 'a', name: 'Ana', kind: 'stalled' as const, line: 'x' },
      { clientId: 'b', name: 'Ben', kind: 'missed' as const, line: 'y' },
      { clientId: 'c', name: 'Cy', kind: 'missed' as const, line: 'z' },
    ];
    expect(missedRows(alerts, new Set(['c'])).map((a) => a.name)).toEqual(['Ben']);
    expect(missedRows(undefined, new Set())).toEqual([]);
  });
});

describe('alertDigest', () => {
  it('names and one line each, and the board link; nothing to send is null', () => {
    const d = alertDigest([{ clientId: 'a', name: 'Ana', kind: 'stalled', line: 'no coached session in 12 days.' }], 'https://fel.test/coach')!;
    expect(d.subject).toBe('FEL: 1 athlete needs a check-in');
    expect(d.text).toContain('- Ana: no coached session in 12 days.');
    expect(d.text).toContain('https://fel.test/coach');
    expect(alertDigest([], null)).toBeNull();
  });
});

// The digest route: the board is read as the panel reads it, and only the alerts reach the email.
const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, board: null as any, sent: [] as any[], mailOn: true }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: async () => ({ email: 'coach-own@fel.test' }) } } }));
vi.mock('@/app/api/coach/attention/route', () => ({ GET: async () => Response.json(h.board) }));
vi.mock('@/lib/mail', async (orig) => {
  const real = await orig<typeof import('@/lib/mail')>();
  return { ...real, mailLinkOrigin: () => 'https://fel.test', sendMail: async (m: unknown) => { if (!h.mailOn) return { status: 'disabled', reason: 'flag_off' }; h.sent.push(m); return { status: 'sent' }; } };
});

describe('POST /api/coach/attention/digest', () => {
  beforeEach(() => { h.sent = []; h.mailOn = true; h.user = 'coach-1'; });

  it('emails the coach\'s own address the alerts only — no pain, readiness or health line', async () => {
    const { POST } = await import('@/app/api/coach/attention/digest/route');
    h.board = {
      alerts: [{ clientId: 'a', name: 'Ana', kind: 'missed', line: '1 of 3 planned sessions in the last 7 days.' }],
      painFlags: [{ clientId: 'a', name: 'Ana', view: { present: true, detailed: true, label: 'Paused Goblet Squat — left knee', items: [] } }],
      readiness: [{ clientId: 'a', name: 'Ana', view: { level: 'low', label: 'Running low', summary: 'slept 4h' } }],
    };
    const r = await (await POST()).json();
    expect(r).toEqual({ status: 'sent', count: 1 });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe('coach-own@fel.test');
    expect(h.sent[0].text).toContain('Ana: 1 of 3 planned sessions');
    expect(h.sent[0].text).not.toMatch(/knee|Paused|Running low|slept/i);
  });

  it('email off says so; nothing to say sends nothing', async () => {
    const { POST } = await import('@/app/api/coach/attention/digest/route');
    h.mailOn = false;
    h.board = { alerts: [{ clientId: 'a', name: 'Ana', kind: 'stalled', line: 'x' }] };
    expect(await (await POST()).json()).toEqual({ status: 'email_off', count: 1 });
    h.board = { alerts: [] };
    expect(await (await POST()).json()).toEqual({ status: 'nothing_to_send', count: 0 });
    expect(h.sent).toEqual([]);
  });
});
