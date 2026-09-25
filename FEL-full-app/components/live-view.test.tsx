import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// LiveView calls useRouter for the house-ad banner; outside a mounted app router that throws.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { LiveView } from './live-view';
import { PROGRAMS } from '@/lib/stream/program-guide';

// /live sold shard class passes with no video player behind them. Owner decision 2026-09-24: refuse the sale until a
// class can be watched. The server's spend refuses both SKUs (lib/wallet/catalog.test.ts); this is the page.
describe('/live, class passes', () => {
  const m = renderToStaticMarkup(createElement(LiveView));

  it('offers neither pass: both buttons are disabled and say so, with no shard price on them', () => {
    expect(m.match(/<button disabled=""[^>]*>Not on sale yet<\/button>/g)).toHaveLength(2);
    expect(m).not.toMatch(/40 shards|300 shards/);
  });

  it('no longer claims the passes are active', () => {
    expect(m).not.toMatch(/fully active now/);
    expect(m).toMatch(/No class can be watched here yet/);
  });
});

// The guide flags some programs live, but nothing streams: the section said "Live now" with a pulsing on-air dot and
// each card wore a bare LIVE badge. It is not a purchase, but it was still a claim the page could not back.
describe('/live, the live classes section', () => {
  const m = renderToStaticMarkup(createElement(LiveView));
  const flaggedLive = PROGRAMS.filter((p) => p.live).length;

  it('does not say anything is live now or on air', () => {
    expect(flaggedLive).toBeGreaterThan(0); // the section renders, so the test reads real copy
    expect(m).not.toMatch(/Live now/i);
    expect(m).not.toMatch(/animate-ping/);
    expect(m).not.toMatch(/>LIVE<\/span>/);
  });

  it('says the live classes are not streaming yet, on the heading and on every live card', () => {
    expect(m).toMatch(/Live classes/);
    expect(m).toMatch(/Not streaming yet/);
    expect(m.match(/LIVE CLASS · NOT ON AIR YET/g)).toHaveLength(flaggedLive);
  });

  it('calls the rest the program guide, not classes and on-demand to watch now', () => {
    expect(m).not.toMatch(/on-demand/i);
    expect(m).toMatch(/>Program guide</);
  });
});
