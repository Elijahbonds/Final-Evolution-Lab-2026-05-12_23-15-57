// SELLER-18-1 (S-2): the buyer side of a minor seller. A coach who is not a verified adult takes no payments: the package
// checkout answers 409 coach_not_ready after the buyer's own checks, before a spot is held or Stripe is called.
import { beforeEach, describe, expect, it } from 'vitest';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { startPackageCheckout, type CheckoutDeps } from '@/lib/coach-business/service';
import { BUYER_TERMS } from '@/lib/payments/terms';
import { fakeCoachBusinessDb, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

// v2: the seller check runs only with SELLER_ADULT_GATE_ENABLED on (tests/seller/seller-v2-flag.test.ts: off).
const ON = { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_abc', NEXTAUTH_URL: 'https://fel.test', SELLER_ADULT_GATE_ENABLED: '1' } as unknown as NodeJS.ProcessEnv;
const NOW = new Date('2026-11-09T18:00:00Z');
const TICK = { termsAccepted: true, termsVersion: BUYER_TERMS.coach_package.version };
const trap = <T,>(what: string): T => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error(`${what}.${String(p)} touched`); } }) as T;

function deps(adults: string[], over: Partial<CheckoutDeps> = {}) {
  const fake = fakeCoachBusinessDb();
  seedCoach(fake.state);   // coach-1, pkg-1, a ready Connect account
  const d: CheckoutDeps = {
    db: fake.db as never, env: ON, now: NOW, stripe: () => trap<never>('stripe'),
    isAdult: async (id) => adults.includes(id), plan: async () => 'free', ensureCustomer: async () => trap<never>('customer'),
    coachSlug: async () => 'jordan-lee', ...over,
  };
  return { d, fake };
}

const NOT_READY = { ok: false, status: 409, error: 'coach_not_ready', message: 'This coach is not taking payments yet. Apply instead.' };

beforeEach(() => resetBusinessProbe());

describe('a package checkout from a coach who may not sell', () => {
  it('the coach is under 18 or of unknown age (the default check): 409 coach_not_ready, no spot held, no Stripe', async () => {
    const { d, fake } = deps(['buyer-1']);   // the buyer is an adult; coach-1 is not
    expect(await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK)).toEqual(NOT_READY);
    expect(fake.state.sales.size).toBe(0);
  });

  it('the live seller gate says no (sellerOk false, or it fails): the same 409', async () => {
    const { d } = deps(['buyer-1', 'coach-1'], { sellerOk: async () => false });
    expect(await startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK)).toEqual(NOT_READY);
    const broken = deps(['buyer-1', 'coach-1'], { sellerOk: async () => { throw new Error('db down'); } });
    expect(await startPackageCheckout(broken.d, 'buyer-1', 'pkg-1', TICK)).toEqual(NOT_READY);
  });

  it('a minor buyer still hears their own refusal first', async () => {
    const { d } = deps([]);
    expect(await startPackageCheckout(d, 'teen-buyer', 'pkg-1', TICK)).toMatchObject({ status: 403, error: 'adults_only' });
  });

  it('an adult coach passes the seller check (the checkout goes on to Stripe)', async () => {
    const asked: string[] = [];
    const { d } = deps(['buyer-1', 'coach-1'], { sellerOk: async (id) => { asked.push(id); return true; } });
    await expect(startPackageCheckout(d, 'buyer-1', 'pkg-1', TICK)).resolves.toMatchObject({ ok: false, status: 502 });   // the trapped Stripe
    expect(asked).toEqual(['coach-1']);
  });
});
