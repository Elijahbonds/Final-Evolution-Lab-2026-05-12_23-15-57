// The service worker, run from the real public/sw.js (app-feel, round 7, 2026-10-25). Two things are pinned:
//   1. the routing rules (FEL_SW.strategyFor): pages are never cached, /api, /_next/data, sign-in and Stripe are never
//      touched, hashed /_next/static is cache-first, and the pose model and runtime are stale-while-revalidate;
//   2. the worker's behaviour in a fake worker scope (tests/helpers/swHarness.ts): what it actually stores, what it
//      answers offline, and what it deletes when a new version activates.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { VISION_VERSION, LOCAL_WASM_FILES, localModelUrl, LOCAL_WASM_BASE } from '@/lib/pose/assets';
import { ORIGIN, basic, loadSwRules, request, startSw } from '../helpers/swHarness';

const SW = loadSwRules();
const route = (url: string, extra: { method?: string; mode?: string; range?: boolean } = {}) => SW.strategyFor({ url, origin: ORIGIN, ...extra }).strategy;

describe('FEL_SW.strategyFor: which requests the worker may touch', () => {
  it.each([
    '/', '/try', '/play/dunk', '/coach/dashboard', '/account', '/modes?x=1',
  ])('a page load of %s goes to the network with only the offline fallback', (p) => {
    expect(route(p, { mode: 'navigate' })).toBe('network-fallback');
  });

  it.each([
    ['/api/sessions', 'navigate'], ['/api/auth/session', 'cors'], ['/api/auth/callback/google', 'navigate'],
    ['/api', 'cors'], ['/api/stripe/webhook', 'cors'], ['/_next/data/abc123/play.json', 'cors'],
    ['/_next/image?url=%2Fog.png&w=640', 'no-cors'], ['/login', 'navigate'], ['/signup?next=/play', 'navigate'],
    ['/coach/checkout', 'navigate'], ['/store/stripe-return', 'navigate'], ['/__/auth/handler', 'navigate'],
    ['/sw.js', 'cors'], ['/app.webmanifest', 'cors'], ['/offline.html', 'navigate'],
  ])('%s (%s) is never touched', (p, mode) => {
    expect(route(p, { mode })).toBe('bypass');
  });

  it('anything that is not a GET, any range request, and any other origin is left alone', () => {
    expect(route('/pose/models/pose_landmarker_lite.task', { method: 'HEAD' })).toBe('bypass');   // lib/pose/assets.ts probe
    expect(route('/_next/static/chunks/abc.js', { method: 'POST' })).toBe('bypass');
    expect(route('/audio/menu.mp3', { range: true })).toBe('bypass');
    expect(route('/_next/static/chunks/abc.js', { range: true })).toBe('bypass');
    expect(route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm')).toBe('bypass');
    expect(route('https://checkout.stripe.com/c/pay', { mode: 'navigate' })).toBe('bypass');
  });

  it('hashed Next build files are cache-first; the dev server\'s are not', () => {
    for (const p of ['/_next/static/chunks/0123456789abcdef.js', '/_next/static/chunks/main-app-1a2b3c4d.js',
      '/_next/static/css/5f2e.css', '/_next/static/media/barlow.3c1f.woff2', '/_next/static/BUILDID/_buildManifest.js']) {
      expect(SW.strategyFor({ url: p, origin: ORIGIN })).toEqual({ strategy: 'cache-first', cache: SW.CACHES.static });
    }
    expect(route('/_next/static/development/_buildManifest.js')).toBe('bypass');
  });

  it('the pose model and runtime the camera needs are stale-while-revalidate, in a cache named for their version', () => {
    const files = [localModelUrl('lite'), localModelUrl('full'), ...LOCAL_WASM_FILES.map((f) => `${LOCAL_WASM_BASE}/${f}`)];
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const p of files) expect(SW.strategyFor({ url: p, origin: ORIGIN })).toEqual({ strategy: 'stale-while-revalidate', cache: SW.CACHES.pose });
    expect(route('/pose/README.md')).toBe('bypass');
    expect(route('/pose/models/../../api/x.task')).toBe('bypass');   // URL resolves it to /api/x.task first
  });

  it('the 390 MB of models, audio and venues stay with the HTTP cache, not stored a second time', () => {
    for (const p of ['/models/hero.glb', '/audio/stems/a.mp3', '/venues/venice/sky.ktx2', '/backdrops/x.jpg', '/og-image.png', '/icons/icon-192.png']) {
      expect(route(p)).toBe('bypass');
    }
  });

  it('the pose cache is versioned by the tasks-vision build the JS is compiled from', () => {
    expect(SW.POSE_VERSION).toBe(VISION_VERSION);
    expect(SW.CACHES.pose).toContain(VISION_VERSION);
    expect(Object.values(SW.CACHES).every((n) => n.startsWith('fel-'))).toBe(true);
  });

  it('no page response is ever written to a cache: put() appears only in the static and pose branches', () => {
    const src = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
    const fallback = src.slice(src.indexOf("route.strategy === 'network-fallback'"), src.indexOf("route.strategy === 'cache-first'"));
    expect(fallback.length).toBeGreaterThan(100);
    expect(fallback).not.toMatch(/\.put\(|\.add\(/);
  });
});

describe('the worker in a fake worker scope', () => {
  const OFFLINE_PAGE = '<!doctype html><title>You\'re offline</title>';
  const online = async (url: string) => {
    const p = new URL(url).pathname;
    if (p === '/offline.html') return basic(OFFLINE_PAGE, 200, { 'content-type': 'text/html' });
    if (p === '/') return basic('<html>deploy B</html>', 200, { 'content-type': 'text/html' });
    return basic(`body of ${p}`);
  };

  it('install precaches only the offline page, takes over at once, and activate claims the open tabs', async () => {
    const sw = startSw(online);
    await sw.lifecycle('install');
    expect(sw.cacheNames()).toEqual([SW.CACHES.offline]);
    expect([...sw.cache(SW.CACHES.offline)!.store.keys()]).toEqual([`${ORIGIN}/offline.html`]);
    expect(sw.calls.skipWaiting).toBe(1);
    await sw.lifecycle('activate');
    expect(sw.calls.claim).toBe(1);
    expect(sw.calls.preloadEnabled).toBe(1);
  });

  it('activate deletes old fel-* caches and nobody else\'s', async () => {
    const sw = startSw(online);
    for (const n of ['fel-static-v0', 'fel-pose-0.10.14-v1', 'fel-offline-v0', 'some-other-app', SW.CACHES.static]) await sw.openCache(n);
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect(sw.cacheNames()).toEqual([SW.CACHES.offline, SW.CACHES.static, 'some-other-app'].sort());
  });

  it('a page load is answered from the network and never stored; offline, it gets the offline page', async () => {
    let up = true;
    const sw = startSw(async (url) => { if (!up) throw new TypeError('Failed to fetch'); return online(url); });
    await sw.lifecycle('install');
    const first = await sw.fetchEvent(request('/', { mode: 'navigate' }));
    expect(first.handled && await first.response.text()).toBe('<html>deploy B</html>');
    // nothing but the offline page in any cache
    expect(sw.cacheNames()).toEqual([SW.CACHES.offline]);
    expect(sw.cache(SW.CACHES.offline)!.store.size).toBe(1);

    up = false;
    const off = await sw.fetchEvent(request('/play', { mode: 'navigate' }));
    expect(off.handled && await off.response.text()).toBe(OFFLINE_PAGE);
  });

  it('a navigation preload response is used as is, not fetched twice', async () => {
    const sw = startSw(online);
    await sw.lifecycle('install');
    sw.calls.fetched.length = 0;
    const r = await sw.fetchEvent(request('/train', { mode: 'navigate' }), Promise.resolve(basic('preloaded')));
    expect(r.handled && await r.response.text()).toBe('preloaded');
    expect(sw.calls.fetched).toEqual([]);
  });

  it('/api is never answered by the worker, so the browser does it exactly as without one', async () => {
    const sw = startSw(online);
    for (const p of ['/api/sessions', '/api/auth/session', '/_next/data/b/x.json']) {
      expect((await sw.fetchEvent(request(p))).handled).toBe(false);
    }
    expect((await sw.fetchEvent(request('/api/sessions', { method: 'POST' }))).handled).toBe(false);
  });

  it('a hashed chunk is fetched once, then served from the cache', async () => {
    const sw = startSw(online);
    const chunk = request('/_next/static/chunks/0123456789abcdef.js');
    const a = await sw.fetchEvent(chunk);
    expect(a.handled && await a.response.text()).toBe('body of /_next/static/chunks/0123456789abcdef.js');
    const b = await sw.fetchEvent(chunk);
    expect(b.handled && await b.response.text()).toBe('body of /_next/static/chunks/0123456789abcdef.js');
    expect(sw.calls.fetched.filter((u) => u.endsWith('0123456789abcdef.js'))).toHaveLength(1);
  });

  it('an error or a redirect is never cached', async () => {
    const sw = startSw(async () => basic('nope', 404));
    await sw.fetchEvent(request('/_next/static/chunks/missing.js'));
    await sw.fetchEvent(request('/pose/models/pose_landmarker_lite.task'));
    expect(sw.cache(SW.CACHES.static)?.store.size ?? 0).toBe(0);
    expect(sw.cache(SW.CACHES.pose)?.store.size ?? 0).toBe(0);
  });

  it('the pose model is served from the cache next time, and refreshed behind it', async () => {
    let version = 1;
    const sw = startSw(async (url) => basic(`model v${version} ${new URL(url).pathname}`));
    const model = request('/pose/models/pose_landmarker_lite.task');
    const first = await sw.fetchEvent(model);
    expect(first.handled && await first.response.text()).toBe('model v1 /pose/models/pose_landmarker_lite.task');
    version = 2;
    const second = await sw.fetchEvent(model);
    expect(second.handled && await second.response.text()).toBe('model v1 /pose/models/pose_landmarker_lite.task');   // stale, instantly
    const third = await sw.fetchEvent(model);
    expect(third.handled && await third.response.text()).toBe('model v2 /pose/models/pose_landmarker_lite.task');    // revalidated
  });

  it('the static cache is trimmed, oldest first', async () => {
    const sw = startSw(online);
    for (let i = 0; i < SW.STATIC_MAX_ENTRIES + 5; i++) await sw.fetchEvent(request(`/_next/static/chunks/${String(i).padStart(16, '0')}.js`));
    const keys = [...sw.cache(SW.CACHES.static)!.store.keys()];
    expect(keys).toHaveLength(SW.STATIC_MAX_ENTRIES);
    expect(keys[0]).toContain(`${String(5).padStart(16, '0')}.js`);
  });
});
