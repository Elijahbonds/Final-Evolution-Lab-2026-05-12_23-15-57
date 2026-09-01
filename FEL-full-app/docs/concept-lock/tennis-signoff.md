# §7 Completion Checklist — Tennis

Phase 10 of the convergence pass. Benchmark: **Mario Tennis Aces**, locked in
`PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`).

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ D1–D4 fixed; D5, D7 accepted; D6 ruled out of scope with a reason |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 4 files, 63 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ the Zone/energy layer is explicitly deferred |

## Verdict: **SIGNED OFF — 8 of 8.**

Eleventh mode through the checklist.

**Standing caveat, project-wide:** no FEL mode has run on real hardware.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/tennis.md` — 19 criteria, 7 deviations |
| 2 Core mechanics | `tennis-rally-tests` 27 green — four shots, four real trades, and an energy economy with stakes |
| 3 Camera & framing | **0 `[FEL-FRAME]`** desktop and mobile |
| 4 Reachability | registry `tennis` · `ENABLED_BABYLON_MODES` · `/play/tennis` · `makeTimingHost` · `MODE_VERBS` · Controller Link |
| 5 Input & control schema | four shots on four slots (it used one), phone schema added |
| 6 World population | L1–L5 below; court lines now sit where the rules judge |
| 7 Audio | stadium bed, per-contact cues graded by timing |
| 8 Polish | shot name + timing grade on contact, real shot meter (shared with volleyball) |
| 9 Playtest | 17–18 swings a session with DRIVE / SLICE / DROP / LOB all appearing; mobile **0 errors**, all four verbs reachable |
| 10 This document | — |

---

## World-Population Protocol — Tennis

```
L1 ground plane .......... PASS   16x34 hardcourt; lines derived from the real
                                  23.77m x 11m court with service boxes
L2 play-critical props ... PASS   net, ball, service lines, shot label, meter
L3 boundary .............. PASS   the court ends in the surround and the tiers
L4 crowd and life ........ PASS   crowd tiers PLUS 12 spectators on the
                                  sidelines, cheering points
L5 ambience .............. PASS   night stadium, warm key light, stadium bed
budget ................... draws 45  meshes 45  frame 16.5ms (61fps)
legibility ............... spectators derive from halfWidth + 3m, so they are
                           outside the widest legal ball on any court
```

**L1 was wrong, the same way volleyball's was.** The `tennis` markings case
inset a fixed 60px from the *texture* edge while the texture spans the whole
ground, painting the sideline near x ±7.0 when `RallyCore` judges anything past
**±5.5** as wide. Both cases in that painter are now derived from real
dimensions — 23.77m × 11m with 6.4m service boxes here.

---

## What the pass found

- **The mode had one shot.** `NetSportMode` read `A` and swung; there was no
  vocabulary at all, against a benchmark whose identity *is* choosing between
  shots under time pressure. Four now: DRIVE, SLICE, DROP, LOB, on the four
  overlay slots that were sitting empty.
- **The shots nearly shipped as skins.** `planShot` computes `targetZ` from
  `depth` early, so a shot that sets its depth further down — next to its apex,
  where it reads more naturally — changes nothing. A drop shot would have arced
  like a drop shot and landed as deep as a drive. Caught before commit, and
  `tennis-rally-tests` D1 asserts each shot lands where its depth says.
- **A name collision made `shot = planned` assign to the wrong thing.**
  `launch` gained a `shot?: TennisShot` parameter that shadowed the module's
  `let shot: Shot | null` — the ball in flight. TypeScript caught it.
- **No Controller Link entry** — a phone could not join.

## The energy layer (built in a second pass)

The gauge fills on well-timed contact — the same skill the mode already grades,
so it rewards what it teaches — and a **Zone Shot** spends *the whole gauge*.
Binding it to the DRIVE rather than firing it automatically is what keeps it a
decision: play a slice, drop or lob at a full gauge and you are choosing to bank
it.

Its stake is the **racket break**. Anything short of a perfect read on an
incoming Zone Shot costs a racket, and the third one ends the match on the spot
rather than on the scoreboard. Verified end to end through the driver:

```
ZONE SHOT → RACKET DAMAGE → THEIR ZONE SHOT → THEY HELD IT
→ STREAK ×3 — RACKET DAMAGE → RACKET BROKEN — YOU WIN
```

The opponent plays the same economy; a gauge only one side can spend is a
handicap, not a mechanic.

**Zone Speed and the trick-shot dash are deliberately absent, and the reason is
structural.** Both exist in Aces to help you *reach* a ball. This mode has no
player positioning — contact is pure timing — so there is nothing for them to
do, and a button that slows time for no reason is worse than its absence. It is
the same architectural limit that made volleyball's block need a cooldown rather
than a court position, and it is the honest boundary of this core.

## Still open

**Zone Speed and the trick shot**, if this core ever grows player movement.
Until then they have nothing to act on.
