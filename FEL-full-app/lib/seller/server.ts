// lib/seller/server.ts — SELLER-18-1 (S-2): the seller gate over the real database, Stripe and the teacher role.
// Every seller route, page, publish action and payout action asks here (directly, or through
// lib/coach-store/gate.ts isStoreCoach). The rule itself is lib/seller/canSell.ts.
//
// v2: everything below the role check waits on SELLER_ADULT_GATE_ENABLED (lib/flags.ts, default off). Off, each surface
// answers exactly as it does without this gate: no birth-year read, no takedown, no review record.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { isSellerAdultGateEnabled } from '@/lib/flags';
import type { GateDb } from '@/lib/privacy/scanSaveGate';
import { isStoreCoachWith } from '@/lib/teach/role';
import { teacherRoleDeps } from '@/lib/teach/server';
import { SELLER_AGE_MESSAGES, sellerRefusal, type SellerRefusal, type SellerRole } from './canSell';
import { PAYOUT_HOLD_META, reviewRef, takeDownMinorSeller, type PayoutFreeze, type PriorHold, type TakedownDeps } from './takedown';

/**
 * v2 (Cyber F6): the durable review record's name. An existing table (AnalyticsEvent: name, userId, props, createdAt) holds
 * it, so there is no schema change. A row = one takedown that needs a person: props carry the counts, the payout state
 * and the one-way ref; never the email or the birth year. Read the queue with
 *   SELECT "userId", "props", "createdAt" FROM "AnalyticsEvent" WHERE "name" = 'seller_age_review' ORDER BY "createdAt" DESC;
 * The newest row per account is also the "already held" marker the takedown checks first (lib/seller/takedown.ts).
 */
export const SELLER_REVIEW_EVENT = 'seller_age_review';

const PAYOUT_STATES: readonly PayoutFreeze[] = ['frozen', 'no_account', 'failed'];

/** The takedown over the real database and Stripe (lib/seller/takedown.ts says what each step does). */
export function liveTakedownDeps(): TakedownDeps {
  return {
    async unpublishCoachPage(userId) {
      const r = await prisma.instructor.updateMany({ where: { userId, published: true }, data: { published: false } });
      return r.count;
    },
    async deactivateListings(userId) {
      const r = await prisma.marketplaceListing.updateMany({ where: { creatorId: userId, active: true }, data: { active: false } });
      return r.count;
    },
    async freezePayouts(userId): Promise<PayoutFreeze> {
      // Loaded here, not at the top: the store gate is imported by many pages that never reach a takedown.
      const { connectFor } = await import('@/lib/coach-business/store');
      const row = await connectFor(prisma as never, userId);
      if (!row) return 'no_account';
      const { getStripe } = await import('@/lib/stripe');
      await getStripe().accounts.update(row.stripeAccountId, {
        settings: { payouts: { schedule: { interval: 'manual' } } },
        metadata: { ...PAYOUT_HOLD_META },
      });
      return 'frozen';
    },
    // v2 (F6): only when the review record could not be stored.
    log: (line) => console.warn(line),
    async priorHold(userId): Promise<PriorHold | null> {
      const row = await prisma.analyticsEvent.findFirst({
        where: { name: SELLER_REVIEW_EVENT, userId },
        orderBy: { createdAt: 'desc' },
        select: { props: true },
      });
      if (!row) return null;
      const payouts = (row.props as { payouts?: unknown } | null)?.payouts;
      return { payouts: PAYOUT_STATES.includes(payouts as PayoutFreeze) ? (payouts as PayoutFreeze) : 'failed' };
    },
    async liveCount(userId) {
      const [pages, listings] = await Promise.all([
        prisma.instructor.count({ where: { userId, published: true } }),
        prisma.marketplaceListing.count({ where: { creatorId: userId, active: true } }),
      ]);
      return pages + listings;
    },
    async recordReview(userId, r) {
      const now = new Date();
      await prisma.analyticsEvent.create({
        data: {
          name: SELLER_REVIEW_EVENT,
          userId,
          props: { status: 'open', ref: reviewRef(userId), coachPages: r.coachPages, listings: r.listings, payouts: r.payouts },
          ts: now,
        },
      });
      return true;
    },
  };
}

/** True when a raw-SQL read of a pending coach-business table finds a row. A missing table or a failed read is no. */
async function anyRow(sql: string, userId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(sql, userId).catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

const SELLER_ROW_SQL = {
  connect: 'SELECT 1 AS "ok" FROM "CoachConnectAccount" WHERE "userId" = $1 LIMIT 1',
  marketProfile: 'SELECT 1 AS "ok" FROM "CoachMarketProfile" WHERE "userId" = $1 LIMIT 1',
  pkg: 'SELECT 1 AS "ok" FROM "CoachPackage" WHERE "coachId" = $1 LIMIT 1',
} as const;

const countOrZero = (p: Promise<number>) => p.catch(() => 0);

/**
 * v2 (Cyber F1): does this account really sell on this surface? Only then can an under-18 finding take anything down.
 *   coach_business: a Connect account, a market profile or a package.
 *   studio:         an active CARTRIDGE listing.
 *   coach_store:    a coach page (Instructor row), a Connect account, or an active store (non-cartridge) listing.
 *   group_booking:  a Connect account (the payout the takedown freezes).
 * Each read on its own; a failed read is no.
 */
export function sellerRowsFor(role: SellerRole): (userId: string) => Promise<boolean> {
  return async (userId) => {
    if (role === 'studio') {
      return (await countOrZero(prisma.marketplaceListing.count({ where: { creatorId: userId, active: true, listingType: 'CARTRIDGE' } }))) > 0;
    }
    if (await anyRow(SELLER_ROW_SQL.connect, userId)) return true;
    if (role === 'coach_business') return (await anyRow(SELLER_ROW_SQL.marketProfile, userId)) || (await anyRow(SELLER_ROW_SQL.pkg, userId));
    if (role === 'coach_store') {
      if ((await countOrZero(prisma.instructor.count({ where: { userId } }))) > 0) return true;
      return (await countOrZero(prisma.marketplaceListing.count({ where: { creatorId: userId, active: true, listingType: { not: 'CARTRIDGE' } } }))) > 0;
    }
    return false;
  };
}

/**
 * The role check for each kind of selling. The coach business and Studio check their own role before asking, so the
 * AGE refusal applies to everyone who reaches them; whether anything is taken down is sellerRowsFor (v2, F1).
 */
function roleFor(role: SellerRole): (userId: string) => Promise<boolean> {
  if (role === 'coach_store') return (userId) => isStoreCoachWith(userId, teacherRoleDeps());
  if (role === 'group_booking') {
    return async (userId) => {
      // Loaded here, not at the top: group booking is a large module and most seller callers never need it.
      const { isGroupCoach } = await import('@/lib/group-booking/server');
      return isGroupCoach(prisma as never, userId);
    };
  }
  return async () => true;
}

/** null when this account may sell on this surface; otherwise why not. Never rejects. */
export function canSell(userId: string | null | undefined, role: SellerRole): Promise<SellerRefusal | null> {
  return sellerRefusal(userId, {
    db: prisma as unknown as GateDb,
    hasRole: roleFor(role),
    isAdult: isVerifiedAdult,
    gateOn: isSellerAdultGateEnabled(),
    holdsSellerRows: sellerRowsFor(role),
    onMinorSeller: (id) => takeDownMinorSeller(id, liveTakedownDeps()),
  });
}

/** The answer a refused seller gets: 404 for someone without the role, 403 adults_only with a reason otherwise. */
export function refuseSeller(reason: SellerRefusal): NextResponse {
  if (reason === 'not_a_seller') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ error: 'adults_only', reason, message: SELLER_AGE_MESSAGES[reason] }, { status: 403 });
}

/** null for a verified adult seller; otherwise the response to return. */
export async function sellerGate(userId: string | null | undefined, role: SellerRole): Promise<NextResponse | null> {
  const reason = await canSell(userId, role);
  return reason ? refuseSeller(reason) : null;
}

/**
 * v2: the age refusal only, for a surface that keeps its own answer for non-sellers (group booking: the board answers
 * "not a coach" itself). Setting off: null with no read at all. On: 403 under_18 / age_unknown, else null.
 */
export async function sellerAgeGate(userId: string | null | undefined, role: SellerRole): Promise<NextResponse | null> {
  if (!isSellerAdultGateEnabled()) return null;
  const reason = await canSell(userId, role);
  return reason && reason !== 'not_a_seller' ? refuseSeller(reason) : null;
}

/**
 * v2 (PM 2026-11-09): should this seller be asked for their birth year? True when the account holds the role and has no
 * birth year on file — with the setting off or on. A failed read is no (nothing is shown).
 */
export async function sellerNeedsBirthYear(userId: string | null | undefined, role: SellerRole): Promise<boolean> {
  if (typeof userId !== 'string' || !userId) return false;
  if (!(await roleFor(role)(userId).catch(() => false))) return false;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => undefined);
  return row !== undefined && row !== null && row.dobYear == null;
}
