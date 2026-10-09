/**
 * Prisma adapter for the press entitlement tables.
 * The fulfill and delivery functions take this store so tests never open a database.
 *
 * MERGE (2026-10-09): the BookFulfillmentEvent / BookEntitlement models are NOT in prisma/schema.prisma yet. They
 * moved to prisma/pending/2026-10-09-book-shop.sql when the release was merged in (the regenerated client could not
 * be merged, and agents do not regenerate it). So the two delegates are typed here by hand, and until the owner
 * applies the SQL and adds the models, the generated client has neither: bookTablesReady() is false and every
 * store call throws BookTablesNotReady, which the pages and routes already treat as "library unavailable".
 */

import 'server-only';
import { Prisma } from '@/public/_prisma/client';
import { prisma } from '@/lib/db';
import type { BookEntitlementWrite, BookFulfillStore } from './bookFulfill';
import type { OwnedOffer } from './bookEntitlements';

type Db = typeof prisma;

function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

type EmailOfferKey = { email_offerId: { email: string; offerId: string } };

/** The slice of the (pending) generated delegates this adapter calls. Matches the models in the pending SQL. */
interface BookDelegates {
  bookFulfillmentEvent: {
    findUnique(args: { where: { eventId: string }; select: { id: true } }): Promise<{ id: string } | null>;
    findFirst(args: { where: { paymentIntentId: string; type: string }; select: { id: true } }): Promise<{ id: string } | null>;
    create(args: { data: { eventId: string; type: string; paymentIntentId: string | null } }): Promise<unknown>;
  };
  bookEntitlement: {
    findUnique(args: { where: EmailOfferKey; select: { userId: true } }): Promise<{ userId: string | null } | null>;
    upsert(args: { where: EmailOfferKey; create: BookEntitlementWrite; update: Partial<BookEntitlementWrite> }): Promise<unknown>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    findMany(args: {
      where: Record<string, unknown>;
      select: { bookSlug: true; format: true; offerId: true; email: true };
    }): Promise<Array<{ bookSlug: string; format: string; offerId: string; email: string }>>;
  };
}

/** Thrown by every store call while the book tables are not in the generated client. */
export class BookTablesNotReady extends Error {
  readonly code = 'book_tables_not_ready';
  constructor() {
    super('book tables are not in the database client yet (prisma/pending/2026-10-09-book-shop.sql)');
    this.name = 'BookTablesNotReady';
  }
}

/** True once the generated client carries both book delegates (the owner applied the pending SQL and the models). */
export function bookTablesReady(db: unknown = prisma): boolean {
  const d = db as Partial<Record<keyof BookDelegates, unknown>> | null | undefined;
  return Boolean(d && d.bookFulfillmentEvent && d.bookEntitlement);
}

function books(db: Db): BookDelegates {
  if (!bookTablesReady(db)) throw new BookTablesNotReady();
  return db as unknown as BookDelegates;
}

export interface BookLibraryStore {
  claimByEmail(userId: string, email: string): Promise<number>;
  listActive(identity: { userId?: string | null; email?: string | null }): Promise<OwnedOffer[]>;
  listActiveDetailed(identity: { userId?: string | null; email?: string | null }): Promise<Array<OwnedOffer & {
    offerId: string;
    email: string;
  }>>;
}

export function prismaBookStore(db: Db = prisma): BookFulfillStore & BookLibraryStore {
  return {
    async hasEvent(eventId) {
      const row = await books(db).bookFulfillmentEvent.findUnique({ where: { eventId }, select: { id: true } });
      return Boolean(row);
    },
    async rememberEvent(eventId, type, paymentIntentId) {
      try {
        await books(db).bookFulfillmentEvent.create({ data: { eventId, type, paymentIntentId } });
      } catch (err) {
        if (isUnique(err)) return;
        throw err;
      }
    },
    async isPaymentIntentRevoked(paymentIntentId) {
      const row = await books(db).bookFulfillmentEvent.findFirst({
        where: { paymentIntentId, type: 'charge.refunded' },
        select: { id: true },
      });
      return Boolean(row);
    },
    async findByEmailOffer(email, offerId) {
      return books(db).bookEntitlement.findUnique({
        where: { email_offerId: { email, offerId } },
        select: { userId: true },
      });
    },
    async findUserIdByEmail(email) {
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      return user?.id ?? null;
    },
    async upsertEntitlement(row: BookEntitlementWrite) {
      await books(db).bookEntitlement.upsert({
        where: { email_offerId: { email: row.email, offerId: row.offerId } },
        create: row,
        update: {
          userId: row.userId,
          format: row.format,
          bookSlug: row.bookSlug,
          stripeSessionId: row.stripeSessionId,
          stripePaymentIntentId: row.stripePaymentIntentId,
          stripeEventId: row.stripeEventId,
          amountCents: row.amountCents,
          currency: row.currency,
          status: row.status,
          revokedAt: row.revokedAt,
        },
      });
    },
    async revokeByPaymentIntent(paymentIntentId) {
      const res = await books(db).bookEntitlement.updateMany({
        where: { stripePaymentIntentId: paymentIntentId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      return res.count;
    },
    async claimByEmail(userId, email) {
      const res = await books(db).bookEntitlement.updateMany({
        where: { email, userId: null },
        data: { userId },
      });
      return res.count;
    },
    async listActive(identity) {
      const rows = await this.listActiveDetailed(identity);
      return rows.map((row) => ({ bookSlug: row.bookSlug, format: row.format, status: 'ACTIVE' as const }));
    },
    async listActiveDetailed(identity) {
      const or: Array<{ userId: string } | { email: string }> = [];
      if (identity.userId) or.push({ userId: identity.userId });
      if (identity.email) or.push({ email: identity.email });
      if (or.length === 0) return [];
      const rows = await books(db).bookEntitlement.findMany({
        where: { status: 'ACTIVE', OR: or },
        select: { bookSlug: true, format: true, offerId: true, email: true },
      });
      return rows.map((row) => ({ ...row, status: 'ACTIVE' as const }));
    },
  };
}
