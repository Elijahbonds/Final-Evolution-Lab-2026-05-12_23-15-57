# §7 Completion Checklist — Snowboard Big Air

Benchmark: **SSX — Big Air discipline** (locked by the owner 2026-09-01 after
a §7.3 stop-and-ask: no benchmark existed in any governing doc).
Mode id `bigair`, route `/play/big-air`. Implementation: the shared
`makeAirSessionMode` factory over the `big-air-skin` core.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ below |
| 7.3 | Benchmark parity | ✅ A1–A5, B1–B4, C1–C3; D1 locked by owner, D2/D3 ruled, D4 deferred |
| 7.4 | World-Population Protocol | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 72 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ Controller Link entry predates this pass |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/bigair.md` — 12 criteria, 4 deviations |
| 2 Core mechanics | `air-session-tests` (pre-existing, green) — the shared core: cadence, launch, rotation, landing |
| 3 Camera & framing | **FEL-FRAME 0** on dev, shipping and mobile runs |
| 4 Reachability | registry `bigair` · `/play/big-air` · shared `air-session-babylon.tsx` host · `MODE_VERBS.bigair` (SPIN/STOMP) · Controller Link entry present |
| 5 Input & control schema | verb-key-alignment green; cadence d-pad ←/→ on every input path |
| 6 World population | L1–L5 below |
| 7 Audio | grade SFX; crowd cheer by grade |
| 8 Polish | cadence readout + combo/best render (gymnastics pass D1, shared host); gallery (D2, shared factory) |
| 9 Playtest | `air-session-drive.mts` CADENCE_MS=260: 33 pushes, air, trick, 2× CLEAN, 370; shipping + mobile clean at 60fps — phone bezel showed NEXT ◀ LEFT and BEST CLEAN |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  60x400 groomed slope with corduroy lines
L2 play-critical props ... PASS  kicker at the core's launchZ, gate flags,
                                 athlete, grade readouts
L3 boundary .............. PASS  treeline surround
L4 crowd and life ........ PASS  the factory gallery (12 instanced, 2 draws),
                                 cheers by grade — added in the gymnastics pass
L5 ambience .............. PASS  alpine mood
budget ................... draws ~27  60fps on the mobile leg
legibility ............... PASS  gallery flanks the run-in, off the fall line
```

## Carry-forwards

1. **Spin has no direction vocabulary** (D4, deferred): spinTurns is a scalar;
   SSX's grab × direction grammar belongs to a real air-core build.
2. **winScore 900 is a TUNE value** — measured reachable, not human-tuned.
3. The `long N/120` emulated-touch metric appears across untouched modes; a
   harness constant, not a regression (project-wide: no real-hardware run yet).
