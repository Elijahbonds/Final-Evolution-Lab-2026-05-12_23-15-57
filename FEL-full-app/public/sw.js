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
 *
 * OFFLINE PLAY (offline-push, round 8, 2026-10-26; owner QUALITY 2026-10-20 "graceful offline"). Only when the worker is
 * registered as /sw.js?offline=1 (NEXT_PUBLIC_OFFLINE_PLAY_ENABLED, off by default; lib/pwa/offlinePlay.ts):
 *   - The single-player mode pages, the lessons, the Mirror's screen and the combine (OFFLINE_PAGES) are NETWORK FIRST.
 *     Online, the page still comes from the network every time, so a deploy is never pinned behind an old copy; the copy
 *     is kept (fel-pages) and answers ONLY when the network fails. A page opened with a ranked, staked or Arena
 *     parameter (REFUSED_PARAMS) never gets a copy: those plays need the server, and they get the offline page.
 *     Every other page is exactly as above: network, then /offline.html.
 *   - The models, audio and venue files a game loaded (ASSET) are network first too (fel-assets), written only when
 *     their validators changed, so a game opened once still has its 3D files with no signal.
 *   - A page asks the worker to keep what it already loaded before the worker took control ('fel-warm' message), so the
 *     first game opened is ready offline, not the second.
 *   - Sign-in, sign-up and sign-out page loads drop every page copy (they are the signed-in player's own pages).
 * Without ?offline=1 none of that runs, and the activate step deletes fel-pages and fel-assets: the flag is its own kill
 * switch, and NEXT_PUBLIC_SW_ENABLED off still removes everything (lib/pwa/sw.ts).
 *
 * WEB PUSH (offline-push, OFF-03). 'push' shows the notification the server sent (lib/push/copy.ts writes every one from
 * fixed text; FEL_SW.notificationFor bounds it again here and only ever opens a same-origin path), and a tap opens it.
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
    // offline play only (see the header): the page copies, and the game files those pages loaded
    pages: 'fel-pages-' + VERSION,
    assets: 'fel-assets-' + VERSION,
  };
  var OFFLINE_URL = '/offline.html';
  /** The static cache is trimmed to this many entries, oldest first: a few deploys' worth of chunks. */
  var STATIC_MAX_ENTRIES = 400;
  /** (new) Page copies kept for offline play, oldest first out: every listed mode and lesson a player could open. */
  var PAGES_MAX_ENTRIES = 80;
  /** (new) Game files kept for offline play, oldest first out. */
  var ASSETS_MAX_ENTRIES = 600;

  /** = lib/pwa/offlinePlay.ts offlinePagePaths() (tests/pwa/sw-offline.test.ts fails if they drift). */
  var OFFLINE_PAGES = [
    '/', '/coach/combine', '/education/playbook', '/learn', '/play', '/play/acting', '/play/aero-aces', '/play/baseball',
    '/play/big-air', '/play/brain-brawl', '/play/carnival', '/play/dance', '/play/derby', '/play/drills', '/play/duel',
    '/play/dunk', '/play/dunkduel', '/play/football', '/play/freerun', '/play/golf', '/play/irl', '/play/karate',
    '/play/karate-vs', '/play/mirror', '/play/mirror/assess', '/play/mixedcombat', '/play/music', '/play/onevone',
    '/play/showdown', '/play/skateboard', '/play/snowboard', '/play/soccer', '/play/sprint', '/play/surf', '/play/tennis',
    '/play/threepoint', '/play/threevthree', '/play/tiebreak', '/play/velocity-kart', '/play/volleyball',
    '/play/who-scene-it', '/train', '/train/today-drill',
  ];
  /** = lib/pwa/offlinePlay.ts OFFLINE_LESSON_PATTERN: a Playbook chapter. */
  var OFFLINE_LESSON = /^\/education\/playbook\/\d{1,3}$/;
  /** = lib/pwa/offlinePlay.ts OFFLINE_REFUSED_PARAMS: ranked, staked and Arena plays are never served from a copy. */
  var REFUSED_PARAMS = ['arena', 'mp', 'c', 'tier', 'stake', 'ranked'];
  /** The big game files (models, audio, venues): kept for offline play only, never by default. */
  var ASSET = /^\/(models|audio|venues|backdrops|mocap|loaders|vendor)\//;
  /** Sign-in, sign-up, sign-out: a page load here drops every page copy (they belong to whoever was signed in). */
  var SIGN_IN = /^\/(login|signup|logout|auth)(\/|$)/;

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

  function isOfflinePage(p) {
    return OFFLINE_PAGES.indexOf(p) !== -1 || OFFLINE_LESSON.test(p);
  }

  function needsServer(u) {
    for (var i = 0; i < REFUSED_PARAMS.length; i++) if (u.searchParams.has(REFUSED_PARAMS[i])) return true;
    return false;
  }

  /**
   * How one request is answered.
   *   req: { url: string, origin: string (the worker's own origin), method?: string, mode?: string, range?: boolean,
   *          offline?: boolean (offline play is on: the worker was registered with ?offline=1) }
   *   ->   { strategy: 'bypass' | 'network-fallback' | 'cache-first' | 'stale-while-revalidate' | 'network-first',
   *          cache?: string, key?: string (the cache key, when it is not the request: a page copy is kept by path),
   *          clear?: string (a cache to drop on the way past) }
   */
  function strategyFor(req) {
    var u;
    try { u = new URL(req.url, req.origin); } catch (e) { return { strategy: 'bypass' }; }
    if (u.origin !== req.origin) return { strategy: 'bypass' };
    if ((req.method || 'GET').toUpperCase() !== 'GET') return { strategy: 'bypass' };
    if (req.range) return { strategy: 'bypass' };
    var p = u.pathname;
    if (req.mode === 'navigate' && SIGN_IN.test(p)) return { strategy: 'bypass', clear: CACHES.pages };
    for (var i = 0; i < NEVER.length; i++) if (NEVER[i].test(p)) return { strategy: 'bypass' };
    if (req.mode === 'navigate') {
      if (req.offline && isOfflinePage(p) && !needsServer(u)) return { strategy: 'network-first', cache: CACHES.pages, key: u.origin + p };
      return { strategy: 'network-fallback', cache: CACHES.offline };
    }
    if (p.indexOf('/_next/static/') === 0 && p.indexOf('/_next/static/development/') !== 0) {
      return { strategy: 'cache-first', cache: CACHES.static };
    }
    if (POSE.test(p)) return { strategy: 'stale-while-revalidate', cache: CACHES.pose };
    if (req.offline && ASSET.test(p)) return { strategy: 'network-first', cache: CACHES.assets };
    return { strategy: 'bypass' };
  }

  /** The caches this worker keeps; the page and game-file copies only while offline play is on. */
  function isCurrentCache(name, offline) {
    if (name === CACHES.static || name === CACHES.pose || name === CACHES.offline) return true;
    return !!offline && (name === CACHES.pages || name === CACHES.assets);
  }

  /** Is offline play on for a worker loaded from this URL search (its own registration URL)? */
  function offlineFrom(search) {
    return /(^\?|&)offline=1(&|$)/.test(search || '');
  }

  /** Same validators = the same file: an ETag, or a Last-Modified with the same length. Nothing to compare = changed. */
  function sameFile(a, b) {
    var ea = a.headers.get('etag'), eb = b.headers.get('etag');
    if (ea || eb) return !!ea && ea === eb;
    var la = a.headers.get('last-modified'), lb = b.headers.get('last-modified');
    return !!la && la === lb && a.headers.get('content-length') === b.headers.get('content-length');
  }

  function clip(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

  /** A same-origin path to open, or '/'. Never another origin, a protocol-relative URL or a script URL. */
  function safePath(v) {
    return typeof v === 'string' && v.charAt(0) === '/' && v.charAt(1) !== '/' && v.charAt(1) !== '\\' && v.length <= 300 ? v : '/';
  }

  /** The notification a push message becomes (lib/push/copy.ts writes the message; this bounds it again). */
  function notificationFor(d) {
    d = d && typeof d === 'object' ? d : {};
    return {
      title: clip(d.title, 80) || 'Final Evolution Lab',
      options: {
        body: clip(d.body, 200),
        tag: clip(d.tag, 64) || undefined,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: safePath(d.url) },
      },
    };
  }

  return {
    VERSION: VERSION, POSE_VERSION: POSE_VERSION, CACHES: CACHES, OFFLINE_URL: OFFLINE_URL,
    STATIC_MAX_ENTRIES: STATIC_MAX_ENTRIES, PAGES_MAX_ENTRIES: PAGES_MAX_ENTRIES, ASSETS_MAX_ENTRIES: ASSETS_MAX_ENTRIES,
    OFFLINE_PAGES: OFFLINE_PAGES, OFFLINE_LESSON: OFFLINE_LESSON, REFUSED_PARAMS: REFUSED_PARAMS,
    strategyFor: strategyFor, isCurrentCache: isCurrentCache, offlineFrom: offlineFrom, sameFile: sameFile,
    safePath: safePath, notificationFor: notificationFor,
  };
})();

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && typeof caches !== 'undefined') {
  /** Offline play: read once from this worker's own URL (/sw.js?offline=1). */
  var OFFLINE_ON = FEL_SW.offlineFrom(self.location && self.location.search);

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
          return Promise.all(names.filter(function (n) { return n.indexOf('fel-') === 0 && !FEL_SW.isCurrentCache(n, OFFLINE_ON); })
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
      offline: OFFLINE_ON,
    });
    if (route.clear) event.waitUntil(caches.delete(route.clear));
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

    if (route.strategy === 'network-first') {
      // Offline play: the network answers whenever it can, and the copy is refreshed from it; the copy answers only when
      // the network fails. A page with no copy gets the offline page, a game file with none fails as it would have.
      var key = route.key || request;
      var isPage = route.cache === FEL_SW.CACHES.pages;
      event.respondWith((function () {
        var preload = isPage && event.preloadResponse ? event.preloadResponse : Promise.resolve(undefined);
        return Promise.resolve(preload)
          .then(function (pre) { return pre || fetch(request); })
          .then(function (res) {
            if (keepable(res)) event.waitUntil(keep(route.cache, key, res.clone(), isPage).catch(function () {}));
            return res;
          })
          .catch(function () {
            return caches.open(route.cache)
              .then(function (c) { return c.match(key); })
              .then(function (hit) {
                if (hit) return hit;
                if (!isPage) return Response.error();
                return caches.open(FEL_SW.CACHES.offline)
                  .then(function (c) { return c.match(FEL_SW.OFFLINE_URL); })
                  .then(function (page) { return page || Response.error(); });
              });
          });
      })());
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

  /** Write one offline-play copy: a page every time (they are small, and the newest is the one to keep), a game file
   *  only when it is new or changed. Then trim the cache to its size. */
  var keep = function (cacheName, key, res, isPage) {
    return caches.open(cacheName).then(function (c) {
      return (isPage ? Promise.resolve(undefined) : c.match(key)).then(function (old) {
        if (old && FEL_SW.sameFile(old, res)) return undefined;
        return c.put(key, res).then(function () {
          return trim(cacheName, isPage ? FEL_SW.PAGES_MAX_ENTRIES : FEL_SW.ASSETS_MAX_ENTRIES);
        });
      });
    });
  };

  /** Keep what a page loaded before this worker controlled it: the page itself and its chunks, models and audio. Only
   *  what strategyFor would have kept anyway, only what is not kept yet, one at a time. */
  var warm = function (msg) {
    var origin = self.location.origin;
    var jobs = [];
    if (typeof msg.page === 'string') jobs.push({ url: msg.page, mode: 'navigate' });
    var assets = Array.isArray(msg.assets) ? msg.assets.slice(0, 400) : [];
    for (var i = 0; i < assets.length; i++) if (typeof assets[i] === 'string') jobs.push({ url: assets[i], mode: 'no-cors' });
    return jobs.reduce(function (chain, job) {
      return chain.then(function () {
        var route = FEL_SW.strategyFor({ url: job.url, origin: origin, mode: job.mode, offline: OFFLINE_ON });
        if (route.strategy === 'bypass' || route.strategy === 'network-fallback') return undefined;
        var key = route.key || new URL(job.url, origin).href;
        return caches.open(route.cache).then(function (c) {
          return c.match(key).then(function (hit) {
            if (hit) return undefined;
            return fetch(key, { credentials: 'same-origin' }).then(function (res) {
              if (!keepable(res)) return undefined;
              return c.put(key, res).then(function () {
                var max = route.cache === FEL_SW.CACHES.pages ? FEL_SW.PAGES_MAX_ENTRIES
                  : route.cache === FEL_SW.CACHES.assets ? FEL_SW.ASSETS_MAX_ENTRIES
                  : route.cache === FEL_SW.CACHES.static ? FEL_SW.STATIC_MAX_ENTRIES : 0;
                return max ? trim(route.cache, max) : undefined;
              });
            });
          });
        }).catch(function () {});
      });
    }, Promise.resolve());
  };

  self.addEventListener('message', function (event) {
    var msg = event.data && typeof event.data === 'object' ? event.data : {};
    if (msg.type === 'fel-clear-pages') event.waitUntil(caches.delete(FEL_SW.CACHES.pages));
    else if (msg.type === 'fel-warm' && OFFLINE_ON) event.waitUntil(warm(msg));
  });

  self.addEventListener('push', function (event) {
    var data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
    var n = FEL_SW.notificationFor(data);
    // userVisibleOnly: every push shows a notification, even one whose body could not be read
    event.waitUntil(self.registration.showNotification(n.title, n.options));
  });

  self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var path = FEL_SW.safePath(event.notification.data && event.notification.data.url);
    var target = new URL(path, self.location.origin).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === target && typeof list[i].focus === 'function') return list[i].focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }));
  });
}
