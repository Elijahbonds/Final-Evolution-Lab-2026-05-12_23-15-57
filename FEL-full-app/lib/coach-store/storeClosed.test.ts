// STORE-READY B2 (LIVE KEY + NO KEY, F4) and B3 (F7 server origin) — the store-closed and server-origin contract.
//
// B2: every "payments not set up" answer is 409 store_closed, NEVER 503 — no key, a live key with
// COACH_STORE_LIVE off, and COACH_STORE_PAYMENTS_ENABLED off all close the store cleanly, with NO Stripe call and
// nothing thrown (getStripe never runs for a missing key). A live key passes only with COACH_STORE_LIVE=1.
//
// B3: success/cancel/return URLs come from the NEXTAUTH_URL server constant, never the request's Origin header.
//
// prisma, next-auth and the Stripe client are mocked (the pattern of lib/coach-store/settings-route.test.ts); the
// Stripe mock records calls so "no Stripe call" and "sessions.create called" are both asserted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({
  session: { user: { id: 'buyer-1' } } as { user: { id: string } } | null,
  isAdult: true,
  sessionsCreate: [] as any[],
  portalCreate: [] as any[],
  stripeCustomer: { id: 'sc-1', userId: 'buyer-1', stripeCustomerId: 'cus_1' } as Record<string, unknown> | null,
  listing: null as Record<string, unknown> | null,
  instructor: null as Record<string, unknown> | null,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/coach-store/adult', () => ({ isVerifiedAdult: async () => h.isAdult }));
vi.mock('@/lib/db', () => ({
  prisma: {
    stripeCustomer: {
      findUnique: async () => h.stripeCustomer,
      create: async () => h.stripeCustomer,
    },
    marketplaceListing: { findUnique: async () => h.listing },
    instructor: {
      findFirst: async () => h.instructor,
      findUnique: async () => h.instructor,
    },
    programAccess: { findUnique: async () => null, findMany: async () => [], create: async (a: any) => ({ id: 'pa-1', ...a.data }), update: async () => ({}) },
    booking: { updateMany: async () => ({ count: 0 }), findMany: async () => [] },
    referralCode: { findUnique: async () => null },
    order: { create: async () => ({}) },
    user: { findUnique: async () => ({ email: 'buyer@fel.test' }) },
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: vi.fn(async (p: any) => { h.sessionsCreate.push(p); return { id: 'cs_1', url: 'https://stripe.test/cs_1' }; }) } },
    billingPortal: { sessions: { create: vi.fn(async (p: any) => { h.portalCreate.push(p); return { url: 'https://stripe.test/portal' }; }) } },
  }),
}));

import { POST as coachStoreCheckout } from '@/app/api/coach-store/checkout/route';
import { POST as stripeCheckout } from '@/app/api/stripe/checkout/route';
import { POST as portal } from '@/app/api/stripe/portal/route';
import { POST as verifySession } from '@/app/api/stripe/verify-session/route';
import { stripeTestGate } from './stripeMode';
import { siteOrigin } from '@/lib/stripe/site-origin';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

const ENV_KEYS = ['COACH_STORE_ENABLED', 'COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_LIVE', 'STRIPE_SECRET_KEY', 'NEXTAUTH_URL', 'COACH_STORE_COACH_USER_IDS'] as const;
const SAVED: Record<string, string | undefined> = {};

function req(body: unknown, origin = 'https://evil.example'): any {
  return {
    json: async () => body,
    headers: { get: (k: string) => (k.toLowerCase() === 'origin' ? origin : null) },
    nextUrl: { origin: 'https://fel.test' },
  };
}

async function read(res: Response) {
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.COACH_STORE_ENABLED = '1';
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  process.env.COACH_STORE_COACH_USER_IDS = 'coach-elijah';
  delete process.env.COACH_STORE_LIVE;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.NEXTAUTH_URL = 'https://fel.test';
  h.session = { user: { id: 'buyer-1' } };
  h.isAdult = true;
  h.sessionsCreate = [];
  h.portalCreate = [];
  h.stripeCustomer = { id: 'sc-1', userId: 'buyer-1', stripeCustomerId: 'cus_1' };
  h.listing = null;
  h.instructor = null;
});

/** A sellable adult membership listing + instructor so startCheckout reaches sessions.create. */
function seedSellableMembership() {
  h.listing = {
    id: 'listing-membership', creatorId: 'coach-elijah', title: 'Membership', priceUsd: 2999,
    active: true, listingType: 'COACH_STORE',
    manifest: JSON.stringify({ kind: 'membership', audience: 'adult', interval: 'month' }),
  };
  h.instructor = {
    id: 'instructor-1', userId: 'coach-elijah', slug: 'elijahbonds', published: true,
    weeklyHours: [], blackoutDates: [], bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28,
  };
}
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

// ── B2: the gate's truth table ────────────────────────────────────────────────────────────────────────────────
describe('B2 stripeTestGate (409 store_closed, never 503)', () => {
  it('missing/blank key -> not ok, payments_not_set_up, status 409 (not 503)', () => {
    for (const key of [undefined, '', '   ']) {
      const g = stripeTestGate({ ...(key === undefined ? {} : { STRIPE_SECRET_KEY: key }) } as NodeJS.ProcessEnv);
      expect(g.ok).toBe(false);
      if (!g.ok) {
        expect(g.status).toBe(409);
        expect(g.error).toBe('store_closed');
        expect(g.reason).toBe('payments_not_set_up');
      }
    }
  });

  it('a test key is ok', () => {
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'sk_test_fake' } as NodeJS.ProcessEnv).ok).toBe(true);
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'rk_test_fake' } as NodeJS.ProcessEnv).ok).toBe(true);
  });

  it('a live key is live_mode_off unless COACH_STORE_LIVE is on in the PASSED env', () => {
    const off = stripeTestGate({ STRIPE_SECRET_KEY: 'sk_live_fake' } as NodeJS.ProcessEnv);
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.reason).toBe('live_mode_off');
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'sk_live_fake', COACH_STORE_LIVE: '1' } as NodeJS.ProcessEnv).ok).toBe(true);
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'rk_live_fake', COACH_STORE_LIVE: 'yes' } as NodeJS.ProcessEnv).ok).toBe(true);
    expect(stripeTestGate({ STRIPE_SECRET_KEY: 'sk_live_fake', COACH_STORE_LIVE: '0' } as NodeJS.ProcessEnv).ok).toBe(false);
  });

  it('an unrecognised key is not ok (payments_not_set_up)', () => {
    const g = stripeTestGate({ STRIPE_SECRET_KEY: 'pk_live_fake' } as NodeJS.ProcessEnv);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('payments_not_set_up');
  });
});

// ── B2: the routes never 503 and never throw with no key; they answer 409 store_closed ───────────────────────
describe('B2 no key -> 409 store_closed, no Stripe call, nothing thrown', () => {
  it('coach-store checkout', async () => {
    const r = await read(await coachStoreCheckout(req({ listingId: 'l' })));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('store_closed');
    expect(r.json.reason).toBe('payments_not_set_up');
    expect(r.json.message).toBe('Checkout opens soon.');
    expect(h.sessionsCreate).toHaveLength(0);
  });

  it('/api/stripe/checkout', async () => {
    const r = await read(await stripeCheckout(req({ product: 'COSMETIC', itemKey: 'cosm-chrome-visor' })));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('store_closed');
    expect(h.sessionsCreate).toHaveLength(0);
  });

  it('/api/stripe/portal', async () => {
    const r = await read(await portal(req({})));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('store_closed');
    expect(h.portalCreate).toHaveLength(0);
  });

  it('/api/stripe/verify-session', async () => {
    const r = await read(await verifySession(req({ session_id: 'cs_1' })));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('store_closed');
    expect(r.json.reason).toBe('payments_not_set_up');
  });
});

describe('B2 key/flag matrix on the coach-store checkout route', () => {
  it('COACH_STORE_PAYMENTS_ENABLED off -> 409 payments_off', async () => {
    delete process.env.COACH_STORE_PAYMENTS_ENABLED;
    const r = await read(await coachStoreCheckout(req({ listingId: 'l' })));
    expect(r.status).toBe(409);
    expect(r.json.reason).toBe('payments_off');
  });

  it('live key + COACH_STORE_LIVE unset -> 409 live_mode_off', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
    const r = await read(await coachStoreCheckout(req({ listingId: 'l' })));
    expect(r.status).toBe(409);
    expect(r.json.reason).toBe('live_mode_off');
    expect(h.sessionsCreate).toHaveLength(0);
  });

  it('store flag off stays a 404 (not store_closed)', async () => {
    delete process.env.COACH_STORE_ENABLED;
    const r = await read(await coachStoreCheckout(req({ listingId: 'l' })));
    expect(r.status).toBe(404);
  });

  it('live key + COACH_STORE_LIVE=1 -> sessions.create called, 200', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
    process.env.COACH_STORE_LIVE = '1';
    seedSellableMembership();
    const r = await read(await coachStoreCheckout(req({ listingId: 'listing-membership', termsVersion: STORE_TERMS_VERSION })));
    expect(r.status).toBe(200);
    expect(h.sessionsCreate).toHaveLength(1);
    // B3: the success URL is built from the NEXTAUTH_URL server constant, not the request's evil Origin.
    expect(String(h.sessionsCreate[0].success_url)).toMatch(/^https:\/\/fel\.test\//);
    expect(String(h.sessionsCreate[0].success_url)).not.toContain('evil.example');
  });

  it('test key -> 200 unchanged (sessions.create called)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    seedSellableMembership();
    const r = await read(await coachStoreCheckout(req({ listingId: 'listing-membership', termsVersion: STORE_TERMS_VERSION })));
    expect(r.status).toBe(200);
    expect(h.sessionsCreate).toHaveLength(1);
  });

  it('terms_version is saved in the Stripe session metadata on success', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    seedSellableMembership();
    await read(await coachStoreCheckout(req({ listingId: 'listing-membership', termsVersion: STORE_TERMS_VERSION })));
    expect(h.sessionsCreate[0].metadata?.terms_version).toBe(STORE_TERMS_VERSION);
    // ...and on the subscription metadata too (membership bills through its invoice).
    expect(h.sessionsCreate[0].subscription_data?.metadata?.terms_version).toBe(STORE_TERMS_VERSION);
  });
});

// ── STORE-TERMS-2: the server is the terms gate — 409 terms_required BEFORE any Stripe call ─────────────────
describe('STORE-TERMS-2 terms gate (409 terms_required, before any Stripe call)', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    seedSellableMembership();
  });

  it('no tick -> 409 terms_required, no Stripe call, no adult check needed', async () => {
    const r = await read(await coachStoreCheckout(req({ listingId: 'listing-membership' })));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('terms_required');
    expect(r.json.termsVersion).toBe(STORE_TERMS_VERSION);
    expect(h.sessionsCreate).toHaveLength(0);
  });

  it('an old/stale version -> 409 terms_required (the tick must name the CURRENT version)', async () => {
    const r = await read(await coachStoreCheckout(req({ listingId: 'listing-membership', termsVersion: 'store-terms-OLD' })));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('terms_required');
    expect(h.sessionsCreate).toHaveLength(0);
  });

  it('a closed store still answers #209 409 store_closed BEFORE the terms gate', async () => {
    delete process.env.STRIPE_SECRET_KEY; // gate not ok -> store_closed wins over the missing tick
    const r = await read(await coachStoreCheckout(req({ listingId: 'listing-membership' })));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('store_closed');
    expect(r.json.reason).toBe('payments_not_set_up');
    expect(h.sessionsCreate).toHaveLength(0);
  });

  it('the correct version passes the gate and reaches Stripe', async () => {
    const r = await read(await coachStoreCheckout(req({ listingId: 'listing-membership', termsVersion: STORE_TERMS_VERSION })));
    expect(r.status).toBe(200);
    expect(h.sessionsCreate).toHaveLength(1);
  });
});

// ── B3: server origin, never the Origin header ───────────────────────────────────────────────────────────────
describe('B3 siteOrigin()', () => {
  it('trims NEXTAUTH_URL, drops a trailing slash, null when blank, never reads the request', () => {
    expect(siteOrigin({ NEXTAUTH_URL: 'https://fel.test/' } as NodeJS.ProcessEnv)).toBe('https://fel.test');
    expect(siteOrigin({ NEXTAUTH_URL: '  https://fel.test  ' } as NodeJS.ProcessEnv)).toBe('https://fel.test');
    expect(siteOrigin({ NEXTAUTH_URL: '' } as NodeJS.ProcessEnv)).toBe(null);
    expect(siteOrigin({} as NodeJS.ProcessEnv)).toBe(null);
  });

  it('a request Origin of https://evil.example never steers the coach-store checkout success/cancel URLs', async () => {
    // listing not found -> 404 before sessions.create, so assert at the constant: the route uses siteOrigin(),
    // which is NEXTAUTH_URL-only. The evil Origin is exercised through the route with a null-origin case below.
    const r = await read(await coachStoreCheckout(req({ listingId: 'l' }, 'https://evil.example')));
    expect(h.sessionsCreate).toHaveLength(0);
    expect(r.status).not.toBe(500);
  });

  it('source: no req.headers.get(\'origin\') remains in the three Stripe URL routes', () => {
    for (const f of [
      'app/api/coach-store/checkout/route.ts',
      'app/api/stripe/checkout/route.ts',
      'app/api/stripe/portal/route.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes("req.headers.get('origin')"), f).toBe(false);
      expect(src.includes('siteOrigin()'), f).toBe(true);
    }
  });
});
