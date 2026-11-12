// PLAT-P07 (2026-11-02): one shape for every storefront (lib/shop/model.ts) — the adapters' state comes from each product's
// own switch, the card keeps to 20 words, and ONE price formatter prints every price.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARD_MAX_WORDS, bookItem, cardLine, coachCardItem, coachPackageItem, proItems, storeListingItem, wordsOf } from '@/lib/shop/model';
import { shopPriceLabel } from '@/lib/coach-store/priceLabel';

describe('the adapters: state from each product\'s own switch, never a new flag', () => {
  it('a coach package sells only when its own action is book (payments live for that coach)', () => {
    const base = { id: 'p1', title: 'Monthly coaching', summary: 'Weekly plan and check-ins.', priceCents: 12000, kind: 'monthly' };
    expect(coachPackageItem({ ...base, action: 'book' })).toMatchObject({ state: 'buy', priceLabel: '$120.00/month', cadence: 'month' });
    expect(coachPackageItem({ ...base, action: 'apply' }).state).toBe('opens_soon');
    expect(coachPackageItem({ ...base, action: 'full' }).state).toBe('opens_soon');
    expect(coachPackageItem({ ...base, kind: 'session_pack', action: 'book' }).priceLabel).toBe('$120.00');
  });
  it('a book sells only as a direct sale, in an allowed format, with books open; owned reads as yours', () => {
    const b = { slug: 'blueprint', title: 'The Blueprint', description: 'The method.' };
    const o = { id: 'blueprint-audio', priceCents: 1499, directSale: true };
    expect(bookItem(b, o, { formatAllowed: true, purchasesOpen: true }).state).toBe('buy');
    expect(bookItem(b, o, { formatAllowed: true, purchasesOpen: false }).state).toBe('opens_soon');
    expect(bookItem(b, o, { formatAllowed: false, purchasesOpen: true }).state).toBe('opens_soon');
    expect(bookItem(b, { ...o, directSale: false }, { formatAllowed: true, purchasesOpen: true }).state).toBe('opens_soon');
    expect(bookItem(b, o, { formatAllowed: true, purchasesOpen: false, owned: true }).state).toBe('owned');
  });
  it('FEL Pro: two plans at the products\' own prices; closed is Opens soon', () => {
    const open = proItems({ weekly: 600, monthly: 999 }, true);
    expect(open.map((i) => [i.id, i.priceLabel, i.state])).toEqual([['monthly', '$9.99/month', 'buy'], ['weekly', '$6.00/week', 'buy']]);
    expect(proItems({ weekly: 600, monthly: 999 }, false).every((i) => i.state === 'opens_soon')).toBe(true);
  });
  it('a store listing sells while its store is on (off, its page 404s first); a coach card opens their page', () => {
    expect(storeListingItem({ id: 'l1', title: 'Video review', description: null, priceCents: 4000 })).toMatchObject({ state: 'buy', priceLabel: '$40.00' });
    expect(coachCardItem({ slug: 'jordan', displayName: 'Jordan Lee', headline: 'Jump coach', fromPriceCents: 12000, fromMonthly: true, acceptingClients: true }).priceLabel).toBe('from $120.00/month');
  });
});

describe('the card shows ≤ 20 words', () => {
  it('a long line is cut at a word, with an ellipsis, so title + line + price fit', () => {
    const line = 'Twelve weeks of strength, speed and jump work, built around your sport and your schedule, with weekly check-ins and video feedback on every lift.';
    const it1 = coachPackageItem({ id: 'p', title: 'Off-season performance block', summary: line, priceCents: 34900, kind: 'program', action: 'book' });
    expect(wordsOf(it1.title) + wordsOf(it1.oneLine) + wordsOf(it1.priceLabel)).toBeLessThanOrEqual(CARD_MAX_WORDS);
    expect(it1.oneLine!.endsWith('…')).toBe(true);
    expect(cardLine('A', 'short line', '$1.00')).toBe('short line');
  });
});

describe('one price formatter', () => {
  it('shopPriceLabel: once, per week, per month', () => {
    expect(shopPriceLabel(6500)).toBe('$65.00');
    expect(shopPriceLabel(600, 'week')).toBe('$6.00/week');
    expect(shopPriceLabel(2999, 'month')).toBe('$29.99/month');
  });
  it('/coaches, the coach page, /press and /pro print prices through the shop model (shopPriceLabel), not their own', () => {
    const uses = (f: string, re: RegExp) => expect(readFileSync(f, 'utf8'), f).toMatch(re);
    uses('components/coach-business/marketplace-view.tsx', /coachCardItem\(/);
    uses('components/coach-business/coach-profile-view.tsx', /coachPackageItem\(/);
    uses('app/press/page.tsx', /bookItem\(/);
    uses('components/pro/pro-buy.tsx', /proItems\(/);
    for (const f of ['components/coach-business/marketplace-view.tsx', 'components/coach-business/coach-profile-view.tsx', 'app/press/page.tsx', 'components/pro/pro-buy.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/toFixed\(|formatUsd\(|proPriceLabel\(|packagePriceLabel\(/);
    }
    expect(readFileSync('lib/shop/model.ts', 'utf8')).toMatch(/import \{ shopPriceLabel/);
  });
});
