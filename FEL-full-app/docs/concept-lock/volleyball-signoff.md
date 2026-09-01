# §7 Completion Checklist — Volleyball

Phase 10 of the convergence pass. Benchmark: **Nintendo Switch Sports —
Volleyball**, locked by Elijah on 2026-08-31 in `PHASE2_BENCHMARK_LOCKS.md`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ D0–D5 fixed; D2 (block) fixed; D6 fixed |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 4 files, 62 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

Tenth mode through the checklist.

**Standing caveat, project-wide:** no FEL mode has run on real hardware. Phase 9
here is a desktop pass with a timing-aware driver and a 390×844 touch pass, both
through `/play/volleyball`.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/volleyball.md` — 20 criteria, 7 deviations |
| 2 Core mechanics | `volleyball-rally-tests` 28 green — bump, set and spike are three different shots, and tennis is untouched |
| 3 Camera & framing | **0 `[FEL-FRAME]`** desktop and mobile |
| 4 Reachability | registry `volleyball` · `ENABLED_BABYLON_MODES` · `/play/volleyball` · `makeTimingHost` · `MODE_VERBS` · Controller Link |
| 5 Input & control schema | HIT and BLOCK on the overlay (it had **no entry at all**), phone schema added |
| 6 World population | L1–L5 below; the court lines now sit where the rules are |
| 7 Audio | ocean bed (was a stadium crowd on a beach), per-contact cues, a distinct kill/stuff impact |
| 8 Polish | a real shot meter, SPIKE-incoming cue, touch labels, STUFF/BLOCK pops |
| 9 Playtest | `scripts/rally-drive.mts` — 21–23 swings a session, BUMP → SET → SPIKE; mobile **0 errors** after fixing a black screen that took down five modes |
| 10 This document | — |

---

## World-Population Protocol — Volleyball

```
L1 ground plane .......... PASS   15x24 sand: an 18x9 court with the regulation
                                  3m free zone, lines painted where the rules are
L2 play-critical props ... PASS   net, ball, court lines, attack lines, and the
                                  incoming-SPIKE cue that makes a block possible
L3 boundary .............. PASS   the sand ends and the ocean begins
L4 crowd and life ........ PASS   12 spectators down both sidelines, outside the
                                  free zone; they cheer a point, louder for yours
L5 ambience .............. PASS   dusk beach, palms, ocean audio bed
budget ................... draws 46  meshes 46  frame 16.5ms (61fps)
legibility ............... spectators sit at x = ±8.6, outside the ±7.5 sand, so
                           nobody stands where a ball can legally land
```

**L1 was wrong in a way that matters.** The `volleyball` markings case drew a box
inset a fixed 60px from the *texture* edge, and the texture spans the whole
ground — so on an 18×30 beach the sideline was painted at x ≈ ±8.5 while
`RallyCore` judges anything past **±4.5** as wide. The player was shown a court
that was not the court. That is 3PT's ball-rack lesson in its other form: *a
wrong marking is a wrong game*. Lines are now derived from the real dimensions
(18m × 9m court, 3m attack lines) against the ground size the venue declares.

---

## What the pass found

- **The three-touch limit could never fire.** Every swing called `rally.cross()`,
  which zeroes the counter, so `touchesPerSide: 3` played exactly like `1`. I had
  marked that criterion green in the lock's first draft on the strength of the
  config value — the reason to read the code path, not the constant.
- **Bump, set and spike were one generic hit.** They are three shots now, and
  only the attack crosses the net.
- **The spike's geometry was wrong twice.** A set lands the ball *at* the net, so
  a ground-launched spike clips the tape; raising the apex could not fix it
  because the fault was the launch height. It is struck from above the net now
  (solved against the flight equation), and its arc grows with distance because a
  flat attack from the baseline evaluates below the net however high the contact.
  A test caught the second half; play-testing could not have.
- **AI error rates compounded** — three touches tripled the opponent's per-rally
  error rate, turning a competitive 4–5 into 5–0.
- **`shotMeterT` was a boolean wearing a meter's name**, rendered nowhere, in a
  mode graded on contact timing.
- **The mode had no touch controls at all**, falling through to a single generic
  ACTION button — and the guard written to prevent exactly that skipped it,
  because it scanned hosts for a *static* `modeId` and this one is served by a
  factory. The guard asks the registry now.

### Phase 9 found a black screen in five modes

`/play/volleyball` rendered **black on a phone** — `[FEL-WATCHDOG] still black
after rescue`. Tennis and golf did too, which located it: `makeTimingHost` called
`runMode` synchronously, so StrictMode's phantom mount built a Babylon engine its
own cleanup could not cancel (`stop` is not assigned until the async load
resolves), and two engines fought over one WebGL context. Every other host in
this project already defers by a tick; this one never got the fix.

It was **pre-existing** — verified by reproducing it with the venue reverted —
and it took down all five timing modes: volleyball, tennis, golf, derby, penalty.
Desktop never showed it. This is the phase's whole argument.

## Still open

1. **The block is single-hand.** It is a read on an announced attack and a
   missed one costs your contact; there is no double block or net-touch fault.
   Enough for the benchmark, short of the sport.
2. **Tennis, golf, derby and penalty** now boot on mobile but have not had
   convergence passes. They are not claimed here.
