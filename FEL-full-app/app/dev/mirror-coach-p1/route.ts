export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { decideScreenReward } from '@/lib/mirror/screenReward';
import { distinctChecks, resultsForScreen, scoreScreen, screenFor, screenVariantFor, type ScreenId } from '@/lib/mirror/screen';
import { isUngradedStoredScreen, readStoredScreen, storedScreen } from '@/lib/mirror/screenStore';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { EARLY_WEEKS, generatePlan, isDepthDrop, type PlanWeek } from '@/lib/workout/plan-generator';
import { HELD_FOR_PROTOCOL, revisePlansOnRead, type PlanAudience } from '@/lib/workout/plan-revision';
import { WORKOUT_PLAN_SKUS } from '@/lib/workout/plan-sale';
import { skuOnSale } from '@/lib/wallet/catalog';
import { spend, WalletError } from '@/lib/wallet/wallet-service';

/**
 * /dev/mirror-coach-p1 — MIRROR-COACH P1 live proof (2026-09-25). Development only: a hard 404 outside `next dev`.
 *
 * The lane's dev server runs with its database deliberately offline and has no session, so three server answers the
 * phase changed cannot be reached through their own routes here (each returns 401 before it does anything). This
 * route runs the SAME library code those routes run, in the same order, with only the session and the database
 * replaced — nothing here is a second implementation of a rule:
 *
 *   POST                  → app/api/mirror/screen/route.ts:56-70 (resultsForScreen → screenVariantFor → scoreScreen →
 *                           decideScreenReward → storedScreen) for a fixture athlete, plus what
 *                           app/api/coach/prescribe/route.ts:43-47 would tell the coach about that stored row. The
 *                           probe routes the Mirror harness's own POST here, so the harness renders the server's answer.
 *   GET ?check=plans      → app/api/v1/workout/plan/route.ts GET: revisePlansOnRead over a plan stored before today
 *                           (week-1 depth drop), read three times against an in-memory workoutPlan table that counts
 *                           writes — "revised once".
 *   GET ?check=purchase   → spend() (lib/wallet/wallet-service.ts) for both /workout SKUs against a database stand-in
 *                           that answers the idempotency read and throws on anything else: NOT_ON_SALE, no write.
 *
 * lib/mirror/screen-route.test.ts and lib/workout/plan-route.test.ts run the real route files with the same stand-ins.
 */
const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const athleteId = 'dev-fixture-athlete';
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  // — app/api/mirror/screen/route.ts, the body onwards —
  const b = body as { screenId?: unknown; screen?: unknown; results?: unknown; provisional?: unknown };
  const screenId = String(b?.screenId ?? '').slice(0, 64).replace(/[^A-Za-z0-9_:-]/g, '');
  const claimed: ScreenId = b?.screen === 'full' ? 'full' : 'modified';
  const results = resultsForScreen(claimed, Array.isArray(b?.results) ? b.results : []);
  const screen = screenVariantFor(claimed, results);
  if (!screenId) return NextResponse.json({ error: 'missing_screen_id' }, { status: 400 });
  const summary = scoreScreen(screen, results);
  const decision = decideScreenReward({ screenId, athleteId, provisional: Boolean(b?.provisional), checksTaken: distinctChecks(results) });
  const stored = storedScreen(screenId, screen, results, summary);
  // — app/api/coach/prescribe/route.ts, for this row as the newest (and only) screen on file —
  const graded = readStoredScreen(stored);
  const coachReason = graded ? '(graded: the route drafts from it)' : isUngradedStoredScreen(stored) ? 'ungraded_screen' : 'unreadable_screen';
  return NextResponse.json({
    // what the real route answers (awarded is 0 unless decision.pay, when the grant would run)
    response: { summary, graded: summary.graded, paid: decision.pay, awarded: 0, message: decision.message },
    dev: {
      claimed, storedAs: screen, stationsInVariant: screenFor(screen).map((s) => s.id),
      resultsKept: results.length, wouldCallGrant: decision.pay, stored, coachReason,
    },
  });
}

type Row = { id: string; userId: string; tier: string; focus: string; weeks: unknown; createdAt: Date };

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const check = req.nextUrl.searchParams.get('check');

  if (check === 'plans') {
    const audience: PlanAudience = req.nextUrl.searchParams.get('audience') === 'youth' ? 'youth' : 'adult';
    // a 12-week plan as the route saved it before today: generatePlan's weeks with week 1 Friday's depth drop
    // (the same fixture as lib/workout/plan-route.test.ts boughtBeforeToday and /dev/workout-plans)
    const weeks = JSON.parse(JSON.stringify(generatePlan(analyzeMovement(defaultMetrics()), 'program_12w').weeks)) as PlanWeek[];
    weeks[0].days[2].exercises[1] = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' };
    const table: Row[] = [{ id: 'plan1', userId: 'u1', tier: 'program_12w', focus: 'Mobility & Range', weeks, createdAt: new Date('2026-09-01T00:00:00Z') }];
    const writes: { id: string; userId: string }[] = [];
    const db = {
      workoutPlan: {
        updateMany: async ({ where, data }: { where: { id: string; userId: string }; data: { weeks: unknown } }) => {
          writes.push(where);
          let count = 0;
          for (const r of table) if (r.id === where.id && r.userId === where.userId) { r.weeks = JSON.parse(JSON.stringify(data.weeks)); count++; }
          return { count };
        },
      },
    } as unknown as Parameters<typeof revisePlansOnRead>[0];
    const count = (w: unknown, pred: (week: number) => boolean) => (w as PlanWeek[])
      .filter((x) => pred(x.week))
      .reduce((n, x) => n + x.days.reduce((k, d) => k + d.exercises.filter(isDepthDrop).length, 0), 0);
    const held = (w: unknown) => (w as PlanWeek[]).reduce((n, x) => n + x.days.reduce((k, d) => k + d.exercises.filter((e) => (e as { held?: unknown }).held === HELD_FOR_PROTOCOL).length, 0), 0);
    const fri = (w: unknown) => (w as PlanWeek[])[0].days[2].exercises.map((e) => `${e.name}${(e as { replaced?: string }).replaced ? ` (replaced ${(e as { replaced?: string }).replaced})` : ''}`);
    const snapshot = (w: unknown) => ({
      depthDropsWeek1: count(w, (n) => n === 1), depthDropsWeeks1to4: count(w, (n) => n <= EARLY_WEEKS),
      depthDropsWeeks5plus: count(w, (n) => n > EARLY_WEEKS), heldForProtocol: held(w), week1Friday: fri(w),
    });
    const stored = snapshot(table[0].weeks);
    const reads = [];
    for (let i = 1; i <= 3; i++) {
      const before = writes.length;
      const [plan] = await revisePlansOnRead(db, 'u1', table.map((r) => ({ ...r })), audience);
      reads.push({ read: i, writesThisRead: writes.length - before, revisionNote: plan.revisionNote, ...snapshot(plan.weeks) });
    }
    return NextResponse.json({ audience, storedBeforeToday: stored, reads, totalWrites: writes.length, writesScopedTo: writes });
  }

  if (check === 'purchase') {
    const out: Record<string, unknown> = {};
    for (const sku of WORKOUT_PLAN_SKUS) {
      const touched: string[] = [];
      // a database that has no ledger row for the key and fails on anything else: a charge would have to write
      const db = new Proxy({}, {
        get: (_t, prop) => {
          if (prop === 'then') return undefined;
          touched.push(String(prop));
          if (prop === 'walletLedgerEntry') return { findUnique: async () => null };
          throw new Error(`spend touched prisma.${String(prop)}`);
        },
      }) as unknown as Parameters<typeof spend>[0];
      let answer: string;
      try { await spend(db, { playerId: 'dev-fixture-buyer', idempotencyKey: `dev-p1-${sku}`, skuId: sku, quantity: 1 }); answer = 'CHARGED'; }
      catch (e) { answer = e instanceof WalletError ? `WalletError ${e.code}` : `threw: ${(e as Error).message}`; }
      out[sku] = { skuOnSale: skuOnSale(sku), spend: answer, prismaTouched: touched };
    }
    return NextResponse.json(out);
  }

  return NextResponse.json({ error: 'check=plans|purchase, or POST a screen' }, { status: 400 });
}
