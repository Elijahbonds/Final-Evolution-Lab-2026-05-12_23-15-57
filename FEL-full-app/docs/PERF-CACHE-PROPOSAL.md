# Repeat-visit speed: cache headers and server rendering (proposal for the owner)

app-feel lane, round 7, 2026-10-25. **Nothing in this file has been applied.** Cache headers live in `next.config.js`
or `firebase.json`, which are deploy config (`/CLAUDE.md`: stop and ask). The root layout's `force-dynamic` was left
alone because the change could not be proved safe without a `next build` (section 2).

What did ship on `lane/app-feel`: the installable app (manifest, icons, iPhone tags, "Install FEL") and a service
worker that is **off** until `NEXT_PUBLIC_SW_ENABLED` is turned on (section 3).

---

## 1. Cache headers

### What happens today

- Every file in `public/` is served `Cache-Control: public, max-age=0` (measured on the prod build in FDB-2,
  2026-10-17; that is Next's own default for `public/`). `max-age=0` means "check again every time", so every visit
  sends one conditional request per asset and waits for each `304`.
- Those files are about 390 MB: `public/models` 263 MB, audio 88 MB, `public/pose` 36 MB (the camera's model and
  runtime, about 16 MB on first camera use), plus `venues`, `backdrops`, `mocap`, `loaders` and `vendor/havok`.
- `/_next/static/**` is named by content hash (`next.config.js` sets `[contenthash]` on every client chunk; Next
  hashes CSS and fonts itself). `next start` already serves it `public, max-age=31536000, immutable`. Whether
  Firebase Hosting keeps that header is **unverified**: check it first (step 1 below).

### Which files are safe to cache for how long

| Files | Named by content? | Proposed `Cache-Control` | Why it is safe |
|---|---|---|---|
| `/_next/static/**` | yes (hash) | `public, max-age=31536000, immutable` (Next's own; only confirm it survives Firebase) | a new build asks for new names, so an old copy is never wrong |
| `/models/**`, `/audio/**`, `/venues/**`, `/backdrops/**`, `/mocap/**`, `/loaders/**`, `/vendor/**` | **no** | `public, max-age=3600, stale-while-revalidate=86400` | the same name can get new contents in a deploy. One hour means a replaced model is seen at most about an hour late, plus one stale load while it refreshes. A whole play session makes no repeat checks. |
| `/pose/**` | **no** (the version is in `lib/pose/assets.ts`, not the URL) | `public, max-age=3600, stale-while-revalidate=86400` | as above. **Not longer than this**: the wasm must match the JS bundle it was built with (`lib/pose/assets.test.ts`), so a day-old wasm next to new JS would break the camera. The service worker's pose cache is named for the version, so it is safe with the worker on. |
| `/sw.js`, `/offline.html`, `/app.webmanifest` | no | `no-cache` | the worker and the manifest must update on the next visit. The registrar also sets `updateViaCache: 'none'`, so the browser re-checks `/sw.js` even if a CDN caches it. |
| `/favicon.svg`, `/icons/**`, `/og-image.png`, `/brand/**` | no | `public, max-age=86400` | small, and rarely changed. A new logo can take a day to appear. |
| Pages (HTML), `/api/**` | n/a | **unchanged** | dynamic and per user. Never cache them. |

**Why not a year for everything:** `immutable` is only correct when the URL changes with the contents. That holds for
`/_next/static` and nothing in `public/`. Phase 2 below makes it true for the big files.

### The change, if you approve it (pick ONE place)

**Option A: `next.config.js` (recommended).** One place that works in `next start` and in every lane's rig.
`firebase-tools` carries `headers()` into Hosting for a Next app. **assumption:** it does that for these simple
`:path*` sources too; step 3 checks it.

```diff
   async headers() {
-    return [{
+    // PERF-CACHE (owner-approved <date>): docs/PERF-CACHE-PROPOSAL.md. Unhashed public/ files: one hour, then served
+    // stale while they refresh. Never `immutable` here: these names do not change when their contents do.
+    const assets = 'public, max-age=3600, stale-while-revalidate=86400';
+    const cache = (source, value) => ({ source, headers: [{ key: 'Cache-Control', value }] });
+    return [{
       source: '/(.*)',
       headers: [
         { key: 'X-Content-Type-Options', value: 'nosniff' },
         ...
       ],
-    }];
+    },
+      ...['/models/:path*', '/audio/:path*', '/venues/:path*', '/backdrops/:path*', '/mocap/:path*', '/loaders/:path*',
+        '/vendor/:path*', '/pose/:path*'].map((s) => cache(s, assets)),
+      ...['/icons/:path*', '/brand/:path*', '/favicon.svg', '/og-image.png'].map((s) => cache(s, 'public, max-age=86400')),
+      ...['/sw.js', '/offline.html', '/app.webmanifest'].map((s) => cache(s, 'no-cache')),
+    ];
   },
```

`lib/build-config.test.ts` reads the FIRST rule as the security header block (`const [rule] = await
nextConfig.headers()`), so the cache rules go after it, and the block is not changed. Re-run that test with the change.
The diff was checked on a scratch copy of `next.config.js` (2026-10-25). It loads. Its first rule is still the
security block. Next's own matcher (`path-to-regexp`) gives each sample path exactly one `Cache-Control` from the
table.

**Option B: `firebase.json`.** Same values as Hosting `headers` with glob sources (`"source": "/models/**"`, ...).
Hosting-only, so `next start` and the rigs would not see them.

### How to verify (you, or the ops session; it needs the live site)

1. **Before:** `curl -sI https://<prod>/pose/models/pose_landmarker_lite.task | grep -i cache-control` and the same
   for one `/_next/static/chunks/*.js` and one `/models/*.glb`. Record the values.
2. Deploy with the change.
3. **After:** run the same three `curl`s. You should see the values in the table. If `/_next/static` does not say
   `immutable` on Firebase, add `cache('/_next/static/:path*', 'public, max-age=31536000, immutable')` to Option A.
4. On a phone: load `/play`, then load it again. DevTools (or `chrome://inspect`) should show the models and audio
   as `(disk cache)` with no `304` round trips.

### Phase 2 (a later lane): make the big files content-addressed

Add a build-time asset manifest (name → content hash) and load `/models`, `/audio` and `/venues` through it as
`/models/hero.<hash>.glb`. Put the tasks-vision version in the pose path (`/pose/0.10.35/wasm/...`). This needs a
change in `lib/pose/assets.ts`, which movement-play holds. Every one of those files can then be
`public, max-age=31536000, immutable`, so a repeat visit makes no request at all. That is the native-app feel.

---

## 2. Server rendering: the root layout's `force-dynamic`

**Where it came from.** `export const dynamic = 'force-dynamic'` in `app/layout.tsx` arrived with the first import of
the app (`20967dea`, 2026-08-28, "Track FEL-full-app ..."). No comment or later commit says why
(`git log -S"force-dynamic" -- app/layout.tsx`).

**What it does today: very little on its own.** Of 188 pages, **180 declare `force-dynamic` themselves**, including
`/`, `/try`, `/privacy` and `/terms`, and `/program/unlock` gets it from its own segment layout. Removing the root
flag changes only the 7 pages that rely on it (counted 2026-10-25 on `42f7add7`):

| Page | Reads at render | Would become |
|---|---|---|
| `/learn` | nothing request-specific | static |
| `/links` | nothing | static |
| `/modes` | nothing (registry and menu data) | static |
| `/settings` | nothing (`redirect()` to the account page) | static redirect |
| `/screen/privacy` | nothing | static |
| `/play/mirror/assess` | `searchParams` | still dynamic (Next sees `searchParams`) |
| `/play/mirror/assess/results` | `isCoachStoreEnabled()`, a **server env flag** | static, with the flag **frozen at build time** |

**Why it was not changed.** It is probably safe:
- no root component (`StatusRail`, `TabBar`, `Providers`, `SoundtrackDock`, `PartyDock`, `ChunkLoadErrorHandler`)
  calls `useSearchParams`, which would fail a static prerender;
- the session is read on the client (next-auth's `SessionProvider`), not passed down from the layout.

But "probably" is the kind of guess this repo has paid for before:
- it can only be proved by a `next build` route table (the `○` / `λ` markers), which this session could not run
  (disk);
- the results page would bake `COACH_STORE_ENABLED` in at build time.

And the gain is 5 small pages.

**The plan that gets the real gain** (a later lane, with `next build` in its budget):
1. Add `export const dynamic = 'force-dynamic'` to `app/play/mirror/assess/results/page.tsx`, the one page whose
   render reads a server flag. Then remove the root flag. Run `next build` and confirm in the route table that only
   those five pages turn `○`.
2. Add a test that lists the pages meant to be static (legal, `/links`, `/learn`, `/modes`, docs-style pages) and
   fails if one of them imports `getServerSession`, `cookies`, `headers` or `prisma`, or reads a non-`NEXT_PUBLIC_`
   flag.
3. Page by page, remove the per-page `force-dynamic` where the page reads nothing per-request. The legal pages
   (`/privacy`, `/terms`, `/store-terms`) are the first candidates. Each one is one line plus a `next build` check.
   `/` and `/try` read the session (`getServerSession`) and stay dynamic.
4. Measure first contentful paint before and after on the menu rig (perf-lag msite).

---

## 3. What the service worker does (shipped OFF)

`public/sw.js`, registered by `components/pwa/sw-register.tsx` only in a production build with
`NEXT_PUBLIC_SW_ENABLED` set to `1` or `true`. Its rules are `FEL_SW.strategyFor`, tested from the real file
(`tests/pwa/sw-routes.test.ts`).

- **Pages: network every time.** The worker never caches a page. Only when the network fails does it show
  `/offline.html`, which says what still works and what needs a connection. So a deploy can never be pinned behind an
  old one.
- **Never touched:** `/api/**`, `/_next/data`, `/_next/image`, sign-in (`/login`, `/signup`, `/api/auth`), anything
  with `stripe` or `checkout` in the path, Firebase's `/__/`, the worker itself, the manifest, any request that is not
  a GET, range requests (audio and video seeking), and other origins.
- **`/_next/static/**`: cache first.** The names are hashes. The cache keeps its name across deploys, so an old open
  tab still finds its chunks. It is trimmed to 400 entries.
- **`/pose` model and wasm: stale-while-revalidate.** The camera starts from the phone's copy, and the copy refreshes
  in the background. The cache name carries `VISION_VERSION`, so an upgrade starts a fresh cache and the activate
  step deletes the old one. A test fails if the two versions drift.
- **The big models and audio are not stored by the worker.** They would double the phone's storage. The headers in
  section 1 are their fix.
- **Updates:** `skipWaiting` + `clients.claim`, with navigation preload. This is safe because no page is cached and
  the chunk cache is not renamed per deploy.
- **Kill switch:** with the flag off (the default), every page load unregisters FEL's worker and deletes its `fel-*`
  caches. The flag is build-time (`NEXT_PUBLIC_`), so turning it on or off is a rebuild and deploy.

**Measured on the rig** (`scripts/probes/_app-feel-pwa.mts`, headless Chromium, 390 px). The manifest has no parse
errors and no installability errors (DevTools `Page.getInstallabilityErrors`, the check Lighthouse uses). Before the
change: `no-manifest`. Every icon decodes at its declared size. With the flag on, the worker activates and controls
the page. With the server stopped, a page load shows the offline page, the 5.8 MB pose model and a chunk still load,
and `/api` fails as it should. Rebuilt with the flag off, the next load leaves 0 registrations and 0 caches.

**Not yet offline: the approved "single-player and downloaded lessons offline, sync later".** The worker gives the
offline page and the camera files. Opening a game with no signal needs that game's page to load offline. The rule
"never cache HTML" forbids that today. The next step is a static, cache-safe shell for single-player games,
precached on purpose and versioned with the deploy. Then results need to be queued: `lib/offline-cache.ts` is that
queue, but nothing imports it (it is on `lib/nav/modules.test.ts`'s not-imported list), and
`components/games/game-shell.tsx`, a caution file, is where it would be wired in.

---

## 4. Routed: `docs/LAUNCH-CHECKLIST.md` section F (held by launch-docs)

Not edited here, because launch-docs holds the file. Proposed status changes, for that lane or the coordinator:

| # | New status | Evidence |
|---|---|---|
| F2 | **done (lane/app-feel)** | `/app.webmanifest` (`lib/pwa/manifest.ts`, served by `app/app.webmanifest/route.ts`); the link is in the root `<head>`. Not `app/manifest.ts`: FDB-2's reason, see `lib/pwa/manifest.ts` |
| F3 | **done, placeholder art** | `public/icons/` 192, 512, maskable 512 (`scripts/brand/make-app-icons.ts`, from `favicon.svg`). Re-run the script on the owner's logo art |
| F4 | **done** | `apple-touch-icon` 180 in the root `<head>`; `appleWebApp` (capable, title FEL, status bar `black`) in the metadata |
| F5 | **half** | `theme-color` #050505 via `viewport`. `viewport-fit=cover` was left out until the F7 device check |
| F6 | **built, OFF** | `public/sw.js` plus `/offline.html`; `NEXT_PUBLIC_SW_ENABLED` turns it on after a device check |
