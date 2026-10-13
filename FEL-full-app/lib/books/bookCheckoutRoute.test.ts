// PR #17 owner answers, 2026-10-13: POST /api/books/checkout is the coach store's door.
//   closed store (BOOK_STORE_ENABLED, B10 fence, platform sk_test_ key) -> 409 store_closed
//   not signed in -> 401 unauthorized (no guest checkout)
//   no terms tick / old version -> 409 terms_required { version }
//   not a verified adult -> 403 adults_only
// and a session is created (carrying terms_version) only when all of that passes.
// next-auth, prisma and the Stripe client are mocked; the gate, the params builder and the route are real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  session: { user: { id: 'buyer-1', email: 'buyer@fel.test' } } as { user: { id?: string; email?: string } } | null,
  isAdult: true,
  adultCalls: [] as string[],
  sessionsCreate: [] as any[],
  customersCreate: [] as any[],
  stripeCustomer: { id: 'sc-1', userId: 'buyer-1', stripeCustomerId: 'cus_saved' } as Record<string, unknown> | null,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({
  clientKeyFromHeaders: () => 'test-ip',
  rateLimit: () => ({ ok: true, retryAfterSec: 0 }),
}));
vi.mock('@/lib/coach-store/adult', () => ({
  isVerifiedAdult: async (_db: unknown, userId: string) => {
    h.adultCalls.push(userId);
    return h.isAdult;
  },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    stripeCustomer: {
      findUnique: async () => h.stripeCustomer,
      create: async (a: any) => ({ id: 'sc-new', ...a.data }),
    },
  },
}));
vi.mock('@/lib/books/bookCheckout', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/books/bookCheckout')>();
  return {
    ...actual,
    getBookStripe: () => ({
      customers: { create: async (p: any) => { h.customersCreate.push(p); return { id: 'cus_new' }; } },
      checkout: { sessions: { create: async (p: any) => { h.sessionsCreate.push(p); return { id: 'cs_1', url: 'https://stripe.test/cs_1' }; } } },
    }),
  };
});

import { POST } from '@/app/api/books/checkout/route';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

const ENV_KEYS = ['BOOK_STORE_ENABLED', 'VIRTUAL_PURCHASES_ENABLED', 'STRIPE_SECRET_KEY', 'STRIPE_BOOKS_SECRET_KEY', 'NEXTAUTH_URL'] as const;
const SAVED: Record<string, string | undefined> = {};

const GOOD_BODY = { offerId: 'blueprint:audiobook', termsAccepted: true, termsVersion: STORE_TERMS_VERSION };

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/books/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const res = await POST(post(body));
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.BOOK_STORE_ENABLED = '1';
  process.env.VIRTUAL_PURCHASES_ENABLED = '1';
  process.env.STRIPE_SECRET_KEY = 'sk_test_platform';
  delete process.env.STRIPE_BOOKS_SECRET_KEY;
  process.env.NEXTAUTH_URL = 'https://fel.example';
  h.session = { user: { id: 'buyer-1', email: 'buyer@fel.test' } };
  h.isAdult = true;
  h.adultCalls.length = 0;
  h.sessionsCreate.length = 0;
  h.customersCreate.length = 0;
  h.stripeCustomer = { id: 'sc-1', userId: 'buyer-1', stripeCustomerId: 'cus_saved' };
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.restoreAllMocks();
});

describe('book checkout: the switch (BOOK_STORE_ENABLED), default off, fail closed', () => {
  it.each([undefined, '', '0', 'false', 'nope'])('BOOK_STORE_ENABLED=%s -> 409 store_closed book_store_off, nothing else runs', async (v) => {
    if (v === undefined) delete process.env.BOOK_STORE_ENABLED;
    else process.env.BOOK_STORE_ENABLED = v;
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'store_closed', reason: 'book_store_off' });
    expect(h.adultCalls).toEqual([]);
    expect(h.sessionsCreate).toEqual([]);
  });

  it('the B10 fence is still required: BOOK_STORE_ENABLED alone is 409 virtual_purchases_off', async () => {
    delete process.env.VIRTUAL_PURCHASES_ENABLED;
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'store_closed', reason: 'virtual_purchases_off' });
    expect(h.sessionsCreate).toEqual([]);
  });
});

describe('book checkout: the platform Stripe account, test mode only', () => {
  it('a live platform key is 409 live_mode_off', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_platform';
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'store_closed', reason: 'live_mode_off' });
    expect(h.sessionsCreate).toEqual([]);
  });

  it('a leftover STRIPE_BOOKS_SECRET_KEY opens nothing: with no platform key the store is closed', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_BOOKS_SECRET_KEY = 'sk_test_books_only';
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'store_closed', reason: 'payments_not_set_up' });
    expect(h.sessionsCreate).toEqual([]);
  });
});

describe('book checkout: signed in, no guest checkout', () => {
  it('no session -> 401 unauthorized, no Stripe call, no age lookup', async () => {
    h.session = null;
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: 'unauthorized' });
    expect(h.sessionsCreate).toEqual([]);
    expect(h.adultCalls).toEqual([]);
  });

  it('a session with an email but no user id (a guest-like identity) is still 401', async () => {
    h.session = { user: { email: 'guest@fel.test' } };
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(401);
    expect(h.sessionsCreate).toEqual([]);
  });
});

describe('book checkout: the store terms gate (termsAccepted + STORE_TERMS_VERSION)', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['no tick at all', { offerId: 'blueprint:audiobook' }],
    ['termsAccepted false', { ...GOOD_BODY, termsAccepted: false }],
    ['termsAccepted "true" (a string)', { ...GOOD_BODY, termsAccepted: 'true' }],
    ['no version', { offerId: 'blueprint:audiobook', termsAccepted: true }],
    ['an old version', { ...GOOD_BODY, termsVersion: 'store-terms-2026-10-04' }],
  ];
  it.each(cases)('%s -> 409 terms_required naming the current version, before any Stripe call', async (_name, body) => {
    const r = await call(body);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'terms_required', version: STORE_TERMS_VERSION });
    expect(h.sessionsCreate).toEqual([]);
    expect(h.customersCreate).toEqual([]);
  });
});

describe('book checkout: verified adults only (the coach store\'s isVerifiedAdult)', () => {
  it('not a verified adult -> 403 adults_only, Stripe never called', async () => {
    h.isAdult = false;
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'adults_only' });
    expect(h.adultCalls).toEqual(['buyer-1']);
    expect(h.sessionsCreate).toEqual([]);
    expect(h.customersCreate).toEqual([]);
  });
});

describe('book checkout: the store terms allow-list (lib/books/bookTerms.ts), audiobooks only', () => {
  // owner 2026-10-13: store-terms-2026-10-12 covers audiobooks only; ebooks and the bundle are hidden and refused
  // until an EBOOK-1 terms version exists. Refused before any Stripe customer or session is created.
  it.each(['blueprint:ebook', 'blueprint:bundle', 'unfair-advantages:ebook', 'unfair-advantages:bundle'])(
    '%s -> 409 format_not_offered, no Stripe customer, no session',
    async (offerId) => {
      h.stripeCustomer = null;
      const r = await call({ ...GOOD_BODY, offerId });
      expect(r.status).toBe(409);
      expect(r.json).toMatchObject({ code: 'format_not_offered' });
      expect(h.customersCreate).toEqual([]);
      expect(h.sessionsCreate).toEqual([]);
    },
  );

  it('an unknown offer is 404 before any Stripe call', async () => {
    h.stripeCustomer = null;
    const r = await call({ ...GOOD_BODY, offerId: 'nope:audiobook' });
    expect(r.status).toBe(404);
    expect(h.customersCreate).toEqual([]);
    expect(h.sessionsCreate).toEqual([]);
  });

  it('the audiobook is still sold', async () => {
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(200);
  });
});

describe('book checkout: the happy path', () => {
  it('a signed-in verified adult who ticked the current terms gets a session; terms_version rides on it', async () => {
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ url: 'https://stripe.test/cs_1' });
    expect(h.adultCalls).toEqual(['buyer-1']);
    expect(h.sessionsCreate).toHaveLength(1);
    const params = h.sessionsCreate[0];
    expect(params.metadata).toMatchObject({ product: 'BOOK', offerId: 'blueprint:audiobook', terms_version: STORE_TERMS_VERSION });
    // the platform StripeCustomer is reused, and the return URL comes from NEXTAUTH_URL, not the request's Origin
    expect(params.customer).toBe('cus_saved');
    expect(params.success_url).toBe('https://fel.example/press/receipt?session_id={CHECKOUT_SESSION_ID}');
  });

  it('creates a platform customer for a buyer who has none yet', async () => {
    h.stripeCustomer = null;
    const r = await call(GOOD_BODY);
    expect(r.status).toBe(200);
    expect(h.customersCreate).toEqual([{ email: 'buyer@fel.test', metadata: { userId: 'buyer-1' } }]);
    expect(h.sessionsCreate[0].customer).toBe('cus_new');
  });
});
