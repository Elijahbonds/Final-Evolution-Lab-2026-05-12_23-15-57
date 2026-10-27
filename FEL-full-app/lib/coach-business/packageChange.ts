// lib/coach-business/packageChange.ts — COACH-DELIVERY COA-11 (2026-10-27): a coach moves a client's RUNNING monthly
// coaching to another of their monthly packages — an upgrade or a downgrade — on the same Stripe subscription.
//
// THE RULES (every money rule is the existing one, applied to the new price):
//   · the switch first: payments off (or not set up, or live without signed coach terms) → 409 store_closed with the
//     reason, before the database or Stripe is touched (connect.ts connectGate, the checkout's own fence);
//   · the coach's own ACTIVE monthly sale, to another ACTIVE monthly package of theirs with a spot open;
//   · the split is the checkout's: FEL's share by the owner's fee policy for the coach's plan (fees.ts platformFee), the
//     buyer's processing fee grossed up on top (saleSplit), the subscription's application_fee_percent and its metadata
//     (connect.ts saleMetadata) rewritten, so every renewal invoice is set to the new split exactly (webhook.ts
//     connectInvoiceCreated reads that metadata);
//   · PRORATION: an UPGRADE is prorated — Stripe adds the difference for the rest of the month to the next invoice
//     ('create_prorations'); a DOWNGRADE takes effect at the next renewal with no mid-month credit ('none').
//     assumption (owner call, docs/DRAFT-coach-terms.md): no credit back for a downgrade mid-month;
//   · the sale row follows (packageId, amountCents, feeCents), compare-and-set on ACTIVE.
import type { CoachPlan } from './plan';
import { connectGate, PROCESSING_FEE_LINE, saleMetadata } from './connect';
import { platformFeePolicy } from './config';
import { monthStartUtc, needsMonthToDate, platformFee, saleSplit, subscriptionFeePercent } from './fees';
import { businessReady, coachFeesThisMonth, packageById, saleById, takenFor, type RawDb } from './store';

/** The two Stripe calls a change makes (and products.create for the new line's name), as a narrow surface. */
export interface ChangeStripe {
  subscriptions: {
    retrieve(id: string, opts?: { expand?: string[] }): Promise<{ id: string; status?: string; metadata?: Record<string, string> | null; items: { data: { id: string; price: { product: string | { id: string; name?: string } } }[] } }>;
    update(id: string, params: Record<string, unknown>, opts?: { idempotencyKey?: string }): Promise<unknown>;
  };
  products: { create(params: { name: string; description?: string }): Promise<{ id: string }> };
}

export interface ChangeDeps { db: RawDb; stripe: () => ChangeStripe; env: NodeJS.ProcessEnv; now: Date; plan: (coachId: string) => Promise<CoachPlan> }

export type ChangeResult =
  | { ok: true; saleId: string; packageId: string; priceCents: number; prorated: boolean }
  | { ok: false; status: number; error: string; reason?: string; message?: string };

export const SQL = {
  changeSale: `UPDATE "CoachSale" SET "packageId" = $2, "amountCents" = $3, "feeCents" = $4, "updatedAt" = NOW() WHERE "id" = $1 AND "status" = 'ACTIVE' AND "kind" = 'monthly'`,
} as const;

const productOf = (p: string | { id: string; name?: string }) => (typeof p === 'string' ? { id: p, name: undefined } : p);

export async function changeMonthlyPackage(deps: ChangeDeps, coachId: string, saleId: string, body: unknown): Promise<ChangeResult> {
  const gate = connectGate(deps.env);
  if (!gate.ok) return { ok: false, status: 409, error: 'store_closed', reason: gate.reason };
  if (!(await businessReady(deps.db))) return { ok: false, status: 503, error: 'coach_business_not_ready' };
  const targetId = body && typeof body === 'object' ? (body as { packageId?: unknown }).packageId : null;
  if (typeof targetId !== 'string' || !targetId) return { ok: false, status: 400, error: 'package_required' };
  const sale = await saleById(deps.db, saleId);
  if (!sale || sale.coachId !== coachId) return { ok: false, status: 404, error: 'sale_not_found' };
  if (sale.kind !== 'monthly' || sale.status !== 'ACTIVE' || !sale.subscriptionId) return { ok: false, status: 409, error: 'not_active', message: 'Only running monthly coaching can change package.' };
  if (sale.packageId === targetId) return { ok: false, status: 409, error: 'same_package' };
  const target = await packageById(deps.db, targetId);
  if (!target || target.coachId !== coachId || !target.active) return { ok: false, status: 404, error: 'package_not_found' };
  if (target.kind !== 'monthly') return { ok: false, status: 400, error: 'not_monthly', message: 'Pick another monthly package.' };
  if (target.capacity !== null && ((await takenFor(deps.db, [target.id], deps.now)).get(target.id) ?? 0) >= target.capacity) {
    return { ok: false, status: 409, error: 'package_full', message: 'That package is full right now.' };
  }
  const policy = platformFeePolicy(deps.env);
  const plan = await deps.plan(coachId);
  const soFar = needsMonthToDate(policy) ? await coachFeesThisMonth(deps.db, coachId, monthStartUtc(deps.now), deps.now) : 0;
  const split = saleSplit(target.priceCents, undefined, platformFee(policy, plan, target.priceCents, soFar).felShareCents);
  const upgrade = target.priceCents > sale.amountCents;

  try {
    const stripe = deps.stripe();
    const sub = await stripe.subscriptions.retrieve(sale.subscriptionId, { expand: ['items.data.price.product'] });
    const items = sub.items.data.map((i) => ({ id: i.id, product: productOf(i.price.product) }));
    const feeItem = items.find((i) => i.product.name === PROCESSING_FEE_LINE) ?? null;
    const pkgItem = items.find((i) => i !== feeItem) ?? null;
    if (!pkgItem) return { ok: false, status: 409, error: 'subscription_unreadable' };
    const product = await stripe.products.create({ name: target.title.slice(0, 120), ...(target.summary ? { description: target.summary.slice(0, 300) } : {}) });
    const monthly = (unit: number, productId: string) => ({ currency: 'usd', product: productId, unit_amount: unit, recurring: { interval: 'month' } });
    const lines: Record<string, unknown>[] = [{ id: pkgItem.id, price_data: monthly(split.priceCents, product.id) }];
    if (feeItem) lines.push(split.processingFeeCents > 0 ? { id: feeItem.id, price_data: monthly(split.processingFeeCents, feeItem.product.id) } : { id: feeItem.id, deleted: true });
    await stripe.subscriptions.update(sale.subscriptionId, {
      items: lines,
      proration_behavior: upgrade ? 'create_prorations' : 'none',
      application_fee_percent: subscriptionFeePercent(split),
      // the renewal split rides on the subscription's metadata; the buyer's terms acceptance on it is kept
      metadata: { ...(sub.metadata ?? {}), ...saleMetadata({ saleId: sale.id, pkg: target, buyerId: sale.buyerId, split }) },
    }, { idempotencyKey: `coach-connect-change:${sale.id}:${target.id}:${split.priceCents}` });
  } catch (e) {
    console.error('[coach-business] package change failed', e instanceof Error ? e.name : typeof e);
    return { ok: false, status: 502, error: 'change_failed', message: 'The change did not go through. Try again.' };
  }
  await deps.db.$executeRawUnsafe(SQL.changeSale, sale.id, target.id, split.priceCents, split.felShareCents);
  return { ok: true, saleId: sale.id, packageId: target.id, priceCents: split.priceCents, prorated: upgrade };
}
