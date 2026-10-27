// Offline play and web push in the real public/sw.js (offline-push, round 8, 2026-10-26). tests/pwa/sw-routes.test.ts
// pins app-feel's rules; this file pins what offline play adds, and that none of it runs unless the worker was registered
// with ?offline=1 (NEXT_PUBLIC_OFFLINE_PLAY_ENABLED).
import { describe, expect, it } from 'vitest';
import { OFFLINE_LESSON_PATTERN, OFFLINE_REFUSED_PARAMS, offlinePagePaths, isOfflinePage, swScriptUrl, OFFLINE_SW_QUERY } from '@/lib/pwa/offlinePlay';
import { ORIGIN, basic, loadSwRules, request, startSw } from '../helpers/swHarness';

const SW = loadSwRules();
const ON = '?offline=1';

describe('the worker and lib/pwa/offlinePlay.ts keep one list', () => {
  it('OFFLINE_PAGES is exactly offlinePagePaths(): a new catalogue mode is red here until the worker learns it', () => {
    expect([...SW.OFFLINE_PAGES].sort()).toEqual(offlinePagePaths());
    expect(SW.OFFLINE_PAGES.length).toBeGreaterThanOrEqual(30);
  });

  it('the lesson pattern and the refused parameters match', () => {
    expect(SW.OFFLINE_LESSON.source).toBe(OFFLINE_LESSON_PATTERN.source);
    expect(SW.REFUSED_PARAMS).toEqual([...OFFLINE_REFUSED_PARAMS]);
  });

  it('the registration URL carries the switch the worker reads', () => {
    expect(swScriptUrl('/sw.js', false)).toBe('/sw.js');
    expect(swScriptUrl('/sw.js', true)).toBe(`/sw.js?${OFFLINE_SW_QUERY}`);
    expect(SW.offlineFrom(new URL(swScriptUrl('/sw.js', true), ORIGIN).search)).toBe(true);
    expect(SW.offlineFrom('')).toBe(false);
    expect(SW.offlineFrom('?offline=10')).toBe(false);
    expect(SW.offlineFrom('?x=1&offline=1')).toBe(true);
  });

  it('single-player modes, the Mirror, the combine and the lessons are on the list; the store, the Arena and sign-in are not', () => {
    for (const p of ['/play/dunk', '/play/threepoint', '/play/mirror', '/play/mirror/assess', '/coach/combine', '/education/playbook/3', '/learn', '/play']) {
      expect(isOfflinePage(p), p).toBe(true);
    }
    for (const p of ['/store', '/arena', '/play/party', '/login', '/account', '/coach', '/play/training', '/education/playbook/3/x', '/story']) {
      expect(isOfflinePage(p), p).toBe(false);
    }
  });
});

describe('FEL_SW.strategyFor with offline play OFF (the default): exactly app-feel\'s rules', () => {
  const route = (url: string, mode?: string) => SW.strategyFor({ url, origin: ORIGIN, mode });
  it('a mode page is network then the offline page, and no game file is touched', () => {
    expect(route('/play/dunk', 'navigate')).toEqual({ strategy: 'network-fallback', cache: SW.CACHES.offline });
    expect(route('/education/playbook/2', 'navigate').strategy).toBe('network-fallback');
    expect(route('/models/hero.glb').strategy).toBe('bypass');
    expect(route('/audio/stems/a.mp3').strategy).toBe('bypass');
  });

  it('activate deletes page and game-file copies a flagged worker left', async () => {
    const sw = startSw(async () => basic('x'));
    for (const n of [SW.CACHES.pages, SW.CACHES.assets, SW.CACHES.static]) await sw.openCache(n);
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect(sw.cacheNames()).toEqual([SW.CACHES.offline, SW.CACHES.static].sort());
  });

  it('a page load stores nothing and a warm message is ignored', async () => {
    const sw = startSw(async (url) => basic(`page ${new URL(url).pathname}`, 200, { 'content-type': 'text/html' }));
    await sw.lifecycle('install');
    await sw.fetchEvent(request('/play/dunk', { mode: 'navigate' }));
    await sw.message({ type: 'fel-warm', page: `${ORIGIN}/play/dunk`, assets: [`${ORIGIN}/models/hero.glb`] });
    expect(sw.cacheNames()).toEqual([SW.CACHES.offline]);
  });
});

describe('FEL_SW.strategyFor with offline play ON', () => {
  const route = (url: string, mode?: string, extra: { range?: boolean; method?: string } = {}) =>
    SW.strategyFor({ url, origin: ORIGIN, mode, offline: true, ...extra });

  it('a listed page is network first, kept under its path', () => {
    expect(route('/play/dunk?graphics=low', 'navigate')).toEqual({ strategy: 'network-first', cache: SW.CACHES.pages, key: `${ORIGIN}/play/dunk` });
    expect(route('/education/playbook/7', 'navigate').strategy).toBe('network-first');
  });

  it.each(['arena=m1', 'mp=AB12', 'c=xyz', 'tier=2', 'stake=50', 'ranked=1'])('a play with ?%s is never served from a copy', (q) => {
    expect(route(`/play/dunk?${q}`, 'navigate')).toEqual({ strategy: 'network-fallback', cache: SW.CACHES.offline });
  });

  it('an unlisted page, /api, Stripe and the worker itself are as before', () => {
    expect(route('/store', 'navigate').strategy).toBe('network-fallback');
    expect(route('/api/sessions', 'navigate').strategy).toBe('bypass');
    expect(route('/api/profile').strategy).toBe('bypass');
    expect(route('/coach/checkout', 'navigate').strategy).toBe('bypass');
    expect(route('/sw.js').strategy).toBe('bypass');
    expect(route('/play/dunk', 'navigate', { method: 'POST' }).strategy).toBe('bypass');
  });

  it('a sign-in, sign-up or sign-out page load drops the page copies on its way past', () => {
    for (const p of ['/login', '/signup?next=/play', '/logout', '/auth/error']) {
      expect(route(p, 'navigate')).toEqual({ strategy: 'bypass', clear: SW.CACHES.pages });
    }
    expect(route('/login').clear).toBeUndefined();   // only a page load, not a fetch of it
  });

  it('game files are network first; a range request (audio seeking) is not', () => {
    for (const p of ['/models/hero.glb', '/audio/menu.mp3', '/venues/venice/sky.ktx2', '/mocap/a.bvh', '/vendor/havok/HavokPhysics.wasm']) {
      expect(route(p)).toEqual({ strategy: 'network-first', cache: SW.CACHES.assets });
    }
    expect(route('/audio/menu.mp3', undefined, { range: true }).strategy).toBe('bypass');
    expect(route('/icons/icon-192.png').strategy).toBe('bypass');
    expect(route('/pose/models/pose_landmarker_lite.task').strategy).toBe('stale-while-revalidate');   // OFF-02: unchanged
  });

  it('every cache stays under the fel- prefix the kill switch deletes, versioned', () => {
    for (const n of Object.values(SW.CACHES)) { expect(n.startsWith('fel-')).toBe(true); expect(n).toContain(SW.VERSION); }
    expect(SW.isCurrentCache(SW.CACHES.pages, true)).toBe(true);
    expect(SW.isCurrentCache(SW.CACHES.pages, false)).toBe(false);
    expect(SW.isCurrentCache('fel-pages-v0', true)).toBe(false);
  });
});

describe('offline play in a fake worker scope', () => {
  const OFFLINE_PAGE = '<!doctype html><title>You\'re offline</title>';
  let deploy = 'A';
  let up = true;
  let signedIn = true;
  const etags: Record<string, string> = {};
  const net = async (url: string) => {
    if (!up) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    if (u.pathname === '/offline.html') return basic(OFFLINE_PAGE, 200, { 'content-type': 'text/html' });
    if (u.pathname.startsWith('/play/') && !signedIn) {
      const r = basic('<html>login</html>', 200, { 'content-type': 'text/html' });
      Object.defineProperty(r, 'redirected', { value: true });
      return r;
    }
    if (u.pathname.startsWith('/models/')) return basic(`model ${u.pathname} ${etags[u.pathname] ?? 'e1'}`, 200, { etag: `"${etags[u.pathname] ?? 'e1'}"` });
    return basic(`<html>deploy ${deploy} ${u.pathname}</html>`, 200, { 'content-type': 'text/html' });
  };
  const fresh = () => { deploy = 'A'; up = true; signedIn = true; for (const k of Object.keys(etags)) delete etags[k]; return startSw(net, { search: ON }); };
  const text = async (r: { handled: boolean; response?: Response }) => (r.handled && r.response ? r.response.text() : '(not handled)');

  it('a mode opened online opens offline; online it is always the network\'s, so a new deploy is never held back', async () => {
    const sw = fresh();
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect(await text(await sw.fetchEvent(request('/play/dunk', { mode: 'navigate' })))).toBe('<html>deploy A /play/dunk</html>');
    deploy = 'B';
    expect(await text(await sw.fetchEvent(request('/play/dunk', { mode: 'navigate' })))).toBe('<html>deploy B /play/dunk</html>');
    up = false;
    expect(await text(await sw.fetchEvent(request('/play/dunk?graphics=low', { mode: 'navigate' })))).toBe('<html>deploy B /play/dunk</html>');
  });

  it('offline: a mode never opened, an Arena run of an opened mode, and an unlisted page all get the offline page', async () => {
    const sw = fresh();
    await sw.lifecycle('install');
    await sw.fetchEvent(request('/play/dunk', { mode: 'navigate' }));
    up = false;
    expect(await text(await sw.fetchEvent(request('/play/golf', { mode: 'navigate' })))).toBe(OFFLINE_PAGE);
    expect(await text(await sw.fetchEvent(request('/play/dunk?arena=m1', { mode: 'navigate' })))).toBe(OFFLINE_PAGE);
    expect(await text(await sw.fetchEvent(request('/store', { mode: 'navigate' })))).toBe(OFFLINE_PAGE);
  });

  it('a redirected answer (signed out → login) is never kept as the page', async () => {
    const sw = fresh();
    signedIn = false;
    await sw.fetchEvent(request('/play/dunk', { mode: 'navigate' }));
    expect(sw.cache(SW.CACHES.pages)?.store.size ?? 0).toBe(0);
  });

  it('opening the sign-in page drops every page copy; so does the page\'s own clear message', async () => {
    const sw = fresh();
    await sw.fetchEvent(request('/play/dunk', { mode: 'navigate' }));
    expect(sw.cache(SW.CACHES.pages)!.store.size).toBe(1);
    expect((await sw.fetchEvent(request('/login', { mode: 'navigate' }))).handled).toBe(false);
    expect(sw.cache(SW.CACHES.pages)).toBeUndefined();
    await sw.fetchEvent(request('/learn', { mode: 'navigate' }));
    await sw.message({ type: 'fel-clear-pages' });
    expect(sw.cache(SW.CACHES.pages)).toBeUndefined();
  });

  it('a game file is kept, rewritten only when it changed, and served offline', async () => {
    const sw = fresh();
    const model = request('/models/hero.glb');
    await sw.fetchEvent(model);
    const first = sw.cache(SW.CACHES.assets)!.store.get(`${ORIGIN}/models/hero.glb`);
    await sw.fetchEvent(model);
    expect(sw.cache(SW.CACHES.assets)!.store.get(`${ORIGIN}/models/hero.glb`)).toBe(first);   // same ETag: not rewritten
    etags['/models/hero.glb'] = 'e2';
    await sw.fetchEvent(model);
    up = false;
    expect(await text(await sw.fetchEvent(model))).toBe('model /models/hero.glb e2');
    const missing = await sw.fetchEvent(request('/models/never.glb'));
    expect(missing.handled && missing.response.type).toBe('error');
  });

  it('the copies are trimmed, oldest first', async () => {
    const sw = fresh();
    for (let i = 0; i < SW.ASSETS_MAX_ENTRIES + 3; i++) await sw.fetchEvent(request(`/models/m${i}.glb`));
    const keys = [...sw.cache(SW.CACHES.assets)!.store.keys()];
    expect(keys).toHaveLength(SW.ASSETS_MAX_ENTRIES);
    expect(keys[0]).toBe(`${ORIGIN}/models/m3.glb`);
  });

  it('warm keeps what the first page loaded before the worker controlled it, and nothing it would not keep', async () => {
    const sw = fresh();
    await sw.message({
      type: 'fel-warm',
      page: `${ORIGIN}/play/dunk?story=n1`,
      assets: [
        `${ORIGIN}/_next/static/chunks/abc123.js`, `${ORIGIN}/models/hero.glb`, `${ORIGIN}/pose/models/pose_landmarker_lite.task`,
        `${ORIGIN}/api/profile`, 'https://cdn.example.com/x.js', `${ORIGIN}/models/hero.glb`, 42,
      ],
    });
    expect([...sw.cache(SW.CACHES.pages)!.store.keys()]).toEqual([`${ORIGIN}/play/dunk`]);
    expect([...sw.cache(SW.CACHES.static)!.store.keys()]).toEqual([`${ORIGIN}/_next/static/chunks/abc123.js`]);
    expect([...sw.cache(SW.CACHES.assets)!.store.keys()]).toEqual([`${ORIGIN}/models/hero.glb`]);
    expect([...sw.cache(SW.CACHES.pose)!.store.keys()]).toEqual([`${ORIGIN}/pose/models/pose_landmarker_lite.task`]);
    expect(sw.calls.fetched.filter((u) => u.includes('/api/') || u.includes('cdn.example'))).toEqual([]);
    expect(sw.calls.fetched.filter((u) => u.endsWith('/models/hero.glb'))).toHaveLength(1);   // not fetched twice
    // a warm for an unlisted page or an Arena run keeps no page
    await sw.message({ type: 'fel-warm', page: `${ORIGIN}/store` });
    await sw.message({ type: 'fel-warm', page: `${ORIGIN}/play/golf?arena=m1` });
    expect([...sw.cache(SW.CACHES.pages)!.store.keys()]).toEqual([`${ORIGIN}/play/dunk`]);
  });
});

describe('the update path: a new deploy\'s worker replaces the old one at once', () => {
  it('install skips waiting and activate claims the open tabs and deletes the old version\'s caches', async () => {
    const sw = startSw(async (url) => basic(new URL(url).pathname === '/offline.html' ? 'offline' : 'x'), { search: ON });
    const old = ['fel-static-v0', 'fel-pages-v0', 'fel-assets-v0', 'fel-offline-v0', 'fel-pose-0.10.14-v0'];
    for (const n of old) await sw.openCache(n);
    await sw.lifecycle('install');
    expect(sw.calls.skipWaiting).toBe(1);
    await sw.lifecycle('activate');
    expect(sw.calls.claim).toBe(1);
    for (const n of old) expect(sw.cacheNames()).not.toContain(n);
  });
});

describe('web push in the worker', () => {
  it('a push shows its notification, bounded, opening only a same-origin path', async () => {
    const sw = startSw(async () => basic('x'));
    await sw.push(JSON.stringify({ title: 'Your coach sent a message', body: 'Open it in FEL.', url: '/coach', tag: 'coach_message' }));
    expect(sw.calls.shown).toEqual([{ title: 'Your coach sent a message', options: { body: 'Open it in FEL.', tag: 'coach_message', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/coach' } } }]);
  });

  it('a body that cannot be read still shows a notification (userVisibleOnly), never a blank one', async () => {
    const sw = startSw(async () => basic('x'));
    await sw.push('not json');
    await sw.push(null);
    expect(sw.calls.shown.map((s) => s.title)).toEqual(['Final Evolution Lab', 'Final Evolution Lab']);
  });

  it.each([
    ['https://evil.example/phish', '/'], ['//evil.example/x', '/'], ['/\\evil.example', '/'], ['javascript:alert(1)', '/'],
    [42, '/'], ['/train/today-drill', '/train/today-drill'],
  ])('a url of %s opens %s', (url, want) => {
    expect(SW.notificationFor({ url }).options.data.url).toBe(want);
  });

  it('long text is clipped', () => {
    const n = SW.notificationFor({ title: 'x'.repeat(300), body: 'y'.repeat(900), tag: 'z'.repeat(100) });
    expect(n.title).toHaveLength(80);
    expect(n.options.body).toHaveLength(200);
    expect(n.options.tag).toHaveLength(64);
  });

  it('a tap focuses the tab already on that page, or opens it', async () => {
    const sw = startSw(async () => basic('x'), { windows: [`${ORIGIN}/coach`] });
    expect(await sw.notificationClick('/coach')).toEqual({ closed: true });
    expect(sw.calls.focused).toEqual([`${ORIGIN}/coach`]);
    await sw.notificationClick('https://evil.example/');
    expect(sw.calls.opened).toEqual([`${ORIGIN}/`]);
  });
});
