/**
 * lib/workout/pastBuyer.ts — MIRROR-COACH P8 (2026-09-29): who bought a /workout plan before the relaunch, what that
 * gets them, and the keys and plan ids that make every purchase and every free claim happen once. PURE.
 *
 * THE PROMISE (owner decisions #23 and #24, painfree/DECISIONS-2.md; P8 rule (c)). No refund for an old /workout plan:
 * its buyer keeps the corrected plan and gets "free access to the relaunched templates" (#23), "past buyers get the
 * templates free" (#24), and "a past purchase ledger row grants the relaunched product" (rule (c)). Production has 0
 * WorkoutPlan rows (measured 2026-09-26), so today nobody holds the promise through a plan — it is still built,
 * idempotent and tested, because a ledger row is what proves a purchase and a plan row can be erased by its owner.
 *
 * WHO IS A PAST BUYER (pastBuyerGrant). Either of:
 *   · a LEGACY PLAN — a WorkoutPlan row the old generator wrote (not a template plan, not a relaunch id). Only the old
 *     purchase route wrote those, just after a charge, and the note on each promises this;
 *   · A PAST PURCHASE LEDGER ROW — a SPEND_CATALOG_ITEM ledger row of either workout SKU, a charge (delta < 0), NOT made
 *     by the relaunch (its key is not a WORKOUT_CHARGE_PREFIX key: the old route and /store both used the browser's key).
 *     MIRROR-COACH P8 FIX (2026-09-30, code review + the owner-decision conflicts it raised): ANY such row grants, paid
 *     back or not. It used to grant only for a charge that stood — not refunded, and one the wallet's dead-buy sweep would
 *     not pay back (lib/wallet/dead-buys.ts: a /store buy, or a charge whose plan was erased). With 0 WorkoutPlan rows in
 *     production every pre-relaunch workout charge the sweep sees is refundable, so that reading left the literal rule —
 *     "a past purchase ledger row grants the relaunched product" — unmet for every real past buyer, and a buyer who
 *     erased their plan got a refund (which #23 says never happens) AND lost the free plans (which #23 promises). The
 *     sweep's refund of a legacy charge is the owner's own 2026-09-25 wallet rule and predates P8; this file no longer
 *     depends on it and does not change it. assumption (flagged for the owner): a buyer the sweep paid back keeps the free
 *     plans too — the generous side of two owner rules that disagree; if #23's "Refunds: NONE" should also switch the
 *     sweep off for legacy /workout charges, that is one rule in dead-buys.ts, left for the owner.
 *
 * WHAT IT GETS THEM (MIRROR-COACH P8 FIX, 2026-09-30). Every relaunched template free, one plan per product per template:
 * the claim's plan id is fixed by the account, the product AND the template the answers pick (freePlanId), so claiming
 * the same one twice (a retry, a double click, two tabs racing) writes one row and hands it back, while other answers —
 * another day count, gym instead of bodyweight, the adult template once a birth year is on file — are another free
 * claim. It used to be one claim per product (wp_free_<tier>_<user>, flagged as an assumption): a past buyer who wanted a
 * different template paid 60 or 200 shards, and one who claimed while their birth year was blank used their only claim
 * on a youth template. Bounded: an audience has at most 4 templates × 2 products (a youth, 2 × 1: youth plans are 4-week
 * only, relaunchServer.ts). Nothing is charged either way.
 *
 * THE KEYS.
 *   · A relaunch charge's ledger key is composed on the server: WORKOUT_CHARGE_PREFIX + the user id + the browser's key
 *     (workoutChargeKey). The colon makes it a key the dead-buy sweep never takes (dead-buys.ts isClientMadeKey), so a
 *     relaunch purchase is never paid back by the sweep — its plan is delivered in the same request, and a charge whose
 *     plan did not save (or was erased) is delivered on the buyer's next press, uncharged (unfinishedCharges;
 *     relaunchServer.ts) — and it tells a relaunch charge from a past one without a date.
 *   · A paid plan's id is fixed by its charge (paidPlanId: the ledger row's id), so a retry of the same purchase — same
 *     browser key, spend() hands back the same receipt — finds the plan instead of writing a second one, and a plan whose
 *     write failed after the charge is written by the retry, or by the next press with any key. No schema change: the
 *     plan's own primary key is the link.
 */
import { REASON } from '@/lib/wallet/reward-rules';
import { refundedRowIds, type DeadBuyRow } from '@/lib/wallet/dead-buys';
import { WORKOUT_PLAN_SKUS, productForSku, type WorkoutTier } from './plan-sale';
import { isTemplatePlan } from './relaunch';

/** Every relaunch charge's ledger key starts with this (composed on the server, never the browser's key as is). */
export const WORKOUT_CHARGE_PREFIX = 'workout:';
export const workoutChargeKey = (userId: string, clientKey: string): string => `${WORKOUT_CHARGE_PREFIX}${userId}:${clientKey}`;
export const isRelaunchChargeKey = (key: unknown): boolean => typeof key === 'string' && key.startsWith(WORKOUT_CHARGE_PREFIX);

/** Every plan the relaunch writes has an id with this prefix; a legacy plan's is a cuid. */
export const RELAUNCH_PLAN_ID_PREFIX = 'wp_';
/** A paid plan's id: fixed by the charge that paid for it. */
export const paidPlanId = (ledgerEntryId: string): string => `${RELAUNCH_PLAN_ID_PREFIX}${ledgerEntryId}`;
/** A past buyer's free plan of one product and one template: one per account, product and template. */
export const freePlanId = (userId: string, tier: WorkoutTier, templateId: string): string => `${RELAUNCH_PLAN_ID_PREFIX}free_${tier}_${templateId}_${userId}`;
export const isFreePlanId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(`${RELAUNCH_PLAN_ID_PREFIX}free_`);
export const isRelaunchPlanId = (id: unknown): boolean => typeof id === 'string' && id.startsWith(RELAUNCH_PLAN_ID_PREFIX);

/** A plan row as the grant reads it (weeks optional: the purchase route does not read them). */
export interface PastBuyerPlan { id: string; tier: string; createdAt: Date; weeks?: unknown }

export interface PastBuyerGrant {
  /** A past buyer: every relaunched template is free for them (one plan per product per template). */
  entitled: boolean;
  /** The past workout charges on file (ledger row ids), oldest first — paid back or not. */
  charges: string[];
  /** Legacy plans on file. */
  legacyPlans: number;
}

const skuOf = (r: DeadBuyRow): string => {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  return typeof m.skuId === 'string' ? m.skuId : '';
};
const WORKOUT_SKU_SET: ReadonlySet<string> = new Set<string>(WORKOUT_PLAN_SKUS);
const isWorkoutCharge = (r: DeadBuyRow): boolean => r.reasonCode === REASON.SPEND_CATALOG_ITEM && r.delta < 0 && WORKOUT_SKU_SET.has(skuOf(r));
const oldestFirst = (a: DeadBuyRow, b: DeadBuyRow) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

/** A legacy plan: not built from a template, and not a relaunch id (the id is enough when the weeks were not read). */
export const isLegacyPlan = (p: PastBuyerPlan): boolean => !isRelaunchPlanId(p.id) && !(p.weeks !== undefined && isTemplatePlan(p.weeks));

/**
 * Is this account a past buyer? `rows` = the player's SPEND_CATALOG_ITEM and DEAD_BUY_REFUND ledger rows (the sweep's own
 * read, narrowed); `plans` = every WorkoutPlan row they hold.
 */
export function pastBuyerGrant(rows: readonly DeadBuyRow[], plans: readonly PastBuyerPlan[], _playerId: string): PastBuyerGrant {
  const charges = rows.filter((r) => isWorkoutCharge(r) && !isRelaunchChargeKey(r.idempotencyKey)).sort(oldestFirst).map((r) => r.id);
  const legacyPlans = plans.filter(isLegacyPlan).length;
  return { entitled: charges.length > 0 || legacyPlans > 0, charges, legacyPlans };
}

/** A relaunch charge with no plan on file for it. */
export interface UnfinishedCharge { id: string; tier: WorkoutTier; createdAt: Date }

/**
 * THE RELAUNCH CHARGES THAT HOLD NO PLAN — MIRROR-COACH P8 FIX (2026-09-30, code review: "If the charge goes through and
 * the plan write fails, reloading leaves the shards gone with no plan, and pressing Buy again charges a second time").
 * The retry key lived only in the page's memory, so a reload lost it and the next press was a new purchase; and a relaunch
 * key is never a dead-buy candidate, so the sweep would not pay the first one back either. Now the SERVER finds them:
 * this player's own relaunch charges (key workout:<player>:…) of a workout SKU, with no refund written for them, whose
 * paid plan id (paidPlanId) is not among their plans — a write that failed, or a plan erased since. The purchase route
 * writes the plan for the oldest one of the product instead of charging again (relaunchServer.ts), and the page offers
 * to finish it. Oldest first.
 */
export function unfinishedCharges(rows: readonly DeadBuyRow[], plans: readonly Pick<PastBuyerPlan, 'id'>[], playerId: string): UnfinishedCharge[] {
  const refunded = refundedRowIds(rows);
  const held = new Set(plans.map((p) => p.id));
  const mine = workoutChargeKey(playerId, '');
  return rows
    .filter((r) => isWorkoutCharge(r) && r.idempotencyKey.startsWith(mine) && !refunded.has(r.id) && !held.has(paidPlanId(r.id)))
    .sort(oldestFirst)
    .flatMap((r) => { const p = productForSku(skuOf(r)); return p ? [{ id: r.id, tier: p.tier, createdAt: r.createdAt }] : []; });
}
