// COACH-DELIVERY COA-11 / COA-12 (2026-10-27): changing a running monthly package (upgrade prorated, downgrade at renewal,
// the renewal split rewritten) and the team fee sent to a roster — both 409 payments_off, before the database or Stripe,
// while payments are off.
import { beforeEach, describe, expect, it } from 'vitest';
import { changeMonthlyPackage, SQL as CHANGE, type ChangeStripe } from '@/lib/coach-business/packageChange';
import { sendTeamFee, teamFeeMessage, teamFeePath } from '@/lib/coach-business/teamFee';
import { parsePackageInput } from '@/lib/coach-business/packages';
import { activePackagesFor, resetBusinessProbe } from '@/lib/coach-business/store';
import { saleSplit, subscriptionFeePercent } from '@/lib/coach-business/fees';
import { PROCESSING_FEE_LINE } from '@/lib/coach-business/connect';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { fakeCoachBusinessDb, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';
import { coach, seedPerson } from '@/tests/helpers/fakeParityDb';
import { fakeDeliveryDb, program } from '@/tests/helpers/fakeDeliveryDb';

const ON = { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_abc', NEXTAUTH_URL: 'https://fel.test' } as unknown as NodeJS.ProcessEnv;
const OFF = {} as NodeJS.ProcessEnv;
const NOW = new Date('2026-10-27T18:00:00Z');
const trap = <T,>(what: string): T => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error(`${what}.${String(p)} touched`); } }) as T;

function fakeStripe() {
  const calls: { op: string; id?: string; params?: any; opts?: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const api: ChangeStripe = {
    subscriptions: {
      retrieve: async (id) => {
        calls.push({ op: 'retrieve', id });
        return { id, status: 'active', metadata: { terms_version: 'v1', saleId: 'sale-1' }, items: { data: [
          { id: 'si_pkg', price: { product: { id: 'prod_old', name: 'Monthly coaching' } } },
          { id: 'si_fee', price: { product: { id: 'prod_fee', name: PROCESSING_FEE_LINE } } },
        ] } };
      },
      update: async (id, params, opts) => { calls.push({ op: 'update', id, params, opts }); return {}; },
    },
    products: { create: async (params) => { calls.push({ op: 'products.create', params }); return { id: 'prod_new' }; } },
  };
  return { api, calls };
}

function setup() {
  const fake = fakeCoachBusinessDb();
  seedCoach(fake.state, { packageId: 'm-basic', kind: 'monthly', priceCents: 10_000, capacity: null });
  fake.state.packages.set('m-plus', { ...fake.state.packages.get('m-basic'), id: 'm-plus', title: 'Monthly plus', priceCents: 20_000 });
  fake.state.packages.set('m-lite', { ...fake.state.packages.get('m-basic'), id: 'm-lite', title: 'Monthly lite', priceCents: 6_000 });
  fake.state.packages.set('pack', { ...fake.state.packages.get('m-basic'), id: 'pack', kind: 'session_pack', sessions: 4 });
  fake.state.sales.set('sale-1', {
    id: 'sale-1', packageId: 'm-basic', coachId: 'coach-1', buyerId: 'buyer-1', kind: 'monthly', status: 'ACTIVE', amountCents: 10_000, feeCents: 500,
    refundedCents: 0, feeRefundedCents: 0, stripeAccountId: 'acct_coach-1', livemode: false, holdExpiresAt: NOW, checkoutSessionId: 'cs_1', paymentIntentId: null,
    subscriptionId: 'sub_1', paidAt: NOW, createdAt: NOW,
  });
  const exec = fake.db.$executeRawUnsafe;
  fake.db.$executeRawUnsafe = (async (sql: string, ...v: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (sql === CHANGE.changeSale) {
      const r = fake.state.sales.get(v[0]);
      if (!r || r.status !== 'ACTIVE' || r.kind !== 'monthly') return 0;
      Object.assign(r, { packageId: v[1], amountCents: v[2], feeCents: v[3] });
      return 1;
    }
    return exec(sql, ...v);
  }) as typeof exec;
  const stripe = fakeStripe();
  const deps = { db: fake.db as never, env: ON, now: NOW, plan: async () => 'free' as const, stripe: () => stripe.api };
  return { fake, stripe, deps };
}

beforeEach(() => { resetBusinessProbe(); resetParityProbe(); resetGroupsProbe(); });

describe('COA-11: change a running monthly package', () => {
  it('payments off → 409 store_closed payments_off, before the database or Stripe', async () => {
    const r = await changeMonthlyPackage({ db: trap('db'), env: OFF, now: NOW, plan: async () => 'free', stripe: () => trap('stripe') }, 'coach-1', 'sale-1', { packageId: 'm-plus' });
    expect(r).toEqual({ ok: false, status: 409, error: 'store_closed', reason: 'payments_off' });
  });

  it('an upgrade: new prices on both lines, prorated, the fee percent and the renewal split rewritten, the sale follows', async () => {
    const { fake, stripe, deps } = setup();
    const r = await changeMonthlyPackage(deps, 'coach-1', 'sale-1', { packageId: 'm-plus' });
    expect(r).toEqual({ ok: true, saleId: 'sale-1', packageId: 'm-plus', priceCents: 20_000, prorated: true });
    const split = saleSplit(20_000);
    const up = stripe.calls.find((c) => c.op === 'update')!;
    expect(up.params.proration_behavior).toBe('create_prorations');
    expect(up.params.items).toEqual([
      { id: 'si_pkg', price_data: { currency: 'usd', product: 'prod_new', unit_amount: 20_000, recurring: { interval: 'month' } } },
      { id: 'si_fee', price_data: { currency: 'usd', product: 'prod_fee', unit_amount: split.processingFeeCents, recurring: { interval: 'month' } } },
    ]);
    expect(up.params.application_fee_percent).toBe(subscriptionFeePercent(split));
    expect(up.params.metadata).toMatchObject({ terms_version: 'v1', saleId: 'sale-1', packageId: 'm-plus', priceCents: '20000', appFeeCents: String(split.applicationFeeCents) });
    expect(up.opts.idempotencyKey).toBe('coach-connect-change:sale-1:m-plus:20000');
    expect(fake.state.sales.get('sale-1')).toMatchObject({ packageId: 'm-plus', amountCents: 20_000, feeCents: split.felShareCents });
  });

  it('a downgrade takes effect at renewal (no proration)', async () => {
    const { stripe, deps } = setup();
    expect(await changeMonthlyPackage(deps, 'coach-1', 'sale-1', { packageId: 'm-lite' })).toMatchObject({ ok: true, prorated: false });
    expect(stripe.calls.find((c) => c.op === 'update')!.params.proration_behavior).toBe('none');
  });

  it('refuses: another coach\'s sale, the same package, a one-off package, a sale not running; Stripe failing changes nothing', async () => {
    const { fake, stripe, deps } = setup();
    expect(await changeMonthlyPackage(deps, 'coach-2', 'sale-1', { packageId: 'm-plus' })).toMatchObject({ status: 404, error: 'sale_not_found' });
    expect(await changeMonthlyPackage(deps, 'coach-1', 'sale-1', { packageId: 'm-basic' })).toMatchObject({ status: 409, error: 'same_package' });
    expect(await changeMonthlyPackage(deps, 'coach-1', 'sale-1', { packageId: 'pack' })).toMatchObject({ status: 400, error: 'not_monthly' });
    stripe.api.subscriptions.update = async () => { throw new Error('stripe down'); };
    expect(await changeMonthlyPackage(deps, 'coach-1', 'sale-1', { packageId: 'm-plus' })).toMatchObject({ status: 502, error: 'change_failed' });
    expect(fake.state.sales.get('sale-1')).toMatchObject({ packageId: 'm-basic', amountCents: 10_000 });
    fake.state.sales.get('sale-1')!.status = 'CANCELED';
    expect(await changeMonthlyPackage(deps, 'coach-1', 'sale-1', { packageId: 'm-plus' })).toMatchObject({ status: 409, error: 'not_active' });
  });
});

describe('COA-12: a team fee sent to the roster', () => {
  it('is a package kind of its own, never listed publicly', async () => {
    expect(parsePackageInput({ kind: 'team_fee', title: 'Spring dues', priceCents: 15_000, includes: ['Gym time', 'Jersey'] })).toMatchObject({ ok: true, value: { kind: 'team_fee' } });
    const { fake } = setup();
    fake.state.packages.set('dues', { ...fake.state.packages.get('m-basic'), id: 'dues', kind: 'team_fee', title: 'Spring dues' });
    expect((await activePackagesFor(fake.db as never, ['coach-1'])).map((p) => p.id)).not.toContain('dues');
  });

  it('payments off → 409 store_closed payments_off, nothing touched', async () => {
    const r = await sendTeamFee({ db: trap('db'), env: OFF, now: NOW, coachSlug: async () => 'x' }, 'coach-1', { packageId: 'dues' });
    expect(r).toEqual({ ok: false, status: 409, error: 'store_closed', reason: 'payments_off' });
  });

  it('posts once into each adult athlete\'s thread with the fee\'s page; minors skipped and counted; no thread, no message', async () => {
    const biz = fakeCoachBusinessDb();
    seedCoach(biz.state, { coachId: 'c1', packageId: 'dues', kind: 'team_fee', priceCents: 15_000 });
    const db = fakeDeliveryDb();
    seedPerson(db, 'ada', 'adult', 'Ada'); seedPerson(db, 'bo', 'adult', 'Bo'); seedPerson(db, 'tia', 'teen', 'Tia');
    coach(db, 'c1', 'ada', 'bo', 'tia');
    program(db, 'p-ada', 'c1', 'ada'); program(db, 'p-tia', 'c1', 'tia');   // Bo has no thread
    const merged = new Proxy(db, { get: (t, p) => (p === '$queryRawUnsafe' ? async (q: string, ...v: unknown[]) => (q.includes('"CoachPackage"') || q.includes("'CoachApplication'") ? biz.db.$queryRawUnsafe(q, ...v) : t.$queryRawUnsafe(q, ...v)) : (t as never)[p]) });
    const r = await sendTeamFee({ db: merged as never, env: ON, now: NOW, coachSlug: async () => 'dee-lane' }, 'c1', { packageId: 'dues', scope: 'roster' });
    expect(r).toEqual({ ok: true, sent: 1, skippedMinor: 1, noThread: 1 });
    expect(db.messages).toEqual([expect.objectContaining({ programId: 'p-ada', authorId: 'c1', body: teamFeeMessage({ title: '4 sessions', priceCents: 15_000, path: teamFeePath('dee-lane', 'dues') }) })]);
    expect(db.messages[0].body).toBe('Team fee: 4 sessions — $150.00 (plus a card processing fee). Pay here: /coach/dee-lane/fee/dues');
    expect(await sendTeamFee({ db: merged as never, env: ON, now: NOW, coachSlug: async () => 'dee-lane' }, 'c2', { packageId: 'dues' })).toMatchObject({ status: 404 });
  });
});
