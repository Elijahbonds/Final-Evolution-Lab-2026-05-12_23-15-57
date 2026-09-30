// LINKS-PAGE (2026-09-29, with the FE PM amend of 11:35 AM PT): /elijah, Elijah's links. vitest does not collect app/**,
// so the page is pinned from here (the lib/screen/routes.test.tsx pattern): the approved buttons byte for byte, in
// order; new tabs and rel for every external link; the paid-link line beside exactly PJF and Total Body Board; no host
// named anywhere (the page is served from two hosts); and nothing that could send a signed-out visitor to /login.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => { throw new Error(`redirected to ${to}`); },
  notFound: () => { throw new Error('notFound'); },
}));

import Page, { metadata } from '@/app/elijah/page';
import { ELIJAH_LINKS, PAID_LINK_NOTE } from '@/app/elijah/links';

const ROOT = join(__dirname, '../..');
const html = () => renderToStaticMarkup(createElement(Page));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** Every list item on the page, in order, with its link and anything after the link. */
const items = (h: string) => [...h.matchAll(/<li data-slot="(\d+)">([\s\S]*?)<\/li>/g)].map(([, slot, inner]) => {
  const a = /<a ([^>]*)>([\s\S]*?)<\/a>/.exec(inner)!;
  return {
    slot: Number(slot),
    href: /href="([^"]*)"/.exec(a[1])?.[1] ?? null,
    target: /target="([^"]*)"/.exec(a[1])?.[1] ?? null,
    rel: /rel="([^"]*)"/.exec(a[1])?.[1] ?? null,
    label: text(/<span data-label="true">([\s\S]*?)<\/span>/.exec(a[2])?.[1] ?? ''),
    linkText: text(a[2]),
    after: inner.slice(inner.indexOf(a[0]) + a[0].length),
  };
});

/** The FE PM amend's list (11:35 AM PT), byte for byte. */
const APPROVED: [number, string, string][] = [
  [1, 'Free Jump Screen', '/screen'],
  [2, 'Play the Game Free', '/try'],
  [3, 'Blueprint Kindle', 'https://www.amazon.com/dp/B0H5J1M18H'],
  [4, 'All Books', 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B'],
  [5, 'MILLIONS', 'https://millions.co/elijah-bonds-basketball'],
  [6, 'Fan Arch', 'https://fanarch.com/collections/elijah-bonds'],
  [7, 'PJF', 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly'],
  [8, 'Total Body Board', 'https://www.totalbodyboard.com'],
  [9, 'Elijah Bonds', 'https://www.instagram.com/elijahbonds'],
  [9, 'Final Evolution', 'https://www.instagram.com/finalevolutionllc'],
  [10, 'YouTube', 'https://www.youtube.com/channel/UCP_ziu1PO1DGWfpmIP3kEng'],
  [11, 'LinkedIn', 'https://www.linkedin.com/in/elijah-bonds-771aa1228'],
];

describe('the approved buttons (12 links; slot 9 is two)', () => {
  it('the data: exact slots, labels and hrefs, in order', () => {
    expect(ELIJAH_LINKS.map((b) => [b.slot, b.label, b.href])).toEqual(APPROVED);
  });

  it('the rendered page: the same links in the same order, and no other link', () => {
    const got = items(html());
    expect(got.map((l) => [l.slot, l.label, l.href])).toEqual(APPROVED);
    expect([...html().matchAll(/<a /g)]).toHaveLength(12);
    expect(html()).toContain('href="https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly"');
  });

  it('internal links are relative /screen and /try in the same tab; every external link opens a new tab with noopener noreferrer', () => {
    for (const l of items(html())) {
      if (l.href!.startsWith('/')) {
        expect(['/screen', '/try'], l.label).toContain(l.href);
        expect(l.href, l.label).not.toMatch(/^\/\/|^[a-z]+:/i);
        expect(l.target, l.label).toBeNull();
      } else {
        expect(l.href, l.label).toMatch(/^https:\/\//);
        expect(l.target, l.label).toBe('_blank');
        expect(l.rel, l.label).toBe('noopener noreferrer');
      }
    }
  });

  it('Total Body Board prints its code, EBondJmp; slot 9 is "Elijah Bonds" then "Final Evolution" under an Instagram caption', () => {
    const l = items(html());
    expect(l[7].linkText).toContain('code EBondJmp');
    expect([l[8].label, l[9].label]).toEqual(['Elijah Bonds', 'Final Evolution']);
    expect(html()).toMatch(/data-group="Instagram"[^>]*>Instagram</);
  });
});

describe('the paid-link line (owner rule 2026-09-29), not an "affiliate" tag', () => {
  it('reads exactly "Paid link: I earn a commission if you buy."', () => {
    expect(PAID_LINK_NOTE).toBe('Paid link: I earn a commission if you buy.');
  });

  it('sits right after the PJF link and the Total Body Board link, in the same list item, and beside no other link', () => {
    for (const l of items(html())) {
      const note = /^\s*<p data-paid-link-note="(\d+)"([^>]*)>([^<]*)<\/p>/.exec(l.after);
      if (l.slot === 7 || l.slot === 8) {
        expect(note, l.label).not.toBeNull();
        expect(note![1]).toBe(String(l.slot));
        expect(note![3]).toBe(PAID_LINK_NOTE);
        // visible: not hidden, not aria-only, not a tooltip, readable size and contrast
        expect(note![2]).not.toMatch(/aria-hidden|sr-only|hidden|display:\s*none|title=/);
        expect(note![2]).toMatch(/text-\[13px\]/);
        expect(note![2]).toMatch(/text-white\/(7\d|8\d|9\d)\b/);
      } else {
        expect(l.after, l.label).not.toContain(PAID_LINK_NOTE);
      }
    }
  });

  it('appears exactly twice on the page, and no "affiliate" label renders anywhere', () => {
    const h = html();
    expect(h.split(PAID_LINK_NOTE).length - 1).toBe(2);
    expect(text(h)).not.toMatch(/affiliate/i);
    expect(h).not.toMatch(/data-affiliate/);
  });
});

describe('two hosts: the page names none', () => {
  // built, not written, so this file could be scanned too
  const HOST = new RegExp(['web', 'app'].join('\\.'), 'i');
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

  it('no file under app/elijah names the web.app host, NEXTAUTH_URL or metadataBase', () => {
    const files = walk(join(ROOT, 'app/elijah'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, relative(ROOT, f)).not.toMatch(HOST);
      expect(src, relative(ROOT, f)).not.toMatch(/NEXTAUTH_URL|metadataBase|process\.env/);
    }
  });

  it('the rendered markup names no web.app host', () => {
    expect(html()).not.toMatch(HOST);
  });

  it('the page\'s metadata carries no URL: its openGraph and twitter replace the root\'s (whose og:image would resolve to NEXTAUTH_URL)', () => {
    const json = JSON.stringify(metadata);
    expect(json).not.toMatch(/https?:|\/\/|metadataBase|alternates|canonical/);
    expect(metadata.openGraph && 'images' in metadata.openGraph).toBe(false);
    expect(metadata.openGraph && 'url' in metadata.openGraph).toBe(false);
    expect(metadata.twitter && 'images' in metadata.twitter).toBe(false);
  });
});

describe('not redirected to login: a signed-out visitor gets the page', () => {
  const files = readdirSync(join(ROOT, 'app/elijah')).map((f) => `app/elijah/${f}`);

  it('the page files read no session, redirect nowhere, touch no database, request nothing and write no storage', () => {
    expect(files.sort()).toEqual(['app/elijah/links.ts', 'app/elijah/page.tsx']);
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, f).not.toMatch(/getServerSession|next-auth|redirect\(|notFound\(|prisma|lib\/db|fetch\(|localStorage|sessionStorage|document\.cookie|<script|'use client'/);
    }
  });

  it('rendering it never redirects (next/navigation\'s redirect and notFound throw here)', () => {
    expect(() => html()).not.toThrow();
  });

  it('no middleware can wall /elijah: none exists, and if one ever does, its matcher must not match /elijah', () => {
    const mw = ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js'].filter((f) => existsSync(join(ROOT, f)));
    for (const f of mw) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      const matcher = /matcher\s*:\s*(\[[\s\S]*?\]|'[^']*'|"[^"]*")/.exec(src)?.[1];
      // no matcher = every path runs through it: that walls /elijah too
      expect(matcher, `${f} has no config.matcher, so it runs on /elijah`).toBeDefined();
      const patterns = [...matcher!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of patterns) {
        const re = new RegExp(`^${p.replace(/:path\*/g, '.*').replace(/:\w+\*/g, '.*').replace(/:\w+/g, '[^/]+')}$`);
        expect(re.test('/elijah'), `${f} matcher ${p} matches /elijah`).toBe(false);
      }
    }
  });
});
