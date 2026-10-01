/**
 * lib/workout/relaunchServer.ts — MIRROR-COACH P8 (2026-09-29): /workout's server half. GET and POST
 * /api/v1/workout/plan call these two; they take the database as an argument (the Today pattern), so the route tests run
 * the real code — spend() included — over an in-memory store on a lane whose database is offline on purpose.
 *
 * loadWorkoutPage — the reader's plans and what they may buy:
 *   · LEGACY plans (the old generator's) exactly as P1/P2 serve them: revised on read for who is reading, the storage
 *     revision written once (plan-revision.ts revisePlansOnRead — unchanged, and plan-route.test.ts still pins it);
 *   · TEMPLATE plans through the protocol gate for the reader, today (relaunch.ts gatedPlanView over protocolGate.ts
 *     protocolReasons from protocolGateServer.ts loadProtocolFacts). The gate's tables are read only when a plan holds a
 *     gated item; a failed read shuts the gate for that read (GATE_UNREAD_LINE), never opens it;
 *   · THE OFFER: the reader's audience (the server's age truth, not the page's), each product at the catalog's price, on
 *     sale or not, and free or not (pastBuyer.ts). When the past purchases cannot be read, nothing is offered on that
 *     read (`purchasable: false`): a past buyer must never be shown a price they would not pay. Nor when the birth year
 *     cannot be read: the template the page would preview is then a guess (the purchase route refuses it too, 503).
 *
 * buyWorkoutPlan — one purchase, checked in this order, nothing written until the last steps:
 *   1. the product, the answers and the browser's key are exactly what the page sends (400 otherwise);
 *   2. the product is on sale (lib/wallet/catalog.ts skuOnSale; spend() checks it again);
 *   3. the reader's birth year is read — a failed read refuses the purchase (503), because a youth template bought on an
 *      unknown age would be the wrong product for an adult;
 *   4. MIRROR-COACH P8 FIX (2026-09-30): NO BIRTH YEAR ON FILE, NOTHING SOLD OR CLAIMED (409 age_needed, with the link to
 *      the health answers). A plan keeps the template it was made with, so a youth template bought on a blank birth year
 *      stayed youth after the answer — decision #20's "blank = youth rules UNTIL ANSWERED" made permanent — and a past
 *      buyer's free claim went to it. The birth year is one question in the health intake (lib/health/intake.ts);
 *   5. the answers fit the reader's audience (plan-sale.ts DAY_CHOICES), and a youth reader buys the 4-week plan only
 *      (409 youth_4w_only: a youth template's 12 weeks are its 4 weeks three times — MIRROR-COACH P8 FIX);
 *   6. the template for the answers and the reader (relaunch.ts pickTemplate) passes every template check
 *      (templates/index.ts templateProblemsOnce: six patterns and pull ≥ push every week, the ladders, the bands) —
 *      500 template_invalid otherwise, nothing charged — and is the one the page showed, when the page says which
 *      (`template`; 409 template_changed otherwise — MIRROR-COACH P8 FIX: the server used to charge for a template the
 *      page never previewed, after the account's age changed in another tab);
 *   7. the past purchases are read — a failed read refuses (503): never charge someone who may be owed it free;
 *   8. MIRROR-COACH P8 FIX: A PAID CHARGE OF THIS PRODUCT WITH NO PLAN (its write failed, or the plan was deleted since —
 *      pastBuyer.ts unfinishedCharges) is finished instead of charging again: its plan is written under
 *      paidPlanId(that charge), `recovered: true`. The retry key used to live only in the page's memory, so a reload lost
 *      it and the next press charged a second time;
 *   9a. a past buyer: the plan is written under freePlanId(account, product, template), no charge. The same claim again,
 *       or two racing, find that row (P2002 on the fixed id) and hand it back: one row, nothing new. A request that asks
 *       for the free claim (`free: true`) from an account that is not a past buyer is refused (409 not_free), nothing
 *       written;
 *   9b. everyone else: spend() at the catalog price under the server-composed key (pastBuyer.ts workoutChargeKey), then
 *       the plan under paidPlanId(the charge). A retry with the same browser key gets spend()'s receipt for the same
 *       charge and finds (or, when the first write failed, writes) the same plan: one charge, one plan.
 */
import type { PrismaClient } from '@/public/_prisma/client';
import { spend as walletSpend, WalletError } from '@/lib/wallet/wallet-service';
import { REASON } from '@/lib/wallet/reward-rules';
import { getSku, skuOnSale } from '@/lib/wallet/catalog';
import { isClientMadeKey, type DeadBuyRow } from '@/lib/wallet/dead-buys';
import { isMinorForMirror } from '@/lib/mirror/youth';
import { dailyTargetLine, templateById, templateProblemsOnce } from '@/lib/coach/templates';
import { protocolReasons } from '@/lib/coach/protocolGate';
import { loadProtocolFacts, type ProtocolDb } from '@/lib/coach/protocolGateServer';
import { planAudience, revisePlansOnRead } from './plan-revision';
import {
  WORKOUT_AGE_HREF, WORKOUT_PLAN_NOT_SAVED, WORKOUT_PRODUCTS, parseAnswers, productFor, productsFor, type WorkoutProduct, type WorkoutTier,
} from './plan-sale';
import { GATE_UNREAD_REASON, gatedPlanView, hasGatedItem, isTemplatePlan, pickTemplate, templatePlanWeeks, type PlanGateFacts, type PlanWeekView } from './relaunch';
import {
  freePlanId, isFreePlanId, paidPlanId, pastBuyerGrant, unfinishedCharges, workoutChargeKey,
  type PastBuyerGrant, type PastBuyerPlan, type UnfinishedCharge,
} from './pastBuyer';

export type WorkoutDb = ProtocolDb & Pick<PrismaClient, 'workoutPlan' | 'wallet' | 'walletLedgerEntry'>;
type SpendFn = typeof walletSpend;

/** A WorkoutPlan row as the page reads it. */
interface PlanRow { id: string; userId: string; tier: string; focus: string; weeks: unknown; createdAt: Date; scanId?: string | null }

/** A template plan as the page receives it: gated for the reader, today. */
export interface TemplatePlanView {
  id: string;
  kind: 'template';
  tier: string;
  focus: string;
  createdAt: Date;
  /** A past buyer's free claim. */
  free: boolean;
  template: { id: string; name: string; summary: string; equipmentLine: string; audience: string; dailyTargetLine: string | null } | null;
  weeks: PlanWeekView[];
  gate: { gatedItems: number; swapped: number; held: number };
  revisionNote: null;
}

export interface OfferProduct {
  tier: WorkoutTier; sku: string; name: string; weeks: number; line: string; price: number; currency: string;
  /** On sale, and sold to this reader's audience (a youth reader: the 4-week plan only). */
  onSale: boolean;
  free: boolean;
  /** MIRROR-COACH P8 FIX: a charge of this product holds no plan; the next press writes it, uncharged. */
  unfinished: boolean;
}
/** Why nothing is offered on this read (MIRROR-COACH P8 FIX: the page says the right one). null = offered. */
export type OfferBlock = 'purchases' | 'age_unread' | 'age_needed' | null;
export interface WorkoutOffer {
  /** The server's age truth (isMinorForMirror): 'youth' = under 18, or no birth year on file. */
  audience: 'adult' | 'youth';
  /** A birth year is on file. */
  ageKnown: boolean;
  /** null = the past purchases could not be read. */
  pastBuyer: boolean | null;
  /** false when anything the price depends on could not be read, or no birth year is on file: nothing offered. */
  purchasable: boolean;
  blockedBy: OfferBlock;
  /** Where the birth year is answered, when that is what blocks. */
  ageHref: string | null;
  products: OfferProduct[];
}

const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === 'P2002';
const priceOf = (p: WorkoutProduct) => getSku(p.sku);

/** What the player's ledger says about /workout: the past-buyer grant, and the paid charges that hold no plan. */
interface LedgerRead { grant: PastBuyerGrant; unfinished: UnfinishedCharge[] }

/** The player's ledger rows the grant reads: their charges and the refunds written for them (the sweep's read, narrowed). */
async function readLedger(db: WorkoutDb, userId: string, plans: readonly PastBuyerPlan[]): Promise<LedgerRead> {
  const wallet = await db.wallet.findUnique({ where: { playerId: userId }, select: { id: true } });
  const raw = wallet
    ? await db.walletLedgerEntry.findMany({
      where: { walletId: wallet.id, reasonCode: { in: [REASON.SPEND_CATALOG_ITEM, REASON.DEAD_BUY_REFUND] } },
      select: { id: true, currency: true, delta: true, reasonCode: true, idempotencyKey: true, metadata: true, createdAt: true },
    })
    : [];
  const rows: DeadBuyRow[] = raw.map((r) => ({ ...r, currency: String(r.currency), delta: Number(r.delta) }));
  return { grant: pastBuyerGrant(rows, plans, userId), unfinished: unfinishedCharges(rows, plans, userId) };
}

/** The reader's gate today, or 'unread' when its facts could not be read (the careful direction). */
async function readGate(db: WorkoutDb, userId: string, now: Date, dobYear: number | null | undefined): Promise<PlanGateFacts> {
  try {
    return protocolReasons(await loadProtocolFacts(db, userId, now, dobYear === undefined ? {} : { dobYear }), now);
  } catch (e) {
    console.error('[workout/relaunch] the protocol gate could not be read; gated items take their easier step on this read', e);
    return GATE_UNREAD_REASON;
  }
}

function templateMeta(templateId: string | null): TemplatePlanView['template'] {
  const t = templateId ? templateById(templateId) : null;
  if (!t) return null;
  return {
    id: t.id, name: t.name, summary: t.summary, equipmentLine: t.equipmentLine, audience: t.audience,
    dailyTargetLine: t.dailyTargetMinutes ? dailyTargetLine(t.dailyTargetMinutes) : null,
  };
}

function templateView(row: PlanRow, gate: PlanGateFacts | null): TemplatePlanView {
  const weeks = isTemplatePlan(row.weeks) ? row.weeks : [];
  // no gated item: nothing to decide, so no facts were read (gate null) and none are needed
  const v = gatedPlanView(weeks, gate ?? []);
  return {
    id: row.id, kind: 'template', tier: row.tier, focus: row.focus, createdAt: row.createdAt, free: isFreePlanId(row.id),
    template: templateMeta(weeks[0]?.template ?? null), weeks: v.weeks, gate: { gatedItems: v.gatedItems, swapped: v.swapped, held: v.held },
    revisionNote: null,
  };
}

/** Template plans, gated: the gate's facts are read once, and only when one of them holds a gated item. */
async function templateViews(db: WorkoutDb, userId: string, rows: readonly PlanRow[], now: Date, dobYear: number | null | undefined): Promise<TemplatePlanView[]> {
  const gated = rows.some((r) => isTemplatePlan(r.weeks) && hasGatedItem(r.weeks));
  const gate = gated ? await readGate(db, userId, now, dobYear) : null;
  return rows.map((r) => templateView(r, gate));
}

/**
 * `ageRead` false = the birth year could not be read: the audience shown would be a guess, so nothing is offered. No
 * birth year on file: nothing is offered either (MIRROR-COACH P8 FIX; the header's step 4), and `blockedBy` says which.
 */
function offerFor(dobYear: number | null | undefined, ledger: LedgerRead | null, now: Date, ageRead = true): WorkoutOffer {
  const audience = isMinorForMirror(dobYear, now) ? 'youth' : 'adult';
  const sold = productsFor(audience);
  const products = WORKOUT_PRODUCTS.map((p): OfferProduct => {
    const sku = priceOf(p);
    return {
      tier: p.tier, sku: p.sku, name: p.name, weeks: p.weeks, line: p.line,
      price: sku?.unitPrice ?? 0, currency: sku?.currency ?? 'shards', onSale: skuOnSale(p.sku) && sold.includes(p),
      free: ledger?.grant.entitled === true,
      unfinished: !!ledger?.unfinished.some((u) => u.tier === p.tier),
    };
  });
  const ageKnown = typeof dobYear === 'number';
  const blockedBy: OfferBlock = !ageRead ? 'age_unread' : ledger === null ? 'purchases' : !ageKnown ? 'age_needed' : null;
  return {
    audience, ageKnown,
    pastBuyer: ledger ? ledger.grant.entitled : null,
    purchasable: blockedBy === null,
    blockedBy,
    ageHref: blockedBy === 'age_needed' ? WORKOUT_AGE_HREF : null,
    products,
  };
}

/** GET /api/v1/workout/plan: every plan the reader holds (newest first) and what they may buy. */
export async function loadWorkoutPage(db: WorkoutDb, userId: string, now: Date = new Date()) {
  const [me, rows] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null),
    db.workoutPlan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }) as Promise<PlanRow[]>,
  ]);
  const legacyRows = rows.filter((r) => !isTemplatePlan(r.weeks));
  const templateRows = rows.filter((r) => isTemplatePlan(r.weeks));
  const [legacy, templates, grant] = await Promise.all([
    // P1/P2's read, unchanged: a failed birth-year read serves the youth view and stores nothing that depends on it
    revisePlansOnRead(db, userId, legacyRows, planAudience(me?.dobYear)),
    templateViews(db, userId, templateRows, now, me === null ? undefined : me.dobYear),
    readLedger(db, userId, rows).catch((e) => {
      console.error('[workout/relaunch] past purchases could not be read; nothing is offered on this read', e);
      return null;
    }),
  ]);
  const byId = new Map<string, unknown>([...legacy.map((p) => [p.id, { ...p, kind: 'legacy' }] as const), ...templates.map((p) => [p.id, p] as const)]);
  return { plans: rows.map((r) => byId.get(r.id)).filter(Boolean), offer: offerFor(me?.dobYear, grant, now, me !== null) };
}

export type BuyResult = { status: number; body: Record<string, unknown> };
const refuse = (status: number, error: string, extra: Record<string, unknown> = {}): BuyResult => ({ status, body: { error, ...extra } });

/** Write the plan under its fixed id, or find the one already there (a retry, or a racing twin). */
async function writeOnce(db: WorkoutDb, data: { id: string; userId: string; tier: WorkoutTier; focus: string; weeks: unknown }): Promise<{ row: PlanRow; replayed: boolean }> {
  try {
    const row = await db.workoutPlan.create({ data: { ...data, weeks: data.weeks as never } }) as PlanRow;
    return { row, replayed: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const row = await db.workoutPlan.findUnique({ where: { id: data.id } }) as PlanRow | null;
    if (!row || row.userId !== data.userId) throw e;
    return { row, replayed: true };
  }
}

/** POST /api/v1/workout/plan: one purchase or one free claim (see the header for the order of checks). */
export async function buyWorkoutPlan(
  db: WorkoutDb, userId: string, body: unknown, now: Date = new Date(), deps: { spend: SpendFn } = { spend: walletSpend },
): Promise<BuyResult> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const product = productFor(b.tier);
  if (!product) return refuse(400, 'unknown_tier');
  if (!parseAnswers(b.answers)) return refuse(400, 'bad_answers');
  const clientKey = typeof b.idempotency_key === 'string' ? b.idempotency_key : '';
  if (!isClientMadeKey(clientKey)) return refuse(400, 'missing_idempotency_key');
  if (!skuOnSale(product.sku)) return refuse(403, 'not_on_sale');

  let me: { dobYear: number | null } | null;
  try { me = await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }); }
  catch { return refuse(503, 'try_again'); }
  if (!me) return refuse(401, 'unauthorized');
  // MIRROR-COACH P8 FIX (2026-09-30): no birth year, no plan — a plan keeps the template it was made with (header step 4)
  if (typeof me.dobYear !== 'number') return refuse(409, 'age_needed', { href: WORKOUT_AGE_HREF });
  const youth = isMinorForMirror(me.dobYear, now);
  const answers = parseAnswers(b.answers, youth ? 'youth' : 'adult');
  if (!answers) return refuse(400, 'bad_answers');
  if (!productsFor(youth ? 'youth' : 'adult').includes(product)) return refuse(409, 'youth_4w_only');
  const template = pickTemplate(answers, youth);
  if (templateProblemsOnce(template).length) return refuse(500, 'template_invalid');
  if (typeof b.template === 'string' && b.template !== template.id) return refuse(409, 'template_changed', { template: template.id });
  const weeks = templatePlanWeeks(template, product.tier);

  let ledger: LedgerRead;
  try {
    const plans = await db.workoutPlan.findMany({ where: { userId }, select: { id: true, tier: true, createdAt: true } }) as PastBuyerPlan[];
    ledger = await readLedger(db, userId, plans);
  } catch { return refuse(503, 'try_again'); }
  const { grant } = ledger;

  const plan = { userId, tier: product.tier, focus: template.name, weeks };
  const answer = async (row: PlanRow, extra: Record<string, unknown>): Promise<BuyResult> => {
    const [view] = await templateViews(db, userId, [row], now, me!.dobYear);
    return { status: 200, body: { planId: row.id, plan: view, ...extra } };
  };

  // MIRROR-COACH P8 FIX (2026-09-30): a paid charge of this product that holds no plan is finished, never charged again
  // (header step 8). Its plan id is fixed by that charge, so a press racing the first request's own write finds one row.
  const owed = ledger.unfinished.find((u) => u.tier === product.tier);
  if (owed) {
    const { row, replayed } = await writeOnce(db, { id: paidPlanId(owed.id), ...plan });
    return answer(row, { free: false, charged: null, recovered: true, replayed });
  }

  // A past buyer's claim — every template free, one plan per product and template (pastBuyer.ts). A request that ASKS for
  // the free claim (`free: true`, what the page sends on a free card) is never charged: the same claim again gets that
  // plan back (a retry, a double click, a second tab), and an account that is not a past buyer is refused with nothing
  // written. A request that does not ask, from a past buyer, is claimed free anyway: nobody owed it free pays for it.
  if (grant.entitled || b.free === true) {
    if (!grant.entitled) return refuse(409, 'not_free');
    const { row, replayed } = await writeOnce(db, { id: freePlanId(userId, product.tier, template.id), ...plan });
    return answer(row, { free: true, charged: null, replayed });
  }

  let receipt: Awaited<ReturnType<SpendFn>>;
  try {
    receipt = await deps.spend(db as unknown as PrismaClient, { playerId: userId, idempotencyKey: workoutChargeKey(userId, clientKey), skuId: product.sku, quantity: 1 });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      const w = await db.wallet.findUnique({ where: { playerId: userId }, select: { shards: true } }).catch(() => null);
      return refuse(409, 'insufficient_funds', { price: priceOf(product)?.unitPrice ?? null, shards: w ? Number(w.shards) : null, needShards: true });
    }
    if (e instanceof WalletError && e.code === 'REPLAYED_KEY') return refuse(409, 'replayed_key');
    if (e instanceof WalletError && e.code === 'NOT_ON_SALE') return refuse(403, 'not_on_sale');
    throw e;
  }
  try {
    const { row, replayed } = await writeOnce(db, { id: paidPlanId(receipt.entry_id), ...plan });
    return answer(row, { free: false, charged: receipt.spent, balances: receipt.balances, replayed });
  } catch (e) {
    console.error('[workout/relaunch] the charge went through and the plan did not save; the same key retries it', e);
    return refuse(500, 'plan_not_saved', { message: WORKOUT_PLAN_NOT_SAVED });
  }
}
