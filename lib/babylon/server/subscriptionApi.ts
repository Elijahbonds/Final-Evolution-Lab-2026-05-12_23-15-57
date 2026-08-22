// subscriptionApi — server half of the All-Access Pass (M60). Same
// framework-agnostic injection pattern as M25's stripeApi.ts (EconomyService
// + Db passed in; no framework imports), so it drops into the same server
// layer. Uses Stripe SUBSCRIPTION mode (recurring) where M25 used one-time
// payment mode; webhook-driven entitlement, idempotent, never trusts the
// client.
//
// Stripe dashboard prerequisite (one-time setup, no code):
//   create a recurring Price with lookup_key 'fel_all_access_monthly'
//   at $29.99/month, and point the existing webhook endpoint at these
//   events too: checkout.session.completed,
//   customer.subscription.updated, customer.subscription.deleted.

import { ALL_ACCESS_PASS, PASS_STIPEND_SHARDS, type PassState } from '../shared/allAccessPass';

export interface EconomyService {
  grantShards(userId: string, amount: number, reason: string): Promise<void>;
}
export interface Db {
  get<T>(collection: string, id: string): Promise<T | null>;
  set(collection: string, id: string, doc: unknown): Promise<void>;
}
export interface StripeLike {
  checkout: { sessions: { create(params: Record<string, unknown>): Promise<{ id: string; url: string }> } };
  prices: { list(params: { lookup_keys: string[] }): Promise<{ data: { id: string }[] }> };
  webhooks: { constructEvent(payload: string | Buffer, sig: string, secret: string): { id: string; type: string; data: { object: Record<string, unknown> } } };
}

const C = { passes: 'pass_state', events: 'stripe_events', stipends: 'pass_stipends' };

export async function createPassCheckout(
  ctx: { stripe: StripeLike; db: Db; appUrl: string },
  body: { userId: string },
): Promise<{ url: string }> {
  const prices = await ctx.stripe.prices.list({ lookup_keys: [ALL_ACCESS_PASS.stripePriceLookupKey] });
  const price = prices.data[0];
  if (!price) throw new Error(`Stripe Price with lookup_key "${ALL_ACCESS_PASS.stripePriceLookupKey}" not found — create it in the dashboard first`);
  const session = await ctx.stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: body.userId,
    metadata: { userId: body.userId, sku: ALL_ACCESS_PASS.id },
    success_url: `${ctx.appUrl}/pass/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${ctx.appUrl}/pass`,
  });
  return { url: session.url };
}

/** Webhook-driven entitlement — the ONLY writer of PassState. Idempotent
 *  via the same seen-event pattern M25 uses. */
export async function handlePassWebhook(
  ctx: { stripe: StripeLike; db: Db; economy: EconomyService; webhookSecret: string },
  rawBody: string | Buffer,
  signature: string,
): Promise<void> {
  const event = ctx.stripe.webhooks.constructEvent(rawBody, signature, ctx.webhookSecret);
  const seen = await ctx.db.get(C.events, event.id);
  if (seen) return;
  await ctx.db.set(C.events, event.id, { at: Date.now(), type: event.type });

  const obj = event.data.object;
  const userId = (obj.metadata as Record<string, string> | undefined)?.userId
    ?? (obj.client_reference_id as string | undefined);

  if (event.type === 'checkout.session.completed' && userId && obj.mode === 'subscription') {
    await activate(ctx, userId, obj);
    return;
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    // subscription objects carry metadata.userId when created via our checkout
    const subUserId = (obj.metadata as Record<string, string> | undefined)?.userId;
    if (!subUserId) return;
    const status = obj.status as string;
    const active = event.type !== 'customer.subscription.deleted' && (status === 'active' || status === 'trialing');
    const periodEnd = typeof obj.current_period_end === 'number' ? obj.current_period_end * 1000 : null;
    const state: PassState = { active, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: !!obj.cancel_at_period_end };
    await ctx.db.set(C.passes, subUserId, state);
    if (active && periodEnd) await grantStipendOnce(ctx, subUserId, periodEnd);
  }
}

async function activate(
  ctx: { db: Db; economy: EconomyService },
  userId: string,
  obj: Record<string, unknown>,
): Promise<void> {
  const periodEnd = typeof obj.expires_at === 'number' ? obj.expires_at * 1000 : Date.now() + 32 * 24 * 3600 * 1000;
  const state: PassState = { active: true, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false };
  await ctx.db.set(C.passes, userId, state);
  await grantStipendOnce(ctx, userId, periodEnd);
}

/** One stipend per billing period, keyed by period end — renewal-safe. */
async function grantStipendOnce(
  ctx: { db: Db; economy: EconomyService },
  userId: string,
  periodEndMs: number,
): Promise<void> {
  const key = `${userId}_${periodEndMs}`;
  const done = await ctx.db.get(C.stipends, key);
  if (done) return;
  await ctx.db.set(C.stipends, key, { at: Date.now() });
  await ctx.economy.grantShards(userId, PASS_STIPEND_SHARDS, 'all_access_stipend');
}

export async function passStatus(
  ctx: { db: Db },
  userId: string,
): Promise<PassState> {
  return (await ctx.db.get<PassState>(C.passes, userId))
    ?? { active: false, currentPeriodEnd: null, cancelAtPeriodEnd: false };
}
