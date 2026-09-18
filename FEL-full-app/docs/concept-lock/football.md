# Concept Lock — Football (Rush)

**Benchmark (LOCKED, `PHASE2_BENCHMARK_LOCKS.md`): Madden NFL (Arcade Mode,
simplified)** — *"Pre-snap reads + carrier geometry + breakaway; street
football variant."* The justification names the mechanics, so that is what
this lock measures against. NFL Street's truck/juke-string game is the mode's
own recorded mechanics reference (file header, v5).

**Mode id:** `football` · **Implementation:** `lib/babylon/modes/FootballRushMode.ts`
· **Route:** `/play/football`

This is a RUSH format — you are the ball carrier on every snap. Passing,
kicking, and 11-man formations are out of scope the same way full 11v11 was
out of scope for soccer: the arcade runner IS the street-football variant the
lock picked.

---

## A. Contest format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Four downs to make ten yards; first down resets | ✅ | `down`/`toGo`, `FIRST DOWN!` |
| A2 | A touchdown ends the drive; a new one starts | ✅ | `TOUCHDOWN!` → `newDrive` |
| A3 | Stopped on 4th down ends the run | ✅ | `TURNOVER_ON_DOWNS` — arcade endless-drive format, **D5 ruled** |
| A4 | A field that reads as football (yard lines, end zone) | ✅ | `buildGridiron` (44×90, numbered lines) |

## B. Carrier play (the geometry the lock names)

| # | Criterion | Status |
|---|---|---|
| B1 | Momentum-based carrier steering | ✅ |
| B2 | An evade vocabulary with real i-frames — juke L/R, spin, hurdle | ✅ `DODGES` |
| B3 | A power answer: truck (windowed, cooldown, steering cost) | ✅ |
| B4 | Defenders pursue with a reaction beat, not psychic | ✅ `MobSteering` |
| B5 | A breakaway gear for stringing evades | ✅ |
| B6 | Style variety pays more than spamming one move | ✅ `styleCredit` |

## C. What makes it Madden Arcade and not a generic runner

| # | Criterion | Status |
|---|---|---|
| C1 | **A pre-snap read: see the front, YOU control the snap** | ✅ **D1 built** |
| C2 | Big-hit presentation | ✅ truck knockdowns, tackle falls |
| C3 | Drive management pressure is on the HUD (down & distance) | ✅ |

---

## D. Deviations

**D1 — There was no pre-snap. → BUILT (this pass).**
The benchmark's justification opens with "pre-snap reads" and the mode had
none: the drive began with defenders already live, so the only read was
reflex. Now every drive starts SET: the defense stands in its alignment, the
HUD says `READ THE FRONT — ▲/W TO SNAP`, and the first forward stick input
snaps the ball (auto-snap at 3s so a phone left alone never stalls). The snap
is the player's timing choice — that IS the Madden beat. Measured live by
`football-drive.mts`: defenders hold before the snap and pursue after it.

**D2 — No Controller Link entry. → FIXED (this pass).**
A phone could not join the mode at all. The pad schema drives the left stick
(steering) and the four evade/truck verbs.

**D3 — No crowd meshes. → FIXED in Phase 6 (this pass).**
Painted bleacher texture only; the sibling standard (golf's gallery, 3PT's
spectators, derby's baseline crowd) is instanced onlookers. Two sideline
banks now, cheering touchdowns and big evades; 2 draws.

**D4 — SPIN is keyboard-only on touch. → RULED, kept.**
The touch overlay has four face slots: HURDLE (A), JUKE L (X), JUKE R (B,
emits Y), TRUCK (Y, holds the trigger). SPIN is the fifth verb and stays on
keyboard (B). The overlay budget is a platform constraint, not an oversight —
recorded so it is a decision.

**D5 — Turnover on downs ends the run. → RULED, kept.**
Madden Arcade would give the other team a drive; the rush format is an
endless-driver arcade run where the defense's win condition is ending yours.
Recorded as the format choice it is.

**D6 — found in playtesting.** (none this pass — see the sign-off)

---

## E. Exit criteria

Parity when A1–A4, B1–B6, C1–C3 hold, with D4/D5 ruled and D1–D3 fixed.

**Currently: all hold.**
