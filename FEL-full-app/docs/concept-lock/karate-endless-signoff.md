# §7 Completion Checklist — Karate Endless (Agent Waves)

Phase 10 of the convergence pass. Benchmark: **Soul Calibur + Wave Survival
(COD Zombies)**, locked in `PHASE2_BENCHMARK_LOCKS.md`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks |
| 7.2 | 10-Phase Convergence Protocol run in full | ⚠️ ten run; **Phase 3 does not pass** |
| 7.3 | Benchmark parity against the locked reference | ✅ D1, D2 fixed; D5–D7 ruled with reasons; D3 open |
| 7.4 | World-Population Protocol applied | ⚠️ **not run** — see below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 4 files, 61 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ §4.3 closed; this mode is the only real entry and Elijah mounted it |
| 7.8 | No scope bleed into §6 features | ✅ real co-op left as the §6 feature it is |

## Verdict: **NOT SIGNED OFF — 6 of 8.**

Second mode to fail the checklist, and it fails on the item this project treats
as the most common failure of all.

- **7.2 — Phase 3 does not pass.** Its exit criterion is "No `[FEL-FRAME] hero
  off-screen`", and this mode still produces them intermittently. Measured
  across five runs after the fixes below: **0, 1, 2, 2, 0** — mean 1.0, against
  a pre-pass baseline of **1, 0, 5, 1** (mean 1.75, and the spike to 5 is gone).
  A real improvement is not a pass.
- **7.4 — no World-Population pass has been run on this venue.** L1–L5 are
  unassessed. The mode's own defects document already recorded this and it is
  still true; recording it again rather than quietly dropping it.

**Standing caveat, project-wide:** no FEL mode has run on real hardware.

---

## The benchmark existed the whole time

`karate-endless-defects.md` states that this mode could not have a real pass
because "§4.3 carries no benchmark", and that one "still needs locking". That
was true of the bible's §4.3 and false of this repository: **Karate Endless →
Soul Calibur + Wave Survival (COD Zombies)** is in
`PHASE2_BENCHMARK_LOCKS.md`, at the tracked repo root, one level above
`FEL-full-app` — which is why every search inside the app missed it, the same
oversight that cost the three board sports a phase each and that also answers
the Unreal Arena question. That document remains accurate about its own pass and
is superseded on this one point.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/karate-endless.md` — 24 criteria, 7 deviations |
| 2 Core mechanics | waves, perks, dodge i-frames, chi burst, down/revive all live |
| 3 Camera & framing | ⚠️ **1.75 → ~1.0 warnings per run. Not zero. Does not pass.** |
| 4 Reachability | registry `karate` · `ENABLED_BABYLON_MODES` · `/play/karate` · `karate-babylon.tsx` · `MODE_VERBS` |
| 5 Input & control schema | four verbs on the overlay, all reachable; verb-read guard green |
| 6 World population | ⚠️ **not run** |
| 7 Audio | dojo/arena bed, per-strike cues, wave-clear fanfare |
| 8 Polish | perk shop, ally bar and revive prompt now rendered (D1, D2) |
| 9 Playtest | `/play/karate` desktop **0/0/0** on the run captured; mobile touch **0 errors**, ally bar and wave counter visible, four verbs reachable |
| 10 This document | — |

---

## What the pass found

**D1 — The perk shop was unusable.** The mode publishes `coins` and a formatted
`perks` list; the host bezel rendered hp, chi, wave, kos and banner and nothing
else. The shop opened with *"PERKS — d-pad to browse, A to buy, B to fight"*
over a screen showing neither the perks nor the money. A points economy whose
points are invisible is the largest possible miss against the Zombies half of
this benchmark — in that game the number in the corner **is** the loop.

**D2 — The ally was invisible.** `partnerHp` and `revive` were published every
frame and never rendered, in a mode built around going down and being revived.

**The camera work, and what it cost.** Four attempts, two of them wrong, and the
wrong ones are recorded because the reasoning is reusable:

1. **A framing minimum for the occlusion fallback.** `MIN_SAFE_DISTANCE` (1.8m)
   is a safety floor, not a framing one: a shot that clears it can still frame
   nothing. The elevated fallback now triggers below `FRAMING_MIN_DISTANCE`
   (2.6m). Helped.
2. **Orbit instead of chord.** A follow camera moving to a new side of its
   subject describes an arc; lerping the position walks the chord, and a chord
   passes nearer the subject than either endpoint. Instrumenting the pipeline
   settled it — `desired 2.57, occlusion 2.57, bounds 2.57, final 2.57` proved
   nothing was pulling the camera in and the *interpolation* was steering it
   through the fighter.
3. **That orbit was too greedy, and skate caught it.** Preserving the full 3D
   radius fights vertical convergence: a rider going up a ramp needs the camera
   to climb to its preset height while the radius holds it where it was. Skate
   went to 2 warnings with the hero off the **top** of frame and the camera at
   y 2.23 against a `minHeight` floor of 2.86. The orbit is now horizontal only
   — the arc problem was always a yaw problem.
4. **`overShoulder` lag 0.16 → 0.3.** It is the one preset that follows FACING
   rather than velocity, and facing can swing 180° in a moment. Third-person
   action cameras are near-rigid in yaw for that reason; the softness belongs in
   position, not heading.

All eight other modes stayed at 0 warnings through every one of those changes,
which is the only reason they are kept.

## Still open

1. **Phase 3.** ~1 warning per run, always with the fighter pinned at the arena
   clamp `(±7.5, ±7.5)` — the **corner**, where a facing-derived camera at a
   3.1m radius has the least room to swing. The next thing to try is the play
   area's shape: a square clamp creates corners, and Karate VS uses a disc.
2. **Phase 6.** No World-Population pass on this venue.
3. **Real co-op** stays a §6 feature, deliberately.
