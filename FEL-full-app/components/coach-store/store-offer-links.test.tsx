// STORE-OFFER-1: /coach links the two offers only while the coach store flag is on AND the viewer is a verified adult
// (isVerifiedAdult, the offer page's check). Rendered with renderToStaticMarkup (jsdom / testing-library are not installed
// here — the book-form tests' pattern).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoreOfferLinks, showStoreOfferLinks } from './store-offer-links';
import { REVIEW_BUTTON_LABEL } from '@/lib/coach-store/storeOffers';
import type { GateDb } from '@/lib/privacy/scanSaveGate';

const ORIGINAL = process.env.COACH_STORE_ENABLED;
afterEach(() => { if (ORIGINAL === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = ORIGINAL; });
const Y = new Date().getFullYear();
const db = (dobYear: number | null): GateDb => ({ user: { findUnique: async () => ({ dobYear }) } } as unknown as GateDb);
const NO_DB = { user: { findUnique: async () => { throw new Error('no DB read while the flag is off'); } } } as unknown as GateDb;
/** What /coach renders for this viewer: the page's own two steps. */
const page = async (d: GateDb, userId: string | undefined) => renderToStaticMarkup(createElement(StoreOfferLinks, { adult: await showStoreOfferLinks(d, userId) }));

describe('StoreOfferLinks, flag off', () => {
  it.each([undefined, '', '0', 'false', 'off'])('flag %j: nothing, even for a verified adult, and no DB read', async (v) => {
    if (v === undefined) delete process.env.COACH_STORE_ENABLED; else process.env.COACH_STORE_ENABLED = v;
    expect(await page(NO_DB, 'u1')).toBe('');
    expect(renderToStaticMarkup(createElement(StoreOfferLinks, { adult: true }))).toBe('');
  });
});

describe('StoreOfferLinks, flag on', () => {
  it('a teen gets nothing', async () => {
    process.env.COACH_STORE_ENABLED = '1';
    expect(await page(db(Y - 15), 'u1')).toBe('');
  });
  it('an unverified viewer (no birth year, or no user id) gets nothing', async () => {
    process.env.COACH_STORE_ENABLED = '1';
    expect(await page(db(null), 'u1')).toBe('');
    expect(await page(db(Y - 30), undefined)).toBe('');
  });
  it('a verified adult gets a real link to each offer page; the review label is REVIEW_BUTTON_LABEL', async () => {
    process.env.COACH_STORE_ENABLED = '1';
    const h = await page(db(Y - 30), 'u1');
    expect(REVIEW_BUTTON_LABEL).toBe('Get your jump reviewed by Elijah — $99');
    expect(h).toContain('<a class="text-[#FFD700] underline" href="/coach/offers/dunk-jump-review">' + REVIEW_BUTTON_LABEL + '</a>');
    expect(h).toContain('href="/coach/offers/founders-coaching"');
    expect(h).not.toMatch(/text-xs/);
    expect(readFileSync('components/coach-store/store-offer-links.tsx', 'utf8')).toMatch(/>\{REVIEW_BUTTON_LABEL\}<\/Link>/);   // the constant, not a copy
  });
});

describe('wired on the coach landing page', () => {
  it('/coach asks showStoreOfferLinks for the session user and passes the answer', () => {
    const src = readFileSync('app/coach/page.tsx', 'utf8');
    expect(src).toMatch(/const offersFor = await showStoreOfferLinks\(prisma, \(session\.user as \{ id\?: string \} \| undefined\)\?\.id\);/);
    expect(src).toMatch(/<StoreOfferLinks adult=\{offersFor\} \/>/);
  });
});
