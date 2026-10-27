// PAYMENTS-READY: the FEL Pro buy page's links and its reading of the checkout route's answers.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRO_NOT_ON_SALE_LINE } from '@/lib/signature/copy';
import { paywall, b2bPaywall, B2B_UPGRADE_HREF } from '@/lib/pro-guard';
import { isSignedInOnly } from '@/lib/screen/config';
import { buyPro, parseProPlan, PRO_CLOSED_LINE, proBuyHref, proBuyOutcome, proCheckoutBody, proPriceLabel } from './proBuy';

describe('the links', () => {
  it('every FEL Pro paywall link opens /pro (a page), never the POST-only checkout route', () => {
    expect(paywall('Upgrades', 'Play stays free.').checkout).toEqual({ weekly: '/pro?plan=weekly', monthly: '/pro?plan=monthly' });
    expect(b2bPaywall('Camp', 'coach', 'x').checkout).toEqual({ weekly: B2B_UPGRADE_HREF, monthly: B2B_UPGRADE_HREF });
    expect(b2bPaywall('Templates', 'facility', 'x').checkout).toEqual({ weekly: '/coach/business#pro', monthly: '/coach/business#pro' });
  });

  it('/pro is signed-in only (the free-game button never points there)', () => {
    expect(isSignedInOnly('/pro')).toBe(true);
    expect(isSignedInOnly(proBuyHref('weekly'))).toBe(true);
  });

  it('no source under app/, components/ or lib/ links a GET to /api/stripe/checkout any more', () => {
    const ROOT = join(__dirname, '../..');
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      if (n === 'node_modules' || n === 'generated') return [];
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
    const bad = ['app', 'components', 'lib'].flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => /['"`]\/api\/stripe\/checkout\?/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(bad).toEqual([]);
  });

  it('the closed line agrees with the signature programs\' line', () => {
    expect(PRO_NOT_ON_SALE_LINE.startsWith(PRO_CLOSED_LINE.replace(/\.$/, ''))).toBe(true);
  });
});

describe('the page\'s pieces', () => {
  it('plan, price, body', () => {
    expect(parseProPlan('weekly')).toBe('weekly');
    for (const v of ['monthly', undefined, '', 'yearly', ['weekly']]) expect(parseProPlan(v)).toBe('monthly');
    expect(proPriceLabel(600, 'weekly')).toBe('$6.00 / week');
    expect(proPriceLabel(999, 'monthly')).toBe('$9.99 / month');
    expect(proCheckoutBody('weekly', 'v1')).toEqual({ product: 'FEL_PRO', termsAccepted: true, termsVersion: 'v1' });
    expect(proCheckoutBody('monthly', 'v1')).toEqual({ product: 'FEL_PRO_MONTHLY', termsAccepted: true, termsVersion: 'v1' });
  });

  it('each answer of the route', () => {
    expect(proBuyOutcome(200, { url: 'https://checkout.stripe.test/x' })).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/x' });
    expect(proBuyOutcome(401, { error: 'Unauthorized' })).toEqual({ kind: 'sign_in' });
    expect(proBuyOutcome(409, { error: 'terms_required', version: 'v2' }).kind).toBe('terms_changed');
    expect(proBuyOutcome(409, { error: 'store_closed', reason: 'virtual_purchases_off' })).toEqual({ kind: 'closed', message: PRO_CLOSED_LINE });
    expect(proBuyOutcome(409, { error: 'Already subscribed' })).toEqual({ kind: 'refused', message: 'You already have FEL Pro.' });
    // the 18+ refusal is shown exactly as the route words it
    expect(proBuyOutcome(403, { error: 'adults_only', reason: 'under_18', message: 'Purchases are for verified adults (18+).' })).toEqual({ kind: 'refused', message: 'Purchases are for verified adults (18+).' });
    expect(proBuyOutcome(500, {})).toEqual({ kind: 'refused', message: 'Checkout could not start. Try again.' });
  });

  it('buyPro POSTs the JSON body to the checkout route; a network failure is a retry message', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify({ url: 'https://s' }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await buyPro(ok, 'weekly', 'v1')).toEqual({ kind: 'redirect', url: 'https://s' });
    expect(seen[0].url).toBe('/api/stripe/checkout');
    expect(seen[0].init.method).toBe('POST');
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ product: 'FEL_PRO', termsAccepted: true, termsVersion: 'v1' });
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect((await buyPro(down, 'monthly', 'v1')).kind).toBe('refused');
  });
});
