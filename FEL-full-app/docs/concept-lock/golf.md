# Concept Lock — Golf

**Benchmark (LOCKED): PGA Tour 2K.**
Locked in `PHASE2_BENCHMARK_LOCKS.md`: *"Club selection + shot timing + course
reading; proven 1v1 competitive golf formula"* — the justification names the
three pillars, which is what this document measures against.

**Mode id:** `golf` · **Implementation:** `lib/babylon/modes/precisionModes.ts`
(shared with Derby and Penalty) · **Route:** `/play/golf`

> **Read the right file.** `lib/babylon/modes/GolfMode.ts` also exists, is
> **dead**, and is excluded in `tsconfig.json` — which is why its
> `SoundKit.startAmbient('ambient')` (not a valid kind) never fails type-check.
> Its entire mechanic is `if (Math.random() < 0.7)` with a comment reading *"in
> real implementation, calculate distance/angle"*. I read it first and drew
> conclusions from it. The live mode is in `precisionModes.ts` and is a
> genuinely built golf game. **`precisionModes.ts` also contains a dead
> `TennisMode`** (superseded by `TennisMode.ts`, per the registry's own comment)
> which is *not* excluded, so it type-checks and looks alive.

---

## A. What is already here, and it is a lot

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | A real ball with a flight model | ✅ | `Flight`, gravity −9.8 |
| A2 | Aim is a player intent | ✅ | `Reticle`, stick |
| A3 | A swing with a power decision | ✅ | `PowerMeter` |
| A4 | A swing with an accuracy decision | ✅ | accuracy band on the way down |
| A5 | Missing accuracy hooks/slices proportionally | ✅ | `sideErr` |
| A6 | You can see the hole before you play it | ✅ broadcast flyover | `snapTo` to the green |
| A7 | The camera is driven by the mode | ✅ | `setFixedBehind`, `snapTo` |
| A8 | A closing hole that matters | ✅ CLUTCH | `round === TOTAL` |

## B. The three pillars the lock names

| # | Criterion | Status |
|---|---|---|
| B1 | **Club selection** | ❌ **D1** — there are no clubs |
| B2 | Shot timing | ✅ — and it is good |
| B3 | **Course reading** — wind, lie, elevation | ❌ **D2** — none of them exist |
| B4 | 2K's **analog stick swing** | ❌ **D3** — this is a 3-click swing |
| B5 | Putting as its own act | ❌ **D4** |
| B6 | Stroke play against par | ❌ **D5** — scoring is points, not strokes |

---

## D. Deviations

**D1 — No clubs. → PHASE 2. The first pillar the lock names.**
Every shot is the same shot with a different power percentage. In the benchmark
the club is the primary decision — it sets the distance band and the trajectory,
and choosing wrong is how you find trouble. Power alone collapses that decision
into one axis.

**D2 — No wind, no lie, no elevation. → PHASE 2. The third pillar.**
"Course reading" is named in the lock's own justification and none of its inputs
exist. Without them there is nothing to read: the correct shot is always maximum
power in the reticle's direction.

**D3 — The swing is 3-click, and 2K's is the analog stick. → PHASE 2.**
Three-click is a real and respectable golf-game swing — it is what older PGA
titles used — but it is not *this* benchmark's. 2K's identity is pulling the
stick back and pushing it through, where tempo and path produce draw and fade.
This is the single largest parity gap, and it is a genuine question of scope:
the 3-click swing here is well built and feels good. **Recommend implementing
the stick swing alongside it**, not replacing it, since the touch overlay cannot
express a stick swing well and 3-click is the better mobile input.

**D4 — No putting. → PHASE 2, after D1.**
The mode plays three tee shots. A hole ends when the ball lands near the pin;
there is no green, no putt, no read. Half of golf.

**D5 — Scoring is points, not strokes against par. → PHASE 2.**
`pts` accumulates and the HUD shows a score. Golf is scored in *strokes relative
to par*, and every element of tension in the benchmark — a birdie putt, a
scramble for bogey — comes from that frame. The HUD already prints `+0`, so the
vocabulary is half there.

**D6 — Three holes, not eighteen. → ACCEPTED for v1, recorded.**
`TOTAL = 3`. A full round is a 20-minute session and this platform's modes are
minutes long. Three holes with a clutch final is the right shape here; it should
be a *deliberate* three, not a stand-in for eighteen.

**D7 — `SoundKit.startAmbient('dojo')` on a golf course. → FIXED (Phase 7).**
A martial-arts room tone on an alpine course. `'wind'` is the outdoor bed and is
what the venue wants.

**D8 — One overlay verb of four, and no Controller Link entry. → PHASE 5.**
A phone cannot join at all (`isControllerEnabled` is `modeId in
MODE_CONTROLLERS`), and the overlay offers only SWING — which is *correct* for a
3-click swing, and becomes a gap the moment D1 adds club selection.


---

## Phase 2 — built

| Deviation | Outcome |
|---|---|
| D1 club selection | ✅ DRIVER / IRON / WEDGE on `B`. Reach, launch and **forgiveness** differ, so a short club punishes a bad strike less — that is the trade that stops the driver being the always-answer. |
| D2 course reading | ✅ per-hole **wind**, shown before you commit and applied for the whole flight, so a long club spends longer in it |
| D3 the 2K stick swing | ✅ **added alongside** 3-click, not replacing it. Pull back to load, drive through to strike; the pull is the power and the lateral position at contact is the path. Both swings end in one `strike()`, so they cannot drift apart. |
| D5 strokes against par | ✅ EAGLE / BIRDIE / PAR / BOGEY, a running card, and holes that take as many strokes as they take |
| D7 ambient bed | ✅ `dojo` → `wind` |
| D8 overlay + Controller Link | ✅ SWING + CLUB on both |
| — | ✅ **play it from where it lies**: a hole was one shot scored by proximity, which is why there were no strokes to count |
| — | ✅ **out of bounds** — penalty stroke and a drop |

**D4 putting is still absent.** It needs a green surface, a putt swing with its own
scale, and a read; it is the next pass.

## Phase 3 — DOES NOT PASS

Three `[FEL-FRAME]` per run, down from sixteen. Two real causes were found and
fixed on the way:

- The mode drove its camera **only during flight**, so between shots it never
  converged on its framing — a Phase 3 violation that also produced two
  `[FEL-WATCHDOG] still black` errors. It updates every frame now, and the
  errors are gone.
- `setFixedBehind(me.root.position, 0, 'swing')` hard-coded a facing yaw of
  **0** — "the player always faces +Z", true only on the tee shot. The moment a
  drive overshoots the pin the player must play *back*, and the camera set up in
  front of them looking the wrong way. It faces the pin now.

What remains is not diagnosed. Golf is **not signed off**.
