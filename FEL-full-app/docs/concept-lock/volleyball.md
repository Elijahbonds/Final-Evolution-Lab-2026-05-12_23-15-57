# Concept Lock — Volleyball

**Benchmark (LOCKED): Nintendo Switch Sports — Volleyball.**
Locked by Elijah on 2026-08-31, recorded in `PHASE2_BENCHMARK_LOCKS.md` under
*Later Additions*. This mode shipped after that document was first written,
which is why it was absent from it and why the mode was blocked at Phase 1.

**A correction came with the lock.** `SESSION_STATUS_DASHBOARD.md` listed the
benchmark as *Wii Sports Resort*. That is wrong on its face — Wii Sports Resort
has no volleyball mode (swordplay, archery, bowling, table tennis, basketball,
golf, air sports, cycling, canoeing, wakeboarding, frisbee, power cruising) — and
the claim appeared nowhere in the authoritative lock and nowhere in
`VolleyballMode.ts`, unlike the board benchmarks which are corroborated in code.

**Mode id:** `volleyball` · **Implementation:** `lib/babylon/modes/VolleyballMode.ts`
(a thin config over `NetSportMode` + `RallyCore`)
**Route:** `/play/volleyball` · **Host:** `makeTimingHost`

---

## A. The rules — real volleyball, which the benchmark also follows

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Three touches per side, then it is a fault | ✅ | `TouchTracker`, `touchesPerSide: 3` |
| A2 | Rally scoring — every rally scores, whoever served | ✅ | `RallyCore.award()` |
| A3 | Sets to 25 | ✅ | `target` |
| A4 | Win by 2 | ✅ | `mine - other >= 2` |
| A5 | A hard cap so a set cannot run forever | ✅ 30 | `cap` |
| A6 | A net high enough that weak contact is dug into the tape | ✅ 2.24m | `netHeight` |
| A7 | Court dimensions in proportion | ✅ 9 × 4.5 half | `halfLength/halfWidth` |

> **A6 note.** 2.24m is the **women's** indoor net height; men's is 2.43m. Either
> is defensible for a party-arcade mode and the choice should be deliberate
> rather than incidental — recorded, not "fixed", because the benchmark is a
> Nintendo party game and not a regulation simulator.

## B. The rally loop — what Switch Sports actually plays like

This is the section that matters, and the one the mode does not yet meet.

| # | Criterion | Status | Where |
|---|---|---|---|
| B1 | The three touches are DIFFERENT actions: bump, set, spike | ❌ **D1** | all three are one generic hit |
| B2 | The spike is the payoff — the reason to build a rally | ❌ **D1** | no spike |
| B3 | Blocking at the net as a distinct defensive act | ❌ **D2** | absent |
| B4 | Timing against the ball's arrival decides contact quality | ✅ | `shotMeterT`, `humanSwing` |
| B5 | Aim is a player intent, not automatic | ✅ | `aimX` from the stick |
| B6 | A rally reads as a sequence, not an exchange | ⚠️ partly | the 3-touch limit exists; the variety does not |

## C. Reachability and control

| # | Criterion | Status | Where |
|---|---|---|---|
| C1 | Registry entry, enabled, routed, hosted | ✅ | `/play/volleyball` |
| C2 | A touch entry that names the mode's verbs | ✅ **D3 fixed** | `MODE_VERBS.volleyball` |
| C3 | Controller Link schema | ❌ **D4** | no entry |
| C4 | Camera holds the rally | ✅ 0 `[FEL-FRAME]` | baseline capture |

---

## D. Deviations

**D1 — The three touches are one touch, three times. → PHASE 2. The headline.**
`TouchTracker` enforces `touches > 3 → fault` and nothing else: bump, set and
spike are the same generic hit with the same input and the same result. In the
locked benchmark the *sequence* is the game — you bump to control, set to place,
and spike to win the point, and the spike is the moment the whole rally exists
to reach. A mode that models the three-touch **limit** without the three-touch
**vocabulary** has the rule but not the sport.

**D2 — No block. → PHASE 2, after D1.**
The defensive answer to a spike. Meaningless until there is a spike to answer.

**D3 — No `MODE_VERBS` entry at all. → FIXED (this pass).**
Touch fell through to `MODE_VERBS.default`, a single generic ACTION button —
the original `karate_vs` bug, in a mode that shipped. It survived the guard
written to prevent it because that guard scanned host components for a *static*
`modeId` literal, and volleyball is served by `makeTimingHost` with a variable.
The guard now asks the **registry** instead: every mode in
`ENABLED_BABYLON_MODES` must have an entry. It caught volleyball and only
volleyball.

**D4 — No Controller Link schema. → PHASE 5.**
`isControllerEnabled()` is a plain `modeId in MODE_CONTROLLERS`, so an absent
mode is not an error — it is a phone that never gets to join, silently. Same
gap the three board sports had.

**D5 — Scored 0–1 against the AI over a scripted run. → PHASE 2, needs a real
driver.** The generic capture bot taps A on a fixed cadence, which is not how a
timing mode is played, so this number says little about balance yet — the same
ambiguity that sent me after snowboard's gates when the fault was propulsion.
A timing-aware driver is needed before any balance claim.

**D6 — `ambient: 'stadium'` is mapped from 'beach'. → ACCEPTED.**
Noted in the mode itself: `SoundKit` only accepts `'stadium' | 'dojo' | 'none'`.
An ocean bed exists (`'ocean'`, used by surf) and would suit a beach court
better; recorded as a cheap Phase 7 improvement rather than a defect.
