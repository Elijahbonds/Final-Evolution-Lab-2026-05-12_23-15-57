import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryCreatorStore, type BookingRecord, type CreatorStore } from './creatorStore';

/**
 * The same contract, run against the memory store and against the Firestore adapter over a fake of the
 * firebase-admin surface it uses. The fake applies transaction writes at commit and refuses `create` on an
 * existing doc (gRPC code 6), which is what the adapter relies on.
 */

type Doc = Record<string, unknown>;
const data = new Map<string, Map<string, Doc>>();
const col = (name: string) => {
  if (!data.has(name)) data.set(name, new Map());
  return data.get(name)!;
};
const DOC_ID = '__name__';
let autoId = 0;

function snap(name: string, id: string) {
  const d = col(name).get(id);
  return { id, exists: d !== undefined, data: () => (d ? structuredClone(d) : undefined) };
}

function docRef(name: string, id: string) {
  return {
    id,
    _c: name,
    get: async () => snap(name, id),
    create: async (d: Doc) => {
      if (col(name).has(id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      col(name).set(id, structuredClone(d));
    },
    update: async (d: Doc) => {
      if (!col(name).has(id)) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
      col(name).set(id, { ...col(name).get(id), ...structuredClone(d) });
    },
  };
}
type Ref = ReturnType<typeof docRef>;

function query(name: string, filters: Array<[string, unknown]> = [], range: { from?: string; to?: string } = {}, max = Infinity): any {
  return {
    where: (f: string, _op: string, v: unknown) => query(name, [...filters, [f, v]], range, max),
    orderBy: () => query(name, filters, range, max),
    startAt: (v: string) => query(name, filters, { ...range, from: v }, max),
    endBefore: (v: string) => query(name, filters, { ...range, to: v }, max),
    limit: (n: number) => query(name, filters, range, n),
    get: async () => {
      const docs = [...col(name).keys()].sort()
        .filter((id) => (range.from == null || id >= range.from) && (range.to == null || id < range.to))
        .filter((id) => filters.every(([f, v]) => col(name).get(id)![f] === v))
        .slice(0, max)
        .map((id) => snap(name, id));
      return { empty: docs.length === 0, docs };
    },
  };
}

const fakeDb = {
  settings: () => undefined,
  collection: (name: string) => ({
    doc: (id: string) => docRef(name, id),
    add: async (d: Doc) => {
      const id = `auto_${++autoId}`;
      col(name).set(id, structuredClone(d));
      return { id };
    },
    ...query(name),
  }),
  runTransaction: async <T,>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const writes: Array<() => void> = [];
    const tx = {
      get: async (r: Ref) => snap(r._c, r.id),
      getAll: async (...refs: Ref[]) => refs.map((r) => snap(r._c, r.id)),
      create: (r: Ref, d: Doc) => {
        if (col(r._c).has(r.id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
        writes.push(() => col(r._c).set(r.id, structuredClone(d)));
      },
      set: (r: Ref, d: Doc) => writes.push(() => col(r._c).set(r.id, structuredClone(d))),
      update: (r: Ref, d: Doc) => writes.push(() => col(r._c).set(r.id, { ...col(r._c).get(r.id), ...structuredClone(d) })),
      delete: (r: Ref) => writes.push(() => col(r._c).delete(r.id)),
    };
    const result = await fn(tx);
    for (const w of writes) w();
    return result;
  },
};

vi.mock('firebase-admin/app', () => ({
  cert: (x: unknown) => x,
  getApps: () => [],
  initializeApp: () => ({ name: 'fel-creator' }),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
  FieldPath: { documentId: () => DOC_ID },
}));

const { firestoreCreatorStore, creatorFirestoreConfig } = await import('./creatorStore.firestore');

const NOW = new Date('2026-10-05T12:00:00Z');
const LATER = new Date('2026-10-05T14:00:00Z');

function booking(id: string, cells: string[], over: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id,
    serviceId: 'elijah-bonds:session-60',
    profileSlug: 'elijah-bonds',
    slotStart: '2026-10-06T23:00:00.000Z',
    slotEnd: '2026-10-07T00:00:00.000Z',
    cellIds: cells,
    status: 'HOLD',
    holdExpiresAt: '2026-10-05T13:01:00.000Z',
    checkoutSessionId: null,
    paymentIntentId: null,
    email: null,
    amountCents: 15000,
    currency: 'usd',
    priceIsExample: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

const A = 'elijah-bonds_1791327600000';
const B = 'elijah-bonds_1791329400000';
const C = 'elijah-bonds_1791331200000';

const stores: Array<[string, () => CreatorStore]> = [
  ['memory', () => memoryCreatorStore().store],
  ['firestore adapter', () => firestoreCreatorStore({ projectId: 'demo', clientEmail: 'x@demo.iam.gserviceaccount.com', privateKey: 'k' })],
];

beforeEach(() => {
  data.clear();
});

describe.each(stores)('CreatorStore contract: %s', (_name, make) => {
  it('holds all cells or none, and treats an expired hold as free', async () => {
    const s = make();
    expect(await s.holdSlot(booking('b1', [A, B]), NOW)).toBe('HELD');
    expect(await s.holdSlot(booking('b2', [B, C]), NOW)).toBe('TAKEN');
    expect(await s.listTakenCells('elijah-bonds', 'elijah-bonds_0', 'elijah-bonds_9', NOW)).toEqual(new Set([A, B]));
    // b2 took nothing.
    expect(await s.getBooking('b2')).toBeNull();
    // After the hold lapses the cells are free again.
    expect(await s.listTakenCells('elijah-bonds', 'elijah-bonds_0', 'elijah-bonds_9', LATER)).toEqual(new Set());
    expect(await s.holdSlot(booking('b3', [B, C]), LATER)).toBe('HELD');
  });

  it('confirms once, then books the cells for good', async () => {
    const s = make();
    await s.holdSlot(booking('b1', [A, B]), NOW);
    await s.attachCheckoutSession('b1', 'cs_1', NOW);
    const paid = { paymentIntentId: 'pi_1', email: 'x@example.com', amountCents: 15000, currency: 'usd' };
    expect(await s.confirmBooking('b1', paid, NOW)).toBe('CONFIRMED');
    expect(await s.confirmBooking('b1', paid, NOW)).toBe('ALREADY');
    expect(await s.getBooking('b1')).toMatchObject({ status: 'CONFIRMED', checkoutSessionId: 'cs_1', paymentIntentId: 'pi_1' });
    expect(await s.findBookingByPaymentIntent('pi_1')).toMatchObject({ id: 'b1' });
    // Booked cells never lapse.
    expect(await s.listTakenCells('elijah-bonds', 'elijah-bonds_0', 'elijah-bonds_9', LATER)).toEqual(new Set([A, B]));
    expect(await s.holdSlot(booking('b2', [B]), LATER)).toBe('TAKEN');
    expect(await s.confirmBooking('nope', paid, NOW)).toBe('NOT_FOUND');
  });

  it('marks CONFLICT when another live booking owns a cell', async () => {
    const s = make();
    await s.holdSlot(booking('b1', [A, B]), NOW);
    await s.holdSlot(booking('b2', [B], { holdExpiresAt: '2026-10-05T15:00:00.000Z' }), LATER);
    expect(await s.confirmBooking('b1', { paymentIntentId: 'pi_1', email: null, amountCents: null, currency: null }, LATER)).toBe('CONFLICT');
    expect((await s.getBooking('b1'))?.status).toBe('CONFLICT');
  });

  it('releases only its own cells, respects the allowed statuses, and is idempotent', async () => {
    const s = make();
    await s.holdSlot(booking('b1', [A, B]), NOW);
    await s.confirmBooking('b1', { paymentIntentId: 'pi_1', email: null, amountCents: null, currency: null }, NOW);
    expect(await s.releaseBooking('b1', 'EXPIRED', ['HOLD'], NOW)).toBe('SKIPPED');
    expect(await s.releaseBooking('b1', 'CANCELLED', ['HOLD', 'CONFIRMED'], NOW)).toBe('RELEASED');
    expect(await s.releaseBooking('b1', 'CANCELLED', ['HOLD', 'CONFIRMED'], NOW)).toBe('ALREADY');
    expect(await s.listTakenCells('elijah-bonds', 'elijah-bonds_0', 'elijah-bonds_9', NOW)).toEqual(new Set());
    expect(await s.releaseBooking('missing', 'CANCELLED', ['HOLD'], NOW)).toBe('NOT_FOUND');
  });

  it('remembers events once and finds refunded payment intents', async () => {
    const s = make();
    expect(await s.hasEvent('evt_1')).toBe(false);
    await s.rememberEvent('evt_1', 'charge.refunded', 'pi_9');
    await s.rememberEvent('evt_1', 'charge.refunded', 'pi_9');
    expect(await s.hasEvent('evt_1')).toBe(true);
    expect(await s.isPaymentIntentRefunded('pi_9')).toBe(true);
    expect(await s.isPaymentIntentRefunded('pi_other')).toBe(false);
  });

  it('writes inquiries and create-if-absent fulfillment orders', async () => {
    const s = make();
    const { id } = await s.createInquiry({
      brand: 'b', contactName: 'c', email: 'e@x.test', budgetRange: 'not-sure', dates: '', deliverables: 'd', message: '',
      consent: true, profileSlug: null, status: 'NEW', source: 'work-with-us', ipHash: null, createdAt: NOW.toISOString(),
    });
    expect(id).toBeTruthy();
    const order = {
      orderId: 'order_1', provider: 'printful' as const, status: 'STUB_NOT_SENT' as const, items: [], itemCostCents: 100,
      shippingCents: 5, currency: 'usd', costIsExample: true, request: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    };
    expect((await s.saveFulfillmentOrder(order)).created).toBe(true);
    const again = await s.saveFulfillmentOrder({ ...order, itemCostCents: 1 });
    expect(again.created).toBe(false);
    expect(again.record.itemCostCents).toBe(100);
    expect(await s.getFulfillmentOrder('printful', 'order_1')).toMatchObject({ status: 'STUB_NOT_SENT' });
    expect(await s.getFulfillmentOrder('manual', 'order_1')).toBeNull();
  });
});

describe('Firestore config', () => {
  it('is null without the service account, and reads the project from the JSON or the email', () => {
    expect(creatorFirestoreConfig({} as NodeJS.ProcessEnv)).toBeNull();
    const json = JSON.stringify({ client_email: 'svc@fel-demo.iam.gserviceaccount.com', private_key: 'k', project_id: 'fel-json' });
    expect(creatorFirestoreConfig({ FIREBASE_SERVICE_ACCOUNT_JSON: json } as unknown as NodeJS.ProcessEnv)?.projectId).toBe('fel-json');
    expect(creatorFirestoreConfig({ FIREBASE_CLIENT_EMAIL: 'svc@fel-demo.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: 'k' } as unknown as NodeJS.ProcessEnv)?.projectId)
      .toBe('fel-demo');
  });
});
