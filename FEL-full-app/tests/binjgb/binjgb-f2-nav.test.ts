// BINJGB-SHELF-1 F2 (Cyber build review dcbbec16): entering and leaving the shelf are full page loads. Header policies are
// per document; an App Router soft navigation would carry the shelf's camera=() / enforced CSP out into the app, or the
// app's rule-0 policy into the shelf. PR-time manual check (NOTES.md): hard-load the shelf → tap to /screen → the camera
// works; soft-nav from /play into the shelf → DevTools shows the enforced CSP.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { fullLoadTarget, inShelf, reloadAfterHistoryMove, SHELF_PATH } from '@/lib/binjgb/nav';
import { HomebrewShelf } from '@/components/binjgb/homebrew-shelf';
import { HomebrewShelfRow } from '@/components/binjgb/homebrew-row';
import { read, sources } from './helpers';

const HERE_SHELF = { href: 'https://fel.example/play/gb-shelf', origin: 'https://fel.example', pathname: '/play/gb-shelf' };
const HERE_PLAY = { href: 'https://fel.example/play', origin: 'https://fel.example', pathname: '/play' };
const click = (over: Partial<Parameters<typeof fullLoadTarget>[0]> = {}) =>
  ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over });
const a = (href: string, over: Partial<Parameters<typeof fullLoadTarget>[1]> = {}) => ({ href, target: '', download: false, ...over });

/** Code only — comments here quote the rule. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('the boundary', () => {
  it('the shelf is /play/gb-shelf and everything under it, nothing else', () => {
    expect(SHELF_PATH).toBe('/play/gb-shelf');
    for (const p of ['/play/gb-shelf', '/play/gb-shelf/x', '/play/gb-shelf/local-frame']) expect(inShelf(p), p).toBe(true);
    for (const p of ['/play', '/play/gb-shelfx', '/screen', '/', '/credits']) expect(inShelf(p), p).toBe(false);
  });
});

describe('fullLoadTarget: crossing the boundary in either direction is a full load', () => {
  it('leaving the shelf: the app chrome, Credits, Back, the age prompt → full load of that URL', () => {
    for (const href of ['/play', '/credits', '/screen', '/', '/age?next=%2Fplay%2Fgb-shelf', 'https://fel.example/me']) {
      expect(fullLoadTarget(click(), a(href), HERE_SHELF), href).toBe(new URL(href, HERE_SHELF.href).href);
    }
  });

  it('entering the shelf from elsewhere → full load', () => {
    expect(fullLoadTarget(click(), a('/play/gb-shelf'), HERE_PLAY)).toBe('https://fel.example/play/gb-shelf');
  });

  it('moves within one side are left to the router / browser', () => {
    expect(fullLoadTarget(click(), a('/play/gb-shelf/some-slug'), HERE_SHELF)).toBeNull();
    expect(fullLoadTarget(click(), a('/credits'), HERE_PLAY)).toBeNull();
    expect(fullLoadTarget(click(), a('#top'), HERE_SHELF)).toBeNull();
  });

  it('never takes: modified or non-primary clicks, new tabs, downloads, other origins, or already-handled clicks', () => {
    for (const c of [click({ button: 1 }), click({ metaKey: true }), click({ ctrlKey: true }), click({ shiftKey: true }), click({ altKey: true }), click({ defaultPrevented: true })]) {
      expect(fullLoadTarget(c, a('/play'), HERE_SHELF)).toBeNull();
    }
    expect(fullLoadTarget(click(), a('/play', { target: '_blank' }), HERE_SHELF)).toBeNull();
    expect(fullLoadTarget(click(), a('/play', { download: true }), HERE_SHELF)).toBeNull();
    expect(fullLoadTarget(click(), a('https://other.example/play'), HERE_SHELF)).toBeNull();
    expect(fullLoadTarget(click(), a('/play', { target: '_self' }), HERE_SHELF)).toBe('https://fel.example/play');
  });

  it('a back/forward move inside the shelf document that lands outside it reloads', () => {
    expect(reloadAfterHistoryMove('/play')).toBe(true);
    expect(reloadAfterHistoryMove('/play/gb-shelf')).toBe(false);
  });
});

describe('the guard on the shelf page (capture phase, before next/link)', () => {
  const g = code('components/binjgb/shelf-nav-guard.tsx');

  it('is a client component listening on window in the CAPTURE phase, and turns the click into location.assign', () => {
    expect(read('components/binjgb/shelf-nav-guard.tsx').startsWith("'use client';")).toBe(true);
    expect(g).toMatch(/window\.addEventListener\('click', onClick, true\)/);
    expect(g).toMatch(/window\.removeEventListener\('click', onClick, true\)/);
    expect(g).toMatch(/fullLoadTarget\(/);
    expect(g).toMatch(/ev\.preventDefault\(\);\s*ev\.stopPropagation\(\);\s*window\.location\.assign\(to\);/);
    expect(g).toMatch(/window\.addEventListener\('popstate', onPop\)/);
    expect(g).toMatch(/window\.location\.reload\(\)/);
    expect(g).not.toMatch(/next\/(link|navigation)/);
  });

  it('is mounted on every shelf view (the shelf and the age prompt, so the slug route too)', () => {
    expect(code('components/binjgb/homebrew-shelf.tsx')).toMatch(/<ShelfNavGuard \/>/);
    const html = renderToStaticMarkup(createElement(HomebrewShelf, { titles: [], agePrompt: true, picker: false }));
    expect(html).toContain('href="/age?next=%2Fplay%2Fgb-shelf"');
  });
});

describe('no next/link (or router push) into or out of the shelf', () => {
  const tsx = sources(['app', 'components', 'lib']).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

  it('no <Link> anywhere targets /play/gb-shelf, and no router push / replace / prefetch does', () => {
    const hits: string[] = [];
    for (const f of tsx) {
      const src = code(f);
      for (const m of src.matchAll(/<Link\b[^>]*>/g)) if (/gb-shelf/.test(m[0])) hits.push(`${f}: ${m[0].slice(0, 80)}`);
      if (/router\.(push|replace|prefetch)\([^)]*gb-shelf/.test(src)) hits.push(`${f}: router → gb-shelf`);
    }
    expect(hits).toEqual([]);
  });

  it('the shelf files do not import next/link at all; their links are plain anchors', () => {
    for (const f of ['components/binjgb/homebrew-shelf.tsx', 'components/binjgb/homebrew-row.tsx', 'components/binjgb/local-player.tsx', 'components/binjgb/delete-saves.tsx']) {
      expect(code(f), f).not.toMatch(/from 'next\/link'|<Link\b/);
    }
    const shelf = code('components/binjgb/homebrew-shelf.tsx');
    expect(shelf).toMatch(/<a href="\/credits"/);
    expect(shelf).toMatch(/<a href="\/play"/);
    expect(shelf).toMatch(/<a href=\{AGE_PROMPT_COPY\.href\}/);
    expect(shelf).toMatch(/<a href=\{`\/play\/gb-shelf\/\$\{t\.slug\}`\}/);
  });

  it('the Play hub row is a plain <a href="/play/gb-shelf"> (rendered, when it shows)', () => {
    const html = renderToStaticMarkup(createElement(HomebrewShelfRow, { show: true }));
    expect(html).toMatch(/^<div class="mt-6"><a href="\/play\/gb-shelf" data-testid="play-homebrew-row"/);
    expect(renderToStaticMarkup(createElement(HomebrewShelfRow, { show: false }))).toBe('');
  });
});
