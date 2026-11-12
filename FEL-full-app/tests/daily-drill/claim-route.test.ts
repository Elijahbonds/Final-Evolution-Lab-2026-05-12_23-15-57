// DAILY-DRILL — POST /api/daily-drill/claim, run for real over the claim's test double (tests/helpers/fakeDailyDrillDb.ts)
// and the realistic rows (tests/helpers/dailyDrillRows.ts). Only the session, the database, the drills page's context,
// the profile read and the wallet's mover are stand-ins. The body names the drill; the server decides what it pays.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrillRows } from '@/lib/daily-drill/load';

const h = vi.hoisted(() => ({
  user: 'user_route_1' as string | null,
  rows: null as unknown as DrillRows,
  fake: null as unknown as ReturnType<typeof import('@/tests/helpers/fakeDailyDrillDb').fakeDailyDrillDb>,
  events: [] as unknown[],
}));

vi.mock('next-auth', () => ({ getServerSession: async () => (h.user ? { user: { id: h.user } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async (e: unknown) => { h.events.push(e); } }));
vi.mock('@/lib/coach/warmupServer', async () => {
  const { FALLBACK_WARMUP_CONTEXT } = await import('@/lib/coach/warmup');
  return { loadWarmupContext: async () => ({ ...FALLBACK_WARMUP_CONTEXT, isYouth: false, unavailable: false, jumpGate: { closed: false, why: '', href: null } }) };
});
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: async (id: string) => ({ ...h.fake.profiles[id] }) }));
vi.mock('@/lib/wallet/wallet-service', async (orig) => ({
  ...(await orig<typeof import('@/lib/wallet/wallet-service')>()),
  applyLc: (tx: unknown, a: never) => h.fake.applyLc(tx, a),
}));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, k) => {
      const r = h.rows;
      const reads: Record<string, unknown> = {
        user: { findUnique: async () => r.user },
        scanSaveOptIn: { findUnique: async () => r.optIn },
        workoutScan: { findMany: async (a: { where: { kind: unknown } }) => (a.where.kind === 'shot_form' ? r.shotScans : r.jumpScans) },
        mirrorSession: { findMany: async () => r.mirrorSessions },
        prqEntry: { findMany: async () => r.prqEntries },
        playerProfile: { findUnique: async () => h.fake.profiles[h.user!] ?? null },
        rewardRule: { findUnique: async () => null },
      };
      return k in reads ? reads[k as string] : (h.fake.db as Record<string | symbol, unknown>)[k];
    },
  }),
}));

import { POST } from '@/app/api/daily-drill/claim/route';
import { fakeDailyDrillDb } from '@/tests/helpers/fakeDailyDrillDb';
import { NOW, ago, hooper } from '@/tests/helpers/dailyDrillRows';

const post = async (body: unknown) => {
  const res = await POST(new Request('http://fel.test/api/daily-drill/claim', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};

beforeEach(() => {
  // the rows are dated against the fixtures' NOW, so the route's clock is held there (Date only: the double's ticks run)
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.user = 'user_route_1';
  h.rows = hooper();
  h.fake = fakeDailyDrillDb({ user_route_1: { streakDays: 3, lastStreakAt: ago(1.2), lastActiveAt: ago(1.2) } });
  h.events = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('POST /api/daily-drill/claim', () => {
  it('signed out: 401, nothing read or written', async () => {
    h.user = null;
    expect((await post({ key: 'shot:safe-landing' })).status).toBe(401);
    expect(h.fake.ledger.size).toBe(0);
  });

  it('no key: 400', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ key: 7 })).status).toBe(400);
  });

  it('today\'s drill: 200 granted, the credit plus the streak day, once; the telemetry carries no amount', async () => {
    const a = await post({ key: 'shot:safe-landing' });
    expect(a.status).toBe(200);
    expect(a.json).toMatchObject({ status: 'granted', amount: 30, streakBonus: 20, streakDays: 4 });
    expect(h.events).toEqual([{ name: 'daily_drill_done', userId: 'user_route_1', props: { focus: 'shot' } }]);
    const b = await post({ key: 'shot:safe-landing' });
    expect(b.json).toMatchObject({ status: 'already', amount: 30 });
    expect(h.fake.ledger.size).toBe(1);
  });

  it('a body that names an amount is ignored: the server prices the claim', async () => {
    const a = await post({ key: 'shot:safe-landing', amount: 100000 });
    expect(a.json.amount).toBe(30);
  });

  it('another focus\'s drill: 409 not_today, nothing paid', async () => {
    const a = await post({ key: 'jump:pogo-bilateral' });
    expect(a.status).toBe(409);
    expect(a.json.status).toBe('not_today');
    expect(h.fake.ledger.size).toBe(0);
  });

  it('eight claims at once through the route: one granted, seven already', async () => {
    const out = await Promise.all(Array.from({ length: 8 }, () => post({ key: 'shot:safe-landing' })));
    expect(out.map((o) => o.json.status).filter((s) => s === 'granted')).toHaveLength(1);
    expect(out.every((o) => o.status === 200)).toBe(true);
    expect(h.fake.ledger.size).toBe(1);
  });
});
