# §7 Completion Checklist — Dunk Duel (head-to-head)

Benchmark: **the real dunk contest platform** — the NBA Live 08 contest
standard, head-to-head (re-locked by the owner 2026-09-01; `dunk` and
`dunkduel` are TWO DIFFERENT modes — same bar, different frame).
Mode id `dunkduel`, route `/play/dunkduel`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ below |
| 7.3 | Benchmark parity | ✅ A1–A5, B1–B5, C1–C6; D1/D2 deferred, D3 ruled |
| 7.4 | World-Population Protocol | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 76 tests (dunkduel-depth-tests added) |
| 7.7 | No orphaned-mode work smuggled in | ✅ shares JudgePanel/BallSim with dunk; no drift introduced |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/dunkduel.md` — 16 criteria, 3 deviations |
| 2 Core mechanics | `dunkduel-depth-tests.ts` (54 checks) — variety memory per player, run-up→apex math, chair physicality, bezel coverage, phone coverage |
| 3 Camera & framing | **FEL-FRAME 0** on dev drive, `/play/dunkduel`, and mobile; handoff re-points heroRef at the active dunker |
| 4 Reachability | registry `dunkduel` · `/play/dunkduel` · `MODE_VERBS.dunkduel` (CHAIR added) · Controller Link schema ADDED |
| 5 Input & control schema | verb-key-alignment green; chair on d-pad (couch) AND X (phone) |
| 6 World population | L1–L5 below |
| 7 Audio | whoosh/impact/score SFX; crowd cheer on big totals, groan on the blown chair |
| 8 Polish | judge reveal + charge meter + slam pulse on the bezel; variety + chair banners; run-up hint |
| 9 Playtest | `dunkduel-drive.mts` plays the full scripted contest: baseline dunk, the ANSWER (P2 unpenalized — memory is per-player), the REPEAT (P1 penalized, named), THE CHAIR walked up (blown mid-air, chair topples), duel decided. Mobile 390×844: P1 scored 40 off touch CHARGE→SLAM, handoff readout live, all four verbs on the overlay, 60fps, errors 0 |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  Venice court (VenueKit + ocean surface)
L2 play-critical props ... PASS  rim + THE CHAIR (physical: it kills dunks)
L3 boundary .............. PASS  venue walls
L4 crowd and life ........ PASS  the OTHER DUNKER on the bench spot + crowd
                                 audio answering every attempt
L5 ambience .............. PASS  goldenHour, ball trail
budget ................... PASS  60fps on the mobile leg (worst 19ms)
legibility ............... PASS  active-player readout centered; bench off-axis
```

## What this pass found and fixed

1. **The contest was invisible** (trap #4, ninth occurrence): the mode
   published dunkNum/style/prop/charge/slamPulse/judgeReveal — the bezel
   rendered none of them. The five-card judge reveal — the moment a dunk
   contest IS — existed only in a dev JSON dump. All render now.
2. **Every recap was a 0–0 "DEAD HEAT!"** — the host checked `outcome ===
   'WIN'` while the mode ends `P1_WINS`/`P2_WINS`/`DUEL_TIED`, and read
   `stats.p1Score` where the mode writes `stats.p1`. Same disease as
   mixedcombat's DEFEATED bug, same fix.
3. **No canvasOwner guard** — the StrictMode double-mount black-frame
   disease, fourth host. Ported.
4. **The variety banner was clobbered same-tick.** A standalone "SEEN THAT
   ONE" banner set inside the scoring branch never survived a frame — the
   result banner overwrote it in the same `setHud` flush (measured by the
   driver: repeat never showed). The repeat is now named IN the result
   banner: "P1 SCORES 31 — JUDGES HAVE SEEN THAT ONE".
5. **P2's game was framed against P1.** `heroRef` was set once at load; on
   handoff the camera tracked P2 while FrameGuard watched P1's bench spot.
   heroRef now re-points on every handoff.

## Carry-forwards

1. **Bench-toss alley-oop** (D1, deferred) — the duel-native prop: bench
   player throws the lob. Needs a second input surface mid-attempt.
2. **Landing-as-input** (D2, deferred) — same rim-hang collision as dunk.
3. **Two dunks each** (D3, ruled) — the variety memory is designed to bite
   by dunk two.
4. The `long N/120` emulated-touch metric appears across modes; a harness
   constant, not a regression.
