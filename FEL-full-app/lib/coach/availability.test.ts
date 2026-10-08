// COACH-AI Phase 8 (2026-10-07): availability — Full / Limited / Out, never a diagnosis; labels, input rules, expiry,
// and the route with and without the CoachAvailability table (the pending SQL applied or not).
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  AVAILABILITY_LABEL, AVAILABILITY_MAX_DAYS_AHEAD, AVAILABILITY_STATUSES, availabilityLine, effectiveAvailability,
  epochDay, mostCareful, parseAvailabilityInput,
} from './availability';

const TODAY = '2026-10-07';

describe('labels: what it means for training, never why', () => {
  // words that would make a label (or anything built from it) read as a medical statement about the athlete
  const DIAGNOSTIC = /injur|hurt|pain|sprain|strain|fractur|broken|concuss|\btear|\btorn\b|\bill\b|\bsick|diagnos|medical|doctor|physio|rehab|condition|recover(y|ing) from|surgery|\bache/i;

  it.each(AVAILABILITY_STATUSES)('%s: short, coach and athlete labels carry no diagnostic word', (s) => {
    for (const text of Object.values(AVAILABILITY_LABEL[s])) expect(text).not.toMatch(DIAGNOSTIC);
  });

  it('CONTROL: the diagnostic-word check catches one', () => {
    expect('Out — knee injury').toMatch(DIAGNOSTIC);
    expect('Limited — sore hamstring, ache').toMatch(DIAGNOSTIC);
  });

  it('the three labels are exactly Full, Limited and Out', () => {
    expect(AVAILABILITY_STATUSES.map((s) => AVAILABILITY_LABEL[s].short)).toEqual(['Full', 'Limited', 'Out']);
  });

  it('a line names the return day when there is one', () => {
    expect(availabilityLine({ status: 'out', returnBy: '2026-10-20' }, 'athlete')).toBe('Out — your coach has you off training for now · back Oct 20');
    expect(availabilityLine({ status: 'limited', returnBy: null }, 'coach')).toBe('Limited — lighter work for now');
    expect(availabilityLine({ status: 'full', returnBy: '2026-10-20' }, 'coach')).toBe('Full — training as normal');
  });
});

describe('parseAvailabilityInput: three values and a date, nothing else', () => {
  it('accepts a status, with or without a return day', () => {
    expect(parseAvailabilityInput({ clientId: 'c', status: 'out' }, TODAY)).toEqual({ ok: true, clientId: 'c', status: 'out', returnBy: null });
    expect(parseAvailabilityInput({ clientId: 'c', status: 'limited', returnBy: '2026-10-20' }, TODAY)).toEqual({ ok: true, clientId: 'c', status: 'limited', returnBy: '2026-10-20' });
    expect(parseAvailabilityInput({ clientId: 'c', status: 'full', returnBy: '2026-10-20' }, TODAY)).toEqual({ ok: true, clientId: 'c', status: 'full', returnBy: null });
  });

  it.each([
    ['a note (free text)', { clientId: 'c', status: 'out', note: 'ACL tear' }, 'unexpected_field'],
    ['a reason', { clientId: 'c', status: 'out', reason: 'concussion' }, 'unexpected_field'],
    ['a body part', { clientId: 'c', status: 'limited', bodyPart: 'knee' }, 'unexpected_field'],
    ['an unknown status', { clientId: 'c', status: 'injured' }, 'bad_status'],
    ['no client', { status: 'out' }, 'client_required'],
    ['not an object', 'out', 'bad_body'],
    ['an array', [], 'bad_body'],
    ['a non-day', { clientId: 'c', status: 'out', returnBy: 'next week' }, 'bad_return_day'],
    ['an impossible day', { clientId: 'c', status: 'out', returnBy: '2026-02-30' }, 'bad_return_day'],
    ['a past day', { clientId: 'c', status: 'out', returnBy: '2026-10-06' }, 'return_day_past'],
    ['too far', { clientId: 'c', status: 'out', returnBy: '2027-06-01' }, 'return_day_too_far'],
  ])('refuses %s', (_n, body, error) => {
    expect(parseAvailabilityInput(body, TODAY)).toEqual({ ok: false, error });
  });

  it(`the far edge is exactly ${AVAILABILITY_MAX_DAYS_AHEAD} days; today itself is allowed`, () => {
    const edge = new Date((epochDay(TODAY)! + AVAILABILITY_MAX_DAYS_AHEAD) * 86_400_000).toISOString().slice(0, 10);
    const over = new Date((epochDay(TODAY)! + AVAILABILITY_MAX_DAYS_AHEAD + 1) * 86_400_000).toISOString().slice(0, 10);
    expect(parseAvailabilityInput({ clientId: 'c', status: 'out', returnBy: edge }, TODAY).ok).toBe(true);
    expect(parseAvailabilityInput({ clientId: 'c', status: 'out', returnBy: over }, TODAY)).toEqual({ ok: false, error: 'return_day_too_far' });
    expect(parseAvailabilityInput({ clientId: 'c', status: 'out', returnBy: TODAY }, TODAY).ok).toBe(true);
  });
});

describe('effectiveAvailability and mostCareful', () => {
  it('no row, an unknown stored value, or a passed return day reads as Full', () => {
    expect(effectiveAvailability(null, TODAY)).toEqual({ status: 'full', returnBy: null });
    expect(effectiveAvailability({ status: 'injured', returnBy: null }, TODAY)).toEqual({ status: 'full', returnBy: null });
    expect(effectiveAvailability({ status: 'out', returnBy: '2026-10-06' }, TODAY)).toEqual({ status: 'full', returnBy: null });
    expect(effectiveAvailability({ status: 'out', returnBy: TODAY }, TODAY)).toEqual({ status: 'out', returnBy: TODAY });
  });

  it('two coaches: Out wins over Limited, Limited over Full', () => {
    expect(mostCareful([{ status: 'limited', returnBy: null }, { status: 'out', returnBy: '2026-10-09' }])).toEqual({ status: 'out', returnBy: '2026-10-09' });
    expect(mostCareful([{ status: 'full', returnBy: null }, { status: 'limited', returnBy: null }]).status).toBe('limited');
    expect(mostCareful([]).status).toBe('full');
  });
});

describe('static: availability never touches the minors\' health data', () => {
  const files = ['lib/coach/availability.ts', 'lib/coach/availabilityServer.ts', 'app/api/coach/availability/route.ts', 'components/coach/availability-picker.tsx', 'components/coach/my-availability.tsx'];
  const HEALTH = /healthIntake|painCheckIn|readinessCheckIn|healthConsent|HealthIntake"|PainCheckIn"|ReadinessCheckIn"|HealthConsent"/;
  it.each(files)('%s names no health model or table', (f) => {
    const src = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    expect(src).not.toMatch(HEALTH);
  });
  it('CONTROL: the scan sees a health model when one is there', () => {
    expect('await db.painCheckIn.findMany()').toMatch(HEALTH);
  });
});

// ── the route ───────────────────────────────────────────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  session: null as unknown,
  table: false,
  links: [] as { coachId: string; clientId: string; endedAt: Date | null }[],
  rows: [] as { coachId: string; clientId: string; status: string; returnBy: string | null }[],
}));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    coachClient: {
      findUnique: async ({ where }: any) => h.links.find((l) => l.coachId === where.coachId_clientId.coachId && l.clientId === where.coachId_clientId.clientId) ?? null,
      findMany: async ({ where }: any) => h.links.filter((l) => l.coachId === where.coachId && !l.endedAt),
    },
    async $queryRawUnsafe(q: string, ...v: unknown[]) {
      if (q.includes('information_schema')) return h.table ? [{ ok: 1 }] : [];
      if (!h.table) throw Object.assign(new Error('relation "CoachAvailability" does not exist'), { code: 'P2010', meta: { code: '42P01' } });
      const live = (r: { coachId: string; clientId: string }) => h.links.some((l) => l.coachId === r.coachId && l.clientId === r.clientId && !l.endedAt);
      if (q.includes('WHERE a."coachId" = $1')) return h.rows.filter((r) => r.coachId === v[0] && live(r));
      if (q.includes('WHERE a."clientId" = $1')) return h.rows.filter((r) => r.clientId === v[0] && live(r));
      throw new Error('unexpected');
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]) {
      if (!h.table) throw Object.assign(new Error('relation "CoachAvailability" does not exist'), { code: 'P2010', meta: { code: '42P01' } });
      if (q.startsWith('INSERT')) {
        h.rows = h.rows.filter((r) => !(r.coachId === v[0] && r.clientId === v[1]));
        h.rows.push({ coachId: v[0] as string, clientId: v[1] as string, status: v[2] as string, returnBy: (v[3] as string | null) ?? null });
        return 1;
      }
      if (q.startsWith('DELETE FROM "CoachAvailability" WHERE "coachId" = $1 AND "clientId"')) {
        const n = h.rows.length; h.rows = h.rows.filter((r) => !(r.coachId === v[0] && r.clientId === v[1])); return n - h.rows.length;
      }
      return 0;
    },
  },
}));

import { GET, POST } from '@/app/api/coach/availability/route';
import { resetAvailabilityProbe } from './availabilityServer';

const post = (body: unknown) => new NextRequest('http://x/api/coach/availability', { method: 'POST', body: JSON.stringify(body) });
const getAs = (q = '') => new NextRequest(`http://x/api/coach/availability${q}`);

beforeEach(() => {
  resetAvailabilityProbe();
  h.session = { user: { id: 'coach' } };
  h.table = true;
  h.links = [{ coachId: 'coach', clientId: 'teen', endedAt: null }, { coachId: 'old-coach', clientId: 'teen', endedAt: new Date('2026-09-01') }];
  h.rows = [];
});

describe('the availability route', () => {
  it('WITHOUT the table: GET is 200 { available:false } for both sides; POST is 503, never a 500', async () => {
    h.table = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await (await GET(getAs())).json()).toEqual({ available: false });
    h.session = { user: { id: 'teen' } };
    expect(await (await GET(getAs('?as=athlete'))).json()).toEqual({ available: false });
    h.session = { user: { id: 'coach' } };
    const res = await POST(post({ clientId: 'teen', status: 'out' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'availability_unavailable' });
    warn.mockRestore();
  });

  it('WITH the table: the coach sets Out for their teen athlete; the coach and the teen both see it', async () => {
    const res = await POST(post({ clientId: 'teen', status: 'out', returnBy: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) }));
    expect(res.status).toBe(200);
    const coach = await (await GET(getAs())).json();
    expect(coach).toMatchObject({ available: true, linked: ['teen'] });
    expect(coach.byClient.teen.status).toBe('out');
    h.session = { user: { id: 'teen' } };
    expect(await (await GET(getAs('?as=athlete'))).json()).toMatchObject({ available: true, status: 'out' });
  });

  it('Full deletes the row: nothing is kept for an athlete who is fully available', async () => {
    await POST(post({ clientId: 'teen', status: 'limited' }));
    expect(h.rows).toHaveLength(1);
    await POST(post({ clientId: 'teen', status: 'full' }));
    expect(h.rows).toHaveLength(0);
  });

  it('a MINOR athlete cannot set their own (or anyone\'s) status: no coach link → 403, nothing written', async () => {
    h.session = { user: { id: 'teen' } };
    expect((await POST(post({ clientId: 'teen', status: 'full' }))).status).toBe(403);
    expect((await POST(post({ clientId: 'coach', status: 'out' }))).status).toBe(403);
    expect(h.rows).toEqual([]);
  });

  it('a coach whose relationship ENDED cannot set it (403), and their old status is hidden from the athlete', async () => {
    h.rows.push({ coachId: 'old-coach', clientId: 'teen', status: 'out', returnBy: null });
    h.session = { user: { id: 'old-coach' } };
    expect((await POST(post({ clientId: 'teen', status: 'out' }))).status).toBe(403);
    h.session = { user: { id: 'teen' } };
    expect(await (await GET(getAs('?as=athlete'))).json()).toMatchObject({ available: true, status: 'full' });
  });

  it('a free-text field is refused before anything is read or written (400 unexpected_field)', async () => {
    const res = await POST(post({ clientId: 'teen', status: 'out', note: 'torn ACL' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unexpected_field' });
    expect(h.rows).toEqual([]);
  });

  it('signed out: 401', async () => {
    h.session = null;
    expect((await GET(getAs())).status).toBe(401);
    expect((await POST(post({ clientId: 'teen', status: 'out' }))).status).toBe(401);
  });
});
