// COACH-BUSINESS: lib/coach-business/store.ts and the webhook against a REAL Postgres with
// prisma/pending/2026-10-25-coach-business.sql applied, through the real Prisma client's raw calls.
//
// Opt-in and local-only, like the other *.integration.test.ts files: it runs when COACH_BUSINESS_IT=1 and DATABASE_URL
// points at a database on 127.0.0.1 / localhost that is not fel_dev or fel — a throwaway one — and is skipped everywhere
// else, CI included. What the in-memory stand-in cannot show, this does: every statement is valid SQL against the real
// tables, the capacity lock really serialises concurrent buyers, and the compare-and-set moves really happen once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeLedger } from '@/tests/helpers/fakeCoachBusinessDb';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_DB = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?!fel_dev(?:[?]|$)|fel(?:[?]|$))[\w-]+(?:\?.*)?$/.test(DB_URL);
const RUN = process.env.COACH_BUSINESS_IT === '1' && LOCAL_DB;

let prisma: any;
let store: typeof import('@/lib/coach-business/store');
let webhook: typeof import('@/lib/coach-business/webhook');
const TAG = `it${Date.now().toString(36)}`;
const COACH = `${TAG}-coach`;
const BUYERS = [1, 2, 3, 4, 5].map((n) => `${TAG}-buyer${n}`);

describe.skipIf(!RUN)('coach-business tables on a real Postgres', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    store = await import('@/lib/coach-business/store');
    webhook = await import('@/lib/coach-business/webhook');
    store.resetBusinessProbe();
    for (const id of [COACH, ...BUYERS]) await prisma.$executeRawUnsafe(`INSERT INTO "User" ("id", "name") VALUES ($1, $2)`, id, `Name ${id}`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Instructor" ("id", "userId", "slug", "displayName", "published", "updatedAt") VALUES ($1, $2, $3, 'IT Coach', true, NOW())`, `${TAG}-i`, COACH, `${TAG}-slug`);
  });
  afterAll(async () => {
    await prisma?.$executeRawUnsafe(`DELETE FROM "CoachSale" WHERE "coachId" = $1`, COACH);
    await prisma?.$executeRawUnsafe(`DELETE FROM "CoachPackage" WHERE "coachId" = $1`, COACH);
    await prisma?.$executeRawUnsafe(`DELETE FROM "Instructor" WHERE "userId" = $1`, COACH);
    await prisma?.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" LIKE $1`, `${TAG}%`);
    await prisma?.$disconnect();
  });

  it('the probe sees the tables', async () => {
    expect(await store.businessReady(prisma)).toBe(true);
  });

  it('every read and write statement runs against the real tables', async () => {
    await store.saveMarketProfile(prisma, { userId: COACH, listed: true, acceptingClients: true, sports: ['basketball'], goals: ['vertical'] });
    expect(await store.marketProfile(prisma, COACH)).toMatchObject({ listed: true, sports: ['basketball'], goals: ['vertical'] });
    expect((await store.listedCoaches(prisma)).some((c: any) => c.userId === COACH)).toBe(true);
    const id = await store.insertPackage(prisma, COACH, { kind: 'session_pack', title: 'Four', summary: '', priceCents: 20_000, includes: ['a', 'b'], capacity: 2, sessions: 4, active: true }, 0);
    expect((await store.packageById(prisma, id))).toMatchObject({ includes: ['a', 'b'], capacity: 2, sessions: 4 });
    expect(await store.updatePackage(prisma, id, 'someone-else', { kind: 'program', title: 'x', summary: '', priceCents: 100, includes: ['x'], capacity: null, sessions: null, active: true })).toBe(false);
    expect(await store.countPackages(prisma, COACH)).toBe(1);
    expect((await store.activePackagesFor(prisma, [COACH])).map((p: any) => p.id)).toEqual([id]);
    const conn = await store.keepConnect(prisma, COACH, `acct_${TAG}`, false);
    const again = await store.keepConnect(prisma, COACH, `acct_${TAG}_second`, false);
    expect(again.stripeAccountId).toBe(conn.stripeAccountId);   // the first account id is kept
    await store.updateConnect(prisma, conn.stripeAccountId, { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
    expect(await store.connectFor(prisma, COACH)).toMatchObject({ chargesEnabled: true });
    const hl = await store.insertHighlight(prisma, COACH, BUYERS[0], 'A result worth sharing.');
    expect(await store.consentHighlight(prisma, hl, BUYERS[1])).toBe(false);
    expect(await store.consentHighlight(prisma, hl, BUYERS[0])).toBe(true);
    expect((await store.highlightById(prisma, hl))).toMatchObject({ consentAdult: true, revokedAt: null });
    await store.saveApplication(prisma, { coachId: COACH, applicantId: BUYERS[2], packageId: id, goal: 'vertical', note: 'hi' });
    await store.saveApplication(prisma, { coachId: COACH, applicantId: BUYERS[2], packageId: null, goal: 'speed', note: '' });
    const apps = await store.applicationsFor(prisma, COACH);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ goal: 'speed', applicantName: `Name ${BUYERS[2]}` });
  });

  it('the capacity lock serialises five buyers racing for two spots: exactly two hold one', async () => {
    const pkg = (await store.activePackagesFor(prisma, [COACH]))[0];
    const now = new Date();
    const results = await Promise.all(BUYERS.map((b) => store.holdSpot(prisma, { pkg, buyerId: b, feeCents: 1_000, stripeAccountId: `acct_${TAG}`, livemode: false, now, holdMinutes: 30 })));
    expect(results.filter((r: any) => r.ok)).toHaveLength(2);
    expect(results.filter((r: any) => !r.ok && r.reason === 'full')).toHaveLength(3);
    expect((await store.takenFor(prisma, [pkg.id], now)).get(pkg.id)).toBe(2);
    const later = new Date(now.getTime() + 31 * 60_000);
    expect((await store.takenFor(prisma, [pkg.id], later)).get(pkg.id) ?? 0).toBe(0);   // expired holds free their spots
  });

  it('the webhook path on real rows: paid once, refunded with a compare-and-set, fee booked once per step', async () => {
    const pkg = (await store.activePackagesFor(prisma, [COACH]))[0];
    const sale = (await prisma.$queryRawUnsafe(`SELECT "id" FROM "CoachSale" WHERE "coachId" = $1 AND "status" = 'PENDING' LIMIT 1`, COACH))[0].id;
    await store.attachCheckout(prisma, sale, `cs_${TAG}`);
    const ledger = fakeLedger();
    const deps = { db: prisma, post: ledger.post };
    const session: any = { id: `cs_${TAG}`, mode: 'payment', payment_status: 'paid', payment_intent: `pi_${TAG}`, metadata: { product: 'COACH_CONNECT', saleId: sale } };
    expect(await webhook.fulfilConnectCheckout(deps, session)).toBe('fulfilled');
    expect(await webhook.fulfilConnectCheckout(deps, session)).toBe('already');
    expect(await webhook.recordConnectRefund(deps, sale, `ch_${TAG}`, 10_000)).toBe('refunded');
    expect(await webhook.recordConnectRefund(deps, sale, `ch_${TAG}`, 10_000)).toBe('noop');
    expect(await webhook.recordConnectRefund(deps, sale, `ch_${TAG}`, 20_000)).toBe('refunded');
    const row = await store.saleById(prisma, sale);
    expect(row).toMatchObject({ status: 'REFUNDED', refundedCents: 20_000, feeRefundedCents: 1_000, paymentIntentId: `pi_${TAG}` });
    expect(ledger.rows.map((r) => r.kind)).toEqual(['COACH_CONNECT_FEE', 'COACH_CONNECT_FEE_REFUND', 'COACH_CONNECT_FEE_REFUND']);
    expect((await store.salesForCoach(prisma, COACH)).find((s: any) => s.id === sale)).toMatchObject({ title: pkg.title, status: 'REFUNDED' });
  });
});
