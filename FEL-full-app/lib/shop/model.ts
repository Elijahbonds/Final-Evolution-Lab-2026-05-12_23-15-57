// lib/shop/model.ts — PLAT-P07 (2026-11-02): one shape for every storefront. Owner, 2026-10-27: the app "still feels
// cheap", and the marketplace had twelve storefront-like routes, each with its own header, buttons and empty state.
// Every product now reads as a ShopItem: one card (components/shop/product-card.tsx), one price formatter
// (lib/coach-store/priceLabel.ts shopPriceLabel), one buy sheet (what you get → the terms tick → pay) and one "Opens soon".
//
// `state` is never a new flag. It is each product's own switch, read where it already lives:
//   coach_package  the package's own action (lib/coach-business/packages.ts PackageAction: 'book' only while payments are
//                  live for that coach), else Opens soon;
//   store_listing  the coach store's own switch (the page 404s while it is off; on, a listing sells);
//   book           the offer's own directSale, the book terms (lib/books/bookTerms.ts) and isPurchaseOpen('books');
//   pro            isPurchaseOpen('fel_pro') (VIRTUAL_PURCHASES_ENABLED + PURCHASES_ALLOWLIST).
// Fail-closed (#144) is untouched: a storefront whose switch is off still 404s before any of this runs.
//
// Pure. Client-safe.
import { shopPriceLabel, type ShopCadence } from '@/lib/coach-store/priceLabel';

// GROUP-BOOKING (2026-11-02): 'group_class' (a seat in a group class) and 'session' (a 1:1), reserved and paid at the gym
// until the owner switches online payment on (lib/group-booking/rules.ts payPlan).
export type ShopKind = 'coach_package' | 'store_listing' | 'book' | 'pro' | 'group_class' | 'session';
export type ShopState = 'buy' | 'opens_soon' | 'owned';
export type { ShopCadence };

export interface ShopItem {
  id: string;
  kind: ShopKind;
  title: string;
  /** One line about it, in the source's words, or null. */
  oneLine: string | null;
  /** shopPriceLabel's line ("$65.00", "$29.99/month"), or null when the source has no price. */
  priceLabel: string | null;
  cadence: ShopCadence;
  state: ShopState;
}

/** The most words a product card may show: title, one line and price (the brief's ≤ 20). */
export const CARD_MAX_WORDS = 20;
/** A coach on the /coaches list: name, a few words of their headline, the "from" price (their page has the rest). (new) */
export const COACH_CARD_MAX_WORDS = 12;
export const wordsOf = (s: string | null | undefined): number => (s ?? '').split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;

/** The card's one line, trimmed to what fits beside the title and the price (whole words, an ellipsis when cut). */
export function cardLine(title: string, line: string | null, price: string | null, max: number = CARD_MAX_WORDS): string | null {
  if (!line) return null;
  const room = max - wordsOf(title) - wordsOf(price);
  if (room <= 0) return null;
  const words = line.trim().split(/\s+/);
  let kept: string[] = [], n = 0;
  for (const w of words) { const c = /[A-Za-z0-9]/.test(w) ? 1 : 0; if (n + c > room) break; kept.push(w); n += c; }
  if (!kept.length) return null;
  return kept.length < words.length ? `${kept.join(' ').replace(/[.,;:—–-]+$/, '')}…` : line.trim();
}

const item = (i: Omit<ShopItem, 'oneLine' | 'priceLabel'> & { oneLine: string | null; cents: number | null }): ShopItem => {
  const priceLabel = i.cents === null ? null : shopPriceLabel(i.cents, i.cadence);
  const { cents: _c, ...rest } = i;
  return { ...rest, priceLabel, oneLine: cardLine(i.title, i.oneLine, priceLabel) };
};

// ── adapters ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A coach's package (lib/coach-business/packages.ts) on their page. 'book' sells; 'apply' and 'full' do not. */
export function coachPackageItem(p: { id: string; title: string; summary: string | null; priceCents: number; kind: string; action: 'book' | 'apply' | 'full' | null }): ShopItem {
  return item({ id: p.id, kind: 'coach_package', title: p.title, oneLine: p.summary, cents: p.priceCents, cadence: p.kind === 'monthly' ? 'month' : 'once',
    state: p.action === 'book' ? 'buy' : 'opens_soon' });
}

/** A coach-store listing (lib/coach-store/manifest.ts): sells while the store's own switch is on (else the page 404s). */
export function storeListingItem(l: { id: string; title: string; description: string | null; priceCents: number; interval?: 'month' | 'week' | null }): ShopItem {
  return item({ id: l.id, kind: 'store_listing', title: l.title, oneLine: l.description, cents: l.priceCents, cadence: l.interval ?? 'once', state: 'buy' });
}

/** A book offer (lib/books/bookCatalog.ts): sells only when the offer is a direct sale, its format is allowed and books are open. */
export function bookItem(b: { slug: string; title: string; description: string | null; placeholder?: boolean }, o: { id: string; priceCents: number; directSale: boolean }, open: { formatAllowed: boolean; purchasesOpen: boolean; owned?: boolean }): ShopItem {
  return item({ id: o.id, kind: 'book', title: b.title, oneLine: b.placeholder ? null : b.description, cents: o.priceCents, cadence: 'once',
    state: open.owned ? 'owned' : o.directSale && open.formatAllowed && open.purchasesOpen ? 'buy' : 'opens_soon' });
}

/** FEL Pro, one card per plan (lib/payments/proBuy.ts), at the products' own prices (lib/stripe.ts). */
export function proItems(prices: { weekly: number; monthly: number }, open: boolean, owned = false): ShopItem[] {
  const state: ShopState = owned ? 'owned' : open ? 'buy' : 'opens_soon';
  return [
    item({ id: 'monthly', kind: 'pro', title: 'Monthly', oneLine: null, cents: prices.monthly, cadence: 'month', state }),
    item({ id: 'weekly', kind: 'pro', title: 'Weekly', oneLine: null, cents: prices.weekly, cadence: 'week', state }),
  ];
}

/** A coach on /coaches (lib/coach-business/market.ts MarketCard): the card opens their page, so it carries no buy state.
 *  Its price is the lowest package's, "from $120.00/month". */
export function coachCardItem(c: { slug: string; displayName: string; headline: string | null; fromPriceCents: number | null; fromMonthly: boolean; acceptingClients: boolean }): ShopItem {
  const cadence: ShopCadence = c.fromMonthly ? 'month' : 'once';
  const price = c.fromPriceCents === null ? null : `from ${shopPriceLabel(c.fromPriceCents, cadence)}`;
  return { id: c.slug, kind: 'coach_package', title: c.displayName, oneLine: cardLine(c.displayName, c.headline, price, COACH_CARD_MAX_WORDS), priceLabel: price, cadence, state: c.acceptingClients ? 'buy' : 'opens_soon' };
}
