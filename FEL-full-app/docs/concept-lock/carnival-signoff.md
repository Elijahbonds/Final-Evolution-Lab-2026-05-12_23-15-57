# §7 Completion Checklist — Court Carnival

Benchmark: **Mario Party / Pac-Man Fever** (re-locked by the owner 2026-09-01
after a §7.3 stop-and-ask; was Wii Sports Resort. Recorded in
`PHASE2_BENCHMARK_LOCKS.md` → POST-LOCK RE-LOCKS).
Mode id `carnival`, route `/play/carnival`. Implementation:
`CourtCarnivalMode.ts` over the six-event rotation in `carnivalEvents.ts`,
inside the party-night hub `lib/carnival-run.ts`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ below |
| 7.3 | Benchmark parity | ✅ A1–A5, B1–B5, C1–C3; D1–D3 ruled, D4 deferred |
| 7.4 | World-Population Protocol | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 73 tests (carnival-depth-tests added) |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/carnival.md` — 13 criteria, 4 deviations |
| 2 Core mechanics | `carnival-depth-tests.ts` (18 checks) — rival presence, one-engine-per-canvas, lineup hygiene, bezel coverage |
| 3 Camera & framing | **FEL-FRAME 0** on dev (`carnival-drive.mts`: 4/4 events + finale, watchdogs 0, errors 0) |
| 4 Reachability | registry `carnival` · `/play/carnival` hub → START THE NIGHT → in-run mount · `MODE_VERBS.carnival` (GO/TRICK/POWER/CHARGE) |
| 5 Input & control schema | verb-key-alignment green; one verb deck covers all six events (D4 records the Gauntlet's X) |
| 6 World population | L1–L5 below |
| 7 Audio | per-event SFX + crowdCheer/crowdGroan by event outcome, whistle + confetti at the finale |
| 8 Polish | rival celebrates/slumps per event result, champion/runner-up bodies at the finale (was a statue from load to end); retired `sprint` removed from the lineup pool |
| 9 Playtest | dev drive: full night, 4/4 events, finale, FEL-FRAME 0; mobile 390×844 touch: hub → night → GO/TRICK on the overlay, event playing at 60fps, errors 0 |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  each event builds its venue ground
                                 (Venice court, dojo tatami, pitch, skatepark)
L2 play-critical props ... PASS  hoop/rim/net, goal, kicker, ball per event
L3 boundary .............. PASS  venueBox walls per venue
L4 crowd and life ........ PASS  bleacher-crowd walls (VenueKit) + the rival
                                 body reacting to every result + cheer/groan
L5 ambience .............. PASS  palms, lanterns, floodlights, graffiti
budget ................... 60fps on the mobile leg (avg 16.7ms, worst 18.8ms)
legibility ............... PASS  one event world at a time; bezel carries the race
```

## What this pass found and fixed

1. **The rival was a statue.** Loaded at (2,0,0), never animated until the
   finale banner — a points race against wallpaper. Now: winner celebrates /
   loser slumps at every event result, champion and runner-up bodies at the
   finale, crowd answers both ways. (Mario Party's rivals react; this is the
   cheapest 80% of that feel.)
2. **The in-run hub mount went black on mobile.** ?carnival=1 double-mounts
   the host (StrictMode + Suspense): mount A's late teardown disposed the
   engine holding mount B's WebGL context — measured "loading" twice then a
   black frame the RenderWatchdog could not rescue. Ported the `canvasOwner`
   token guard from air-session-babylon. Re-measured: luma 72.6 in-run, full
   mobile script clean.
3. **A retired mode was still in tonight's lineup.** `sprint` (retired by the
   owner) sat in `CARNIVAL_EXTERNAL_POOL`; dealing it would route the night
   to a redirect. Removed.
4. **The drivers couldn't run the night.** `capture-mode-play.mts` and
   `capture-mobile-touch.mts` now drive the START THE NIGHT hub (loop:
   canvas wins, hub button starts), and the mobile hub loop tolerates the
   router push mid-probe (execution-context-destroyed = progress, not a
   crash). networkidle→domcontentloaded and login-form detection fixes
   carried from the 3PT pass.

## Carry-forwards

1. **The Gauntlet's X spin has no touch button** (D4, deferred) — the
   4-face-button budget; B/Y still give two tricks on a phone.
2. **The rival is simulated per-event ranges** (D3, ruled) — couch
   multiplayer is a networking build, not a carnival build.
3. **No literal board map** (D1, ruled) — the hub is the board.
4. The `long N/120` emulated-touch metric appears across modes; a harness
   constant, not a regression (project-wide: no real-hardware run yet).
