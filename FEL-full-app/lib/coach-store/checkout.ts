import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';
import { isVerifiedAdult } from './adult';
import { isAllowlistedCoach } from './coaches';
import { isMissingTable, logStoreUnavailable, reviewsCanBeSold } from './gate';
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
    return NextResponse.json({ error: 'payments_not_set_up', message: 'payments not set up' }, { status: 503 });
  }
  const gate = stripeTestGate();
  if (!gate.ok) return NextResponse.json({ error: gate.error, message: gate.message }, { status: gate.status });
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
  const who = raw === 'teen' ? 'teen' : raw === 'self' || raw === undefined ? 'self' : null;
  return who;
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
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: listing.priceUsd,
          product_data: { name: listing.title },
        },
      }],
      success_url: `${origin}/coach/thanks?row=${booking.id}`,
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
  manifest: Extract<CoachManifest, { kind: 'program' | 'membership' }>,
  beneficiary: 'self' | 'teen',
  origin: string,
  customer: string,
  referrerUserId: string | null,
  now: Date,
  stripe: Stripe,
): Promise<NextResponse> {
  const instructor = await prisma.instructor.findUnique({ where: { id: instructorId }, select: { slug: true, userId: true } });
  const scope = manifest.kind === 'membership' ? (manifest.audience === 'teen' ? 'teen_all' : 'all') : 'lane';
  const lane = manifest.kind === 'program' ? manifest.lane : manifest.audience;
  const unlock = beneficiary === 'teen' ? newUnlockCode() : null;
  const existing = await prisma.programAccess.findUnique({
    where: { userId_listingId_beneficiary: { userId, listingId: listing.id, beneficiary } },
  });
  if (existing && (existing.status === 'ACTIVE' || existing.status === 'PAST_DUE')) {
    return NextResponse.json({ error: 'already_owned' }, { status: 409 });
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
    success_url: `${origin}/coach/thanks?row=${row.id}`,
    cancel_url: `${origin}/coach/${instructor?.slug ?? 'elijah'}`,
    metadata: metaData,
    ...(manifest.kind === 'membership' ? { subscription_data: { metadata: metaData } } : {}),
  }, { idempotencyKey: `coach-store:checkout:${row.id}` });
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
