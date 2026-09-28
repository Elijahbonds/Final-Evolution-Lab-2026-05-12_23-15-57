/**
 * CreatorStore — every runtime write the creator platform makes.
 *
 * Production is Firestore through firebase-admin (creatorStore.firestore.ts), server-only. The browser never
 * talks to Firestore. This file holds the interface and the in-memory implementation the tests use; both
 * implementations must keep the same rules:
 *
 * - holdSlot is all-or-nothing. It fails with TAKEN if any cell is held (and not past its expiry) or booked.
 * - Status changes are idempotent: confirming a confirmed booking or releasing a released one is a no-op.
 * - A release frees only the cells that still belong to that booking.
 */

export type BookingStatus = 'HOLD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'FAILED' | 'CONFLICT';

export const COLLECTIONS = {
  bookings: 'bookings',
  slotHolds: 'slotHolds',
  webhookEvents: 'creatorWebhookEvents',
  inquiries: 'inquiries',
  printfulOrders: 'printfulOrders',
  printifyOrders: 'printifyOrders',
  manualOrders: 'manualOrders',
} as const;

export interface BookingRecord {
  id: string;
  serviceId: string;
  profileSlug: string;
  slotStart: string;
  slotEnd: string;
  cellIds: string[];
  status: BookingStatus;
  /** After this the cells may be taken by someone else even if no expiry event arrived. */
  holdExpiresAt: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  email: string | null;
  amountCents: number;
  currency: string;
  priceIsExample: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlotHoldRecord {
  id: string;
  profileSlug: string;
  bookingId: string;
  status: 'HELD' | 'BOOKED';
  /** ISO. Null once booked. */
  expiresAt: string | null;
}

export type InquiryStatus = 'NEW';

export interface InquiryRecord {
  brand: string;
  contactName: string;
  email: string;
  budgetRange: string;
  dates: string;
  deliverables: string;
  message: string;
  consent: true;
  profileSlug: string | null;
  status: InquiryStatus;
  source: string;
  /** HMAC of the IP with CREATOR_IP_SALT. Null when no salt is configured. Never the raw IP. */
  ipHash: string | null;
  createdAt: string;
}

export interface FulfillmentOrderRecord {
  orderId: string;
  provider: 'printful' | 'printify' | 'manual';
  status: 'STUB_NOT_SENT' | 'MANUAL_PENDING';
  items: Array<{ productId: string; variantId: string | null; quantity: number; itemCostCents: number }>;
  /** Provider cost of the items, stored on the order so a creator payout split can use it later. */
  itemCostCents: number;
  shippingCents: number;
  currency: string;
  costIsExample: boolean;
  /** The request that would have been sent. Authorization is redacted. */
  request: unknown;
  createdAt: string;
  updatedAt: string;
}

export type ConfirmResult = 'CONFIRMED' | 'ALREADY' | 'CONFLICT' | 'NOT_FOUND' | 'CLOSED';
export type ReleaseResult = 'RELEASED' | 'ALREADY' | 'NOT_FOUND' | 'SKIPPED';

export interface CreatorBookingStore {
  hasEvent(eventId: string): Promise<boolean>;
  rememberEvent(eventId: string, type: string, paymentIntentId: string | null): Promise<void>;
  isPaymentIntentRefunded(paymentIntentId: string): Promise<boolean>;

  /** Create the booking in HOLD and take every cell, or take nothing. */
  holdSlot(booking: BookingRecord, now: Date): Promise<'HELD' | 'TAKEN'>;
  attachCheckoutSession(bookingId: string, sessionId: string, now: Date): Promise<void>;
  getBooking(bookingId: string): Promise<BookingRecord | null>;
  findBookingByPaymentIntent(paymentIntentId: string): Promise<BookingRecord | null>;
  /** Cell ids for a profile that are held (unexpired) or booked, between two cell ids. */
  listTakenCells(profileSlug: string, fromCellId: string, toCellId: string, now: Date): Promise<Set<string>>;
  /** HOLD → CONFIRMED and every cell → BOOKED. CONFLICT if a cell now belongs to another live booking. */
  confirmBooking(
    bookingId: string,
    paid: { paymentIntentId: string | null; email: string | null; amountCents: number | null; currency: string | null },
    now: Date,
  ): Promise<ConfirmResult>;
  /**
   * Move a booking to EXPIRED, CANCELLED or FAILED and free its cells.
   * `from` limits which statuses may move (an expiry only releases a HOLD).
   */
  releaseBooking(
    bookingId: string,
    to: 'EXPIRED' | 'CANCELLED' | 'FAILED',
    from: readonly BookingStatus[],
    now: Date,
    patch?: { paymentIntentId?: string | null },
  ): Promise<ReleaseResult>;
}

export interface CreatorInquiryStore {
  createInquiry(record: InquiryRecord): Promise<{ id: string }>;
}

export interface CreatorFulfillmentStore {
  /** Create-if-absent on our order id. The second call returns the first record with created: false. */
  saveFulfillmentOrder(record: FulfillmentOrderRecord): Promise<{ created: boolean; record: FulfillmentOrderRecord }>;
  getFulfillmentOrder(provider: FulfillmentOrderRecord['provider'], orderId: string): Promise<FulfillmentOrderRecord | null>;
}

export type CreatorStore = CreatorBookingStore & CreatorInquiryStore & CreatorFulfillmentStore;

export function fulfillmentCollection(provider: FulfillmentOrderRecord['provider']): string {
  if (provider === 'printful') return COLLECTIONS.printfulOrders;
  if (provider === 'printify') return COLLECTIONS.printifyOrders;
  return COLLECTIONS.manualOrders;
}

export function holdIsLive(hold: Pick<SlotHoldRecord, 'status' | 'expiresAt'>, now: Date): boolean {
  if (hold.status === 'BOOKED') return true;
  return hold.expiresAt != null && Date.parse(hold.expiresAt) > now.getTime();
}

/** Statuses a refund may cancel. */
export const LIVE_BOOKING: readonly BookingStatus[] = ['HOLD', 'CONFIRMED', 'CONFLICT'];

interface EventRow { eventId: string; type: string; paymentIntentId: string | null }

/** In-memory store for tests. Same rules as the Firestore adapter; single-threaded, so no transactions needed. */
export function memoryCreatorStore() {
  const events: EventRow[] = [];
  const bookings = new Map<string, BookingRecord>();
  const holds = new Map<string, SlotHoldRecord>();
  const inquiries = new Map<string, InquiryRecord>();
  const orders = new Map<string, FulfillmentOrderRecord>();
  let inquirySeq = 0;

  const clone = <T>(v: T): T => structuredClone(v);

  const store: CreatorStore = {
    async hasEvent(eventId) {
      return events.some((e) => e.eventId === eventId);
    },
    async rememberEvent(eventId, type, paymentIntentId) {
      if (!events.some((e) => e.eventId === eventId)) events.push({ eventId, type, paymentIntentId });
    },
    async isPaymentIntentRefunded(paymentIntentId) {
      return events.some((e) => e.type === 'charge.refunded' && e.paymentIntentId === paymentIntentId);
    },

    async holdSlot(booking, now) {
      if (bookings.has(booking.id)) return 'TAKEN';
      for (const id of booking.cellIds) {
        const hold = holds.get(id);
        if (hold && holdIsLive(hold, now)) return 'TAKEN';
      }
      bookings.set(booking.id, clone(booking));
      for (const id of booking.cellIds) {
        holds.set(id, { id, profileSlug: booking.profileSlug, bookingId: booking.id, status: 'HELD', expiresAt: booking.holdExpiresAt });
      }
      return 'HELD';
    },
    async attachCheckoutSession(bookingId, sessionId, now) {
      const b = bookings.get(bookingId);
      if (!b) return;
      b.checkoutSessionId = sessionId;
      b.updatedAt = now.toISOString();
    },
    async getBooking(bookingId) {
      const b = bookings.get(bookingId);
      return b ? clone(b) : null;
    },
    async findBookingByPaymentIntent(paymentIntentId) {
      for (const b of bookings.values()) if (b.paymentIntentId === paymentIntentId) return clone(b);
      return null;
    },
    async listTakenCells(profileSlug, fromCellId, toCellId, now) {
      const out = new Set<string>();
      for (const hold of holds.values()) {
        if (hold.profileSlug !== profileSlug || hold.id < fromCellId || hold.id >= toCellId) continue;
        if (holdIsLive(hold, now)) out.add(hold.id);
      }
      return out;
    },
    async confirmBooking(bookingId, paid, now) {
      const b = bookings.get(bookingId);
      if (!b) return 'NOT_FOUND';
      if (b.status === 'CONFIRMED') return 'ALREADY';
      if (b.status === 'CANCELLED') return 'CLOSED';
      const stamp = now.toISOString();
      b.paymentIntentId = paid.paymentIntentId ?? b.paymentIntentId;
      b.email = paid.email ?? b.email;
      if (paid.amountCents != null) b.amountCents = paid.amountCents;
      if (paid.currency) b.currency = paid.currency;
      b.updatedAt = stamp;
      const clash = b.cellIds.some((id) => {
        const hold = holds.get(id);
        return hold != null && hold.bookingId !== b.id && holdIsLive(hold, now);
      });
      if (clash) {
        b.status = 'CONFLICT';
        return 'CONFLICT';
      }
      for (const id of b.cellIds) {
        holds.set(id, { id, profileSlug: b.profileSlug, bookingId: b.id, status: 'BOOKED', expiresAt: null });
      }
      b.status = 'CONFIRMED';
      return 'CONFIRMED';
    },
    async releaseBooking(bookingId, to, from, now, patch) {
      const b = bookings.get(bookingId);
      if (!b) return 'NOT_FOUND';
      if (b.status === to) return 'ALREADY';
      if (!from.includes(b.status)) return 'SKIPPED';
      b.status = to;
      if (patch?.paymentIntentId) b.paymentIntentId = patch.paymentIntentId;
      b.updatedAt = now.toISOString();
      for (const id of b.cellIds) {
        if (holds.get(id)?.bookingId === b.id) holds.delete(id);
      }
      return 'RELEASED';
    },

    async createInquiry(record) {
      inquirySeq += 1;
      const id = `inq_${inquirySeq}`;
      inquiries.set(id, clone(record));
      return { id };
    },

    async saveFulfillmentOrder(record) {
      const key = `${record.provider}:${record.orderId}`;
      const existing = orders.get(key);
      if (existing) return { created: false, record: clone(existing) };
      orders.set(key, clone(record));
      return { created: true, record: clone(record) };
    },
    async getFulfillmentOrder(provider, orderId) {
      const found = orders.get(`${provider}:${orderId}`);
      return found ? clone(found) : null;
    },
  };

  return { store, events, bookings, holds, inquiries, orders };
}

