import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as catalog from './bookCatalog';
import { BOOKS, getOffer } from './bookCatalog';
import { lookupKey, run } from '../../scripts/stripe-create-test-products.mjs';

const PRICE_FILE = path.resolve(__dirname, '../../scripts/stripe-prices.example.json');
const TEST_KEY = 'sk_test_placeholder_not_a_real_key';

interface Row { offerId: string; bookSlug: string; format: string; unitAmountCents: number; currency: string; EXAMPLE: boolean }
const priceFile = JSON.parse(readFileSync(PRICE_FILE, 'utf8')) as { _warning: string; rows: Row[] };

interface FakeProduct { id: string; active: boolean; name: string; description?: string; metadata: Record<string, string> }
interface FakePrice { id: string; active: boolean; product: string; unit_amount: number; currency: string; lookup_key: string | null }

/** An in-memory Stripe with just the calls the script makes. `calls` records every one. */
function fakeStripe() {
  const products: FakeProduct[] = [];
  const prices: FakePrice[] = [];
  const calls: string[] = [];
  let seq = 0;
  const client = {
    products: {
      list: vi.fn(async (params: { active?: boolean; limit?: number; starting_after?: string }) => {
        calls.push('products.list');
        const all = products.filter((p) => params.active === undefined || p.active === params.active);
        const start = params.starting_after ? all.findIndex((p) => p.id === params.starting_after) + 1 : 0;
        const limit = params.limit ?? 10;
        return { data: all.slice(start, start + limit), has_more: start + limit < all.length };
      }),
      create: vi.fn(async (params: Omit<FakeProduct, 'id' | 'active'>) => {
        calls.push('products.create');
        const product = { id: `prod_${++seq}`, active: true, ...params };
        products.push(product);
        return product;
      }),
      update: vi.fn(async (id: string, params: Partial<FakeProduct>) => {
        calls.push('products.update');
        const product = products.find((p) => p.id === id)!;
        Object.assign(product, params);
        return product;
      }),
    },
    prices: {
      list: vi.fn(async (params: { lookup_keys: string[] }) => {
        calls.push('prices.list');
        return { data: prices.filter((p) => p.active && p.lookup_key && params.lookup_keys.includes(p.lookup_key)), has_more: false };
      }),
      create: vi.fn(async (params: Omit<FakePrice, 'id' | 'active'> & { transfer_lookup_key?: boolean }) => {
        calls.push('prices.create');
        const { transfer_lookup_key, ...rest } = params;
        const holder = prices.find((p) => p.lookup_key === rest.lookup_key);
        if (holder && !transfer_lookup_key) throw new Error('lookup_key already in use');
        if (holder) holder.lookup_key = null;
        const price = { id: `price_${++seq}`, active: true, ...rest };
        prices.push(price);
        return price;
      }),
    },
  };
  return { client, products, prices, calls };
}

async function runScript(argv: string[], opts: { key?: string; stripe?: ReturnType<typeof fakeStripe>; rows?: Row[] } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const createStripe = vi.fn(async () => opts.stripe?.client);
  const code = await run({
    argv,
    env: { STRIPE_BOOKS_SECRET_KEY: opts.key ?? TEST_KEY },
    catalog,
    readRows: () => opts.rows ?? priceFile.rows,
    createStripe,
    log: (line: string) => out.push(line),
    error: (line: string) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n'), createStripe };
}

describe('the example price file', () => {
  it('is marked as example prices, not a decision', () => {
    expect(priceFile._warning).toBe('EXAMPLE PRICES. NOT DECIDED. Elijah sets real prices.');
    expect(priceFile.rows.every((row) => row.EXAMPLE === true)).toBe(true);
  });

  it('names only real catalog offers, at the catalog amounts, in usd', () => {
    for (const row of priceFile.rows) {
      const offer = getOffer(row.offerId);
      expect(offer, row.offerId).toBeDefined();
      expect(row.bookSlug).toBe(offer!.bookSlug);
      expect(row.format).toBe(offer!.format);
      expect(row.unitAmountCents).toBe(offer!.priceCents);
      expect(row.EXAMPLE).toBe(offer!.priceIsExample);
      expect(row.currency).toBe('usd');
    }
  });

  it('lists every direct-sale offer once and leaves out the KDP-blocked ebooks and bundles', () => {
    const directSale = BOOKS.flatMap((b) => b.offers).filter((o) => o.directSale).map((o) => o.id);
    expect(priceFile.rows.map((r) => r.offerId)).toEqual(directSale);
    expect(priceFile.rows.some((r) => r.offerId === 'art-of-dunking:ebook' || r.offerId === 'art-of-dunking:bundle')).toBe(false);
  });
});

describe('stripe-create-test-products', () => {
  it('refuses a live key, or no key, before reading anything or calling Stripe', async () => {
    for (const key of ['sk_live_placeholder', 'rk_test_placeholder', '']) {
      const stripe = fakeStripe();
      const result = await runScript(['--apply', '--allow-example'], { key, stripe });
      expect(result.code).toBe(1);
      expect(result.err).toMatch(/STRIPE_BOOKS_SECRET_KEY/);
      expect(result.createStripe).not.toHaveBeenCalled();
      expect(stripe.calls).toEqual([]);
    }
  });

  it('dry run by default: prints the plan and makes no Stripe calls', async () => {
    const stripe = fakeStripe();
    const result = await runScript(['--allow-example'], { stripe });
    expect(result.code).toBe(0);
    expect(result.createStripe).not.toHaveBeenCalled();
    expect(stripe.calls).toEqual([]);
    expect(result.out).toMatch(/DRY RUN/);
    for (const row of priceFile.rows) expect(result.out).toContain(lookupKey(row.offerId));
  });

  it('refuses EXAMPLE rows without --allow-example, with or without --apply', async () => {
    for (const argv of [['--apply'], []]) {
      const stripe = fakeStripe();
      const result = await runScript(argv, { stripe });
      expect(result.code).toBe(1);
      expect(result.err).toMatch(/EXAMPLE price, refused/);
      expect(result.createStripe).not.toHaveBeenCalled();
      expect(stripe.calls).toEqual([]);
    }
  });

  it('refuses a row whose amount differs from the catalog, or that is not for direct sale', async () => {
    const stripe = fakeStripe();
    const rows = [
      { ...priceFile.rows[0], unitAmountCents: priceFile.rows[0].unitAmountCents + 100 },
      { offerId: 'art-of-dunking:ebook', bookSlug: 'art-of-dunking', format: 'ebook', unitAmountCents: 999, currency: 'usd', EXAMPLE: true },
      { ...priceFile.rows[1], offerId: 'no-such-book:ebook' },
    ];
    const result = await runScript(['--apply', '--allow-example'], { stripe, rows });
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/in the catalog/);
    expect(result.err).toMatch(/not for direct sale/);
    expect(result.err).toMatch(/not an offer/);
    expect(stripe.calls).toEqual([]);
  });

  it('creates each Product and Price once; a second run finds them and creates nothing', async () => {
    const stripe = fakeStripe();
    // Other products on the account push the book products past the first page.
    for (let i = 0; i < 120; i += 1) stripe.products.push({ id: `prod_other_${i}`, active: true, name: `Lab Credits ${i}`, metadata: {} });
    const n = priceFile.rows.length;

    const first = await runScript(['--apply', '--allow-example'], { stripe });
    expect(first.code).toBe(0);
    expect(stripe.calls.filter((c) => c === 'products.create')).toHaveLength(n);
    expect(stripe.calls.filter((c) => c === 'prices.create')).toHaveLength(n);
    for (const row of priceFile.rows) {
      const product = stripe.products.find((p) => p.metadata.offerId === row.offerId)!;
      const price = stripe.prices.find((p) => p.lookup_key === lookupKey(row.offerId))!;
      expect(product.description).toBe('EXAMPLE price — placeholder, not a final price.');
      expect(price).toMatchObject({ product: product.id, unit_amount: row.unitAmountCents, currency: 'usd' });
      expect(first.out).toContain(price.id);
    }

    stripe.calls.length = 0;
    const second = await runScript(['--apply', '--allow-example'], { stripe });
    expect(second.code).toBe(0);
    expect(stripe.calls.filter((c) => c.endsWith('.create') || c.endsWith('.update'))).toEqual([]);
    expect(stripe.products.filter((p) => p.metadata.offerId)).toHaveLength(n);
    expect(stripe.prices).toHaveLength(n);
    for (const price of stripe.prices) expect(second.out).toContain(price.id);
  });

  it('moves the lookup key to a new Price when an amount changes', async () => {
    const stripe = fakeStripe();
    const row = priceFile.rows[0];
    stripe.products.push({ id: 'prod_old', active: true, name: 'x', description: 'x', metadata: { offerId: row.offerId } });
    stripe.prices.push({ id: 'price_old', active: true, product: 'prod_old', unit_amount: 1, currency: 'usd', lookup_key: lookupKey(row.offerId) });

    const result = await runScript(['--apply', '--allow-example'], { stripe, rows: [row] });
    expect(result.code).toBe(0);
    expect(stripe.prices.find((p) => p.id === 'price_old')!.lookup_key).toBeNull();
    const current = stripe.prices.find((p) => p.lookup_key === lookupKey(row.offerId))!;
    expect(current).toMatchObject({ product: 'prod_old', unit_amount: row.unitAmountCents });
    expect(result.out).toMatch(/replaced/);
    expect(stripe.products[0].name).not.toBe('x');
  });
});
