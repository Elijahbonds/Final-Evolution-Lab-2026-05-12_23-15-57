# Concept Lock — Dunk Duel (head-to-head)

**Benchmark (RE-LOCKED by Elijah, 2026-09-01, §7.3): the REAL dunk contest
platform** — the same NBA Live 08 contest standard as `dunk` (judged panel,
variety memory, run-up air budget, physical props), played HEAD-TO-HEAD.
The owner is explicit: `dunk` and `dunkduel` are TWO DIFFERENT modes — same
contest bar, different frame. Replaces the bare "NBA Live" lock. Recorded in
`PHASE2_BENCHMARK_LOCKS.md` → POST-LOCK RE-LOCKS.

**Mode id:** `dunkduel` · **Implementation:** `lib/babylon/modes/DunkDuelMode.ts`
· **Route:** `/play/dunkduel`

A real dunk contest, head-to-head, in one sentence: two dunkers alternate
attempts in front of the same judges, and the panel remembers everything —
repeat yourself and it costs you, walk up and the air isn't there, clip the
chair and the dunk dies at the chair.

---

## A. The duel frame (predates this pass, verified)

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Real head-to-head | ✅ pass-and-play, alternating attempts — the honest local frame (remote/IRL-video rides the ghost pipeline; deliberately not faked) |
| A2 | The same judges score every attempt | ✅ shared `judgeDunk` panel |
| A3 | Higher total takes the duel; ties named | ✅ `advance()` + DEAD HEAT |
| A4 | A handoff beat between dunkers | ✅ `PASS TO P2` — the device changes hands |
| A5 | Per-phase watchdogs | ✅ `BUDGET_SEC` ladder |

## B. The contest bar (this pass's build — what the re-lock named)

| # | Criterion | Status |
|---|---|---|
| B1 | Variety is scored | ✅ per-player variety memory: repeating your own style+prop combo costs 20% of difficulty, named in the result banner ("JUDGES HAVE SEEN THAT ONE"). P2 answering P1's dunk is NOT penalized — the memory is per player; execution decides the answer |
| B2 | The approach is part of the dunk | ✅ peak run-up speed scales the apex (0.85× walk-up … 1.15× full runway) AND the judges' difficulty read (+1.0 at full speed); the hint teaches it ("come in FASTER") |
| B3 | Props change the dunk, the risk, the reaction | ✅ THE CHAIR: arm with d-pad (couch) or X (phone); +2 difficulty cleared; crossing below 1.30m KILLS the dunk mid-air and the chair topples — "CAUGHT THE CHAIR — BLOWN". Both players get the identical option |
| B4 | The landing counts | ⏸ DEFERRED — same collision as Dunk Contest (the rim-hang hold owns the landing beat); recorded there, same reason here |
| B5 | The panel reacts in the moment | ✅ staged five-card reveal renders on the bezel (was published-but-never-drawn — trap #4, ninth occurrence) |

## C. Platform

| # | Criterion | Status |
|---|---|---|
| C1 | Every verb on the touch overlay | ✅ SLAM/STYLE/CHAIR/CHARGE + stick |
| C2 | Phones can join (Controller Link) | ✅ schema added (was absent); dpad as `move`, `charge` hold idiom, CHAIR on X because the d-pad is the stick |
| C3 | The bezel renders what the mode publishes | ✅ dunkNum/style/prop/charge/slamPulse/judgeReveal all added |
| C4 | The frame survives StrictMode | ✅ canvasOwner guard ported |
| C5 | The recap tells the truth | ✅ host read `outcome === 'WIN'` vs the mode's P1_WINS/P2_WINS/DUEL_TIED and a stats.p1Score that never existed — every recap was a 0–0 "DEAD HEAT!"; fixed |
| C6 | The camera follows whose turn it is | ✅ `heroRef` re-points at the active dunker on handoff (P2's game was framed against P1 on the bench) |

---

## D. Deviations

**D1 — The bench-toss alley-oop. → DEFERRED.**
The duel-native prop: the benched player throws the lob for the active
dunker (real contests have assist dunks). It needs a second input surface
mid-attempt (bench timing + toss), which is a real interaction build, not a
port. Recorded with the reason.

**D2 — Landing-as-input. → DEFERRED** (B4): collides with the rim-hang hold,
same as Dunk Contest. Recorded, not silently dropped.

**D3 — Two dunks each. → RULED, kept.**
Duel pacing: four attempts total keeps the handoff rhythm tight and the
variety memory biting by dunk two. Recorded.

---

## E. Exit criteria

Parity when A1–A5, B1–B5, C1–C6 hold, with D1/D2 deferred and D3 ruled.

**Currently: all hold.**
