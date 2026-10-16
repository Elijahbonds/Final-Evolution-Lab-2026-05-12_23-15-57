// The sitemap lists the public pages whatever the coach-store flag says, and nothing private (owner, 2026-10-16).
// It was `[]` while the flag was off, which is how it ships. The guards below read the real app directory, so a page that
// starts to require sign-in (or is added as noindex) while it is still listed fails here.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/db', () => ({ prisma: { instructor: { findMany: vi.fn(async () => [{ slug: 'coach-a' }]) } } }));

import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { PUBLIC_STATIC_PATHS, SITE_ORIGIN, publicPaths } from '@/lib/seo/publicPages';

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'app');

/** Held routes, from the reachability walker's own list (lib/nav/reachability.test.ts NOT_NAVIGABLE: 'HOLD — ...'). */
function heldRoutes(): string[] {
  const src = readFileSync(join(ROOT, 'lib/nav/reachability.test.ts'), 'utf8');
  return [...src.matchAll(/^\s*'(\/[^']*)':\s*['"`]HOLD\b/gm)].map((m) => m[1]);
}

/** Every page route with its file, from the real app directory. */
function pages(): Array<{ route: string; file: string; dir: string }> {
  const out: Array<{ route: string; file: string; dir: string }> = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/^page\.tsx?$/.test(e)) continue;
      const rel = dir.slice(APP.length).replace(/\\/g, '/');
      const parts = rel.split('/').filter((s) => s && !s.startsWith('_') && !s.startsWith('('));
      out.push({ route: parts.length ? `/${parts.join('/')}` : '/', file: p, dir });
    }
  };
  walk(APP);
  return out;
}

/** The page or a layout above it turns a signed-out visitor away, or marks the page noindex. */
function gate(dir: string, file: string): { signIn: boolean; noindex: boolean; flag: boolean } {
  const srcs = [readFileSync(file, 'utf8')];
  for (let d = dir; d.length >= APP.length; d = join(d, '..')) {
    const lay = join(d, 'layout.tsx');
    if (existsSync(lay)) srcs.push(readFileSync(lay, 'utf8'));
    if (d === APP) break;
  }
  const all = srcs.join('\n');
  return {
    signIn: /redirect\(\s*loginPath\(/.test(all),
    noindex: /index:\s*false|noindex/.test(all),
    flag: /notFound\(\)/.test(readFileSync(file, 'utf8')) && /Enabled\(\)/.test(readFileSync(file, 'utf8')),
  };
}

const urlPath = (u: string) => u.replace(SITE_ORIGIN, '') || '/';

describe('app/sitemap.ts', () => {
  beforeEach(() => { delete process.env.COACH_STORE_ENABLED; });

  it('lists the public pages while the coach-store flag is off (it used to return [])', async () => {
    const urls = (await sitemap()).map((e) => urlPath(e.url));
    expect(urls.length).toBeGreaterThan(15);
    for (const p of ['/', '/modes', '/learn', '/screen', '/privacy', '/terms', '/store-terms', '/support', '/credits', '/links', '/press', '/team', '/media-kit', '/work-with-us']) {
      expect(urls, p).toContain(p);
    }
    // the dynamic public pages: each book and each approved team profile
    expect(urls.some((u) => u.startsWith('/press/') && u !== '/press/library')).toBe(true);
    expect(urls.some((u) => u.startsWith('/team/'))).toBe(true);
  });

  it('keeps the coach-store URLs behind the flag', async () => {
    expect((await sitemap()).some((e) => e.url.includes('/coach/'))).toBe(false);
    process.env.COACH_STORE_ENABLED = '1';
    const on = (await sitemap()).map((e) => urlPath(e.url));
    expect(on).toContain('/coach/coach-a');
    expect(on).toContain('/coach/coach-a/programs/dunking');
    expect(on).toContain('/privacy');            // the public pages are still there with the flag on
  });

  it('lists no private, dev or held route', async () => {
    const urls = (await sitemap()).map((e) => urlPath(e.url));
    for (const bad of ['/studio', '/dev', '/api', '/admin', '/login', '/signup', '/account', '/play', '/profile', '/train', '/press/library', '/press/receipt', '/host', '/join', '/party', '/session', '/program', '/live/schedule', '/play/mirror/assess']) {
      expect(urls.filter((u) => u === bad || u.startsWith(bad + '/')), bad).toEqual([]);
    }
    for (const held of heldRoutes()) {
      expect(urls.filter((u) => u === held || u.startsWith(held + '/')), `held route ${held}`).toEqual([]);
    }
    expect(heldRoutes()).toContain('/studio');   // the HOLD list was read (a parse that finds nothing proves nothing)
  });

  it('is absolute, unique and on the production origin', async () => {
    const all = (await sitemap()).map((e) => e.url);
    expect(new Set(all).size).toBe(all.length);
    for (const u of all) expect(u.startsWith(SITE_ORIGIN + '/'), u).toBe(true);
  });
});

describe('every listed page, against the app directory', () => {
  const byRoute = new Map(pages().map((p) => [p.route, p]));
  const disallow = ([] as string[]).concat((robots().rules as { disallow?: string | string[] }).disallow ?? []);

  it('every static entry is a real page', () => {
    for (const p of PUBLIC_STATIC_PATHS) expect(byRoute.has(p), `${p} has no page`).toBe(true);
  });

  it('no listed page sends a signed-out visitor to /login, is noindex, or is flag-gated', () => {
    for (const p of PUBLIC_STATIC_PATHS) {
      const page = byRoute.get(p)!;
      const g = gate(page.dir, page.file);
      expect(g, p).toEqual({ signIn: false, noindex: false, flag: false });
    }
    // the dynamic ones share a route pattern
    for (const pat of ['/press/[slug]', '/team/[slug]']) {
      const page = byRoute.get(pat)!;
      expect(page, pat).toBeTruthy();
      const g = gate(page.dir, page.file);
      expect(g.signIn, pat).toBe(false);
      expect(g.noindex, pat).toBe(false);
    }
  });

  it('nothing under a path robots.txt disallows is listed', () => {
    for (const path of publicPaths()) {
      for (const d of disallow) expect(path.startsWith(d), `${path} is under disallowed ${d}`).toBe(false);
    }
  });

  it('the guard can fail: the app has sign-in pages, and the check sees them (control)', () => {
    const play = byRoute.get('/play')!;
    expect(gate(play.dir, play.file).signIn).toBe(true);
    const studio = byRoute.get('/studio')!;
    expect(gate(studio.dir, studio.file).signIn).toBe(true);   // gated by its layout
    const join = byRoute.get('/join')!;
    expect(gate(join.dir, join.file).noindex).toBe(true);
  });
});

describe('app/robots.ts', () => {
  it('points crawlers at the sitemap', () => {
    expect(robots().sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
  });
  it('still disallows the private paths', () => {
    const d = ([] as string[]).concat((robots().rules as { disallow?: string | string[] }).disallow ?? []);
    for (const p of ['/session', '/program', '/account', '/coach/admin', '/coach/dashboard']) expect(d).toContain(p);
  });
});
