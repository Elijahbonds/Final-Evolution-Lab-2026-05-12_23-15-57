import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The Shard Store reads ?session_id= from the URL; outside a mounted app router useSearchParams has nothing to read.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {} }) }));

import { CoinStore, WHERE_TO_SPEND } from './coin-store';
import { ExchangeWidget } from './exchange-widget';
import { ShardStore } from './shard-store';
import { CATALOG, COIN_STORE_PACKS } from '@/lib/wallet/catalog';
import { shardSaleCopy } from '@/lib/wallet/purchases';

// /store's "Spend Your Balance" listed every SKU on sale with a Buy button on the generic spend, and 24 of the 30 took
// the balance and delivered nothing (a wearable nobody could wear, a plan or a kit paid for twice, a session never
// booked, a retry token nothing reads). Owner decision 2026-09-24: refuse dead-end buys. /store now sells coin packs
// and points at the page that sells and delivers each thing.
describe('/store, Spend Your Balance', () => {
  const html = renderToStaticMarkup(createElement(CoinStore));

  it('offers no catalog SKU for sale: the only buttons on the page are the coin packs', () => {
    expect(html.match(/<button/g)).toHaveLength(COIN_STORE_PACKS.length);
    expect(html).not.toMatch(/>(Buy|Unlock)</);
    for (const id of Object.keys(CATALOG)) expect(html, id).not.toContain(id); // no raw SKU id either
  });

  it('points at each place the balance is really spent, and every one of them is a page', () => {
    expect(WHERE_TO_SPEND.length).toBeGreaterThan(0);
    for (const w of WHERE_TO_SPEND) {
      expect(html, w.href).toContain(`href="${w.href}"`);
      expect(html, w.href).toContain(w.what);
      expect(existsSync(new URL(`../../app${w.href}/page.tsx`, import.meta.url)), `app${w.href}/page.tsx`).toBe(true);
    }
  });

  it('no coin pack promises a retry token, which is sold nowhere', () => {
    expect(html).not.toMatch(/retry token/i);
    for (const p of COIN_STORE_PACKS) expect(p.blurb, p.id).not.toMatch(/retry token/i);
  });
});

describe('the copy that tells people what Shards buy', () => {
  it('the wallet Get Shards widget promises neither class passes nor scans', () => {
    const html = renderToStaticMarkup(createElement(ExchangeWidget));
    expect(html).toContain('Get Shards');
    expect(html).toContain('Shards unlock personalized plans and live sessions.');
    expect(html).not.toMatch(/class pass|scans/i);
  });

  it('the Shard Store and every purchases state promise no class pass, scan or seminar either', () => {
    expect(renderToStaticMarkup(createElement(ShardStore))).not.toMatch(/class pass|scans|seminar/i);
    for (const state of [true, false, null] as const) {
      for (const line of Object.values(shardSaleCopy(state))) expect(line, String(state)).not.toMatch(/class pass|scans|seminar/i);
    }
  });
});
