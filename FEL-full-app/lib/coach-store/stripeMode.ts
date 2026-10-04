import { PAYMENTS_NOT_SET_UP } from './constants';

/** Test-mode secret or restricted key. A live key is never accepted for coach-store checkout. */
export function isTestKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
}

export function isLiveKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return key.startsWith('sk_live_') || key.startsWith('rk_live_');
}

export type StripeGate =
  | { ok: true; key: string }
  | { ok: false; status: 503; error: 'payments_not_set_up' | 'payments_test_mode_only'; message: string };

/** Missing key fails closed with the exact phrase. A live key is a different 503 and is not used. */
export function stripeTestGate(env: NodeJS.ProcessEnv = process.env): StripeGate {
  const key = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (!key) return { ok: false, status: 503, error: 'payments_not_set_up', message: PAYMENTS_NOT_SET_UP };
  if (!isTestKey(key) || isLiveKey(key)) {
    return { ok: false, status: 503, error: 'payments_test_mode_only', message: PAYMENTS_NOT_SET_UP };
  }
  return { ok: true, key };
}
