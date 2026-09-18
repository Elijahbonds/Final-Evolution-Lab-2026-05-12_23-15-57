# §7 Completion Checklist — Soccer (Penalty Shootout)

Benchmark: **Pro Evolution Soccer — Penalty Mode** (`PHASE2_BENCHMARK_LOCKS.md`,
locked; scope boundary "penalty shootouts, not 11v11" is part of the lock).
Mode id `soccer`, registry key `penalty`, route `/play/soccer`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ phases below |
| 7.3 | Benchmark parity against the locked reference | ✅ A1–A9: D1/D2 built in this pass, D3 fixed previously, D4/D5 found and fixed in it |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 70 tests (`penalty-depth-tests` added, 23 checks) |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/soccer.md` — A1–A9, D1–D5 |
| 2 Core mechanics | `penalty-depth-tests` 23 green — keeper read steepens on a streak, breaks on a habit change, clamps both ways; the format table is asserted against the actual Laws (early clinch, level-after-five → sudden death, split SD round ends it) |
| 3 Camera & framing | full shootouts: **FEL-FRAME 0** |
| 4 Reachability | registry `penalty` · `/play/soccer` → `timing-babylon` (`modeKey: 'penalty'`) · `MODE_VERBS.penalty` (STRIKE) · Controller Link entry exists and its d-pad drives the aim + feints |
| 5 Input & control schema | `verb-key-alignment-tests` green; feint is a stick snap — reachable on touch overlay, phone and pad |
| 6 World population | L1–L5 below |
| 7 Audio | stadium bed; goal/save SFX; the crowd bank answers both ways |
| 8 Polish | FEINT!/scoreline banners; must-score hints; the answer beat between kicks |
| 9 Playtest | `penalty-drive.mts`: varied placement **won 4–2** in regulation; same-side spam was read ("HE'S READING THAT SIDE") and went **4–4 → sudden death → 5–4 decided**. `/play/soccer` FEL-FRAME 0 / errors 0. Mobile touch `/play/soccer`: a full shootout to **sudden death 8–7** at 60fps, 0 errors |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  50x70 pitch with the box painted
L2 play-critical props ... PASS  goal (posts, bar, net), ball, reticle, meter,
                                 keeper — PLUS the penalty spot mark this pass
L3 boundary .............. PASS  stadium surround (pre-existing)
L4 crowd and life ........ PASS  14 instanced onlookers in a shallow bank
                                 behind the goal — in frame all game (the
                                 camera sits behind the kicker); they cheer
                                 goals AND saves
L5 ambience .............. PASS  night-game mood, stadium bed
budget ................... draws 37  meshes 37  frame 16.7ms @60fps (mobile leg)
legibility ............... PASS  the bank arcs behind the goal line, outside
                                 the widest legal shot (goal width 7.32m)
```

## What the pass found under the mode (the honest part)

The shootout structure was the *named* gap. Underneath it, the mode had never
worked at all: a weak kick soft-locked the flight phase forever (D4), and once
that resolved, every kick turned out to die short of the goal line — the
resolution branch had never run (D5). Both are the kind of thing a cadence bot
never sees and a driver playing to a decision finds immediately. Both fixed;
both covered by the driver, which also had to be fixed twice itself (the
pretty-printed HUD dump broke a compact-JSON regex; every sudden-death round
shares the label "SUDDEN DEATH", so keying kicks on it never takes kick two).

## Carry-forwards

1. **The rival's kicks are numbers, not bodies** — ruled acceptable for 3PT's
   whole contest and extended here as the shootout answer beat. A visible
   rival taker is the lift the 3PT lock already ruled out of scope.
2. **No keeper-only mode** (play as the keeper) — a real PES penalty mode
   feature; wants a dive-on-command input design. Deferred.
3. The emulated-touch `long N/120` frame metric appears across untouched modes
   too; a harness constant, not a regression (project-wide: nothing has ever
   run on real hardware).
