// STORE-OFFER-1: the $99 Dunk & Jump Review and Founders Coaching (10 spots, $129/month) — flag-off data beside STORE_PRICES.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FOUNDERS_OFFER_KEY, FOUNDERS_PRICE_CENTS, FOUNDERS_PRICE_LOCK_PENDING, FOUNDERS_REVIEWS_PER_MONTH_PENDING, FOUNDERS_SPOTS,
  OFFER_COPY, REVIEW_BUTTON_LABEL, REVIEW_OFFER_KEY, REVIEW_OFFER_PATH, REVIEW_PRICE_CENTS, REVIEW_TURNAROUND_BUSINESS_DAYS_PENDING,
  REVIEW_WEEKLY_CAP_PENDING, STORE_OFFERS, TERMS_REFUND_HREF, getStoreOffers, reviewOfferHref, storeOfferByKey,
} from './storeOffers';
import { STORE_PRICES } from './storePrices';
import { coachManifest } from './manifest';
import { STORE_TERMS_SECTIONS } from '@/lib/store-terms';
import { anchorId } from '@/lib/store-terms/render';
import { OfferCard } from '@/components/coach-store/offer-card';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => { if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = ORIGINAL; });

describe('STORE-OFFER-1: the two offers', () => {
  it('are Elijah\'s picks: $99 one-time review, $129/month Founders with 10 spots', () => {
    expect(STORE_OFFERS.map((r) => [r.key, r.priceCents, r.billing])).toEqual([[REVIEW_OFFER_KEY, 9900, 'one_time'], [FOUNDERS_OFFER_KEY, 12900, 'month']]);
    expect([REVIEW_PRICE_CENTS, FOUNDERS_PRICE_CENTS, FOUNDERS_SPOTS]).toEqual([9900, 12900, 10]);
    expect(storeOfferByKey(REVIEW_OFFER_KEY)?.title).toBe('Dunk & Jump Review');
  });
  it('Research\'s four open calls sit in named PENDING constants: cap 8/week, 3 business days, price lock on, 2 reviews/month', () => {
    expect([REVIEW_WEEKLY_CAP_PENDING, REVIEW_TURNAROUND_BUSINESS_DAYS_PENDING, FOUNDERS_PRICE_LOCK_PENDING, FOUNDERS_REVIEWS_PER_MONTH_PENDING]).toEqual([8, 3, true, 2]);
    const r = OFFER_COPY[REVIEW_OFFER_KEY].bullets.join('\n'), f = OFFER_COPY[FOUNDERS_OFFER_KEY].bullets.join('\n');
    expect(r).toContain('Back within 3 business days'); expect(r).toContain('Limited to 8 reviews per week');
    expect(f).toContain('2 video reviews per month'); expect(f).toContain('Founders price stays $129 as long as you stay subscribed');
  });
  it('adults only: every buyer is verified_adult, every manifest parses, and the copy says 18+', () => {
    for (const row of STORE_OFFERS) {
      expect(row.buyer).toBe('verified_adult');
      expect(coachManifest.safeParse(row.manifest).success, row.key).toBe(true);
      expect(OFFER_COPY[row.key].bullets).toContain('For adults 18+.');
    }
    expect(STORE_OFFERS.find((r) => r.key === FOUNDERS_OFFER_KEY)!.manifest).toEqual({ kind: 'membership', audience: 'adult', interval: 'month' });
  });
  it('the fine print: postural assessment never a diagnosis, no promised jump height, refunds via the store terms\' refund section', () => {
    expect(OFFER_COPY[REVIEW_OFFER_KEY].finePrint).toContain('postural assessment, never a medical diagnosis');
    expect(OFFER_COPY[REVIEW_OFFER_KEY].finePrint).toContain('doesn\'t promise any jump height');
    expect(OFFER_COPY[FOUNDERS_OFFER_KEY].finePrint).toContain('postural assessment, never diagnosis');
    for (const c of Object.values(OFFER_COPY)) {
      expect(c.finePrint).toContain('Refunds follow our Terms and refund page');
      expect(`${c.headline} ${c.body ?? ''} ${c.bullets.join(' ')}`).not.toMatch(/\d+\s*(inch|in\.|cm)\b|guarantee/i);
    }
    expect(TERMS_REFUND_HREF).toBe('/store-terms#refund-policy');
    expect(STORE_TERMS_SECTIONS.some((s) => anchorId(s.id) === 'refund-policy')).toBe(true);
  });
  it('the nine approved STORE_PRICES rows are untouched, and no offer key collides with one', () => {
    expect(STORE_PRICES.length).toBe(9);
    for (const r of STORE_OFFERS) expect(STORE_PRICES.some((p) => p.key === r.key)).toBe(false);
  });
});

describe('STORE-OFFER-1: the store switch stays off', () => {
  it.each([undefined, '', '0', 'false', 'off'])('flag %j: no offers, no button link', (v) => {
    if (v === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = v;
    expect(getStoreOffers()).toEqual([]);
    expect(reviewOfferHref()).toBeNull();
  });
  it('flag on: both offers, and the button goes to the review offer', () => {
    process.env.COACH_STORE_ENABLED = '1';
    expect(getStoreOffers().length).toBe(2);
    expect(reviewOfferHref()).toBe(REVIEW_OFFER_PATH);
  });
  it('no file in this lane turns the flag on', () => {
    for (const f of ['lib/coach-store/storeOffers.ts', 'components/coach-store/offer-card.tsx', 'app/coach/offers/[offer]/page.tsx', 'app/try/page.tsx', 'app/screen/page.tsx'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/COACH_STORE_ENABLED\s*=|process\.env\.COACH_STORE_ENABLED\s*=/);
  });
});

describe('STORE-OFFER-1: the offer card', () => {
  it('a verified adult sees the copy, the price, the fine print and the refund link — no checkout yet', () => {
    const html = renderToStaticMarkup(createElement(OfferCard, { copy: OFFER_COPY[REVIEW_OFFER_KEY], adult: true }));
    expect(html).toContain('Dunk &amp; Jump Review'); expect(html).toContain('$99');
    expect(html).toContain('postural assessment, never a medical diagnosis');
    expect(html).toContain('href="/store-terms#refund-policy"');
    expect(html).toContain('offer-checkout-pending'); expect(html).not.toContain('offer-adults-only');
  });
  it('anyone not verified adult sees the adults-only notice instead', () => {
    const html = renderToStaticMarkup(createElement(OfferCard, { copy: OFFER_COPY[FOUNDERS_OFFER_KEY], adult: false }));
    expect(html).toContain('offer-adults-only'); expect(html).not.toContain('offer-checkout-pending');
    expect(html).toContain('$129/month');
  });
});

describe('STORE-OFFER-1: the "Book a review" buttons', () => {
  it('the label is the copy file\'s button text', () => {
    expect(REVIEW_BUTTON_LABEL).toBe('Get your jump reviewed by Elijah — $99');
  });
  it('/try: the server passes the link only through reviewOfferHref(), and the end card shows it only after the age step said adult', () => {
    expect(readFileSync('app/try/page.tsx', 'utf8')).toMatch(/reviewHref=\{reviewOfferHref\(\)\}/);
    expect(readFileSync('components/games/guest-dunk-shell.tsx', 'utf8')).toMatch(/\{reviewHref && gate === 'adult' && \(/);
  });
  it('/screen: the server passes the link only through reviewOfferHref()', () => {
    expect(readFileSync('app/screen/page.tsx', 'utf8')).toMatch(/<ScreenStart reviewHref=\{reviewOfferHref\(\)\} \/>/);
  });
});
