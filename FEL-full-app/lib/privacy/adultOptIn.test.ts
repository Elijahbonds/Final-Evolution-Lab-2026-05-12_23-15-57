// AB-04: the opt-in reader, the coach-share helper, and the new number routes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SCAN_SAVE_CONSENT_TEXT } from './scanSaveConsent';
import { scanSaveOptIn } from './scanSaveOptIn';
import { adultOptedInAndSharedWithCoach, recordCoachShare, withdrawCoachShare } from './coachShare';
import { bodyHasMedia, screenHistoryMetrics } from './numberScan';
import { maybeSaveAdultScreen, screenRunId } from './screenHistoryClient';
import { ScanSaveCard } from '@/components/privacy/scan-save-card';
import { newSpyDb, seedUser, spyPrisma, writesOf } from '@/tests/helpers/writeSpyDb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UID = 'adult-opt-1';
const COACH = 'coach-1';

function grant(db: ReturnType<typeof newSpyDb>, extra: Record<string, unknown> = {}) {
  (db.tables.scanSaveOptIn ??= []).push({
    id: 'opt-1', userId: UID, scope: 'jump_numbers', granted: true, revokedAt: null, coachShares: null, ...extra,
  });
}

describe('scanSaveOptIn fails closed', () => {
  it('a live jump_numbers grant is the only yes', async () => {
    const db = newSpyDb();
    seedUser(db, UID, 1990);
    expect(await scanSaveOptIn(spyPrisma(db), UID)).toBe(false);
    grant(db);
    expect(await scanSaveOptIn(spyPrisma(db), UID)).toBe(true);
    db.tables.scanSaveOptIn[0].revokedAt = new Date();
    expect(await scanSaveOptIn(spyPrisma(db), UID)).toBe(false);
    db.tables.scanSaveOptIn[0].revokedAt = null;
    db.tables.scanSaveOptIn[0].granted = false;
    expect(await scanSaveOptIn(spyPrisma(db), UID)).toBe(false);
    db.tables.scanSaveOptIn[0].granted = true;
    db.tables.scanSaveOptIn[0].scope = 'training';
    expect(await scanSaveOptIn(spyPrisma(db), UID)).toBe(false);
  });

  it('a thrown read, including a missing table, is false and logs no user id', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
    const broken = { scanSaveOptIn: { findUnique: () => Promise.reject(Object.assign(new Error(`missing ${UID}`), { name: 'PrismaClientKnownRequestError', code: 'P2021' })) } };
    await expect(scanSaveOptIn(broken, UID)).resolves.toBe(false);
    expect(lines[0]).toMatch(/scan_save_opt_in_read_failed/);
    expect(lines[0]).not.toContain(UID);
    spy.mockRestore();
  });
});

describe('adultOptedInAndSharedWithCoach', () => {
  it('is true only for a live opt-in and an unwithdrawn share with that coach', async () => {
    const db = newSpyDb();
    seedUser(db, UID, 1990);
    const prisma = spyPrisma(db);
    expect(await adultOptedInAndSharedWithCoach(prisma, UID, COACH)).toBe(false);
    grant(db, { coachShares: [{ bookingId: 'book-1', coachId: COACH, sharedAt: '2026-10-04T00:00:00.000Z', withdrawnAt: null }] });
    expect(await adultOptedInAndSharedWithCoach(prisma, UID, COACH)).toBe(true);
    expect(await adultOptedInAndSharedWithCoach(prisma, UID, 'other-coach')).toBe(false);
    db.tables.scanSaveOptIn[0].revokedAt = new Date();
    expect(await adultOptedInAndSharedWithCoach(prisma, UID, COACH)).toBe(false);
    db.tables.scanSaveOptIn[0].revokedAt = null;
    db.tables.scanSaveOptIn[0].coachShares[0].withdrawnAt = '2026-10-04T01:00:00.000Z';
    expect(await adultOptedInAndSharedWithCoach(prisma, UID, COACH)).toBe(false);
  });

  it('records a share only for a live coach link, and withdraw does not need the opt-in', async () => {
    const db = newSpyDb();
    seedUser(db, UID, 1990);
    grant(db);
    (db.tables.coachClient ??= []).push({ id: 'link-1', coachId: COACH, clientId: UID, endedAt: null });
    const prisma = spyPrisma(db);
    expect(await recordCoachShare(prisma, UID, 'book-9', 'stranger')).toBe(false);
    expect(await recordCoachShare(prisma, UID, 'book-9', COACH)).toBe(true);
    expect(await adultOptedInAndSharedWithCoach(prisma, UID, COACH)).toBe(true);
    db.tables.scanSaveOptIn[0].revokedAt = new Date();
    db.tables.scanSaveOptIn[0].granted = false;
    expect(await withdrawCoachShare(prisma, UID, 'book-9')).toBe(true);
    expect(db.tables.scanSaveOptIn[0].coachShares[0].withdrawnAt).toEqual(expect.any(String));
  });
});

describe('numbers only', () => {
  it('refuses image, video, frame, and landmark keys, and data urls', () => {
    expect(bodyHasMedia({ verticalCm: 40 })).toBe(false);
    expect(bodyHasMedia({ image: 'x' })).toBe(true);
    expect(bodyHasMedia({ landmarks: [] })).toBe(true);
    expect(bodyHasMedia({ note: 'data:image/png;base64,aaaa' })).toBe(true);
    expect(bodyHasMedia({ frames: [1] })).toBe(true);
  });

  it('a re-screen body keeps checks, flags, and the jump, and drops a landmark field', () => {
    const ok = screenHistoryMetrics({
      runId: 'rescreenabcdef12',
      checks: [{ id: 'ohs.kneeCave', band: 'yellow' }],
      flags: ['ohs.kneeCave'],
      jumpBestIn: 18,
    });
    expect(ok.ok).toBe(true);
    expect(screenHistoryMetrics({ runId: 'rescreenabcdef12', checks: [], flags: [], jumpBestIn: null, landmarks: [] }).ok).toBe(false);
  });
});

describe('re-screen client', () => {
  it('does not post unless the server says verified and opted in, and the page calls it only after the kid return', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ verifiedAdult: false, optedIn: false }) }));
    await maybeSaveAdultScreen({ checks: [], priorities: [], jumpBestIn: null }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    const kid = app.indexOf("if (keepResult(tabStorage(), gateRef.current, summary) === 'kid')");
    const save = app.indexOf('maybeSaveAdultScreen(summary)');
    expect(kid).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(kid);
    const same = screenRunId({ checks: [{ id: 'a', band: 'green' }], flags: [], jumpBestIn: 10 });
    expect(screenRunId({ checks: [{ id: 'a', band: 'green' }], flags: [], jumpBestIn: 10 })).toBe(same);
  });

  it('an opted-in verified adult posts checks and flags, never landmarks', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verifiedAdult: true, optedIn: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });
    await maybeSaveAdultScreen({
      checks: [{ id: 'ohs.kneeCave', band: 'red' }],
      priorities: ['ohs.kneeCave'],
      jumpBestIn: 16,
    }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, { body: string }])[1].body));
    expect(body.checks).toEqual([{ id: 'ohs.kneeCave', band: 'red' }]);
    expect(body.flags).toEqual(['ohs.kneeCave']);
    expect(body).not.toHaveProperty('landmarks');
    expect(body).not.toHaveProperty('image');
    expect(String((fetchImpl.mock.calls[1] as unknown as [string])[0])).toBe('/api/mirror/screen-history');
  });
});

describe('the card', () => {
  it('shows the consent sentence and starts unchecked', () => {
    const html = renderToStaticMarkup(createElement(ScanSaveCard, { checked: false, onChange: () => {} }));
    expect(html).toContain(SCAN_SAVE_CONSENT_TEXT);
    expect(html).toContain('data-testid="scan-save-card"');
    expect(html).toContain('data-testid="scan-save-toggle"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
  });
});

describe('the new routes', () => {
  beforeEach(() => { h.session = { user: { id: UID } }; });

  it('Prove It: an opted-in adult saves once per run id; a replay does not write again', async () => {
    const { POST } = await import('@/app/api/mirror/prove-it/route');
    const db = newSpyDb();
    seedUser(db, UID, 1990);
    grant(db);
    h.prisma = spyPrisma(db);
    const body = {
      runId: 'prove-run-1', verticalCm: 60, flightTimeMs: 700, takeoff: 'two-foot',
      landingStability: 0.8, family: 'ATTEMPT', judgesScore: 40,
    };
    const send = () => POST(new Request('http://fel.test/api/mirror/prove-it', { method: 'POST', body: JSON.stringify(body) }) as never);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(writesOf(db)).toEqual(['workoutScan.create']);
    expect(db.tables.workoutScan).toHaveLength(1);
    expect(db.tables.workoutScan[0].metrics).not.toHaveProperty('landmarks');
  });

  it('Prove It: a non-adult is refused even with a forged body, and a media field is refused before a write', async () => {
    const { POST } = await import('@/app/api/mirror/prove-it/route');
    const db = newSpyDb();
    seedUser(db, UID, new Date().getFullYear() - 15);
    grant(db);
    h.prisma = spyPrisma(db);
    const body = {
      runId: 'prove-run-2', verticalCm: 60, flightTimeMs: 700, takeoff: 'one-foot',
      landingStability: 0.5, family: 'WINDMILL', judgesScore: 36,
    };
    const res = await POST(new Request('http://fel.test/api/mirror/prove-it', { method: 'POST', body: JSON.stringify(body) }) as never);
    expect(res.status).toBe(403);
    expect(writesOf(db)).toEqual([]);
    const media = await POST(new Request('http://fel.test/api/mirror/prove-it', {
      method: 'POST', body: JSON.stringify({ ...body, image: 'data:image/png;base64,aaaa' }),
    }) as never);
    expect(media.status).toBe(400);
    expect(writesOf(db)).toEqual([]);
  });

  it('re-screen: an adult who is not opted in saves nothing', async () => {
    const { POST } = await import('@/app/api/mirror/screen-history/route');
    const db = newSpyDb();
    seedUser(db, UID, 1990);
    h.prisma = spyPrisma(db);
    const res = await POST(new Request('http://fel.test/api/mirror/screen-history', {
      method: 'POST',
      body: JSON.stringify({ runId: 'rescreenabcdef', checks: [{ id: 'a.b', band: 'green' }], flags: [], jumpBestIn: null }),
    }) as never);
    expect(res.status).toBe(403);
    expect(writesOf(db)).toEqual([]);
  });
});
