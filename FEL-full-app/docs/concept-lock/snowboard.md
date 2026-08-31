# Concept Lock — Snowboard Slalom

**Benchmark (LOCKED): SSX.**
Locked in `PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`), in the
*Already-Locked (from audit)* list. Corroborated in-code at
`SnowboardSlalomMode.ts:49`: "SSX boost meter 0..100". Not invented here (§7.3).

This is the one board mode whose benchmark and subject actually match, so it is
held to SSX on both systems *and* subject.

**Mode id:** `snowboard_slalom` — **not** `snowboard`; that key does not exist in
the registry, and a request to it renders a page that reports
`FEL-FRAME 0 / MISSING CLIP 0 / errors 0` while loading nothing at all.
**Implementation:** `lib/babylon/modes/SnowboardSlalomMode.ts`
**Route:** `/dev/mode/snowboard_slalom` · **Host:** `components/games/board-babylon.tsx`

---

## A. The descent

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Speed comes from the mountain and from tucking, never a throttle | ✅ **D1 fixed this pass** | `move.update(..., tuck, ...)` |
| A2 | The rider actually descends at a rate the course is built for | ✅ ~13 m/s | measured, agent bridge |
| A3 | The rider faces the direction of travel | ✅ **D2 fixed this pass** | `root.rotation.y = move.yaw` |
| A4 | A timed run scored at the bottom, with a time bonus | ✅ | `(60 - elapsed) * 10` |
| A5 | Carving costs and holds speed the way a real edge does | ✅ | `carveHold 1.02`, `scrubRate 0.7` |

## B. The course — a slalom is a rhythm

| # | Criterion | Status | Where |
|---|---|---|---|
| B1 | Gates alternate left/right in a readable rhythm | ✅ **D3 fixed this pass** | `rideWorlds.ts` |
| B2 | Gate spacing is sized to what a rider can actually carve | ✅ 20m / ~9m reachable | measured |
| B3 | Difficulty ramps down the course | ✅ 3.2m → 5.0m offsets | |
| B4 | The first gate is reachable from the spawn line | ✅ gate 0 dead ahead | |
| B5 | Missing a gate is scored, not fatal | ✅ "MISSED GATE" | |
| B6 | Hazards off the gate line — rocks, trees, rails | ✅ | `buildSlopeRun()` |
| B7 | A route choice worth taking: the lift-cable grind | ✅ +400 | |

## C. SSX's signature layer — air, boost, and the chase

| # | Criterion | Status | Where |
|---|---|---|---|
| C1 | Jump and clear hazards | ✅ `A` | |
| C2 | Grind rails, locked in the air | ✅ | `tryGrind()` |
| C3 | Spin / flip / grab trick vocabulary | ⚠️ **D5** labels wrong, grab unreachable on touch | `TRICKS` |
| C4 | A boost meter that fills from tricks | ✅ +12 per spin | `boost` |
| C5 | **The boost meter can be spent for a burst** | ❌ **D4** | `boosting` never set true |
| C6 | A set-piece threat mid-run | ✅ the Yeti, one per run | `YETI_SPAWN_GATE = 5` |
| C7 | The threat is beatable by skill, not luck | ✅ jump the lunge, +150 | |
| C8 | The rider reads as a snowboarder | ✅ **fixed this pass** | `boardSuite.ts` |

---

## D. Deviations — fix, defer to a named phase, or rule out of scope

**D1 — The tuck was never connected to the momentum model. → FIXED (this pass).**
`move.update(dt, stickX, 0, ...)` passed a hard-coded `0` where `BoardMovement`
wants the pump term — directly under a comment reading "tuck adds". With
`pushAccel: 0` on snow, that left slope gravity as the *only* propulsion in the
mode. Measured over six seconds of held tuck: **1.5m down the hill against 7.2m
across it**, ~0.75 m/s of descent on a 205m course. The rider was not missing
gates; in ninety seconds he only ever physically reached the first one.

**D2 — The mode never set `root.rotation.y` anywhere. → FIXED (this pass).**
Rider and board kept their spawn yaw and came down the mountain broadside.

**D3 — The gates were not a slalom. → FIXED (this pass).**
`sin(i * 1.7) * 9` — stepping a sine by 1.7 radians aliases into a near-random
sequence (0, +8.9, −2.3, −8.4, +4.4 …) with consecutive gates up to 12.8m apart
across 15m of slope.

**D4 — The boost meter cannot be spent. → PHASE 2. Highest priority.**
`boost` fills (+12 per spin) and decays inside `if (boosting)`, but **`boosting`
is never assigned `true` anywhere in the codebase**. The meter is a write-only
number. This is C5, and C5 is the single most identifiable thing about the
benchmark — SSX Tricky is *named* after its boost state. Everything needed is
present (fill, drain, HUD publish); what is missing is a button that starts it
and the burst it should apply.

**D5 — The touch overlay mislabels a verb and omits another. → PHASE 5.**
`modeVerbs.ts` maps `B` with the label **GRAB**, but in the mode `B` is
`TRICKS.spin` + boost fill. The actual grab is `X`, which is **not on the
overlay at all**. So a touch player pressing GRAB spins, and cannot grab.

**D6 — The HUD shows neither the gates nor the boost. → PHASE 8.**
The mode publishes `gates` and `boost`; the shared host renders **time, coins,
score, banner**. A slalom whose gate count is invisible, and a boost meter with
no meter. It also shows a coins counter this mode never sets (permanent `◈ 0`).
Shared with skate D4 / surf D4 — one host fix.

**D7 — Gate pass tolerance is generous. → ACCEPTED.**
Poles sit at `cx ± 1.7`; the pass test is `|p.x − gate.x| ≤ 2.0`, so you can
clear a pole by 0.3m and still score. Arcade-forgiving on purpose; recorded so
it is a decision rather than a bug someone tightens later.

**D8 — One yeti appearance per run, fixed trigger. → ACCEPTED (v1).**
`YETI_SPAWN_GATE = 5`, watchdog-bounded, one per run. Deliberate: a repeatable
set piece is legible, a random one is not.

**D9 — No trick-name popup or score ticker. → PHASE 8.**
SSX names the trick on screen as you land it. Rolled into D6.

**D10 — Single course, no branching lines. → OUT OF SCOPE (v1).**
SSX's alternate routes are a level-design programme, not a mode fix.

---

## Verification state at lock time

Through `/dev/mode/snowboard_slalom`. Generic capture
(`PUMP=1 STEER=1 HOLD=700 GAP=70`) and `scripts/slalom-drive.mts`, which reads
the rider's position from the agent bridge and steers at the next gate:

```
4 of 12 gates · 190m of the 232m course
FEL-FRAME 0 | MISSING CLIP 0 | errors 0
```

That is a crude 30ms bang-bang driver that oversteers, not a skill ceiling.
**12/12 has NOT been shown reachable** — only that the course rides and scores.
Establishing a real ceiling is a Phase 9 job.
