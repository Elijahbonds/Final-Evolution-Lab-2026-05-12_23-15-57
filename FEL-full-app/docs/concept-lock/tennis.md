# Concept Lock — Tennis

**Benchmark (LOCKED): Mario Tennis Aces.**
Locked in `PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`), in the
TBD→decide table: *"Accessible arcade tennis with motion controls; matches FEL's
party/accessible vibe + timing depth"*.

**Mode id:** `tennis` · **Implementation:** `lib/babylon/modes/TennisMode.ts`
(a config over `NetSportMode` + `RallyCore`) · **Route:** `/play/tennis`

**Reading the benchmark.** Aces is an arcade tennis game whose depth is a **shot
vocabulary** — topspin, slice, flat, lob, drop — layered over timing, plus an
energy economy (Zone Shot, Zone Speed, trick shots, racket break). The vocabulary
is what makes a rally a conversation rather than a metronome, and it is the part
this lock holds the mode to. The energy layer is recorded and scoped below rather
than assumed in.

---

## A. The rules

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | One touch per side | ✅ | `touchesPerSide: 1` |
| A2 | 15/30/40, deuce and advantage | ✅ | `TennisScore` |
| A3 | Games, first to 4 | ✅ | `gamesToWin` |
| A4 | Court in proportion — 23.77m long | ✅ 24 | `halfLength: 12` |
| A5 | Doubles-width court | ✅ 11m | `halfWidth: 5.5` |
| A6 | Net height in the real range (0.914 centre – 1.07 posts) | ✅ 0.95 | `netHeight` |
| A7 | **Court lines drawn where the rules judge them** | ❌ **D1** | painted at ~±7.0, judged at ±5.5 |

## B. The shot vocabulary — what makes it Aces

| # | Criterion | Status |
|---|---|---|
| B1 | More than one shot | ❌ **D2** — a single generic swing |
| B2 | A driving baseline shot (topspin) | ❌ **D2** |
| B3 | A low, skidding shot (slice) | ❌ **D2** |
| B4 | A lob, to answer a player at the net | ❌ **D2** |
| B5 | A drop shot, to punish one at the baseline | ❌ **D2** |
| B6 | The shot chosen is a real decision, not a skin | ❌ **D2** |
| B7 | Timing still grades contact | ✅ `gradeSwing` |

## C. Reachability and control

| # | Criterion | Status |
|---|---|---|
| C1 | Registry, enabled, routed, hosted | ✅ |
| C2 | Touch overlay names the mode's verbs | ⚠️ **D3** — one slot of four |
| C3 | Controller Link schema | ❌ **D4** — no entry; a phone cannot join |
| C4 | Boots on a phone | ✅ **fixed** — see the volleyball sign-off |
| C5 | Camera holds the rally | ✅ 0 `[FEL-FRAME]` |

---

## D. Deviations

**D1 — The court lines are not the court. → PHASE 6.**
The `tennis` markings case insets a fixed 60px from the *texture* edge, and the
texture spans the whole 16×34 ground, so the sideline paints at roughly x ±7.0
while `RallyCore` calls anything past **±5.5** wide. Identical to the defect
found in volleyball this week, in the same painter. *A wrong marking is a wrong
game.*

**D2 — One shot. → PHASE 2. The headline.**
`NetSportMode` reads `A` and swings; there is no vocabulary at all. Against a
benchmark whose entire identity is choosing between topspin, slice, lob and drop
under time pressure, a single swing is a metronome. The overlay has four slots
and uses one.

**D3 — Three overlay slots unused. → PHASE 5, follows D2.**
Not a defect on its own; it becomes one the moment there is a vocabulary to bind.

**D4 — No Controller Link schema. → PHASE 5.**
`isControllerEnabled()` is `modeId in MODE_CONTROLLERS`, so an absent mode is a
phone that silently never joins.

**D5 — The swing animation is a basketball jumpshot. → ACCEPTED, recorded.**
The mode says so itself: an overhead racquet motion and a jumper share an arm
arc closely enough to read, and it beats shipping with no swing. A real
`tennis_swing` clip is an animation-authoring task, not a convergence-pass one.

**D6 — The energy economy. → BUILT (Phase 2, second pass).**
Gauge, Zone Shot and racket break are in. **Zone Speed and the trick-shot dash
are NOT**, and that exclusion is structural rather than a shortcut: both exist in
Aces to help you *reach* a ball, and this mode has no player positioning to reach
with — contact is pure timing. Faking them would be a button that slows time for
no reason. The same limit is why volleyball's block needed a cooldown instead of
a court position.

**(original entry, kept for the record)** No energy economy: no Zone Shot, Zone
Speed, trick shot or racket break. → OUT OF SCOPE (v1), deliberately.
This is a large interlocking system — a gauge, two spend modes, a dash that
earns it, and a durability model that ends matches. Aces is *also* a normal
tennis game underneath, and that underneath is what this pass is for. Building
the vocabulary first is the right order: Zone Shot without shot types would be a
special move attached to a metronome. Recorded as the next pass, not smuggled in
(§7.8).

**D7 — Singles played on a doubles-width court. → ACCEPTED.**
11m is the doubles width; singles is 8.23m. For an arcade benchmark the wider
court gives the rally more room and the AI more to cover. Deliberate.
