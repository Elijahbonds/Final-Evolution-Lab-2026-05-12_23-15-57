# Ship readiness (lane/ship-ready, 2026-10-17)

Owner, round 5: "a sweep before more features". Measured first, then reported. The only code this lane changed is listed
in §5. The tuned numbers (the 8 s pre-warm cap and everything else) are untouched; where they matter they are **owner
calls**, with numbers. The operational items in §3 are steps for the owner. None of them was carried out here.

Base: `origin/lane/finish-release` at `2ab6a314`.

---

## 1. Phone load time with the shader pre-warm

**Rig.** The esbuild + Playwright static rig (no `next dev`, no `next build`): the real `runMode` → `ModeHarness` in a
production bundle, Chromium with SwiftShader GL, phone profile 390×844 portrait, DPR 3, `isMobile` + touch,
`?tier=mobile&perf=off`, **4× CDP CPU throttle from navigation** (the load is throttled too), seeded `Math.random`, the
real clock throughout (no virtual time: a load is wall time). The backing is 780×1688 (the phone tier's DPR cap); the
raster fill is cut 4× at `loading` (195×422), because SwiftShader's fill is CPU work a phone's GPU does not pay. Shader
compiles are not affected by that. START is pressed the moment READY arrives. Each program link (`linkProgram`) is
tagged with its phase. The 20 s load watchdog was stretched (`setTimeout(20000)` → 300 s) so a slow `def.load()` is
measured instead of failing. **Finding: on this rig `def.load()` alone passed the 20 s watchdog in every run of dunk
(29–35 s), threepoint (26–30 s) and karate (24–30 s), and in 1 of 5 karate_vs runs (22 s)**. Unstretched, those loads
would have ended on "Load timed out". The pre-warm is not part of that: it runs after the watchdog is cleared. See §6,
call 2.

Three bundles of the same tree (`2ab6a314`), built with a rig-only text patch of `shaderPrewarm.ts` (the source was not
edited for the measurement):
- **off**: `prewarmWanted` → false, so production as it was before owner-1016;
- **on**: as shipped, the 8 s cap;
- **uncapped**: the cap raised to 120 s, to see what the cap cuts off.

**TTFPF** (time to first playable frame) = navigation → the end of the first frame drawn in `playing`, with START pressed
at READY. "Compiles after READY" counts program links after the splash lifts (in brackets: during play). "Worst play
frame" is the longest frame in the first 40 frames of play. Medians: on and off 2 runs each (the second in the reverse
order), uncapped 1 run. Scripts: `scratchpad/round5/ship-ready/rig/` (`build.mjs`, `load.mjs`, `sweep.sh`,
`table.py`; raw rows in `out/s1.jsonl`, `out/s2.jsonl`).

| mode | variant | runs | load s | pre-warm s | to READY s | **TTFPF s** | past 8 s | cap cut it short | compiles after READY (in play) | worst play frame ms | frames >250 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| football | off | 2 | 11.9 | 0.0 | 18.6 | **21.0** | - | - | 48 (39) | 4851 | 7 |
| football | on | 2 | 13.5 | 9.5 | 30.2 | **33.4** | 2/2 | 2/2 | 13 (4) | 566 | 3 |
| football | uncapped | 1 | 12.1 | 14.1 | 33.1 | **34.4** | 1/1 | - | 5 (4) | 697 | 2 |
| dunk | off | 2 | 31.0 | 0.0 | 37.6 | **44.0** | - | - | 49 (6) | 778 | 2 |
| dunk | on | 2 | 31.9 | 15.2 | 53.2 | **55.3** | 2/2 | 2/2 | 1 (1) | 724 | 1 |
| dunk | uncapped | 1 | 34.9 | 26.6 | 67.8 | **71.2** | 1/1 | - | 1 (1) | 362 | 4 |
| threepoint | off | 2 | 29.0 | 0.0 | 35.4 | **56.5** | - | - | 54 (22) | 3151 | 9 |
| threepoint | on | 2 | 28.1 | 12.9 | 47.2 | **59.0** | 2/2 | 2/2 | 45 (4) | 1312 | 5 |
| threepoint | uncapped | 1 | 25.6 | 24.5 | 56.4 | **58.0** | 1/1 | - | 1 (1) | 768 | 1 |
| karate | off | 2 | 24.1 | 0.0 | 30.5 | **32.7** | - | - | 38 (25) | 2256 | 5 |
| karate | on | 2 | 29.5 | 15.5 | 52.0 | **54.0** | 2/2 | 2/2 | 1 (1) | 425 | 0 |
| karate | uncapped | 1 | 24.8 | 20.6 | 51.1 | **53.4** | 1/1 | - | 1 (1) | 418 | 1 |
| karate_vs | off | 2 | 20.0 | 0.0 | 27.4 | **35.2** | - | - | 36 (4) | 2820 | 4 |
| karate_vs | on | 2 | 17.9 | 13.4 | 37.6 | **40.3** | 2/2 | 2/2 | 0 (0) | 158 | 0 |
| karate_vs | uncapped | 1 | 19.5 | 18.3 | 44.8 | **46.1** | 1/1 | - | 0 (0) | 172 | 0 |
| tiebreak | off | 2 | 9.4 | 0.0 | 15.6 | **20.6** | - | - | 29 (4) | 3278 | 2 |
| tiebreak | on | 2 | 9.0 | 8.3 | 24.0 | **26.7** | 2/2 | 1/2 | 1 (0) | 569 | 1 |
| tiebreak | uncapped | 1 | 7.9 | 7.8 | 21.8 | **23.5** | 0/1 | - | 1 (1) | 344 | 1 |
| dance | off | 2 | 9.7 | 0.0 | 16.6 | **21.4** | - | - | 38 (14) | 1347 | 2 |
| dance | on | 2 | 10.8 | 8.9 | 27.0 | **29.1** | 1/2 | 1/2 | 1 (0) | 469 | 0 |
| dance | uncapped | 1 | 10.1 | 7.8 | 24.6 | **26.3** | 0/1 | - | 1 (1) | 468 | 1 |
| velocitykart | off | 2 | 12.3 | 0.0 | 19.1 | **24.7** | - | - | 42 (14) | 2705 | 5 |
| velocitykart | on | 2 | 13.0 | 10.6 | 29.4 | **30.6** | 2/2 | 1/2 | 3 (2) | 651 | 2 |
| velocitykart | uncapped | 1 | 11.4 | 10.5 | 28.9 | **30.1** | 1/1 | - | 3 (2) | 334 | 1 |
| skateboard | off | 2 | 11.2 | 0.0 | 17.5 | **24.6** | - | - | 43 (14) | 1856 | 6 |
| skateboard | on | 2 | 10.7 | 9.9 | 27.3 | **32.0** | 2/2 | 2/2 | 12 (3) | 1193 | 2 |
| skateboard | uncapped | 1 | 11.3 | 15.9 | 32.6 | **34.5** | 1/1 | - | 3 (2) | 731 | 1 |

**What the pre-warm buys on a phone-profile load (on vs off):**
- **Mid-play compiles: from 4–39 per mode (median 14) to 0–4 (median 1).** Those are the hitches the owner asked to
  remove. The worst frame in the first 40 frames of play falls from 0.8–4.9 s (median 2.7 s) to 0.16–1.3 s (median
  0.57 s). Football, 3-Point, Tiebreak, Karate VS and Velocity Kart each had a 2.7–4.9 s frame in play without it.
- **What it costs: TTFPF +2.5 s to +21 s on this rig (median +7.4 s).** Karate +21 s, Football +12 s, Dunk +11 s,
  the rest +2.5 to +8 s.

**How often the 8 s cap is hit: almost always on this rig, and that says more about the rig than about a phone.**
- **15 of 18** phone loads were cut short by the cap. Only **2 of 18** came back `timedOut` (both threepoint: the
  scene was not ready by 8 s). In the other 13, the scene turned ready in 2.4–8.6 s, then the cap stopped some or all
  of the three warm frames. That case was **not reported**: the harness sent its `game_diag` only on `timedOut`. Fixed
  (§5): it now reports `capHit`.
- The cap is checked between polls and between frames, so a load runs past it by up to one `isReady()` plus one warm
  frame. On this rig that overshoot reached +12.7 s (karate: 20.7 s against 8 s), because one warm frame took up to
  ~8 s. On a phone a frame is a fraction of that.
- **What the cap actually cuts off is small.** Uncapped against capped: the compiles left for play are the same in 7 of
  9 modes (threepoint 4 → 1, skateboard 3 → 2), and the worst play frame is about the same. Most of what the cap
  leaves goes into the frames behind the READY card, where the player is already waiting. Raising it to "unlimited"
  changed TTFPF by −3 s to +16 s (within this box's noise, except dunk's +16 s).
- **The outlier is threepoint.** Its scene took 14 s to report ready (uncapped; the others 2.4–8.6 s), so with the
  cap about 41 compiles went to the READY card's frames. That is threepoint's load, not the cap.

**Why the rig overstates every number here.** `KHR_parallel_shader_compile` is **absent** on this rig (SwiftShader,
"Vulkan 1.3.0 (SwiftShader Device (Subzero))"), so every program compiles serially on a shared 4-core CPU, while other
lanes' vitest and tsc ran beside it (load average 4–17). A phone's driver compiles on the GPU vendor's compiler, and
Chrome on Android exposes the parallel-compile extension on most GPUs (assumption: not verified on a device here). The
on/off **counts** (programs, compiles during play) are exact and carry over to a phone. The **seconds** do not. The
real cap-hit rate can only come from phones, and production already sends it: §6, call 1.

**Recommendation (owner call 1, below): keep 8 s.**

---

## 2. Broken links and dead routes

**Method.** A static crawl of every internal link target in `app/`, `components/` and `lib/` (tests excluded): JSX
`href="/…"`, `href={`/…`}`, data `href: '/…'`, `router.push/replace`, `redirect(…)`, and `url/link/path/next/cta: '/…'`
literals, then a broad second pass over *every* string literal that starts with `/<letter>`. Each target was resolved
against the real route table: the 167 `page.tsx` routes (route groups and `_private` folders dropped, `[param]`,
`[...rest]` and `[[...opt]]` matched), the non-API route handlers (`/healthz`, `/books`, `/elijah`, `/sitemap.xml`,
`/robots.txt`), the API routes for `/api/…` links, the middleware redirects (`/links`, `/books`, `/elijah`) and the files
under `public/`. The resolver was checked against controls first: `/play/dunkk`, `/api/nope` and a dynamic
`/play/[x]x` came back unresolved, `/closet`, `/play/dunk` and `/coach/join/abc` resolved. Scripts:
`scratchpad/round5/ship-ready/links/crawl.py`, `broad.py`.

**Result: no internal link points at a route that does not exist.** 167 distinct link targets, 0 unresolved. There was
no typo to fix.

**Links to switched-off routes: all already guarded.**

| Route | Switched off by | The links to it | Guard |
|---|---|---|---|
| `/studio` (HOLD) | `NEXUS_STUDIO_ENABLED` unset → `notFound()` in `app/studio/layout.tsx` | none | `lib/nav/reachability.test.ts` fails if anything links it |
| `/account/bookings` | `COACH_STORE_ENABLED` off → 404 | the Profile door (`lib/nav/doors.ts`) | `app/profile/page.tsx` hides that door while the flag is off |
| `/coach/elijah` and every `/coach/[slug]/**` | `COACH_STORE_ENABLED` | `components/sessions-view.tsx` | rendered only when the store is on |
| `/coach/[slug]/book/…`, `/coach/dashboard/settings` | `COACH_STORE_ENABLED` | from pages that are themselves behind the flag | inherits the page's 404 |
| `/program/[id]`, `/session/[id]` | `COACH_STORE_ENABLED` | `/account/coaching`, `/account/bookings`, the thanks poll | `/account/coaching` shows "Coaching is not open yet" with the flag off and lists nothing |
| `/live/schedule` | `LIVE_STREAM_SCHEDULE_ENABLED` | none | listed in `NOT_NAVIGABLE` |
| `/story/rail`, `/story/boss` (parked) | unlinked | none | listed in `NOT_NAVIGABLE` |

**Orphan pages.** `lib/nav/reachability.test.ts` already fails on any page nothing links to unless it is excused, with a
reason, in `NOT_NAVIGABLE`. The excused list today is: `/login`, `/signup`, `/dev/**`, `/c`, `/card`, `/p`, `/links`,
`/controller`, `/admin`, `/play/map-preview`, `/studio`, `/settings`, `/coach/join/[token]`, `/party/[code]`,
`/consent/guardian/[token]`, `/screen/program/[lane]`, `/program`, `/session`, `/press/receipt`, `/coach/thanks`,
`/live/schedule`, `/story/rail`, `/story/boss`, plus the three tabs (`/play`, `/train`, `/profile`). Each is reached by a redirect, a shared link, a code or a payment
return, or is held on purpose. None is a forgotten page.

**Sitemap and robots.** `app/sitemap.ts` lists `lib/seo/publicPages.ts` (16 static pages, each book, each approved team
profile). `lib/seo/publicPages.test.ts` holds that list to the app directory. Every listed path resolves. `robots.txt`
disallows `/session`, `/program`, `/account` and the private coach paths, and none of those is in the sitemap.

**Asset paths that do not exist (latent, nothing fetches them today; owner's to keep or delete):**

| Path in code | Where | Why nothing breaks today |
|---|---|---|
| `/models/maps/baked/gridiron.glb`, `sand-court.glb`, `neuro-arena.glb` | `lib/map-data.ts` | the three.js map loader draws the procedural map (`PROCEDURAL_ENVIRONMENTS` is on), and the Babylon modes do not read `map-data` GLBs |
| `/models/candidate.glb` | `neuro-mirror/render/overlay-compositor.ts`, `app/dev/rig` | the URL is ignored while `PROCEDURAL_CHARACTERS` is on, its own comment says |
| `/cards/*.jpg` (8 images) | `lib/card-catalog.ts` `assetRef` | no component renders `assetRef` |
| `/cosmetics/*.placeholder.glb` (2) | `lib/cosmetics.ts` `glb` | `components/avatar-figure.tsx` uses the colour, not the GLB |

---

## 3. Open operational items (the owner's steps, in order)

Nothing here was run by this lane. Every item is outward-facing, touches production data, or changes what deploys.

### 3.1 Retention cron (`RETENTION_CRON_SECRET` + Cloud Scheduler)

The route ships and fails closed: `POST /api/cron/retention` answers `503 retention_not_configured` until the secret
exists, so nothing is deleted until you do this. `docs/RETENTION-JOB.md` has the full steps; in short:

1. `openssl rand -hex 32` (keep it out of git).
2. `firebase functions:secrets:set RETENTION_CRON_SECRET` and paste it.
3. In `firebase.json`, `frameworksBackend.secrets` becomes `["COACH_STORE_RECONCILE_SECRET", "RETENTION_CRON_SECRET"]`.
   One line; lanes may not edit `firebase.json`. Then the usual deploy.
4. `gcloud services enable cloudscheduler.googleapis.com --project final-evolution-lab`, then
   ```sh
   gcloud scheduler jobs create http fel-retention-daily --project=final-evolution-lab --location=us-central1 \
     --schedule="23 4 * * *" --time-zone="Etc/UTC" --uri="https://<SITE_HOST>/api/cron/retention" \
     --http-method=POST --headers="x-retention-secret=<SECRET>" --attempt-deadline=60s
   ```
5. Check once: `gcloud scheduler jobs run fel-retention-daily --project=final-evolution-lab --location=us-central1`, then
   read the run in the Scheduler console. `{"ok":true,...}` is right; `503` = step 2 or 3 missing; `401` = the secrets
   differ. Until the party-report and creator-inquiry tables exist (3.2) it answers `unavailable` with zero counts, as
   designed.

**Same shape, also never scheduled:** `POST /api/arena/reclaim` (`ARENA_RECLAIM_SECRET`, header
`x-arena-reclaim-secret`; unset = 404) and `POST /api/coach-store/reconcile` (`COACH_STORE_RECONCILE_SECRET`, already
in `firebase.json`). Both say "no scheduler calls it yet". `.env.example` now names both secrets; if the arena sweep
should run, it needs the same three steps (secret, `firebase.json`, a Scheduler job). The arena also reclaims on read,
so this is a cleanup, not a fix.

### 3.2 Pending SQL (`prisma/pending/`, 17 files)

There is no `sql/` directory; `prisma/wallet-constraints.sql` is the post-push CHECK file, not pending. **This lane could
not tell which files production already has**: that needs a read against production, which lanes may not do. The
one-command answer is the read-only preview in `docs/LANES.md` §4:

```sh
cd FEL-full-app
npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/prod-diff.sql
```

Anything in `/tmp/prod-diff.sql` is a model the deployed client already expects and production lacks. Apply the
matching file(s) below with `npx prisma db execute --url "$PROD_DIRECT_URL" --file <file>`, in the order given, then run
the same diff again; it must come back empty. Apply before the deploy that needs it.

**A. In `schema.prisma` and in the committed client: a missing table or column is a 500 on the routes that read it.**

| Order | File | Creates | Breaks without it |
|---|---|---|---|
| 1 | `2026-09-29-mirror-coach-p5-health.sql` | HealthConsent, HealthIntake, PainCheckIn | health intake, pain, consent, guardian routes |
| 2 | `2026-09-29-mirror-coach-p6-warmup-readiness.sql` | ReadinessCheckIn, enum SessionKind | Today, program builder, GuardianConsent reads |
| 3 | `2026-09-29-mirror-coach-p7-breath-log.sql` | BreathLog | the breath routes |
| 4 | `2026-09-29-mirror-coach-p8-served-exercise.sql` | ExerciseLog.servedExerciseId | every ExerciseLog read |
| 5 | `2026-10-01-economy-caps-runid-agentrun.sql` | GameSession.runId (+unique, FK), SessionRun.agentRun | the session paths (ECONOMY-CAPS, #89) |
| 6 | `2026-10-04-adult-optin-ab04.sql` | ScanSaveOptIn | fails closed (no save) |
| 7–11 | `2026-10-04-coach-store-instructor.sql`, then `-booking`, `-program-access`, `-call-signal`, `-referral` | Instructor, Booking, ProgramAccess, CallSignal, CoachStoreReferral | coach-store pages, behind `COACH_STORE_ENABLED` (off) |
| 12 | `2026-10-07-adventure-save.sql` | AdventureSave | the schema comment says the owner applied it (2026-10-06) |
| 13 | `2026-10-07-coach-ai-1-message-read-markers.sql` | ProgramMessage.readAt | **see the finding below** |
| 14 | `2026-10-07-coach-ai-2-coach-availability.sql` | CoachAvailability | raw-SQL reads probe for it first |

**Finding (13): the "safe in either order" note on the read-markers SQL is out of date.** The SQL header and
`lib/coach/messageReads.ts` both say the committed client "has never heard of readAt", so the column is optional.
`4eecc830` (2026-10-07, "sync schema with #198 SQL") then put `readAt` into `schema.prisma` **and** regenerated
`public/_prisma/client` (its `index.d.ts` and `index.js` now carry it). Since then
`app/api/coach/messages/route.ts` runs `prisma.programMessage.findMany({ where, orderBy, take })` and
`prisma.programMessage.create(...)` with no `select`, and Prisma selects and returns every scalar, `readAt` included.
On a database without the column, the coach thread's GET and POST fail. The commit message says "drift check clean",
which suggests production already had the column when it was written. If the preview diff lists `readAt`, apply file
13 before the next deploy. assumption: this was read from the code and the committed client, not run against a
database without the column.

**B. Not in `schema.prisma` (raw SQL behind an `information_schema` probe): safe in either order with a deploy.**

| File | Creates | Without it |
|---|---|---|
| `2026-10-09-book-shop.sql` | BookEntitlement, BookFulfillmentEvent | the book shop stays closed; `docs/BOOK-SHOP.md` has the rest of its steps (add the models, regenerate the client on Linux) |
| `2026-10-13-creator-inquiry.sql` | CreatorInquiry | `/work-with-us` stores nothing (it says so) |
| `2026-10-13-party-report.sql` | PartyReport | party reports are not stored; the retention job (3.1) reports `unavailable` |

Regenerating `public/_prisma/client` (needed only when a model is added, for example the book shop's): on Linux, never on
a Mac. A Mac bakes `darwin-arm64` (the committed client already carries `libquery_engine-darwin-arm64.dylib.node`
next to the Linux engine; see `CLAUDE.md` and the generator block in `prisma/schema.prisma`).

### 3.3 netd redeploy for the party

The party (PARTY-CHAT, `/party`) rides `fel-netd` on Cloud Run. An old netd answers `/party` with "room and peer
required", and the app shows "Parties need a server update". The full steps are in `server/netd/README.md` ("Owner's
redeploy steps"):

1. `openssl rand -base64 48`, then
   `printf '%s' '<secret>' | gcloud secrets create party-ticket-secret --data-file=- --project final-evolution-lab` and
   `gcloud secrets add-iam-policy-binding party-ticket-secret --member serviceAccount:<netd runtime SA> --role roles/secretmanager.secretAccessor --project final-evolution-lab`.
2. From `FEL-full-app/`:
   ```sh
   gcloud run deploy fel-netd --source server/netd --project final-evolution-lab --region us-central1 \
     --allow-unauthenticated --min-instances 1 --max-instances 1 --session-affinity --timeout 3600 \
     --set-secrets PARTY_TICKET_SECRET=party-ticket-secret:latest
   ```
3. `curl -s https://<netd url>/healthz` must list `"features":["party1"]`.
4. In the deploy tree's production env file: `PARTY_TICKET_SECRET` (the same value) and
   `NEXT_PUBLIC_NETD_URL=wss://<netd url>`. It is a build-time variable, so it must be there before `next build`.
   Optional: `PARTY_TURN_URLS` / `PARTY_TURN_SECRET`. Then the app deploy.
5. Device test: two phones on different networks, `/party`, start a party, join by code, chat, voice (18+), Start together.

Rollback: `gcloud run services update-traffic fel-netd --to-revisions <previous>=100 --region us-central1`, or unset
`NEXT_PUBLIC_NETD_URL` and redeploy.

The party **room** (`/play/party`, Controller Link) does not use netd. It needs `CONTROLLER_LINK_KV_URL` /
`CONTROLLER_LINK_KV_TOKEN` (Upstash), or phones hang across the 1–4 instances. That is `docs/DEPLOY-CHECKLIST-PARTY.md`,
§2–§4.

### 3.4 Env vars the code reads that no doc or `.env.example` names

90 names are read through `process.env` / `envOn(...)` in `app/`, `lib/`, `components/`, `middleware.ts`,
`next.config.js` and `server/netd/src`. `firebase.json` names one, `COACH_STORE_RECONCILE_SECRET` (as a secret). Every
other server value reaches production through the deploy tree's env file, so what matters is whether a doc or
`.env.example` tells you it exists.

**Read by production code, named nowhere:**

| Variable | Read in | Unset means |
|---|---|---|
| `COACH_STORE_LIVE` | `lib/flags.ts`, `lib/coach-store/stripeMode.ts`, `app/api/stripe/checkout`, `lib/books/bookCheckout.ts` | a **live** Stripe key is refused (test keys only). Set it only on the day real money is meant to flow |
| `ARENA_RECLAIM_SECRET` | `app/api/arena/reclaim/route.ts` | the reclaim sweep route is a 404 (3.1) |
| `CREATOR_MEDIA_BUCKET`, `CREATOR_MEDIA_PUBLIC_BUCKET` | `lib/soundtrack/storage.ts`, `app/api/v1/creative-card/upload-url` | creator uploads answer with an unavailable-storage 503. Two distinct GCS buckets: pending (private, 30-day lifecycle on `pending/`) and public-read with CORS; `lib/soundtrack/storage.ts` lines 8–13 describe both. Follow-up 2026-10-18: `.env.example` names both values. |
| `LIVE_STREAM_SCHEDULE_ENABLED` | `lib/flags.ts`, `app/api/live/schedule` | `/live/schedule` is a 404 |
| `NEXT_PUBLIC_FEL_BODY_RIDE` | `lib/input/rideProfiles.ts` | build-time, probe-only; leave unset in production |
| `K_REVISION`, `VERCEL_GIT_COMMIT_SHA` | `app/api/health/route.ts` | set by the platform; nothing to do |

**Follow-up 2026-10-18:** `.env.example` now names the documented operational flags and secrets a fresh deploy needs to
see before it can intentionally turn them on: `ABACUS_ENABLED`, `COACH_STORE_ENABLED`,
`COACH_STORE_PAYMENTS_ENABLED`, `COACH_STORE_LIVE`, `COACH_STORE_COACH_USER_IDS`, `COACH_STORE_RECONCILE_SECRET`,
`COACH_REVIEWS_BUCKET`, `COACH_REVIEW_UPLOADS_ENABLED`, `FACE_SCAN_ENABLED`, `VIRTUAL_PURCHASES_ENABLED`,
`PAYOUTS_ENABLED`, `RETENTION_CRON_SECRET`, `ARENA_RECLAIM_SECRET`, `LIVE_STREAM_SCHEDULE_ENABLED`,
`NEXT_PUBLIC_JOIN_LAB_ENABLED` and `FEL_TEST_ACCOUNTS`. All default off or closed when unset. The old
`STRIPE_BOOKS_SECRET_KEY` remains intentionally absent; books use the platform `STRIPE_SECRET_KEY`.

The rest are test- or probe-only (`SESSIONS_IT`, `DAILY_IT`, `DB_CONNECTOR_IT`, `HM_DEBUG`, `CAM_CAL`,
`MIRROR_BASELINE_OUT`, `COMPLIANCE_PROOF_OUT`, `FEL_RECORD_BUS_GOLDEN`, `FEL_POKE_DEBUG`, `FEL_HERO_GLB`). The full
list with counts: `scratchpad/round5/ship-ready/envvars-status.txt`.

---

## 4. Console errors and warnings on load (static rig)

**What was run.** The static rig of §1, 9 modes × 3 bundles × 1–2 runs, plus the 2 check runs of §5 (47 loads): every `console.error`/`warning`, every
`pageerror`, and every response ≥ 400, from navigation to 40 frames into play. **Limit:** the Next.js page routes (`/`,
`/play`, `/train`, the shells and menus) cannot load without `next dev` or `next build`, and both are off limits on this
box. So this covers the game modes through the real harness, not the React pages. Those need a look on `:3000` or on
the deploy.

**Page errors: none.** No uncaught exception in any of the 47 loads, and all 47 reached play.

| What the console said | Modes | Verdict |
|---|---|---|
| `404` on `/api/v1/pipelines/community?kind=dance-songs` and `?kind=routines`, `/api/v1/closet?for=spawn`, `/api/v1/hero-body` (and `/api/v1/soundtrack`, `/api/season`, `?kind=mc-lines` in dunk/threepoint) | all 9 | **Rig only.** The static server has no API. Every one of those routes exists in `app/api/**`. Not a production 404. (Each mode asks for the dance-song and routine lists at load, football included. Harmless, but it is two requests a non-dance mode does not need: a note, not a fix.) |
| `[FEL-LIGHT] liftBlackMaterials fixed N materials` (warning), N = 2–14 | all 9 | The harness's own rescue: N materials came out of the load black and were lifted. Karate and karate_vs 14, football 10, dance/tiebreak/dunk 5, threepoint 4, velocitykart and skateboard 2. It is working as designed, but each one is a material that loads wrong first. A content follow-up for the mode lanes, not a ship blocker. |
| `[FEL-FRAME] hero off-screen 2x (off RIGHT / off LEFT)` then `auto-recentering camera on hero` (error) | tiebreak (4 of 5 loads), karate_vs (1 of 5) | In **portrait** (390×844) the tiebreak camera lost the hero twice in the first seconds of play, on and off alike, and FrameGuard recentered it. That is the guard working, but it is also a real portrait framing miss. Part of it may be the rig: slow frames let the hero outrun the camera's ease. Camera distance and framing are tuned numbers, so this is reported, not changed: §6, call 4. The one karate_vs miss had the hero at the world origin, the never-placed signature FrameGuard's spawn grace was written for (a race, 1 load in 5). |
| `[FEL-DUNK] watchdog tripped in phase "approach" after 30–32 s — auto-resolving` | dunk (4 of 5) | **Rig artifact.** The rig presses nothing after START, so the approach never ends and the dunk's own watchdog resolves it, as designed. |
| `Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute` (Chrome) | dunk, threepoint | One warning per load, from a 2D canvas read back more than once while textures are built at load. The harness's own readback (`RenderWatchdog`) already sets `willReadFrequently`. The source among the procedural texture painters (`CourtSurface`, `groundTextures`, `veniceBoardwalk`, …) was not pinned. Load-time only; no frame cost. Not fixed: it is not clearly one call site. |

Nothing here was trivial *and* clearly a bug, so §4 changed no code.

---

## 5. What this lane changed

Two diagnostics fixes, each its own commit, both in shared files (flagged `shared file:` in the commits). Neither
changes a tuned number, a timing, or what the player sees.

1. **The shader pre-warm reports every cap hit** (`48e6e2e5`). `prewarmScene` returns a new `capHit` field: timed out,
   or the cap stopped the warm frames. `ModeHarness` sends its `game_diag` on `capHit` (it used `timedOut`), and the
   detail now says whether the scene was ready. Before this, 13 of the 15 cap hits in §1 would not have been
   reported. The frame loop's cap check moved from the loop condition into the body, so it can record the cut; which
   frames are drawn is unchanged. `PREWARM_CAP_MS` is still `8_000`.
   Checked on the rig after the change: skateboard `{ ready: true, timedOut: false, capHit: true, frames: 0 }` and
   football `{ …, timedOut: false, capHit: true, frames: 1 }`.
2. **A load the 20 s watchdog ends is reported** (`7cced290`). One `reportDiag('load', '<mode> load timed out after
   20000 ms')` before the error screen, the same as a load that throws already did. `LOAD_WATCHDOG_MS` is still `20_000`.

Tests: `lib/babylon/core/shaderPrewarm.test.ts` 14 → 17 (two `capHit` cases and a harness pin, and the watchdog
pin). Mutation checks, each turning exactly one test red: `capHit` = `timedOut` only; the harness back on `timedOut`;
`framesCut` never set; the watchdog's diag line deleted.

Docs: this file, and the lane's own row in `docs/LANES.md`.

---

## 6. Owner calls

Recommendation first in each.

1. **The 8 s shader pre-warm cap.** (a) **Keep 8 s** *(recommended)*. Even on this rig, which compiles serially on a
   loaded CPU with no parallel-compile extension, 8 s already moves almost every mid-play compile into the load:
   median 14 → 1 per mode. Most of what the cap leaves lands behind the READY card. Uncapped bought 0–3 fewer mid-play
   compiles for up to 16 s more splash. (b) 12 s: only threepoint would gain. (c) Lower it to 4–5 s: would start
   leaking compiles into play on slow phones.
   **To judge it on real phones** once §5 ships: production writes `game_diag` rows. Read-only, the owner's:
   ```sql
   SELECT props->>'mode' AS mode, count(*) AS cap_hits
   FROM "AnalyticsEvent"
   WHERE name = 'game_diag' AND props->>'kind' = 'load' AND props->>'detail' LIKE 'shader pre-warm hit its cap%'
     AND "createdAt" > now() - interval '7 days'
   GROUP BY 1 ORDER BY 2 DESC;
   ```
   There is no denominator yet: a pre-warm that finishes in time logs to the console only. **1b:** send the successful
   pre-warm time too, as its own diag kind (for example `warm`, so it never rate-limits a `load` error; one event per
   phone load). (a) **Yes** *(recommended: it is the only way to see a phone's real compile time; mode and milliseconds,
   no personal data, on the analytics path that exists)*; (b) no, judge from cap hits alone.
2. **The 20 s load watchdog vs. dunk / threepoint / karate.** On the rig, `def.load()` alone ran 24–35 s in those three.
   (a) **Keep 20 s, count real timeouts first** *(recommended; §5 now reports them, query as above with
   `LIKE '%load timed out%'`)*, and if phones hit it, make those three modes' loads cheaper rather than wait longer;
   (b) raise it to 30 s now; (c) raise it on the phone tier only.
3. **Read markers' SQL (§3.2, file 13).** (a) **Run the read-only preview diff before the next deploy** *(recommended)*;
   apply file 13 if it lists `ProgramMessage.readAt`. (b) Deploy without checking: the coach thread's GET and POST fail
   if the column is missing. Either way, the "safe in either order" notes in that SQL file and in
   `lib/coach/messageReads.ts` are out of date (the coach-ai lane's files; not edited here).
4. **Tiebreak's portrait framing.** FrameGuard recentered the camera in 4 of 5 portrait loads. (a) **A look on a real
   phone, portrait, first 10 s** *(recommended: camera numbers are yours to feel)*; (b) send it to a camera lane now.
5. **The retention cron and the arena reclaim (§3.1).** (a) **Retention: do the five steps** *(recommended: the privacy
   policy promises the 12-month delete)*. Arena reclaim: (a) leave it unscheduled *(recommended: it reclaims on read
   already)*; (b) schedule it the same way.
6. **`.env.example` (§3.4).** (a) **A lane adds the 20 names it is missing, empty, with one comment line each**
   *(recommended; documentation only, nothing deploys from it)*; (b) leave it.

---

## 7. Gate

At `84048afc` (the code as it ships from this lane; this section is the only change after it), from `FEL-full-app/`,
with the database variables unset, under the shared heavy-job lock:

| Step | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | clean |
| `npx tsx scripts/ci-suite.ts` | 203 passed, 0 failed, 11 skipped (the DB suites, no `DATABASE_URL`) |
| `npx vitest run lib/babylon lib/nav components/shell` | 802 files, 10,020 tests passed, 0 failed |
