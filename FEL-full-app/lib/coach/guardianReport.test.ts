// The guardian's progress report (coach-loop P1): training only, a link that opens with no account and dies with the
// consent, and a coach route that sends it only for a teen with an accepted consent on their own roster.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUARDIAN_LINK_TTL_DAYS, guardianReportPath, guardianReportToken, readGuardianReportToken } from './guardianLink';
import { GUARDIAN_REPORT_KEYS, GUARDIAN_REPORT_PROGRAM_KEYS, buildGuardianReport, guardianReportEmail } from './guardianReport';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const SECRET = 'test-secret-not-a-real-one';
const THIS_YEAR = new Date().getFullYear();

describe('the link', () => {
  it('round-trips, names nothing but the consent id, and expires', () => {
    const t = guardianReportToken('gc_abc123', NOW, SECRET)!;
    expect(t.split('.')).toHaveLength(3);
    expect(t).not.toMatch(/@|parent|sam/i);
    expect(readGuardianReportToken(t, NOW, SECRET)).toBe('gc_abc123');
    expect(readGuardianReportToken(t, NOW + GUARDIAN_LINK_TTL_DAYS * DAY + 1000, SECRET)).toBeNull();
    expect(guardianReportPath(t)).toBe(`/guardian/report/${t}`);
  });
  it('an edited id, an edited expiry, another secret, junk, and no secret all read null', () => {
    const t = guardianReportToken('gc_abc123', NOW, SECRET)!;
    const [id, exp, sig] = t.split('.');
    expect(readGuardianReportToken(`gc_other.${exp}.${sig}`, NOW, SECRET)).toBeNull();
    expect(readGuardianReportToken(`${id}.${Number(exp) + 999999}.${sig}`, NOW, SECRET)).toBeNull();
    expect(readGuardianReportToken(t, NOW, 'another-secret')).toBeNull();
    for (const junk of ['', 'a.b', 'a.b.c.d', `${id}.x.${sig}`]) expect(readGuardianReportToken(junk, NOW, SECRET)).toBeNull();
    expect(guardianReportToken('gc_abc123', NOW, undefined)).toBeNull();
    expect(readGuardianReportToken(t, NOW, '')).toBeNull();
  });
});

describe('the report: training only', () => {
  const report = buildGuardianReport({
    athleteName: 'Sam Lee', coachNames: ['Coach Dee', 'Coach Dee', ''],
    programs: [{ name: 'Base block', isActive: true, sessionsPlanned: 12, sessionsDone: 4 }],
    completedAtMs: [NOW - DAY, NOW - 3 * DAY, NOW - 10 * DAY, NOW - 40 * DAY], setsLast7: 18, nowMs: NOW,
  });
  it('counts what was done', () => {
    expect(report).toEqual({
      athlete: 'Sam', coaches: ['Coach Dee'], sessionsLast7: 2, sessionsLast28: 3, setsLast7: 18, lastSessionDaysAgo: 1,
      programs: [{ name: 'Base block', active: true, done: 4, planned: 12 }], asOf: '2026-10-20',
    });
  });
  it('carries no key outside the allow-list — no health, pain, readiness, scan, PRQ, contact or age field', () => {
    expect(Object.keys(report).sort()).toEqual([...GUARDIAN_REPORT_KEYS].sort());
    for (const p of report.programs) expect(Object.keys(p).sort()).toEqual([...GUARDIAN_REPORT_PROGRAM_KEYS].sort());
    const keys = [...GUARDIAN_REPORT_KEYS, ...GUARDIAN_REPORT_PROGRAM_KEYS].join(' ');
    expect(keys).not.toMatch(/pain|health|ready|readiness|intake|scan|mirror|screen|prq|weight|email|dob|birth|note|message/i);
  });
  it('the email: the week in three lines and the link, nothing else', () => {
    const e = guardianReportEmail(report, 'https://fel.test/guardian/report/x');
    expect(e.subject).toBe("Sam's training this week on Final Evolution Lab");
    expect(e.text).toContain('Sessions in the last 7 days: 2 (3 in the last 4 weeks).');
    expect(e.text).toContain('https://fel.test/guardian/report/x');
    expect(e.text).not.toMatch(/Lee|Coach Dee/);
  });
});

// ── the server half, over the write-spy database ──────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, spy: null as any, sent: [] as any[], mailOn: true }));
// COACH-LOOP P1 (owner 2026-10-23): a teen's consent counts only if it was asked under the coach-training wording, which
// is not live yet (lib/coach/coachConsent.ts, null = every teen fails closed). This suite stands after go-live.
const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock('@/lib/db', async () => {
  const { spyPrisma } = await import('@/tests/helpers/writeSpyDb');
  return { prisma: new Proxy({}, { get: (_t, k) => spyPrisma(h.spy)[k] }) };
});
vi.mock('@/lib/mail', async (orig) => {
  const real = await orig<typeof import('@/lib/mail')>();
  return { ...real, mailReady: () => h.mailOn, mailLinkOrigin: () => 'https://fel.test', sendMail: async (m: unknown) => { h.sent.push(m); return { status: 'sent' }; } };
});

describe('the coach route and the guardian page', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = SECRET;
    h.sent = []; h.mailOn = true; h.user = 'coach-1'; cc.since = new Date('2026-01-01');
    const consent = (id: string, menteeId: string, year: number, extra: Record<string, unknown> = {}) => ({
      id, menteeId, guardianName: 'A Parent', guardianEmail: `${menteeId}-parent@fel.test`, menteeBirthYear: year,
      token: `tok-${id}`, requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, ...extra,
    });
    h.spy = { tables: {
      user: [
        { id: 'coach-1', name: 'Coach Dee', dobYear: 1985 },
        { id: 'teen', name: 'Sam Lee', dobYear: THIS_YEAR - 15 },
        { id: 'teen-pending', name: 'Ria', dobYear: THIS_YEAR - 16 },
        { id: 'adult', name: 'Ana', dobYear: 1990 },
        { id: 'stranger-teen', name: 'Jo', dobYear: THIS_YEAR - 15 },
      ],
      coachClient: ['teen', 'teen-pending', 'adult'].map((clientId) => ({ coachId: 'coach-1', clientId, endedAt: null })),
      guardianConsent: [
        consent('gc-teen', 'teen', THIS_YEAR - 15),
        consent('gc-pending', 'teen-pending', THIS_YEAR - 16, { acceptedAt: null }),
        consent('gc-stranger', 'stranger-teen', THIS_YEAR - 15),
      ],
      coachingProgram: [{ id: 'p1', name: 'Base block', isActive: true, coachId: 'coach-1', clientId: 'teen', startDate: new Date('2026-10-01'),
        blocks: [{ sessions: [{ id: 's1', kind: 'training' }, { id: 's2', kind: 'training' }, { id: 'off', kind: 'recovery' }] }] }],
      clientSession: [{ clientId: 'teen', programId: 'p1', sessionId: 's1', completedAt: new Date(Date.now() - DAY) }],
      setLog: [],
      // rows the report must never read
      painCheckIn: [{ userId: 'teen', bodyArea: 'knee' }], healthIntake: [{ userId: 'teen' }], workoutScan: [{ userId: 'teen' }],
    }, calls: [] };
  });

  it('GET names only the teen with an accepted consent on MY roster; no address in the answer', async () => {
    const { GET } = await import('@/app/api/coach/guardian-report/route');
    const j = await (await GET()).json();
    expect(j).toEqual({ eligible: ['teen'], email: true });
  });

  it('POST emails the guardian on the consent a signed link; the coach gets a status, never the address or link', async () => {
    const { POST } = await import('@/app/api/coach/guardian-report/route');
    const { NextRequest } = await import('next/server');
    const res = await POST(new NextRequest('http://fel.test/api/coach/guardian-report', { method: 'POST', body: JSON.stringify({ clientId: 'teen' }) }));
    const j = await res.json();
    expect(j).toEqual({ status: 'sent' });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe('teen-parent@fel.test');
    const link = String(h.sent[0].text.match(/https:\/\/fel\.test\/guardian\/report\/\S+/)![0]);
    // the page resolves that link with no account and shows training only
    const { resolveGuardianReport } = await import('./guardianReportServer');
    const { prisma } = await import('@/lib/db');
    const token = decodeURIComponent(link.split('/guardian/report/')[1]);
    const report = await resolveGuardianReport(prisma as any, token);
    expect(report).toMatchObject({ athlete: 'Sam', sessionsLast7: 1, programs: [{ name: 'Base block', done: 1, planned: 2 }] });
    // nothing outside training was read to build it
    const read = h.spy.calls.map((c: any) => c.op.split('.')[0]);
    expect(read.filter((m: string) => /pain|health|readiness|workoutScan|prq/i.test(m))).toEqual([]);
    // revoking the consent kills the link
    h.spy.tables.guardianConsent[0].revokedAt = new Date();
    expect(await resolveGuardianReport(prisma as any, token)).toBeNull();
  });

  it('an adult, a pending consent, and a teen off my roster all answer the same not_eligible, and nothing is sent', async () => {
    const { POST } = await import('@/app/api/coach/guardian-report/route');
    const { NextRequest } = await import('next/server');
    for (const clientId of ['adult', 'teen-pending', 'stranger-teen', 'nobody']) {
      const res = await POST(new NextRequest('http://fel.test/api/coach/guardian-report', { method: 'POST', body: JSON.stringify({ clientId }) }));
      expect([res.status, await res.json()]).toEqual([404, { status: 'not_eligible' }]);
    }
    expect(h.sent).toEqual([]);
  });

  it('TODAY (owner 2026-10-23): no consent covers coach training yet, so no teen is eligible and nothing is sent', async () => {
    cc.since = null;
    const { GET, POST } = await import('@/app/api/coach/guardian-report/route');
    const { NextRequest } = await import('next/server');
    expect(await (await GET()).json()).toEqual({ eligible: [], email: true });
    const res = await POST(new NextRequest('http://fel.test/api/coach/guardian-report', { method: 'POST', body: JSON.stringify({ clientId: 'teen' }) }));
    expect([res.status, await res.json()]).toEqual([404, { status: 'not_eligible' }]);
    expect(h.sent).toEqual([]);
  });

  it('email off: nothing is sent, and the coach is told so', async () => {
    h.mailOn = false;
    const { POST } = await import('@/app/api/coach/guardian-report/route');
    const { NextRequest } = await import('next/server');
    const res = await POST(new NextRequest('http://fel.test/api/coach/guardian-report', { method: 'POST', body: JSON.stringify({ clientId: 'teen' }) }));
    expect(await res.json()).toEqual({ status: 'email_off' });
    expect(h.sent).toEqual([]);
  });
});
