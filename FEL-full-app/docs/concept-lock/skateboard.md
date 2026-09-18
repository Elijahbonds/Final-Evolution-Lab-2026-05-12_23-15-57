# Concept Lock — Skate Run

**Benchmark (LOCKED): Skate 3.**
Locked in `PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`), in the
*Already-Locked (from audit)* list — it predates Phase 2 rather than being
decided there. Corroborated in-code at `SkateRunMode.ts:114`: "flick-stick is
THE trick input (Skate 3 vocabulary)". Not invented here (§7.3).

**Mode id:** `skateboard` · **Implementation:** `lib/babylon/modes/SkateRunMode.ts`
**Route:** `/dev/mode/skateboard` · **Host:** `components/games/board-babylon.tsx`

Phase 1 of the convergence pass. The job is to turn "Skate 3 parity" into
criteria that can be checked. Anything not listed in-scope is out of scope —
that is what makes it a lock.

---

## A. The trick system — what makes it *Skate*, not Tony Hawk

Skate 3's defining choice is that tricks come from the analog stick, not from a
button that names them. The vocabulary and the risk both live in the flick.

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Tricks are entered by flicking the right stick, not by naming a button | ✅ | `FlickStick.feed()` |
| A2 | Flip / grab / spin families, each with a real trick name | ✅ 9 gestures | `FLICK_TRICKS` |
| A3 | Harder gestures are worth more (difficulty feeds scoring) | ✅ `difficulty` 1–5 | `AirControl.applyTrick` |
| A4 | Grabs are HELD, and the hold accrues value | ✅ | `releaseGrab()` |
| A5 | The same tricks are reachable without a right stick (keyboard/touch) | ✅ **D2 fixed this pass** | face buttons → `airTrick()` |
| A6 | Switch stance riding | ✅ **D6 fixed** | `landsSwitch()` on an odd half-turn |

## B. Combo economy — the part that was missing entirely

A skate run is not a score, it is a *line*: you link tricks, and you either bank
them or you lose them. Without banking there is no tension and no score.

| # | Criterion | Status | Where |
|---|---|---|---|
| B1 | Landing clean BANKS the pot | ✅ **D1 fixed this pass** | `BANK_SETTLE_SEC = 0.45` |
| B2 | Bailing loses the whole pot | ✅ | `combo.bail()` |
| B3 | Grinds extend a combo rather than ending it | ✅ | `BalanceChannel('grind')` |
| B4 | Manuals extend a combo | ✅ | `BalanceChannel('manual')` |
| B5 | Revert links a landing into a manual | ✅ | `tryRevert()` |
| B6 | A multiplier grows with chain length | ✅ | `ComboChain.multiplier` |
| B7 | Landings are GRADED, not binary — clean / sketchy / bail | ✅ | `resolveLanding()` |
| B8 | A sketchy landing can be saved by input | ✅ | `res.save` |
| B9 | Rail bonuses reach the banked score | ✅ **D3 fixed this pass** | `combo.add(..., 'grind')` |

## C. The park and the session

| # | Criterion | Status | Where |
|---|---|---|---|
| C1 | An open park with rideable transitions, not a corridor | ✅ bowl + downhill + rails | `buildSkatepark()` |
| C2 | Speed is EARNED — push and pump, no throttle | ✅ `pushAccel 3.2`, pump | `SKATE_TUNING` |
| C3 | Named objectives to chase, Skate 3 "challenges" style | ✅ 4 goals | `SKATE_GOALS` |
| C4 | Collectible line to teach the park's routes | ✅ | `CoinField` |
| C5 | A timed run with a final score | ✅ 90s | `RUN_SEC` |
| C6 | The rider reads as a skater, not a fighter on a plank | ✅ **fixed this pass** | `boardSuite.ts`, hips 74° |

---

## D. Deviations — fix, defer to a named phase, or rule out of scope

**D1 — Nothing could ever be banked. → FIXED (this pass).**
`combo.bank()` was called nowhere in the mode; only `bail()`. The pot grew for
the whole run, `score` (which publishes `combo.banked`) sat at 0 start to
finish, and the goal tracker — gated on `!combo.active && combo.banked > 0` —
could never fire. A 90-second run ended 0 points / 0 goals / 0 momentum.

**D2 — Only a gamepad could score a trick. → FIXED (this pass).**
The face-button fallbacks drove `TrickMachine`, whose points land in a score the
mode never reads and whose `update()` is never called here. A right-stick flick
was the only path into `AirControl`, and neither the keyboard nor the touch
overlay has a right stick.

**D3 — Grind bonuses were discarded. → FIXED (this pass).**
`tricks.bankGrind()` fed the same dead pot, so every rail and transfer bonus was
thrown away.

**D4 — The HUD showed almost none of the mode. → FIXED (Phase 8).**
The mode publishes `combo`, `pot`, `momentum`, `goals`, `score`, `coins`,
`time`, `banner`. The shared host (`board-babylon.tsx`) renders **time, coins,
score, banner** and nothing else. The live combo string and the pot at risk are
*the* Skate/THPS HUD — the whole tension is watching a pot you have not banked
yet. Currently a player cannot see their multiplier, their pot, or their goals.
The host bezel is now driven by what the mode *publishes* rather than by
`modeKey`: a combo ticker showing the pot at risk above the multiplier, chips for
goals and gates, and meters for flow / boost / momentum, each appearing only when
its key is present. The coins counter is now conditional too, so surf and
snowboard stop carrying a permanent `◈ 0`. One fix, all three modes.

**D5 — The goals were never shown. → PARTIALLY FIXED (Phase 8).**
A `GOALS n/4` chip is now on the bezel, so progress is visible. The four
objectives themselves are still not *named* anywhere in-game — a player sees
`0/4` without being told what the four are. Naming them needs a pre-run card or
a pause panel, which is a UI surface this host does not have yet. **Deferred to
Phase 8 of a later pass**, recorded rather than closed.

**D6 — Switch riding was built but unreachable. → FIXED, and not the way this
lock proposed.** `BoardMovement.switchStance()` existed, applied its 0.97 speed
tax and flipped the rider 180° at `SkateRunMode.ts:291`, and **nothing in the
game ever called it**. This document filed it as a Phase 5 control-schema slot.
That was wrong: in Skate 3 nobody presses a "ride switch" button — you land a
half-rotation and find yourself in it. It now follows the rotation, via
`landsSwitch(entryYaw, exitYaw)` in `boardCore.ts`: an odd count of half-turns
lands you switch, a clean 360 returns you to the stance you left with. No new
button, and the mechanic is the benchmark's rather than a menu of ours.

**D7 — `X` is overloaded: push when grounded, grab when airborne. → ACCEPTED.**
Documented rather than fixed. The two are context-disjoint (you cannot push in
the air) and the touch overlay labels them separately. Not a defect.

**D8 — No slow-motion, no replay, no photo mode. → OUT OF SCOPE (v1).**
Skate 3's replay editor is a headline feature and a whole subsystem. Ruled out
for v1: it does not affect whether the riding is good, which is what this pass
is for.

**D9 — No pedestrian/skater ambience in the park. → OUT OF SCOPE (v1).**
The park is unpopulated. World-Population (Phase 6) covers legibility props;
crowd simulation is not in scope for a solo score-run mode.

---

## Verification state at lock time

Through `/dev/mode/skateboard`, driven by `scripts/capture-mode-play.mts`
(`PUMP=1 HOLD=700 GAP=70 KEYS=k,l,j`):

```
score 1080–1298 · banking banners live · momentum meter live
FEL-FRAME 0 | MISSING CLIP 0 | errors 0
```

Stance proved numerically by `scripts/board-stance-tests.ts` (in the vitest
suite): hips 74° across the deck, head 0.0–2.6° off the direction of travel,
feet 0.346m apart along the board vs 0.123m across.
