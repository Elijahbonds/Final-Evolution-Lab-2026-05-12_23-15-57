# Lanes: parallel work, one merge point

**Owner decision, 2026-09-28:** several lanes work at once. Each lane has its own branch and its own worktree. Each
green phase reaches `lane/finish-release` through a pull request, and **the owner merges it**. `/CLAUDE.md` and
`docs/AGENT-OPERATING-RULES.md` still bind; this file adds the lane rules and the registry of who owns what.

The registry was read from git, the lane briefs and the session notes on 2026-09-28 at 22:48 PDT, and rechecked at
23:20 PDT. When your lane's row changes, update it in your lane's PR. (`docs/OWNERSHIP-MAP.md` is from 2026-09-05. It
describes the earlier two-writer setup, and its ports 3005–3007 are not the ones in use now.)

---

## 1. How lanes work

**The shape**

- `lane/finish-release` is the integration lane. Every lane merges into it, and deploys come from it. Lanes never
  target `main`.
- One lane = one branch + one worktree + one writer. Cut the branch from `origin/lane/finish-release` (section 6). If
  `git worktree list` shows your branch checked out somewhere else, stop.
- **Nobody commits in the shared checkout** `~/Developer/FEL-swarm/mode-lanes/wt-finish-release`. Don't run
  checkout, pull, reset, stash or clean there either. `git -C <it> fetch` and `git -C <it> worktree add <new path>`
  are fine, because they touch only shared git metadata and the new path.
  Why: a push from that checkout carried another session's unpushed commit to origin (`a1a1c5f9`), and that commit
  needed a production schema push before anything could deploy.
- **Nobody pushes `lane/finish-release`.** It moves only when the owner merges a PR. That includes an operator
  fast-forwarding the lane for a session (section 7, staged tips), unless the owner writes an exemption into this
  file.

**This replaces four older standing approvals.** They are still in the session notes; none of them is a landing
path any more:

- `feedback_push_deploy_cadence` (2026-09-18): "push + deploy after each green pass, no further asking".
- `feedback_land_from_own_worktree` (2026-09-28 ~14:00): `git push origin HEAD:lane/finish-release` from `land-wt`.
- `fel-continue-through-passes` (2026-09-25, reaffirmed 2026-09-28 ~19:40): "standing approval to land + push each
  green phase". Landing a phase now means the PR below, which the owner merges.
- The mirror pass's "STANDING GO for additive-only `prisma db push` (check the diff, push, deploy)" (2026-09-25). The
  mirror note's own 2026-09-28 process change already says that pass "no longer pushes to lane/finish-release, deploys,
  or writes to production". Production schema changes follow section 4.

**Each phase**

1. Work and commit on your lane branch only.
2. Pick up the lane's latest work:
   - **Branch never pushed:** you may rebase your own commits onto `origin/lane/finish-release`.
   - **Branch already pushed, or has a PR:** `git merge origin/lane/finish-release`. Never rebase or force-push a
     pushed branch. A history rewrite on a shared branch is on the `/CLAUDE.md` stop-and-ask list, and the lane
     briefs forbid it.
   - **A conflict in a file another lane holds:** take `lane/finish-release`'s side, note it, then check your change
     still holds.
3. Gate, from `FEL-full-app/`, with the database variables unset so nothing can reach production, under the heavy
   lock (section 5):
   ```
   mkdir -p ~/Claude/bin-shim && printf '#!/bin/sh\nexec npx "$@"\n' > ~/Claude/bin-shim/yarn && chmod +x ~/Claude/bin-shim/yarn
   export PATH=~/Claude/bin-shim:$PATH                                # ci-suite needs yarn; see below
   env -u DATABASE_URL -u DIRECT_URL npx tsc --noEmit
   env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/ci-suite.ts   # DB suites skip without DATABASE_URL
   env -u DATABASE_URL -u DIRECT_URL npx vitest run
   ```
   - **ci-suite needs `yarn`, and this Mac has none.** `scripts/ci-suite.ts` runs every suite as
     `yarn tsx scripts/<suite>`. Without yarn each suite "fails" instantly (Gate Crasher saw 193 of 193 fail). The
     `yarn → npx` shim on PATH above fixes it. You can put the shim in your session scratchpad instead of
     `~/Claude/bin-shim`. One suite on its own runs as `npx tsx scripts/<suite>`.
   - **Green means no failure beyond the recorded baseline.** Gates run on Node 26, because the Homebrew `node@22` is
     broken on this Mac. The baseline at `59ff7e11` is **zero failures** (table below). Any failure is red unless it is
     in your branch's recorded baseline, named in the PR body.
   - **The old FlipPad.p5 ×6.** On Node 26, vitest's `FlipPad.p5` used to fail 6 tests (the book-shop and
     movement-play notes; the staged briefs still allow "the 6 known FlipPad(.p5) failures"). `02c62063` (2026-09-28
     13:36) fixed the test for Node 26, and at `59ff7e11` `FlipPad.p5` passes 19 of 19. A branch whose base predates
     `02c62063` still sees the 6: today `lane/econ-harden-2`, `feature/book-shop`, `feature/creator-platform`,
     `feature/qa-fixes-0927` and `feature/mirror-assess`. Merge (or, never pushed, rebase onto)
     `origin/lane/finish-release` to pick up the fix, or name the 6 as your baseline.
   - **Baseline at `59ff7e11`** (2026-09-28 23:21–23:27, this lane's own gate, Node 26.8.2, heavy lock held):

     | Step | Result |
     |---|---|
     | `tsc --noEmit` | 0 errors |
     | `ci-suite` | 183 passed, 0 failed, 10 skipped (the DB suites, no `DATABASE_URL`) |
     | `vitest run` | 620 files passed, 1 skipped; 9,309 tests passed, 0 failed, 13 skipped, 1 todo |

   Counts only go up; a drop means something was dropped. A docs-only commit runs the same gate.
4. Push your lane branch only: `git push -u origin lane/<name>`. Never push `main` or `lane/finish-release`.
5. Open the PR with `gh pr create --base lane/finish-release`. A draft is fine. The body carries:
   - the gate counts (tsc, ci-suite, vitest), and any baseline failures by name;
   - what is still open, and what the next phase takes;
   - every **flag**: a tuned feel number (from → to, and why), a relaxed test, a guard tightened until existing
     content fails, and each `assumption:`;
   - every shared file you touched (section 3), with one line on why.
6. **Stop. The owner merges.** No self-merge, no auto-merge, no retargeting, no marking a draft ready.
   CI (`.github/workflows/ci.yml`) runs on every push and PR: the Prisma sync checks, tsc, vitest, the headless suites
   against a real Postgres, and `next build`.
7. After the merge, keep the branch for the next phase. Start that phase by merging `origin/lane/finish-release`.

_Sources: `/CLAUDE.md`; `docs/AGENT-OPERATING-RULES.md`; owner decisions of 2026-09-28 (session notes
`feedback_parallel_lanes_pr_merge`, `feedback_land_from_own_worktree`); session notes `feedback_push_deploy_cadence`,
`project_fel_open_work_audit_2026_09_25_cadence`, `project_fel_mirror_coaching_pass`, `project_fel_gate_crasher_polish2`
(yarn), `project_fel_book_shop_lane` (Node 26, FlipPad); lane briefs `~/Claude/inbox/LANE-*.md`, `PASTE-NOW-*` (FlipPad
×6 allowance); `git log -- lib/babylon/music/FlipPad.p5.test.tsx`, `git merge-base --is-ancestor 02c62063 <branch>`;
this lane's gate run at `59ff7e11`; `.github/workflows/ci.yml`; `scripts/ci-suite.ts` (`runSuite`); `which yarn` (not
found)._

---

## 2. The lane registry

Worktree paths are under `~/Developer/FEL-swarm/`. The port is the dev-server port the lane recorded. A lane marked
**finished** holds nothing: its files go to the holder named in section 3, or to nobody.

| Lane | Branch | Worktree | Owns | Port |
|---|---|---|---|---|
| **finish-release** (integration) | `lane/finish-release` | `mode-lanes/wt-finish-release` (shared; no commits) | The merge target | none of its own; :3100 there is venice-env-2's server |
| **hoops-motion** | `lane/hoops-motion` (on origin; PR #23 is phase 3). Each later phase opens its own branch and PR | `land-wt` | 1v1, 3v3, 3PT, Court Carnival and the basketball clips; `DunkMode.ts` | :3098 (not listening at 23:20) |
| **hoops-10phase-2** | `lane/hoops-10phase-2` (PR into `lane/finish-release`, one per phase; HOOPS-10PHASE-2 brief, FE PM 2026-10-03) | `lanes/hoops-10phase-2` | The hoops 10-phase pass on the hoops-motion set: 3PT one-press-one-shot (phase 1), then shot input/outcome, locomotion, dribble, passing, defense, rebounding, camera/HUD and the dunk variety table across the hoops modes; its probes `_hoops-phase*-*.mts`; the `ShotLatch` and the capture rise-start data in `lib/babylon/anim/opponentMotion.ts` | :3123 (`NEXT_DIST_DIR=.next-hoops-10phase-2`, server stopped after each probe run) |
| **movement-play** | `lane/movement-play`, planned | none yet. It lands via `lane/movement-play` and a PR. `land-wt` is not its landing path any more: direct pushes are retired, and `land-wt` now holds `lane/hoops-motion` | `ModeHarness`, `InputBus`, `StartWake`, `sessionStore`, `lib/input/**`, `lib/pose/**`, `lib/move/**`, `use-start-wake`, `BodyControl`; `DanceCore`, `danceTracks`, `bodyTargets`, `lib/drills`; the phase 8–10 targets (Sprint, FreeRun, SkateRun, SnowboardSlalom, AirSession, `Board*`, VelocityKart, AeroAces, `lib/babylon/racing`); `lib/policies.ts` §6. It reads `ABANDON_MS` from `lib/mirror/screenRunner.ts` (via `lib/drills/DrillRunner.ts`) and does not own that file | :3097 (P4), :3096 (P7), :3095 (P8) |
| **music-suite** | `lane/music-suite` | `mode-lanes/wt-music` | `lib/arena.ts`, `lib/mp/match-core.ts`, `lib/babylon/music/*`, `DanceMode.ts`, StemBand/KitPulse, the endless cap in `app/api/sessions/route.ts`, `lib/wallet/dead-buys.ts`, `_scorecard-routes.mts`; its region of `lib/prq.ts` (section 3) | :3121 (`NEXT_DIST_DIR=.next-music`, DB offline) |
| **mirror-coach** | `lane/mirror-coach` | `mode-lanes/wt-mirror` | `app/play/mirror/**` (except `assess/**`), including `mirror-harness.tsx` (shared: section 3), `lib/mirror/**`, including `screenRunner.ts`, the neuro-mirror rules, `coach/**`, `lib/workout/**`, `app/train/**`, additive Prisma, the recovery lines in `lib/prq.ts`, `lib/policies.ts` §5, `lib/prq-data-rights.ts` | :3131 |
| **mirror-coach-erase** | `lane/mirror-coach-erase` (PR into `lane/finish-release`) | none (cloud agent) | Erase keeps HealthConsent: `lib/prq-data-rights.ts`, `lib/health/healthDataCopy.ts`, `lib/policies.ts` §5, `components/profile-view.tsx` health-erase warning, breath-gate comments in `lib/breath/rampGate.ts` and `lib/breath/rampServer.ts` | none |
| **econ-harden** | `lane/econ-harden-2`, local only (not on origin) | `mode-lanes/wt-econ-harden` | `app/api/sessions/*`, `lib/sessions/*` (modeScoreRules, sessionRuns, runEligibility, runRateLimit, unpaidCopy) | :3100 (recorded; the port is venice-env-2's today) |
| **gate-crasher** | none. **Finished**: landed `46a8dc6a` and `3a0f4edf` (LAND_PASS, including GC-10–13) | none | Nothing. `SnowboardSlalomMode.ts` is movement-play's; see section 3 for the rest | none |
| **venice-dunk-env** | none. **Finished**: landed `9096d7cf` | none | Nothing. Its Venice files are venice-env-2's now | none |
| **venice-env-2** | none; uncommitted work in the shared checkout (section 7) | `mode-lanes/wt-finish-release`; an A/B tree `wt-parent` (below) | `veniceBoardwalk.ts`, `CourtSurface.ts`, `venuePropSets.ts`, `public/models/props/venice/env2/` | :3100 (`next dev`, started 19:43), :3101 (`wt-parent`) |
| **book-shop** | `feature/book-shop` | `lanes/book-shop-merge` | `lib/books/*`, `app/press/*`, `app/api/books/*`, `components/press/*`, `docs/BOOK-SHOP.md`, `scripts/stripe-*` | none recorded |
| **creator-platform** | `feature/creator-platform` (its PR targets `feature/book-shop`) | `lanes/creator-platform` | `lib/creator/*`, `app/team/**`, `app/media-kit`, `app/work-with-us`, `app/bookings/success`, `app/api/creator/*`, `components/creator-platform/*`, `docs/CREATOR-PLATFORM.md` | none recorded (`next start` on 127.0.0.1) |
| **mirror-assess** | `feature/mirror-assess` | `lanes/mirror-realtime` | `lib/assess/**`, `app/play/mirror/assess/**`, `app/api/mirror/assessment/**`, `docs/MIRROR-ASSESS*.md`, `lib/profile/scanToSnapshot.ts` | none recorded |
| **screen-fix-2** | `lane/screen-fix-2` (PR into `lane/finish-release`) | `lanes/screen-fix-2` | The Quick Screen follow-on to SCREEN-FIX (FE PM approval 2026-09-29 10:47 PT): `app/screen/**`, `app/play/mirror/assess/**` (mirror-assess's PR #20 merged), `lib/screen/**`, `components/providers.tsx`; the report skip in `app/global-error.tsx`; one minimal edit in movement-play's `lib/pose/assets.ts` (the CDN fallback removed) | :3221 (`NEXT_DIST_DIR=.next-screen-fix-2`) |
| **screen-harden** | `lane/screen-harden` (PR into `lane/finish-release`) | cloud checkout | `middleware.ts` (screen-path CSP report-only, Permissions-Policy `camera=(self), microphone=()`), `lib/screen/middleware.test.ts`, `components/shell/app-chrome.tsx` (F4 chrome split; wiring routed to FONT-SHARED / SCREEN-FIX-2), probes `_screen-harden-headers.mts` / `_screen-harden-bundle.mts` | :3251 (`NEXT_DIST_DIR=.next-screen-harden`) |
| **qa-fixes** | `feature/qa-fixes-0927` | `lanes/qa-fixes` | The PRQ badge surfaces: `app/api/profile/route.ts`, the `game-shell.tsx` header badge, `status-rail.tsx`, `ladder-view.tsx`, `profile-view.tsx`, `who-scene-it-game.tsx`, `brain-brawl-game.tsx`, `lib/prq-display.ts`. Its PR #19 also touches `mirror-harness.tsx`, which mirror-coach holds (section 3) | :3131 (`NEXT_DIST_DIR=.next-qa`) |
| **join-lab-hide** | `lane/join-lab-hide` (PR into `lane/finish-release`) | `lanes/join-lab-hide` | `lib/marketing/joinLab.ts` (the NEXT_PUBLIC_JOIN_LAB_ENABLED switch, off by default) and its tests; the wiring only in `components/guest-landing-hero.tsx` (the form's one render site) and the closed-by-default guard at the top of `app/api/marketing/subscribe/route.ts`; `scripts/probes/_join-lab-hide.mts`. `components/marketing/email-capture.tsx` stays untouched, and no lane holds it | :3241 (`NEXT_DIST_DIR=.next-join-lab-hide`) |
| **reach-freeze** | `lane/reach-freeze` (PR into `lane/finish-release`) | `lanes/reach-freeze` | The play frame: `lib/babylon/core/playFrame.ts` (`COSMETIC_CLAMP`, `STANDARD_FRAME_MODES`), `playFramePoint.ts`, `avatarSpec.ts`; the body-scale parts of `playerIdentity.ts` (`applyProportions`, the proportions step of `applyIdentity`, `resolveIdentity`'s scales) and `heroBody.proportionsFromFrame`; `lib/creator/schema/vitals.ts`. Retires `lib/workout/avatar-builder.ts` (a shim until mirror-coach applies `workout-view.tsx` R1 in `~/Claude/outbox/reach-freeze-routed.md`). The hoops modes' play-frame reads are routed to hoops-motion and movement-play | :3291 reserved (`NEXT_DIST_DIR=.next-reach-freeze`) |
| **teen-write-block** | `lane/teen-write-block` (PR into `lane/finish-release`) | `lanes/teen-write-block` | The save gates (Cyber GAP 1; FE PM 2026-09-29): `lib/privacy/scanSaveGate.ts`, `scanSaveOptIn.ts`, `healthWriteGate.ts`, `verifiedAdult.ts` and their tests, the test-only `tests/helpers/writeSpyDb.ts`; the gate line only in `app/api/mirror/dunks/route.ts` (1c) and `app/api/v1/camp/sessions/route.ts` (1h), and the age check in `app/api/health/{intake,pain,readiness}/route.ts`. TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT override, for exactly these lines): the gate line in `app/api/mirror/{screen,sessions,assessment}/route.ts` (1a, 1b, 1d, its parent path removed), `app/api/v1/workout/scan/route.ts` (1e), the `prq` snapshot in `app/api/v1/creator/athlete/route.ts` (1g) and the `form` write in `app/api/sessions/route.ts` (1f); the grant check in `app/api/health/consent/route.ts` (d, e) and the guardian allowance removed from `lib/health/intake.ts`; the opt-in fixture in those routes' tests. Still routed (`~/Claude/outbox/teen-write-block-routed.md`): R-CLIENT and R-HEALTH-CLIENT (mirror-coach / qa-fixes client files) | :3301 (`NEXT_DIST_DIR=.next-teen-write-block`) |
| **ci-suite-npx** | `lane/ci-suite-npx` (PR into `lane/finish-release`) | cloud checkout of this branch (no shared worktree on the Mini) | `scripts/ci-suite.ts`: each headless suite launches through the tsx CLI npm installed (`tsx/cli`), so the gate runs with no yarn on PATH. Test: `lib/ci/ciSuiteRunner.test.ts` | none |
| **age-screen** | `lane/age-screen` (PR into `lane/finish-release`) | Cursor cloud agent (no Mini worktree) | Neutral birth-year question at sign-up and next login (FE PM 04:19 PT): `lib/privacy/ageScreen.ts`, `lib/privacy/u13LockLog.ts`, `components/age-step.tsx`, `app/age/page.tsx`, `app/api/account/birth-year/route.ts`; wiring in `app/signup/page.tsx`, `components/auth-form.tsx`, `app/api/signup/route.ts`; the younger-signal refusal in `lib/health/intake.ts`; `lib/screen/config.ts` gains only the `'/age'` entry on `SIGNED_IN_ONLY_ROUTES` (FE PM 07:28 PT). `lib/auth.ts` stays routed (PR #17). | :3331 (`NEXT_DIST_DIR=.next`, default) |
| **account-data-home** | `cursor/account-data-home` (PR into `lane/finish-release`) | Cursor cloud agent | The consent screen's account-settings home: `app/account/page.tsx`, `app/settings/page.tsx` (redirect), `app/api/account/export/route.ts`, `app/api/account/health-erase/route.ts`, `lib/account/**`, `components/account/account-settings.tsx`, `components/health/consent-bullet.tsx`; the link wiring in `health-intake-gate.tsx` and `pain-checkin.tsx`; S-16 `?next=` in `lib/auth/safeNext.ts`, `components/auth-form.tsx`, `app/login/page.tsx`. Reuses `collectPrqExport` and `eraseHealthData`. Does not own `lib/prq-data-rights.ts` or `lib/db.ts`. | none |
| **stream-dunk-capture** | `cursor/stream-dunk-capture-80a5` (PR into `lane/finish-release`) | Cursor cloud agent | On-device game capture and dunk-film review: `lib/capture/**`, `lib/dunk-film/**`, `components/capture/**`, `scripts/capture-dunk-tests.ts`. Wiring only in `components/games/game-shell.tsx` (record button on every mode), `lib/babylon/audio/SoundKit.ts` (`captureMix` taps the existing mix), and a `data-touch-deck` attribute on `lib/babylon/ui/TouchOverlay.tsx` so stream mode can hide the pad. Does not own `lib/pose/**`, `DunkMode.ts`, `schema.prisma`, or `lib/db.ts`. | none |
| **adult-optin-ab04** | `lane/adult-optin-ab04` (PR into `lane/finish-release`) | Cursor cloud agent | Adult opt-in for jump numbers, Prove It, and re-screen history: `ScanSaveOptIn`, `lib/privacy/scanSaveOptIn.ts`, `scanSaveConsent.ts`, `scanSaveRecord.ts`, `numberScan.ts`, `coachShare.ts` (`adultOptedInAndSharedWithCoach`), `screenHistoryClient.ts`, `components/privacy/**`, `app/api/account/scan-save`, `scan-history`, `coach-share`, `app/api/mirror/prove-it`, `app/api/mirror/screen-history`. Wiring in the dunks route, dunk-film, Prove It, the Quick Screen adult branch, `/account`, and session booking. Does not own `lib/db.ts`. | :3341 (`NEXT_DIST_DIR=.next-adult-optin`, server not left running) |
| **coach-admin-gate** | `cursor/coach-admin-gate-707c` (PR into `lane/finish-release`) | Cursor cloud agent | Role-gate `/coach/admin` with the admin routes' `requireAdmin`, and coach-or-admin reads on `GET /api/coach/exercises` and `GET /api/coach/categories`. `lib/admin/requireAdmin.ts`. Does not own `lib/db.ts`, `lib/auth.ts`, or `GET /api/coach/catalogue` (published drills stay available to any signed-in user). | none |
| **screen-jump-only** | `cursor/screen-jump-only-6725` (PR into `lane/finish-release`) | Cursor cloud agent | Jump-only Quick Screen, then the rest of the screen reuses that jump: `app/screen/page.tsx`, `app/screen/screen-start.tsx`, `app/play/mirror/assess/**` (shared with mirror-assess), `lib/screen/**`, `lib/assess/runner.ts` (JUMP_PARTS / prior tests only). Intake answers on this device: `lib/health/intakeMemory.ts`, `lib/health/intakeForget.ts`; wiring in `app/play/mirror/_components/health-intake-gate.tsx` (mirror-coach's mount) and `components/account/account-settings.tsx` (account-data-home). Uses AGE-RESET `resetAge` / `lockAge` and `verifiedAdult` via `canWriteHealth`. No `lib/db.ts`, no schema, no new dependency. | none |

**Worktrees that are not lanes.** Nobody develops in these. Never run a dev server, test or script in the two deploy
trees: their env files point at production (section 4).

| Worktree | Checked out | What it is |
|---|---|---|
| `deploy-wt` | detached `711658e9` | A deploy tree (real `npm ci`, a copy of the lane's `.env.local`). The music note says "Music deploys go from deploy-wt". `.env.local` points at **production**. |
| `mode-lanes/wt-webapp-deploy` | detached `3a0f4edf` | The deploy tree of the 20:38 deploy ("`.env.production` deploy-only"). `.env.production` points at **production**. |
| `wt-parent` (in venice-env-2's session scratchpad under `/private/tmp`) | detached `3a0f4edf` | venice-env-2's A/B tree. Serves :3101 (`next dev`, started 20:43). |
| `hm3-wt` (in the hoops-motion session's scratchpad under `/private/tmp`) | detached `0db76ae4` | The earlier copy of hoops-motion phase 3, on `fbb1f66d`. Its patches match `lane/hoops-motion`'s. Serves nothing. |
| `copilot-worktrees/…/finalevolutionus-automatic-carnival` | detached `3a0f4edf` | The owner's :3000 tree (below). Its `node_modules` is the one every symlinked lane uses (section 6). |
| the primary checkout `final-evolution-lab-2026-05-12_23-15-57` | `main` at `76bb36d1` | Stale (section 7). |

- **:3000 belongs to the owner** (a `next start` in the automatic-carnival worktree on `fel_dev`, with a public tunnel
  in front of it). No lane uses it.
- **Ports collide today.** :3131 is recorded by mirror-coach, qa-fixes and Gate Crasher MAJOR. :3100 is recorded by
  econ-harden, Gate Crasher POLISH-2, both Venice lanes and every staged tip, and venice-env-2's `next dev` holds it
  now. Before you start a server, run `lsof -nP -iTCP:<port> -sTCP:LISTEN`. If the port is taken, pick a free one and
  fix your row in your PR.
- **Standing links between lanes:** movement-play phase 5 (dunk by body) waits for hoops-motion phase 3 (`DunkMode`).
  Movement-play phase 6 waits for the hoops pass. Movement-play phase 9 waits for music phase 7 (`DanceMode`).
  Mirror-coach phase 4 registers its audits in mirror-assess's T-registry (owner decision #30).
- **Not in this repo:** cell-server (`~/Developer/cell`, :11500) and offline-stack (`~/Developer/offline-stack`,
  Ollama on :11434). Neither has a git remote.

_Sources: `git worktree list`, `git branch -vv`, `git reflog lane/hoops-motion`, `git -C hm3-wt reflog`, `git patch-id`,
`git ls-remote --heads origin`, `git show` of each lane's commits; `lsof`, `ps` (server cwd and start time); briefs
`~/Claude/inbox/LANE-*.md`, `PASTE-NOW-*`, `NO-REPASTE.lock` (venice-env-2's session id, which names the `wt-parent`
scratchpad); outbox plans and status files (movementplay/p4, p7, p8 plans; hoopsmotion READMEs; musicsuite BASELINE and
PLAN; painfree/PLAN; `GATE-CRASHER-*.md`, `DUNK-VENICE-ENV-RENDER.md`, `WEBAPP-LIVE-3a0f4edf.txt`,
`TIP-EYE-LIVE-3a0f4edf.txt`); session notes on each pass, `project_fel_hoops_motion_pass` (phase 3 landing as
`lane/hoops-motion` in `land-wt`), `project_fel_firebase_deploy` and `project_fel_music_suite_parallel` (deploy-wt)._

---

## 3. Shared files

**The rule**

1. Find the holder, in section 2 or the table below. A finished lane holds nothing.
2. **Don't edit a file another lane holds.** Write the proposed change (evidence, then a fenced diff) to
   `~/Claude/outbox/<your-lane>-routed.md`, and name it in your PR body. The holder applies it. (This is how
   qa-fixes worked.)
3. For a file nobody holds, or one the holder lets you into: first run
   `git log origin/lane/finish-release -3 --format='%h %ar %s' -- <file>`. If it changed in the last 24 hours, route
   instead. Otherwise keep the change small and additive: no reformatting, renames or moves. Put new UI in new files
   and keep the shared diff to the wiring.
4. List every shared file you touched in your PR body, with one line on why.

**Always ask the owner first**

- `prisma/schema.prisma` and `public/_prisma/**`. Changing what deploys is on the `/CLAUDE.md` stop-and-ask list.
  Schema changes are additive only. `public/_prisma/client` is a committed deploy artifact: `npm ci` and the build
  rewrite `{edge,index}.js` (and `yarn.lock`) with this machine's paths. Run
  `git checkout -- public/_prisma/client yarn.lock` and never commit those rewrites.
- `package.json` and the lockfiles. Adding a dependency is on the stop-and-ask list.

**Files more than one lane has touched since 2026-09-24, or that a staged tip targets**

"(staged)" marks a tip that has not landed (section 7). "`lane/hoops-motion`" is hoops-motion phase 3, rebased onto
`59ff7e11` and not pushed yet.

| File | Holder | Also touched by |
|---|---|---|
| `lib/babylon/core/ModeHarness.ts` | movement-play | `lane/hoops-motion` (+1); ECONOMY-CAPS (k) gates the `__FEL_DEV__`/`__FEL_QA__` hooks (staged) |
| `lib/input/**`, `lib/pose/**`, `lib/move/**` | movement-play | ECONOMY-CAPS (k): the hooks in `lib/input/poseSource.ts`, `lib/pose/PoseService.ts` and `feed.ts`, `lib/move/bodyPlay.ts` (staged); SKATE-SCORE may add a shared GC-13 helper, candidate `lib/input/rideProfiles.ts` (staged) |
| `lib/babylon/anim/CharacterAnimator.ts`, `lib/babylon/anim/**` | the hoops-motion / movement-play session | `lane/hoops-motion` (+55 −5 in CharacterAnimator, and a new `CharacterAnimator.reentry.test.ts`) |
| `lib/babylon/anim/authored/index.ts` | none recorded | Gate Crasher `3a0f4edf`; `lane/hoops-motion` (+2 −1) |
| `lib/babylon/modes/DunkMode.ts` | hoops-motion | hoops-motion `23079bdb` and `lane/hoops-motion` (+12 −18); movement-play phase 5 waits for it; HOOPS-POLISH-1 (dunk contest logic and HUD, staged); ECONOMY-CAPS (k) (staged) |
| `OneVOneMode.ts`, `carnivalEvents.ts` and its test | hoops-motion | `lane/hoops-motion` (+109 −37 in OneVOneMode); qa-fixes (unmerged); HOOPS-POLISH-1 (staged); ECONOMY-CAPS (k) (staged) |
| `ThreeVThreeMode.ts`, `ThreePointMode.ts` | hoops-motion | HOOPS-POLISH-1 (3v3 kits, 3PT difficulty, staged); ECONOMY-CAPS (k) (staged); qa-fixes' caution list |
| `components/games/game-shell.tsx` | a caution file; qa-fixes holds the header badge | `9bfc68ac`, `3647d63a` (Brain Brawl and the shell); econ `a1a1c5f9`; qa-fixes (unmerged, +44); ECONOMY-CAPS (k): the `?agent=1` readers (staged) |
| `components/games/boot-splash.tsx` | none recorded; a caution file (qa-fixes brief) | hotfix `220a87b1`; movement-play `b08b3a3d`, `b440b737`; `3647d63a`; Gate Crasher `46a8dc6a`; FONT-SHARED (staged) |
| `components/games/board-babylon.tsx` | none recorded (Gate Crasher held it; finished) | movement-play P3 `b08b3a3d`; Gate Crasher `46a8dc6a`, `3a0f4edf` |
| `app/api/sessions/route.ts`, `lib/sessions-route.test.ts` | econ-harden; music holds the endless-cap region | music `8346808f`, `176c5e1e`, `a8035176`; `3647d63a`; econ `a1a1c5f9`; econ-harden-2 (unpushed; changed on both sides); ECONOMY-CAPS (items a, b, k, SK-4, HP-9, staged). The music merge `d31eba5d` reconciled this region once. |
| `lib/sessions/*` | econ-harden | audit hotfixes `110560be`, `7ee51e4e`; econ `a1a1c5f9`; econ-harden-2; ECONOMY-CAPS (`modeScoreRules` MEASURED_RUNS, `runEligibility` FEL_TEST_ACCOUNTS, staged). DAILY-KEY-HOTFIX imports `runEligibility` only. |
| `lib/wallet/*` | none recorded (music holds `dead-buys.ts`) | audit `09ac9218`, `3bc48eae`, `7ee51e4e`; music `8346808f`, `a8035176`; mirror `dbb4e91c`; `9bfc68ac`; econ `a1a1c5f9`; qa-fixes `client.ts` (unmerged); DAILY-KEY-HOTFIX (`wallet-service.ts` `earn()`, `reward-rules.ts`, a new `dailyKey.ts`, staged); ECONOMY-CAPS (staged) |
| `app/api/wallet/earn/route.ts`, `app/api/v1/wallet/earn/route.ts`, `components/dual-wallet-chip.tsx`, `lib/economy.ts` | none recorded | DAILY-KEY-HOTFIX (staged); ECONOMY-CAPS builds on it (staged) |
| `lib/prq.ts` | split by region: music (the room rows and the accuracy-scaled rooms), mirror-coach (the recovery lines), movement-play (`PRQ_CAMERA_SOURCE`) | movement-play `71ea8f30` (2026-09-24 17:05); music `8346808f` |
| `prisma/schema.prisma`, `public/_prisma/**` | the owner (stop-and-ask) | audit `125a5a9f`, `110560be`; mirror `9f0bfbd5`, `ac1b3a74`; econ `a1a1c5f9`; book-shop and creator (unmerged, **in conflict**) |
| `lib/db.ts`, `package.json`, `next.config.js` | the owner (a new dependency is stop-and-ask) | DB-CONNECTOR: adds `@google-cloud/cloud-sql-connector`, puts the connector path in `lib/db.ts`, and may touch `next.config.js` (staged) |
| `app/layout.tsx`, `app/theme.css` | none recorded | FONT-SHARED (staged). SCREEN-SHIP is told not to change them. |
| `lib/policies.ts` | movement-play §6, mirror-coach §5 | movement-play `b440b737` |
| `DanceCore.ts`, `danceTracks.ts`, `bodyTargets.ts` | movement-play | music `8346808f` (DanceCore) |
| `lib/mp/match-core.ts` | music | qa-fixes (unmerged) |
| `lib/assess/**`, `app/play/mirror/assess/**` | mirror-assess (PR #20) | SCREEN-SHIP: cherry-picks PR #20's 13 commits, then edits the graders, `scoring.ts` and `thresholds.ts` (staged) |
| `lib/mirror/*`, `lib/coach/mirrorToProgram.ts`, `components/mirror/screen-next-steps.tsx` | mirror-coach | SCREEN-SHIP: preview labels only, "Don't change PR #22's grading logic or values" (staged) |
| `app/play/mirror/_components/mirror-harness.tsx` | mirror-coach | mirror-coach `dbb4e91c`, `9f0bfbd5`, `42c5e8a0`, `d7f25621`; movement-play `0b6b7b41`; qa-fixes PR #19 `7983d909` (unmerged, **changed on both sides**: qa-fixes merges `origin/lane/finish-release` into its branch before PR #19 lands) |
| `lib/mirror/screenRunner.ts` | mirror-coach | mirror-coach `dbb4e91c`, `42c5e8a0`, `d7f25621`. movement-play reads `ABANDON_MS` from it (`lib/drills/DrillRunner.ts` sets `RESTART_PHASE_MS` from it), so a change to `ABANDON_MS` goes past movement-play first |
| `components/games/timing-babylon.tsx`, `lib/arena-score-integrity.test.ts` | none recorded | qa-fixes (unmerged); changed on both sides since `a1a1c5f9` |
| `components/games/gameShellPlay.scan.test.ts` | none recorded | econ-harden-2 and qa-fixes (both unmerged) |
| `lib/babylon/nexus/veniceBoardwalk.ts`, `lib/babylon/visual/CourtSurface.ts` | venice-env-2 | Venice `9096d7cf`; venice-env-2 (uncommitted, with new tests) |
| `lib/babylon/visual/venuePropSets.ts` | venice-env-2 (Gate Crasher held the `'slope'` set; finished) | Gate Crasher `46a8dc6a`; Venice `9096d7cf`; venice-env-2 (uncommitted) |
| `lib/babylon/modes/SnowboardSlalomMode.ts` | movement-play (a phase 8 target) | Gate Crasher `46a8dc6a`, `3a0f4edf`; movement-play `6567dc3e` resolved two name collisions; ECONOMY-CAPS (k): the prod `__FEL_DEV__.snow()` hook (staged). SKATE-SCORE and SCREEN-SHIP are told to stay out of it. |
| `SkateRunMode.ts`, `boardCore.ts`, `BoardTricks.ts`, `VelocityKartMode.ts` | movement-play (phase 8 targets) | movement-play `6567dc3e`; SKATE-SCORE (also `TrickPose.ts`, `rideTricks.ts`, `skatePlaza.ts`, staged); ECONOMY-CAPS (k): the `__FEL_DEV__` lines in SkateRunMode (staged) |

_Sources: `git log --since='2026-09-24 00:00' origin/lane/finish-release`; `git diff --numstat 59ff7e11 lane/hoops-motion`;
`git diff` and `comm` of each unmerged branch against its merge base; `git status` of the shared checkout; the SCOPE and
OUT OF SCOPE blocks of the staged `~/Claude/inbox/PASTE-NOW-*.txt` briefs; `~/Claude/inbox/LANE-QA-FIXES.md` (caution
files, routing); `~/Claude/outbox/qa-fixes-routed.md`; session notes `project_fel_music_suite_parallel`,
`project_fel_mirror_coaching_pass` (the `lib/prq.ts` regions), `project_fel_book_shop_lane`._

---

## 4. Deploys and production data

**Deploys**

- Deploys come only from `lane/finish-release`, after the owner has merged, and are run by the owner or by the one
  deploy owner the owner names for that deploy. Lanes never deploy: no `firebase deploy`, no hosting or channel
  pushes.
- **Never push `main`.** `/CLAUDE.md` calls `main` the deploy branch ("a push ships"). The repo has no deploy
  workflow, though: `.github/workflows/ci.yml` only checks. The deploys on record were run by hand from worktrees of
  `lane/finish-release` commits. Both facts stand until the owner says otherwise.
- How the deploy owner deploys: `npx -y firebase-tools@latest deploy --only hosting --project final-evolution-lab --force`
  - from a real checkout at a plain path (not a session scratchpad, and not a symlinked `node_modules`);
  - from a worktree no server is serving `.next` from;
  - from a tree that holds the **production** env file. The packager ships the tree's env files with the function
    (the deploy note lists `.env` and `.env.local`). A tree whose env points at 127.0.0.1 ships a site with no
    database: the 2026-09-15 deploy did, and login and saves died. The two deploy trees in section 2 hold the
    production env; the 20:38 deploy of `3a0f4edf` went from `wt-webapp-deploy` and its deploy-only `.env.production`;
  - after `git checkout -- public/_prisma/client yarn.lock`, so the upload matches the commit.
  - `.firebase/` holds a copy of `.env.local`. Never commit it.

**Production data**

These three files point at **production Cloud SQL** (both `DATABASE_URL` and `DIRECT_URL`). They were found by
counting matches of the production host in every worktree's `FEL-full-app/.env*` at 23:20, without printing a value.
No other worktree's env files match.

| File | What reaches production |
|---|---|
| `mode-lanes/wt-finish-release/FEL-full-app/.env.local` | `next build`, `next start`, and any script or Prisma command that reads `.env.local`. (`next dev` there loads `.env.development.local`, a 127.0.0.1 database, ahead of `.env.local`. Don't rely on that.) |
| `deploy-wt/FEL-full-app/.env.local` | Everything: `next dev`, `next build`, `next start`, scripts and tests. There is no `.env.development.local` in that tree. |
| `mode-lanes/wt-webapp-deploy/FEL-full-app/.env.production` | `next build` and `next start`. |

- Don't copy these files into a lane, and don't edit them. Run nothing in `deploy-wt` or `wt-webapp-deploy` except a
  deploy the owner named.
- Give every test, script and dev server `DATABASE_URL` and `DIRECT_URL` inline, pointing at a throwaway database on
  127.0.0.1:5432 (not `fel_dev`), or use mocks. Build the throwaway with `createdb -h 127.0.0.1 <name>`, then
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`, then
  `prisma db execute --url <tmp> --file <that script>`, then `prisma/wallet-constraints.sql`. Never run
  `prisma db push` or `migrate`: they read the env.
- **A production schema change happens only with the owner**, in this order:
  1. **Preview**, read-only:
     `npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/prod-diff.sql`.
     Diff it against the lane's reviewed SQL. If it shows anything more, production is behind another lane's
     change too: stop and review.
  2. **Apply** exactly the reviewed file: `npx prisma db execute --url "$PROD_DIRECT_URL" --file <reviewed.sql>`.
  3. **Verify:** the same `migrate diff` now prints an empty migration.
  - Apply it before the deploy that needs it. The PR carries the reviewed additive SQL and a rollback line.

_Sources: `/CLAUDE.md`; `.github/workflows/ci.yml`; `grep -c` of the production host and of the variable names in each
env file; `node_modules/@next/env/dist/index.js` (env file load order); session notes `project_fel_firebase_deploy`
(what the packager copies; the 2026-09-15 deploy), `feedback_fel_throwaway_db_and_gate_server` (the production host);
`~/Claude/outbox/WEBAPP-LIVE-3a0f4edf.txt`; `~/Claude/outbox/ECONOMY-SESSIONS-HARDEN-DEPLOY-UNBLOCK.md`; lane briefs._

---

## 5. Capacity

This Mac is shared by every lane and by the owner's live session (24 GB RAM).

- **At most 3 dev servers across all lanes at once**, not counting the owner's :3000. Check first with
  `lsof -nP -iTCP -sTCP:LISTEN | grep node`.
- **One probe browser per lane.** Close it when the run ends.
- **Take the heavy lock** for `tsc`, a full vitest run, the full ci-suite, `next build`, an install, and a dev
  server's start-up:
  ```
  mkdir -p ~/Claude/locks; until mkdir ~/Claude/locks/heavy 2>/dev/null; do sleep 30; done; <step>; rmdir ~/Claude/locks/heavy
  ```
  This is the widest scope any session uses, so every session's assumption holds. The mirror note says "Full suites +
  dev servers take the shared mutex". ECONOMY-SESSIONS-HARDEN held it "for the gate and the :3100 server". The staged
  tips take it around "heavy builds, tsc and vitest sweeps". **assumption:** a dev server holds the lock through its
  start-up compile only (until the first page has compiled), because holding it for the server's whole life would
  block every other lane's gate. The owner may pick another scope.
  Release it even if the step fails. Never break someone else's lock. If it has been held for more than 45 minutes,
  say so in your status and keep waiting. A targeted single-file vitest run needs no lock.
- **Each dev server gets its own dist dir** (`NEXT_DIST_DIR=.next-<lane>`). At the end of a phase, stop the server and
  delete its dist dir.
- **Disk floor: 12 GB free.** Run `df -h /` at the start and end of every session. Below 12 GB, stop and clean your own
  regenerable output. A full disk kills the Bash tool itself (ENOSPC) and poisons a running dev server's cache.
- **Never age-sweep a live server's chunks.** `next dev` writes its core chunks once, at start. Deleting them makes
  every page 404 until the server restarts. To free space, stop the server and delete its whole dist dir.

_Sources: lane briefs `~/Claude/inbox/LANE-*.md` (RAM, heavy lock, 12 GB floor); staged briefs `PASTE-NOW-*.txt` (their
lock scope); `~/Claude/outbox/ECONOMY-SESSIONS-HARDEN.md`; session notes `project_fel_mirror_coaching_pass`,
`project_fel_music_suite_pass`, `project_fel_disk_hazard`._

---

## 6. Starting a new lane

1. Check the registry (section 2). Name the files you will own, and make sure no other lane holds them.
2. Create the branch and worktree, with **no upstream**:
   ```
   git -C ~/Developer/FEL-swarm/mode-lanes/wt-finish-release fetch origin
   git -C ~/Developer/FEL-swarm/mode-lanes/wt-finish-release worktree add --no-track -b lane/<name> \
       ~/Developer/FEL-swarm/lanes/<name> origin/lane/finish-release
   ```
   If the branch already exists locally or on origin, stop and ask.
   Why `--no-track`: without it the new branch tracks `lane/finish-release`. `lane/econ-harden-2`,
   `lane/hoops-motion` and `lane/lanes-registry` all do (`git config branch.<name>.merge` =
   `refs/heads/lane/finish-release`). Today `push.default` is unset, so git's default refuses a bare `git push`
   when the names differ. Under `push.default=upstream`, a bare `git push` would write to `lane/finish-release`. If
   your branch already tracks it, run `git branch --unset-upstream`, or push once with
   `git push -u origin lane/<name>`, which moves the upstream to your own branch.
3. Set up `FEL-full-app/`. Either run `npm ci` under the heavy lock (then `git checkout -- public/_prisma/client
   yarn.lock`), or symlink `node_modules` to `mode-lanes/wt-finish-release/FEL-full-app/node_modules`.
   - **A symlinked lane never runs `npm ci`, `npm install` or anything else that writes `node_modules`.** The chain
     ends in the owner's live tree: `wt-econ-harden`, `wt-music`, `wt-mirror` and `land-wt` link to wt-finish-release's
     `node_modules`, which links to `automatic-carnival/FEL-full-app/node_modules`, the tree behind the owner's :3000
     `next start`. An install there rewrites the owner's live modules and every symlinked lane's.
   - A lane that needs a package (after the owner approves the dependency) uses its own real `node_modules`, as
     `lanes/qa-fixes`, `lanes/mirror-realtime`, `lanes/book-shop-merge`, `lanes/creator-platform` and `deploy-wt` do.
   - Don't copy `.env.local` from the shared checkout: it points at production.
4. Pick a free port (section 2) and a dist dir `.next-<name>`. Serve with a throwaway database inline (section 4).
5. Record a baseline: tsc, ci-suite and vitest counts before you change anything (section 1, step 3, with the yarn
   shim). A new lane cut from `origin/lane/finish-release` starts at zero failures.
6. Add your row to section 2 in your first PR.
7. Work in phases. Each green phase: gate, push the lane branch, open the PR, stop (section 1).
8. End every session by stopping your servers, deleting your dist dir, and noting `df -h /`.

_Sources: `git config --get-regexp '^branch\.lane/'`, `git config push.default` (unset); `git worktree add -h`
(`--no-track`); `readlink` of each worktree's `FEL-full-app/node_modules`; `lsof` and `ps` for :3000's tree._

---

## 7. State at 2026-09-28 23:20 PDT

- `origin/lane/finish-release` is at `59ff7e11` (the merge of PR #22). `origin/main` (`bc91f794`) is an ancestor of it.
- **Live is behind the lane.** final-evolution-lab.web.app runs `3a0f4edf`, deployed at 20:38 from
  `mode-lanes/wt-webapp-deploy`. The lane is 11 commits ahead, so music phases 4–6 and mirror phases 1–3 are not live.
- **Pushed, PR open:**
  - #17 book-shop: open, 2 ahead. It merges only when the owner says the movement session is done. It conflicts with
    the lane in `prisma/schema.prisma` and 8 `public/_prisma` files (the lane side is `a1a1c5f9`, SessionRun and
    SessionGrant).
  - #18 creator-platform → `feature/book-shop`: draft, 3 ahead. It adds `firebase-admin@^14.5.0`, a new dependency,
    which needs the owner.
  - #19 qa-fixes: draft, 40 ahead. `mirror-harness.tsx`, `timing-babylon.tsx` and `arena-score-integrity.test.ts`
    changed on both sides.
  - #20 mirror-assess: draft, 13 ahead. No file changed on both sides.
- **Not pushed:**
  - hoops-motion phase 3: `lane/hoops-motion`, created at 23:17 in `land-wt` by applying the four phase-3 commits onto
    `59ff7e11`: `d58adfbf`, `bab2e149`, `ded8020b`, `1ebaed1f` (65 files). It is the first PR of the new model once
    pushed. The earlier copy (`1ddade90`, `93b5e25d`, `2bba5520`, then `e72810e1` → `1f515387` → `0db76ae4` as 3d was
    amended) sits detached in `hm3-wt`, a session scratchpad; its patches match. Until the branch is on origin, both
    copies are local only.
  - econ-harden-2 `8e9fe034`: 1 ahead, 16 behind. The owner said "push 8e9fe034 now" at 13:55; it is not on origin.
    Under the 22:45 rule that push is `git push -u origin lane/econ-harden-2` plus a PR into `lane/finish-release`
    that the owner merges, not a push onto the lane. The branch was never pushed, so the econ session may rebase it
    onto `origin/lane/finish-release` first. `app/api/sessions/route.ts` and `lib/sessions-route.test.ts` changed on
    both sides.
  - venice-env-2: uncommitted in the shared checkout (`veniceBoardwalk.ts`, `CourtSurface.ts`, `venuePropSets.ts` and
    its test, two probes, two new tests, `public/models/props/venice/env2/`, `.claude/launch.json`). `tsconfig.json`
    is modified there too; the briefs call it the owner's parked change. Its brief (pasted 19:38) says to commit there and have an operator push, which predates
    the no-commit rule. The owner decides where it lands.
- **Staged tips: the next writers to `lane/finish-release`.** Seven briefs in `~/Claude/inbox`, all staged before the
  owner's 22:45 decision, none landed (`git log --all --grep` finds none of them, and none has an outbox report). Each
  says `Worktree: mode-lanes/wt-finish-release`, `Branch: lane/finish-release`, commit locally, and "The Mini operator
  does the fetch, rebase, tsc/vitest and fast-forward push". **The Mini operator** is the role that fast-forward
  pushes `lane/finish-release` for these tips. That path breaks both "nobody commits in the shared checkout" and "the
  owner merges".
  **The owner decides, per tip,** whether it is re-cut onto its own lane branch with a PR, or lands through the Mini
  operator under an explicit owner exemption written into this file. Pasted as written, each one commits in the
  shared checkout. The queue
  in the briefs (Cyber, 22:10): ENV-2 → DAILY-KEY-HOTFIX → DB-CONNECTOR → SCREEN-SHIP → HOOPS; ECONOMY-CAPS lands after
  DAILY-KEY-HOTFIX; FONT-SHARED after SKATE-SCORE.

  | Tip (staged) | What | Files another lane holds (section 3) | Approval the brief records |
  |---|---|---|---|
  | DAILY-KEY-HOTFIX (20:52) | "URGENT": a forged daily key pays a second daily reward on production | `lib/wallet/*` (`earn()`, `reward-rules.ts`, a new `dailyKey.ts`), both earn routes, `dual-wallet-chip.tsx`, `lib/economy.ts`. `app/api/sessions/**` is out of its scope. | none |
  | ECONOMY-CAPS (20:45) | measured score caps; daily verify; the dev-hook strip (k) | econ-harden's `lib/sessions/*` and `app/api/sessions/**`; movement-play's `ModeHarness.ts`, `lib/input/poseSource.ts`, `lib/pose/*`, `lib/move/bodyPlay.ts` and the hook lines of 19 mode files, including `SnowboardSlalomMode.ts` and the hoops modes; `game-shell.tsx`; `lib/wallet/*` | none |
  | DB-CONNECTOR (22:11) | the Cloud SQL connector path in `lib/db.ts` | a new dependency `@google-cloud/cloud-sql-connector` in `package.json` (stop-and-ask); `lib/db.ts`; maybe `next.config.js`. `firebase.json` is out of its scope. | "approved by Elijah at 9:53 PM PT" |
  | SCREEN-SHIP (22:11) | ships the Quick Screen: `git cherry-pick -x e6745f5c^..978ee7fd` (PR #20's 13 commits) plus one commit | mirror-assess's `lib/assess/**` and `app/play/mirror/assess/**`; labels in mirror-coach's `lib/mirror/*`, `lib/coach/mirrorToProgram.ts`, `screen-next-steps.tsx` | "Push approved by Elijah 9:35 PM PT (cherry-pick PR #20 + push with tip)" |
  | HOOPS-POLISH-1 (19:09) | 3v3 kits, 1v1 strip grace, charge overlap, dunk contest logic, 3PT difficulty | hoops-motion's `OneVOneMode`, `ThreeVThreeMode`, `ThreePointMode`, `DunkMode` | none |
  | FONT-SHARED (19:09) | shared font loading | `app/layout.tsx`, `app/theme.css` (no holder); `boot-splash.tsx` (a caution file) | none |
  | SKATE-SCORE (17:39) | skate trick scoring; body-mode HUD for skate and kart | movement-play's phase 8 targets `SkateRunMode`, `boardCore`, `BoardTricks`, `VelocityKartMode`; maybe a helper in `lib/input/rideProfiles.ts`. `SnowboardSlalomMode.ts` is out of its scope. | none |

  - **Flag: SCREEN-SHIP's cherry-pick bypasses the owner's merge of PR #20.** PR #20 is a draft that says "Elijah
    merges". The brief says "PR #20 won't show as merged on GitHub. The operator closes it pointing at the picks". It
    records an owner approval at 21:35, which predates the 22:45 decision. The owner confirms which one stands.
  - DB-CONNECTOR's recorded approval (21:53) also predates the 22:45 decision, and its new dependency is on the
    stop-and-ask list.
  - `PASTE-NOW-BOOKS-REWRITE.txt` (22:07) is not a repo tip. It runs in `~/Claude/books/art-of-dunking/` and never
    touches a FEL worktree.
- **Fully merged:** music-suite (#21), mirror-coach (#22), and the old local branches `lane/ledger` and `lane/rc`.
- **Stale:** the primary checkout's local `main` is `76bb36d1` ("Initial check-in"), 1,181 commits behind `origin/main`.
- **Machine:** servers on :3000 (the owner's `next start`, automatic-carnival), :3100 (venice-env-2's `next dev` in the
  shared checkout, started 19:43; its brief requires an inline throwaway database) and :3101 (`next dev` in `wt-parent`,
  started 20:43), plus Ollama on :11434. :3098 is no longer listening. 46 GiB free. The heavy lock was free until this
  lane's gate took it at 23:21; it released it at 23:27.

_Sources: `git ls-remote`, `git rev-list --left-right --count`, `git merge-base --is-ancestor`, `git worktree list`,
`git branch -vv`, `git reflog`, `git status`, `git log --all --grep=<tip>`; `gh pr list --state all`; `lsof`, `ps`, `df`;
`~/Claude/inbox/PASTE-NOW-*.txt` (headers, SCOPE, OUT OF SCOPE, queue lines), `~/Claude/inbox/NO-REPASTE.lock`;
`~/Claude/outbox/WEBAPP-LIVE-3a0f4edf.txt`; session notes `project_fel_economy_sessions_harden`,
`project_fel_hoops_motion_pass`, `project_fel_book_shop_lane`; `~/Claude/outbox/creator-platform-status.md`._
