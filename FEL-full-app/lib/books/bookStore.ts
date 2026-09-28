/**
 * Prisma adapter for the press entitlement tables.
 * The fulfill and delivery functions take this store so tests never open a database.
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
      const row = await db.bookFulfillmentEvent.findUnique({ where: { eventId }, select: { id: true } });
      return Boolean(row);
    },
    async rememberEvent(eventId, type, paymentIntentId) {
      try {
        await db.bookFulfillmentEvent.create({ data: { eventId, type, paymentIntentId } });
      } catch (err) {
        if (isUnique(err)) return;
        throw err;
      }
    },
    async isPaymentIntentRevoked(paymentIntentId) {
      const row = await db.bookFulfillmentEvent.findFirst({
        where: { paymentIntentId, type: 'charge.refunded' },
        select: { id: true },
      });
      return Boolean(row);
    },
    async findByEmailOffer(email, offerId) {
      return db.bookEntitlement.findUnique({
        where: { email_offerId: { email, offerId } },
        select: { userId: true },
      });
    },
    async findUserIdByEmail(email) {
      const user = await db.user.findUnique({ where: { email }, select: { id: true } });
      return user?.id ?? null;
    },
    async upsertEntitlement(row: BookEntitlementWrite) {
      await db.bookEntitlement.upsert({
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
      const res = await db.bookEntitlement.updateMany({
        where: { stripePaymentIntentId: paymentIntentId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      return res.count;
    },
    async claimByEmail(userId, email) {
      const res = await db.bookEntitlement.updateMany({
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
      const rows = await db.bookEntitlement.findMany({
        where: { status: 'ACTIVE', OR: or },
        select: { bookSlug: true, format: true, offerId: true, email: true },
      });
      return rows.map((row) => ({ ...row, status: 'ACTIVE' as const }));
    },
  };
}
