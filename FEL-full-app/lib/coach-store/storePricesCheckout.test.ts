// STORE-PRICES checkout coverage: CHECKOUT STAYS ADULTS-ONLY for every manifest kind, and the teen membership
// is parent-bought-only (a verified adult buys it, ProgramAccess lands on the teen beneficiary). No real DB,
// network or Stripe key — lib/db, lib/stripe, ./stripeMode and ./adult are mocked (the vi.mock pattern already
// used by lib/health/health-adults-only-*.test.ts and lib/privacy/*gate*.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSpyDb, spyPrisma, type SpyDb } from '@/tests/helpers/writeSpyDb';
import { storePriceByKey } from './storePrices';
import { itemKeyFor } from './manifest';

const h = vi.hoisted(() => ({
  db: null as unknown as SpyDb,
  isAdult: true,
  stripe: {
    customers: { create: vi.fn(async (a: unknown) => ({ id: 'cus_1', ...((a as object) ?? {}) })) },
    checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' })) } },
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : spyPrisma(h.db)[p]) }),
}));
vi.mock('./adult', () => ({ isVerifiedAdult: async () => h.isAdult }));
vi.mock('./stripeMode', () => ({ stripeTestGate: () => ({ ok: true, key: 'sk_test_fake' }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => h.stripe }));

import { startCheckout } from './checkout';

const ENV_KEYS = ['COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_COACH_USER_IDS'] as const;
const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  h.db = newSpyDb();
  h.isAdult = true;
  h.stripe.customers.create.mockClear();
  h.stripe.checkout.sessions.create.mockClear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

const COACH_ID = 'coach-elijah';
const BUYER_ID = 'buyer-1';

function seedListing(key: string) {
  const row = storePriceByKey(key)!;
  const listingId = `listing-${key}`;
  (h.db.tables.marketplaceListing ??= []).push({
    id: listingId,
    creatorId: COACH_ID,
    title: row.title,
    itemKey: itemKeyFor(row.manifest ?? { kind: 'video_review' }, 'elijah'),
    priceUsd: row.priceCents,
    active: true,
    listingType: 'COACH_STORE',
    manifest: JSON.stringify(row.manifest ?? { kind: 'video_review' }),
  });
  return listingId;
}

function seedInstructor() {
  (h.db.tables.instructor ??= []).push({
    id: 'instructor-1', userId: COACH_ID, slug: 'elijah', published: true,
    weeklyHours: '[]', blackoutDates: '[]', bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28,
  });
}

async function checkout(listingId: string, body: Record<string, unknown> = {}) {
  const res = await startCheckout(BUYER_ID, { listingId, ...body }, 'https://fel.test');
  return { status: res.status, json: await res.json() };
}

describe('CHECKOUT STAYS ADULTS-ONLY: every manifest kind, not-adult → 403 adults_only, Stripe never called', () => {
  const kinds = [
    'dunking-plyometrics-8wk', 'membership', 'teen-membership', 'async-review', 'live-1on1-30',
    'signature-dunk-course', 'blueprint-series', 'bundle-all-three',
  ];

  it.each(kinds)('%s: isVerifiedAdult false → 403 { error: adults_only }', async (key) => {
    seedInstructor();
    const listingId = seedListing(key);
    h.isAdult = false;
    const r = await checkout(listingId, key === 'live-1on1-30' ? { startsAt: '2026-10-10T18:00:00Z' } : {});
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'adults_only' });
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(h.stripe.customers.create).not.toHaveBeenCalled();
  });
});

describe('STORE-LISTING-FORMAT: course, series and bundle checkout', () => {
  beforeEach(() => {
    process.env.COACH_STORE_COACH_USER_IDS = COACH_ID;
    seedInstructor();
    h.isAdult = true;
  });

  const cases: Array<{ key: string; scope: string; lane: string; cents: number }> = [
    { key: 'signature-dunk-course', scope: 'product', lane: 'signature-dunk-course', cents: 3900 },
    { key: 'blueprint-series', scope: 'product', lane: 'blueprint-series', cents: 2900 },
    { key: 'bundle-all-three', scope: 'bundle', lane: 'bundle-all-three', cents: 11900 },
  ];

  it.each(cases)('$key: ProgramAccess scope $scope / lane $lane, Stripe mode payment, unit_amount $cents', async ({ key, scope, lane, cents }) => {
    const listingId = seedListing(key);
    const r = await checkout(listingId);
    expect(r.status).toBe(200);
    const access = h.db.tables.programAccess.find((row) => row.listingId === listingId);
    expect(access).toBeDefined();
    expect(access!.scope).toBe(scope);
    expect(access!.lane).toBe(lane);
    expect(access!.billing).toBe('one_time');
    expect(h.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const call = h.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.mode).toBe('payment');
    expect(call.line_items[0].price_data.unit_amount).toBe(cents);
  });

  it('owning the bundle already (ACTIVE) and buying the course → 409 already_owned, no Stripe call', async () => {
    const bundleListingId = seedListing('bundle-all-three');
    (h.db.tables.programAccess ??= []).push({
      id: 'pa-bundle-1', userId: BUYER_ID, instructorId: 'instructor-1', listingId: bundleListingId,
      lane: 'bundle-all-three', billing: 'one_time', scope: 'bundle', beneficiary: 'self', status: 'ACTIVE', priceCents: 11900,
    });
    const courseListingId = seedListing('signature-dunk-course');
    const r = await checkout(courseListingId);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'already_owned' });
    // customerId() runs before the per-kind dispatch (same as every checkout), so only the Stripe *checkout*
    // call is guaranteed skipped here — not customer lookup/creation.
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('owning a member (course) already and buying the bundle is allowed (no proration)', async () => {
    const courseListingId = seedListing('signature-dunk-course');
    (h.db.tables.programAccess ??= []).push({
      id: 'pa-course-1', userId: BUYER_ID, instructorId: 'instructor-1', listingId: courseListingId,
      lane: 'signature-dunk-course', billing: 'one_time', scope: 'product', beneficiary: 'self', status: 'ACTIVE', priceCents: 3900,
    });
    const bundleListingId = seedListing('bundle-all-three');
    const r = await checkout(bundleListingId);
    expect(r.status).toBe(200);
    expect(h.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});

describe('existing kinds unchanged: program and membership scope/lane/mode', () => {
  beforeEach(() => {
    process.env.COACH_STORE_COACH_USER_IDS = COACH_ID;
    seedInstructor();
    h.isAdult = true;
  });

  it('the dunking program still writes scope lane / lane dunking, mode payment', async () => {
    const listingId = seedListing('dunking-plyometrics-8wk');
    const r = await checkout(listingId);
    expect(r.status).toBe(200);
    const access = h.db.tables.programAccess.find((row) => row.listingId === listingId);
    expect(access!.scope).toBe('lane');
    expect(access!.lane).toBe('dunking');
    expect(access!.billing).toBe('one_time');
    const call = h.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.mode).toBe('payment');
  });

  it('the adult membership still writes scope all / lane adult, mode subscription', async () => {
    const listingId = seedListing('membership');
    const r = await checkout(listingId);
    expect(r.status).toBe(200);
    const access = h.db.tables.programAccess.find((row) => row.listingId === listingId);
    expect(access!.scope).toBe('all');
    expect(access!.lane).toBe('adult');
    expect(access!.billing).toBe('month');
    const call = h.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.mode).toBe('subscription');
  });
});

describe('TEEN MEMBERSHIP IS PARENT-ONLY', () => {
  beforeEach(() => {
    process.env.COACH_STORE_COACH_USER_IDS = COACH_ID;
    seedInstructor();
  });

  it('a verified-adult buyer: ProgramAccess beneficiary teen / scope teen_all, unlockCode returned, Stripe line item 1499/month', async () => {
    h.isAdult = true;
    const listingId = seedListing('teen-membership');
    const r = await checkout(listingId);
    expect(r.status).toBe(200);
    expect(typeof r.json.unlockCode).toBe('string');
    expect(r.json.unlockCode.length).toBeGreaterThan(0);

    const access = h.db.tables.programAccess.find((row) => row.listingId === listingId);
    expect(access).toBeDefined();
    expect(access!.beneficiary).toBe('teen');
    expect(access!.scope).toBe('teen_all');
    expect(access!.userId).toBe(BUYER_ID);

    expect(h.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const call = h.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.mode).toBe('subscription');
    expect(call.line_items[0].price_data.unit_amount).toBe(1499);
    expect(call.line_items[0].price_data.recurring).toEqual({ interval: 'month' });
  });

  it('a non-adult buyer of the same listing gets 403 adults_only', async () => {
    h.isAdult = false;
    const listingId = seedListing('teen-membership');
    const r = await checkout(listingId);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'adults_only' });
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
