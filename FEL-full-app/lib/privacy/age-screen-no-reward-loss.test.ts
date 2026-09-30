// AGE-SCREEN MUST (2): a refused screen pays nothing new, and nothing a teen already has is taken or withheld.
// app/api/mirror/screen/route.ts is not edited. The sessions form proof follows lib/privacy/scan-save-sessions-form.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
  userId: null as string | null,
  spy: null as any,
  db: null as any,
  cookie: null as string | null,
  screenGrants: [] as unknown[],
  lc: [] as Row[],
  profile: {} as Row,
  runs: {} as Record<string, Row>,
  grants: [] as Row[],
  writes: [] as string[],
  sessions: [] as Row[],
  updates: [] as Row[],
  wallet: [] as Row[],
  prqRows: [] as Row[],
  scans: [] as Row[],
  useSessionTx: false,
}));

const tx = {
  sessionRun: {
    updateMany: async ({ where, data }: { where: { id: string; status?: string }; data: Row }) => {
      const r = h.runs[where.id];
      if (!r || (where.status !== undefined && r.status !== where.status)) return { count: 0 };
      Object.assign(r, data);
      h.writes.push(`run:${String(data.status)}`);
      return { count: 1 };
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      Object.assign(h.runs[where.id], data);
      h.writes.push('run:result');
      return h.runs[where.id];
    },
  },
  sessionGrant: {
    createMany: async ({ data }: { data: Row[] }) => {
      h.grants.push(...data.map((d) => ({ ...d })));
      h.writes.push('grants');
      return { count: data.length };
    },
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

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      if (p === '$transaction') {
        return (fn: unknown, ...rest: unknown[]) => (
          h.useSessionTx ? (fn as (t: typeof tx) => unknown)(tx) : h.spy.$transaction(fn, ...rest)
        );
      }
      if (p === 'sessionRun') {
        return {
          findUnique: async ({ where }: { where: { id: string } }) => (h.runs[where.id] ? { ...h.runs[where.id] } : null),
          updateMany: tx.sessionRun.updateMany,
        };
      }
      return h.spy[p];
    },
  }),
}));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'hashed' } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => '203.0.113.9' }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: () => {} }));
vi.mock('@/lib/marketing/referral', () => ({ convertReferralOnSignup: async () => {} }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantServerReward: async (_db: unknown, args: unknown) => { h.screenGrants.push(args); return { granted: { shards: 25 } }; },
  applyLc: async (_tx: unknown, a: Row) => { h.lc.push(a); h.writes.push('lc'); return { balanceAfter: 100 + Number(a.delta) }; },
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
vi.mock('@/lib/privacy/scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { NextRequest } from 'next/server';
import { PATCH, POST as screenPost } from '@/app/api/mirror/screen/route';
import { POST as sessionPost } from '@/app/api/sessions/route';
import { POST as birthPost } from '@/app/api/account/birth-year/route';
import { POST as signupPost } from '@/app/api/signup/route';
import { POST as intakePost } from '@/app/api/health/intake/route';
import { submitIntake } from '@/lib/health/intake';
import { canonicalModeKey } from '@/lib/game-data';
import { heightCmForFlight } from '@/lib/move/formSummary';
import { REFUSED_SCAN_CASES, newSpyDb, seedUser, spyPrisma, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'reward-teen';
const THIS_YEAR = new Date().getFullYear();
const LEDGER = ['wallet', 'walletLedgerEntry', 'creditLedger', 'ledgerAccount', 'ledgerTransaction', 'ledgerPosting', 'sessionGrant', 'passGrant', 'perfEarnEvent', 'playerProfile'] as const;
const teen = REFUSED_SCAN_CASES.find((c) => c.id === '15')!;
const seventeen = REFUSED_SCAN_CASES.find((c) => c.id === '17 with an accepted GuardianConsent')!;

const PASS = [
  { checkId: 'heelLine', status: 'pass', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels', view: 'back' },
  { checkId: 'kneeWindow', status: 'pass', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack', view: 'front' },
  { checkId: 'hipLevel', status: 'pass', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  { checkId: 'shoulderLevel', status: 'pass', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  { checkId: 'headFloat', status: 'pass', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile', view: 'side' },
  { checkId: 'singleLeg', status: 'pass', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL', view: 'front' },
  { checkId: 'singleLeg', status: 'pass', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR', view: 'front' },
];
const SCREEN = { screenId: 'scr-paid-earlier', screen: 'modified', checks: PASS };
const ANSWERS = { screenId: 'scr-paid-earlier', answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] };
const YESNO = {
  current_pain: false, recent_injury_or_surgery: false, dizziness_fainting_chest_pain: false, heart_or_bp_condition: false,
  pregnancy_or_postpartum: false, heart_rate_or_balance_medicine: false, clinician_told_to_avoid: false,
};
const jump = (flightMs: number) => ({ kind: 'jump', label: 'WINDMILL', made: true, takeoff: 'two', reads: { heightCm: heightCmForFlight(flightMs), flightMs } });
const FORM = { attempts: [jump(560), jump(610)] };
const SESSION = { mode: 'dunkContest', score: 12, won: true, duration: 60 };

function seedLedger(db: SpyDb, userId: string) {
  db.tables.wallet = [{ id: 'w1', userId, lc: 500, shards: 12, coins: 40 }];
  db.tables.walletLedgerEntry = [{ id: 'e1', userId, amount: 25, reasonCode: 'SCREEN_PASS' }];
  db.tables.creditLedger = [{ id: 'c1', userId, delta: 10 }];
  db.tables.ledgerAccount = [{ id: 'a1', userId, balance: 3 }];
  db.tables.ledgerTransaction = [{ id: 't1', userId }];
  db.tables.ledgerPosting = [{ id: 'p1', transactionId: 't1', amount: 3 }];
  db.tables.sessionGrant = [{ id: 'sg1', userId, amount: 5 }];
  db.tables.passGrant = [{ id: 'pg1', userId, amount: 1 }];
  db.tables.perfEarnEvent = [{ id: 'pe1', userId, amount: 2 }];
  db.tables.playerProfile = [{ id: 'pp1', userId, xp: 80, shards: 7, labCredits: 500 }];
}
const ledger = (db: SpyDb) => JSON.parse(JSON.stringify(LEDGER.map((m) => [m, db.tables[m]])));

function asCase(c: typeof teen) {
  h.db = newSpyDb();
  c.seed(h.db, UID);
  seedLedger(h.db, UID);
  h.db.tables.workoutScan = [{ id: 'earlier-paid', userId: UID, screenId: 'scr-paid-earlier', paid: true, shards: 25 }];
  h.spy = spyPrisma(h.db);
  h.session = { user: { id: UID } };
  h.userId = UID;
  h.cookie = null;
  h.useSessionTx = false;
  h.screenGrants = [];
  h.lc = [];
  h.profile = { userId: UID, streakDays: 3, lastStreakAt: new Date().toISOString(), labCredits: 100, strength: 50, speed: 50, endurance: 50, agility: 50, power: 50, flexibility: 50, recovery: 50, mental: 50, xp: 80, shards: 7 };
  h.runs = {};
  h.grants = [];
  h.writes = [];
  h.sessions = [];
  h.updates = [];
  h.wallet = [];
  h.prqRows = [];
  h.scans = [];
}

async function screen(method: 'POST' | 'PATCH', body: unknown) {
  const req = new NextRequest('http://fel.test/api/mirror/screen', {
    method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await (method === 'POST' ? screenPost : PATCH)(req);
  return { status: res.status, json: await res.json() };
}
let runSeq = 0;
function openRun(mode: string, durationSec = 60): string {
  const id = `run_age_${String(++runSeq).padStart(6, '0')}`;
  const now = Date.now();
  h.runs[id] = {
    id, userId: UID, mode: canonicalModeKey(mode), status: 'open', payoutEligible: true, ineligibleReason: null,
    startedAt: new Date(now - durationSec * 1000), expiresAt: new Date(now + 60 * 60 * 1000), result: null,
  };
  return id;
}
async function session(body: Row) {
  h.useSessionTx = true;
  const b = 'runId' in body ? body : { ...body, runId: openRun(String(body.mode ?? ''), Number(body.duration ?? 60)) };
  const res = await sessionPost({ json: async () => b } as never);
  return { status: res.status, body: await res.json() };
}
const payoutOf = (body: Row) => ({
  xp: body.xp, shards: body.shards, credits: body.credits, coins: body.coins,
  walletShards: body.walletShards, streak: body.streakDays, prqDelta: body.prqDelta,
});

beforeEach(() => { h.session = { user: { id: UID } }; h.userId = UID; });

describe('MUST (2) no reward loss', () => {
  it.each([teen, seventeen])('MUST (2) no reward loss: $id POST /api/mirror/screen new screen is 403 and the ledger stays', async (c) => {
    asCase(c);
    const before = ledger(h.db);
    const scan = JSON.parse(JSON.stringify(h.db.tables.workoutScan));
    const r = await screen('POST', { ...SCREEN, screenId: 'scr-new' });
    expect(r.status).toBe(403);
    expect(r.json).toMatchObject({ error: 'scan_save_adults_only', saved: false });
    expect(h.screenGrants).toEqual([]);
    expect(ledger(h.db)).toEqual(before);
    expect(h.db.tables.workoutScan).toEqual(scan);
  });

  it.each([teen, seventeen])('MUST (2) no reward loss: $id retry of an earlier paid screen is 403 and the ledger stays', async (c) => {
    asCase(c);
    const before = ledger(h.db);
    const r = await screen('POST', SCREEN);
    expect(r.status).toBe(403);
    expect(h.screenGrants).toEqual([]);
    expect(ledger(h.db)).toEqual(before);
    expect(h.db.tables.workoutScan).toHaveLength(1);
  });

  it.each([teen, seventeen])('MUST (2) no reward loss: $id PATCH /api/mirror/screen is 403 and the ledger stays', async (c) => {
    asCase(c);
    const before = ledger(h.db);
    const r = await screen('PATCH', ANSWERS);
    expect(r.status).toBe(403);
    expect(r.json).toMatchObject({ error: 'scan_save_adults_only' });
    expect(ledger(h.db)).toEqual(before);
  });

  it.each([teen, seventeen])('MUST (2) no reward loss: $id POST /api/sessions with a form pays like the same session without a form', async (c) => {
    asCase(c);
    const withForm = await session({ ...SESSION, form: FORM });
    expect(withForm.status).toBe(200);
    expect(h.scans).toEqual([]);
    expect(h.prqRows.filter((row) => row.source === 'camera')).toEqual([]);
    const refused = {
      payout: payoutOf(withForm.body),
      grants: h.grants.map((g) => ({ grantType: g.grantType, amount: g.amount })),
      wallet: h.wallet.map((w) => ({ reasonCode: w.reasonCode })),
    };
    asCase(c);
    const noForm = await session(SESSION);
    expect(noForm.status).toBe(200);
    expect(noForm.body.form).toBeNull();
    expect({
      payout: payoutOf(noForm.body),
      grants: h.grants.map((g) => ({ grantType: g.grantType, amount: g.amount })),
      wallet: h.wallet.map((w) => ({ reasonCode: w.reasonCode })),
    }).toEqual(refused);
  });

  it('MUST (2) no reward loss: a teen birth-year write, and the 409 after it, leave the ledger at baseline', async () => {
    asCase(teen);
    h.db.tables.user[0].dobYear = null;
    const before = ledger(h.db);
    const year = THIS_YEAR - 15;
    const req = () => new Request('http://fel.test/api/account/birth-year', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ birthYear: year }),
    });
    const first = await birthPost(req());
    expect(first.status).toBe(200);
    expect(h.db.tables.user[0].dobYear).toBe(year);
    expect(ledger(h.db)).toEqual(before);
    const again = await birthPost(req());
    expect(again.status).toBe(409);
    expect(ledger(h.db)).toEqual(before);
    expect(h.db.tables.user[0].dobYear).toBe(year);
  });

  it('MUST (2) no reward loss: a 13–17 sign-up gets the same welcome LC grant as a 1990 sign-up', async () => {
    const send = async (year: number, email: string) => {
      asCase(teen);
      const res = await signupPost(new Request('http://fel.test/api/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'secret1', name: 'A', birthYear: year }),
      }));
      expect(res.status).toBe(200);
      return h.lc.map((a) => ({ delta: a.delta, reasonCode: a.reasonCode, source: a.source }));
    };
    const teenGrant = await send(THIS_YEAR - 16, 'teen-welcome@fel.test');
    const adultGrant = await send(1990, 'adult-welcome@fel.test');
    expect(teenGrant).toEqual([{ delta: 500, reasonCode: 'WELCOME_GRANT', source: 'milestone' }]);
    expect(adultGrant).toEqual(teenGrant);
  });

  it('MUST (2) no reward loss: the MUST (1) refusal leaves the ledger at baseline', async () => {
    asCase(teen);
    h.db.tables.user[0].dobYear = 1990;
    const before = ledger(h.db);
    await expect(submitIntake(h.spy, {
      userId: UID, rawAnswers: { ...YESNO, birth_year: THIS_YEAR - 15 }, consent: true, now: new Date(),
    })).rejects.toMatchObject({ code: 'health_data_adults_only' });
    expect(ledger(h.db)).toEqual(before);
    expect(h.db.tables.user[0].dobYear).toBe(1990);

    const req = new Request('http://fel.test/api/health/intake', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: { ...YESNO, birth_year: THIS_YEAR - 15 }, consent: true }),
    });
    const res = await intakePost(req as never);
    expect(res.status).toBe(403);
    expect(ledger(h.db)).toEqual(before);
    expect(h.db.tables.user[0].dobYear).toBe(1990);
  });
});
