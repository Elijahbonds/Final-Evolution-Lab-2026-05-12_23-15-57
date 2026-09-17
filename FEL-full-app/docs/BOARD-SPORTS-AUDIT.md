# BOARD SPORTS — PHASE 1 AUDIT (measured, 2026-09-17)

Phase 1 of a 10-phase upgrade pass on skate, snow and surf. Every number here was read off the source or
computed from the tuning constants — nothing in this document is an impression.

## THE HEADLINE: the three disciplines are not the same game yet

| | skate | snow | surf |
|---|---|---|---|
| ride world | `buildSkatepark` | `buildSlopeRun` | `buildSurfBreak` |
| **grind lines** | **14** | **1** | **0** |
| boxes / cylinders / wedges | 12 / 4 / 3 | 2 / 5 / 0 | 1 / 4 / 0 |
| markers (objectives) | 6 | gates, generated | **0** |
| obstacles (hazards) | 0, by design | rocks, generated | buoys, generated |
| tricks in the table | **15** | 12 | **8** |
| trick kinds | 11 air, 3 grind, 1 manual | 10 air, 1 grind, 1 manual | 3 air, 3 manual, 2 revert |
| venues | 3 (bounds 48–62) | 3 (bounds **20–34**) | 3 (bounds 92–110) |
| mode size | 997 lines | 509 | 536 |

*Correction, made in Phase 3:* the counts above are **push sites in source**, not runtime counts — snow's
rocks and surf's buoys are each one `push` inside a loop, so both produce many. Surf's hazard layer is
therefore fine; its deficit is the wave itself, which is Phase 4. The grind-line and marker counts are
literal and stand.

Read across that table and the pass writes itself. **Surf has no grind lines, no markers and one hazard** —
it is the emptiest world in the project. **Snow has a single rail** against skate's fourteen. And the snow
venues are a third the size of the skate venues, which for a discipline whose whole appeal is descending
is the wrong way round.

## THE TRICK HIERARCHY IS ONLY REAL ON SNOW

`BoardTricks.fitsAir(trick, airSec)` is meant to gate which tricks a given pop can finish. Whether it
gates anything depends on hang time, and hang is `2v/g` with `g = 14 m/s²` and `jump(p) → vel.y = 5 + 5.5p`:

| | pop source | hang | longest trick | does `fitsAir` gate? |
|---|---|---|---|---|
| skate | `olliePower()` 0.27–0.76 | 0.93–1.31 s | 360 FLIP, 0.72 s | **No.** Everything fits off flat ground. |
| snow | `0.5 + tuck·0.5` | 1.11–1.50 s | 1.15 s | **Yes** — the biggest trick needs real tuck. |
| surf | no `rider.jump` at all | n/a | 0.60 s | n/a — only 3 of its 8 tricks are air |

Skate's hierarchy is inert: the trick list is 15 long and the player can throw any of it at any time, so
choosing is not a decision. Snow's works by accident of its numbers, and it is the model to copy. This was
made *worse*, knowingly, by raising the ollie in `SKATE-POP-MANUAL` on the owner's call — the raise was
right and the hierarchy is the debt it took on. Phase 5 pays it.

## WHAT EACH MODE ACTUALLY READS

| mode | `world.markers` | `world.obstacles` |
|---|---|---|
| skate | **no** | no |
| snow | yes | yes |
| surf | no | yes |

Skate reads neither, so the six plaza markers added in `SKATE-PLAZA` currently go nowhere — there is no
objective or camera pointing at the spine, the gap or the wallride. Surf ignores markers entirely, which is
part of why a surf run has nothing to aim at.

`RideWorld.obstacles` means HAZARD in this codebase — snow rocks and surf reef, things that hurt you. It is
deliberately empty for skate, because to a skater an obstacle is a thing you skate. That asymmetry is
correct and should not be "fixed" by filling it.

## TESTABILITY: the builders cannot be tested at all

`buildSkatepark`, `buildSlopeRun` and `buildSurfBreak` each construct a `DynamicTexture` before placing
anything, and that needs a canvas — so no headless test can reach any layout authored inside them. Verified
by attempting it. This is why `SKATE-PLAZA` moved its layout into `modes/skatePlaza.ts` as a pure table the
builder walks and a test can measure. **Snow and surf have no equivalent, so their terrain is unmeasured:**
a rail outside the bound, a gate the player cannot reach, or a rock on the spawn would all ship silently.
Phase 3 gives them the same treatment.

## SMALLER FINDINGS

- Surf's trick table is 3 manual, 2 revert, 3 air. It is a carving game with almost no air vocabulary,
  which matches its 0 grind lines: there is very little to *do* on a wave beyond ride it.
- `BoardRunMode` is 153 lines and reads neither markers nor obstacles — it is the thin shared entry, worth
  confirming rather than extending.
- Snow's single rail is a ski-lift cable with a `minApproachHeight`, so it is not a street rail at all. Snow
  effectively has **no grindable street furniture**.
- The skate goal table could not be located by name (`SKATE_GOALS` is referenced but its rows did not parse),
  and there are only 4 `goals.report` call sites. Phase 8 should establish whether the goal system covers the
  new terrain at all.

## WHAT PHASE 1 DOES NOT KNOW

Nothing in this pass has run in a browser. There is no dev server available to this session, so every
statement above is about source and arithmetic. Specifically unmeasured: actual frame rates, whether any of
this *looks* right, whether the raised ollie feels right in the new plaza, and whether the animations are
in fact rough — the owner's "smoothness" report is credible and unreproduced here. Phases 7 and 9 are
therefore buildable but not gradeable until someone runs it.
