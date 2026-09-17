# BOARD SPORTS — PHASE 2: THE BENCHMARK, AND WHAT IT MEASURES

Phase 2 of the 10-phase pass. A benchmark that cannot be measured is a mood board, so each lock below comes
with numbers something can check.

## THE LOCKED BENCHMARK AND THE BUILT ONE DISAGREED

`PHASE2_BENCHMARK_LOCKS.md` locks **Skateboard → Skate 3**, **Snowboard → SSX**, **Surf → SSX**.

The code says otherwise, everywhere. `VENICE-SKATE-THPS` is the name of the pass that built the manual link
and the rail magnet; `RailMagnet` calls auto-lock with no button "the THPS rule"; the creator-card work is
described as "THPS2 grammar". Those are not Skate 3 ideas — Skate 3 is a simulation with flick-it controls,
realistic ollie heights and no combo multiplier. THPS is arcade: huge air, auto-locking grinds, and a combo
chain that is the whole scoring system.

They are opposite philosophies and the project has been building one while the document locked the other.
The owner's own asks settle it — more ramps, more rails, bigger ollie, tricks after a boost, combo links —
all THPS. **Re-locked: skate → Tony Hawk's Pro Skater (THPS 1+2 era).** The stale lock is the document's
error, not the code's, and this file is the correction rather than a new direction.

Surf → SSX is also wrong on its face: SSX is a snowboarding game. Surf gets its own reference.

| discipline | benchmark | why this one |
|---|---|---|
| skate | **Tony Hawk's Pro Skater (1+2)** | What the code already implements: auto-lock grinds, combo chains, arcade air |
| snow | **SSX** | Kept. Big air, oversized features, speed over realism — and snow's numbers already behave this way |
| surf | **Kelly Slater's Pro Surfer** | Trick-and-section scoring on a wave, which is the only surf reference that answers "what do I DO on a wave" |

## WHAT EACH ONE MEASURES

These are the criteria phases 3–8 are graded against. Every one is a number a test or a probe can read.

### Skate → THPS
- **Features per run.** A THPS park gives a line every few seconds. Target: ≥ 12 grind lines and ≥ 15
  rideable features per venue. *Now: 14 rails, ~30 features after SKATE-PLAZA. Met.*
- **Air time band.** THPS flat-ground ollie is roughly chest height with about a second of hang. Target:
  0.8–1.4 s. *Now: 0.93–1.31 s. Met.*
- **The trick table must be gated by air.** A THPS player chooses a trick they can land. Target: the longest
  trick needs ≥ 80% of maximum hang, so flat ground cannot throw everything. *Now: 0.72 s against 1.31 s =
  55%. **FAILS.** Phase 5.*
- **Linking pays more than repeating.** Target: a two-different-trick chain beats the same trick twice by
  ≥ 30%. *Unmeasured for board; the aero chain already does this. Phase 8.*

### Snow → SSX
- **Descent.** SSX runs are long and steep. Target: a run drops ≥ 60 m over ≥ 400 m of travel.
  *CORRECTED after Phase 3 measured it properly: `venue.bound` is the piste WIDTH, not its length. The run is
  `SLALOM_START + SLALOM_GATES × SLALOM_SPACING + 60` = **318 m** at `SLOPE_PITCH` 0.22 rad — a 22% grade
  dropping **69 m**. So the drop is MET and only the length is short. My first reading of this criterion
  reasoned from `bound` and called it a failure; that was wrong, and the error is left visible here rather
  than quietly edited out.*
- **Features per descent.** Target: ≥ 8 kickers/rails/boxes on the line. *Now: 1 rail, and it is a ski-lift
  cable. **FAILS.** Phase 3.*
- **Air time band.** SSX air is enormous. Target: 1.0–2.0 s off a real kicker. *Now: 1.11–1.50 s. Met.*
- **Trick gating.** *Now: longest trick 1.15 s against 1.50 s max hang = 77%. Close enough; Phase 5 confirms.*

### Surf → Kelly Slater's Pro Surfer
- **Something to ride toward.** Target: ≥ 4 rideable sections per wave (takeoff, wall, barrel, close-out).
  *Now: 0 markers, 0 grind lines. **FAILS.** Phase 4.*
- **Waves must differ.** Target: ≥ 3 distinct wave profiles in a set, and a set arriving on a readable
  rhythm. *Now: one profile. **FAILS.** Phase 4.*
- **Air vocabulary.** Target: ≥ 5 air tricks, so a wave has a lip and not just a face. *Now: 3 of 8 tricks
  are air. **FAILS.** Phase 5.*
- **Lineup density.** Target: ≥ 2 swell lines visible at once. *Now: 1. **FAILS.** Phase 4.*

## SCORECARD GOING IN

Nine criteria across three disciplines. **Two met, one close, six failing** — and five of the six failures
are snow and surf, which is what the Phase 1 audit said in different words. The pass is therefore weighted
toward snow terrain (Phase 3) and the surf lineup (Phase 4), not toward skate, which is already at its
benchmark on everything except trick gating.

## ONE CRITERION DELIBERATELY NOT SET

Nothing here grades how it *looks*, because nothing in this session can run it. Frame rate, readability and
whether the animation is smooth are all real criteria and all ungradeable here; they are named in Phase 7 and
Phase 9 as buildable-but-unverified rather than given fake targets.
