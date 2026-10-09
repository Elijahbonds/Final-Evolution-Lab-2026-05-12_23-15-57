import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fulfillmentProvider, placeFulfillmentOrders, quoteCart, FulfillmentUnavailable } from './fulfillment';
import { PRINTFUL_FIXTURE, forwardOrder, printfulConfig, sendPrintfulRequest, syncProducts } from './printful';
import { COLLECTIONS, fulfillmentCollection, memoryCreatorStore } from './creatorStore';

const ON = { PRINTFUL_ENABLED: '1', PRINTFUL_API_TOKEN: 'pf_secret_token_value' } as unknown as NodeJS.ProcessEnv;
const OFF = {} as NodeJS.ProcessEnv;
const RECIPIENT = { name: 'Test Buyer', address1: '1 Test St', city: 'Los Angeles', stateCode: 'CA', countryCode: 'US', zip: '90001' };

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => { throw new Error('network is not allowed in this test'); });
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe('printful, off by default', () => {
  it('is off without the flag, and off with the flag but no token', () => {
    expect(printfulConfig(OFF)).toEqual({ requested: false, hasToken: false, enabled: false });
    expect(printfulConfig({ PRINTFUL_ENABLED: '1' } as unknown as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(printfulConfig({ PRINTFUL_API_TOKEN: 'x' } as unknown as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(printfulConfig(ON).enabled).toBe(true);
  });

  it('off: syncProducts returns the five-item fixture and plans nothing', async () => {
    const result = await syncProducts(OFF);
    expect(result.mode).toBe('off');
    expect(result.products.map((p) => p.kind)).toEqual(['hoodie', 'hoodie', 'tee', 'hat', 'joggers']);
    expect(result.products.every((p) => p.isFixture && p.priceIsExample)).toBe(true);
    expect(result.plannedRequests).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('on: builds the Printful requests but makes no network call, and never exposes the token', async () => {
    const result = await syncProducts(ON);
    expect(result.mode).toBe('dry-run');
    expect(result.plannedRequests[0]).toMatchObject({ method: 'GET', url: 'https://api.printful.com/store/products?limit=100' });
    expect(JSON.stringify(result)).not.toContain('pf_secret_token_value');

    const quotes = await quoteCart([{ productId: 'fel-tee', variantId: 'fixture-tee-m', quantity: 2 }], RECIPIENT, ON);
    expect(quotes[0].plannedRequest).toMatchObject({ method: 'POST', url: 'https://api.printful.com/shipping/rates' });

    const db = memoryCreatorStore();
    await placeFulfillmentOrders({ orderId: 'order_abc123', lines: [{ productId: 'fel-hat', variantId: null, quantity: 1 }], recipient: RECIPIENT }, db.store, ON);
    await expect(sendPrintfulRequest(result.plannedRequests[0])).rejects.toThrow(/disabled/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('fulfillment orders', () => {
  it('forwardOrder writes a printfulOrders doc with STUB_NOT_SENT, once per order id', async () => {
    const db = memoryCreatorStore();
    const input = {
      orderId: 'order_abc123',
      lines: [{ productId: 'fel-tee', variantId: 'fixture-tee-l', quantity: 1 }],
      recipient: RECIPIENT,
      itemCostCents: 1200,
      shippingCents: 599,
      perItemCostCents: [1200],
      costIsExample: true,
    };
    const first = await forwardOrder(input, db.store);
    const second = await forwardOrder({ ...input, itemCostCents: 1 }, db.store);
    expect(fulfillmentCollection('printful')).toBe(COLLECTIONS.printfulOrders);
    expect(COLLECTIONS.printfulOrders).toBe('printfulOrders');
    expect(first).toMatchObject({ status: 'STUB_NOT_SENT', created: true });
    expect(second.created).toBe(false);
    expect(second.record.itemCostCents).toBe(1200);
    expect(db.orders.size).toBe(1);
    expect((first.record.request as { body: { external_id: string } }).body.external_id).toBe('order_abc123');
    expect(JSON.stringify(first.record)).toContain('Bearer [redacted]');
    await expect(forwardOrder({ ...input, orderId: 'bad id!' }, db.store)).rejects.toThrow();
  });

  it('quotes from the provider and stores the item cost on the order for the payout split', async () => {
    const db = memoryCreatorStore();
    const lines = [
      { productId: 'fel-hoodie-m', variantId: 'fixture-hoodie-m-l', quantity: 1 },
      { productId: 'fel-tee', variantId: 'fixture-tee-s', quantity: 2 },
    ];
    const [quote] = await quoteCart(lines, RECIPIENT, OFF);
    expect(quote).toMatchObject({ provider: 'printful', itemCostCents: 2800 + 2 * 1200, perItemCostCents: [2800, 2400], isEstimate: true, costIsExample: true });

    const [placed] = await placeFulfillmentOrders({ orderId: 'order_cost01', lines, recipient: RECIPIENT }, db.store, OFF);
    expect(placed.record).toMatchObject({ provider: 'printful', status: 'STUB_NOT_SENT', itemCostCents: 5200 });
    expect(placed.record.items.map((i) => i.itemCostCents)).toEqual([2800, 2400]);
    expect(await fulfillmentProvider('printful').getStatus('order_cost01', db.store)).toMatchObject({ status: 'STUB_NOT_SENT' });
  });

  it('manual products record MANUAL_PENDING with their catalog cost; printify refuses', async () => {
    const db = memoryCreatorStore();
    const manual = fulfillmentProvider('manual');
    const lines = [{ productId: 'signed-basketball', variantId: null, quantity: 1 }];
    const quote = await manual.quote({ lines, recipient: RECIPIENT }, OFF);
    expect(quote.itemCostCents).toBe(4000);
    const placed = await manual.createOrder({ orderId: 'order_manual1', lines, recipient: RECIPIENT }, quote, db.store, new Date());
    expect(placed.record).toMatchObject({ provider: 'manual', status: 'MANUAL_PENDING', itemCostCents: 4000 });
    expect(fulfillmentCollection('manual')).toBe('manualOrders');

    await expect(fulfillmentProvider('printify').quote({ lines, recipient: RECIPIENT }, OFF)).rejects.toBeInstanceOf(FulfillmentUnavailable);
  });

  it('refuses an unapproved or unknown product in a cart', async () => {
    await expect(quoteCart([{ productId: 'signed-basketball', variantId: null, quantity: 1 }], RECIPIENT, OFF)).rejects.toThrow(/unknown product/);
    await expect(quoteCart([{ productId: 'nope', variantId: null, quantity: 1 }], RECIPIENT, OFF)).rejects.toThrow(/unknown product/);
    await expect(quoteCart([{ productId: 'fel-tee', variantId: null, quantity: 0 }], RECIPIENT, OFF)).rejects.toThrow(/quantity/);
  });

  it('the fixture matches the catalog products', () => {
    expect(PRINTFUL_FIXTURE).toHaveLength(5);
  });
});
