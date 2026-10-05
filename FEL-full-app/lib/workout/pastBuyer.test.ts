// MIRROR-COACH P8 (2026-09-29): who is a past /workout buyer, and what the relaunch gives them (owner decisions #23, #24;
// lib/workout/pastBuyer.ts). Pure: ledger rows and plan rows in, the grant out. The route that acts on it, with the real
// spend(), is relaunch-route.test.ts.
//
// Production held 0 WorkoutPlan rows when this was built (measured 2026-09-26), so nobody holds the promise today; it is
// built and tested anyway, because a ledger row is what proves a purchase and a plan can be erased by its owner.
import { describe, expect, it } from 'vitest';
import { REASON } from '@/lib/wallet/reward-rules';
import { deadBuyOf, isClientMadeKey, refundKey, refundableDeadBuys, type DeadBuyRow } from '@/lib/wallet/dead-buys';
import { legacyWeeks } from './plan-generator';
import { pickTemplate, templatePlanWeeks } from './relaunch';
import {
  WORKOUT_CHARGE_PREFIX, freePlanId, isFreePlanId, isLegacyPlan, isRelaunchChargeKey, isRelaunchPlanId, paidPlanId, pastBuyerGrant,
  unfinishedCharges, workoutChargeKey, type PastBuyerPlan,
} from './pastBuyer';

const UUID = '3f2b8c1e-9d4a-4e7b-8c2d-1a2b3c4d5e6f';
const T0 = Date.parse('2026-09-10T12:00:00Z');                               // a purchase before P1 pulled the sale
const at = (min: number) => new Date(T0 + min * 60_000);
let seq = 0;
const charge = (over: Partial<DeadBuyRow> & { sku?: string } = {}): DeadBuyRow => {
  const { sku, ...rest } = over;
  const s = sku ?? 'workout_plan_4w';
  return {
    id: `row_${++seq}`, currency: 'shards', delta: s === 'workout_program_12w' ? -200 : -60, reasonCode: REASON.SPEND_CATALOG_ITEM,
    idempotencyKey: UUID, metadata: { skuId: s, quantity: 1, unitPrice: s === 'workout_program_12w' ? 200 : 60 }, createdAt: at(0), ...rest,
  };
};
const refundOf = (r: DeadBuyRow): DeadBuyRow => ({
  id: `row_${++seq}`, currency: r.currency, delta: -r.delta, reasonCode: REASON.DEAD_BUY_REFUND, idempotencyKey: refundKey(r.id),
  metadata: { refundOf: r.id }, createdAt: at(60 * 24 * 3),
});
/** The plan the old route wrote just after its charge (plan-generator.ts legacyWeeks: the stored shape). */
const legacyPlan = (min: number, tier = 'plan_4w'): PastBuyerPlan => ({ id: `ck${++seq}legacy`, tier, createdAt: new Date(at(min).getTime() + 80), weeks: legacyWeeks('mobility', tier as 'plan_4w') });
const templatePlan = (id: string, tier = 'plan_4w'): PastBuyerPlan => ({ id, tier, createdAt: new Date('2026-10-02T00:00:00Z'), weeks: templatePlanWeeks(pickTemplate({ daysPerWeek: 3, equipment: 'bodyweight' }, false), tier as 'plan_4w') });

describe('the keys and the plan ids', () => {
  it('a relaunch charge key is composed on the server, and the dead-buy sweep never takes it', () => {
    const key = workoutChargeKey('u1', UUID);
    expect(key).toBe(`${WORKOUT_CHARGE_PREFIX}u1:${UUID}`);
    expect(isClientMadeKey(key)).toBe(false);
    expect(isRelaunchChargeKey(key)).toBe(true);
    expect(isRelaunchChargeKey(UUID)).toBe(false);
    expect(deadBuyOf(charge({ idempotencyKey: key }), 'u1')).toBeNull();     // never a refund candidate
    expect(deadBuyOf(charge({ idempotencyKey: UUID }), 'u1')).not.toBeNull(); // a past charge is, as it always was
  });

  it("a paid plan's id is fixed by its charge; a free one by the account, the product AND the template; a legacy id is neither", () => {
    expect(paidPlanId('cle1')).toBe('wp_cle1');
    expect(freePlanId('u1', 'plan_4w', 'adult-bw-3')).toBe('wp_free_plan_4w_adult-bw-3_u1');
    expect(freePlanId('u1', 'program_12w', 'adult-bw-3')).not.toBe(freePlanId('u1', 'plan_4w', 'adult-bw-3'));
    expect(freePlanId('u1', 'plan_4w', 'adult-gym-4')).not.toBe(freePlanId('u1', 'plan_4w', 'adult-bw-3'));
    expect(freePlanId('u2', 'plan_4w', 'adult-bw-3')).not.toBe(freePlanId('u1', 'plan_4w', 'adult-bw-3'));
    expect(isFreePlanId(freePlanId('u1', 'plan_4w', 'adult-bw-3'))).toBe(true);
    expect(isFreePlanId(paidPlanId('cle1'))).toBe(false);
    expect(isRelaunchPlanId(paidPlanId('cle1'))).toBe(true);
    expect(isRelaunchPlanId('ckz9legacyplanid')).toBe(false);
  });

  it('a legacy plan is one the old generator wrote; a template plan, or a relaunch id with its weeks unread, is not', () => {
    expect(isLegacyPlan(legacyPlan(0))).toBe(true);
    expect(isLegacyPlan({ id: 'ckabc', tier: 'plan_4w', createdAt: at(0) })).toBe(true);
    expect(isLegacyPlan(templatePlan('wp_x'))).toBe(false);
    expect(isLegacyPlan({ id: 'ckabc', tier: 'plan_4w', createdAt: at(0), weeks: templatePlan('wp_x').weeks })).toBe(false);
    expect(isLegacyPlan({ id: freePlanId('u1', 'plan_4w', 'adult-bw-3'), tier: 'plan_4w', createdAt: at(0) })).toBe(false);
  });
});

describe('who is a past buyer (MIRROR-COACH P8 FIX, 2026-09-30: rule (c), "a past purchase ledger row grants the relaunched product")', () => {
  it('nobody with no workout charge and no plan', () => {
    expect(pastBuyerGrant([], [], 'u1')).toEqual({ entitled: false, charges: [], legacyPlans: 0 });
    // other SKUs are not workout purchases, and a credit is not a charge
    expect(pastBuyerGrant([charge({ sku: 'session_group_workout', idempotencyKey: 'sess:1' })], [], 'u1').entitled).toBe(false);
    expect(pastBuyerGrant([charge({ delta: 60 })], [], 'u1').entitled).toBe(false);
  });

  it("A PAST PURCHASE LEDGER ROW GRANTS: the old route's charge, claimed by the plan it wrote", () => {
    const c = charge();
    expect(pastBuyerGrant([c], [legacyPlan(0)], 'u1')).toEqual({ entitled: true, charges: [c.id], legacyPlans: 1 });
  });

  it('…AND ONE THE SWEEP PAYS BACK, OR ALREADY PAID BACK (a /store buy, a plan erased): the free plans are theirs too', () => {
    // this pinned the opposite until the fix ("does not ALSO earn the free plans"); with 0 WorkoutPlan rows in production
    // it meant no real past buyer was ever entitled. The sweep still pays such a charge back — its rule is unchanged.
    const unclaimed = charge();
    expect(refundableDeadBuys([deadBuyOf(unclaimed, 'u1')!], { wearables: [], plans: [], firstCharges: new Map(), bookedCharges: new Set() }).map((b) => b.row.id)).toEqual([unclaimed.id]);
    expect(pastBuyerGrant([unclaimed], [], 'u1')).toMatchObject({ entitled: true, charges: [unclaimed.id] });
    expect(pastBuyerGrant([unclaimed, refundOf(unclaimed)], [], 'u1')).toMatchObject({ entitled: true, charges: [unclaimed.id] });
    const other = charge({ idempotencyKey: 'import:u1:x' });
    expect(pastBuyerGrant([other, refundOf(other)], [], 'u1')).toMatchObject({ entitled: true });
  });

  it('a legacy plan alone grants (the note on it promised this), whatever became of its charge', () => {
    expect(pastBuyerGrant([], [legacyPlan(0, 'program_12w')], 'u1')).toMatchObject({ entitled: true, legacyPlans: 1 });
  });

  it('the charges come oldest first, each once', () => {
    const rows = [charge({ createdAt: at(90) }), charge({ createdAt: at(0) }), charge({ createdAt: at(30), sku: 'workout_program_12w' })];
    expect(pastBuyerGrant(rows, [], 'u1').charges).toEqual([rows[1].id, rows[2].id, rows[0].id]);
  });

  it('a RELAUNCH purchase never makes anyone a past buyer: not its charge, not its plan, not a free plan', () => {
    const c = charge({ idempotencyKey: workoutChargeKey('u1', UUID), createdAt: new Date('2026-10-02T00:00:00Z') });
    expect(pastBuyerGrant([c], [templatePlan(paidPlanId(c.id))], 'u1')).toMatchObject({ entitled: false, charges: [], legacyPlans: 0 });
    expect(pastBuyerGrant([], [templatePlan(freePlanId('u1', 'plan_4w', 'adult-bw-3'))], 'u1').entitled).toBe(false);
  });

  it('a relaunch plan cannot claim a past charge for the sweep: it is days after every one (PLAN_CLAIM_WINDOW_MS is minutes)', () => {
    const past = charge();
    const plans = [templatePlan(freePlanId('u1', 'plan_4w', 'adult-bw-3'))];
    expect(refundableDeadBuys([deadBuyOf(past, 'u1')!], {
      wearables: [], plans: plans.map((p) => ({ tier: p.tier, createdAt: p.createdAt })), firstCharges: new Map(), bookedCharges: new Set(),
    }).map((b) => b.row.id)).toEqual([past.id]);
  });
});

describe('THE RELAUNCH CHARGES THAT HOLD NO PLAN (MIRROR-COACH P8 FIX: a failed write, or a plan erased since)', () => {
  const relaunch = (over: Partial<DeadBuyRow> & { sku?: string } = {}) => charge({ idempotencyKey: workoutChargeKey('u1', `k${++seq}`), createdAt: new Date('2026-10-02T00:00:00Z'), ...over });
  it('a relaunch charge with no plan under its paid id is unfinished; with its plan, not', () => {
    const c = relaunch();
    expect(unfinishedCharges([c], [], 'u1')).toEqual([{ id: c.id, tier: 'plan_4w', createdAt: c.createdAt }]);
    expect(unfinishedCharges([c], [{ id: paidPlanId(c.id) }], 'u1')).toEqual([]);
  });
  it('the product comes from the SKU, oldest first; a refunded one, a past charge, another account\'s key are never unfinished', () => {
    const a = relaunch({ sku: 'workout_program_12w', createdAt: new Date('2026-10-03T00:00:00Z') });
    const b = relaunch();
    const refunded = relaunch();
    const other = charge({ idempotencyKey: workoutChargeKey('u2', 'k'), createdAt: new Date('2026-10-02T00:00:00Z') });
    const rows = [a, b, refunded, refundOf(refunded), other, charge()];
    expect(unfinishedCharges(rows, [], 'u1').map((u) => [u.id, u.tier])).toEqual([[b.id, 'plan_4w'], [a.id, 'program_12w']]);
  });
});
