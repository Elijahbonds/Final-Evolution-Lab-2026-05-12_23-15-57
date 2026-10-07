import { isCoachStoreLive } from '@/lib/flags';
import { PAYMENTS_NOT_SET_UP } from './constants';

/** Test-mode secret or restricted key. A live key is accepted only while COACH_STORE_LIVE is on. */
export function isTestKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
}

export function isLiveKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return key.startsWith('sk_live_') || key.startsWith('rk_live_');
}

/** The 'payments not set up' reasons a store-closed answer carries (STORE-READY B2: 409 store_closed, never 503). */
export type StoreClosedReason = 'payments_off' | 'payments_not_set_up' | 'live_mode_off' | 'site_url_not_set';

export type StripeGate =
  | { ok: true; key: string }
  | { ok: false; status: 409; error: 'store_closed'; reason: 'payments_not_set_up' | 'live_mode_off'; message: string };

/**
 * Missing key fails closed with the exact phrase. A live key opens checkout ONLY while COACH_STORE_LIVE is on in
 * the PASSED env (STORE-READY B2); a test key passes as before. The not-ok answer is a 409 store_closed reason —
 * the callers turn it into the response, so getStripe() never throws for a missing key.
 */
export function stripeTestGate(env: NodeJS.ProcessEnv = process.env): StripeGate {
  const key = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) return { ok: false, status: 409, error: 'store_closed', reason: 'payments_not_set_up', message: PAYMENTS_NOT_SET_UP };
  if (isTestKey(key)) return { ok: true, key };
  if (isLiveKey(key)) {
    if (isCoachStoreLive(env)) return { ok: true, key };
    return { ok: false, status: 409, error: 'store_closed', reason: 'live_mode_off', message: PAYMENTS_NOT_SET_UP };
  }
  return { ok: false, status: 409, error: 'store_closed', reason: 'payments_not_set_up', message: PAYMENTS_NOT_SET_UP };
}
