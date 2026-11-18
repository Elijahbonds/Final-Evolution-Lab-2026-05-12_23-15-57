# Launch checklist: what "green" means for the public web launch

**Owner, 2026-10-20:** "Finished" means a public web launch plus a written launch checklist. When it is all green, the
owner announces.

- **Platforms:** installable phone web, TV and big screen, and desktop web. The app stores come after the web launch.
- **Real devices:** the owner runs `docs/DEVICE-TEST-CHECKLIST.md` on their own phone. Its diagnostics land in
  `game_diag`.
- **Ops:** one session, `docs/OWNER-RUNBOOK.md`.

Status as read from `origin/lane/finish-release` `fdd77784` on 2026-10-20 by `lane/launch-docs`. Nothing was run on a
device or against production for this file.

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
| B. Performance budgets | 5 | 3 | 1 | **yes**: no written load-time budget and no real-device pass |
| C. Ops items | 0 | 8 | 0 | **yes**: all in one runbook session |
| D. Legal pages | 3 | 1 | 0 | the retention cron (C) is the open one |
| E. Accessibility basics | 6 | 0 | 0 | green in code; lesson films need captions before content ships |
| F. Installable PWA | 6 | 0 | 1 | **yes**: home-screen device test and service-worker enablement remain |
| G. TV and big screen | 5 | 0 | 2 | real-TV test is not recorded |
| H. Analytics and diagnostics | 8 | 0 | 2 | reading needs the `admin` role (C7) |

**The launch blockers, shortest path:**

1. **Run the ops session** (`docs/OWNER-RUNBOOK.md`). That covers all of section C.
2. **Run the standalone/PWA device pass and enable the service worker when it passes** (section F). The manifest,
   icons, theme/viewport tags and conservative worker are in the tree; the production flag still ships off.
3. **Run the device pass on your phone** (`docs/DEVICE-TEST-CHECKLIST.md`), then fix what it finds. That covers A2 and
   the remaining A/B/F unknowns.
4. **Decide a load-time budget** (B4). There is no written number today, so "green" cannot be judged.
5. **Run the real-TV smoke** (`docs/DEPLOY-CHECKLIST-PARTY.md` §4), or decide that TV launch is "game screens only".

---

## A. Every mode playable on phone and desktop, with no known crashers

The live roster is the Play shelf plus off-shelf experiences (`lib/nav/families.ts` `FAMILIES`, the hrefs in
`lib/game-data.ts` `MODE_INFO`; `training` is parked by `lib/unlisted-modes.ts`). The current Babylon roster is
**32 modes in the registry, 30 enabled** (`MASTER_MODE_LIST.md`). Off the shelf but live: `/try` (the guest dunk),
`/party`, `/play/party`, and the Mirror on the Train tab.

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | Every shelf mode has a live route and a registry entry | **done** | 30 enabled Babylon registry modes are in `ENABLED_BABYLON_MODES` (`lib/babylon/modes/registry.ts`; soccer = `penalty`, baseball = `derby`). The non-Babylon live pages have their own routes: Hang Time (`/play/irl`), Groove Academy (`/play/music`), The Read (`/play/acting`) and Story (`/story`). `scripts/mode-list-check-tests.ts` and `lib/nav/reachability.test.ts` are in CI. `docs/SHIP-READINESS.md` §2: 167 link targets, 0 broken |
| A2 | A real-phone pass of every mode | **not done** | `docs/DEVICE-TEST-CHECKLIST.md` is the instrument. It has not been run |
| A3 | No page errors while loading and starting play, on a phone profile | **unknown** (9 mode loads measured) | `docs/SHIP-READINESS.md` §4: football, dunk, threepoint, karate, karate_vs, tiebreak, dance, velocitykart and skateboard: 47 loads, **0 page errors**, all reached play (static rig, SwiftShader). The rest of the live roster was not measured on that pass. `scripts/probes/_all-modes-errors.mts` boots every enabled mode (desktop viewport, dev harness), but no recorded run was found in `docs/` |
| A4 | Desktop pass of every mode | **unknown** | no recorded desktop sweep. The React pages (`/`, `/play`, `/train`, the menus) could not be loaded on the static rig (`docs/SHIP-READINESS.md` §4, "Limit") |
| A5 | No known crashers | **unknown** | **No open crasher is recorded.** Known issues that are not crashes: Tiebreak's portrait camera recentred in 4 of 5 phone loads (`docs/SHIP-READINESS.md` §4, owner call 4). Snowboard slalom "captures as a whiteout" (`docs/BACKLOG.md` B3, 2026-09-04, possibly stale). Production crash reports (`[FEL-CRASH]`, H4) have not been read |
| A6 | Production crash log read for the last 7 days | **not done** | the command is in `docs/OWNER-RUNBOOK.md` §11.3. Nobody has read it |
| A7 | Guest first-run (`/try` dunk) loads only what dunk 1 needs | **done** | commit `6abc52c2` (FIRST-DUNK-BUDGET): the static graph went from 1,026 to 505 files, about −0.76 MB gzip. The props, rival and onlookers come after dunk 1 |

---

## B. Performance budgets

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | Per-mode phone content budgets (draw calls, active meshes, skinned bodies, texture MB, particles) are enforced | **not done** (15 of 30 enabled Babylon modes have a row) | `lib/babylon/config/mobileBudget.json` (measured 2026-10-14) + `scripts/mobile-budget-tests.ts` (CI). The test now prints enabled coverage and fails stale rows that no longer map to a registered mode. **Rows exist for:** dunk, karate, karate_vs, football, skateboard, surf, tennis, golf, onevone, threevthree, threepoint, carnival, mixedcombat, aeroaces, velocitykart. **No enabled row:** dunkduel, duel, showdown, snowboard_slalom, bigair, freerun, sprint, penalty (soccer), derby (baseball), baseball, volleyball, tiebreak, dance, brainbrawl, who_scene_it. Non-Babylon music, acting, irl and story still need a separate page/load budget rather than a Babylon content row |
| B2 | No mode over the phone ceiling | **not done** | `knownOver` in `mobileBudget.json`: **football and karate `skinnedBodies`** (over 16) and **velocitykart `textureMb`** (over 256). Frozen, so they cannot grow, but they are over |
| B3 | Texture memory: no mobile mode above 2× the tier median | **done** | `scripts/perf-budget-tests.ts` (CI) on `lib/babylon/config/textureBudget.json` |
| B4 | A written load-time budget (time to first playable frame on a phone) | **not done** | no number exists. Rig TTFPF with the 8 s pre-warm was 26.7–59.0 s (`docs/SHIP-READINESS.md` §1). That is SwiftShader on a loaded 4-core box, which overstates a phone's time. The load watchdog is now "20 s with no progress", not 20 s total (`6abc52c2`, #316). **Owner call:** pick a number (for example "dunk on `/try` playable in under N s on a mid-range Android on 4G"), then measure it on the device pass |
| B5 | Frame rate on real phones | **done** | `lib/babylon/core/perfStats.ts`, mounted by `ModeHarness.ts`, sends anonymous `game_diag` kind `fps` windows for real play (0-30 s and 90-120 s) with device class only. `lib/babylon/core/perfStats.test.ts` covers the report windows, hidden/pause filtering and page cap |
| B6 | Shader pre-warm cap hits and load timeouts are reported from real phones | **done** | `capHit` and the watchdog's `load timed out` both send `game_diag` kind `load` (`docs/SHIP-READINESS.md` §5). Successful loads now have the denominator from `perfStats.ts`'s `ttfp` report (`ready`, `start`, first playable frame and page time), covered by `perfStats.test.ts` |
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
| E5 | Screen-reader labels and colour contrast on the menus | **done** (A11-01 plus 2026-11-17 signup-name label) | `scripts/a11y/audit.mts` (WCAG 2.2 AA on the 10 key pages, rules in `lib/a11y/wcag.ts`): 150 violations → 17. Play, Train, Profile, Learn, Education and the Playbook at 0. The routed auth/first-run label criticals are covered in code: `components/auth-form.tsx` gives the signup name, email and password fields accessible names, and `components/age-step.tsx` gives the birth-year/month/day controls accessible names |
| E6 | Captions for spoken lines | **done (audited)** (A11-04) | `docs/CAPTIONS-AUDIT.md`, `scripts/a11y/captions-audit.mts`: 37 speech sites, every spoken line a player acts on has an on-screen equivalent. Crowd chants (ambient) and live party voice are uncaptioned by design (owner calls in the doc); lesson films need a caption track before the first one ships |

---

## F. Installable PWA

Checked again on 2026-11-17 against the app-feel PWA implementation. The code-side install pieces are now in the tree;
the service worker still ships off by default until the owner/device check flips `NEXT_PUBLIC_SW_ENABLED`.

| # | Item | Status | Evidence / what is missing |
|---|---|---|---|
| F1 | Served over HTTPS | **done** | Firebase Hosting |
| F2 | Web app manifest (`app/manifest.ts` or `public/manifest.webmanifest`): `name`, `short_name`, `start_url`, `display` (`standalone` or `fullscreen`), `background_color`, `theme_color`, `icons` | **done** | Served as `/app.webmanifest` by `app/app.webmanifest/route.ts` and linked once from `app/layout.tsx`; `lib/pwa/manifest.test.ts` checks names, `start_url`, `display`, colours, icons and content type |
| F3 | Install icons: 192×192 and 512×512 PNG, plus a maskable one | **done** | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `apple-touch-icon.png`; `lib/pwa/manifest.test.ts` opens each PNG and checks its dimensions |
| F4 | iOS: `apple-touch-icon` (180×180) and `apple-mobile-web-app-capable` / status-bar style | **done** | `app/layout.tsx` exports `appleWebApp` metadata and links `APPLE_TOUCH_ICON_HREF`; `lib/pwa/installPrompt.test.ts` covers the iOS Safari Share/Add to Home Screen path |
| F5 | `theme-color` and an explicit `viewport` export (`viewport-fit=cover` for the notch) | **done** | `app/layout.tsx` exports `viewport` with `themeColor: THEME_COLOR`, and `lib/pwa/manifest.test.ts` pins the theme colour to `--fel-bg`. `viewport-fit=cover` is intentionally not set until the home-screen device pass, so pages are not moved under the notch early |
| F6 | A service worker. At minimum an offline fallback page. Optionally, cache the shell and the big static assets | **done in code, off by default** | `components/pwa/sw-register.tsx` registers `/sw.js` only when `NEXT_PUBLIC_SW_ENABLED=1`; `lib/pwa/sw.test.ts` pins the kill switch and `.env.example` default, and `tests/pwa/sw-routes.test.ts` proves navigations use the network with `/offline.html` fallback, hashed Next static is cache-first, pose assets are stale-while-revalidate, and pages/API/Stripe are never cached |
| F7 | Tested from the home-screen icon (standalone): canvas size, orientation, audio unlock, the back gesture | **unknown** | still needs the real home-screen device pass after F2-F6 and the service-worker flag decision. Standalone removes the browser bar, which changes the viewport the harness fits (`game-surface.css`, `consoleView`) |

The remaining PWA work is not a code missing-piece: run the standalone device pass, then flip `NEXT_PUBLIC_SW_ENABLED`
in the deployment environment if the conservative worker passes. That flip is a rebuild/deploy decision, not done here.

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
| H2 | Game diagnostics leave the browser: `game_diag` kinds `frame`, `ident`, `clip`, `cam`, `context`, `load`, `fps`, `ttfp` (load failures, the stall watchdog, render watchdog, pre-warm cap hits, frame-rate windows and successful first playable timing) | **done** | `lib/babylon/core/diag.ts` (rate limit: once per 10 s per kind). Senders: `ModeHarness.ts`, `FrameGuard.ts`, `CameraDirector.ts`, `playerIdentity.ts`, `clipRegistry.ts`, `perfStats.ts`. **Only modes run through the Babylon harness send it.** Music (Groove Academy), Acting, Hang Time and Story send none |
| H3 | `game_diag` can be read back | **done** (it needs `admin`) | `GET /api/admin/diag?hours=N` (`app/api/admin/diag/route.ts`): grouped by kind and mode, plus the last 50 lines. Admin only (runbook §12). The read-only SQL is in `docs/DEVICE-TEST-CHECKLIST.md` |
| H4 | Client crashes are reported | **done** (logs only) | `components/reliability/global-error-boundary.tsx` → `POST /api/telemetry/crash` → a `[FEL-CRASH]` server log line. These are **not** in the database, so `/api/admin/diag` does not show them. Read with `gcloud logging read` (runbook §11.3) |
| H5 | A real phone's frame rate is reported | **done** | `lib/babylon/core/perfStats.ts` sends anonymous `fps` detail lines from live play windows, mounted by `ModeHarness.ts`; `lib/babylon/core/perfStats.test.ts` covers report shape, pause/hidden filtering and page caps |
| H6 | A successful load's time is reported (a denominator for cap hits and timeouts) | **done** | `perfStats.ts` sends `ttfp` once per mount with READY time, start-to-first-frame, first-frame work and page time, including abandoned mounts (`left=`); covered by `perfStats.test.ts` |
| H7 | Admin dashboards: metrics and the funnel | **done** (they need `admin`) | `app/admin/metrics/page.tsx`, `app/admin/funnel/page.tsx`, `app/coach/admin/page.tsx` |
| H8 | Liveness endpoint | **done** | `/healthz` and `/api/health` (`app/api/health/route.ts`, no dependencies, reports the revision) |
| H9 | An uptime monitor watches `/healthz` and alerts you | **unknown** | none is recorded in the repo. The Cloud Monitoring uptime check is yours to set up |
| — | Owner account can read H3 and H7 | **unknown** | it needs `User.role = 'admin'` (runbook §12). `owner` does not pass `requireAdmin()` |

---

_How this was checked: the files and tests named in each row on `fdd77784`, with the PWA/perf telemetry rows refreshed
on 2026-11-17 from the current tree; `grep` for `manifest`, `serviceWorker`,
`viewport`, `apple-touch-icon`, `getGamepads`, `prefers-reduced-motion`, `fps` and `ttfp` across `app/`, `components` and `lib/`; the
`modes` and `knownOver` of `mobileBudget.json`; `docs/SHIP-READINESS.md` (§1, §2, §4, §5, §6);
`docs/VISUAL-PASS-PLAN.md` ("Phone perf pass" and owner-1016); `git log` of `lane/finish-release` (#242, #281, #290,
#293, #316). Nothing was run on a device, against production, or in a browser._
