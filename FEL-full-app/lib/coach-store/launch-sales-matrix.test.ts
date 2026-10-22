// LAUNCH-SALES (P0, 2026-10-20): the coach store's launch products, each through the three paths
// (lib/stripe/launch-sales-matrix.test.ts has FEL Pro, the season pass, cosmetics, coins and books):
//
//   1. a verified adult buys it: the real /api/coach-store/checkout answers 200, and the SHARED /api/stripe/webhook's
//      checkout.session.completed opens the access (programAccessOpen) or pays the booking;
//   2. an under-18 and an unknown-age account are refused: 403 adults_only, nothing created at Stripe;
//   3. a refund (charge.refunded) revokes it: access REFUNDED (programAccessOpen false), booking REFUNDED.
//
// Kinds: program, course, series, bundle, membership, the parent-bought teen membership, live 1:1 and video review.
// A one-time sale's charge carries the coach-store metadata (payment_intent_data); a membership's invoice charge
// carries none, so its refund is found through the invoice's subscription (lib/stripe/refund-revoke.ts, new) and the
// Stripe subscription is cancelled so it does not bill again.
//
// Real code: the checkout route and lib/coach-store/checkout.ts, isVerifiedAdult (User.dobYear), the webhook,
// lib/coach-store/webhook.ts, refund-revoke and the ledger. Faked: Stripe, the session, Prisma (write-spy tables).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSpyDb, type SpyDb } from '@/tests/helpers/writeSpyDb';
import {
  ADULT, MINOR, UNKNOWN_AGE, chargeFixture, checkoutSessionFixture, eventFixture, fakeStripe, guardedPrisma,
  invoiceFixture, jsonRequest, seedBuyers, subscriptionFixture, webhookRequest, type FakeStripe,
} from '@/tests/helpers/stripeSales';

const h = vi.hoisted(() => ({
  db: null as unknown as SpyDb,
  stripe: null as unknown as FakeStripe,
  user: null as string | null,
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return guardedPrisma(h.db); } }));
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => h.stripe.client,
}));

const { POST: coachCheckout } = await import('@/app/api/coach-store/checkout/route');
const { POST: webhook } = await import('@/app/api/stripe/webhook/route');
const { STORE_PRICES } = await import('./storePrices');
const { itemKeyFor } = await import('./manifest');
const { openSlots } = await import('./slots');
const { programAccessOpen } = await import('./access');
const { STORE_TERMS_VERSION } = await import('@/lib/store-terms');

const COACH = 'coach-elijah';
const ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_launch_sales_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  NEXTAUTH_URL: 'https://fel.test',
  COACH_STORE_ENABLED: '1',
  COACH_STORE_PAYMENTS_ENABLED: '1',
  COACH_STORE_COACH_USER_IDS: COACH,
  COACH_REVIEW_UPLOADS_ENABLED: '1',
  COACH_REVIEWS_BUCKET: 'fel-test-reviews-bucket',
};
const saved: Record<string, string | undefined> = {};
const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, startMin: 0, endMin: 1440 }));
const INSTRUCTOR = {
  id: 'instructor-1', userId: COACH, slug: 'elijah', published: true,
  weeklyHours: ALL_DAY, blackoutDates: [], bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28,
};

beforeEach(() => {
  h.db = newSpyDb();
  h.stripe = fakeStripe();
  h.user = ADULT;
  seedBuyers(h.db);
  (h.db.tables.stripeCustomer ??= []).push({ id: 'sc-adult', userId: ADULT, stripeCustomerId: 'cus_adult' });
  (h.db.tables.instructor ??= []).push({ ...INSTRUCTOR });
  for (const row of STORE_PRICES) {
    (h.db.tables.marketplaceListing ??= []).push({
      id: `listing-${row.key}`, creatorId: COACH, title: row.title, priceUsd: row.priceCents, active: true,
      listingType: 'COACH_STORE', itemKey: itemKeyFor(row.manifest ?? { kind: 'video_review' }, 'elijah'),
      manifest: JSON.stringify(row.manifest),
    });
  }
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.restoreAllMocks();
});

/** The second open 30-minute slot from now (the first may sit on the notice boundary). */
function liveSlot(): string {
  const open = openSlots({
    now: new Date(), weekly: ALL_DAY, blackouts: [], busy: [], bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 28, durations: [30],
  });
  return open[1].startsAt.toISOString();
}

function bodyFor(key: string): Record<string, unknown> {
  const body: Record<string, unknown> = { listingId: `listing-${key}`, termsAccepted: true, termsVersion: STORE_TERMS_VERSION };
  if (key === 'live-1on1-30') body.startsAt = liveSlot();
  if (key === 'teen-membership') body.beneficiary = 'teen';
  return body;
}

async function checkout(key: string) {
  const res = await coachCheckout(jsonRequest(bodyFor(key)));
  return { status: res.status, json: await res.json() };
}

async function deliver(type: string, object: unknown, id?: string) {
  const res = await webhook(webhookRequest(eventFixture(type, object, id)));
  return { status: res.status, json: await res.json() };
}

const KINDS = [
  ['program', 'dunking-plyometrics-8wk'],
  ['course', 'signature-dunk-course'],
  ['series', 'blueprint-series'],
  ['bundle', 'bundle-all-three'],
  ['membership', 'membership'],
  ['teen membership (parent-bought)', 'teen-membership'],
  ['live 1:1', 'live-1on1-30'],
  ['video review', 'async-review'],
] as const;

const isMembership = (key: string) => key === 'membership' || key === 'teen-membership';
const isBooking = (key: string) => key === 'live-1on1-30' || key === 'async-review';

/** Buy as the adult and let Stripe complete the checkout. Returns the row id and what the refund needs. */
async function buyAndPay(key: string) {
  const r = await checkout(key);
  expect(r.status, `${key}: ${JSON.stringify(r.json)}`).toBe(200);
  const rowId = r.json.rowId as string;
  const params = h.stripe.created[0];
  expect(params.metadata).toMatchObject({ product: 'COACH_STORE', userId: ADULT, rowId, terms_version: STORE_TERMS_VERSION });
  // The database stamps createdAt with now(); the spy stamps a fixed date, so set it the way the database would.
  for (const t of ['booking', 'programAccess']) for (const row of h.db.tables[t] ?? []) if (row.id === rowId) row.createdAt = new Date();

  const membership = isMembership(key);
  const subId = `sub_${key}`;
  const pi = `pi_${key}`;
  if (membership) h.stripe.subscriptions[subId] = subscriptionFixture({ id: subId, metadata: params.subscription_data.metadata });
  const session = checkoutSessionFixture({
    id: `cs_${key}`, mode: membership ? 'subscription' : 'payment', amountTotal: params.line_items[0].price_data.unit_amount,
    paymentIntent: membership ? null : pi, subscription: membership ? subId : null, clientReferenceId: ADULT, metadata: params.metadata,
  });
  expect((await deliver('checkout.session.completed', session)).status).toBe(200);
  if (membership) {
    h.stripe.invoices[`in_${key}`] = invoiceFixture({
      id: `in_${key}`, subscription: subId, paymentIntent: pi, amountPaid: session.amount_total!, billingReason: 'subscription_create',
      metadata: params.subscription_data.metadata,
    });
  }
  return { rowId, pi, subId, params, amount: session.amount_total! };
}

function rowOf(key: string, rowId: string) {
  return (h.db.tables[isBooking(key) ? 'booking' : 'programAccess'] ?? []).find((r) => r.id === rowId)!;
}

describe.each(KINDS)('coach store: %s', (_label, key) => {
  it('a verified adult buys it, and it opens', async () => {
    const { rowId } = await buyAndPay(key);
    const row = rowOf(key, rowId);
    if (isBooking(key)) expect(row.status).toBe('PAID');
    else {
      expect(row.status).toBe('ACTIVE');
      expect(programAccessOpen(row as any, new Date())).toBe(true);
      expect(row.beneficiary).toBe(key === 'teen-membership' ? 'teen' : 'self');
    }
  });

  it('under 18 and unknown age: 403 adults_only, nothing at Stripe', async () => {
    for (const user of [MINOR, UNKNOWN_AGE]) {
      h.user = user;
      const r = await checkout(key);
      expect(r.status, user).toBe(403);
      expect(r.json.error, user).toBe('adults_only');
    }
    expect(h.stripe.created).toHaveLength(0);
    expect(h.stripe.customersCreated).toHaveLength(0);
    expect(h.db.tables.booking ?? []).toHaveLength(0);
    expect(h.db.tables.programAccess ?? []).toHaveLength(0);
  });

  it('a refund revokes it', async () => {
    const { rowId, pi, subId, params, amount } = await buyAndPay(key);
    // A one-time sale's charge carries the payment intent's coach-store metadata; a membership invoice's charge none.
    const md = isMembership(key) ? {} : params.payment_intent_data.metadata;
    const res = await deliver('charge.refunded', chargeFixture({ id: `ch_${key}`, paymentIntent: pi, amount, metadata: md }));
    expect(res.status).toBe(200);
    const row = rowOf(key, rowId);
    expect(row.status).toBe('REFUNDED');
    if (!isBooking(key)) {
      expect(row.codeActive).toBe(false);
      expect(programAccessOpen(row as any, new Date())).toBe(false);
    }
    expect(h.stripe.cancelled).toEqual(isMembership(key) ? [subId] : []);
  });
});

describe('coach store: a one-time refund whose charge lost its metadata', () => {
  it('is found by its payment intent and still revoked', async () => {
    const { rowId, pi, amount } = await buyAndPay('signature-dunk-course');
    const res = await deliver('charge.refunded', chargeFixture({ id: 'ch_bare', paymentIntent: pi, amount }));
    expect(res.json.refund).toBe('coach_store');
    expect(rowOf('signature-dunk-course', rowId).status).toBe('REFUNDED');
  });
});

describe('coach store: the switches stay off by default', () => {
  it('COACH_STORE_ENABLED unset: 404; COACH_STORE_PAYMENTS_ENABLED unset: 409 store_closed', async () => {
    delete process.env.COACH_STORE_ENABLED;
    expect((await checkout('membership')).status).toBe(404);
    process.env.COACH_STORE_ENABLED = '1';
    delete process.env.COACH_STORE_PAYMENTS_ENABLED;
    const r = await checkout('membership');
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: 'store_closed', reason: 'payments_off' });
    expect(h.stripe.created).toHaveLength(0);
  });

  it('a live key is refused while COACH_STORE_LIVE is off', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_never_in_this_repo';
    const r = await checkout('membership');
    expect(r.json).toMatchObject({ error: 'store_closed', reason: 'live_mode_off' });
    expect(h.stripe.created).toHaveLength(0);
  });
});
