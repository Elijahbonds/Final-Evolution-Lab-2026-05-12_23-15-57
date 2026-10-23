// Test-only (LAUNCH-SALES, 2026-10-20). The money suites' shared harness:
//
//   1. FIXTURES IN THE CURRENT STRIPE API SHAPE. lib/stripe.ts pins '2025-04-30.basil'; the SDK in node_modules
//      (stripe 22.x) types '2026-07-29.dahlia', which keeps basil's layout for every field used here. Each builder's
//      object literal is checked against the SDK's own types (`DeepPartial<Stripe.X>`), so tsc fails if a fixture
//      carries a field Stripe removed — invoice.subscription, invoice.charge, invoice.payment_intent,
//      subscription.current_period_end or charge.invoice. The old handlers read exactly those (B-W3).
//   2. A FAKE STRIPE CLIENT holding sessions, subscriptions, invoices, invoice payments and payment intents in memory,
//      recording what the code under test created or cancelled. No network.
//   3. A PRISMA DATE GUARD. Prisma's runtime refuses an Invalid Date before any query
//      (public/_prisma/client/runtime/library.js: "Provided Date object is invalid"); writeSpyDb does not. Wrapping
//      the spy client makes a test fail the way production does when code writes `new Date(NaN)`.
//
// Imported by tests only. It lives under tests/ so lib/nav/modules.test.ts does not count it as a shipped module.
import type Stripe from 'stripe';
import { spyPrisma, type SpyDb, type Row } from './writeSpyDb';

type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export const NOW_UNIX = 1_790_000_000; // 2026-09-21T13:33:20Z
export const PERIOD_END_UNIX = NOW_UNIX + 30 * 86_400;

// ── Users ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const ADULT = 'user-adult';
export const MINOR = 'user-minor';
export const UNKNOWN_AGE = 'user-unknown-age';

/** One verified adult (born 1990), one 14-year-old, one account with no birth year. */
export function seedBuyers(db: SpyDb): void {
  const now = new Date().getFullYear();
  (db.tables.user ??= []).push(
    { id: ADULT, email: 'adult@fel.test', dobYear: 1990 },
    { id: MINOR, email: 'minor@fel.test', dobYear: now - 14 },
    { id: UNKNOWN_AGE, email: 'unknown@fel.test', dobYear: null },
  );
}

// ── Fixtures (current API shape) ────────────────────────────────────────────────────────────────────────────────
export function subscriptionFixture(o: {
  id: string;
  customer?: string;
  status?: Stripe.Subscription.Status;
  periodEnd?: number;
  priceId?: string;
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
}): Stripe.Subscription {
  const sub: DeepPartial<Stripe.Subscription> = {
    id: o.id,
    object: 'subscription',
    customer: o.customer ?? 'cus_adult',
    status: o.status ?? 'active',
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
    metadata: o.metadata ?? {},
    // basil: the period lives on each ITEM. There is no top-level current_period_end.
    items: {
      object: 'list',
      data: [{
        id: `si_${o.id}`,
        object: 'subscription_item',
        current_period_start: NOW_UNIX,
        current_period_end: o.periodEnd ?? PERIOD_END_UNIX,
        price: { id: o.priceId ?? `price_${o.id}` },
      }],
    },
  };
  return sub as unknown as Stripe.Subscription;
}

export function invoiceFixture(o: {
  id: string;
  subscription: string;
  paymentIntent: string;
  amountPaid: number;
  periodEnd?: number;
  metadata?: Record<string, string>;
  billingReason?: Stripe.Invoice.BillingReason;
}): Stripe.Invoice {
  const invoice: DeepPartial<Stripe.Invoice> = {
    id: o.id,
    object: 'invoice',
    amount_paid: o.amountPaid,
    billing_reason: o.billingReason ?? 'subscription_cycle',
    // basil: the subscription is named under parent.subscription_details. There is no invoice.subscription.
    parent: {
      type: 'subscription_details',
      quote_details: null,
      subscription_details: { subscription: o.subscription, metadata: o.metadata ?? {} },
    },
    lines: {
      object: 'list',
      data: [{
        id: `il_${o.id}`,
        object: 'line_item',
        amount: o.amountPaid,
        period: { start: NOW_UNIX, end: o.periodEnd ?? PERIOD_END_UNIX },
        parent: {
          type: 'subscription_item_details',
          subscription_item_details: { subscription: o.subscription, subscription_item: `si_${o.subscription}`, invoice_item: null, proration: false, proration_details: null },
        },
      }],
    },
    // basil: the payment is on invoice.payments. There is no invoice.charge or invoice.payment_intent.
    payments: {
      object: 'list',
      data: [{ id: `inpay_${o.id}`, object: 'invoice_payment', invoice: o.id, payment: { type: 'payment_intent', payment_intent: o.paymentIntent } }],
    },
  };
  return invoice as unknown as Stripe.Invoice;
}

export function chargeFixture(o: {
  id: string;
  paymentIntent: string;
  amount: number;
  customer?: string;
  refunded?: boolean;
  amountRefunded?: number;
  metadata?: Record<string, string>;
}): Stripe.Charge {
  const refunded = o.refunded ?? true;
  const charge: DeepPartial<Stripe.Charge> = {
    id: o.id,
    object: 'charge',
    amount: o.amount,
    amount_refunded: o.amountRefunded ?? (refunded ? o.amount : 0),
    refunded,
    customer: o.customer ?? 'cus_adult',
    payment_intent: o.paymentIntent,
    // basil: a charge no longer names its invoice. There is no charge.invoice.
    metadata: o.metadata ?? {},
  };
  return charge as unknown as Stripe.Charge;
}

export function checkoutSessionFixture(o: {
  id: string;
  mode?: Stripe.Checkout.Session.Mode;
  amountTotal: number;
  metadata: Record<string, string>;
  paymentIntent?: string | null;
  subscription?: string | null;
  clientReferenceId?: string | null;
  customer?: string;
}): Stripe.Checkout.Session {
  const session: DeepPartial<Stripe.Checkout.Session> = {
    id: o.id,
    object: 'checkout.session',
    mode: o.mode ?? 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: o.amountTotal,
    customer: o.customer ?? 'cus_adult',
    client_reference_id: o.clientReferenceId ?? null,
    payment_intent: o.paymentIntent ?? null,
    subscription: o.subscription ?? null,
    metadata: o.metadata,
    customer_details: { email: 'adult@fel.test' },
  };
  return session as unknown as Stripe.Checkout.Session;
}

let eventSeq = 0;
export function eventFixture(type: string, object: unknown, id?: string): Stripe.Event {
  return { id: id ?? `evt_${++eventSeq}`, object: 'event', type, livemode: false, data: { object } } as unknown as Stripe.Event;
}

/** A signed POST to a webhook route. The fake client's constructEvent hands the event straight back. */
export function webhookRequest(event: Stripe.Event): any {
  return {
    text: async () => JSON.stringify(event),
    headers: { get: (k: string) => (k.toLowerCase() === 'stripe-signature' ? 'sig_test' : null) },
  };
}

/** A JSON POST to a route, signed in or not (next-auth is mocked by the suite). */
export function jsonRequest(body: unknown): any {
  return {
    json: async () => body,
    headers: new Headers({ origin: 'https://evil.example', 'x-forwarded-for': '203.0.113.9' }),
    nextUrl: { origin: 'https://fel.test' },
  };
}

// ── Fake Stripe ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface FakeStripe {
  sessions: Record<string, Row>;
  subscriptions: Record<string, Row>;
  invoices: Record<string, Row>;
  paymentIntents: Record<string, Row>;
  created: Row[];
  cancelled: string[];
  customersCreated: Row[];
  client: any;
}

export function fakeStripe(): FakeStripe {
  const f: FakeStripe = {
    sessions: {}, subscriptions: {}, invoices: {}, paymentIntents: {},
    created: [], cancelled: [], customersCreated: [], client: null,
  };
  const missing = (what: string, id: string) =>
    Object.assign(new Error(`No such ${what}: ${id}`), { statusCode: 404, type: 'StripeInvalidRequestError', code: 'resource_missing' });
  const list = (data: Row[]) => ({ object: 'list', data, has_more: false });
  f.client = {
    customers: {
      create: async (a: Row) => { const c = { id: `cus_${f.customersCreated.length + 1}`, ...a }; f.customersCreated.push(c); return c; },
    },
    checkout: {
      sessions: {
        create: async (params: Row) => {
          const id = `cs_created_${f.created.length + 1}`;
          f.created.push(params);
          return { id, url: `https://checkout.stripe.test/${id}` };
        },
        retrieve: async (id: string) => { if (!f.sessions[id]) throw missing('checkout session', id); return f.sessions[id]; },
        list: async (a: Row = {}) => list(Object.values(f.sessions).filter((s) => !a.payment_intent || s.payment_intent === a.payment_intent).slice(0, a.limit ?? 10)),
        listLineItems: async () => list([]),
        expire: async (id: string) => ({ id, status: 'expired' }),
      },
    },
    subscriptions: {
      retrieve: async (id: string) => { if (!f.subscriptions[id]) throw missing('subscription', id); return f.subscriptions[id]; },
      cancel: async (id: string) => {
        if (!f.subscriptions[id]) throw missing('subscription', id);
        f.cancelled.push(id);
        f.subscriptions[id] = { ...f.subscriptions[id], status: 'canceled' };
        return f.subscriptions[id];
      },
    },
    invoices: {
      retrieve: async (id: string) => { if (!f.invoices[id]) throw missing('invoice', id); return f.invoices[id]; },
      list: async (a: Row = {}) => list(Object.values(f.invoices).slice(0, a.limit ?? 10)),
    },
    invoicePayments: {
      list: async (a: Row = {}) => {
        const pi = a.payment?.payment_intent;
        const hits: Row[] = [];
        for (const inv of Object.values(f.invoices)) {
          for (const p of inv.payments?.data ?? []) {
            if (p.payment?.payment_intent === pi) hits.push({ ...p, invoice: a.expand?.includes('data.invoice') ? inv : inv.id });
          }
        }
        return list(hits.slice(0, a.limit ?? 10));
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => f.paymentIntents[id] ?? { id, metadata: {}, latest_charge: { id: `ch_${id}`, balance_transaction: { fee: 59 } } },
    },
    charges: {
      retrieve: async (id: string) => ({ id, balance_transaction: { fee: 59 } }),
    },
    webhooks: { constructEvent: (raw: string) => JSON.parse(raw) },
  };
  return f;
}

// ── Prisma date guard ───────────────────────────────────────────────────────────────────────────────────────────
function invalidDateIn(value: unknown, path: string): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const hit = invalidDateIn(value[i], `${path}[${i}]`); if (hit) return hit; }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { const hit = invalidDateIn(v, path ? `${path}.${k}` : k); if (hit) return hit; }
  }
  return null;
}

/** The spy client, refusing an Invalid Date anywhere in a call's arguments the way Prisma's runtime does. */
export function guardedPrisma(db: SpyDb): any {
  const inner = spyPrisma(db);
  const client: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === '$transaction') {
        return async (arg: unknown) => {
          db.calls.push({ op: '$transaction', args: typeof arg === 'function' ? 'callback' : 'array' });
          return typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(client) : Promise.all(arg as Promise<unknown>[]);
        };
      }
      const model = inner[prop as string];
      return new Proxy({}, {
        get: (_m, method) => {
          if (typeof method === 'symbol' || method === 'then') return undefined;
          return (a?: unknown) => {
            const bad = invalidDateIn(a, '');
            if (bad) {
              return Promise.reject(Object.assign(
                new Error(`Invalid value for argument \`${bad}\`: Provided Date object is invalid. Expected Date.`),
                { name: 'PrismaClientValidationError' },
              ));
            }
            return model[method](a);
          };
        },
      });
    },
  });
  return client;
}

/**
 * The client with some models' tables missing, the way production answers before a pending SQL file is applied:
 * every call on those models rejects with Prisma's P2021 ("The table ... does not exist").
 */
export function withMissingTables(client: any, models: readonly string[]): any {
  if (!models.length) return client;
  return new Proxy(client, {
    get: (target, prop) => {
      if (typeof prop === 'string' && models.includes(prop)) {
        return new Proxy({}, {
          get: () => async () => { throw Object.assign(new Error(`The table \`public.${prop}\` does not exist in the current database.`), { code: 'P2021' }); },
        });
      }
      return target[prop];
    },
  });
}

export type { SpyDb, Row };
