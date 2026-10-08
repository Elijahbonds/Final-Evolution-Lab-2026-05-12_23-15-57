import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@/public/_prisma/client';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { isVerifiedAdult } from './adult';
import { isAllowlistedCoach } from './coaches';
import { iceServers } from './call/iceServers';
import { makingOfferCollision, signalExpiresAt, signalRole, signalRowCap, signalTooBig } from './call/limits';
import { programAccessOpen } from './access';
import { isMissingTable, logStoreUnavailable, reviewsCanBeSold, storeClosed } from './gate';
import { coachingIcs } from './ics';
import { parseManifest, priceOk } from './manifest';
import { connectionFailureReschedule, decideCancel, decideJoin } from './policy';
import { receiptText } from './receipt';
import { canDeliver, clipRejected, dueAt, goalOk, noteOk, originalDeleteAt, originalsDue, reviewOpening } from './reviews';
import { shareWithCoachAllowed } from './rescreen';
import { slotStillFree } from './slotCheck';
import { openSlots, type WeeklyWindow } from './slots';
import { isTestKey } from './stripeMode';
import { deleteOriginalObject, extForMime, originalObjectName, replyObjectName, signGetUrl, signPutUrl, UploadsComingSoon } from './storage';
import { hashSecret } from './teen';
import { addressRejected, blockedAddressTerms } from './address';
import { SCREEN_CONTACT_EMAIL } from '@/lib/screen/copy';
import { validateBlackoutDates, validateWeeklyHours } from './hours';

function unavailable(err: unknown): NextResponse | null {
  if (isMissingTable(err)) {
    logStoreUnavailable();
    return NextResponse.json({ error: 'coach_store_not_set_up', message: 'coach store not set up yet' }, { status: 503 });
  }
  if (err instanceof UploadsComingSoon) return NextResponse.json({ error: 'uploads_coming_soon', message: 'Uploads coming soon' }, { status: 503 });
  return null;
}

function windowsOf(value: unknown): WeeklyWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as { dow?: unknown; startMin?: unknown; endMin?: unknown };
    if (typeof r.dow !== 'number' || typeof r.startMin !== 'number' || typeof r.endMin !== 'number') return [];
    return [{ dow: r.dow, startMin: r.startMin, endMin: r.endMin }];
  });
}

export async function listSlots(slug: string, duration: number): Promise<NextResponse> {
  try {
    const instructor = await prisma.instructor.findUnique({ where: { slug } });
    if (!instructor || !instructor.published) return NextResponse.json({ slots: [] });
    const now = new Date();
    await prisma.booking.updateMany({ where: { status: 'HELD', holdExpiresAt: { lt: now } }, data: { status: 'EXPIRED', slotLock: null } });
    const busy = await prisma.booking.findMany({
      where: { instructorId: instructor.id, status: { in: ['HELD', 'PAID'] }, startsAt: { not: null } },
      select: { startsAt: true, endsAt: true },
    });
    const slots = openSlots({
      now,
      weekly: windowsOf(instructor.weeklyHours),
      blackouts: Array.isArray(instructor.blackoutDates) ? instructor.blackoutDates.filter((d): d is string => typeof d === 'string') : [],
      busy: busy.flatMap((b) => (b.startsAt && b.endsAt ? [{ startsAt: b.startsAt, endsAt: b.endsAt }] : [])),
      bufferMinutes: instructor.bufferMinutes,
      minNoticeHours: instructor.minNoticeHours,
      maxDaysAhead: instructor.maxDaysAhead,
      durations: duration === 60 ? [60] : [30],
    });
    return NextResponse.json({
      slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), durationMin: s.durationMin, label: s.label })),
      zone: 'America/Los_Angeles',
    });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function rowStatus(userId: string, rowId: string, origin = ''): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: rowId } });
    if (booking && (booking.clientUserId === userId || booking.coachUserId === userId)) {
      const ics = booking.status === 'PAID' && booking.kind === 'live_1on1' && booking.startsAt && booking.endsAt && origin
        ? icsFor(booking.id, booking.startsAt, booking.endsAt, origin)
        : null;
      return NextResponse.json({
        kind: booking.kind,
        status: booking.status,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        ics,
      });
    }
    const access = await prisma.programAccess.findUnique({ where: { id: rowId } });
    // STORE-READY B4: programOpen is server-computed so the thanks page links "Open your program" only for an
    // open row (ACTIVE/PAST_DUE and not past accessUntil) — never for an unpaid/expired/refunded one.
    if (access && access.userId === userId) {
      return NextResponse.json({ kind: 'access', status: access.status, programOpen: programAccessOpen(access, new Date()) });
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function joinCall(userId: string, bookingId: string): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const decision = decideJoin({
      isParty: userId === booking.clientUserId || userId === booking.coachUserId,
      isAdult: await isVerifiedAdult(prisma, userId),
      status: booking.status,
      kind: booking.kind,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      now: new Date(),
    });
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
    const role = signalRole(userId === booking.coachUserId);
    return NextResponse.json({
      role,
      polite: role === 'client',
      iceServers: iceServers(),
      collision: makingOfferCollision(role === 'client', true),
      recorded: false,
    });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function postSignal(userId: string, bookingId: string, body: { kind?: unknown; payload?: unknown; epoch?: unknown }): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || (userId !== booking.clientUserId && userId !== booking.coachUserId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const payload = typeof body.payload === 'string' ? body.payload : '';
    const kind = typeof body.kind === 'string' ? body.kind : '';
    if (!kind || signalTooBig(payload)) return NextResponse.json({ error: 'payload_too_big' }, { status: 413 });
    const count = await prisma.callSignal.count({ where: { bookingId } });
    if (signalRowCap(count)) return NextResponse.json({ error: 'too_many_signals' }, { status: 429 });
    const now = new Date();
    await prisma.callSignal.create({
      data: {
        bookingId,
        fromRole: signalRole(userId === booking.coachUserId),
        epoch: typeof body.epoch === 'number' ? body.epoch : 0,
        kind,
        payload,
        expiresAt: signalExpiresAt(now),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function readSignals(userId: string, bookingId: string, after: number): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || (userId !== booking.clientUserId && userId !== booking.coachUserId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const now = new Date();
    await prisma.callSignal.deleteMany({ where: { expiresAt: { lt: now } } });
    const rows = await prisma.callSignal.findMany({ where: { bookingId, id: { gt: after } }, orderBy: { id: 'asc' }, take: 50 });
    return NextResponse.json({ signals: rows.map((r) => ({ id: r.id, fromRole: r.fromRole, kind: r.kind, payload: r.payload, epoch: r.epoch })) });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

function pathsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function uploadUrl(userId: string, bookingId: string, body: { bytes?: unknown; mime?: unknown; seconds?: unknown; role?: unknown }): Promise<NextResponse> {
  try {
    if (!reviewsCanBeSold()) return NextResponse.json({ error: 'uploads_coming_soon', message: 'Uploads coming soon' }, { status: 503 });
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    const reply = body.role === 'reply';
    const allowed = booking && booking.kind === 'video_review' && booking.status === 'PAID'
      && (reply ? booking.coachUserId === userId && isAllowlistedCoach(userId) : booking.clientUserId === userId);
    if (!booking || !allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await isVerifiedAdult(prisma, userId))) return NextResponse.json({ error: 'adults_only' }, { status: 403 });
    const mime = typeof body.mime === 'string' ? body.mime : '';
    const bytes = typeof body.bytes === 'number' ? body.bytes : 0;
    const seconds = typeof body.seconds === 'number' ? body.seconds : 0;
    const why = clipRejected({ seconds, bytes, mime }, reply ? 0 : pathsOf(booking.clipPaths).length, { skipDuration: reply });
    if (why) return NextResponse.json({ error: 'clip_rejected', message: why }, { status: 400 });
    const ext = extForMime(mime);
    if (!ext) return NextResponse.json({ error: 'clip_rejected' }, { status: 400 });
    const fileId = randomBytes(8).toString('hex');
    const objectName = reply ? replyObjectName(bookingId, fileId, ext) : originalObjectName(bookingId, fileId, ext);
    const signed = await signPutUrl({ objectName, contentType: mime, bytes });
    return NextResponse.json({ url: signed.url, headers: signed.headers, objectName });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function submitReview(userId: string, bookingId: string, body: { clips?: unknown; goal?: unknown; painYes?: unknown; note?: unknown }): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.clientUserId !== userId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const clips = Array.isArray(body.clips) ? body.clips.filter((v): v is string => typeof v === 'string') : [];
    if (clips.length < 1 || clips.length > 3) return NextResponse.json({ error: 'clips' }, { status: 400 });
    for (const clip of clips) if (!clip.startsWith(`coach-reviews/originals/${bookingId}/`)) return NextResponse.json({ error: 'clips' }, { status: 400 });
    const goal = typeof body.goal === 'string' ? body.goal : '';
    if (!goalOk(goal)) return NextResponse.json({ error: 'goal_required' }, { status: 400 });
    if (typeof body.painYes !== 'boolean') return NextResponse.json({ error: 'pain_required' }, { status: 400 });
    const note = typeof body.note === 'string' ? body.note : '';
    if (!noteOk(note)) return NextResponse.json({ error: 'note_too_long' }, { status: 400 });
    const instructor = await prisma.instructor.findUnique({ where: { id: booking.instructorId } });
    const now = new Date();
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        clipPaths: clips,
        goal,
        painYes: body.painYes,
        reviewNote: note,
        submittedAt: now,
        dueAt: dueAt(now, instructor?.reviewSlaHours),
        clipConsentAt: now,
        consentTextVersion: 'v1',
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function deliverReview(userId: string, bookingId: string, body: { replyText?: unknown; drills?: unknown; replyObject?: unknown }): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.coachUserId !== userId || !isAllowlistedCoach(userId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const drills = Array.isArray(body.drills) ? body.drills.filter((v): v is string => typeof v === 'string') : [];
    const replyObject = typeof body.replyObject === 'string' ? body.replyObject : '';
    if (!canDeliver({ hasRecording: replyObject.startsWith(`coach-reviews/replies/${bookingId}/`), drillCount: drills.length })) {
      return NextResponse.json({ error: 'needs_recording_and_drill' }, { status: 400 });
    }
    const text = reviewOpening(Boolean(booking.painYes), typeof body.replyText === 'string' ? body.replyText : '');
    const now = new Date();
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        replyText: text,
        replyClipPath: replyObject,
        attachedDrillIds: drills,
        deliveredAt: now,
        originalClipDeleteAt: originalDeleteAt(now),
      },
    });
    return NextResponse.json({ ok: true, replyText: text });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function clipUrl(userId: string, bookingId: string, which: 'original' | 'reply'): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || (userId !== booking.clientUserId && userId !== booking.coachUserId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const name = which === 'reply' ? booking.replyClipPath : pathsOf(booking.clipPaths)[0];
    if (!name) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const url = await signGetUrl(name);
    return NextResponse.json({ url });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function cancelBooking(userId: string, bookingId: string): Promise<NextResponse> {
  return moveBooking(userId, bookingId, 'cancel', null);
}

export async function rescheduleBooking(userId: string, bookingId: string, startsAtRaw: unknown, fromFailure: boolean): Promise<NextResponse> {
  return moveBooking(userId, bookingId, 'reschedule', typeof startsAtRaw === 'string' ? startsAtRaw : null, fromFailure);
}

async function moveBooking(userId: string, bookingId: string, mode: 'cancel' | 'reschedule', startsAtRaw: string | null, fromFailure = false): Promise<NextResponse> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.clientUserId !== userId || booking.status !== 'PAID' || !booking.startsAt) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const instructor = await prisma.instructor.findUnique({ where: { id: booking.instructorId } });
    if (!instructor) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (fromFailure) {
      connectionFailureReschedule();
      console.warn('[coach-store] connection failed');
      await prisma.booking.update({
        where: { id: bookingId },
        data: { kind: 'video_review', slotLock: null, connectionFailedAt: new Date(), failureCreditOpen: true },
      });
      return NextResponse.json({ ok: true, switched: 'video_review' });
    }
    const decision = decideCancel({
      clientFullRefundHours: instructor.clientFullRefundHours,
      reschedulesUsed: booking.reschedulesUsed,
      startsAt: booking.startsAt,
      now: new Date(),
    }, mode);
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 });
    if (mode === 'cancel') {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: decision.refund ? 'REFUND_DUE' : 'CANCELLED', slotLock: null, cancelledAt: new Date(), cancelledBy: 'client' },
      });
      return NextResponse.json({ ok: true, refund: decision.refund });
    }
    const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime()) || !booking.durationMin) return NextResponse.json({ error: 'slot_required' }, { status: 400 });
    // STORE-READY B7 (F3): reschedule goes through the SAME slot check as booking — after decideCancel, never
    // writing an unchecked startsAt. A taken / off-hours / past / blackout slot is a 409 and nothing is written;
    // the unique slotLock CAS catches a same-instant race as 409 too.
    const free = await slotStillFree({
      instructor, startsAt, durationMin: booking.durationMin, excludeBookingId: booking.id, now: new Date(),
    });
    if (!free) return NextResponse.json({ error: 'slot_unavailable' }, { status: 409 });
    try {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          startsAt,
          endsAt: new Date(startsAt.getTime() + booking.durationMin * 60_000),
          slotLock: `${instructor.id}:${startsAt.toISOString()}`,
          reschedulesUsed: decision.consumesReschedule ? booking.reschedulesUsed + 1 : booking.reschedulesUsed,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: 'slot_unavailable' }, { status: 409 });
      }
      throw err;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function connectionFailed(userId: string, bookingId: string, toReview: boolean): Promise<NextResponse> {
  if (toReview) return moveBooking(userId, bookingId, 'reschedule', null, true);
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || (userId !== booking.clientUserId && userId !== booking.coachUserId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    console.warn('[coach-store] connection failed');
    await prisma.booking.update({ where: { id: bookingId }, data: { connectionFailedAt: new Date() } });
    return NextResponse.json({ ok: true, reschedule: 'free' });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function redeemUnlock(code: string, deviceToken: string): Promise<NextResponse> {
  try {
    if (!code || !deviceToken) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const hash = hashSecret(code);
    const access = await prisma.programAccess.findUnique({ where: { unlockCodeHash: hash } });
    if (!access || !access.codeActive || access.beneficiary !== 'teen' || !['ACTIVE', 'PAST_DUE'].includes(access.status)) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 404 });
    }
    if (access.accessUntil && access.accessUntil.getTime() < Date.now()) {
      return NextResponse.json({ error: 'inactive' }, { status: 403 });
    }
    const device = hashSecret(deviceToken);
    if (access.deviceTokenHash && access.deviceTokenHash !== device) {
      return NextResponse.json({ error: 'other_device', message: 'This code is on another phone. Ask the buyer for a new code. Progress on the old phone stays there.' }, { status: 409 });
    }
    if (!access.deviceTokenHash) {
      await prisma.programAccess.update({ where: { id: access.id }, data: { deviceTokenHash: device, redeemedAt: new Date() } });
    }
    return NextResponse.json({ ok: true, accessId: access.id, accessUntil: access.accessUntil, lane: access.lane });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function unlockStatus(code: string, deviceToken: string): Promise<NextResponse> {
  try {
    const access = await prisma.programAccess.findUnique({ where: { unlockCodeHash: hashSecret(code) } });
    const device = hashSecret(deviceToken);
    if (!access || access.deviceTokenHash !== device) return NextResponse.json({ active: false });
    const active = access.codeActive && ['ACTIVE', 'PAST_DUE'].includes(access.status) && (!access.accessUntil || access.accessUntil.getTime() > Date.now());
    return NextResponse.json({ active, accessUntil: access.accessUntil });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function reissueCode(userId: string, accessId: string): Promise<NextResponse> {
  try {
    if (!(await isVerifiedAdult(prisma, userId))) return NextResponse.json({ error: 'adults_only' }, { status: 403 });
    const access = await prisma.programAccess.findUnique({ where: { id: accessId } });
    if (!access || access.userId !== userId || access.beneficiary !== 'teen') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const { newUnlockCode } = await import('./teen');
    const next = newUnlockCode();
    await prisma.programAccess.update({
      where: { id: accessId },
      data: { unlockCodeHash: next.hash, deviceTokenHash: null, redeemedAt: null, reissueCount: { increment: 1 } },
    });
    return NextResponse.json({
      unlockCode: next.raw,
      message: 'Progress does not transfer. The old phone keeps what it had, and the new phone starts over.',
    });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function cancelMembership(userId: string, accessId: string): Promise<NextResponse> {
  try {
    const access = await prisma.programAccess.findUnique({ where: { id: accessId } });
    if (!access || access.userId !== userId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await prisma.programAccess.update({ where: { id: accessId }, data: { cancelAtPeriodEnd: true } });
    const key = process.env.STRIPE_SECRET_KEY;
    if (access.stripeSubscriptionId && key && isTestKey(key)) {
      try {
        await getStripe().subscriptions.update(access.stripeSubscriptionId, { cancel_at_period_end: true });
      } catch (err) {
        console.warn('[coach-store] local cancel stands');
        void err;
      }
    }
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: true });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function receiptFor(userId: string, rowId: string): Promise<NextResponse> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const booking = await prisma.booking.findUnique({ where: { id: rowId } });
    const access = booking ? null : await prisma.programAccess.findUnique({ where: { id: rowId } });
    const owner = booking?.clientUserId === userId || access?.userId === userId;
    if (!owner) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // STORE-READY B4: a receipt exists only for a PAID booking or an ACTIVE / PAST_DUE / CANCELED access row —
    // a PENDING (unpaid), EXPIRED, REFUNDED or PAUSED row has no paid receipt to issue.
    const receiptOk = booking ? booking.status === 'PAID' : ['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(access!.status);
    if (!receiptOk) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const instructorId = booking?.instructorId ?? access?.instructorId;
    const instructor = instructorId ? await prisma.instructor.findUnique({ where: { id: instructorId } }) : null;
    const text = receiptText({
      rowId,
      title: booking ? booking.kind : 'Program',
      priceCents: booking?.priceCents ?? access?.priceCents ?? 0,
      paidAt: booking?.updatedAt ?? access?.updatedAt ?? new Date(),
      buyerEmail: user?.email ?? '',
      businessMailingAddress: instructor?.businessMailingAddress ?? null,
      testMode: isTestKey(process.env.STRIPE_SECRET_KEY),
    });
    return new NextResponse(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function sweepOriginals(): Promise<{ deleted: number }> {
  const now = new Date();
  const rows = await prisma.booking.findMany({
    where: { originalClipDeleteAt: { lte: now }, originalsDeletedAt: null },
    select: { id: true, clipPaths: true, replyClipPath: true, originalClipDeleteAt: true, originalsDeletedAt: true },
  });
  const due = originalsDue(rows.map((r) => ({
    id: r.id,
    clipPaths: pathsOf(r.clipPaths),
    replyClipPath: r.replyClipPath,
    originalClipDeleteAt: r.originalClipDeleteAt,
    originalsDeletedAt: r.originalsDeletedAt,
  })), now);
  let deleted = 0;
  for (const row of due) {
    let ok = true;
    for (const path of row.paths) {
      try {
        await deleteOriginalObject(path);
      } catch {
        ok = false;
      }
    }
    if (!ok) continue;
    await prisma.booking.update({ where: { id: row.id }, data: { originalsDeletedAt: now, clipPaths: [] } });
    deleted += 1;
  }
  console.warn(`[coach-store] originals sweep deleted ${deleted}`);
  return { deleted };
}

export function icsFor(bookingId: string, startsAt: Date, endsAt: Date, origin: string): string {
  return coachingIcs({ bookingId, startsAt, endsAt, url: `${origin}/session/${bookingId}` });
}

export async function saveCoachSettings(userId: string, body: Record<string, unknown>): Promise<NextResponse> {
  if (!isAllowlistedCoach(userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const data: {
    businessMailingAddress?: string | null;
    reviewSlaHours?: number;
    clientFullRefundHours?: number;
    refundBusinessDays?: number | null;
    weeklyHours?: Prisma.InputJsonValue;
    blackoutDates?: Prisma.InputJsonValue;
  } = {};
  if (typeof body.businessMailingAddress === 'string') {
    const why = addressRejected(body.businessMailingAddress, blockedAddressTerms());
    if (why) return NextResponse.json({ error: why }, { status: 400 });
    data.businessMailingAddress = body.businessMailingAddress.trim();
  }
  if (typeof body.reviewSlaHours === 'number') data.reviewSlaHours = body.reviewSlaHours;
  if (typeof body.clientFullRefundHours === 'number') data.clientFullRefundHours = body.clientFullRefundHours;
  if (body.refundBusinessDays === null) data.refundBusinessDays = null;
  if (typeof body.refundBusinessDays === 'number') data.refundBusinessDays = body.refundBusinessDays;

  const touchesHours = body.weeklyHours !== undefined || body.blackoutDates !== undefined;
  if (body.weeklyHours !== undefined) {
    const result = validateWeeklyHours(body.weeklyHours);
    if (!result.ok) return NextResponse.json({ error: result.error, detail: result.detail }, { status: 400 });
    data.weeklyHours = result.value as unknown as Prisma.InputJsonValue;
  }
  if (body.blackoutDates !== undefined) {
    const result = validateBlackoutDates(body.blackoutDates, new Date());
    if (!result.ok) return NextResponse.json({ error: result.error, detail: result.detail }, { status: 400 });
    data.blackoutDates = result.value as unknown as Prisma.InputJsonValue;
  }

  try {
    if (touchesHours) {
      const instructor = await prisma.instructor.findUnique({ where: { userId } });
      if (!instructor) return NextResponse.json({ error: 'coach_profile_missing' }, { status: 409 });
    }
    await prisma.instructor.updateMany({ where: { userId }, data });
    return NextResponse.json({ ok: true, contact: SCREEN_CONTACT_EMAIL });
  } catch (err) {
    const gone = unavailable(err);
    if (gone) return gone;
    throw err;
  }
}

export async function setListingPrice(userId: string, listingId: string, priceCents: number): Promise<NextResponse> {
  if (!isAllowlistedCoach(userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!priceOk(priceCents)) return NextResponse.json({ error: 'price_bounds' }, { status: 400 });
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.creatorId !== userId || listing.listingType !== 'COACH_STORE') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!parseManifest(listing.manifest)) return NextResponse.json({ error: 'bad_manifest' }, { status: 400 });
  await prisma.marketplaceListing.update({ where: { id: listingId }, data: { priceUsd: priceCents, active: true } });
  return NextResponse.json({ ok: true });
}

export { shareWithCoachAllowed };
