// PLAT-P07 (2026-11-02): the one buy sheet and the one Opens soon.
//   · payments off: every product (coach package, store listing, book, FEL Pro) shows Opens soon, no buy entry, and 0
//     checkout calls are made;
//   · payments on: the sheet is what you get → the terms tick → pay; pay does nothing until the box is ticked, then POSTs
//     the product's own route once, and each refusal reads as a plain line.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductCard } from '@/components/shop/product-card';
import { BuyEntry, BuySheet } from '@/components/shop/buy-sheet';
import { PackageBuy } from '@/components/coach-business/package-actions';
import { BookBuy } from '@/components/shop/book-buy';
import { bookItem, coachPackageItem, proItems, storeListingItem, type ShopItem } from '@/lib/shop/model';
import { payBook, payCoachPackage, payPro, readOutcome, TERMS_CHANGED_LINE } from '@/lib/shop/checkout';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { mount } from '@/tests/helpers/hookRuntime';

afterEach(() => { vi.unstubAllGlobals(); });

const soon: Record<string, ShopItem> = {
  coach_package: coachPackageItem({ id: 'p1', title: 'Session pack', summary: null, priceCents: 20000, kind: 'session_pack', action: 'apply' }),
  store_listing: { ...storeListingItem({ id: 'l1', title: 'Video review', description: null, priceCents: 4000 }), state: 'opens_soon' },
  book: bookItem({ slug: 'b', title: 'The Blueprint', description: null }, { id: 'b-audio', priceCents: 1499, directSale: true }, { formatAllowed: true, purchasesOpen: false }),
  pro: proItems({ weekly: 600, monthly: 999 }, false)[0],
};

describe('payments off: Opens soon, no button, no checkout call', () => {
  it.each(Object.entries(soon))('%s', (_kind, item) => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const entry = h(BuyEntry, { item, label: 'Buy', terms: { href: '/purchase-terms' }, pay: async () => ({ kind: 'line', line: 'x' }) });
    const html = renderToStaticMarkup(h(ProductCard, { item }, entry));
    expect(html).toContain('data-opens-soon');
    expect(html).toContain('Opens soon');
    expect(html).not.toContain('data-buy-entry');
    expect(html).not.toMatch(/not set up yet/i);
    expect(html).not.toMatch(/checkout/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('the real buy entries draw nothing for a product that is not on sale', () => {
    expect(renderToStaticMarkup(h(PackageBuy, { slug: 'jo', item: soon.coach_package, includes: [] }))).toBe('');
    expect(renderToStaticMarkup(h(BookBuy, { item: soon.book }))).toBe('');
  });
});

/** Every element of a tree (child components stay elements). */
function* walk(n: unknown): Generator<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(n)) { for (const x of n) yield* walk(x); return; }
  if (!isValidElement(n)) return;
  const el = n as ReactElement<Record<string, unknown>>;
  yield el;
  for (const v of Object.values(el.props ?? {})) if (isValidElement(v) || Array.isArray(v)) yield* walk(v);
}

describe('payments on: the sheet is what you get → the terms tick → pay', () => {
  it('pay does nothing until the box is ticked, then calls the product\'s pay once', async () => {
    const item = coachPackageItem({ id: 'p1', title: 'Session pack', summary: null, priceCents: 20000, kind: 'session_pack', action: 'book' });
    const pay = vi.fn(async () => ({ kind: 'line' as const, line: 'Buying is for adults (18+).' }));
    const m = mount(() => BuySheet({ item, includes: ['4 sessions'], terms: { href: '/purchase-terms' }, pay, onClose: () => {} }));
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const find = (f: (el: ReactElement<Record<string, unknown>>) => boolean) => [...walk(m.tree as ReactNode)].find(f);
    const text = () => JSON.stringify([...walk(m.tree as ReactNode)].flatMap((e) => [e.props.children].flat()).filter((c) => typeof c === 'string'));
    expect(find((e) => e.props.href === '/purchase-terms')).toBeTruthy();
    const press = () => (find((e) => e.type === PrimaryCta)!.props.onClick as () => void)();
    press(); await flush();
    expect(pay).not.toHaveBeenCalled();
    expect(text()).toContain('Tick the box first.');
    (find((e) => e.props.type === 'checkbox')!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    await flush();
    press(); await flush(); await flush();
    expect(pay).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Buying is for adults (18+).');
    m.unmount();
  });

  it('each product POSTs its own existing route — never a GET', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const f = (async (url: string, init?: RequestInit) => { calls.push([url, init]); return new Response(JSON.stringify({ url: 'https://checkout.example/x' }), { status: 200 }); }) as unknown as typeof fetch;
    await payCoachPackage(f, { slug: 'jo', packageId: 'p1', termsVersion: 'v1' });
    await payBook(f, { offerId: 'b-audio', termsVersion: 'v1', back: '/press', key: 'k' });
    await payPro(f, { plan: 'monthly', termsVersion: 'v1' });
    expect(calls.map(([u, i]) => [u, i?.method])).toEqual([['/api/coach/business/checkout', 'POST'], ['/api/books/checkout', 'POST'], ['/api/stripe/checkout', 'POST']]);
    expect(JSON.parse(String(calls[0][1]!.body))).toEqual({ packageId: 'p1', termsAccepted: true, termsVersion: 'v1' });
  });

  it('the routes\' refusals read as plain lines', () => {
    expect(readOutcome({ status: 401, json: {} }, '/press')).toMatchObject({ kind: 'sign_in' });
    expect(readOutcome({ status: 409, json: { error: 'terms_required' } }, '/x')).toEqual({ kind: 'terms_changed', line: TERMS_CHANGED_LINE });
    expect(readOutcome({ status: 403, json: { error: 'adults_only' } }, '/press')).toMatchObject({ kind: 'line', href: '/age?next=%2Fpress' });
    expect(readOutcome({ status: 409, json: { error: 'store_closed', message: "Payments aren't live yet." } }, '/x')).toEqual({ kind: 'line', line: "Payments aren't live yet." });
    expect(readOutcome(null, '/x').kind).toBe('line');
  });

  it('a product on sale shows its entry, with the page\'s data-action', () => {
    const item = coachPackageItem({ id: 'p1', title: 'Session pack', summary: null, priceCents: 20000, kind: 'session_pack', action: 'book' });
    const html = renderToStaticMarkup(h(PackageBuy, { slug: 'jo', item, includes: [] }));
    expect(html).toContain('data-action="book"');
    expect(html).toContain('data-buy-entry="coach_package"');
    expect(PrimaryCta).toBeTruthy();
  });
});
