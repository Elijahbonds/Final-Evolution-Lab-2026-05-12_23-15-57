/**
 * Firestore adapter for CreatorStore, through firebase-admin. Server-only.
 *
 * Credentials are the same service-account env the book shop signs Storage URLs with
 * (FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY). firebase-admin is imported
 * lazily so a page that only reads the catalog never loads it.
 *
 * Client access to these collections is denied: see docs/CREATOR-PLATFORM.md for the rules to add. This
 * branch does not deploy rules.
 */

import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { bookStorageConfig } from '@/lib/books/bookStorage';
import {
  COLLECTIONS,
  fulfillmentCollection,
  holdIsLive,
  type BookingRecord,
  type CreatorStore,
  type FulfillmentOrderRecord,
  type SlotHoldRecord,
} from './creatorStore';

const APP_NAME = 'fel-creator';

export interface CreatorFirestoreConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Null when the service account is not configured. Callers answer 503, never fall back to a client SDK. */
export function creatorFirestoreConfig(env: NodeJS.ProcessEnv = process.env): CreatorFirestoreConfig | null {
  const base = bookStorageConfig(env);
  if (!base) return null;
  let projectId = env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || '';
  if (!projectId && env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      projectId = (JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as { project_id?: string }).project_id ?? '';
    } catch {
      projectId = '';
    }
  }
  if (!projectId) projectId = /@([a-z0-9-]+)\.iam\.gserviceaccount\.com$/.exec(base.clientEmail)?.[1] ?? '';
  if (!projectId) return null;
  return { projectId, clientEmail: base.clientEmail, privateKey: base.privateKey };
}

let dbPromise: Promise<Firestore> | null = null;

async function firestore(config: CreatorFirestoreConfig): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { cert, getApps, initializeApp } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      const app = getApps().find((a) => a.name === APP_NAME)
        ?? initializeApp({ credential: cert(config), projectId: config.projectId }, APP_NAME);
      const db = getFirestore(app);
      try {
        // Optional fields (an address line 2, say) arrive as undefined; Firestore rejects those by default.
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings() may run once per instance; an earlier attempt in this process already set it.
      }
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

class Taken extends Error {}

export function firestoreCreatorStore(config: CreatorFirestoreConfig): CreatorStore {
  const db = () => firestore(config);

  async function readHolds(tx: Transaction, fs: Firestore, ids: string[]): Promise<Map<string, SlotHoldRecord>> {
    const out = new Map<string, SlotHoldRecord>();
    if (ids.length === 0) return out;
    const snaps = await tx.getAll(...ids.map((id) => fs.collection(COLLECTIONS.slotHolds).doc(id)));
    for (const snap of snaps) if (snap.exists) out.set(snap.id, snap.data() as SlotHoldRecord);
    return out;
  }

  return {
    async hasEvent(eventId) {
      const fs = await db();
      return (await fs.collection(COLLECTIONS.webhookEvents).doc(eventId).get()).exists;
    },
    async rememberEvent(eventId, type, paymentIntentId) {
      const fs = await db();
      try {
        await fs.collection(COLLECTIONS.webhookEvents).doc(eventId).create({
          eventId, type, paymentIntentId, createdAt: new Date().toISOString(),
        });
      } catch (err) {
        if ((err as { code?: number }).code === 6) return; // ALREADY_EXISTS: a concurrent delivery got there first
        throw err;
      }
    },
    async isPaymentIntentRefunded(paymentIntentId) {
      const fs = await db();
      const snap = await fs.collection(COLLECTIONS.webhookEvents)
        .where('paymentIntentId', '==', paymentIntentId)
        .where('type', '==', 'charge.refunded')
        .limit(1)
        .get();
      return !snap.empty;
    },

    async holdSlot(booking, now) {
      const fs = await db();
      try {
        await fs.runTransaction(async (tx) => {
          const bookingRef = fs.collection(COLLECTIONS.bookings).doc(booking.id);
          const existing = await tx.get(bookingRef);
          if (existing.exists) throw new Taken();
          const holds = await readHolds(tx, fs, booking.cellIds);
          for (const hold of holds.values()) if (holdIsLive(hold, now)) throw new Taken();
          tx.create(bookingRef, booking);
          for (const id of booking.cellIds) {
            const hold: SlotHoldRecord = {
              id, profileSlug: booking.profileSlug, bookingId: booking.id, status: 'HELD', expiresAt: booking.holdExpiresAt,
            };
            tx.set(fs.collection(COLLECTIONS.slotHolds).doc(id), hold);
          }
        });
        return 'HELD';
      } catch (err) {
        if (err instanceof Taken) return 'TAKEN';
        throw err;
      }
    },
    async attachCheckoutSession(bookingId, sessionId, now) {
      const fs = await db();
      await fs.collection(COLLECTIONS.bookings).doc(bookingId).update({ checkoutSessionId: sessionId, updatedAt: now.toISOString() });
    },
    async getBooking(bookingId) {
      const fs = await db();
      const snap = await fs.collection(COLLECTIONS.bookings).doc(bookingId).get();
      return snap.exists ? (snap.data() as BookingRecord) : null;
    },
    async findBookingByPaymentIntent(paymentIntentId) {
      const fs = await db();
      const snap = await fs.collection(COLLECTIONS.bookings).where('paymentIntentId', '==', paymentIntentId).limit(1).get();
      return snap.empty ? null : (snap.docs[0].data() as BookingRecord);
    },
    async listTakenCells(profileSlug, fromCellId, toCellId, now) {
      const fs = await db();
      const { FieldPath } = await import('firebase-admin/firestore');
      // Document-id range: no composite index needed. Ids are `<slug>_<13-digit ms>`.
      const snap = await fs.collection(COLLECTIONS.slotHolds)
        .orderBy(FieldPath.documentId())
        .startAt(fromCellId)
        .endBefore(toCellId)
        .get();
      const out = new Set<string>();
      for (const doc of snap.docs) {
        const hold = doc.data() as SlotHoldRecord;
        if (hold.profileSlug === profileSlug && holdIsLive(hold, now)) out.add(doc.id);
      }
      return out;
    },
    async confirmBooking(bookingId, paid, now) {
      const fs = await db();
      return fs.runTransaction(async (tx) => {
        const ref = fs.collection(COLLECTIONS.bookings).doc(bookingId);
        const snap = await tx.get(ref);
        if (!snap.exists) return 'NOT_FOUND' as const;
        const b = snap.data() as BookingRecord;
        if (b.status === 'CONFIRMED') return 'ALREADY' as const;
        if (b.status === 'CANCELLED') return 'CLOSED' as const;
        const holds = await readHolds(tx, fs, b.cellIds);
        const clash = [...holds.values()].some((h) => h.bookingId !== b.id && holdIsLive(h, now));
        const patch: Partial<BookingRecord> = {
          paymentIntentId: paid.paymentIntentId ?? b.paymentIntentId,
          email: paid.email ?? b.email,
          amountCents: paid.amountCents ?? b.amountCents,
          currency: paid.currency || b.currency,
          updatedAt: now.toISOString(),
          status: clash ? 'CONFLICT' : 'CONFIRMED',
        };
        tx.update(ref, patch);
        if (clash) return 'CONFLICT' as const;
        for (const id of b.cellIds) {
          const hold: SlotHoldRecord = { id, profileSlug: b.profileSlug, bookingId: b.id, status: 'BOOKED', expiresAt: null };
          tx.set(fs.collection(COLLECTIONS.slotHolds).doc(id), hold);
        }
        return 'CONFIRMED' as const;
      });
    },
    async releaseBooking(bookingId, to, from, now, patch) {
      const fs = await db();
      return fs.runTransaction(async (tx) => {
        const ref = fs.collection(COLLECTIONS.bookings).doc(bookingId);
        const snap = await tx.get(ref);
        if (!snap.exists) return 'NOT_FOUND' as const;
        const b = snap.data() as BookingRecord;
        if (b.status === to) return 'ALREADY' as const;
        if (!from.includes(b.status)) return 'SKIPPED' as const;
        const holds = await readHolds(tx, fs, b.cellIds);
        const update: Partial<BookingRecord> = { status: to, updatedAt: now.toISOString() };
        if (patch?.paymentIntentId) update.paymentIntentId = patch.paymentIntentId;
        tx.update(ref, update);
        for (const [id, hold] of holds) {
          if (hold.bookingId === b.id) tx.delete(fs.collection(COLLECTIONS.slotHolds).doc(id));
        }
        return 'RELEASED' as const;
      });
    },

    async createInquiry(record) {
      const fs = await db();
      const ref = await fs.collection(COLLECTIONS.inquiries).add(record);
      return { id: ref.id };
    },

    async saveFulfillmentOrder(record) {
      const fs = await db();
      const ref = fs.collection(fulfillmentCollection(record.provider)).doc(record.orderId);
      return fs.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return { created: false, record: snap.data() as FulfillmentOrderRecord };
        tx.create(ref, record);
        return { created: true, record };
      });
    },
    async getFulfillmentOrder(provider, orderId) {
      const fs = await db();
      const snap = await fs.collection(fulfillmentCollection(provider)).doc(orderId).get();
      return snap.exists ? (snap.data() as FulfillmentOrderRecord) : null;
    },
  };
}

/** The production store, or null when Firestore is not configured on this server. */
export function creatorStoreFromEnv(env: NodeJS.ProcessEnv = process.env): CreatorStore | null {
  const config = creatorFirestoreConfig(env);
  return config ? firestoreCreatorStore(config) : null;
}
