// SCREEN-FIX-2 item 2: SIGNED-OUT VISITORS TO THE QUICK SCREEN GET NO SIGN-IN COOKIES.
//
// next-auth's SessionProvider is what fetches /api/auth/session, and that answer is what sets
// `__Host-next-auth.csrf-token` and `__Secure-next-auth.callback-url` (measured live, 2026-09-29). So EVERY Quick Screen
// page, found from the file system (a new page is covered the day it is added), renders under the app's Providers with
// no SessionProvider and no fetch: a fixed signed-out session instead. The response headers themselves are measured by
// the probe (scripts/probes/_screen-fix-2-offsite.mts: no Set-Cookie for next-auth.* or __session anywhere in the flow).
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ path: '/', providerMounts: 0 }));
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => m.path,
  useRouter: () => ({ replace: () => {}, push: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
}));
vi.mock('next-auth/react', async (orig) => {
  const real = await orig<typeof import('next-auth/react')>();
  return {
    ...real,
    SessionProvider: ({ children }: { children: ReactNode }) => {
      m.providerMounts++;
      return createElement(real.SessionContext.Provider, { value: { data: null, status: 'loading', update: async () => null } }, children);
    },
  };
});

import { useSession } from 'next-auth/react';
import { Providers, isQuickScreenPath } from './providers';
import { LANE_SLUGS } from '@/lib/screen/PROPOSED-program-lanes';

const APP = join(__dirname, '../app');

/** Every page under the screen's two folders, as the address it serves ([lane] → each built lane). */
function screenRoutes(): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/^page\.tsx?$/.test(f)) continue;
      const route = `/${relative(APP, dir)}`;
      if (route.includes('[lane]')) for (const lane of LANE_SLUGS) out.push({ route: route.replace('[lane]', lane), file: relative(APP, p) });
      else out.push({ route, file: relative(APP, p) });
    }
  };
  walk(join(APP, 'screen'));
  walk(join(APP, 'play/mirror/assess'));
  return out;
}

function Status() {
  const { status } = useSession();
  return createElement('span', { 'data-session': status });
}

/** Each screen page module. A page the walk finds that is missing here fails the first test below. */
const PAGES: Record<string, () => Promise<{ default: unknown }>> = {
  'screen/page.tsx': () => import('@/app/screen/page'),
  'screen/privacy/page.tsx': () => import('@/app/screen/privacy/page'),
  'screen/program/[lane]/page.tsx': () => import('@/app/screen/program/[lane]/page'),
  'play/mirror/assess/page.tsx': () => import('@/app/play/mirror/assess/page'),
  'play/mirror/assess/results/page.tsx': () => import('@/app/play/mirror/assess/results/page'),
};

/** The page, rendered as its route does (a dynamic segment gets its params). */
async function pageElement(file: string, route: string): Promise<ReactNode> {
  const mod = await PAGES[file]();
  const lane = /\/screen\/program\/([^/]+)$/.exec(route)?.[1];
  return createElement(mod.default as never, (lane ? { params: { lane } } : {}) as never);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('every Quick Screen page renders under Providers with no SessionProvider and no fetch', () => {
  const routes = screenRoutes();
  it('the walk finds every screen page, and each one is rendered below', () => {
    expect([...new Set(routes.map((r) => r.file))].sort()).toEqual(Object.keys(PAGES).sort());
    expect(routes.map((r) => r.route).sort()).toEqual([
      '/play/mirror/assess', '/play/mirror/assess/results', '/screen', '/screen/privacy',
      ...LANE_SLUGS.map((l) => `/screen/program/${l}`),
    ].sort());
  });

  it.each(routes)('$route', async ({ route, file }) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(isQuickScreenPath(route)).toBe(true);
    m.path = route; m.providerMounts = 0;
    const h = renderToStaticMarkup(createElement(Providers, null, createElement(Status), await pageElement(file, route)));
    expect(m.providerMounts).toBe(0);
    expect(h).toContain('data-session="unauthenticated"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the QR address is a quick-screen page and does not forward a query string', async () => {
    const { default: Entry } = await import('@/app/screen/page');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    m.path = '/screen'; m.providerMounts = 0;
    let threw = false;
    let html = '';
    try {
      html = renderToStaticMarkup(createElement(Providers, null, createElement(Status), createElement(Entry)));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(m.providerMounts).toBe(0);
    expect(html).toContain('data-session="unauthenticated"');
    expect(html).toContain('Just test my jump (about 1 min)');
    expect(html).toContain('href="/play/mirror/assess?run=jump"');
    expect(html).not.toContain('src=');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isQuickScreenPath('/screen')).toBe(true);
  });

  it('a page off the screen still gets the SessionProvider (the control)', () => {
    m.path = '/try'; m.providerMounts = 0;
    expect(renderToStaticMarkup(createElement(Providers, null, createElement(Status)))).toContain('data-session="loading"');
    expect(m.providerMounts).toBe(1);
  });
});
