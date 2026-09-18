# Concept Lock — Gymnastics (Vault)

**Benchmark (LOCKED, `PHASE2_BENCHMARK_LOCKS.md`): Wii Sports Bowling (adapted)**
— *"Judged performance with timing windows; closest AAA analogue for
'performance sport'."* The adaptation target is the VAULT: a judged run-up,
one explosive contact, a stuck (or not) landing.

**Mode id:** `gymnastics` · **Implementation:** `lib/babylon/modes/AirSessionMode.ts`
(the shared `makeAirSessionMode` factory over `lib/feel/cores/vault-skin.ts`)
· **Route:** `/play/gymnastics`

---

## A. Event format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Judged performance: attempts, best counts | ✅ | `VAULT_TUNING.attemptsPerRound` (2), `winScore` 800 |
| A2 | Timing windows ARE the mechanic | ✅ | `RhythmCadence` (230ms target), stick window |
| A3 | A run-up the player builds | ✅ | alternating strides drive `state.speed` |
| A4 | Readable landing grades | ✅ | stuck / clean / sketchy / crash with distinct banner, colour, scorePop and crowd level |
| A5 | A win threshold a run can be measured against | ✅ | 800 — measured reachable (a stuck vault reads ~590; two strong vaults clear it) |

## B. The vault itself

| # | Criterion | Status |
|---|---|---|
| B1 | Cadence quality changes the run speed | ✅ perfect/good/fault impulses |
| B2 | The table punch is earned by the run | ✅ `launchSpeed` comes from the run |
| B3 | Air and rotation are real state | ✅ the core reports a genuine 3D position |
| B4 | The landing is an input with a window | ✅ `core.stick()` in the Air phase |

## C. Presentation — what a judged event needs

| # | Criterion | Status |
|---|---|---|
| C1 | The grade lands as a MOMENT (banner, colour, juice) | ✅ |
| C2 | **The next stride foot is shown** | ✅ **D1 fixed** — the bezel dropped it |
| C3 | **A crowd watches** | ✅ **D2 fixed in Phase 6** — instanced gallery, cheers by grade |

---

## D. Deviations

**D1 — The cadence readout was invisible on the shipping bezel. → FIXED.**
The mode publishes `nextFoot` (which stride comes next — the cadence
mechanic's core readout), `combo` and `best`; the host rendered
score/attempt/phase/speed/height/spin/banner only. Trap #4 ("HUD state is
not a bezel"), seventh recorded occurrence. The host renders all three now.

**D2 — A judged event played to an empty park. → FIXED in Phase 6.**
`buildPark` gave a boundary and graffiti ambience but no living crowd. The
shared factory now builds a 12-strong instanced gallery flanking the runway
(2 draws), cheering by grade — both air-session modes get it, because the
factory is the one place they share (its own convention: "never forked").

**D3 — Two attempts, best counts. → RULED, kept.**
Real vault finals are two vaults with the average/best counting; the mode's
`attemptsPerRound: 2` with `winScore` is the arcade read of that. Recorded.

**D4 — No judge PANEL.** → RULED OUT for this benchmark.
The dunk contest's five-judge staged reveal exists because NBA Live 08's
contest is ABOUT the panel. Wii Sports Bowling's adaptation is a timing
performance, not a judged-by-personalities one — the grade ladder (stuck →
crash) is the presentation the benchmark supports. Recorded so nobody
re-litigates it.

---

## E. Exit criteria

Parity when A1–A5, B1–B4, C1–C3 hold, with D3/D4 ruled.

**Currently: all hold.**
