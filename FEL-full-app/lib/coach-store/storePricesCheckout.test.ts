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
  membershipIncludesCourses: false,
  bundleOwnedPartsMode: 'block_if_any_owned' as 'block_if_any_owned' | 'allow_full_price',
  stripe: {
    customers: { create: vi.fn(async (a: unknown) => ({ id: 'cus_1', ...((a as object) ?? {}) })) },
    checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' })) } },
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : spyPrisma(h.db)[p]) }),
}));
vi.mock('./adult', () => ({ isVerifiedAdult: async () => h.isAdult }));
// STORE-READY B2: the gate's not-ok shape changed (error 'store_closed' + a reason, status 409); the ok shape the
// checkout path consumes is unchanged, so the mock keeps the stripeTestGate export name and ok:true form.
vi.mock('./stripeMode', () => ({ stripeTestGate: () => ({ ok: true, key: 'sk_test_fake' }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => h.stripe }));
vi.mock('./bundlePolicy', () => ({
  get membershipIncludesCourses() { return h.membershipIncludesCourses; },
  get bundleOwnedPartsMode() { return h.bundleOwnedPartsMode; },
}));

import { startCheckout } from './checkout';

const ENV_KEYS = ['COACH_STORE_PAYMENTS_ENABLED', 'COACH_STORE_COACH_USER_IDS'] as const;
const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.COACH_STORE_PAYMENTS_ENABLED = '1';
  h.db = newSpyDb();
  h.isAdult = true;
  h.membershipIncludesCourses = false;
  h.bundleOwnedPartsMode = 'block_if_any_owned';
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

  function ownCourse(status = 'ACTIVE', beneficiary = 'self') {
    const courseListingId = seedListing('signature-dunk-course');
    (h.db.tables.programAccess ??= []).push({
      id: 'pa-course-1', userId: BUYER_ID, instructorId: 'instructor-1', listingId: courseListingId,
      lane: 'signature-dunk-course', billing: 'one_time', scope: 'product', beneficiary, status, priceCents: 3900,
    });
  }

  it('block_if_any_owned (default): owning a member (course) and buying the bundle → 409 already_owned with the missing parts and their prices (plus BUNDLE-MISSING-PARTS-UI\'s additive listingId/listingPriceCents, one matched to a single-product listing and one unmatched), no Stripe call', async () => {
    ownCourse();
    // dunking-plyometrics-8wk also has its own single-product listing (the coach sells it standalone) so its
    // Buy-this-part button has somewhere to go; blueprint-series does not, so its listingId stays null.
    const dunkingListingId = seedListing('dunking-plyometrics-8wk');
    const bundleListingId = seedListing('bundle-all-three');
    const r = await checkout(bundleListingId);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({
      error: 'already_owned',
      owned: ['signature-dunk-course'],
      missing: [
        { key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900, listingId: dunkingListingId, listingPriceCents: 7900 },
        { key: 'blueprint-series', title: 'Blueprint series', priceCents: 2900, listingId: null, listingPriceCents: null },
      ],
      ownedParts: [{ key: 'signature-dunk-course', title: 'Signature Dunk Course' }],
    });
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(h.db.tables.programAccess.find((row) => row.listingId === bundleListingId)).toBeUndefined();
  });

  it('block_if_any_owned: owning a member past-due also blocks the bundle', async () => {
    ownCourse('PAST_DUE');
    const r = await checkout(seedListing('bundle-all-three'));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('already_owned');
  });

  it('block_if_any_owned: a canceled member (not active/past-due) does not block the bundle', async () => {
    ownCourse('CANCELED');
    const r1 = await checkout(seedListing('bundle-all-three'));
    expect(r1.status).toBe(200);
    expect(h.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it('block_if_any_owned: owning a member for the teen does not block the bundle for self', async () => {
    ownCourse('ACTIVE', 'teen');
    const r = await checkout(seedListing('bundle-all-three'));
    expect(r.status).toBe(200);
  });

  it('owning none of the members → the bundle checks out normally', async () => {
    const r = await checkout(seedListing('bundle-all-three'));
    expect(r.status).toBe(200);
    expect(h.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("bundleOwnedPartsMode 'allow_full_price' (not the default): owning the course and buying the bundle is allowed at full price", async () => {
    h.bundleOwnedPartsMode = 'allow_full_price';
    ownCourse();
    const r = await checkout(seedListing('bundle-all-three'));
    expect(r.status).toBe(200);
    const call = h.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(call.line_items[0].price_data.unit_amount).toBe(11900);
  });

  function ownMembership() {
    const membershipListingId = seedListing('membership');
    (h.db.tables.programAccess ??= []).push({
      id: 'pa-mem-1', userId: BUYER_ID, instructorId: 'instructor-1', listingId: membershipListingId,
      lane: 'adult', billing: 'month', scope: 'all', beneficiary: 'self', status: 'ACTIVE', priceCents: 2999,
    });
  }

  it('membershipIncludesCourses false (default): an active member can still buy the course, the series and the bundle', async () => {
    ownMembership();
    for (const key of ['signature-dunk-course', 'blueprint-series', 'bundle-all-three']) {
      const r = await checkout(seedListing(key));
      expect(r.status).toBe(200);
    }
    expect(h.stripe.checkout.sessions.create).toHaveBeenCalledTimes(3);
  });

  it('membershipIncludesCourses true: an active member buying the course → 409 already_owned; the bundle is blocked too', async () => {
    h.membershipIncludesCourses = true;
    ownMembership();
    const r = await checkout(seedListing('signature-dunk-course'));
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'already_owned' });
    const b = await checkout(seedListing('bundle-all-three'));
    expect(b.status).toBe(409);
    expect(b.json.owned).toEqual(['signature-dunk-course', 'blueprint-series']);
    expect(b.json.missing).toEqual([{ key: 'dunking-plyometrics-8wk', title: 'Dunking & Plyometrics 8-week', priceCents: 7900, listingId: null, listingPriceCents: null }]);
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('membershipIncludesCourses true: owning the course never blocks buying a membership', async () => {
    h.membershipIncludesCourses = true;
    ownCourse();
    const r = await checkout(seedListing('membership'));
    expect(r.status).toBe(200);
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
