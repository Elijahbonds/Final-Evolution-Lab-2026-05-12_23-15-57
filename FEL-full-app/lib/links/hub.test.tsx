// The public bio page: one config, no session, /books → /links#books.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => { throw new Error(`redirected to ${to}`); },
  notFound: () => { throw new Error('notFound'); },
}));

import Page, { metadata } from '@/app/links/page';
import { GET as booksGet } from '@/app/books/route';
import { config, isPublicRoute, middleware, PUBLIC_ROUTE_ALLOWLIST } from '../../middleware';
import {
  AFFILIATE_DISCLOSURE,
  HUB_ITEMS,
  LINKS_SHARE_IMAGE,
  hubLinkRel,
  visibleHubItems,
  type HubItem,
} from './hub';

const ROOT = join(__dirname, '../..');
const html = () => renderToStaticMarkup(createElement(Page));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const EXPECTED: { id: string; label: string; url: string; rel: string | null }[] = [
  { id: 'screen', label: 'Take the free movement screen', url: '/screen', rel: null },
  { id: 'play', label: 'Play FEL', url: '/try', rel: null },
  { id: 'blueprint', label: "The Neuro-Mechanic's Blueprint on Kindle", url: 'https://www.amazon.com/dp/B0H5J1M18H', rel: 'noopener' },
  { id: 'millions', label: 'MILLIONS', url: 'https://millions.co/elijah-bonds-basketball', rel: 'noopener' },
  { id: 'fanarch', label: 'Fanarch', url: 'https://fanarch.com/collections/elijah-bonds', rel: 'noopener' },
  { id: 'pjf', label: 'PJF Performance Band', url: 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly', rel: 'sponsored noopener' },
  { id: 'tbb', label: 'Total Body Board', url: 'https://www.totalbodyboard.com/', rel: 'sponsored noopener' },
  { id: 'contact', label: 'Contact', url: 'mailto:FinalEvolution.us@gmail.com', rel: 'noopener' },
];

function anchors(h: string) {
  return [...h.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1],
    href: /href="([^"]*)"/.exec(m[1])?.[1] ?? '',
    rel: /rel="([^"]*)"/.exec(m[1])?.[1] ?? null,
    target: /target="([^"]*)"/.exec(m[1])?.[1] ?? null,
    label: text(/<span data-label="true">([\s\S]*?)<\/span>/.exec(m[2])?.[1] ?? m[2]),
  }));
}

function guest(path: string) {
  return new NextRequest(`http://fel.test${path}`);
}

describe('the hub config, in order', () => {
  it('lists the approved items and hides a null url', () => {
    expect(visibleHubItems().map((item) => [item.id, item.label, item.url, hubLinkRel(item)])).toEqual(
      EXPECTED.map((item) => [item.id, item.label, item.url, item.rel]),
    );
    const hidden: HubItem = { id: 'hidden', label: 'Hidden', url: null, kind: 'affiliate' };
    expect(visibleHubItems([...HUB_ITEMS, hidden]).some((item) => item.id === 'hidden')).toBe(false);
  });
});

describe('the rendered page', () => {
  it('renders those links in order and no others', () => {
    const got = anchors(html());
    expect(got.map((a) => [a.label, a.href, a.rel])).toEqual(EXPECTED.map((item) => [item.label, item.url, item.rel]));
  });

  it('opens http(s) links in a new tab; internal and mailto stay here', () => {
    for (const a of anchors(html())) {
      if (a.href.startsWith('http')) expect(a.target, a.label).toBe('_blank');
      else expect(a.target, a.label).toBeNull();
    }
  });

  it('shows the Total Body Board code with a copy button, and one affiliate disclosure', () => {
    const h = html();
    expect(h).toContain('EBondJmp');
    expect(h).toContain('data-copy-code="EBondJmp"');
    expect(h).toContain('>Copy<');
    expect(h.split(AFFILIATE_DISCLOSURE).length - 1).toBe(1);
    expect(h).toContain('id="affiliate-disclosure"');
    expect(h).toContain('id="books"');
  });

  it('names no street, phone, or place', () => {
    const h = text(html());
    expect(h).not.toMatch(/\b(street|avenue|boulevard|blvd|phone|located|venice|california)\b/i);
    expect(html()).not.toMatch(/tel:|sms:|geo:/);
  });
});

describe('share tags', () => {
  it('sets Open Graph and Twitter cards to the local share image', () => {
    expect(metadata.openGraph && 'images' in metadata.openGraph && metadata.openGraph.images).toBeTruthy();
    expect(metadata.twitter && 'images' in metadata.twitter && metadata.twitter.images).toEqual([LINKS_SHARE_IMAGE]);
    expect(JSON.stringify(metadata)).toContain(LINKS_SHARE_IMAGE);
    expect(existsSync(join(ROOT, 'public', LINKS_SHARE_IMAGE))).toBe(true);
  });
});

describe('GET /links and /books without a session', () => {
  it('never redirects either path to login', () => {
    expect(PUBLIC_ROUTE_ALLOWLIST).toContain('/links');
    expect(PUBLIC_ROUTE_ALLOWLIST).toContain('/books');
    expect(isPublicRoute('/links')).toBe(true);
    expect(isPublicRoute('/books/')).toBe(true);
    expect(isPublicRoute('/play')).toBe(false);
    const patterns = (config.matcher as string[]);
    expect(patterns).toEqual(expect.arrayContaining(['/links', '/books']));

    for (const path of ['/links', '/books']) {
      const res = middleware(guest(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get('location') ?? '', path).not.toMatch(/\/login/);
    }
  });

  it('GET /books redirects to /links#books and GET /links renders', () => {
    const books = booksGet();
    expect(books.status).toBeGreaterThanOrEqual(300);
    expect(books.status).toBeLessThan(400);
    const location = books.headers.get('location') ?? '';
    expect(location).toContain('/links');
    expect(location).toContain('#books');
    expect(location).not.toMatch(/\/login/);
    expect(() => html()).not.toThrow();
  });
});

describe('the page stays light', () => {
  const files = readdirSync(join(ROOT, 'app/links')).map((f) => join(ROOT, 'app/links', f));

  it('loads no session, database, 3D, or third-party script', () => {
    for (const f of [...files, join(ROOT, 'lib/links/hub.ts'), join(ROOT, 'app/books/route.ts')]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/getServerSession|next-auth|prisma|lib\/db|babylon|three|gtag|facebook|pixel|googletagmanager|hotjar|segment\.com/);
      expect(src, f).not.toMatch(/https?:\/\/(?!www\.amazon\.com|millions\.co|fanarch\.com|pjf-performance-shop\.myshopify\.com|www\.totalbodyboard\.com)/);
    }
  });
});
