// lib/shop/checkout.ts — PLAT-P07 (2026-11-02): the buy sheet's last step, per product: POST the product's EXISTING
// checkout route (never a GET link to it) and read its answer as one outcome the sheet shows. Every refusal is the route's
// own (sign in, 18+, the terms tick, closed, already owned), said as a plain line. Nothing here decides who may buy.
//
// Client-safe (a test passes its own fetch).
import { loginPath } from '@/lib/auth/safeNext';
import { buyPro, proBuyHref, type ProPlan } from '@/lib/payments/proBuy';

export type ShopOutcome =
  | { kind: 'redirect'; url: string }
  | { kind: 'sign_in'; href: string }
  /** The store terms changed under the page: untick, say so. */
  | { kind: 'terms_changed'; line: string }
  | { kind: 'line'; line: string; href?: string };

export const TERMS_CHANGED_LINE = 'The store terms were updated. Tick the box again.';
export const CHECKOUT_FAILED_LINE = 'Checkout could not start. Try again.';

type Fetch = typeof fetch;

async function postJson(f: Fetch, url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
  try {
    const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let json: Record<string, unknown> = {};
    try { json = (await r.json()) as Record<string, unknown>; } catch { /* empty body */ }
    return { status: r.status, json };
  } catch { return null; }
}

/** The routes' shared answers → one outcome. `back` is where sign-in returns to. */
export function readOutcome(r: { status: number; json: Record<string, unknown> } | null, back: string): ShopOutcome {
  if (!r) return { kind: 'line', line: CHECKOUT_FAILED_LINE };
  const { status, json } = r;
  if (status >= 200 && status < 300 && typeof json.url === 'string' && json.url) return { kind: 'redirect', url: json.url };
  if (status === 401 || json.error === 'unauthorized') return { kind: 'sign_in', href: loginPath(back) };
  if (status === 409 && json.error === 'terms_required') return { kind: 'terms_changed', line: TERMS_CHANGED_LINE };
  if (status === 403 && json.error === 'adults_only') return { kind: 'line', line: typeof json.message === 'string' && json.message ? json.message : 'Buying is for adults (18+).', href: `/age?next=${encodeURIComponent(back)}` };
  if (typeof json.message === 'string' && json.message) return { kind: 'line', line: json.message };
  return { kind: 'line', line: CHECKOUT_FAILED_LINE };
}

/** A coach's package: POST /api/coach/business/checkout (components/coach-business/package-actions.tsx's route). */
export async function payCoachPackage(f: Fetch, o: { slug: string; packageId: string; termsVersion: string }): Promise<ShopOutcome> {
  return readOutcome(await postJson(f, '/api/coach/business/checkout', { packageId: o.packageId, termsAccepted: true, termsVersion: o.termsVersion }), `/coach/${o.slug}`);
}

/** A book offer: POST /api/books/checkout (components/press/buy-button.tsx's route and body). */
export async function payBook(f: Fetch, o: { offerId: string; termsVersion: string; back: string; key?: string }): Promise<ShopOutcome> {
  const key = o.key ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  return readOutcome(await postJson(f, '/api/books/checkout', { offerId: o.offerId, idempotencyKey: key, termsAccepted: true, termsVersion: o.termsVersion }), o.back);
}

/** FEL Pro: lib/payments/proBuy.ts buyPro (POST /api/stripe/checkout), its own outcomes mapped onto the sheet's. */
export async function payPro(f: Fetch, o: { plan: ProPlan; termsVersion: string }): Promise<ShopOutcome> {
  const out = await buyPro(f, o.plan, o.termsVersion);
  if (out.kind === 'redirect') return out;
  if (out.kind === 'sign_in') return { kind: 'sign_in', href: loginPath(proBuyHref(o.plan)) };
  if (out.kind === 'terms_changed') return { kind: 'terms_changed', line: TERMS_CHANGED_LINE };
  return { kind: 'line', line: out.message };
}
