# §7 Completion Checklist — Gymnastics (Vault)

Benchmark: **Wii Sports Bowling (adapted)** (`PHASE2_BENCHMARK_LOCKS.md` —
"judged performance with timing windows"). Mode id `gymnastics`, route
`/play/gymnastics`. Implementation: the shared `makeAirSessionMode` factory
over the tuned `vault-skin` core.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ phases below |
| 7.3 | Benchmark parity against the locked reference | ✅ A1–A5, B1–B4, C1–C3; D1/D2 fixed, D3/D4 ruled |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 72 tests (`air-session-depth-tests` added, 25 checks; `air-session-tests` covers the tuned core) |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ Controller Link entry predates this pass |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/gymnastics.md` — 12 criteria, 4 deviations |
| 2 Core mechanics | `air-session-tests` (pre-existing, green) — cadence, launch, rotation, landing grades |
| 3 Camera & framing | **FEL-FRAME 0** on dev + shipping + mobile runs |
| 4 Reachability | registry `gymnastics` · `/play/gymnastics` · `air-session-babylon.tsx` host · `MODE_VERBS.gymnastics` (FLIP/STICK) · Controller Link entry present (predates pass) |
| 5 Input & control schema | `verb-key-alignment-tests` green; cadence is d-pad ←/→ — present on touch, keyboard, phone |
| 6 World population | L1–L5 below — the judged event now plays to a crowd |
| 7 Audio | score/miss by grade; crowd cheer by grade |
| 8 Polish | **D1: the cadence readout (`nextFoot`), combo and best now render on the bezel** — the mechanic was guesswork without it (trap #4, seventh occurrence) |
| 9 Playtest | `air-session-drive.mts` — 28 cadence strides on the mode's own NEXT-foot readout, air, trick, **STUCK IT!**, 590 pts; shipping route + mobile touch clean at 60fps |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  park venue ground + runway dash line
L2 play-critical props ... PASS  vault table at the core's own launchZ,
                                 athlete, grade readouts
L3 boundary .............. PASS  graffiti/boardwalk/ocean surround
L4 crowd and life ........ PASS  ADDED — 12 instanced onlookers flanking the
                                 runway (2 draws), cheering by grade:
                                 stuck 1.0 / clean 0.6 / sketchy 0.3 / crash 0.15
L5 ambience .............. PASS  daylight mood, venue effects
budget ................... draws 27  meshes 27  60fps on the mobile leg
legibility ............... PASS  banks at |x|=4, off the run line (-z runway),
                                 in the runner cam's frame edges
```

## Carry-forwards

1. **The final attempt's grade lands without its own banner beat** — the HUD
   attempt counter caps at "2/2", so the second landing reads the same as the
   second attempt's start. Cosmetic; the score and result are right.
2. **No judge personalities** (D4, ruled): the grade ladder is the
   presentation this benchmark supports. The dunk contest's panel is a
   different benchmark's requirement.
3. **winScore 800 is a TUNE value** — measured reachable (two strong vaults
   clear it), not yet human-tuned.
