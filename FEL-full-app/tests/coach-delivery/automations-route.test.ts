// COACH-DELIVERY COA-01 (2026-10-26): the automation routes over the in-memory tables — the scheduled sweep behind its
// shared secret (fail closed), and the coach's own routes. Each trigger fires once through the sweep route and is deduped;
// a teen without consent is skipped.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDeliveryDb } from '@/tests/helpers/fakeDeliveryDb';

const h = vi.hoisted(() => ({ db: null as unknown as FakeDeliveryDb, user: 'c1' as string | null, since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => h.since));

import { POST as sweep } from '@/app/api/coach/automations/sweep/route';
import { GET as boardGET, POST as actPOST } from '@/app/api/coach/automations/route';
import { resetDeliveryProbe } from '@/lib/coach/delivery/probe';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { coach, seedPerson } from '@/tests/helpers/fakeParityDb';
import { fakeDeliveryDb, linkAge, program } from '@/tests/helpers/fakeDeliveryDb';

const SECRET = 'a-long-test-secret-0123456789';
const sweepReq = (secret?: string) => new NextRequest('http://fel.test/api/coach/automations/sweep', { method: 'POST', headers: secret ? { 'x-coach-automations-secret': secret } : {} });
const act = (body: unknown) => actPOST(new NextRequest('http://fel.test/api/coach/automations', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  resetDeliveryProbe(); resetParityProbe(); resetGroupsProbe();
  vi.useFakeTimers({ toFake: ['Date'] });
  h.db = fakeDeliveryDb();
  vi.setSystemTime(new Date(h.db.clock));   // Wed 2026-10-28 11:00 PT
  h.user = 'c1'; h.since = new Date('2026-01-01');
  vi.stubEnv('COACH_AUTOMATIONS_CRON_SECRET', SECRET);
  seedPerson(h.db, 'ada', 'adult', 'Ada'); seedPerson(h.db, 'tia', 'teen', 'Tia');
  coach(h.db, 'c1', 'ada', 'tia');
  linkAge(h.db, 'c1', 'ada', 1); linkAge(h.db, 'c1', 'tia', 1);
  program(h.db, 'p-ada', 'c1', 'ada'); program(h.db, 'p-tia', 'c1', 'tia');
});

describe('POST /api/coach/automations/sweep', () => {
  it('fails closed: no secret configured → 503, wrong or missing header → 401, nothing posted', async () => {
    await act({ action: 'create', trigger: 'join', preset: 'welcome' });
    vi.stubEnv('COACH_AUTOMATIONS_CRON_SECRET', '');
    expect((await sweep(sweepReq(SECRET))).status).toBe(503);
    vi.stubEnv('COACH_AUTOMATIONS_CRON_SECRET', SECRET);
    expect((await sweep(sweepReq())).status).toBe(401);
    expect((await sweep(sweepReq('wrong-secret-wrong-secret-xx'))).status).toBe(401);
    expect(h.db.messages).toEqual([]);
  });

  it('each trigger fires once through the route and is deduped; counts only in the answer', async () => {
    await act({ action: 'create', trigger: 'join', preset: 'welcome', scope: 'athlete', scopeId: 'ada' });
    await act({ action: 'create', trigger: 'missed', preset: 'check_in', missedN: 2, scope: 'athlete', scopeId: 'ada' });
    await act({ action: 'create', trigger: 'weekly', preset: 'new_week', weekday: 3, hour: 9, scope: 'athlete', scopeId: 'ada' });
    const r1 = await sweep(sweepReq(SECRET));
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    expect(j1).toMatchObject({ ok: true, automations: 3, posted: 3 });
    expect(JSON.stringify(j1)).not.toMatch(/Ada|Welcome/);
    expect(h.db.messages.map((m) => m.body.split(',')[0])).toEqual(['Welcome aboard', 'Hey Ada', 'New week']);
    expect(await (await sweep(sweepReq(SECRET))).json()).toMatchObject({ posted: 0 });
    expect(h.db.messages).toHaveLength(3);
  });

  it('a teen without the guardian\'s coach-training consent: skipped, audited, no message', async () => {
    h.since = null;
    await act({ action: 'create', trigger: 'join', preset: 'welcome' });
    expect(await (await sweep(sweepReq(SECRET))).json()).toMatchObject({ posted: 1, skippedTeen: 1 });
    expect(h.db.messages.map((m) => m.programId)).toEqual(['p-ada']);
    expect(h.db.runs.map((r) => [r.athleteId, r.outcome])).toEqual([['ada', 'posted'], ['tia', 'skipped_teen']]);
  });
});

describe('the coach\'s route', () => {
  it('needs a session; lists, creates and runs the coach\'s own', async () => {
    h.user = null;
    expect((await boardGET()).status).toBe(401);
    h.user = 'c1';
    expect((await act({ action: 'create', trigger: 'join', preset: 'welcome' })).status).toBe(201);
    expect(await (await act({ action: 'run' })).json()).toMatchObject({ ok: true, posted: 2 });
    const board = await (await boardGET()).json();
    expect(board).toMatchObject({ available: true });
    expect(board.runs).toHaveLength(2);
  });
});
