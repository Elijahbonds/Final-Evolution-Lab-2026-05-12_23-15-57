/**
 * Provider-agnostic fulfillment: quote, createOrder, getStatus, handleWebhook.
 *
 * Each catalog product names its provider:
 *   printful — print on demand, the first module (lib/creator/printful.ts), still no live calls
 *   printify — declared so a product can name it; the module is not built and refuses
 *   manual   — owayo team jerseys and self-shipped inventory (signed basketballs). Recorded as MANUAL_PENDING
 *              for a person to ship.
 *
 * Our order id is the idempotency key everywhere: the Firestore doc id and the provider's external id.
 * The provider's item cost is stored on the order, so a creator payout split can use it later.
 */

import { getProduct, type CreatorProduct, type FulfillmentProviderId } from './creatorCatalog';
import type { CreatorFulfillmentStore, FulfillmentOrderRecord } from './creatorStore';
import {
  EXAMPLE_SHIPPING_CENTS,
  findFixtureVariant,
  forwardOrder,
  planShippingRates,
  printfulConfig,
  type FulfillmentLine,
  type FulfillmentRecipient,
  type PlannedRequest,
} from './printful';

export type { FulfillmentLine, FulfillmentRecipient } from './printful';

export interface FulfillmentQuote {
  provider: FulfillmentProviderId;
  /** Cost per line, same order as the lines passed in. */
  perItemCostCents: number[];
  itemCostCents: number;
  shippingCents: number;
  currency: 'usd';
  /** True while the numbers come from a fixture or the catalog rather than the provider. */
  isEstimate: boolean;
  costIsExample: boolean;
  source: 'fixture' | 'catalog';
  /** The provider request a live quote would send. */
  plannedRequest: PlannedRequest | null;
}

export interface FulfillmentOrderInput {
  orderId: string;
  lines: FulfillmentLine[];
  recipient: FulfillmentRecipient;
}

export class FulfillmentUnavailable extends Error {
  constructor(readonly provider: FulfillmentProviderId, message: string) {
    super(message);
    this.name = 'FulfillmentUnavailable';
  }
}

export interface FulfillmentProvider {
  id: FulfillmentProviderId;
  enabled(env: NodeJS.ProcessEnv): boolean;
  quote(input: Omit<FulfillmentOrderInput, 'orderId'>, env: NodeJS.ProcessEnv): Promise<FulfillmentQuote>;
  createOrder(
    input: FulfillmentOrderInput,
    quote: FulfillmentQuote,
    store: CreatorFulfillmentStore,
    now: Date,
  ): Promise<{ created: boolean; record: FulfillmentOrderRecord }>;
  getStatus(orderId: string, store: CreatorFulfillmentStore): Promise<FulfillmentOrderRecord | null>;
  handleWebhook(payload: unknown): Promise<{ ok: true; ignored: string }>;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

const printful: FulfillmentProvider = {
  id: 'printful',
  enabled: (env) => printfulConfig(env).enabled,
  async quote(input) {
    const perItem = input.lines.map((line) => {
      const found = findFixtureVariant(line.productId, line.variantId);
      if (!found) throw new FulfillmentUnavailable('printful', `no Printful variant for ${line.productId}`);
      return found.variant.itemCostCents * line.quantity;
    });
    return {
      provider: 'printful',
      perItemCostCents: perItem,
      itemCostCents: sum(perItem),
      shippingCents: EXAMPLE_SHIPPING_CENTS,
      currency: 'usd',
      isEstimate: true,
      costIsExample: true,
      source: 'fixture',
      plannedRequest: planShippingRates(input.lines, input.recipient),
    };
  },
  async createOrder(input, quote, store, now) {
    const result = await forwardOrder({
      orderId: input.orderId,
      lines: input.lines,
      recipient: input.recipient,
      itemCostCents: quote.itemCostCents,
      shippingCents: quote.shippingCents,
      perItemCostCents: quote.perItemCostCents,
      costIsExample: quote.costIsExample,
    }, store, now);
    return { created: result.created, record: result.record };
  },
  getStatus: (orderId, store) => store.getFulfillmentOrder('printful', orderId),
  // Printful webhooks (package_shipped, order_failed) have no route in Phase 1.
  handleWebhook: async () => ({ ok: true, ignored: 'printful webhooks are not wired in this build' }),
};

const printify: FulfillmentProvider = {
  id: 'printify',
  enabled: () => false,
  async quote() {
    throw new FulfillmentUnavailable('printify', 'The Printify module is not built. Printful vs Printify is Elijah\'s decision.');
  },
  async createOrder() {
    throw new FulfillmentUnavailable('printify', 'The Printify module is not built.');
  },
  getStatus: (orderId, store) => store.getFulfillmentOrder('printify', orderId),
  handleWebhook: async () => ({ ok: true, ignored: 'printify is not built' }),
};

/** EXAMPLE cost for a self-shipped item when the catalog has none. */
export const EXAMPLE_MANUAL_COST_CENTS = 0;

const manual: FulfillmentProvider = {
  id: 'manual',
  enabled: () => true,
  async quote(input) {
    const perItem = input.lines.map((line) => {
      const product = getProduct(line.productId);
      if (!product || product.provider !== 'manual') throw new FulfillmentUnavailable('manual', `${line.productId} is not a manual product`);
      return (product.manualCostCents ?? EXAMPLE_MANUAL_COST_CENTS) * line.quantity;
    });
    return {
      provider: 'manual',
      perItemCostCents: perItem,
      itemCostCents: sum(perItem),
      shippingCents: EXAMPLE_SHIPPING_CENTS,
      currency: 'usd',
      isEstimate: true,
      costIsExample: true,
      source: 'catalog',
      plannedRequest: null,
    };
  },
  async createOrder(input, quote, store, now) {
    const stamp = now.toISOString();
    return store.saveFulfillmentOrder({
      orderId: input.orderId,
      provider: 'manual',
      status: 'MANUAL_PENDING',
      items: input.lines.map((l, i) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, itemCostCents: quote.perItemCostCents[i] ?? 0 })),
      itemCostCents: quote.itemCostCents,
      shippingCents: quote.shippingCents,
      currency: 'usd',
      costIsExample: quote.costIsExample,
      request: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
  },
  getStatus: (orderId, store) => store.getFulfillmentOrder('manual', orderId),
  handleWebhook: async () => ({ ok: true, ignored: 'manual orders have no webhook' }),
};

const PROVIDERS: Record<FulfillmentProviderId, FulfillmentProvider> = { printful, printify, manual };

export function fulfillmentProvider(id: FulfillmentProviderId): FulfillmentProvider {
  return PROVIDERS[id];
}

function groupByProvider(lines: FulfillmentLine[]): Map<FulfillmentProviderId, FulfillmentLine[]> {
  const out = new Map<FulfillmentProviderId, FulfillmentLine[]>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw new Error(`bad quantity on ${line.productId}`);
    const product: CreatorProduct | undefined = getProduct(line.productId);
    if (!product || !product.approved) throw new Error(`unknown product ${line.productId}`);
    const list = out.get(product.provider) ?? [];
    list.push(line);
    out.set(product.provider, list);
  }
  return out;
}

/** One quote per provider the cart touches. Checkout adds these to the order before payment. */
export async function quoteCart(
  lines: FulfillmentLine[],
  recipient: FulfillmentRecipient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FulfillmentQuote[]> {
  const quotes: FulfillmentQuote[] = [];
  for (const [provider, group] of groupByProvider(lines)) {
    quotes.push(await PROVIDERS[provider].quote({ lines: group, recipient }, env));
  }
  return quotes;
}

/**
 * After payment: one provider order per provider, each stored with its item cost. `orderId` is ours; with
 * more than one provider the provider's name is appended so each doc id stays unique and stable on retry.
 */
export async function placeFulfillmentOrders(
  input: FulfillmentOrderInput,
  store: CreatorFulfillmentStore,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<Array<{ created: boolean; record: FulfillmentOrderRecord }>> {
  const groups = groupByProvider(input.lines);
  const out: Array<{ created: boolean; record: FulfillmentOrderRecord }> = [];
  for (const [provider, lines] of groups) {
    const mod = PROVIDERS[provider];
    const orderId = groups.size > 1 ? `${input.orderId}-${provider}` : input.orderId;
    const quote = await mod.quote({ lines, recipient: input.recipient }, env);
    out.push(await mod.createOrder({ orderId, lines, recipient: input.recipient }, quote, store, now));
  }
  return out;
}
