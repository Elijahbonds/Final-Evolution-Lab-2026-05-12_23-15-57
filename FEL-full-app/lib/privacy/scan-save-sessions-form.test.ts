// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT), GAP 1 row 1f: POST /api/sessions's `form` write is movement data — every camera
// attempt's raw reads as a WorkoutScan row, and a dunk session's best measured jump as a camera-source power PrqEntry
// (lib/move/formWrite.ts, run for real here). It is kept only for a verified 18+ account that has opted in. Everyone else:
// no form rows and no camera PRQ, while the session itself settles and pays EXACTLY as a session with no form (the
// session row, the profile, the wallet, the run's ledger, the game-stat drillResult rows), and the answer says
// `form: { stored: 0, saved: false, reason: 'scan_save_adults_only' }`. ADULTS ARE REFUSED TOO until PRIVACY-CORE/AB-04
// adds the opt-in; the opted-in adult (the opt-in vi.mocked true) is the positive control. Only the session, the
// database and the payout services are stand-ins (the same stand-ins as lib/sessions-route.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  session: null as unknown,
  /** The gate's reads (User, and GuardianConsent to prove it is never read) go to a write-spy client seeded per case. */
  gate: null as any,
  profile: {} as Row,
  runs: {} as Record<string, Row>,
  grants: [] as Row[],
  /** Every write the run's transaction makes, in order. */
  writes: [] as string[],
  sessions: [] as Row[],
  updates: [] as Row[],
  wallet: [] as Row[],
  prqRows: [] as Row[],
  scans: [] as Row[],
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const runUpdateMany = async ({ where, data }: { where: { id: string; status?: string }; data: Row }) => {
    const r = h.runs[where.id];
    if (!r || (where.status !== undefined && r.status !== where.status)) return { count: 0 };
    Object.assign(r, data);
    h.writes.push(`run:${String(data.status)}`);
    return { count: 1 };
  };
  const tx = {
    sessionRun: {
      updateMany: runUpdateMany,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => { Object.assign(h.runs[where.id], data); h.writes.push('run:result'); return h.runs[where.id]; },
    },
    sessionGrant: {
      createMany: async ({ data }: { data: Row[] }) => { h.grants.push(...data.map((d) => ({ ...d }))); h.writes.push('grants'); return { count: data.length }; },
      update: async ({ where, data }: { where: { userId_runId_grantType: Record<string, string> }; data: Row }) => {
        const k = where.userId_runId_grantType;
        const g = h.grants.find((x) => x.userId === k.userId && x.runId === k.runId && x.grantType === k.grantType);
        if (!g) throw new Error(`no grant row ${JSON.stringify(k)}`);
        Object.assign(g, data);
        return g;
      },
    },
    playerProfile: {
      update: async ({ data }: { data: Row }) => {
        h.writes.push('profile');
        h.updates.push(data);
        const plain = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'number'));
        return { ...h.profile, ...plain, labCredits: 100 };
      },
    },
    gameSession: { create: async ({ data }: { data: Row }) => { h.writes.push('session'); h.sessions.push(data); return { id: 's1', ...data }; } },
    prqEntry: { findFirst: async () => { h.writes.push('read:camera-prq'); return null; } },
    workoutScan: { createMany: async ({ data }: { data: Row[] }) => { h.writes.push('workoutScan.createMany'); h.scans.push(...data); return { count: data.length }; } },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      sessionRun: {
        findUnique: async ({ where }: { where: { id: string } }) => (h.runs[where.id] ? { ...h.runs[where.id] } : null),
        updateMany: runUpdateMany,
      },
      get user() { return h.gate.user; },
      get guardianConsent() { return h.gate.guardianConsent; },
    },
  };
});
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: async (_tx: unknown, a: Row) => { h.writes.push('lc'); return { balanceAfter: 100 + Number(a.delta) }; },
  sessionWalletGrant: async (_tx: unknown, a: Row) => {
    h.writes.push(`wallet:${String(a.reasonCode)}`);
    h.wallet.push(a);
    const won = a.reasonCode === 'MODE_SESSION_WON';
    return { currency: won ? 'shards' : 'coins', granted: won ? 2 : 40, capped: false, entryId: `e${h.wallet.length}` };
  },
}));
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: async () => ({ ...h.profile }) }));
vi.mock('@/lib/prq-entries', () => ({ createPrqEntry: async (_tx: unknown, row: Row) => { h.writes.push(`prq:${String(row.source)}:${String(row.attribute)}`); h.prqRows.push(row); return { id: `prq${h.prqRows.length}` }; } }));
vi.mock('@/lib/season/season-service', () => ({ addSeasonXp: async () => { h.writes.push('season'); return null; }, bookSeasonTierUps: async () => {} }));
vi.mock('@/lib/mastery/mastery-service', () => ({ recordMastery: async () => { h.writes.push('mastery'); return null; }, emitMasteryUps: async () => {} }));
vi.mock('@/lib/sessions/modeScoreRules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sessions/modeScoreRules')>();
  const { MODE_INFO } = await import('@/lib/game-data');
  const open = Object.fromEntries(Object.keys(MODE_INFO).map((k) => [k, {
    maxScore: Number.MAX_SAFE_INTEGER, maxScorePerSecond: Number.POSITIVE_INFINITY, minDurationMs: 0, maxDurationMs: 7 * 86_400_000, enabled: true,
    measured: { runs: 0, maxScore: 0, maxScorePerSecond: 0, minSec: 0, maxSec: 0, sources: [] },
  }]));
  return { ...actual, checkRunScore: (o: Parameters<typeof actual.checkRunScore>[0]) => actual.checkRunScore(o, open as never) };
});
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/privacy/scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { POST } from '@/app/api/sessions/route';
import { canonicalModeKey } from '@/lib/game-data';
import { heightCmForFlight } from '@/lib/move/formSummary';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, callsOn, newSpyDb, spyPrisma, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-form-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
let gateDb: SpyDb;

const jump = (flightMs: number) => ({ kind: 'jump', label: 'WINDMILL', made: true, takeoff: 'two', reads: { heightCm: heightCmForFlight(flightMs), flightMs } });
const FORM = { attempts: [jump(560), jump(610)] };
const SESSION = { mode: 'dunkContest', score: 12, won: true, duration: 60 };

let runSeq = 0;
function openRun(mode: string, durationSec = 60): string {
  const id = `run_form_${String(++runSeq).padStart(6, '0')}`;
  const now = Date.now();
  h.runs[id] = {
    id, userId: UID, mode: canonicalModeKey(mode), status: 'open', payoutEligible: true, ineligibleReason: null,
    startedAt: new Date(now - durationSec * 1000), expiresAt: new Date(now + 60 * 60 * 1000), result: null,
  };
  return id;
}
/** Fresh state for one account: the case's User row (and a parent's yes for the 17-year-old), a profile, no runs. */
function as(c: AgeCase, optedIn = false) {
  gateDb = newSpyDb();
  c.seed(gateDb, UID);
  h.gate = spyPrisma(gateDb);
  h.profile = { userId: UID, streakDays: 3, lastStreakAt: new Date(), labCredits: 100, strength: 50, speed: 50, endurance: 50, agility: 50, power: 50, flexibility: 50, recovery: 50, mental: 50 };
  h.runs = {};
  for (const k of ['grants', 'writes', 'sessions', 'updates', 'wallet', 'prqRows', 'scans'] as const) h[k] = [];
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
async function post(body: Row) {
  const b = 'runId' in body ? body : { ...body, runId: openRun(String(body.mode ?? ''), Number(body.duration ?? 60)) };
  const res = await POST({ json: async () => b } as never);
  return { status: res.status, body: await res.json() };
}
/** Everything a session settles, minus the form: what a no-form session must match. */
const settled = (r: { body: Row }) => ({
  writes: h.writes.filter((w) => w !== 'workoutScan.createMany'),
  session: h.sessions.map(({ mode, score, won, xp, shards, prqDelta, credits }) => ({ mode, score, won, xp, shards, prqDelta, credits })),
  // the profile write minus its timestamps (each post stamps its own moment)
  profile: h.updates.map((u) => Object.fromEntries(Object.entries(u).filter(([, v]) => !(v instanceof Date)))),
  wallet: h.wallet.map((w) => ({ reasonCode: w.reasonCode, mode: (w.payload as Row | undefined)?.mode })),
  prq: h.prqRows.map(({ attribute, source, value }) => ({ attribute, source, value })),
  grants: h.grants.map(({ grantType, amount }) => ({ grantType, amount })),
  answer: { ok: r.body.ok, paid: r.body.paid, won: r.body.won, xp: r.body.xp, shards: r.body.shards, coins: r.body.coins, walletShards: r.body.walletShards, prqDelta: r.body.prqDelta },
});

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('1f POST /api/sessions: the form write needs a verified, opted-in adult', () => {
  it.each(REFUSED_SCAN_CASES.map((c) => [c.id, c] as const))('%s: the session settles and pays as a no-form session; zero form rows, zero camera PRQ, the answer says why', async (_id, c) => {
    as(c);
    const withForm = await post({ ...SESSION, form: FORM });
    expect(withForm.status).toBe(200);
    expect(withForm.body.form).toEqual({ attempts: 2, stored: 0, power: null, dropped: 0, saved: false, reason: 'scan_save_adults_only' });
    expect(h.scans).toEqual([]);
    expect(h.writes).not.toContain('workoutScan.createMany');
    expect(h.prqRows.filter((row) => row.source === 'camera')).toEqual([]);
    expect(callsOn(gateDb, 'guardianConsent')).toEqual([]);
    const refusedSettle = settled(withForm);

    as(c);
    const noForm = await post(SESSION);
    expect(noForm.status).toBe(200);
    expect(noForm.body.form).toBeNull();
    expect(settled(noForm)).toEqual(refusedSettle);
    expect(callsOn(gateDb, 'user')).toEqual([]);   // no form, no question asked
  });

  it('18+ OPTED IN (positive control): today\'s form writes — two history rows and one camera power entry — and today\'s answer', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post({ ...SESSION, form: FORM });
    expect(r.status).toBe(200);
    expect(h.scans).toHaveLength(2);
    expect(h.scans.every((s) => s.userId === UID)).toBe(true);
    expect(h.prqRows.filter((row) => row.source === 'camera').map((row) => row.attribute)).toEqual(['power']);
    expect(Object.keys(r.body.form).sort()).toEqual(['attempts', 'dropped', 'power', 'stored']);
    expect(r.body.form).toMatchObject({ attempts: 2, stored: 2, dropped: 0, power: { source: 'camera' } });
  });

  it.each([...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const))('%s: a body with no run is still a 400, before the age is read, nothing written', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    const r = await post({ ...SESSION, form: FORM, runId: null });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ ok: false, paid: false, reason: 'RUN_MISSING' });
    expect(h.writes).toEqual([]);
    expect(callsOn(gateDb, 'user')).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(REFUSED_SCAN_CASES.find((x) => x.id === '15')!);
    h.session = null;
    const r = await post({ ...SESSION, form: FORM });
    expect(r.status).toBe(401);
    expect(gateDb.calls).toEqual([]);
    expect(h.writes).toEqual([]);
  });
});
