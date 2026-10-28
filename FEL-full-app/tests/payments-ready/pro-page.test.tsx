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
  });

  it('on sale: weekly and monthly at the existing prices, the store-terms tick, the button disabled until ticked', async () => {
    process.env.VIRTUAL_PURCHASES_ENABLED = '1';
    const html = await render('weekly');
    expect(html).toContain('data-pro-buy="open"');
    expect(html).toContain('$6.00 / week');
    expect(html).toContain('$9.99 / month');
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="weekly"|<input[^>]*value="weekly"[^>]*checked=""/);
    expect(html).not.toMatch(/<input[^>]*checked=""[^>]*value="monthly"|<input[^>]*value="monthly"[^>]*checked=""/);
    // test changed (owner-approvals, 2026-10-27, card C28): FEL Pro buyers tick the Purchase Terms now, not the coach store's
    expect(html).toContain('href="/purchase-terms"');
    expect(html).toMatch(/disabled=""[^>]*data-action="buy-pro"/);
    expect(STORE_TERMS_VERSION).toBeTruthy();
  });

  it('PURCHASES_ALLOWLIST without fel_pro: not on sale', async () => {
    Object.assign(process.env, { VIRTUAL_PURCHASES_ENABLED: '1', PURCHASES_ALLOWLIST: 'coins' });
    expect(await render()).toContain('data-pro-buy="closed"');
  });
});
