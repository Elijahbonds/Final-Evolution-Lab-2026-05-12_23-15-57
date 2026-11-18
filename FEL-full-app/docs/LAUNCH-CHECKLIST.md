# Launch checklist: what "green" means for the public web launch

**Owner, 2026-10-20:** "Finished" means a public web launch plus a written launch checklist. When it is all green, the
owner announces.

- **Platforms:** installable phone web, TV and big screen, and desktop web. The app stores come after the web launch.
- **Real devices:** the owner runs `docs/DEVICE-TEST-CHECKLIST.md` on their own phone. Its diagnostics land in
  `game_diag`.
- **Ops:** one session, `docs/OWNER-RUNBOOK.md`.

Status as read from `origin/lane/finish-release` `fdd77784` on 2026-10-20 by `lane/launch-docs`. Nothing was run on a
device or against production for this file.

Refreshed on 2026-11-18 for in-tree evidence that landed after that read: installable PWA wiring, anonymous
`fps`/`ttfp` diagnostics, the owner-written load budget, and menu/TV remote focus. Device and production rows still
need the owner-run checks named below.

**What the statuses mean**

- **done**: the evidence is in the tree (a file, a test, or a measured report).
- **not done**: the evidence shows it is missing.
- **unknown**: nobody has measured it, or only a device or production can tell.

A row turns green only on evidence. Update the row and its evidence when it changes.

---

## Summary

| Area | Done | Not done | Unknown | Blocks launch? |
|---|---:|---:|---:|---|
| A. Every mode playable, no known crashers | 2 | 2 | 3 | **yes**: the device pass is the gate |
| B. Performance budgets | 6 | 2 | 1 | **yes**: missing budget rows, known over-budget modes, and real-device proof |
| C. Ops items | 0 | 8 | 0 | **yes**: all in one runbook session |
| D. Legal pages | 3 | 1 | 0 | the retention cron (C) is the open one |
| E. Accessibility basics | 6 | 0 | 0 | no checklist blocker; auth-label polish remains routed in E5 |
| F. Installable PWA | 4 | 3 | 0 | **yes**: standalone device test and the service-worker flip remain |
| G. TV and big screen | 5 | 0 | 2 | real TV proof remains open |
| H. Analytics and diagnostics | 8 | 0 | 2 | reading needs the `admin` role (C7) |

**The launch blockers, shortest path:**

1. **Run the ops session** (`docs/OWNER-RUNBOOK.md`). That covers all of section C.
2. **Run the device pass on your phone** (`docs/DEVICE-TEST-CHECKLIST.md`), then fix what it finds. That covers A2,
   the real-device side of A3/A5, B5/B9, F7 and G6.
3. **Close the phone-budget holes**: add rows for every enabled Babylon mode and fix or owner-accept the three
   `knownOver` rows (B1/B2).
4. **Finish the PWA field check**: verify standalone home-screen play, then turn on `NEXT_PUBLIC_SW_ENABLED` only after
   the device check says the conservative service worker is safe (F6/F7).

---

## A. Every mode playable on phone and desktop, with no known crashers

The live roster is the Play shelf: **33 modes in 7 families** (`lib/nav/families.ts` `FAMILIES`, the hrefs in
`lib/game-data.ts` `MODE_INFO`; `training` is parked by `lib/unlisted-modes.ts`). Off the shelf but live: `/try` (the
guest dunk), `/party`, `/play/party`, and the Mirror on the Train tab.

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | Every shelf mode has a live route and a registry entry | **done** | 29 shelf modes are Babylon registry modes, all in `ENABLED_BABYLON_MODES` (`lib/babylon/modes/registry.ts`; soccer = `penalty`, baseball = `derby`). The other 4 have their own pages: Hang Time (`/play/irl`), Groove Academy (`/play/music`), The Read (`/play/acting`) and Story (`/story`). `scripts/mode-list-check-tests.ts` and `lib/nav/reachability.test.ts` are in CI. `docs/SHIP-READINESS.md` §2: 167 link targets, 0 broken |
| A2 | A real-phone pass of every mode | **not done** | `docs/DEVICE-TEST-CHECKLIST.md` is the instrument. It has not been run |
| A3 | No page errors while loading and starting play, on a phone profile | **unknown** (9 of 33 measured) | `docs/SHIP-READINESS.md` §4: football, dunk, threepoint, karate, karate_vs, tiebreak, dance, velocitykart and skateboard: 47 loads, **0 page errors**, all reached play (static rig, SwiftShader). The other 24 shelf modes were not measured. `scripts/probes/_all-modes-errors.mts` boots every enabled mode (desktop viewport, dev harness), but no recorded run was found in `docs/` |
| A4 | Desktop pass of every mode | **unknown** | no recorded desktop sweep. The React pages (`/`, `/play`, `/train`, the menus) could not be loaded on the static rig (`docs/SHIP-READINESS.md` §4, "Limit") |
| A5 | No known crashers | **unknown** | **No open crasher is recorded.** Known issues that are not crashes: Tiebreak's portrait camera recentred in 4 of 5 phone loads (`docs/SHIP-READINESS.md` §4, owner call 4). Snowboard slalom "captures as a whiteout" (`docs/BACKLOG.md` B3, 2026-09-04, possibly stale). Production crash reports (`[FEL-CRASH]`, H4) have not been read |
| A6 | Production crash log read for the last 7 days | **not done** | the command is in `docs/OWNER-RUNBOOK.md` §11.3. Nobody has read it |
| A7 | Guest first-run (`/try` dunk) loads only what dunk 1 needs | **done** | commit `6abc52c2` (FIRST-DUNK-BUDGET): the static graph went from 1,026 to 505 files, about −0.76 MB gzip. The props, rival and onlookers come after dunk 1 |

---

## B. Performance budgets

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | Per-mode phone content budgets (draw calls, active meshes, skinned bodies, texture MB, particles) are enforced | **not done** (15 of 33 have a row) | `lib/babylon/config/mobileBudget.json` (measured 2026-10-14) + `scripts/mobile-budget-tests.ts` (CI). **Rows exist for:** dunk, karate, karate_vs, football, skateboard, surf, tennis, golf, onevone, threevthree, threepoint, carnival, mixedcombat, aeroaces, velocitykart. **No row:** dunkduel, duel, showdown, snowboard_slalom, bigair, freerun, sprint, penalty (soccer), derby (baseball), volleyball, tiebreak, dance, brainbrawl, who_scene_it, plus the non-Babylon music, acting, irl and story |
| B2 | No mode over the phone ceiling | **not done** | `knownOver` in `mobileBudget.json`: **football and karate `skinnedBodies`** (over 16) and **velocitykart `textureMb`** (over 256). Frozen, so they cannot grow, but they are over |
| B3 | Texture memory: no mobile mode above 2× the tier median | **done** | `scripts/perf-budget-tests.ts` (CI) on `lib/babylon/config/textureBudget.json` |
| B4 | A written load-time budget (time to first playable frame on a phone) | **done** | Owner decision 2026-10-20: playable in 8 s, full load in 20 s on a mid-range phone (`docs/OWNER-DECISIONS.md`, DOCS AUDIT). Rig TTFPF with the 8 s pre-warm was 26.7–59.0 s (`docs/SHIP-READINESS.md` §1), but that is SwiftShader on a loaded 4-core box and overstates phone time. The load watchdog is now "20 s with no progress", not 20 s total (`6abc52c2`, #316). The device pass must measure against the 8 s / 20 s budget |
| B5 | Real-phone frame-rate telemetry leaves the browser | **done** | `lib/babylon/core/perfStats.ts`, mounted by `ModeHarness.ts`, sends anonymous `game_diag` kind `fps` for the first 30 s of play and the 90-120 s warm window. `lib/analyticsAnon.ts` stores `fps` rows with no user, guest or page key. The **measurement result** is still a device-pass item |
| B6 | Shader pre-warm cap hits and load timeouts are reported from real phones | **done** | `capHit` and the watchdog's `load timed out` both send `game_diag` kind `load` (`docs/SHIP-READINESS.md` §5). The query is in `docs/DEVICE-TEST-CHECKLIST.md`. There is no success denominator yet (owner call 1b) |
| B7 | Per-frame garbage in the hot modes | **done** (dunk, the rig layers) | `lane/rig-perf` (#290: the rig layers write no garbage per frame), `lane/dunk-garbage`, `CharacterAnimator.clipNames` cached (#281) |
| B8 | Mid-play shader compiles cut on phones | **done** | the pre-warm moved mid-play compiles from a median of 14 to 1 per mode (`docs/SHIP-READINESS.md` §1) |
| B9 | Real-phone memory and heat (no tab reload, no thermal throttle over 10 minutes) | **unknown** | never measured on a device. Add it to the device pass ("play 10 minutes, does the phone get hot or the page reload?") |

---

## C. Ops items done

Every item is a step in `docs/OWNER-RUNBOOK.md`. As of 2026-10-20 none has been run.

| # | Item | Status | Runbook |
|---|---|---|---|
| C1 | Pending SQL applied to production in dependency order. The preview diff is empty | **not done** | §4, §5 |
| C2 | `ProgramMessage.readAt` present in production (or confirmed already there) | **not done** (unconfirmed) | §5.2 |
| C3 | Party-report and creator-inquiry tables exist | **not done** | §6 |
| C4 | Retention cron: secret, `firebase.json` line, Scheduler job, one good run | **not done** | §7 |
| C5 | netd redeployed with `party1`. The party works on two phones | **not done** | §8, §13 |
| C6 | Studio-save SQL applied and deployed; live reads verified with the switch off | **not done** | §9 (PR #373 not merged) |
| C7 | Feel panel on for the owner (`FEEL_PANEL_ENABLED` + `User.role = 'admin'`) | **not done** | §12 (`lane/feel-panel` not merged) |
| C8 | The 20 undocumented env vars at their safe defaults. `.env.example` lists them | **not done** | §10.3. The `.env.example` lines are lane work (`docs/SHIP-READINESS.md` §6 call 6) |

**Not a launch item:** the Studio-save switch (runbook §9.1). It waits for the policy text and for the Studio itself to
open.

---

## D. Legal pages final

The policy files are not edited here. They are only pointed to.

| # | Item | Status | Evidence |
|---|---|---|---|
| D1 | Terms, Privacy and Store Terms are final, with no draft banner | **done** | `lib/policies.ts` (header: "final per the owner's sign-off on 2026-10-07"; `CURRENT_POLICY_VERSION = '2026-10-16'`). Pages: `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/store-terms/page.tsx`. Tests: `lib/policies.test.ts`, `tests/legal/*.test.tsx` |
| D2 | Contact details: the legal name, contact email and mailing address print | **done** | `lib/legal/business.ts` (`REAL_MAILING_ADDRESS` set, pinned by `lib/legal/business.test.ts`), `app/support/page.tsx` |
| D3 | What the policy promises, the product does: the 12-month deletion of party reports and creator inquiries | **not done** | it needs the retention cron (C4). The write-time purge only runs when a new row is written |
| D4 | Legal links reachable from the app | **done** | `lib/nav/reachability.test.ts` (no orphan pages), `lib/seo/publicPages.ts` (in the sitemap) |
| — | Studio-save policy text (`docs/NEXUS-STUDIO-SAVE.md` §8) | not a launch item | needed only before the Studio-save switch |

---

## E. Accessibility basics

| # | Item | Status | Evidence |
|---|---|---|---|
| E1 | Reduced motion: the OS setting is honoured, with an in-app override | **done** | `lib/a11y/reducedMotion.ts` (+ `.test.ts`): no flashes, no camera shake, hit-stop and slow-mo cut to a cue, gameplay timing unchanged. The control is `components/settings/motion-setting.tsx`, on Profile and on every mode's boot splash. About 50 effect sites read it, among them `JuiceKit`, `LightRig`, `DunkReplayCam`, `koReplay`, the crowds and the TV HUD's `use-hud-motion.ts` |
| E2 | Controller in a game: start and play | **done** | `components/games/use-start-wake.ts` (any button starts), `lib/babylon/core/InputBus.ts`, `lib/gamepad-bridge.ts`, the controls screen `lib/ui/controlsScreen.ts` |
| E3 | Controller on the end screen (d-pad, A and B, focus moves to the nearest button) | **done** | `components/games/end-screen/nav.ts` (`spatialNext`) |
| E4 | **Controller and remote focus in the menus** (the Play shelf, tabs, Profile, sign-in) | **done** (lane/a11y-design, A11-02) | `lib/nav/focus.ts`, mounted once in `components/shell/status-rail.tsx`: d-pad, stick and a remote's arrows move focus with the end card's `spatialNext`, A activates, B goes back; it stands aside on a running mode, the learn feed, the end card and text fields. One cyan focus ring for every keyboard, pad and remote stop (`app/globals.css`). Rig: `scripts/a11y/pad-run.mts` reaches `/play/karate` from `/play` in 9 pad presses, no touch or click |
| E5 | Screen-reader labels and colour contrast on the menus | **done on the lane's pages; 3 criticals routed** (A11-01) | `scripts/a11y/audit.mts` (WCAG 2.2 AA on the 10 key pages, rules in `lib/a11y/wcag.ts`): 150 violations → 17 (42 critical → 3). Play, Train, Profile, Learn, Education and the Playbook at 0; the 3 criticals are the sign-in / sign-up fields' labels in `components/auth-form.tsx` and `components/age-step.tsx` (first-run's), routed |
| E6 | Captions for spoken lines | **done (audited)** (A11-04) | `docs/CAPTIONS-AUDIT.md`, `scripts/a11y/captions-audit.mts`: 37 speech sites, every spoken line a player acts on has an on-screen equivalent. Crowd chants (ambient) and live party voice are uncaptioned by design (owner calls in the doc); lesson films need a caption track before the first one ships |

---

## F. Installable PWA

Refreshed on 2026-11-18: the manifest, icons, iOS tags and conservative service worker are in the tree. The worker still
ships off by default until the device check says it is safe.

| # | Item | Status | Evidence / what is missing |
|---|---|---|---|
| F1 | Served over HTTPS | **done** | Firebase Hosting |
| F2 | Web app manifest (`app/manifest.ts` or `public/manifest.webmanifest`): `name`, `short_name`, `start_url`, `display` (`standalone` or `fullscreen`), `background_color`, `theme_color`, `icons` | **done** | `app/app.webmanifest/route.ts` serves `lib/pwa/manifest.ts`'s `FEL_MANIFEST` at `/app.webmanifest`; `app/layout.tsx` links it once from `<head>`. `lib/pwa/manifest.test.ts` checks the route, content type, install fields and the non-Next-metadata path |
| F3 | Install icons: 192×192 and 512×512 PNG, plus a maskable one | **done** | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`; `APP_ICONS` and `lib/pwa/manifest.test.ts` verify every named PNG exists and has the size it claims. assumption: the current icons are favicon-derived until the owner supplies final logo art |
| F4 | iOS: `apple-touch-icon` (180×180) and `apple-mobile-web-app-capable` / status-bar style | **done** | `public/icons/apple-touch-icon.png`; `app/layout.tsx` sets `metadata.appleWebApp` and links the apple touch icon from `<head>` |
| F5 | `theme-color` and an explicit `viewport` export (`viewport-fit=cover` for the notch) | **not done** | `app/layout.tsx` now exports `viewport` with `themeColor: THEME_COLOR`, width and initial scale. `viewport-fit=cover` remains deliberately deferred in the layout comment until the home-screen device check proves every page behaves under the notch |
| F6 | A service worker. At minimum an offline fallback page. Optionally, cache the shell and the big static assets | **not done** | `public/sw.js`, `public/offline.html`, `components/pwa/sw-register.tsx`, `lib/pwa/sw.ts`, and `tests/pwa/sw-routes.test.ts` are present. It ships **off** by default through `NEXT_PUBLIC_SW_ENABLED` in `.env.example`; the off path unregisters FEL's worker and deletes `fel-*` caches. Turning it on is a device-check / deploy-time switch, not a code gap |
| F7 | Tested from the home-screen icon (standalone): canvas size, orientation, audio unlock, the back gesture | **not done** | still needs a real standalone install/device pass. Standalone removes the browser bar, which changes the viewport the harness fits (`game-surface.css`, `consoleView`) |

The remaining PWA work is field verification and the service-worker switch. No deploy config changes are needed for the
current manifest/icon/iOS-tag code.

---

## G. TV and big screen

| # | Item | Status | Evidence |
|---|---|---|---|
| G1 | Landscape is "console view": a full-bleed stage, the HUD scaled by screen height, a 5% title-safe frame for overscan | **done** | `lib/ui/consoleView.ts` (+ tests), `app/game-surface.css` |
| G2 | Every Babylon game host uses the shared TV HUD (10-foot type, safe frame) | **done** | `HudFrame` in all 21 `components/games/*-babylon.tsx` hosts (`components/games/tv-hud/**`; the hoops hosts moved in #242) |
| G3 | A TV-browser host page and phone controllers | **done in code** | `/host?mode=<id>` (`app/host/page.tsx`, a thin host stage), phone pads at `/controller/[code]`, the couch room at `/play/party`. It needs `CONTROLLER_LINK_KV_*` in production (runbook §8.3) |
| G4 | Screen-mirroring lag compensation (AirPlay, Chromecast) | **done** | `lib/controller-link/tvMode.ts`: 1.35× timing windows when mirrored. Detection suggests it and the player chooses |
| G5 | Remote or pad navigation of the menus on a TV browser | **done** (A11-02) | same as E4: a remote's arrows and Back keys (LG 461, Tizen 10009) drive `lib/nav/focus.ts` |
| G6 | A real TV test: a TV browser on `/host`, and phone-to-TV mirroring of a mode | **unknown** | `docs/DEPLOY-CHECKLIST-PARTY.md` §4 has the five-minute test. It is not recorded as run against production |
| G7 | Text legible from a couch on the non-game pages (shelf, end screen) | **done for the menus; end screen routed** (A11-05) | `lib/design/couch.ts`: with a pad or remote on a big sideways screen (or Account → Big-screen menus: On) the page column zooms like the HUD, 2.25× at 1080p. Rig: every text run on `/play` ≥ 24.8 px at 1080p (was min 9 px, 62 runs under 24). The end screen (`components/games/end-screen/**`) is not this lane's and is not zoomed yet |

---

## H. Analytics and diagnostics in place

| # | Item | Status | Evidence |
|---|---|---|---|
| H1 | First-party analytics: batched, `sendBeacon` on unload, stored in `AnalyticsEvent`. No third-party trackers | **done** | `lib/analytics.ts`, `app/api/analytics/route.ts`, `lib/analytics-server.ts` |
| H2 | Game diagnostics leave the browser: `game_diag` kinds `frame`, `ident`, `clip`, `cam`, `context`, `load`, `fps`, `ttfp` | **done** | `lib/babylon/core/diag.ts` (rate limit: once per 10 s per kind). Senders: `ModeHarness.ts`, `FrameGuard.ts`, `CameraDirector.ts`, `playerIdentity.ts`, `clipRegistry.ts`, and `lib/babylon/core/perfStats.ts`. **Only modes run through the Babylon harness send it.** Music (Groove Academy), Acting, Hang Time and Story send none |
| H3 | `game_diag` can be read back | **done** (it needs `admin`) | `GET /api/admin/diag?hours=N` (`app/api/admin/diag/route.ts`): grouped by kind and mode, plus the last 50 lines. Admin only (runbook §12). The read-only SQL is in `docs/DEVICE-TEST-CHECKLIST.md` |
| H4 | Client crashes are reported | **done** (logs only) | `components/reliability/global-error-boundary.tsx` → `POST /api/telemetry/crash` → a `[FEL-CRASH]` server log line. These are **not** in the database, so `/api/admin/diag` does not show them. Read with `gcloud logging read` (runbook §11.3) |
| H5 | A real phone's frame rate is reported | **done** | `lib/babylon/core/perfStats.ts` sends anonymous `fps` rows for live play windows; `lib/babylon/core/perfStats.test.ts` covers the summary windows and page cap |
| H6 | A successful load's time is reported (a denominator for cap hits and timeouts) | **done** | `lib/babylon/core/perfStats.ts` sends anonymous `ttfp` rows at first playable frame, and on abandon before play with a `left=` duration. `lib/analyticsAnon.ts` keeps `fps`/`ttfp` rows free of user, guest and page ids |
| H7 | Admin dashboards: metrics and the funnel | **done** (they need `admin`) | `app/admin/metrics/page.tsx`, `app/admin/funnel/page.tsx`, `app/coach/admin/page.tsx` |
| H8 | Liveness endpoint | **done** | `/healthz` and `/api/health` (`app/api/health/route.ts`, no dependencies, reports the revision) |
| H9 | An uptime monitor watches `/healthz` and alerts you | **unknown** | none is recorded in the repo. The Cloud Monitoring uptime check is yours to set up |
| — | Owner account can read H3 and H7 | **unknown** | it needs `User.role = 'admin'` (runbook §12). `owner` does not pass `requireAdmin()` |

---

_How this was checked: the files and tests named in each row on `fdd77784`, then refreshed on 2026-11-18 from the current
tree for PWA/perf telemetry; `grep` for `manifest`, `serviceWorker`, `viewport`, `apple-touch-icon`, `getGamepads` and
`prefers-reduced-motion` across `app/`, `components/` and `lib/`; the `modes` and `knownOver` of `mobileBudget.json`;
`docs/SHIP-READINESS.md` (§1, §2, §4, §5, §6); `docs/VISUAL-PASS-PLAN.md` ("Phone perf pass" and owner-1016); `git log`
of `lane/finish-release` (#242, #281, #290, #293, #316). Nothing was run on a device, against production, or in a browser._
