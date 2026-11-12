// lib/payments/proBuy.ts — PAYMENTS-READY (2026-10-26): the FEL Pro buy page (/pro), its links, and what the page says
// for each answer of POST /api/stripe/checkout. Client-safe and pure (no process.env, no Stripe, no Prisma).
//
// WHY. Every "Get FEL Pro" link pointed at the checkout route with a ?product= query: a GET to a POST-only route, so it answered
// 405 and nobody could buy. /pro is the page those links open now: pick weekly or monthly, tick the store terms, and the
// button POSTs to the same route and goes to Stripe. The route decides everything (switches, PURCHASES_ALLOWLIST, the
// 18+ check, the terms tick, "already subscribed"); the page shows its answer, so a teen sees exactly what the route
// returns today.

export type ProPlan = 'weekly' | 'monthly';
export const PRO_PLANS: readonly ProPlan[] = ['weekly', 'monthly'];

/** /api/stripe/checkout's product key for each plan (lib/stripe.ts STRIPE_PRODUCTS: one entitlement, two cadences). */
export const PRO_PLAN_PRODUCT: Record<ProPlan, 'FEL_PRO' | 'FEL_PRO_MONTHLY'> = { weekly: 'FEL_PRO', monthly: 'FEL_PRO_MONTHLY' };

export const PRO_BUY_PATH = '/pro';

/** Where a "Get FEL Pro" link goes. */
export function proBuyHref(plan: ProPlan): string {
  // written out (not built from PRO_BUY_PATH) so lib/nav/reachability.test.ts sees /pro is linked
  return `/pro?plan=${plan}`;
}

/** `?plan=` as the page reads it; anything else is monthly (the committed price, the one the paywalls lead with). */
export function parseProPlan(v: unknown): ProPlan {
  return v === 'weekly' ? 'weekly' : 'monthly';
}

/** The page's line while FEL Pro is not on sale. It is the first sentence of lib/signature/copy.ts PRO_NOT_ON_SALE_LINE
 *  (pinned by test), so the two never disagree. Product copy, not policy. */
export const PRO_CLOSED_LINE = "FEL Pro isn't on sale yet.";

/** "$6.00 / week". */
export function proPriceLabel(cents: number, plan: ProPlan): string {
  return `$${(cents / 100).toFixed(2)} / ${plan === 'weekly' ? 'week' : 'month'}`;
}

export function proCheckoutBody(plan: ProPlan, termsVersion: string): { product: string; termsAccepted: true; termsVersion: string } {
  return { product: PRO_PLAN_PRODUCT[plan], termsAccepted: true, termsVersion };
}

export type ProBuyOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'sign_in' }
  | { kind: 'terms_changed'; message: string }
  | { kind: 'closed'; message: string }
  | { kind: 'refused'; message: string };

/** The route's answer → what the page does. Messages the route sends (the 18+ refusal) are shown as sent. */
export function proBuyOutcome(status: number, json: Record<string, unknown>): ProBuyOutcome {
  if (status === 200 && typeof json.url === 'string' && json.url) return { kind: 'redirect', url: json.url };
  if (status === 401) return { kind: 'sign_in' };
  if (status === 409 && json.error === 'terms_required') return { kind: 'terms_changed', message: 'The store terms were updated. Reload the page and tick the box again.' };
  if (status === 409 && json.error === 'store_closed') return { kind: 'closed', message: PRO_CLOSED_LINE };
  if (status === 409 && json.error === 'Already subscribed') return { kind: 'refused', message: 'You already have FEL Pro.' };
  if (typeof json.message === 'string' && json.message) return { kind: 'refused', message: json.message };
  return { kind: 'refused', message: 'Checkout could not start. Try again.' };
}

/** POST the checkout and read the answer. `fetchFn` is the browser's fetch (a test passes a stand-in). */
export async function buyPro(fetchFn: typeof fetch, plan: ProPlan, termsVersion: string): Promise<ProBuyOutcome> {
  let status = 0;
  let json: Record<string, unknown> = {};
  try {
    const r = await fetchFn('/api/stripe/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(proCheckoutBody(plan, termsVersion)) });
    status = r.status;
    try { json = (await r.json()) as Record<string, unknown>; } catch { /* empty body */ }
  } catch {
    return { kind: 'refused', message: 'Checkout could not start. Try again.' };
  }
  return proBuyOutcome(status, json);
}
