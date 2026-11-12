// lib/coach-business/store.ts — COACH-BUSINESS: the coach business's rows, in raw SQL behind a probe.
//
// THE TABLES ARE NOT ON PRODUCTION YET: they arrive with prisma/pending/2026-10-25-coach-business.sql, which the owner
// applies. prisma/schema.prisma and the generated clients are untouched, so nothing here can use the Prisma model API.
// Until the SQL is applied (and in CI) `businessReady()` answers false and every caller shows its "not set up yet" state:
// the public page still renders the coach-store listings it has today, /coaches lists nobody, and every write answers 503
// coach_business_not_ready. The probe is the shared one (lib/coach/pendingSchema.ts): applying the SQL switches the
// feature on within minutes, with no deploy.
//
// Every statement is parameterised ($1 …); nothing from a request is ever put into SQL text. Ids are made here.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import type { CoachPackage, PackageInput, PackageKind } from './packages';
import type { HighlightRow } from './profile';
import type { MarketGoal, Sport } from './market';

export type { RawDb };

/** A RawDb that can also run a transaction (Prisma's interactive $transaction, or a test stand-in). */
export interface TxDb extends RawDb {
  $transaction<T>(fn: (tx: RawDb) => Promise<T>): Promise<T>;
}

// the file creates CoachApplication last, so its presence means every table is there
const probe = pendingProbe('coach_business', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachApplication' LIMIT 1`);

export function businessReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}
/** A statement failed: log it, and when the error says a table is missing, read "not ready" until the next probe. */
export function businessFailed(event: string, e: unknown): void {
  probe.fail(event, e);
}
/** Tests only. */
export function resetBusinessProbe(): void {
  probe.reset();
  paymentsReadyProbe.reset();
}

// PAYMENTS-READY (prisma/pending/2026-10-26-payments-ready.sql, after the coach-business file): CoachConnectAccount.
// requirementsDue and CoachSaleDispute. The file creates CoachSaleDispute last but for its foreign key, so its presence
// means the column is there too. Until it is applied, account.updated keeps the three status flags only and a dispute is
// booked in the ledger without a row.
const paymentsReadyProbe = pendingProbe('payments_ready', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachSaleDispute' LIMIT 1`);

export function paymentsReadySchema(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return paymentsReadyProbe.ready(db, now);
}
export function paymentsReadyFailed(event: string, e: unknown): void {
  paymentsReadyProbe.fail(event, e);
}

/** The statuses that hold a capacity spot (a partial refund is a goodwill credit, not a cancellation). A PENDING sale
 *  holds one only until its holdExpiresAt; EXPIRED, CANCELED and REFUNDED free it. */
export const HOLDING_STATUSES = ['PAID', 'ACTIVE', 'PARTIALLY_REFUNDED'] as const;
export type SaleStatus = 'PENDING' | 'PAID' | 'ACTIVE' | 'EXPIRED' | 'CANCELED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

/** Every statement, named, so a test's stand-in database answers each one by name. */
export const SQL = {
  // market profile
  marketProfile: `SELECT "userId", "listed", "acceptingClients", "sports", "goals" FROM "CoachMarketProfile" WHERE "userId" = $1`,
  upsertMarketProfile:
    `INSERT INTO "CoachMarketProfile" ("userId", "listed", "acceptingClients", "sports", "goals", "updatedAt") VALUES ($1, $2, $3, $4::text[], $5::text[], NOW()) ` +
    `ON CONFLICT ("userId") DO UPDATE SET "listed" = EXCLUDED."listed", "acceptingClients" = EXCLUDED."acceptingClients", "sports" = EXCLUDED."sports", "goals" = EXCLUDED."goals", "updatedAt" = NOW()`,
  listedCoaches:
    `SELECT i."userId", i."slug", i."displayName", i."headline", i."specialties", m."sports", m."goals", m."acceptingClients" ` +
    `FROM "Instructor" i JOIN "CoachMarketProfile" m ON m."userId" = i."userId" WHERE i."published" = true AND m."listed" = true ORDER BY i."displayName" ASC LIMIT 200`,
  // packages
  packagesFor: `SELECT "id", "coachId", "kind", "title", "summary", "priceCents", "includes", "capacity", "sessions", "active", "sortOrder" FROM "CoachPackage" WHERE "coachId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC`,
  activePackagesFor: `SELECT "id", "coachId", "kind", "title", "summary", "priceCents", "includes", "capacity", "sessions", "active", "sortOrder" FROM "CoachPackage" WHERE "coachId" = ANY($1::text[]) AND "active" = true ORDER BY "sortOrder" ASC, "createdAt" ASC`,
  packageById: `SELECT "id", "coachId", "kind", "title", "summary", "priceCents", "includes", "capacity", "sessions", "active", "sortOrder" FROM "CoachPackage" WHERE "id" = $1`,
  countPackages: `SELECT COUNT(*)::int AS "n" FROM "CoachPackage" WHERE "coachId" = $1`,
  insertPackage:
    `INSERT INTO "CoachPackage" ("id", "coachId", "kind", "title", "summary", "priceCents", "includes", "capacity", "sessions", "active", "sortOrder", "createdAt", "updatedAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, NOW(), NOW())`,
  updatePackage:
    `UPDATE "CoachPackage" SET "kind" = $3, "title" = $4, "summary" = $5, "priceCents" = $6, "includes" = $7::jsonb, "capacity" = $8, "sessions" = $9, "active" = $10, "updatedAt" = NOW() ` +
    `WHERE "id" = $1 AND "coachId" = $2`,
  // capacity: what holds a spot right now
  takenFor:
    `SELECT "packageId", COUNT(*)::int AS "n" FROM "CoachSale" WHERE "packageId" = ANY($1::text[]) AND ("status" IN ('PAID', 'ACTIVE', 'PARTIALLY_REFUNDED') OR ("status" = 'PENDING' AND "holdExpiresAt" > $2)) GROUP BY "packageId"`,
  // pg_advisory_xact_lock returns void, which Prisma cannot deserialize: select a constant FROM it instead
  lockPackage: `SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext($1))`,
  // connect
  connectFor: `SELECT "userId", "stripeAccountId", "livemode", "chargesEnabled", "payoutsEnabled", "detailsSubmitted" FROM "CoachConnectAccount" WHERE "userId" = $1`,
  insertConnect:
    `INSERT INTO "CoachConnectAccount" ("userId", "stripeAccountId", "livemode", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT ("userId") DO NOTHING`,
  updateConnect:
    `UPDATE "CoachConnectAccount" SET "chargesEnabled" = $2, "payoutsEnabled" = $3, "detailsSubmitted" = $4, "updatedAt" = NOW() WHERE "stripeAccountId" = $1`,
  // PAYMENTS-READY (needs 2026-10-26-payments-ready.sql)
  updateConnectDue:
    `UPDATE "CoachConnectAccount" SET "chargesEnabled" = $2, "payoutsEnabled" = $3, "detailsSubmitted" = $4, "requirementsDue" = $5, "updatedAt" = NOW() WHERE "stripeAccountId" = $1`,
  connectDueFor: `SELECT "requirementsDue" FROM "CoachConnectAccount" WHERE "userId" = $1`,
  connectByAccount: `SELECT "userId", "stripeAccountId", "livemode", "chargesEnabled", "payoutsEnabled", "detailsSubmitted" FROM "CoachConnectAccount" WHERE "stripeAccountId" = $1`,
  // sales
  insertSale:
    `INSERT INTO "CoachSale" ("id", "packageId", "coachId", "buyerId", "kind", "status", "amountCents", "feeCents", "stripeAccountId", "livemode", "holdExpiresAt", "createdAt", "updatedAt") ` +
    `VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9, $10, NOW(), NOW())`,
  attachCheckout: `UPDATE "CoachSale" SET "checkoutSessionId" = $2, "updatedAt" = NOW() WHERE "id" = $1 AND "checkoutSessionId" IS NULL`,
  saleById:
    `SELECT "id", "packageId", "coachId", "buyerId", "kind", "status", "amountCents", "feeCents", "refundedCents", "feeRefundedCents", "stripeAccountId", "checkoutSessionId", "paymentIntentId", "subscriptionId", "livemode", "paidAt", "createdAt" FROM "CoachSale" WHERE "id" = $1`,
  markPaid:
    `UPDATE "CoachSale" SET "status" = $2, "paymentIntentId" = COALESCE($3, "paymentIntentId"), "subscriptionId" = COALESCE($4, "subscriptionId"), "checkoutSessionId" = COALESCE("checkoutSessionId", $5), "paidAt" = NOW(), "updatedAt" = NOW() ` +
    `WHERE "id" = $1 AND "status" IN ('PENDING', 'EXPIRED')`,
  markExpired: `UPDATE "CoachSale" SET "status" = 'EXPIRED', "updatedAt" = NOW() WHERE "id" = $1 AND "status" = 'PENDING'`,
  markCanceled: `UPDATE "CoachSale" SET "status" = 'CANCELED', "updatedAt" = NOW() WHERE "id" = $1 AND "status" = 'ACTIVE'`,
  applyRefund:
    `UPDATE "CoachSale" SET "refundedCents" = $3, "feeRefundedCents" = "feeRefundedCents" + $4, "status" = $5, "updatedAt" = NOW() WHERE "id" = $1 AND "refundedCents" = $2`,
  saleByPaymentIntent: `SELECT "id" FROM "CoachSale" WHERE "paymentIntentId" = $1`,
  saleBySubscription: `SELECT "id" FROM "CoachSale" WHERE "subscriptionId" = $1`,
  // PAYMENTS-READY: FEL's fees from one coach since $2 (the cap's month), net of the fee handed back on refunds, read from
  // the ledger (webhook.ts books both with the coachId), plus the fees of that coach's checkouts still open (PENDING,
  // unexpired), so two checkouts started together cannot spend the same room under the cap.
  coachFeesSince:
    `SELECT COALESCE(SUM(CASE WHEN "kind" = 'COACH_CONNECT_FEE' THEN ("metadata"->>'feeCents')::int ELSE -(("metadata"->>'feeReturnedCents')::int) END), 0)::int AS "n" ` +
    `FROM "LedgerTransaction" WHERE "kind" IN ('COACH_CONNECT_FEE', 'COACH_CONNECT_FEE_REFUND') AND "metadata"->>'coachId' = $1 AND "createdAt" >= $2`,
  coachPendingFees:
    `SELECT COALESCE(SUM("feeCents"), 0)::int AS "n" FROM "CoachSale" WHERE "coachId" = $1 AND "status" = 'PENDING' AND "holdExpiresAt" > $2`,
  // disputes (needs 2026-10-26-payments-ready.sql)
  insertDispute:
    `INSERT INTO "CoachSaleDispute" ("id", "saleId", "coachId", "chargeId", "amountCents", "reason", "stripeStatus", "livemode", "createdAt", "updatedAt") ` +
    `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) ON CONFLICT ("id") DO NOTHING`,
  disputeById:
    `SELECT "id", "saleId", "coachId", "chargeId", "amountCents", "reason", "stripeStatus", "outcome", "withdrawnCents", "reinstatedCents", "livemode", "createdAt", "closedAt" FROM "CoachSaleDispute" WHERE "id" = $1`,
  // a closed dispute (WON/LOST) never reopens: Stripe does not order events, and an older "updated" must not undo it
  setDisputeStatus:
    `UPDATE "CoachSaleDispute" SET "stripeStatus" = $2, "outcome" = $3, "closedAt" = CASE WHEN $3 = 'OPEN' THEN NULL ELSE NOW() END, "updatedAt" = NOW() WHERE "id" = $1 AND "outcome" = 'OPEN'`,
  // compare-and-set on the cumulative amounts, like a sale's refund
  setDisputeFunds:
    `UPDATE "CoachSaleDispute" SET "withdrawnCents" = $4, "reinstatedCents" = $5, "updatedAt" = NOW() WHERE "id" = $1 AND "withdrawnCents" = $2 AND "reinstatedCents" = $3`,
  disputesForCoach:
    `SELECT d."id", d."saleId", d."amountCents", d."reason", d."stripeStatus", d."outcome", d."withdrawnCents", d."reinstatedCents", d."livemode", d."createdAt", d."closedAt", p."title" ` +
    `FROM "CoachSaleDispute" d JOIN "CoachSale" s ON s."id" = d."saleId" JOIN "CoachPackage" p ON p."id" = s."packageId" WHERE d."coachId" = $1 ORDER BY d."createdAt" DESC LIMIT 50`,
  salesForCoach:
    `SELECT s."id", s."packageId", s."kind", s."status", s."amountCents", s."feeCents", s."refundedCents", s."feeRefundedCents", s."livemode", s."paidAt", s."createdAt", p."title" ` +
    `FROM "CoachSale" s JOIN "CoachPackage" p ON p."id" = s."packageId" WHERE s."coachId" = $1 AND s."status" <> 'PENDING' AND s."status" <> 'EXPIRED' ORDER BY s."createdAt" DESC LIMIT 100`,
  // highlights
  insertHighlight:
    `INSERT INTO "CoachHighlight" ("id", "coachId", "clientId", "text", "createdAt") VALUES ($1, $2, $3, $4, NOW())`,
  highlightsFor: `SELECT "id", "coachId", "clientId", "text", "consentAt", "consentAdult", "revokedAt" FROM "CoachHighlight" WHERE "coachId" = $1 ORDER BY "createdAt" DESC LIMIT 50`,
  highlightById: `SELECT "id", "coachId", "clientId", "text", "consentAt", "consentAdult", "revokedAt" FROM "CoachHighlight" WHERE "id" = $1`,
  consentHighlight: `UPDATE "CoachHighlight" SET "consentAt" = NOW(), "consentAdult" = true, "revokedAt" = NULL WHERE "id" = $1 AND "clientId" = $2`,
  revokeHighlight: `UPDATE "CoachHighlight" SET "revokedAt" = NOW() WHERE "id" = $1 AND ("clientId" = $2 OR "coachId" = $2)`,
  // applications
  upsertApplication:
    `INSERT INTO "CoachApplication" ("id", "coachId", "applicantId", "packageId", "goal", "note", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', NOW(), NOW()) ` +
    `ON CONFLICT ("coachId", "applicantId") DO UPDATE SET "packageId" = EXCLUDED."packageId", "goal" = EXCLUDED."goal", "note" = EXCLUDED."note", "status" = 'OPEN', "updatedAt" = NOW()`,
  applicationsFor:
    `SELECT a."id", a."packageId", a."goal", a."note", a."status", a."createdAt", u."name" AS "applicantName", u."email" AS "applicantEmail" FROM "CoachApplication" a JOIN "User" u ON u."id" = a."applicantId" ` +
    `WHERE a."coachId" = $1 ORDER BY a."updatedAt" DESC LIMIT 100`,
  setApplicationStatus: `UPDATE "CoachApplication" SET "status" = $3, "updatedAt" = NOW() WHERE "id" = $1 AND "coachId" = $2`,
} as const;

// ── rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
type PackageRow = { id: string; coachId: string; kind: string; title: string; summary: string; priceCents: number; includes: unknown; capacity: number | null; sessions: number | null; active: boolean; sortOrder: number };

function parseJsonList(v: unknown): string[] {
  const arr = typeof v === 'string' ? (() => { try { return JSON.parse(v) as unknown; } catch { return []; } })() : v;
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
}

export function toPackage(r: PackageRow): CoachPackage {
  return {
    id: r.id, coachId: r.coachId, kind: r.kind as PackageKind, title: r.title, summary: r.summary ?? '',
    priceCents: Number(r.priceCents), includes: parseJsonList(r.includes), capacity: r.capacity === null ? null : Number(r.capacity),
    sessions: r.sessions === null ? null : Number(r.sessions), active: !!r.active, sortOrder: Number(r.sortOrder ?? 0),
  };
}

export interface MarketProfileRow { userId: string; listed: boolean; acceptingClients: boolean; sports: Sport[]; goals: MarketGoal[] }

export async function marketProfile(db: RawDb, userId: string): Promise<MarketProfileRow | null> {
  const rows = await db.$queryRawUnsafe<MarketProfileRow[]>(SQL.marketProfile, userId);
  return rows[0] ?? null;
}

export async function saveMarketProfile(db: RawDb, p: MarketProfileRow): Promise<void> {
  await db.$executeRawUnsafe(SQL.upsertMarketProfile, p.userId, p.listed, p.acceptingClients, p.sports, p.goals);
}

export interface ListedCoachRow { userId: string; slug: string; displayName: string; headline: string | null; specialties: string[]; sports: string[]; goals: string[]; acceptingClients: boolean }

export function listedCoaches(db: RawDb): Promise<ListedCoachRow[]> {
  return db.$queryRawUnsafe<ListedCoachRow[]>(SQL.listedCoaches);
}

export async function packagesFor(db: RawDb, coachId: string): Promise<CoachPackage[]> {
  return (await db.$queryRawUnsafe<PackageRow[]>(SQL.packagesFor, coachId)).map(toPackage);
}

export async function activePackagesFor(db: RawDb, coachIds: readonly string[]): Promise<CoachPackage[]> {
  if (!coachIds.length) return [];
  // COACH-DELIVERY COA-12: a team fee is sent to a roster, never listed publicly (packages.ts)
  return (await db.$queryRawUnsafe<PackageRow[]>(SQL.activePackagesFor, [...coachIds])).map(toPackage).filter((p) => p.kind !== 'team_fee');
}

export async function packageById(db: RawDb, id: string): Promise<CoachPackage | null> {
  const r = (await db.$queryRawUnsafe<PackageRow[]>(SQL.packageById, id))[0];
  return r ? toPackage(r) : null;
}

export async function countPackages(db: RawDb, coachId: string): Promise<number> {
  const r = (await db.$queryRawUnsafe<{ n: number }[]>(SQL.countPackages, coachId))[0];
  return Number(r?.n ?? 0);
}

export async function insertPackage(db: RawDb, coachId: string, input: PackageInput, sortOrder: number): Promise<string> {
  const id = randomUUID();
  await db.$executeRawUnsafe(SQL.insertPackage, id, coachId, input.kind, input.title, input.summary, input.priceCents, JSON.stringify(input.includes), input.capacity, input.sessions, input.active, sortOrder);
  return id;
}

/** True when the coach's own package was updated. */
export async function updatePackage(db: RawDb, id: string, coachId: string, input: PackageInput): Promise<boolean> {
  const n = await db.$executeRawUnsafe(SQL.updatePackage, id, coachId, input.kind, input.title, input.summary, input.priceCents, JSON.stringify(input.includes), input.capacity, input.sessions, input.active);
  return n > 0;
}

/** Spots held right now, per package id. */
export async function takenFor(db: RawDb, packageIds: readonly string[], now: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!packageIds.length) return out;
  for (const r of await db.$queryRawUnsafe<{ packageId: string; n: number }[]>(SQL.takenFor, [...packageIds], now)) out.set(r.packageId, Number(r.n));
  return out;
}

// ── connect ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ConnectRow { userId: string; stripeAccountId: string; livemode: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }

export async function connectFor(db: RawDb, userId: string): Promise<ConnectRow | null> {
  return (await db.$queryRawUnsafe<ConnectRow[]>(SQL.connectFor, userId))[0] ?? null;
}

/** Keep the coach's account id once; a second call (a double tap, a retry) keeps the FIRST. Returns the row kept. */
export async function keepConnect(db: RawDb, userId: string, stripeAccountId: string, livemode: boolean): Promise<ConnectRow> {
  await db.$executeRawUnsafe(SQL.insertConnect, userId, stripeAccountId, livemode);
  const row = await connectFor(db, userId);
  if (!row) throw new Error('connect row not kept');
  return row;
}

export async function updateConnect(db: RawDb, stripeAccountId: string, s: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue?: boolean }): Promise<void> {
  // PAYMENTS-READY: the requirements flag is kept once its column is there; before that, the three flags as before.
  if (s.requirementsDue !== undefined && (await paymentsReadySchema(db))) {
    try {
      await db.$executeRawUnsafe(SQL.updateConnectDue, stripeAccountId, s.chargesEnabled, s.payoutsEnabled, s.detailsSubmitted, s.requirementsDue);
      return;
    } catch (e) {
      paymentsReadyFailed('connect_due_update_failed', e);
    }
  }
  await db.$executeRawUnsafe(SQL.updateConnect, stripeAccountId, s.chargesEnabled, s.payoutsEnabled, s.detailsSubmitted);
}

/** The coach's "Stripe is asking for something" flag; false until the payments-ready SQL is applied. */
export async function connectRequirementsDue(db: RawDb, userId: string): Promise<boolean> {
  if (!(await paymentsReadySchema(db))) return false;
  try {
    const r = (await db.$queryRawUnsafe<{ requirementsDue: boolean }[]>(SQL.connectDueFor, userId))[0];
    return !!r?.requirementsDue;
  } catch (e) {
    paymentsReadyFailed('connect_due_read_failed', e);
    return false;
  }
}

export async function connectByAccount(db: RawDb, stripeAccountId: string): Promise<ConnectRow | null> {
  return (await db.$queryRawUnsafe<ConnectRow[]>(SQL.connectByAccount, stripeAccountId))[0] ?? null;
}

// ── sales ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface SaleRow {
  id: string; packageId: string; coachId: string; buyerId: string; kind: PackageKind; status: SaleStatus;
  amountCents: number; feeCents: number; refundedCents: number; feeRefundedCents: number; stripeAccountId: string;
  checkoutSessionId: string | null; paymentIntentId: string | null; subscriptionId: string | null; livemode: boolean;
  paidAt: Date | null; createdAt: Date;
}

export async function saleById(db: RawDb, id: string): Promise<SaleRow | null> {
  const r = (await db.$queryRawUnsafe<SaleRow[]>(SQL.saleById, id))[0];
  return r ? { ...r, amountCents: Number(r.amountCents), feeCents: Number(r.feeCents), refundedCents: Number(r.refundedCents), feeRefundedCents: Number(r.feeRefundedCents) } : null;
}

export async function saleIdByPaymentIntent(db: RawDb, paymentIntentId: string): Promise<string | null> {
  return (await db.$queryRawUnsafe<{ id: string }[]>(SQL.saleByPaymentIntent, paymentIntentId))[0]?.id ?? null;
}

export async function saleIdBySubscription(db: RawDb, subscriptionId: string): Promise<string | null> {
  return (await db.$queryRawUnsafe<{ id: string }[]>(SQL.saleBySubscription, subscriptionId))[0]?.id ?? null;
}

/** FEL's fees from `coachId` since `since` (ledger, net of fee refunds) plus its open checkouts' fees at `now`. */
export async function coachFeesThisMonth(db: RawDb, coachId: string, since: Date, now: Date): Promise<number> {
  const [booked, pending] = await Promise.all([
    db.$queryRawUnsafe<{ n: number }[]>(SQL.coachFeesSince, coachId, since),
    db.$queryRawUnsafe<{ n: number }[]>(SQL.coachPendingFees, coachId, now),
  ]);
  return Math.max(0, Number(booked[0]?.n ?? 0)) + Math.max(0, Number(pending[0]?.n ?? 0));
}

export interface HoldInput { pkg: CoachPackage; buyerId: string; feeCents: number; stripeAccountId: string; livemode: boolean; now: Date; holdMinutes: number }

/**
 * Hold a spot: under a per-package lock, count what holds a spot now and insert a PENDING sale only if one is open.
 * Two buyers racing for the last spot: one gets it, the other gets 'full'.
 */
export async function holdSpot(db: TxDb, h: HoldInput): Promise<{ ok: true; saleId: string } | { ok: false; reason: 'full' }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(SQL.lockPackage, h.pkg.id);
    if (h.pkg.capacity !== null) {
      const taken = (await takenFor(tx, [h.pkg.id], h.now)).get(h.pkg.id) ?? 0;
      if (taken >= h.pkg.capacity) return { ok: false as const, reason: 'full' as const };
    }
    const id = randomUUID();
    const until = new Date(h.now.getTime() + h.holdMinutes * 60_000);
    await tx.$executeRawUnsafe(SQL.insertSale, id, h.pkg.id, h.pkg.coachId, h.buyerId, h.pkg.kind, h.pkg.priceCents, h.feeCents, h.stripeAccountId, h.livemode, until);
    return { ok: true as const, saleId: id };
  });
}

export async function attachCheckout(db: RawDb, saleId: string, sessionId: string): Promise<void> {
  await db.$executeRawUnsafe(SQL.attachCheckout, saleId, sessionId);
}

/** PENDING/EXPIRED → PAID (one-off) or ACTIVE (monthly). True only for the call that moved it. */
export async function markPaid(db: RawDb, saleId: string, p: { status: 'PAID' | 'ACTIVE'; paymentIntentId: string | null; subscriptionId: string | null; checkoutSessionId: string | null }): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.markPaid, saleId, p.status, p.paymentIntentId, p.subscriptionId, p.checkoutSessionId)) > 0;
}

export async function markExpired(db: RawDb, saleId: string): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.markExpired, saleId)) > 0;
}

export async function markCanceled(db: RawDb, saleId: string): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.markCanceled, saleId)) > 0;
}

/** Compare-and-set on the cumulative refund: true only when the row still had `before`. */
export async function applyRefund(db: RawDb, saleId: string, before: number, after: number, feeDelta: number, status: SaleStatus): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.applyRefund, saleId, before, after, feeDelta, status)) > 0;
}

export interface CoachSaleView { id: string; packageId: string; title: string; kind: PackageKind; status: SaleStatus; amountCents: number; feeCents: number; refundedCents: number; feeRefundedCents: number; livemode: boolean; paidAt: string | null; createdAt: string }

export async function salesForCoach(db: RawDb, coachId: string): Promise<CoachSaleView[]> {
  const rows = await db.$queryRawUnsafe<(Omit<CoachSaleView, 'paidAt' | 'createdAt'> & { paidAt: Date | string | null; createdAt: Date | string })[]>(SQL.salesForCoach, coachId);
  const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());
  return rows.map((r) => ({ ...r, amountCents: Number(r.amountCents), feeCents: Number(r.feeCents), refundedCents: Number(r.refundedCents), feeRefundedCents: Number(r.feeRefundedCents), paidAt: iso(r.paidAt), createdAt: iso(r.createdAt) as string }));
}

// ── highlights ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function insertHighlight(db: RawDb, coachId: string, clientId: string, text: string): Promise<string> {
  const id = randomUUID();
  await db.$executeRawUnsafe(SQL.insertHighlight, id, coachId, clientId, text);
  return id;
}

export function highlightsFor(db: RawDb, coachId: string): Promise<HighlightRow[]> {
  return db.$queryRawUnsafe<HighlightRow[]>(SQL.highlightsFor, coachId);
}

export async function highlightById(db: RawDb, id: string): Promise<HighlightRow | null> {
  return (await db.$queryRawUnsafe<HighlightRow[]>(SQL.highlightById, id))[0] ?? null;
}

export async function consentHighlight(db: RawDb, id: string, clientId: string): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.consentHighlight, id, clientId)) > 0;
}

export async function revokeHighlight(db: RawDb, id: string, actorId: string): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.revokeHighlight, id, actorId)) > 0;
}

// ── applications ─────────────────────────────────────────────────────────────────────────────────────────────────────
export async function saveApplication(db: RawDb, a: { coachId: string; applicantId: string; packageId: string | null; goal: string; note: string }): Promise<void> {
  await db.$executeRawUnsafe(SQL.upsertApplication, randomUUID(), a.coachId, a.applicantId, a.packageId, a.goal, a.note);
}

/** The applicant's name and email reach the coach because the applicant sent them (an adult, told so on the form). */
export interface ApplicationView { id: string; packageId: string | null; goal: string; note: string; status: string; createdAt: string; applicantName: string | null; applicantEmail: string | null }

export async function applicationsFor(db: RawDb, coachId: string): Promise<ApplicationView[]> {
  const rows = await db.$queryRawUnsafe<(Omit<ApplicationView, 'createdAt'> & { createdAt: Date | string })[]>(SQL.applicationsFor, coachId);
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
}

export async function setApplicationStatus(db: RawDb, id: string, coachId: string, status: 'OPEN' | 'ACCEPTED' | 'DECLINED'): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.setApplicationStatus, id, coachId, status)) > 0;
}

// ── disputes (PAYMENTS-READY) ────────────────────────────────────────────────────────────────────────────────────────
export type DisputeOutcome = 'OPEN' | 'WON' | 'LOST';
export interface DisputeRow {
  id: string; saleId: string; coachId: string; chargeId: string; amountCents: number; reason: string; stripeStatus: string;
  outcome: DisputeOutcome; withdrawnCents: number; reinstatedCents: number; livemode: boolean; createdAt: Date; closedAt: Date | null;
}

function toDispute(r: DisputeRow): DisputeRow {
  return { ...r, amountCents: Number(r.amountCents), withdrawnCents: Number(r.withdrawnCents), reinstatedCents: Number(r.reinstatedCents) };
}

/** Keep a dispute once (ON CONFLICT DO NOTHING); returns the row as stored, or null when the table is not there yet. */
export async function keepDispute(db: RawDb, d: { id: string; saleId: string; coachId: string; chargeId: string; amountCents: number; reason: string; stripeStatus: string; livemode: boolean }): Promise<DisputeRow | null> {
  if (!(await paymentsReadySchema(db))) return null;
  try {
    await db.$executeRawUnsafe(SQL.insertDispute, d.id, d.saleId, d.coachId, d.chargeId, d.amountCents, d.reason, d.stripeStatus, d.livemode);
    const r = (await db.$queryRawUnsafe<DisputeRow[]>(SQL.disputeById, d.id))[0];
    return r ? toDispute(r) : null;
  } catch (e) {
    paymentsReadyFailed('dispute_keep_failed', e);
    throw e;
  }
}

/** OPEN → OPEN (a newer Stripe status) or WON/LOST, once. True when it moved. */
export async function setDisputeStatus(db: RawDb, id: string, stripeStatus: string, outcome: DisputeOutcome): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.setDisputeStatus, id, stripeStatus, outcome)) > 0;
}

/** Compare-and-set the money Stripe withdrew and returned. True only for the call that moved it. */
export async function setDisputeFunds(db: RawDb, id: string, before: { withdrawnCents: number; reinstatedCents: number }, after: { withdrawnCents: number; reinstatedCents: number }): Promise<boolean> {
  return (await db.$executeRawUnsafe(SQL.setDisputeFunds, id, before.withdrawnCents, before.reinstatedCents, after.withdrawnCents, after.reinstatedCents)) > 0;
}

export interface CoachDisputeView { id: string; saleId: string; title: string; amountCents: number; reason: string; stripeStatus: string; outcome: DisputeOutcome; livemode: boolean; createdAt: string; closedAt: string | null }

/** The coach's disputes, newest first (the in-app notice on /coach/business). Empty until the SQL is applied. */
export async function disputesForCoach(db: RawDb, coachId: string): Promise<CoachDisputeView[]> {
  if (!(await paymentsReadySchema(db))) return [];
  try {
    const rows = await db.$queryRawUnsafe<(Omit<CoachDisputeView, 'createdAt' | 'closedAt'> & { createdAt: Date | string; closedAt: Date | string | null })[]>(SQL.disputesForCoach, coachId);
    return rows.map((r) => ({
      id: r.id, saleId: r.saleId, title: r.title, amountCents: Number(r.amountCents), reason: r.reason, stripeStatus: r.stripeStatus, outcome: r.outcome,
      livemode: !!r.livemode, createdAt: new Date(r.createdAt).toISOString(), closedAt: r.closedAt === null ? null : new Date(r.closedAt).toISOString(),
    }));
  } catch (e) {
    paymentsReadyFailed('disputes_read_failed', e);
    return [];
  }
}
