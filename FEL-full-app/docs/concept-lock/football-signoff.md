# §7 Completion Checklist — Football (Rush)

Benchmark: **Madden NFL (Arcade Mode, simplified)** (`PHASE2_BENCHMARK_LOCKS.md`
— "Pre-snap reads + carrier geometry + breakaway; street football variant").
Mode id `football`, route `/play/football`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ phases below |
| 7.3 | Benchmark parity against the locked reference | ✅ A1–A4, B1–B6, C1–C3; D1–D3 built this pass, D4/D5 ruled |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 71 tests (`football-rush-tests` added, 33 checks) |
| 7.7 | No orphaned-mode work smuggled in | ✅ (the dead `FootballMode.ts` is untouched — the live mode is `FootballRushMode.ts`, registered as `football`) |
| 7.8 | No scope bleed into §6 features | ✅ the Controller Link entry is this mode's Phase 5 |

## Verdict: **SIGNED OFF — 8 of 8.**

First of the untouched ten through the checklist.

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/football.md` — 13 criteria, 6 deviations |
| 2 Core mechanics | baseline drive: 390 pts / 2 evades / 3 coins; the evade/truck/style-chain/breakaway economy predates this pass and measured fine |
| 3 Camera & framing | FEL-FRAME 0 on every capture this pass (runner preset, `update(subject, vel, null)`) |
| 4 Reachability | registry `football` · `/play/football` → `football-babylon.tsx` · `MODE_VERBS.football` · venue map · game-data |
| 5 Input & control schema | `verb-key-alignment-tests` 101 green · **Controller Link entry added (D2)** — `controller-link-tests` green; d-pad is 'move' so a phone can STEER |
| 6 World population | L1–L5 below |
| 7 Audio | stadium bed; truck/tackle/evade SFX; crowd cheer on touchdowns and truck knockdowns |
| 8 Polish | **pre-snap beat built (D1)** — set defense, READ THE FRONT, the snap is the player's call, auto-snap at 3s |
| 9 Playtest | `football-drive.mts`: nothing advances before the snap; auto-snap fires with zero input; the drive plays after it. `/play/football` and mobile touch `/play/football` both FEL-FRAME 0 / errors 0 at 60fps |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  44x90 gridiron, numbered yard lines, end zone
L2 play-critical props ... PASS  ballcarrier, defenders, coin lanes, yard lines
L3 boundary .............. PASS  bleacher-texture surround + floodlights
L4 crowd and life ........ PASS  ADDED — two 8-deep instanced sideline banks
                                 (2 draws), cheering touchdowns and trucks;
                                 previously a painted texture only
L5 ambience .............. PASS  night-game mood, stadium bed
budget ................... draws ~40  60fps on the mobile leg
legibility ............... PASS  banks at |x| 21.5, outside the 20m playing
                                 half-width, in the runner cam's frame edges
```

## What this pass changed, honestly

The mode's carrier game was already real (v5's truck/style-chain pass). What
was missing was everything AROUND it: the benchmark's *named* first mechanic
(pre-snap reads) did not exist, a phone could not join at all, the venue had
no living crowd, and — trap #4 again, sixth occurrence — the shipping bezel
rendered `hud.evaded`, a field the mode has never published, while `score`,
`toGo`, `breakaway`, `truckReady` and `hint` went undrawn.

None of that was visible from the dev route's JSON dump, which is exactly why
the trap keeps recurring; `football-rush-tests` now pins the host contract
source-level.

## Carry-forwards

1. **SPIN is keyboard-only on touch** (D4, ruled — the four-slot overlay
   budget). If the overlay ever grows a fifth slot, SPIN is the first tenant.
2. **No defensive pre-snap disguise** — the alignment you read is the coverage
   you get. Disguised fronts are the next depth item for this mode.
3. **Turnover on downs ends the run** (D5, ruled arcade format) — a Madden
   Arcade possession-swap wants the AI offence, which is the same large lift
   the 3PT/dunk locks already ruled out.
