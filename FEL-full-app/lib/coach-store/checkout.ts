import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';
import { isVerifiedAdult } from './adult';
import { attachListingMatches, type PartListingMatch } from './bundleParts';
import { isAllowlistedCoach } from './coaches';
import * as bundlePolicy from './bundlePolicy';
import { missingBundleParts, ownedBundleParts, productsGrantedBy } from './entitlement';
import { isMissingTable, logStoreUnavailable, reviewsCanBeSold, storeClosed } from './gate';
import { itemKeyFor, parseManifest, priceOk, programComingSoon, type CoachManifest } from './manifest';
import { checkoutExpiresAtUnix, holdExpiresAt } from './policy';
import { shareWithCoachAllowed } from './rescreen';
import { openSlots, type WeeklyWindow } from './slots';
import { stripeTestGate } from './stripeMode';
import { newUnlockCode } from './teen';

export interface CheckoutBody {
  listingId?: unknown;
  beneficiary?: unknown;
  startsAt?: unknown;
  referralCode?: unknown;
  goal?: unknown;
  painYes?: unknown;
  note?: unknown;
  shareWithCoach?: unknown;
}

function windowsOf(value: unknown): WeeklyWindow[] {
  if (!Array.isArray(value)) return [];
  const out: WeeklyWindow[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { dow?: unknown; startMin?: unknown; endMin?: unknown };
    if (typeof r.dow === 'number' && typeof r.startMin === 'number' && typeof r.endMin === 'number') {
      out.push({ dow: r.dow, startMin: r.startMin, endMin: r.endMin });
    }
  }
  return out;
}

function blackoutsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

async function customerId(userId: string, stripe: Stripe): Promise<string> {
  const existing = await prisma.stripeCustomer.findUnique({ where: { userId } });
  if (existing) return existing.stripeCustomerId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const cust = await stripe.customers.create({ email: user?.email ?? undefined, metadata: { userId } });
  await prisma.stripeCustomer.create({ data: { userId, stripeCustomerId: cust.id } });
  return cust.id;
}

export async function startCheckout(userId: string, body: CheckoutBody, origin: string): Promise<NextResponse> {
  const paymentsOff = !process.env.COACH_STORE_PAYMENTS_ENABLED || !['1', 'true', 'on', 'yes'].includes((process.env.COACH_STORE_PAYMENTS_ENABLED ?? '').toLowerCase());
  if (paymentsOff) {
    return storeClosed('payments_off');
  }
  const gate = stripeTestGate();
  // STORE-READY B2: a not-ok gate is 409 store_closed BEFORE getStripe() can throw for a missing key.
  if (!gate.ok) return storeClosed(gate.reason);
  if (!(await isVerifiedAdult(prisma, userId))) {
    return NextResponse.json({ error: 'adults_only' }, { status: 403 });
  }
  const listingId = typeof body.listingId === 'string' ? body.listingId : '';
  if (!listingId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  try {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing || !listing.active || listing.listingType !== 'COACH_STORE') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const manifest = parseManifest(listing.manifest);
    if (!manifest || !priceOk(listing.priceUsd)) {
      return NextResponse.json({ error: 'not_for_sale' }, { status: 409 });
    }
    if (programComingSoon(manifest)) return NextResponse.json({ error: 'coming_soon' }, { status: 409 });
    if (manifest.kind === 'video_review' && !reviewsCanBeSold()) {
      return NextResponse.json({ error: 'coming_soon' }, { status: 409 });
    }
    const instructor = await prisma.instructor.findFirst({ where: { userId: listing.creatorId, published: true } });
    if (!instructor || !isAllowlistedCoach(instructor.userId)) {
      return NextResponse.json({ error: 'not_for_sale' }, { status: 409 });
    }
    if (listing.creatorId === userId) return NextResponse.json({ error: 'own_listing' }, { status: 409 });

    const beneficiary = beneficiaryFor(manifest, body.beneficiary);
    if (!beneficiary) return NextResponse.json({ error: 'bad_beneficiary' }, { status: 400 });

    const now = new Date();
    const referrerUserId = await referrerFromCode(typeof body.referralCode === 'string' ? body.referralCode : '');
    const stripe = getStripe();
    const customer = await customerId(userId, stripe);

    if (manifest.kind === 'live_1on1' || manifest.kind === 'video_review') {
      return bookTime(userId, listing, instructor, manifest, body, origin, customer, referrerUserId, now, stripe);
    }
    return buyAccess(userId, listing, instructor.id, manifest, beneficiary, origin, customer, referrerUserId, now, stripe);
  } catch (err) {
    if (isMissingTable(err)) {
      logStoreUnavailable();
      return NextResponse.json({ error: 'coach_store_not_set_up', message: 'coach store not set up yet' }, { status: 503 });
    }
    throw err;
  }
}

function beneficiaryFor(manifest: CoachManifest, raw: unknown): 'self' | 'teen' | null {
  if (manifest.kind === 'live_1on1' || manifest.kind === 'video_review') return 'self';
  if (manifest.kind === 'membership') return manifest.audience === 'teen' ? 'teen' : 'self';
  // program, course, series and bundle all take the same 'self' or 'teen' choice from the buyer.
  const who = raw === 'teen' ? 'teen' : raw === 'self' || raw === undefined ? 'self' : null;
  return who;
}

/** Every product key the buyer's own active/past-due access (other than the listing just checked) already grants. */
async function ownedProductsFor(userId: string, beneficiary: 'self' | 'teen', excludeListingId: string): Promise<Set<string>> {
  const rows = await prisma.programAccess.findMany({
    where: { userId, beneficiary, status: { in: ['ACTIVE', 'PAST_DUE'] }, listingId: { not: excludeListingId } },
    select: { listingId: true },
  });
  const listingIds = [...new Set(rows.map((r) => r.listingId))];
  if (!listingIds.length) return new Set();
  const listings = await prisma.marketplaceListing.findMany({ where: { id: { in: listingIds } }, select: { manifest: true } });
  const out = new Set<string>();
  for (const l of listings) {
    const m = parseManifest(l.manifest);
    if (!m) continue;
    for (const p of productsGrantedBy(m)) out.add(p);
  }
  return out;
}

/**
 * For the bundle 409's `missing` parts: the same coach's own active COACH_STORE listing that sells each
 * missing part on its own (a program/course/series manifest whose `productsGrantedBy` is exactly that one
 * key) — so a part's Buy button can start a normal single-item checkout. One findMany read; no writes.
 */
async function findPartListingsFor(keys: readonly string[], creatorId: string): Promise<Map<string, PartListingMatch>> {
  const out = new Map<string, PartListingMatch>();
  if (!keys.length) return out;
  const listings = await prisma.marketplaceListing.findMany({
    where: { creatorId, active: true, listingType: 'COACH_STORE' },
    select: { id: true, manifest: true, priceUsd: true },
  });
  for (const row of listings) {
    const manifest = parseManifest(row.manifest);
    if (!manifest || (manifest.kind !== 'program' && manifest.kind !== 'course' && manifest.kind !== 'series')) continue;
    const products = productsGrantedBy(manifest);
    if (products.length !== 1 || !keys.includes(products[0])) continue;
    if (!out.has(products[0])) out.set(products[0], { listingId: row.id, priceCents: row.priceUsd });
  }
  return out;
}

async function referrerFromCode(code: string): Promise<string | null> {
  if (!code) return null;
  const row = await prisma.referralCode.findUnique({ where: { code }, select: { userId: true } });
  return row?.userId ?? null;
}

async function bookTime(
  userId: string,
  listing: { id: string; priceUsd: number; title: string },
  instructor: { id: string; userId: string; weeklyHours: unknown; blackoutDates: unknown; bufferMinutes: number; minNoticeHours: number; maxDaysAhead: number; slug: string },
  manifest: CoachManifest,
  body: CheckoutBody,
  origin: string,
  customer: string,
  referrerUserId: string | null,
  now: Date,
  stripe: Stripe,
): Promise<NextResponse> {
  if (manifest.kind !== 'live_1on1' && manifest.kind !== 'video_review') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  await prisma.booking.updateMany({
    where: { status: 'HELD', holdExpiresAt: { lt: now } },
    data: { status: 'EXPIRED', slotLock: null },
  });

  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  let slotLock: string | null = null;
  let durationMin: number | null = null;
  if (manifest.kind === 'live_1on1') {
    if (typeof body.startsAt !== 'string') return NextResponse.json({ error: 'slot_required' }, { status: 400 });
    startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: 'slot_required' }, { status: 400 });
    durationMin = manifest.durationMin;
    endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    const busy = await prisma.booking.findMany({
      where: { instructorId: instructor.id, slotLock: { not: null }, status: { in: ['HELD', 'PAID'] } },
      select: { startsAt: true, endsAt: true },
    });
    const open = openSlots({
      now,
      weekly: windowsOf(instructor.weeklyHours),
      blackouts: blackoutsOf(instructor.blackoutDates),
      busy: busy.flatMap((b) => (b.startsAt && b.endsAt ? [{ startsAt: b.startsAt, endsAt: b.endsAt }] : [])),
      bufferMinutes: instructor.bufferMinutes,
      minNoticeHours: instructor.minNoticeHours,
      maxDaysAhead: instructor.maxDaysAhead,
      durations: [manifest.durationMin],
    });
    const match = open.find((s) => s.startsAt.getTime() === startsAt!.getTime() && s.durationMin === durationMin);
    if (!match) return NextResponse.json({ error: 'slot_unavailable' }, { status: 409 });
    slotLock = `${instructor.id}:${startsAt.toISOString()}`;
  }

  const share = manifest.kind === 'live_1on1' && body.shareWithCoach === true && await shareWithCoachAllowed(prisma, userId);
  const booking = await prisma.booking.create({
    data: {
      kind: manifest.kind,
      instructorId: instructor.id,
      coachUserId: instructor.userId,
      clientUserId: userId,
      listingId: listing.id,
      status: 'HELD',
      durationMin,
      priceCents: listing.priceUsd,
      holdExpiresAt: holdExpiresAt(now),
      startsAt,
      endsAt,
      slotLock,
      shareWithCoach: share,
      goal: typeof body.goal === 'string' ? body.goal.slice(0, 80) : null,
      painYes: typeof body.painYes === 'boolean' ? body.painYes : null,
      reviewNote: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
    },
  });

  try {
    const session = await stripe.checkout.sessions.create({
      customer,
      client_reference_id: userId,
      mode: 'payment',
      expires_at: checkoutExpiresAtUnix(now),
      // No payment_method_types: Stripe's automatic payment methods offer whatever the
      // Dashboard has enabled (SEC-F4 addendum). Pinning ['card'] hid every wallet/BNPL here.
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: listing.priceUsd,
          product_data: { name: listing.title },
        },
      }],
      // session_id lets /coach/thanks fulfil through POST /api/stripe/verify-session
      // even when no webhook is configured (SEC-F4 NO-WEBHOOK follow-up).
      success_url: `${origin}/coach/thanks?row=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/coach/${instructor.slug}`,
      metadata: meta(userId, booking.id, manifest.kind, 'self', referrerUserId),
    }, { idempotencyKey: `coach-store:checkout:${booking.id}` });
    await prisma.booking.update({ where: { id: booking.id }, data: { stripeCheckoutId: session.id } });
    return NextResponse.json({ url: session.url, rowId: booking.id });
  } catch (err) {
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED', slotLock: null } });
    throw err;
  }
}

async function buyAccess(
  userId: string,
  listing: { id: string; priceUsd: number; title: string; creatorId: string },
  instructorId: string,
  manifest: Extract<CoachManifest, { kind: 'program' | 'membership' | 'course' | 'series' | 'bundle' }>,
  beneficiary: 'self' | 'teen',
  origin: string,
  customer: string,
  referrerUserId: string | null,
  now: Date,
  stripe: Stripe,
): Promise<NextResponse> {
  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId }, select: { slug: true, userId: true } });
  const scope = manifest.kind === 'membership'
    ? (manifest.audience === 'teen' ? 'teen_all' : 'all')
    : manifest.kind === 'course' || manifest.kind === 'series'
      ? 'product'
      : manifest.kind === 'bundle'
        ? 'bundle'
        : 'lane';
  const lane = manifest.kind === 'program'
    ? manifest.lane
    : manifest.kind === 'membership'
      ? manifest.audience
      : manifest.product;
  const unlock = beneficiary === 'teen' ? newUnlockCode() : null;
  const existing = await prisma.programAccess.findUnique({
    where: { userId_listingId_beneficiary: { userId, listingId: listing.id, beneficiary } },
  });
  if (existing && (existing.status === 'ACTIVE' || existing.status === 'PAST_DUE')) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
  }
  // STORE-READY B5 (F21): retrying a purchase within 24 h must not 500. Before any row write, resolve the
  // existing row's Stripe checkout session: still open at the SAME price -> hand back that URL untouched; the
  // price changed -> expire it and fall through to a fresh session under a NEW idempotency key; already paid ->
  // fulfil it and answer 409 already_owned. A Stripe outage answers 502 with nothing written.
  if (existing?.stripeCheckoutId) {
    let prior: Stripe.Checkout.Session | null = null;
    try {
      prior = await stripe.checkout.sessions.retrieve(existing.stripeCheckoutId);
    } catch (err) {
      const e = err as { code?: string; statusCode?: number; type?: string };
      if (e?.code === 'resource_missing' || e?.statusCode === 404 || e?.type === 'StripeInvalidRequestError') {
        prior = null; // a session Stripe no longer has is as good as expired
      } else {
        console.error('[coach-store] re-buy session check failed');
        return NextResponse.json({ error: 'stripe_unavailable' }, { status: 502 });
      }
    }
    if (prior) {
      const { isPaidSession } = await import('@/lib/stripe/verify-checkout');
      if (prior.status === 'open' && prior.payment_status !== 'paid' && !isPaidSession(prior)) {
        if (existing.priceCents === listing.priceUsd && prior.url) {
          return NextResponse.json({ url: prior.url, rowId: existing.id });
        }
        try { await stripe.checkout.sessions.expire(prior.id); } catch { /* already closed */ }
      } else if (isPaidSession(prior)) {
        const { fulfilCoachStoreCheckout, coachStoreSessionMeta } = await import('./webhook');
        const { verifyIdempotencyKey } = await import('@/lib/stripe/verify-checkout');
        const meta = coachStoreSessionMeta(prior) ?? { product: 'COACH_STORE', userId, rowId: existing.id, kind: manifest.kind, beneficiary };
        await fulfilCoachStoreCheckout(prior, meta, verifyIdempotencyKey(prior.id));
        return NextResponse.json({ error: 'already_owned' }, { status: 409 });
      }
    }
  }
  // Double-charge guards (./bundlePolicy). A single product (program/course/series) the buyer already owns via
  // another active/past-due listing (e.g. the bundle) is always 409 already_owned. The bundle, under the default
  // 'block_if_any_owned', is 409 already_owned when any member is already owned, and the response lists the
  // missing parts with their individual prices. Memberships are never blocked by these guards.
  if (manifest.kind === 'program' || manifest.kind === 'course' || manifest.kind === 'series') {
    const products = productsGrantedBy(manifest);
    if (products.length) {
      const owned = await ownedProductsFor(userId, beneficiary, listing.id);
      if (products.some((p) => owned.has(p))) {
        return NextResponse.json({ error: 'already_owned' }, { status: 409 });
      }
    }
  } else if (manifest.kind === 'bundle' && bundlePolicy.bundleOwnedPartsMode === 'block_if_any_owned') {
    const owned = await ownedProductsFor(userId, beneficiary, listing.id);
    const ownedParts = manifest.members.filter((m) => owned.has(m));
    if (ownedParts.length) {
      const missing = missingBundleParts(manifest.members, owned);
      const listingsByKey = await findPartListingsFor(missing.map((p) => p.key), listing.creatorId);
      return NextResponse.json(
        {
          error: 'already_owned',
          owned: ownedParts,
          missing: attachListingMatches(missing, listingsByKey),
          ownedParts: ownedBundleParts(ownedParts),
        },
        { status: 409 },
      );
    }
  }
  const row = existing
    ? await prisma.programAccess.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING', priceCents: listing.priceUsd, unlockCodeHash: unlock?.hash ?? existing.unlockCodeHash,
        codeActive: true, scope, lane, billing: manifest.kind === 'membership' ? 'month' : 'one_time',
      },
    })
    : await prisma.programAccess.create({
      data: {
        userId, instructorId, listingId: listing.id, lane, billing: manifest.kind === 'membership' ? 'month' : 'one_time',
        scope, beneficiary, status: 'PENDING', priceCents: listing.priceUsd,
        unlockCodeHash: unlock?.hash ?? null, codeActive: beneficiary === 'teen',
      },
    });

  const methods = paymentMethodsFor(manifest.kind === 'membership' ? 'subscription' : 'payment');
  const metaData = meta(userId, row.id, manifest.kind, beneficiary, referrerUserId);
  const session = await stripe.checkout.sessions.create({
    customer,
    client_reference_id: userId,
    mode: manifest.kind === 'membership' ? 'subscription' : 'payment',
    expires_at: checkoutExpiresAtUnix(now),
    ...(methods ? { payment_method_types: methods } : {}),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: listing.priceUsd,
        product_data: { name: listing.title },
        ...(manifest.kind === 'membership' ? { recurring: { interval: 'month' as const } } : {}),
      },
    }],
    // session_id lets /coach/thanks fulfil through POST /api/stripe/verify-session even
    // when no webhook is configured (SEC-F4 NO-WEBHOOK follow-up).
    success_url: `${origin}/coach/thanks?row=${row.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/coach/${instructor?.slug ?? 'elijahbonds'}`,
    metadata: metaData,
    ...(manifest.kind === 'membership' ? { subscription_data: { metadata: metaData } } : {}),
    // STORE-READY B5: a re-buy creates a NEW session, so the idempotency key must be new too — reusing the old
    // row's key is why a retry within 24 h 500'd (Stripe rejects a reused key with a different payload).
  }, { idempotencyKey: `coach-store:checkout:${row.id}:${now.getTime()}` });
  await prisma.programAccess.update({ where: { id: row.id }, data: { stripeCheckoutId: session.id } });
  await prisma.order.create({
    data: {
      userId, stripeSessionId: session.id, type: 'MARKETPLACE', amount: listing.priceUsd, status: 'PENDING',
      itemKey: itemKeyFor(manifest, instructor?.slug ?? 'coach'),
      metadata: { product: 'COACH_STORE', rowId: row.id },
    },
  }).catch(() => undefined);
  return NextResponse.json({
    url: session.url,
    rowId: row.id,
    ...(unlock ? { unlockCode: unlock.raw, progressNote: 'Your progress stays on this phone. A new code does not bring the old phone\'s progress with it.' } : {}),
  });
}

function meta(userId: string, rowId: string, kind: string, beneficiary: string, referrerUserId: string | null): Record<string, string> {
  return {
    product: 'COACH_STORE',
    userId,
    rowId,
    kind,
    beneficiary,
    ...(referrerUserId ? { referrerUserId } : {}),
  };
}
