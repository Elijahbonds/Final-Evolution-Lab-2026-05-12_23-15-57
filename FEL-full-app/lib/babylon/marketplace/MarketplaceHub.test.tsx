import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The BUY receipt is set after an await, when the server render has already finished, so it never reaches the markup.
// Recording the useState setters lets these tests read the receipt the hub actually set.
vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/stateLog')).recordingReact(await importOriginal()));

import MarketplaceHub, { buyNote, cellToolPrice } from './MarketplaceHub';
import { Marketplace } from './Marketplace';
import { OUTLINE_COST_SHARDS, CHAPTER_DRAFT_COST_SHARDS } from './AuthorStudio';
import { button, drive, settle } from '@/tests/helpers/driveRender';
import { loggedStrings, stateLog } from '@/tests/helpers/stateLog';

// The Marketplace is mounted with no shards seam, so every BUY and Cell tool is free and everything lives in this
// browser's localStorage. It takes nothing real, but it read as a real shop. Owner decision 2026-09-24: label it a
// preview, and make every shard figure on the page agree with that label.
const loader = readFileSync(new URL('../../../app/market/_components/loader.tsx', import.meta.url), 'utf8');

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

const LISTING = {
  id: 'lst_1', kind: 'art', title: 'Sunset Print', blurb: 'a print', sellerId: 'artist', sellerName: 'Artist',
  sellerHasPass: false, creatorCardId: null, priceShards: 150, payload: {}, createdAt: 0, sales: 0,
};

describe('Marketplace, labelled a preview', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); stateLog.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is still mounted with no shards seam, which is why it is a preview', () => {
    expect(loader).toMatch(/<MarketplaceHub \/>/);
  });

  it('says PREVIEW on the page when no shards seam is wired, and not when one is', () => {
    expect(renderToStaticMarkup(createElement(MarketplaceHub))).toMatch(/PREVIEW — no Shards are spent here yet/);
    expect(renderToStaticMarkup(createElement(MarketplaceHub, { spendShards: async () => true }))).not.toMatch(/PREVIEW/);
  });

  it('the AUTHOR DESK Cell button says free in preview, with no shard cost on it', () => {
    const { html } = drive(() => MarketplaceHub({}), [(t) => button(t, /^AUTHOR DESK$/).props.onClick()]);
    expect(html).toContain('✦ CELL: 20-CHAPTER OUTLINE (free in preview)');
    expect(html).not.toContain(`(${OUTLINE_COST_SHARDS}◈)`);
  });

  it('with a seam wired the same button shows its shard cost', () => {
    const { html } = drive(() => MarketplaceHub({ spendShards: async () => true }), [(t) => button(t, /^AUTHOR DESK$/).props.onClick()]);
    expect(html).toContain(`✦ CELL: 20-CHAPTER OUTLINE (${OUTLINE_COST_SHARDS}◈)`);
    expect(html).not.toMatch(/free in preview/);
  });

  it('a preview BUY on the real hub charges nothing, and MY SHELF says the price was not charged', async () => {
    localStorage.setItem('fel_market_listings_v1', JSON.stringify([LISTING]));
    const shop = drive(() => MarketplaceHub({}), [(t) => button(t, /^ART$/).props.onClick()]);
    expect(shop.html).toContain('150◈ list price, free in preview');
    button(shop.tree, /^BUY$/).props.onClick();
    await settle();
    expect(Marketplace.owned('lst_1')).toBe(true); // the preview hands it over locally, as the banner says
    // the receipt the hub set after the await is the preview one, never a payment to the seller
    expect(loggedStrings()).toContain(buyNote(true, 135));
    expect(loggedStrings().filter((s) => /Seller nets|◈/.test(s))).toEqual([]);
    const shelf = drive(() => MarketplaceHub({}), [(t) => button(t, /^MY SHELF$/).props.onClick()]);
    expect(shelf.html).toContain('150◈ list price, not charged (preview)');
    expect(shelf.html).not.toMatch(/bought for/);
  });

  it('with a seam wired, BUY goes through the seam at the listing price', async () => {
    localStorage.setItem('fel_market_listings_v1', JSON.stringify([LISTING]));
    const spendShards = vi.fn(async () => true);
    const shop = drive(() => MarketplaceHub({ spendShards }), [(t) => button(t, /^ART$/).props.onClick()]);
    expect(shop.html).not.toMatch(/free in preview/);
    button(shop.tree, /^BUY$/).props.onClick();
    await settle();
    expect(spendShards).toHaveBeenCalledWith(150, expect.stringContaining('Sunset Print'));
    expect(loggedStrings()).toContain(buyNote(false, 135)); // the log does see a real receipt when there is one
  });
});

describe('the preview copy helpers', () => {
  it('the BUY receipt never claims a payment in preview, and names the seller net with a seam', () => {
    expect(buyNote(true, 135)).toBe('Yours in this preview. No Shards were spent and the seller was not paid.');
    expect(buyNote(true, 135)).not.toMatch(/◈/);
    expect(buyNote(false, 135)).toBe('Yours! Seller nets 135◈');
  });

  it('a Cell tool price is free in preview and its cost with a seam, for both tools', () => {
    for (const cost of [OUTLINE_COST_SHARDS, CHAPTER_DRAFT_COST_SHARDS]) {
      expect(cellToolPrice(true, cost)).toBe('free in preview');
      expect(cellToolPrice(false, cost)).toBe(`${cost}◈`);
    }
  });
});
