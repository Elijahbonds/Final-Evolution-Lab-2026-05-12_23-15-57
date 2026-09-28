/**
 * Printful — the first fulfillment module. Stubbed: this build makes no live Printful call.
 *
 * Gated by PRINTFUL_ENABLED (default off) plus PRINTFUL_API_TOKEN.
 * - Off: syncProducts() returns a 5-item fixture and merch shows "Coming soon" with no buy button.
 * - On: the Printful requests are built (and returned, token redacted) but not sent. `sendPrintfulRequest`
 *   refuses while PRINTFUL_LIVE_CALLS is false, which it is in this lane.
 * - forwardOrder() writes a `printfulOrders/{orderId}` doc with status STUB_NOT_SENT. Our order id is the
 *   document id and Printful's `external_id`, so a retry cannot create a second order.
 *
 * Costs and prices in the fixture are EXAMPLE numbers, not Printful's price list.
 */

import { creatorFlagOn } from './creatorEnv';
import type { CreatorFulfillmentStore, FulfillmentOrderRecord } from './creatorStore';

export const PRINTFUL_API = 'https://api.printful.com';
/** Hard off in this lane. Turning live calls on is its own reviewed change. */
export const PRINTFUL_LIVE_CALLS = false;
export const REDACTED = 'Bearer [redacted]';

export interface PrintfulConfig {
  /** PRINTFUL_ENABLED is on. */
  requested: boolean;
  hasToken: boolean;
  /** Both of the above. */
  enabled: boolean;
}

export function printfulConfig(env: NodeJS.ProcessEnv = process.env): PrintfulConfig {
  const requested = creatorFlagOn(env, 'PRINTFUL_ENABLED');
  const hasToken = Boolean((env.PRINTFUL_API_TOKEN ?? '').trim());
  return { requested, hasToken, enabled: requested && hasToken };
}

export interface PlannedRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** The request as it would be sent, with the token redacted. Safe to log and to store. */
export function planPrintfulRequest(method: PlannedRequest['method'], path: string, body?: unknown): PlannedRequest {
  const plan: PlannedRequest = {
    method,
    url: `${PRINTFUL_API}${path}`,
    headers: { Authorization: REDACTED, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) plan.body = body;
  return plan;
}

export class PrintfulLiveCallsDisabled extends Error {
  constructor() {
    super('Printful live calls are disabled in this build. Nothing was sent.');
    this.name = 'PrintfulLiveCallsDisabled';
  }
}

/**
 * The network boundary. In this lane it always refuses (PRINTFUL_LIVE_CALLS is false); a live sender that
 * reads PRINTFUL_API_TOKEN is a separate, reviewed change.
 */
export async function sendPrintfulRequest(plan: PlannedRequest): Promise<never> {
  void plan;
  throw new PrintfulLiveCallsDisabled();
}

export interface MerchVariant {
  id: string;
  label: string;
  /** EXAMPLE provider cost. The payout split reads the cost stored on the order, not this. */
  itemCostCents: number;
}

export interface MerchItem {
  /** Matches a CreatorProduct id in creatorCatalog.ts. */
  productId: string;
  name: string;
  kind: 'hoodie' | 'tee' | 'hat' | 'joggers';
  retailPriceCents: number;
  priceIsExample: boolean;
  costIsExample: boolean;
  variants: MerchVariant[];
  isFixture: boolean;
}

function sized(prefix: string, cost: number): MerchVariant[] {
  return ['S', 'M', 'L', 'XL'].map((size) => ({ id: `${prefix}-${size.toLowerCase()}`, label: size, itemCostCents: cost }));
}

/** Five items: hoodie (M and W), tee, hat, joggers. Fixture ids, not Printful ids. */
export const PRINTFUL_FIXTURE: readonly MerchItem[] = [
  { productId: 'fel-hoodie-m', name: 'FEL Hoodie — Men\'s', kind: 'hoodie', retailPriceCents: 6000, priceIsExample: true, costIsExample: true, variants: sized('fixture-hoodie-m', 2800), isFixture: true },
  { productId: 'fel-hoodie-w', name: 'FEL Hoodie — Women\'s', kind: 'hoodie', retailPriceCents: 6000, priceIsExample: true, costIsExample: true, variants: sized('fixture-hoodie-w', 2800), isFixture: true },
  { productId: 'fel-tee', name: 'FEL Tee', kind: 'tee', retailPriceCents: 3000, priceIsExample: true, costIsExample: true, variants: sized('fixture-tee', 1200), isFixture: true },
  { productId: 'fel-hat', name: 'FEL Hat', kind: 'hat', retailPriceCents: 3000, priceIsExample: true, costIsExample: true, variants: [{ id: 'fixture-hat-os', label: 'One size', itemCostCents: 1500 }], isFixture: true },
  { productId: 'fel-joggers', name: 'FEL Joggers', kind: 'joggers', retailPriceCents: 5500, priceIsExample: true, costIsExample: true, variants: sized('fixture-joggers', 2600), isFixture: true },
];

/** EXAMPLE flat shipping for a fixture quote. */
export const EXAMPLE_SHIPPING_CENTS = 599;

export interface SyncResult {
  mode: 'off' | 'dry-run';
  products: MerchItem[];
  /** What would be requested with the flag on. Empty when off. */
  plannedRequests: PlannedRequest[];
}

export async function syncProducts(env: NodeJS.ProcessEnv = process.env): Promise<SyncResult> {
  const config = printfulConfig(env);
  const products = PRINTFUL_FIXTURE.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v })) }));
  if (!config.enabled) return { mode: 'off', products, plannedRequests: [] };
  // With the flag on, a live build would list the sync products and then read each one. Built, not sent.
  return {
    mode: 'dry-run',
    products,
    plannedRequests: [planPrintfulRequest('GET', '/store/products?limit=100')],
  };
}

export function findFixtureVariant(productId: string, variantId: string | null): { item: MerchItem; variant: MerchVariant } | null {
  const item = PRINTFUL_FIXTURE.find((p) => p.productId === productId);
  if (!item) return null;
  const variant = variantId ? item.variants.find((v) => v.id === variantId) : item.variants[0];
  return variant ? { item, variant } : null;
}

export interface FulfillmentRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  stateCode?: string;
  countryCode: string;
  zip: string;
  email?: string;
}

export interface FulfillmentLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

function recipientBody(r: FulfillmentRecipient) {
  return {
    name: r.name,
    address1: r.address1,
    address2: r.address2,
    city: r.city,
    state_code: r.stateCode,
    country_code: r.countryCode,
    zip: r.zip,
  };
}

/** POST /shipping/rates — what a live quote would send. */
export function planShippingRates(lines: FulfillmentLine[], recipient: FulfillmentRecipient): PlannedRequest {
  return planPrintfulRequest('POST', '/shipping/rates', {
    recipient: recipientBody(recipient),
    items: lines.map((l) => ({ external_variant_id: l.variantId ?? l.productId, quantity: l.quantity })),
    currency: 'USD',
  });
}

/** POST /orders as a draft (confirm=false). `external_id` is our order id. */
export function planCreateOrder(orderId: string, lines: FulfillmentLine[], recipient: FulfillmentRecipient): PlannedRequest {
  return planPrintfulRequest('POST', '/orders?confirm=false', {
    external_id: orderId,
    recipient: recipientBody(recipient),
    items: lines.map((l) => ({ external_variant_id: l.variantId ?? l.productId, quantity: l.quantity })),
  });
}

export interface ForwardOrderInput {
  orderId: string;
  lines: FulfillmentLine[];
  recipient: FulfillmentRecipient;
  itemCostCents: number;
  shippingCents: number;
  perItemCostCents: number[];
  costIsExample: boolean;
}

/**
 * Record the order Printful would receive. Nothing is sent: the doc says STUB_NOT_SENT and carries the
 * planned request. Create-if-absent on the order id, so a retry returns the first record.
 */
export async function forwardOrder(
  input: ForwardOrderInput,
  store: CreatorFulfillmentStore,
  now: Date = new Date(),
): Promise<{ status: 'STUB_NOT_SENT'; created: boolean; record: FulfillmentOrderRecord }> {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(input.orderId)) throw new Error('order id must be 6-64 url-safe characters');
  const stamp = now.toISOString();
  const record: FulfillmentOrderRecord = {
    orderId: input.orderId,
    provider: 'printful',
    status: 'STUB_NOT_SENT',
    items: input.lines.map((l, i) => ({
      productId: l.productId,
      variantId: l.variantId,
      quantity: l.quantity,
      itemCostCents: input.perItemCostCents[i] ?? 0,
    })),
    itemCostCents: input.itemCostCents,
    shippingCents: input.shippingCents,
    currency: 'usd',
    costIsExample: input.costIsExample,
    request: planCreateOrder(input.orderId, input.lines, input.recipient),
    createdAt: stamp,
    updatedAt: stamp,
  };
  const saved = await store.saveFulfillmentOrder(record);
  return { status: 'STUB_NOT_SENT', created: saved.created, record: saved.record };
}
