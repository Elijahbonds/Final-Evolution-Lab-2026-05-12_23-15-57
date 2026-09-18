# Concept Lock — Surf Break

> **Status (2026-09-03):** the criteria table below is the PRE-FIX snapshot from the concept lock. Every ❌ it lists was worked in the convergence pass; `surf-signoff.md` records which were fixed, which were accepted and why. Read the two together.

**Benchmark (LOCKED): SSX.**
Locked in `PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`), in the
*Already-Locked (from audit)* list. Not invented here (§7.3).

**A note on the pairing, because it matters for every criterion below.** SSX is
a snowboarding game; this is a surf mode. The lock is real and I am not
substituting a different title for it (§7.3 forbids inventing a benchmark, and
that includes quietly swapping one). What SSX supplies is a **systems** model,
not a subject model: a timed run down a hazard-strewn line, trick scoring with
bail risk, a flow/boost economy that rewards commitment, and wipeout-and-recover
as a rhythm rather than a game over. Those are what this lock holds the mode to.
Where SSX's *subject* has no surf analogue — snow terrain, mountain routing —
the criterion is marked **N/A (benchmark subject mismatch)** rather than faked.
If Elijah wants a surf-native benchmark instead, that is a lock change, not a
phase decision, and this document should be re-cut against it.

**Mode id:** `surf` · **Implementation:** `lib/babylon/modes/SurfBreakMode.ts`
**Route:** `/dev/mode/surf` · **Host:** `components/games/board-babylon.tsx`

---

## A. The run — SSX's session shape

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | A timed run that ends in a single score | ✅ 90s | `RUN_SEC` |
| A2 | The line is a moving thing you must keep up with, not a static course | ✅ the wave | `waveLipAt(t)` |
| A3 | Falling behind the line ends the ride | ✅ | `ahead < -0.5` → wipeout |
| A4 | Hazards on the line punish a lazy route | ✅ 4 buoys | `world.obstacles` |
| A5 | Wipeout is a rhythm, not a game over — you recover and continue | ✅ | `wipeout()` respawns |
| A6 | Mountain routing / multiple descent lines | N/A — benchmark subject mismatch | one wave |

## B. Flow economy — SSX's boost meter, as a wave has it

| # | Criterion | Status | Where |
|---|---|---|---|
| B1 | A meter that fills by riding well | ✅ `flow` 0–200 | pocket riding |
| B2 | The meter decays when you ride badly | ✅ `-30/s` off-pocket | `flow = max(0, ...)` |
| B3 | A high meter pays more per second | ✅ `10 + flow/10` | score trickle |
| B4 | A committed high-risk position pays double | ✅ the open tube | `mult = hollow ? 2 : 1` |
| B5 | Holding the risky line long enough banks a bonus | ✅ ≥1.5s → +250 | `BARREL_HOLD_SEC` |
| B6 | The risky window is VISIBLE before you commit to it | ✅ the tube breathes | 18s cycle, 8s open |
| B7 | The meter is spendable as a burst | ❌ **D2** | no spend path |

## C. Trick and control layer

| # | Criterion | Status | Where |
|---|---|---|---|
| C1 | Air tricks off the lip | ✅ `A` | `rider.jump()` |
| C2 | A held grab | ⚠️ **D1** gamepad/key only | `TRICKS.grab` |
| C3 | A carve that is a turn, not a pivot | ✅ **D3 fixed this pass** | `CUTBACK_RATE = 6` |
| C4 | Cutback scores and scales with flow | ✅ `40 + flow/4` | |
| C5 | Speed is positional (the pocket), not a throttle | ✅ | `MAX_FORWARD_SPEED = 9` |
| C6 | The rider reads as a surfer, sideways on the board | ✅ **fixed this pass** | `boardSuite.ts` |

---

## D. Deviations — fix, defer to a named phase, or rule out of scope

**D1 — Half the mode's verbs are unreachable on touch. → PHASE 5.**
`modeVerbs.ts` gives surf exactly two buttons: `A` (AIR) and `Y` (CARVE). The
mode also reads `B` (cutback) and `X` (grab). On a phone, **the cutback and the
grab do not exist** — and the cutback is one of only two scoring actions a
player can actively take. Skate gets four verbs on the same overlay; surf gets
two. This is the highest-priority remaining defect in the mode.

**D2 — The flow meter cannot be spent. → PHASE 2.**
SSX's boost meter is a resource you *spend* for a burst. `flow` here only gates
a passive score trickle; there is no action that consumes it. B1–B6 hold, B7
does not, and B7 is the half that makes the meter a decision rather than a
readout.

**D3 — The cutback snapped 90° in one frame. → FIXED (this pass).**
`root.rotation.y += PI * 0.5` teleported the board's facing. A cutback is the
most drawn-out turn in surfing; the instant pivot also whipped the chase camera
hard enough to lose the rider, which was the source of surf's last two
`[FEL-FRAME]` lines and of wipeouts the player did not cause.

**D4 — The HUD shows none of the flow economy. → PHASE 8.**
The mode publishes `flow`; the shared host renders **time, coins, score,
banner**. The meter that the entire B section is about is invisible to the
player. It also renders a coins counter that surf never sets, so a permanent
`◈ 0` sits on screen. Shared with skate D4 / snowboard D4 — one host fix.

**D5 — `tricks.score` is the score, and it is a second scoring system. → ACCEPTED
for surf.** Unlike skate (where `ComboChain` was the live scorer and
`TrickMachine` a dead parallel), surf uses `TrickMachine` as its *only* scorer
and does call `tricks.update(dt)`. It is coherent. Recorded so the next reader
does not "fix" it into the skate shape.

**D6 — Wave is a single repeating lap. → OUT OF SCOPE (v1).**
`WAVE_LAP = 140` wraps the rider and wave in lockstep. One break, ridden
repeatedly, is the scope; a reef/beach-break variety pass is not in v1.

**D7 — No paddling, no duck-diving, no take-off. → OUT OF SCOPE (v1).**
The ride starts on the wave. Surf-sim fidelity is not what the SSX lock asks
for, and adding a take-off phase would be a different mode.

---

## Verification state at lock time

Through `/dev/mode/surf`, driven by `scripts/capture-mode-play.mts`
(`PUMP=1 HOLD=600 GAP=80 KEYS=j,k`), two consecutive runs:

```
score 200 · no unearned wipeouts
FEL-FRAME 0 | MISSING CLIP 0 | errors 0
```


---

## World population — L4

The venue was empty. `Onlookers` (`lib/babylon/visual/`) now places beachgoers on the sand,
positioned by the venue itself via `RideWorld.crowdSpots` rather than by the
mode. They react to a banked barrel, and the cheer decays. Two master meshes plus
hardware instances — no rig, no skeleton, no animation group — and nothing in
the crowd is pickable, so it can never be dragged into the camera's occlusion
probe. Behaviour is asserted in `skate-run-tests` F1–F8 against the shared
class.
