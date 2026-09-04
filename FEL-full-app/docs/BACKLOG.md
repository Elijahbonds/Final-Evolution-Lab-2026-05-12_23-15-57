# Backlog — scope drift and open items

Opened 2026-09-04 by the ledger lane (`docs/CONTRACTS-PASS4-RUN.md`). One line per item: what, why it is open,
and the file it belongs to. Seeded from `docs/SHIP-PASS-4.md` and `docs/SHIP-PASS-3.md` findings; the other lanes'
"did NOT do" reports are appended under **From the run**. Nothing here is a contract change — those route to the
orchestrator.

## Venues and bounds

| # | Item | Why open | Belongs to |
|---|---|---|---|
| B1 | `coastal-links` and `venice-blacktop` navmesh bakes fail Recast's heightfield | neither is under a mode's play right now (golf keeps its kit green; blacktop is intentionally unmounted) so it was deferred | `scripts/venue/navmesh-gen.mts`, `lib/map-data.ts` |
| B2 | Kit venues have no navmesh — dunk (4 clamps), karate (3), football (4), skateboard (3), derby (1), dunkduel (5) still bound by typed boxes | the bake reads a map mesh; kit venues are procedural and have no mesh to bake | `scripts/venue/navmesh-gen.mts` (a kit-ground bake or a spec-core-only JSON), the six mode files |
| B3 | Snowboard slalom captures as a whiteout (pre-existing, identical in the 2026-09-03 sweep) | piste fog/exposure needs its own look; not from the pass 4 changes | `lib/babylon/modes/SnowboardSlalomMode.ts`, `lib/babylon/modes/rideWorlds.ts` |
| B4 | Kenney vertex-coloured trees read teal under the spec lighting, green in kit venues (skatepark) | hemispheric/IBL colours vs vertex colours not yet checked; owner asked for it before phase 9 | `lib/babylon/visual/VenueProps.ts` (material switch), `lib/babylon/nexus/NexusWebScene.ts` lighting |
| B5 | Golf framing probe reads 0.048 (40 px hero) and disagrees with the frame | the sample lands in the hole-reveal cinematic; re-measure at address before tuning | `scripts/probes/_cam-frame.mts` (sample moment), `lib/babylon/config/cameraFraming.json` |
| B6 | `public/models/maps/baked/*.glb` and its manifest were rewritten twice (10:18, 11:22) by an unidentified writer, both coinciding with a vitest run | no test, suite script or package hook references the map pipeline; restored from HEAD; only a tripwire exists | `scripts/gauntlet.sh` (WARNING row), `scripts/map/pipeline.mts` (manifest now merges) — the writer is still unknown |
| B7 | `gridiron.glb` and `sand-court.glb` carry no textures, so football and volleyball keep procedural venues | the pipeline refuses them as grey soup | `lib/map-data.ts`, `scripts/map/pipeline.mts` |
| B8 | Golf spec ground renders pale mint under the venue grade whatever the sky (three environments tried) | golf hides the spec ground and keeps the kit field; root cause not found | `lib/babylon/nexus/venueSpecs.ts` (`golf_loop`), `lib/babylon/nexus/NexusWebScene.ts` |
| B9 | Board modes' venue mounts are invisible to the matrix (delegated through `BoardRunMode`) | the generator judges a mode by its own file slice | `scripts/full-picture.mts` |
| B10 | Dead twins still on disk: `BoardRunMode.ts`, `GolfMode.ts`, `BaseballMode.ts`, `SoccerMode.ts` (registry serves `SkateRunMode` / `SnowboardSlalomMode` / `SurfBreakMode` / `precisionModes`) | found "the hard way" in phase 2; not deleted this pass | `lib/babylon/modes/registry.ts` and the four files |
| B11 | Skatepark navmesh samples 87 % uncovered (bowls) | that mode plays on its kit, so accepted; blocks B2 for skate | `scripts/venue/navmesh-gen.mts` (`PLAY_CORE` has no `venice-skatepark`) |
| B12 | The mounter transform (glTF x-mirror → rotation → scale → offset → surfaceY) is duplicated in the bake and in `VenueMaps` | two copies of one transform will drift | `scripts/venue/navmesh-gen.mts`, `lib/babylon/visual/VenueMaps.ts` |

## Menus, wiring, rollout

| # | Item | Why open | Belongs to |
|---|---|---|---|
| B13 | Sprint is disabled in the rollout (`ENABLED_BABYLON_MODES` has no `'sprint'`; retired from the v1 roster 2026-09-01), so its new pause overlay is unexercised by any sweep | the probe can open `/play/sprint` but no gauntlet row covers it | `lib/babylon/modes/SprintMode.ts`, `scripts/gauntlet.sh` |
| B14 | Music, acting and IRL routes render outside `GameShell` by design (studio experiences with their own full-screen UI) | not sports modes; recorded so the "one shell" claim is read correctly | `components/games/acting-game.tsx`, the music and IRL routes |
| B15 | Phase 8 e2e proof done for karate VS only when written; the same probe "now runs across the other twenty playable routes" — results not in the findings log | proof per route is the phase 8 gate | `scripts/probes/_session-e2e.mts`, `docs/SHIP-PASS-4.md` |
| B16 | 13 of 16 game components draw their own "PAUSED — TAP TO RESUME" (now 16) instead of the shell drawing it once | consistency pass added the missing three; did not centralise | `components/games/*-babylon.tsx`, the shell |
| B17 | Phases 4 (mass model) and 5 (movement feel) not started — wait for owner sign-off under the physics rule | owner asks pending; phases 6–10 proceeded | `docs/SHIP-PASS-4.md` |

## Bodies, skins, wardrobe

| # | Item | Why open | Belongs to |
|---|---|---|---|
| B18 | Hero GLB mobile texture variant: the hero's own 2048² skin (21 MB) has no tier variant | a tier variant of the body file is "a separate decision"; perf lane may add `public/models/fel-hero.mobile.glb` | `scripts/avatar/import-mpfb.mts`, `lib/babylon/core/CharacterLibrary.ts` |
| B19 | Hijab hair asset — none in the CC0 packs; `hairStyles.ts` maps `'Hijab' → 'hijab'` but no `Hair_hijab` mesh ships on the kit bodies (sage wears the cap) | needs a custom mesh | `scripts/avatar/mpfb/dress-kit.py`, `lib/babylon/core/hairStyles.ts` |
| B20 | Sport-length shorts — both shorts slots wear `cortu_jeans_shorts` told apart by tint; no basketball-length shorts in the packs | asset gap | `scripts/avatar/mpfb/dress-kit.py` (`KIT.shorts`) |
| B21 | Female jean shorts clipping / fit on the female kit body | recorded as a residual after rung 3 | `scripts/avatar/mpfb/dress-kit.py`, `public/models/candidates/fel-kit-female.glb` |
| B22 | No sporting headwear or accessories in the packs — those two Closet slots stay procedural | asset gap | `lib/closet/wearable-catalog.ts`, `scripts/avatar/mpfb/dress-kit.py` |
| B23 | Kit body tri count 29,647 (body alone 26,756) vs the 25k advisory budget; way down is MPFB's low-poly proxy body | accepted for desktop; not addressed for mobile | `scripts/avatar/mpfb/dress-kit.py` |
| B24 | `skinFor()` always picks the male map (`sex === 'male'`) — sex was to arrive with the body roster | comment in code says "sex arrives with the body roster (rung 3)"; roster shipped, selector unchanged | `lib/babylon/core/playerIdentity.ts` (perf lane owns this file this run) |
| B25 | Mocap golf grip test still fails on the candidate (72 of 73 animation tests) | D-M1 closed for the shipped clip; one rig test left | `lib/babylon/anim/authored/`, `public/mocap/` |
| B26 | `dress-kit.py` hard-codes the MPFB user-data path under `/Users/elijahbonds/...`; five probe scripts hard-code the Chrome for Testing path under `chromium-1234` | reproducibility on another machine | `scripts/avatar/mpfb/dress-kit.py`, `scripts/probes/*.mts`, `scripts/capture-mode-play.mts` |

## Matrix gaps carried (from `docs/SHIP-PASS-4-MATRIX.md`, 26 at HEAD)

| # | Item | Why open | Belongs to |
|---|---|---|---|
| B27 | 12 enabled modes have no shared movement core (football, snowboard_slalom, surf, derby, penalty, golf, onevone, threevthree, carnival, karate_vs, mixedcombat, dunkduel use mode-local movement) | phase 5 movement feel deferred to sign-off (B17) | the mode files, `lib/babylon/core/gameFeel.ts` |
| B28 | 8 enabled modes have no baked map (football, skateboard, snowboard_slalom, surf, golf, volleyball, mixedcombat, dance) | procedural worlds ARE the gameplay for five; golf/volleyball/dance spec without map | `lib/babylon/nexus/venueSpecs.ts` (`VENUE_MAP_KEYS`) |

## From the run (lanes' "did NOT do", appended live)

- **15:07** (working trees, uncommitted) — nothing reported as "did NOT do" yet. Observed drift candidates:
  - **rc** `docs/CHANGELOG.md` says of phase 9 "the tier-aware `applySkinMap`, `textureBudget.json` and the budget test
    land through the perf and verify lanes" — a forward reference written before those land; if either lane stops short,
    the changelog line becomes untrue and must be edited at integration. Belongs to `docs/CHANGELOG.md` (rc).
  - **perf** `_vram-diag.mts` sweep defaults to `BASE=http://localhost:3005` (the perf lane's port per contract §6) — the
    single-mode form still defaults to `:3000`, the orchestrator's server. Two defaults in one probe; note for whoever
    runs it after the lanes close. Belongs to `scripts/probes/_vram-diag.mts` (perf).
  - **verify** `playerIdentity.test.ts` imports `skinMapUrl` from `./playerIdentity`, which does not exist on any branch
    yet — vitest on `lane/verify` alone fails to compile until `lane/perf` exports it; the integration order is
    perf before verify (or the two land together). Belongs to the orchestrator's integration step.
- **15:09** `lane/verify` `bd3284e` — did NOT (yet) write `docs/GATE0-REPORT-2026-09-04.md` (owned, in the acceptance row
  "Gate 0 PASS/FAIL reported"). Vitest on the lane is deliberately red (6 `skinMapUrl` cases) until perf lands — the
  integration must not read that red as a regression. Belongs to the orchestrator's integration step.
- **15:12** `lane/verify` `62e9777` — **Two Gate 0s.** Contract 5 (Mixamo 65-bone, `mixamorig` prefix) and
  `docs/AGENT-OPERATING-RULES.md` line 9/17 (22-bone unprefixed FEL spec; Mixamo is an import format normalised at
  load) describe different gates; `Gate0Validator.validateSkeleton` never runs against a GLB skeleton, so every shipped
  body (five GLBs, 22 joints, 0 prefixed) would FAIL it if it did. Verify lane changed nothing per "no rig migration
  this run". Decision belongs to the orchestrator/owner: which Gate 0 is the contract. Files:
  `docs/CONTRACTS-PASS4-RUN.md` §5, `docs/AGENT-OPERATING-RULES.md`, `lib/babylon/modes/Gate0Validator.ts`,
  `scripts/gate0-rig-tests.ts`.
- **15:12** `lane/verify` `62e9777` — `check-bind.mts` skips ALL three shipped/candidate GLBs as quantized, so the
  mesh-vs-bind joint check (added to the Phase 1 gate in pass 3) currently runs on nothing that ships; the rig suites
  on both kit bodies are the substitute. Belongs to `scripts/avatar/check-bind.mts` (an un-quantized source check in
  `roster-from-kit.mts` / `import-mpfb.mts` before quantize) — extends B23/B26 area.
- **15:12** `lane/verify` `62e9777` — the 2×-median budget rule cannot trip on a two-row table (median 104 MB,
  ceiling 208 MB > dunk's 168 MB). Gate only as strong as the perf lane's row count; the contract names no minimum.
  Belongs to `scripts/perf-budget-tests.ts` (verify) / `docs/CONTRACTS-PASS4-RUN.md` §3 (orchestrator).
- **15:18** working trees — **perf**: `textureBudget.json` still the null stub (the sweep has not been run or written
  yet); `fel-hero.mobile.glb` is untracked and unmeasured in the tree (its 24 MB figure is from the code comment).
  The perf lane's new engine-cache basis means the 15:03 numbers in `docs/SHIP-PASS-4.md` (dunk 168 MB mobile) were
  measured on the OLD `scene.textures` basis and are not comparable to the table the sweep will write — the changelog
  and the RC doc must say which basis each number is on. Belongs to `scripts/probes/_vram-diag.mts` (perf),
  `docs/CHANGELOG.md` (rc), `docs/SHIP-PASS-4.md` (orchestrator).
- **15:19** `lane/perf` `98a4696` — did NOT (yet) write `lib/babylon/config/textureBudget.json` (still `measuredAt:
  null`, no modes); the sweep mode exists in the probe but has not been run against `MODES=all`. The throttle rows
  ("≥ 30 fps under 4× throttle", acceptance) and the gauntlet 0/0/0 are also not in the commit. The commit's
  before/after (dunk 197 → 94, karate 189 → 117) is two modes, not the tier. Belongs to `lane/perf` (next commit).
