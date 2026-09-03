# Concept Lock — The Cypher (dance)

**Benchmark (RE-LOCKED by Elijah, 2026-09-01, §7.3): Class of 3000 music
games** — André 3000's Cartoon Network show: playful, instrument-stem mixing.
"the music game more like andre 3000 music game." Replaces the Just Dance
lock. Recorded in `PHASE2_BENCHMARK_LOCKS.md` → POST-LOCK RE-LOCKS.

**Mode id:** `dance` · **Implementation:** `lib/babylon/modes/DanceMode.ts`
over `DanceCore`, with the procedural `StemBand` (`lib/babylon/audio/StemBand.ts`)
· **Route:** `/play/dance` (shared timing host)

Class of 3000 in one sentence: the music is made BY playing — instruments
layer in as you perform, and the track you end with is the one you built.

---

## A. The rhythm core (predates this pass, verified)

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Timing on the AUDIO clock, never the frame clock | ✅ | the mode's AudioContext is the song clock |
| A2 | Tiered judging | ✅ | PERFECT/GREAT/GOOD ±40/90/200ms |
| A3 | A real routine, seeded and repeatable | ✅ | `generateRoutine` (mulberry32) |
| A4 | Star-rated results | ✅ | 0–5 stars + accuracy |

## B. The Class of 3000 layer (this pass's build)

| # | Criterion | Status |
|---|---|---|
| B1 | Every move family is an instrument | ✅ bounce→DRUMS, footwork→BASS, wave→KEYS, toprock→PERC, freeze→HORNS, power→LEAD, transition→FX (`CATEGORY_STEM`) |
| B2 | The band is EARNED | ✅ `StemBand.judge` — hits turn the step's instrument up, misses duck it; four misses silence it |
| B3 | No assets required | ✅ all stems synthesized on the mode's own AudioContext (kick/snare/hats/bass/keys/horns/lead/fx) — the judging clock and the music can never drift apart |
| B4 | An instrument joining is a MOMENT | ✅ "DRUMS JOIN THE MIX" banner; the MIX meter on the bezel; the result names the band you built ("MIX 34%") |
| B5 | The cypher shows its cards | ✅ NEXT-move cue with countdown, gold inside the last 0.35s ("NOW — TWO STEP") — before this, a perfect-cadence beat bot hit 28%: most beats have no step, and nobody could see which did |
| B6 | Misses say why | ✅ MISS — EARLY / MISS — LATE (signed delta through the judge callback) |
| B7 | The window is symmetric | ✅ an early tap inside 0.2s counts against the UPCOMING step (was: wild miss — every slightly-early tap scored a MISS) |

## C. Platform

| # | Criterion | Status |
|---|---|---|
| C1 | Mirrored steps actually PLAY | ✅ `_pN` instance-suffix stripped in `bareBoneName` — measured: registerMirroredClips had resolved ZERO bone targets on the procedural rig; every `.M` step was a MISSING CLIP. Mirrored dance motion now builds from the dance groups themselves |
| C2 | The bezel renders what the mode publishes | ✅ combo chip + beat pulse dot + MIX bar + cue (combo was published-only — the family trap again) |
| C3 | Phones | ✅ TAP verb on the overlay; Controller Link schema added |
| C4 | The venue is a cypher | ✅ podium stage, neon, crowd tier |

---

## D. Deviations

**D1 — The steps are procedural stand-ins, not mocap. → RULED (pre-existing).**
`danceClips.ts` is explicit: readable, on-beat, distinct — replace when an
authored pack lands; the alias fallback makes that swap code-free. Recorded.

**D2 — The band is a fixed funk arrangement, not free mixing. → DEFERRED.**
Class of 3000's Funk Box is a sandbox; The Cypher is a judged routine where
the mix is EARNED. A free-mix sandbox mode is a Groove Academy feature
(musicAcademy), not this mode. Recorded.

**D3 — One input (TAP), not full-body tracking. → RULED for this route.**
Camera-tracked dancing belongs to the IRL stack (mirror pipeline), not the
Babylon route. Recorded so it is not re-litigated.

---

## E. Exit criteria

Parity when A1–A4, B1–B7, C1–C4 hold, with D1 ruled, D2 deferred, D3 ruled.

**Currently: all hold.**
