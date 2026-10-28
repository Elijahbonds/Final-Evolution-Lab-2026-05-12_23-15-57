/* FEL service worker (app-feel, round 7, 2026-10-25). Conservative by design.
 *
 * Registered by components/pwa/sw-register.tsx in production only, and only while NEXT_PUBLIC_SW_ENABLED is on (it
 * ships OFF; the owner flips it after a device check). With the flag off, that same component unregisters this worker
 * and deletes its caches: the kill switch.
 *
 * WHAT IT DOES, AND NOTHING ELSE
 *   - Page loads (navigations) go to the network, every time. It NEVER caches a page, so a deploy can never be pinned
 *     behind an old one. Only when the network fails does it answer with /offline.html, a static page precached at
 *     install that says what still works.
 *   - /_next/static/** is cache-first. Next names those files by content hash (next.config.js sets
 *     [contenthash] for every client chunk; css and media are hashed by Next itself), so a cached copy is never stale:
 *     a new deploy asks for new names.
 *   - The camera's pose model and runtime (/pose/models/*.task, /pose/wasm/*, ~16 MB on first camera use) are
 *     stale-while-revalidate: the camera starts from the cache and the copy refreshes in the background. Their names do
 *     not carry a hash, so the cache name carries the tasks-vision version instead (POSE_VERSION, pinned to
 *     lib/pose/assets.ts VISION_VERSION by tests/pwa/sw-routes.test.ts): an upgrade gets a fresh cache and the old one
 *     is deleted, so new JS never meets old wasm.
 *   - Everything else passes straight through to the browser, untouched: /api/**, /_next/data, /_next/image, sign-in,
 *     Stripe and checkout, the Firebase reserved /__/ paths, this file, the manifest, any request that is not a GET,
 *     any range request (audio and video seek), and every other origin. The 390 MB of models and audio are left to
 *     the HTTP cache (docs/PERF-CACHE-PROPOSAL.md), not stored twice.
 *
 * The routing rules are FEL_SW.strategyFor, a pure function at the top of this file, so the test runs the real file.
 */
'use strict';

var FEL_SW = (function () {
  /** Bump when the caching rules change shape; every fel-* cache not named below is deleted on activate. */
  var VERSION = 'v1';
  /** = lib/pose/assets.ts VISION_VERSION (the test fails if they drift). */
  var POSE_VERSION = '0.10.35';
  var CACHES = {
    // NOT bumped per deploy: the names inside are content hashes, so an old tab still finds its old chunks here.
    static: 'fel-static-' + VERSION,
    pose: 'fel-pose-' + POSE_VERSION + '-' + VERSION,
    offline: 'fel-offline-' + VERSION,
  };
  var OFFLINE_URL = '/offline.html';
  /** The static cache is trimmed to this many entries, oldest first: a few deploys' worth of chunks. */
  var STATIC_MAX_ENTRIES = 400;

  /** Never touched, even on a navigation: the network answers exactly as it would with no worker. */
  var NEVER = [
    /^\/api(\/|$)/,
    /^\/_next\/data\//,
    /^\/_next\/image/,
    /^\/__\//,
    /^\/(login|signup|logout|auth)(\/|$)/,
    /stripe/i,
    /checkout/i,
    /^\/sw\.js$/,
    /^\/app\.webmanifest$/,
    /^\/offline\.html$/,
  ];
  var POSE = /^\/pose\/(models\/[^/]+\.task|wasm\/[^/]+\.(wasm|js))$/;

  /**
   * How one request is answered.
   *   req: { url: string, origin: string (the worker's own origin), method?: string, mode?: string, range?: boolean }
   *   ->   { strategy: 'bypass' | 'network-fallback' | 'cache-first' | 'stale-while-revalidate', cache?: string }
   */
  function strategyFor(req) {
    var u;
    try { u = new URL(req.url, req.origin); } catch (e) { return { strategy: 'bypass' }; }
    if (u.origin !== req.origin) return { strategy: 'bypass' };
    if ((req.method || 'GET').toUpperCase() !== 'GET') return { strategy: 'bypass' };
    if (req.range) return { strategy: 'bypass' };
    var p = u.pathname;
    for (var i = 0; i < NEVER.length; i++) if (NEVER[i].test(p)) return { strategy: 'bypass' };
    if (req.mode === 'navigate') return { strategy: 'network-fallback', cache: CACHES.offline };
    if (p.indexOf('/_next/static/') === 0 && p.indexOf('/_next/static/development/') !== 0) {
      return { strategy: 'cache-first', cache: CACHES.static };
    }
    if (POSE.test(p)) return { strategy: 'stale-while-revalidate', cache: CACHES.pose };
    return { strategy: 'bypass' };
  }

  function isCurrentCache(name) {
    return name === CACHES.static || name === CACHES.pose || name === CACHES.offline;
  }

  return {
    VERSION: VERSION, POSE_VERSION: POSE_VERSION, CACHES: CACHES, OFFLINE_URL: OFFLINE_URL,
    STATIC_MAX_ENTRIES: STATIC_MAX_ENTRIES, strategyFor: strategyFor, isCurrentCache: isCurrentCache,
  };
})();

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && typeof caches !== 'undefined') {
  /** A response worth keeping: a whole, same-origin 200. Never a redirect, an error, an opaque or a partial body. */
  var keepable = function (res) {
    return !!res && res.status === 200 && res.type === 'basic' && !res.redirected;
  };

  var trim = function (cacheName, max) {
    return caches.open(cacheName).then(function (c) {
      return c.keys().then(function (keys) {
        var extra = keys.length - max;
        var drops = [];
        for (var i = 0; i < extra; i++) drops.push(c.delete(keys[i]));
        return Promise.all(drops);
      });
    });
  };

  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches.open(FEL_SW.CACHES.offline)
        .then(function (c) { return c.add(new Request(FEL_SW.OFFLINE_URL, { cache: 'reload' })); })
        // Safe to take over at once: no page is ever cached, so the next page load is the new deploy's either way,
        // and the hashed chunks an open tab still needs stay in fel-static (it is not renamed per deploy).
        .then(function () { return self.skipWaiting(); })
    );
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches.keys()
        .then(function (names) {
          return Promise.all(names.filter(function (n) { return n.indexOf('fel-') === 0 && !FEL_SW.isCurrentCache(n); })
            .map(function (n) { return caches.delete(n); }));
        })
        .then(function () {
          // Navigation preload: the page request starts while the worker boots, so a worker costs a page load nothing.
          if (self.registration.navigationPreload) return self.registration.navigationPreload.enable().catch(function () {});
        })
        .then(function () { return self.clients.claim(); })
    );
  });

  self.addEventListener('fetch', function (event) {
    var request = event.request;
    var route = FEL_SW.strategyFor({
      url: request.url,
      origin: self.location.origin,
      method: request.method,
      mode: request.mode,
      range: request.headers.has('range'),
    });
    if (route.strategy === 'bypass') return;

    if (route.strategy === 'network-fallback') {
      event.respondWith((function () {
        var preload = event.preloadResponse || Promise.resolve(undefined);
        return Promise.resolve(preload)
          .then(function (pre) { return pre || fetch(request); })
          .catch(function () {
            return caches.open(route.cache)
              .then(function (c) { return c.match(FEL_SW.OFFLINE_URL); })
              .then(function (page) { return page || Response.error(); });
          });
      })());
      return;
    }

    if (route.strategy === 'cache-first') {
      event.respondWith(caches.open(route.cache).then(function (c) {
        return c.match(request).then(function (hit) {
          if (hit) return hit;
          return fetch(request).then(function (res) {
            if (keepable(res)) {
              var copy = res.clone();
              event.waitUntil(c.put(request, copy).then(function () { return trim(route.cache, FEL_SW.STATIC_MAX_ENTRIES); }));
            }
            return res;
          });
        });
      }));
      return;
    }

    // stale-while-revalidate
    event.respondWith(caches.open(route.cache).then(function (c) {
      return c.match(request).then(function (hit) {
        // The page gets the body as it streams; the cache write finishes on its own time.
        var refresh = fetch(request).then(function (res) {
          if (keepable(res)) event.waitUntil(c.put(request, res.clone()).catch(function () {}));
          return res;
        });
        if (hit) {
          event.waitUntil(refresh.catch(function () {}));
          return hit;
        }
        return refresh;
      });
    }));
  });
}
