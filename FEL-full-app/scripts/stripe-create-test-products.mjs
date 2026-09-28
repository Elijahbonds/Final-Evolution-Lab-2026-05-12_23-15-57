#!/usr/bin/env node
// Create the book shop's Stripe Products and Prices in TEST mode, one per row of a price file.
//
//   export STRIPE_BOOKS_SECRET_KEY=sk_test_...     (your own shell; never commit it)
//   node scripts/stripe-create-test-products.mjs --allow-example            dry run: prints the plan, no Stripe calls
//   node scripts/stripe-create-test-products.mjs --apply --allow-example    finds or creates each Product and Price
//   node scripts/stripe-create-test-products.mjs --file <prices.json> --apply   a price file with real (non-EXAMPLE) rows
//
// Refuses any key that is not sk_test_. Rows marked EXAMPLE are refused unless --allow-example is passed.
// Idempotent: a Product is found by metadata.offerId and a Price by lookup_key fel_book_<offerId>, so a second
// run creates nothing. Every row must match its offer in lib/books/bookCatalog.ts (format, cents, EXAMPLE flag,
// direct sale), so the Stripe Price can never charge a different amount from the one the page shows.
// The last thing printed is an offerId -> price_... table to paste into the catalog's stripePriceId.
// Needs Node 22.18+ (it imports the TypeScript catalog directly); on an older Node run it with `npx tsx`.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Same pin as lib/stripe.ts and lib/books/bookCheckout.ts.
const API_VERSION = '2025-04-30.basil';
const DEFAULT_FILE = fileURLToPath(new URL('./stripe-prices.example.json', import.meta.url));
const EXAMPLE_DESCRIPTION = 'EXAMPLE price — placeholder, not a final price.';

export function lookupKey(offerId) {
  return `fel_book_${offerId}`;
}

export function parseArgs(argv) {
  const opts = { apply: false, allowExample: false, file: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--allow-example') opts.allowExample = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--file') {
      opts.file = argv[i + 1];
      i += 1;
      if (!opts.file) throw new Error('--file needs a path');
    } else throw new Error(`unknown argument ${arg}`);
  }
  return opts;
}

/** Null when the key is a Stripe test secret key; otherwise the reason it is refused. */
export function testKeyProblem(key) {
  if (!key) return 'STRIPE_BOOKS_SECRET_KEY is not set. Export an sk_test_ key in your own shell.';
  if (!key.startsWith('sk_test_')) return 'STRIPE_BOOKS_SECRET_KEY is not an sk_test_ key. This script is test-mode only; live keys are refused.';
  return null;
}

export function readPriceFile(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.rows)) throw new Error(`${file} has no "rows" array`);
  return parsed.rows;
}

/**
 * Checks every row against the catalog and returns what would be created. `catalog` is the
 * bookCatalog module (getOffer, getBook, formatLabel). Nothing here talks to Stripe.
 */
export function planRows(rows, catalog, { allowExample }) {
  const errors = [];
  const plan = [];
  const seen = new Set();
  for (const row of rows) {
    const id = row?.offerId;
    if (typeof id !== 'string' || id === '') { errors.push(`a row has no offerId: ${JSON.stringify(row)}`); continue; }
    if (seen.has(id)) { errors.push(`${id}: listed twice`); continue; }
    seen.add(id);
    const offer = catalog.getOffer(id);
    const book = offer && catalog.getBook(offer.bookSlug);
    if (!offer || !book) { errors.push(`${id}: not an offer in lib/books/bookCatalog.ts`); continue; }
    if (!offer.directSale) { errors.push(`${id}: not for direct sale in the catalog (${offer.directSaleNote ?? 'directSale is false'})`); continue; }
    if (row.bookSlug !== offer.bookSlug || row.format !== offer.format) {
      errors.push(`${id}: bookSlug/format ${row.bookSlug}/${row.format} do not match the catalog's ${offer.bookSlug}/${offer.format}`);
      continue;
    }
    if (!Number.isInteger(row.unitAmountCents) || row.unitAmountCents <= 0) { errors.push(`${id}: unitAmountCents must be a positive integer`); continue; }
    if (row.unitAmountCents !== offer.priceCents) {
      errors.push(`${id}: ${row.unitAmountCents} cents here but ${offer.priceCents} in the catalog. Change priceCents in the catalog too, so the page shows what Stripe charges.`);
      continue;
    }
    if (typeof row.currency !== 'string' || !/^[a-z]{3}$/.test(row.currency)) { errors.push(`${id}: currency must be a lowercase ISO code like "usd"`); continue; }
    if (typeof row.EXAMPLE !== 'boolean') { errors.push(`${id}: EXAMPLE must be true or false`); continue; }
    if (row.EXAMPLE !== offer.priceIsExample) {
      errors.push(`${id}: EXAMPLE is ${row.EXAMPLE} here but priceIsExample is ${offer.priceIsExample} in the catalog`);
      continue;
    }
    if (row.EXAMPLE && !allowExample) {
      errors.push(`${id}: EXAMPLE price, refused. Pass --allow-example to create it in test mode anyway.`);
      continue;
    }
    plan.push({
      offerId: id,
      bookSlug: offer.bookSlug,
      format: offer.format,
      unitAmountCents: row.unitAmountCents,
      currency: row.currency,
      example: row.EXAMPLE,
      lookupKey: lookupKey(id),
      productName: `${book.title} — ${catalog.formatLabel(offer.format)}`,
      // Mirrors checkoutParamsForOffer's price_data, so a pasted Price id shows the buyer the same line.
      productDescription: row.EXAMPLE ? EXAMPLE_DESCRIPTION : book.description,
    });
  }
  return { plan, errors };
}

/** Every active Product that carries an offerId, keyed by it. Pages through the whole list. */
export async function listBookProducts(stripe) {
  const byOffer = new Map();
  let startingAfter;
  for (;;) {
    const page = await stripe.products.list({ active: true, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    for (const product of page.data) {
      const offerId = product.metadata?.offerId;
      if (offerId && !byOffer.has(offerId)) byOffer.set(offerId, product);
    }
    if (!page.has_more || page.data.length === 0) return byOffer;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

function priceProductId(price) {
  return typeof price.product === 'string' ? price.product : price.product?.id;
}

/** Finds or creates one row's Product and Price. Returns what it did. */
export async function syncRow(stripe, item, productsByOffer) {
  let product = productsByOffer.get(item.offerId);
  let productAction = 'found';
  if (!product) {
    product = await stripe.products.create({
      name: item.productName,
      description: item.productDescription,
      metadata: { offerId: item.offerId, bookSlug: item.bookSlug, format: item.format },
    });
    productsByOffer.set(item.offerId, product);
    productAction = 'created';
  } else if (product.name !== item.productName || product.description !== item.productDescription) {
    product = await stripe.products.update(product.id, { name: item.productName, description: item.productDescription });
    productsByOffer.set(item.offerId, product);
    productAction = 'updated';
  }

  const existing = (await stripe.prices.list({ lookup_keys: [item.lookupKey], limit: 1 })).data[0];
  if (
    existing
    && existing.active
    && priceProductId(existing) === product.id
    && existing.unit_amount === item.unitAmountCents
    && existing.currency === item.currency
  ) {
    return { offerId: item.offerId, productId: product.id, productAction, priceId: existing.id, priceAction: 'found' };
  }

  // Prices are immutable. A changed amount gets a new Price, and the lookup key moves to it.
  const price = await stripe.prices.create({
    product: product.id,
    currency: item.currency,
    unit_amount: item.unitAmountCents,
    lookup_key: item.lookupKey,
    ...(existing ? { transfer_lookup_key: true } : {}),
    ...(item.example ? { nickname: 'EXAMPLE price, not decided' } : {}),
    metadata: { offerId: item.offerId, example: String(item.example) },
  });
  return { offerId: item.offerId, productId: product.id, productAction, priceId: price.id, priceAction: existing ? 'replaced' : 'created' };
}

function table(rows, columns) {
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
  return [line(columns), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(columns.map((c) => r[c])))].join('\n');
}

async function makeStripe(key) {
  const { default: Stripe } = await import('stripe');
  return new Stripe(key, { apiVersion: API_VERSION });
}

/** The whole script, with its edges injectable for tests. Returns the exit code. */
export async function run({
  argv,
  env,
  catalog,
  readRows = readPriceFile,
  createStripe = makeStripe,
  log = console.log,
  error = console.error,
}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    error(e.message);
    return 1;
  }
  if (opts.help) {
    log('node scripts/stripe-create-test-products.mjs [--apply] [--allow-example] [--file <prices.json>]');
    return 0;
  }

  const key = env.STRIPE_BOOKS_SECRET_KEY ?? '';
  const problem = testKeyProblem(key);
  if (problem) {
    error(problem);
    return 1;
  }

  const file = opts.file ?? DEFAULT_FILE;
  let rows;
  try {
    rows = readRows(file);
  } catch (e) {
    error(`Could not read ${file}: ${e.message}`);
    return 1;
  }
  const { plan, errors } = planRows(rows, catalog, { allowExample: opts.allowExample });
  if (errors.length > 0) {
    error(`Refused ${errors.length} row(s) in ${file}. Nothing was sent to Stripe.`);
    for (const e of errors) error(`  ${e}`);
    return 1;
  }

  if (!opts.apply) {
    log(`DRY RUN (test mode). ${plan.length} offer(s) from ${file}. No Stripe calls were made.`);
    log(table(plan.map((p) => ({
      offerId: p.offerId,
      amount: `${(p.unitAmountCents / 100).toFixed(2)} ${p.currency}${p.example ? ' EXAMPLE' : ''}`,
      lookup_key: p.lookupKey,
      product: p.productName,
    })), ['offerId', 'amount', 'lookup_key', 'product']));
    log('Pass --apply to find or create these Products and Prices.');
    return 0;
  }

  const stripe = await createStripe(key);
  const productsByOffer = await listBookProducts(stripe);
  const results = [];
  for (const item of plan) {
    try {
      results.push(await syncRow(stripe, item, productsByOffer));
    } catch (e) {
      error(`${item.offerId}: ${e.message}`);
      if (results.length > 0) log(table(results, ['offerId', 'priceId', 'priceAction']));
      error(`Stopped after ${results.length} of ${plan.length}. Run it again; finished rows are found, not duplicated.`);
      return 1;
    }
  }
  log(`Done (test mode). ${plan.length} offer(s).`);
  log(table(results.map((r) => ({ ...r, arrow: '->' })), ['offerId', 'arrow', 'priceId', 'priceAction', 'productId', 'productAction']));
  log("Paste each price id into that offer's stripePriceId in lib/books/bookCatalog.ts.");
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  let catalog;
  try {
    catalog = await import('../lib/books/bookCatalog.ts');
  } catch (e) {
    console.error(`Could not load lib/books/bookCatalog.ts (${e.message}). Use Node 22.18+ or run it with npx tsx.`);
    process.exit(1);
  }
  process.exitCode = await run({ argv: process.argv.slice(2), env: process.env, catalog });
}
