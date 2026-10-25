// lib/coach-business/server.ts — COACH-BUSINESS: what every coach-business route shares — who is asking, whether the
// tables are there, the ledger poster the webhook uses, and the Stripe client behind the Connect fence.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { postTransaction } from '@/lib/ledger';
import { getStripe } from '@/lib/stripe';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import type { ConnectStripe } from './connect';
import { businessReady, marketProfile, type RawDb, type TxDb } from './store';
import { ensureStripeCustomer } from '@/lib/stripe/product-checkout';
import { readCoachPlan } from './planServer';
import type { ConnectDeps } from './webhook';
import type { PlanDb } from './planServer';

export async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as { id?: string } | undefined)?.id) ?? null;
}

export const rawDb = (): TxDb => prisma as unknown as TxDb;
export const planDb = (): PlanDb => prisma as unknown as PlanDb;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function bad(error: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

/** 503 until prisma/pending/2026-10-25-coach-business.sql is applied. */
export async function notReady(db: RawDb = rawDb()): Promise<NextResponse | null> {
  if (await businessReady(db)) return null;
  return bad('coach_business_not_ready', 503, { message: 'Coach business is not set up yet.' });
}

/**
 * Verified adult: User.dobYear read from the database, the strict rule (lib/privacy/healthWriteGate.ts — the same check the
 * coach store uses for buyers). Unknown age is not an adult. Coaches, applicants, buyers and highlight approvals all ask.
 */
export function isVerifiedAdultUser(userId: string): Promise<boolean> {
  return canWriteHealthData(prisma as never, userId);
}

/** The Stripe SDK as the narrow Connect surface. Only ever called after connectGate() said ok. */
export function connectStripe(): ConnectStripe {
  return getStripe() as unknown as ConnectStripe;
}

/** The webhook's dependencies against the real database and ledger. */
export function prismaConnectDeps(): ConnectDeps {
  return {
    db: prisma as unknown as RawDb,
    async post(tx) {
      await postTransaction(prisma, {
        kind: tx.kind,
        idempotencyKey: tx.idempotencyKey,
        currency: 'USD_CENTS',
        enforceNonNegative: false,
        metadata: tx.metadata,
        postings: tx.postings.map((p) => ({ account: { type: p.type, currency: 'USD_CENTS' as const }, amount: p.amount })),
      });
    },
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return undefined; }
}

/** The real dependencies of the checkout, refund and apply services (service.ts). */
export function liveDeps() {
  const db = rawDb();
  return {
    db,
    env: process.env,
    now: new Date(),
    stripe: connectStripe,
    isAdult: isVerifiedAdultUser,
    plan: (coachId: string) => readCoachPlan(planDb(), coachId),
    ensureCustomer: (buyerId: string) => ensureStripeCustomer(getStripe(), buyerId),
    async coachSlug(coachId: string) {
      const i = await prisma.instructor.findUnique({ where: { userId: coachId }, select: { slug: true, published: true } });
      return i?.published ? i.slug : null;
    },
    async coachBySlug(slug: string) {
      const i = await prisma.instructor.findUnique({ where: { slug }, select: { userId: true, published: true } });
      if (!i?.published || !(await businessReady(db))) return null;
      const m = await marketProfile(db, i.userId);
      return { userId: i.userId, acceptingClients: m ? !!m.acceptingClients : true };
    },
    ledger: prismaConnectDeps(),
  };
}
