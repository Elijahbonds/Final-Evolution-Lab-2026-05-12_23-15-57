# §7 Completion Checklist — The Cypher (dance)

Benchmark: **Class of 3000 music games** (re-locked by the owner 2026-09-01;
was Just Dance). Mode id `dance`, route `/play/dance`, shared timing host.
Implementation: `DanceMode.ts` + `DanceCore` + the new `StemBand`.

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified | ✅ `gate0-rig-tests` 58 green |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ below |
| 7.3 | Benchmark parity | ✅ A1–A4, B1–B7, C1–C4; D1/D3 ruled, D2 deferred |
| 7.4 | World-Population Protocol | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ 77 tests (dance-depth-tests added) |
| 7.7 | No orphaned-mode work smuggled in | ✅ DanceCore's new args are optional; StemBand is additive |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

---

## Phase-by-phase, with the proof

| Phase | Proof |
|---|---|
| 0 Platform preconditions | gate0 58 green |
| 1 Concept Lock | `docs/concept-lock/dance.md` — 15 criteria, 3 deviations |
| 2 Core mechanics | `dance-depth-tests.ts` (32 checks) — mix math, step-carrying judgements, bezel wiring |
| 3 Camera & framing | **FEL-FRAME 0** on dev, `/play/dance`, and mobile |
| 4 Reachability | registry `dance` · `/play/dance` · `MODE_VERBS.dance` (TAP) · Controller Link schema ADDED |
| 5 Input & control schema | verb-key-alignment green; one verb is the honest input surface (D3) |
| 6 World population | L1–L5 below |
| 7 Audio | THE POINT: seven synthesized stems earned by the dancing, on the song clock; judgement SFX kept |
| 8 Polish | cue + beat pulse + combo + MIX + EARLY/LATE misses + join banners |
| 9 Playtest | `dance-drive.mts` — taps the cue on the audio clock: KEYS/DRUMS/PERC join, combo 10, result ★ 41% · MIX 34%, FEL-FRAME 0 / MISSING CLIP 0. Mobile: touch TAP scored 105 PTS with the cue + MIX live at 61fps, errors 0 |
| 10 This document | — |

## World-Population Protocol — applied

```
L1 ground plane .......... PASS  the stage deck
L2 play-critical props ... PASS  the podium (scaled — the dancer stands ON it)
L3 boundary .............. PASS  back wall + banner
L4 crowd and life ........ PASS  crowd tier prop + the BAND (the room is the
                                 instrument you are building)
L5 ambience .............. PASS  neon night grade, magenta sky
budget ................... PASS  15 draws / ~26MB vram / 61fps on mobile
legibility ............... PASS  cue bottom-center, MIX bar left, beat dot top
```

## What this pass found and fixed

1. **Mirrored dance steps had never played** — `_pN` instance suffixes on the
   procedural rig's transform nodes defeated `bareBoneName`, so
   `registerMirroredClips` built groups with ZERO bone targets and disposed
   them; every `.M` step was a MISSING CLIP. Root-fixed in `boneLookup.ts`
   (the file that exists to absorb exactly this class), and mirrored dance
   motion now builds from the dance clips themselves. The mirrored-clips
   disposal now WARNS instead of vanishing.
2. **The mode was unplayable-by-design**: no cue — steps arrive at unknown
   times on unknown beats. A perfect-cadence bot hit 8%, then 28% reading the
   beat pulse. The NEXT-move cue with countdown is the fix, and the driver's
   accuracy jumped to 43% reading it.
3. **Early taps were wild misses** — a tap 100ms before the step had no
   pending step to judge against. The window is symmetric now (early taps
   inside 0.2s judge against the upcoming step).
4. **The 3-arg adapter silently dropped the new args** —
   `perf.onJudged = (l, p, c) => onJudged(ctx, l, p, c)` meant the band never
   heard a step and EARLY/LATE never arrived. The class of bug optional-args
   exist to prevent, introduced by an adapter anyway. Pass-through now.
5. **combo was published and never rendered** (the family trap), plus the
   energy bar now wears the mode's own label (MIX).

## Carry-forwards

1. **Procedural stand-in clips** (D1, ruled) — the authored-pack swap stays
   code-free via the alias table.
2. **Free-mix sandbox belongs to Groove Academy** (D2, deferred).
3. **Camera-tracked dancing belongs to the IRL stack** (D3, ruled) — and is
   the natural foundation for the Prove It (dunkduel) rebuild.
4. Driver accuracy (43%) is driver skill, not a mode defect — the judgement
   deltas are honest; a human watching the cue does better than a CDP loop.
