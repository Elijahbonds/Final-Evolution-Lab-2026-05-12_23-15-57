// lib/group-booking/client.ts — GROUP-BOOKING: the buy sheet's last step for a group seat or a 1:1 in person, as one
// ShopOutcome (lib/shop/checkout.ts). Reserve first (POST /api/group-booking/reserve or /one-on-one). The route says how
// to pay:
//   · { mode: 'at_gym' }                → done: "Reserved. Pay at the gym …". NO checkout call is ever made.
//   · { mode: 'online', packageId }     → only when the owner has switched every online switch on: POST the EXISTING
//                                         coach-business checkout (/api/coach/business/checkout) for that package, and
//                                         go where it answers (Stripe), exactly like a coach package on the shop front.
// tests/group-booking/pay-at-gym.test.tsx holds "0 checkout calls while online payment is off".
//
// Client-safe (a test passes its own fetch).
import { readOutcome, type ShopOutcome } from '@/lib/shop/checkout';
import { loginPath } from '@/lib/auth/safeNext';
import { errorLine, GROUP_COPY } from './copy';

type Fetch = typeof fetch;

export const RESERVE_API = '/api/group-booking/reserve';
export const WAITLIST_API = '/api/group-booking/waitlist';
export const ME_API = '/api/group-booking/me';
export const ONE_ON_ONE_API = '/api/group-booking/one-on-one';
export const COACH_API = '/api/group-booking/coach';
export const CHECKOUT_API = '/api/coach/business/checkout';

export async function postJson(f: Fetch, url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
  try {
    const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let json: Record<string, unknown> = {};
    try { json = (await r.json()) as Record<string, unknown>; } catch { /* empty body */ }
    return { status: r.status, json };
  } catch { return null; }
}

export interface Reserved { ics: string | null }

/** Reserve, then (only if the route says online) pay through the existing checkout. `onReserved` gets the calendar file. */
export async function reserveThenPay(f: Fetch, o: { url: string; body: Record<string, unknown>; back: string; termsVersion: string | null; onReserved?: (r: Reserved) => void }): Promise<ShopOutcome> {
  const r = await postJson(f, o.url, o.body);
  if (!r) return { kind: 'line', line: errorLine('') };
  if (r.status === 401) return { kind: 'sign_in', href: loginPath(o.back) };
  if (r.status !== 201) return { kind: 'line', line: typeof r.json.message === 'string' && r.json.message ? r.json.message : errorLine(r.json.error), href: typeof r.json.href === 'string' ? r.json.href : undefined };
  o.onReserved?.({ ics: typeof r.json.ics === 'string' ? r.json.ics : null });
  const pay = (r.json.pay ?? {}) as { mode?: unknown; packageId?: unknown };
  if (pay.mode === 'online' && typeof pay.packageId === 'string' && o.termsVersion) {
    return readOutcome(await postJson(f, CHECKOUT_API, { packageId: pay.packageId, termsAccepted: true, termsVersion: o.termsVersion }), o.back);
  }
  return { kind: 'done', line: GROUP_COPY.reserved };
}
