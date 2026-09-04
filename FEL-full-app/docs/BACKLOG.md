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

- _none yet (15:03 — no lane commits beyond the freeze)_
