# §7 Completion Checklist — Mixed Combat

Benchmark: **Soul Calibur style** (re-locked by the owner 2026-09-01; was MMA.
Recorded in `PHASE2_BENCHMARK_LOCKS.md` → POST-LOCK RE-LOCKS).
Mode id `mixedcombat`, route `/play/mixedcombat`. Implementation:
`MixedCombatMode.ts` over the shared `FightCore`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ below |
| 7.3 | Benchmark parity | ✅ A1–A6, B1–B6, C1–C5; D1/D2 deferred, D3/D4 ruled |
| 7.4 | World-Population Protocol | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 75 tests (mixedcombat-depth-tests added) |
| 7.7 | No orphaned-mode work smuggled in | ✅ FightCore change is opt-in (karate suites still green) |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/mixedcombat.md` — 17 criteria, 4 deviations |
| 2 Core mechanics | `mixedcombat-depth-tests.ts` (63 checks) — the step grammar pure (both sets, precedence, commitment), bezel coverage, phone coverage, crowd wiring |
| 3 Camera & framing | **FEL-FRAME 0** on dev drive and `/play/mixedcombat`; ring-out camera fault found + fixed (below) |
| 4 Reachability | registry `mixedcombat` · `/play/mixedcombat` · `MODE_VERBS.mixedcombat` · Controller Link schema ADDED (was absent — phones silently never joined) |
| 5 Input & control schema | verb-key-alignment green; loadout pick works on d-pad AND stick flick (Controller Link sends d-pad as stick) |
| 6 World population | L1–L5 below |
| 7 Audio | whoosh/impact/guard-break SFX; crowd cheer/groan on ring-outs and rounds |
| 8 Polish | step grammar + banners, edge warnings, onlooker ring, hint on the bezel, recap truth fix |
| 9 Playtest | `mixedcombat-drive.mts` — full match played like a fighter: loadout picked both ways, **stepped a rival poke live** (chi paid, side channel), rival stepped mine, both edge warnings, rounds decided, match over; FEL-FRAME 0 / MISSING CLIP 0 / watchdogs 0 / errors 0. Mobile 390×844: GUARD/STRIKE on the overlay, bezel shows the fight hint, errors 0 |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  octagon platform (top at y=0) + apron floor
L2 play-critical props ... PASS  the glowing rim IS the rule; braziers mark
                                 the cardinal edges
L3 boundary .............. PASS  the edge — falling off is the signature
L4 crowd and life ........ PASS  ADDED — 14-instanced onlooker ring, cheers
                                 ring-outs (1.0) and guard breaks (0.6)
L5 ambience .............. PASS  the pit below, flame braziers, goldenHour
budget ................... +2 draws for the crowd; 60fps held on the run
legibility ............... PASS  crowd outside the brazier line, off the fight
```

## What this pass found and fixed

1. **The step grammar could not exist as first built.** Two reasons, both
   measured: (a) `faceEachOther()` re-aimed the striker every frame, so the
   attack line tracked the defender and lateral offset at impact was always
   ~0 — 150 seconds of orbiting produced ZERO steps; (b) with facing locked,
   `STEP_EVADE_M` 0.5 still only qualified heavies (3.3 m/s × 120ms jab =
   0.40m). Now: strikers commit to their line at swing start, and the window
   is 0.32 — deliberate lateral movement beats even jabs, slight drift still
   connects. Measured live after the fix: `foe poke lat=0.59 → stepped`.
2. **The rival's attacks landed, the page console just dropped the proof.**
   The known dropped-console trap: instrumenting via `console.log` showed ONE
   strike in 18s; the `window.__MC_DEBUG` side channel showed the truth (4
   strikes, incl. the stepped poke). Instrumentation removed after use.
3. **Ring-out camera fell into the pit with the victim.** Below the platform
   the ring wall boxed in every probe azimuth (FEL-FRAME warnings), then the
   clamped shot left the falling hero off-frame (FEL-FRAME errors). Now the
   camera AND FrameGuard hold on the survivor at ring level, looking at the
   edge the victim went over.
4. **The /play route went black** — StrictMode double-mount, no canvasOwner
   guard (the carnival disease). Ported the guard; effect no longer depends
   on `onEnd` identity.
5. **The recap always read DEFEATED with score 0** — the host checked
   `outcome === 'WIN'` while the mode ends `MATCH_WON`, and read a
   `stats.wins` key that never existed. Fixed to the mode's real contract.
6. **Trap "published is not rendered", eighth occurrence** — `hint` (the
   loadout instructions!) and now `edge` were published and never drawn.
   Both render; verified on the mobile bezel.

## Carry-forwards

1. **No throws** (D1, deferred) — guard chip/break carries the anti-turtle
   load; a throw is a FightCore build.
2. **The rival steps organically, not deliberately** (D2, deferred) — its
   circling steps verticals by geometry; a startup-reading step is the next
   rung of AI.
3. The `long N/120` emulated-touch metric appears across modes; a harness
   constant, not a regression (project-wide: no real-hardware run yet).
