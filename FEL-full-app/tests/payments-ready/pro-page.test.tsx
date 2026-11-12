// PAYMENTS-READY: /pro, the FEL Pro buy page, rendered for real (server page → client component's first paint).
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: { user: { id: 'adult-1' } } as any, redirected: null as string | null }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { h.redirected = to; throw new Error('NEXT_REDIRECT'); } }));

const { default: ProPage } = await import('@/app/pro/page');
const { STORE_TERMS_VERSION } = await import('@/lib/store-terms');
const { PRO_CLOSED_LINE } = await import('@/lib/payments/proBuy');

const KEYS = ['VIRTUAL_PURCHASES_ENABLED', 'PURCHASES_ALLOWLIST'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } h.session = { user: { id: 'adult-1' } }; h.redirected = null; });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const render = async (plan?: string) => renderToStaticMarkup(await ProPage({ searchParams: plan ? { plan } : {} }));

describe('/pro', () => {
  it('signed out: to sign-in, coming back to the same plan', async () => {
    h.session = null;
    await expect(render('weekly')).rejects.toThrow('NEXT_REDIRECT');
    expect(h.redirected).toMatch(/^\/login\?next=%2Fpro%3Fplan%3Dweekly$|^\/login\?.*pro.*weekly/);
  });

  it('not on sale (default switches): the line, and no button', async () => {
    const html = await render();
    expect(html).toContain('data-pro-buy="closed"');
    expect(html).toContain(PRO_CLOSED_LINE.replace("'", '&#x27;'));
    expect(html).not.toContain('data-action="buy-pro"');
    expect(html).not.toContain('data-buy-entry');   // PLAT-P07: Opens soon, no button
    expect(html).toContain('data-opens-soon');
  });

  it('on sale: weekly and monthly at the existing prices, the store-terms tick, the button disabled until ticked', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    const html = await render('weekly');
    expect(html).toContain('data-pro-buy="open"');
    // test changed (PLAT-P07, 2026-11-02): every storefront prints prices with the one shop formatter
    // (lib/coach-store/priceLabel.ts shopPriceLabel): "$6.00/week", was "$6.00 / week". Same amounts, the products' own.
    expect(html).toContain('$6.00/week');
    expect(html).toContain('$9.99/month');
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="weekly"|<input[^>]*value="weekly"[^>]*checked=""/);
    expect(html).not.toMatch(/<input[^>]*checked=""[^>]*value="monthly"|<input[^>]*value="monthly"[^>]*checked=""/);
    // test changed (PLAT-P07, 2026-11-02): the tick and the pay button moved into the one buy sheet (components/shop/
    // buy-sheet.tsx: what you get → the terms tick → pay), which opens from the page's one primary. The tick-before-pay rule
    // and the Purchase Terms link are pinned on the sheet itself (tests/shop/buy-sheet.test.tsx); here, the entry is there
    // and nothing on the page links to the checkout route.
    expect(html).toContain('data-buy-entry="pro"');
    expect(html).not.toContain('/api/stripe/checkout');
    expect(STORE_TERMS_VERSION).toBeTruthy();
  });

  it('PURCHASES_ALLOWLIST without fel_pro: not on sale', async () => {
    Object.assign(process.env, { VIRTUAL_PURCHASES_ENABLED: '1', PURCHASES_ALLOWLIST: 'coins' });
    expect(await render()).toContain('data-pro-buy="closed"');
  });
});
