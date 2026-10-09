// lane/drills round 3 (2026-10-07): the landing check unlocks jumps, end to end.
//
//   the Quick Screen's jump test, graded by its real grader (lib/assess replay → gradeSession)
//     → lib/privacy/landingCheckSave.ts maybeSaveLandingCheck (the screen's finish calls it)
//     → the REAL POST /api/mirror/assessment (its validation, its save gate canSaveScanNumbers, its stored row)
//     → that row, read by the REAL jump gate (lib/coach/warmupServer.ts loadWarmupContext → protocolGateServer)
//     → /play/drills' access (lib/drills/access.ts) and Today's warm-up (lib/coach/warmup.ts generateWarmup)
//
// Only the session, the database and the "verified adult, opted in?" status answer are stand-ins. What is pinned: a clean
// landing opens the gate and both surfaces run their jumps; a stiff landing, a check older than the window, and a run
// that never left the device do not; an under-18's run sends zero requests; and the record is the T5 alone, numbers only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = vi.hoisted(() => ({
  session: { user: { id: 'client-1' } } as unknown,
  db: { workoutScan: [] as Row[], prqEntry: [] as Row[], user: [] as Row[], guardianConsent: [] as Row[] },
  clock: 0,
  optedIn: true,
}));
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date) && 'not' in v) return (v as { not: unknown }).not === null ? row[k] != null : row[k] !== (v as { not: unknown }).not;
  return v === null ? row[k] == null : row[k] === v;
});
const pick = (r: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : r);
function table(name: keyof typeof m.db) {
  const rows = () => m.db[name];
  const query = (a: Row = {}) => {
    let r = rows().filter((x) => matches(x, a.where));
    const [[key, dir] = []] = Object.entries(a.orderBy ?? {});
    if (key) r = [...r].sort((x, y) => (new Date(x[key]).getTime() - new Date(y[key]).getTime()) * (dir === 'desc' ? -1 : 1));
    if (typeof a.take === 'number') r = r.slice(0, a.take);
    return r.map((x) => pick(x, a.select));
  };
  return {
    findMany: async (a?: Row) => query(a),
    findFirst: async (a?: Row) => query(a)[0] ?? null,
    findUnique: async (a: Row) => { const r = rows().find((x) => matches(x, a.where)); return r ? pick(r, a.select) : null; },
    create: async (a: Row) => {
      const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(Date.now() + ++m.clock), ...JSON.parse(JSON.stringify(a.data)) };
      if (a.data.measuredAt instanceof Date) row.measuredAt = a.data.measuredAt;
      rows().push(row);
      return pick(row, a.select);
    },
    update: async (a: Row) => {
      const row = rows().find((x) => matches(x, a.where));
      if (!row) throw new Error(`no ${name} row to update`);
      Object.assign(row, JSON.parse(JSON.stringify(a.data)));
      return row;
    },
  };
}
vi.mock('@/lib/privacy/scanSaveOptIn', () => ({ scanSaveOptIn: async () => m.optedIn }));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (!(prop in m.db)) throw new Error(`the route touched prisma.${String(prop)}`);
      return table(prop as keyof typeof m.db);
    },
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/mirror/assessment/route';
import { quickCapture, replay } from '@/lib/assess/replay';
import { ASSESSMENT_ENDPOINT, ASSESSMENT_KIND, mediaIn, validateRecord, type FetchLike } from '@/lib/assess/prqWrite';
import { SCAN_SAVE_STATUS_PATH, landingDevice, landingRecordId, maybeSaveLandingCheck } from '@/lib/privacy/landingCheckSave';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { todayMemoryDb, newTodayStore, type TodayStore } from '@/lib/coach/todayMemoryDb';
import { LANDING_CHECK_DAYS, LANDING_CHECK_HREF } from '@/lib/coach/protocolGate';
import { INTAKE_IDS, INTAKE_VERSION } from '@/lib/health/intake';
import { generateWarmup, type WarmupContext } from '@/lib/coach/warmup';
import { drillsAccess } from '@/lib/drills/access';
import { ROUTE_DRILLS } from '@/lib/drills/route';

const DAY = 86_400_000;
const DEVICE = landingDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', model: 'lite', poseHz: 29.6, cameraFps: 30, width: 720, height: 1280 });
/** The Quick Screen's jump test, graded by the real grader: clean landings, or stiff ones. */
const jumpRun = (stiff = false) => replay(quickCapture({ only: ['T5'], ...(stiff ? { t5: [0, 1, 2].map(() => ({ heightM: 0.4, landDepth: 0.05 })) } : {}) }));

/** The page's fetch, as the browser would make it: the status answer (a stand-in for /api/account/scan-save, which reads
 *  the same canSaveScanNumbers) and the REAL assessment route. Every request is recorded. */
function browser(status: { verifiedAdult: boolean; optedIn: boolean } = { verifiedAdult: true, optedIn: true }) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const f = async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    calls.push({ url, method: init?.method ?? 'GET', ...(init?.body ? { body: init.body } : {}) });
    if (url === SCAN_SAVE_STATUS_PATH) return { ok: true, status: 200, json: async () => status };
    if (url === ASSESSMENT_ENDPOINT) {
      const res = await POST(new NextRequest(`http://fel.test${url}`, { method: init!.method, body: init!.body, headers: init!.headers }));
      return { ok: res.ok, status: res.status, json: async () => res.json() };
    }
    throw new Error(`unexpected request ${url}`);
  };
  return { fetch: f as unknown as FetchLike, calls };
}

// ── the athlete everything else already clears (as lib/coach/protocolGate-today-route.test.ts sets one up) ──
let store: TodayStore;
const cleanAnswers = () => ({
  [INTAKE_IDS.currentPain]: false, [INTAKE_IDS.recentInjuryOrSurgery]: false, [INTAKE_IDS.dizzinessFaintingChestPain]: false,
  [INTAKE_IDS.heartOrBpCondition]: false, [INTAKE_IDS.pregnancyOrPostpartum]: false, [INTAKE_IDS.heartRateOrBalanceMedicine]: false,
  [INTAKE_IDS.clinicianToldToAvoid]: false,
});
/** The rows the assessment route stored, as the gate's database holds them (stored now, unless aged). */
const carryRows = (ageDays = 0) => {
  for (const r of m.db.workoutScan) store.workoutScan!.push({ ...r, createdAt: new Date(Date.now() - ageDays * DAY) });
};
const gate = async (): Promise<WarmupContext> => loadWarmupContext(todayMemoryDb(store) as never, 'client-1');

beforeEach(() => {
  m.db = { workoutScan: [], prqEntry: [], user: [{ id: 'client-1', dobYear: 1990 }], guardianConsent: [] };
  m.optedIn = true;
  m.session = { user: { id: 'client-1' } };
  store = newTodayStore();
  store.user.push({ id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  store.healthConsent!.push({ userId: 'client-1', scope: 'health_data', coachId: null, grantedAt: new Date(Date.now() - 30 * DAY), revokedAt: null });
  store.healthIntake.push({ id: 'hi-1', userId: 'client-1', version: INTAKE_VERSION, createdAt: new Date(Date.now() - 10 * DAY), answers: cleanAnswers(), redFlags: [], clearedAt: null });
});

describe('a verified, opted-in adult\'s landing check opens the jump gate', () => {
  it('before: the gate waits for a landing check, and /play/drills offers it (the unlock button\'s case)', async () => {
    const ctx = await gate();
    expect(ctx.jumpGate.closed).toBe(true);
    expect(ctx.jumpGate.href).toBe(LANDING_CHECK_HREF);
    const a = drillsAccess(ctx);
    expect(a.landingCheck).toBe(true);
    expect(a.drills.find((d) => d.id === 'safe-landing')!.gate).toBe('held');
  });

  it('the screen\'s jump test → the real route stores one landing row → the gate opens → every drill runs, and Today\'s warm-up keeps its jumps', async () => {
    const run = jumpRun();
    const b = browser();
    expect(await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: run.takeoffLeg, pain: run.pain }, DEVICE, b.fetch)).toBe('saved');
    expect(b.calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${SCAN_SAVE_STATUS_PATH}`, `POST ${ASSESSMENT_ENDPOINT}`]);
    expect(m.db.workoutScan).toHaveLength(1);
    expect(m.db.workoutScan[0].kind).toBe(ASSESSMENT_KIND);
    carryRows();
    const ctx = await gate();
    expect(ctx.jumpGate).toEqual({ closed: false, why: '', href: null });
    const a = drillsAccess(ctx);
    expect(a.impactHeld).toBeNull();
    expect(a.landingCheck).toBe(false);
    for (const d of ROUTE_DRILLS) expect(a.drills.find((x) => x.id === d.id)!.gate, d.id).toBe('open');
    // Today's warm-up reads the same context: its Wake-Up keeps the rhythm and the launch
    const plan = generateWarmup({ pattern: null, weakestZone: null, minutes: 10, isYouth: ctx.isYouth, painDecision: ctx.painDecision, readiness: null, jumpGate: ctx.jumpGate });
    expect(plan.steps.map((s) => s.id)).toEqual(expect.arrayContaining(['build-the-rhythm', 'prime-the-launch']));
    expect(plan.heldBack.some((h) => h.why === 'jump_gate')).toBe(false);
  });

  it('and before it, the same warm-up held them for the jump gate (the control)', async () => {
    const ctx = await gate();
    const plan = generateWarmup({ pattern: null, weakestZone: null, minutes: 10, isYouth: ctx.isYouth, painDecision: ctx.painDecision, readiness: null, jumpGate: ctx.jumpGate });
    expect(plan.steps.map((s) => s.id)).not.toContain('build-the-rhythm');
    expect(plan.heldBack.filter((h) => h.why === 'jump_gate').map((h) => h.id)).toEqual(['build-the-rhythm', 'prime-the-launch']);
  });

  it('the 4-week window: the same check stored LANDING_CHECK_DAYS + 1 days ago no longer opens it', async () => {
    const run = jumpRun();
    await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: run.takeoffLeg }, DEVICE, browser().fetch);
    expect(LANDING_CHECK_DAYS).toBe(28);
    carryRows(LANDING_CHECK_DAYS + 1);
    const ctx = await gate();
    expect(ctx.jumpGate.closed).toBe(true);
    expect(drillsAccess(ctx).landingCheck).toBe(true);           // the button offers the check again
  });

  it('a stiff landing is stored, and keeps the gate shut (a fault, regraded on the server)', async () => {
    const run = jumpRun(true);
    expect(await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: run.takeoffLeg }, DEVICE, browser().fetch)).toBe('saved');
    carryRows();
    expect((await gate()).jumpGate.closed).toBe(true);
  });
});

describe('who sends nothing', () => {
  it('an under-18 (or "rather not say") run: ZERO requests, nothing stored, the gate unchanged', async () => {
    const run = jumpRun();
    const b = browser();
    expect(await maybeSaveLandingCheck({ kid: true, tests: run.tests, takeoffLeg: run.takeoffLeg }, DEVICE, b.fetch)).toBe('kid');
    expect(b.calls).toEqual([]);
    expect(m.db.workoutScan).toHaveLength(0);
    expect(m.db.prqEntry).toHaveLength(0);
  });

  it('an adult the server does not call verified-and-opted-in: the status question only, no record sent', async () => {
    const run = jumpRun();
    for (const st of [{ verifiedAdult: true, optedIn: false }, { verifiedAdult: false, optedIn: true }]) {
      const b = browser(st);
      expect(await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: run.takeoffLeg }, DEVICE, b.fetch)).toBe('not-allowed');
      expect(b.calls.map((c) => c.method)).toEqual(['GET']);
    }
    expect(m.db.workoutScan).toHaveLength(0);
  });

  it('a self-reported 18+ whose ACCOUNT is not a verified adult: even a forged "yes" is refused by the route itself (403), nothing stored', async () => {
    m.db.user = [{ id: 'client-1', dobYear: 2011 }];
    const run = jumpRun();
    expect(await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: run.takeoffLeg }, DEVICE, browser().fetch)).toBe('refused');
    expect(m.db.workoutScan).toHaveLength(0);
  });

  it('a pain stop, or a run without the jump test, sends nothing', async () => {
    const run = jumpRun();
    const b = browser();
    expect(await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: null, pain: true }, DEVICE, b.fetch)).toBe('pain');
    const noJump = run.tests.map((t) => (t.id === 'T5' ? { ...t, status: 'skipped' as const } : t));
    expect(await maybeSaveLandingCheck({ kid: false, tests: noJump, takeoffLeg: null }, DEVICE, b.fetch)).toBe('no-landing');
    expect(b.calls).toEqual([]);
  });
});

describe('the record: the landing test alone, numbers only, in the shape both the route and the gate read', () => {
  it('one T5, validated by the route\'s own validator, nothing media-shaped, under a kilobyte or two', async () => {
    const run = replay(quickCapture({}));                         // a FULL screen: only its T5 is sent
    const b = browser();
    await maybeSaveLandingCheck({ kid: false, tests: run.tests, takeoffLeg: run.takeoffLeg }, DEVICE, b.fetch, { id: landingRecordId(() => 0.5) });
    const body = b.calls.find((c) => c.method === 'POST')!.body!;
    const rec = JSON.parse(body);
    expect(rec.tests.map((t: { id: string }) => t.id)).toEqual(['T5']);
    expect(rec.mqs).toBeNull();
    expect(mediaIn(rec)).toBeNull();
    expect(validateRecord(rec).ok).toBe(true);
    expect(body.length).toBeLessThan(2048);
    expect(rec.tests[0].sides.both.metrics).toHaveProperty('landingFlex');
  });

  it('the screen calls it from its finish: the jump result with the screen\'s own kid answer, the full result after the kid return', () => {
    const app = readFileSync('app/play/mirror/assess/_components/assess-app.tsx', 'utf8');
    expect(app).toMatch(/maybeSaveLandingCheck\(\{ kid: view\.kid, tests: v\.result!\.tests/);
    const kidReturn = app.indexOf("if (keepResult(tabStorage(), gateRef.current, summary) === 'kid')");
    const full = app.indexOf('maybeSaveLandingCheck({ kid: false');
    expect(kidReturn).toBeGreaterThan(-1);
    expect(full).toBeGreaterThan(kidReturn);
    // the screen's own trees still make no request of their own (lib/screen/no-save.test.ts's rule): the helper does
    expect(app).not.toMatch(/\bfetch\s*\(|postAssessment|['"`]\/api\//);
  });
});
