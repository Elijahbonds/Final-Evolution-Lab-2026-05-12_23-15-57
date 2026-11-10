// SELLER-18-1 v2 — SELLER_ADULT_GATE_ENABLED off (the default): every seller surface answers as it did before this
// gate. No birth year is read, nothing is taken down, Stripe is not written, and the package checkout skips the coach's
// age. The same calls with the setting on are refused (tests/seller/seller-routes.test.ts and the v2 files).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const YEAR = new Date().getFullYear();

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  users: {} as Record<string, number | null>,
  userReads: [] as string[],
  writes: [] as string[],
  stripeUpdates: 0,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ ok: true, retryAfterSec: 0 }), clientKeyFromHeaders: () => 'k' }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ accounts: { update: async () => { h.stripeUpdates++; return {}; } } }), STRIPE_PRODUCTS: {}, PLATFORM_TAKE_RATE: 0.15 }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => { h.userReads.push(where.id); return where.id in h.users ? { dobYear: h.users[where.id] } : null; } },
    facilitatorProfile: { findUnique: async () => null },
    instructor: { findUnique: async () => null, count: async () => 1, updateMany: async () => { h.writes.push('instructor'); return { count: 1 }; } },
    marketplaceListing: { findUnique: async () => null, update: async () => ({}), count: async () => 1, updateMany: async () => { h.writes.push('listings'); return { count: 1 }; } },
    analyticsEvent: { findFirst: async () => null, create: async () => { h.writes.push('review'); return {}; } },
    cellApiKey: { count: async () => 1 },
    subscription: { findFirst: async () => null, findMany: async () => [] },
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => (sql.includes('FROM "CoachConnectAccount" WHERE "userId"')
      ? [{ ok: 1, userId: String(args[0]), stripeAccountId: 'acct_x', livemode: false, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true }]
      : []),
    $executeRawUnsafe: async () => 0,
  },
}));

import { GET as connectGet } from '@/app/api/coach/business/connect/route';
import { POST as connectDashboard } from '@/app/api/coach/business/connect/dashboard/route';
import { PATCH as packagePatch } from '@/app/api/coach/business/packages/[id]/route';
import { POST as saleChange } from '@/app/api/coach/business/sales/[id]/change/route';
import { POST as teamFee } from '@/app/api/coach/business/team-fee/route';
import { PATCH as applicationPatch } from '@/app/api/coach/business/applications/[id]/route';
import { POST as highlightPost } from '@/app/api/coach/business/highlights/route';
import { POST as cartridgePost } from '@/app/api/studio/cartridges/route';
import { isStoreCoach } from '@/lib/coach-store/gate';
import { liveDeps } from '@/lib/coach-business/server';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { startPackageCheckout, type CheckoutDeps } from '@/lib/coach-business/service';
import { BUYER_TERMS } from '@/lib/payments/terms';
import { canSell, sellerGate } from '@/lib/seller/server';
import { fakeCoachBusinessDb, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const TEEN = 'off-teen';
const UNKNOWN = 'off-unknown';
const as = (id: string) => { h.session = { user: { id } }; };
const json = (body: unknown = {}) => new Request('https://fel.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const ENV_KEYS = ['COACH_STORE_ENABLED', 'COACH_STORE_COACH_USER_IDS', 'COACH_CONNECT_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'NEXTAUTH_URL', 'STUDIO_CREATOR_ENABLED', 'SELLER_ADULT_GATE_ENABLED'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { if (!(k in saved)) saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, {
    COACH_STORE_ENABLED: '1', COACH_STORE_COACH_USER_IDS: [TEEN, UNKNOWN].join(','),
    COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_off', NEXTAUTH_URL: 'https://fel.test', STUDIO_CREATOR_ENABLED: '1',
  });   // SELLER_ADULT_GATE_ENABLED unset: the default
  h.users = { [TEEN]: YEAR - 15, [UNKNOWN]: null };
  h.userReads = []; h.writes = []; h.stripeUpdates = 0;
  h.session = null;
  resetBusinessProbe();
  return () => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
});

describe('setting off (default): the seller gate is the role only', () => {
  const routes: [string, () => Promise<Response>][] = [
    ['connect status GET', () => connectGet()],
    ['Express dashboard POST', () => connectDashboard()],
    ['package PATCH', () => packagePatch(json({}), { params: { id: 'pkg-1' } })],
    ['sale change POST', () => saleChange(json({ packageId: 'pkg-2' }), { params: { id: 'sale-1' } })],
    ['team fee POST', () => teamFee(json({ packageId: 'pkg-1', scope: 'roster' }))],
    ['application PATCH', () => applicationPatch(json({ status: 'ACCEPTED' }), { params: { id: 'app-1' } })],
    ['highlight POST', () => highlightPost(json({ clientId: 'c-1', text: 'Added four inches' }))],
    ['Studio cartridge POST', () => cartridgePost(json({}) as never)],
  ];
  for (const [name, call] of routes) {
    it(`${name}: a teen and an unknown-age account are not refused by age; no birth-year read, no takedown, no Stripe write`, async () => {
      for (const id of [TEEN, UNKNOWN]) {
        as(id);
        const r = await call().catch(() => null);   // past the gate the route reads tables this fake does not have
        if (r) expect(((await r.json()) as { error?: string }).error, id).not.toBe('adults_only');
      }
      expect(h.userReads).toEqual([]);
      expect(h.writes).toEqual([]);
      expect(h.stripeUpdates).toBe(0);
    });
  }

  it('canSell / sellerGate / isStoreCoach: the role holder passes, a non-holder is still not a seller; nothing read or written', async () => {
    expect(await canSell(TEEN, 'coach_business')).toBeNull();
    expect(await sellerGate(UNKNOWN, 'studio')).toBeNull();
    expect(await isStoreCoach(TEEN)).toBe(true);
    expect(await isStoreCoach('not-listed')).toBe(false);
    expect(await liveDeps().sellerOk(TEEN)).toBe(true);
    expect(h.userReads).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  it('turning it on (SELLER_ADULT_GATE_ENABLED=1) refuses the same teen at the same gate', async () => {
    process.env.SELLER_ADULT_GATE_ENABLED = '1';
    expect(await canSell(TEEN, 'coach_business')).toBe('under_18');
    expect(await canSell(UNKNOWN, 'coach_business')).toBe('age_unknown');
  });
});

describe('the package checkout\'s coach check waits on the setting (read from the checkout deps\' env)', () => {
  const ON = { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_abc', NEXTAUTH_URL: 'https://fel.test' };
  const TICK = { termsAccepted: true, termsVersion: BUYER_TERMS.coach_package.version };
  const trap = <T,>(): T => new Proxy({}, { get: (_t, p) => { if (p === 'then') return undefined; throw new Error('stripe touched'); } }) as T;
  function deps(env: Record<string, string>, sellerOk: () => Promise<boolean>) {
    const fake = fakeCoachBusinessDb();
    seedCoach(fake.state);
    const d: CheckoutDeps = {
      db: fake.db as never, env: env as unknown as NodeJS.ProcessEnv, now: new Date('2026-11-09T18:00:00Z'), stripe: () => trap<never>(),
      isAdult: async (id) => id === 'buyer-1', plan: async () => 'free', ensureCustomer: async () => trap<never>(), coachSlug: async () => 'jordan-lee', sellerOk,
    };
    return d;
  }

  it('off: a coach the gate would refuse is not asked about, and the checkout goes on (to the trapped Stripe)', async () => {
    const sellerOk = vi.fn(async () => false);
    await expect(startPackageCheckout(deps(ON, sellerOk), 'buyer-1', 'pkg-1', TICK)).resolves.toMatchObject({ ok: false, status: 502 });
    expect(sellerOk).not.toHaveBeenCalled();
  });

  it('on: the same coach → 409 coach_not_ready', async () => {
    const sellerOk = vi.fn(async () => false);
    expect(await startPackageCheckout(deps({ ...ON, SELLER_ADULT_GATE_ENABLED: 'true' }, sellerOk), 'buyer-1', 'pkg-1', TICK)).toMatchObject({ status: 409, error: 'coach_not_ready' });
    expect(sellerOk).toHaveBeenCalledWith('coach-1');
  });
});
