// LINKS-PAGE (2026-09-29): /elijah, Elijah's links. vitest does not collect app/**, so the page is pinned from here (the
// lib/screen/routes.test.tsx pattern): the buttons byte for byte, in order; new tabs and rel for every external link;
// the affiliate label on exactly two; and nothing that could send a signed-out visitor to /login.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => { throw new Error(`redirected to ${to}`); },
  notFound: () => { throw new Error('notFound'); },
}));

import Page from '@/app/elijah/page';
import { ELIJAH_LINKS } from '@/app/elijah/links';

const ROOT = join(__dirname, '../..');
const html = () => renderToStaticMarkup(createElement(Page));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** Every link on the page, in order: its href, target, rel, label and whether it carries the affiliate label. */
const links = (h: string) => [...h.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
  href: /href="([^"]*)"/.exec(attrs)?.[1] ?? null,
  target: /target="([^"]*)"/.exec(attrs)?.[1] ?? null,
  rel: /rel="([^"]*)"/.exec(attrs)?.[1] ?? null,
  label: text(inner.replace(/<span data-affiliate[^>]*>[\s\S]*?<\/span>/, '')),
  affiliate: inner.includes('data-affiliate'),
}));

const EXPECTED: [string, string][] = [
  ['Free Jump Screen', '/screen'],
  ['Play the Game, Free', '/try'],
  ['The Neuro-Mechanic\'s Blueprint (Kindle)', 'https://www.amazon.com/dp/B0H5J1M18H'],
  ['All Books on Amazon', 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B'],
  ['Merch (MILLIONS)', 'https://millions.co/elijah-bonds-basketball'],
  ['Merch (Fan Arch)', 'https://fanarch.com/collections/elijah-bonds'],
  ['PJF Performance Band', 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly'],
  ['Total Body Board, code EBondJmp', 'https://www.totalbodyboard.com'],
  ['Elijah Bonds', 'https://www.instagram.com/elijahbonds/'],
  ['Final Evolution', 'https://www.instagram.com/finalevolutionllc/'],
  ['YouTube', 'https://www.youtube.com/channel/UCP_ziu1PO1DGWfpmIP3kEng'],
  ['LinkedIn', 'https://www.linkedin.com/in/elijah-bonds-771aa1228'],
];

describe('the buttons, as the brief lists them', () => {
  it('the data: exact order, labels and hrefs, byte for byte', () => {
    expect(ELIJAH_LINKS.map((b) => [b.label, b.href])).toEqual(EXPECTED);
  });

  it('the rendered page: the same links, in the same order (the affiliate query string intact)', () => {
    const got = links(html());
    expect(got.map((l) => [l.label, l.href])).toEqual(EXPECTED);
    expect(html()).toContain('href="https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly"');
  });

  it('internal links are /screen and /try, same tab; every external link opens a new tab with noopener noreferrer', () => {
    for (const l of links(html())) {
      if (l.href!.startsWith('/')) {
        expect(['/screen', '/try'], l.label).toContain(l.href);
        expect(l.target, l.label).toBeNull();
      } else {
        expect(l.href, l.label).toMatch(/^https:\/\//);
        expect(l.target, l.label).toBe('_blank');
        expect(l.rel, l.label).toBe('noopener noreferrer');
      }
    }
  });

  it('the "affiliate" label is on exactly PJF Performance Band and Total Body Board', () => {
    expect(links(html()).filter((l) => l.affiliate).map((l) => l.label)).toEqual(['PJF Performance Band', 'Total Body Board, code EBondJmp']);
  });

  it('button 8 prints "code EBondJmp"; slot 9 is two buttons, "Elijah Bonds" then "Final Evolution", under an Instagram caption', () => {
    const l = links(html());
    expect(l[7].label).toContain('code EBondJmp');
    expect([l[8].label, l[9].label]).toEqual(['Elijah Bonds', 'Final Evolution']);
    expect(l[8].href).toBe('https://www.instagram.com/elijahbonds/');
    expect(l[9].href).toBe('https://www.instagram.com/finalevolutionllc/');
    expect(html()).toMatch(/data-group="Instagram"[^>]*>Instagram</);
  });

  it('the header, the system font, and no form, input or email', () => {
    const h = html();
    expect(text(h)).toMatch(/^Elijah Bonds Final Evolution Lab/);
    expect(h).toMatch(/style="font-family:-apple-system, BlinkMacSystemFont, &#x27;Segoe UI&#x27;, Roboto, sans-serif"/);
    expect(h).not.toMatch(/<form|<input|type="email"|<script|<img/);
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

  it('no middleware can wall /elijah: none exists, and if one ever does, its matcher must not match /elijah', async () => {
    const mw = ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js'].filter((f) => existsSync(join(ROOT, f)));
    for (const f of mw) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      const matcher = /matcher\s*:\s*(\[[\s\S]*?\]|'[^']*'|"[^"]*")/.exec(src)?.[1];
      // no matcher = every path runs through it: that walls /elijah too
      expect(matcher, `${f} has no config.matcher, so it runs on /elijah`).toBeDefined();
      const patterns = [...matcher!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const p of patterns) {
        const re = new RegExp(`^${p.replace(/:path\*/g, '.*').replace(/:\w+\*/g, '.*').replace(/:\w+/g, '[^/]+').replace(/\((.*)\)/g, '($1)')}$`);
        expect(re.test('/elijah'), `${f} matcher ${p} matches /elijah`).toBe(false);
      }
    }
  });
});
