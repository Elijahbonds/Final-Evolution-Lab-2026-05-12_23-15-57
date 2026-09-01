# Concept Lock — Volleyball

**Benchmark (LOCKED): Nintendo Switch Sports — Volleyball.**
Locked by Elijah on 2026-08-31, recorded in `PHASE2_BENCHMARK_LOCKS.md` under
*Later Additions*. This mode shipped after that document was first written,
which is why it was absent from it and why the mode was blocked at Phase 1.

**A correction came with the lock.** `SESSION_STATUS_DASHBOARD.md` listed the
benchmark as *Wii Sports Resort*. That is wrong on its face — Wii Sports Resort
has no volleyball mode (swordplay, archery, bowling, table tennis, basketball,
golf, air sports, cycling, canoeing, wakeboarding, frisbee, power cruising) — and
the claim appeared nowhere in the authoritative lock and nowhere in
`VolleyballMode.ts`, unlike the board benchmarks which are corroborated in code.

**Mode id:** `volleyball` · **Implementation:** `lib/babylon/modes/VolleyballMode.ts`
(a thin config over `NetSportMode` + `RallyCore`)
**Route:** `/play/volleyball` · **Host:** `makeTimingHost`

---

## A. The rules — real volleyball, which the benchmark also follows

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Three touches per side, then it is a fault | ✅ **D0 fixed** — it was INOPERATIVE | `RallyState`, `touchesPerSide: 3` |
| A2 | Rally scoring — every rally scores, whoever served | ✅ | `RallyCore.award()` |
| A3 | Sets to 25 | ✅ | `target` |
| A4 | Win by 2 | ✅ | `mine - other >= 2` |
| A5 | A hard cap so a set cannot run forever | ✅ 30 | `cap` |
| A6 | A net high enough that weak contact is dug into the tape | ✅ **2.43m, men's** (Elijah, 2026-08-31) | `netHeight` |
| A7 | Court dimensions in proportion | ✅ 9 × 4.5 half | `halfLength/halfWidth` |

> **A6 resolved.** It shipped at 2.24m, the **women's** indoor height. Elijah
> chose the men's 2.43m. `planShot` derives every arc from `netHeight`, so
> raising the net raised the shots with it rather than making them clip the tape
> — except the spike, which needed real work (see D5).

## B. The rally loop — what Switch Sports actually plays like

This is the section that matters, and the one the mode does not yet meet.

| # | Criterion | Status | Where |
|---|---|---|---|
| B1 | The three touches are DIFFERENT actions: bump, set, spike | ✅ **D1 fixed** | `volleyTouchFor`, `planShot(touch)` |
| B2 | The spike is the payoff — the reason to build a rally | ✅ **D1 fixed** | struck from above the net, fastest ball in the mode |
| B3 | Blocking at the net as a distinct defensive act | ❌ **D2** | absent |
| B4 | Timing against the ball's arrival decides contact quality | ✅ | `shotMeterT`, `humanSwing` |
| B5 | Aim is a player intent, not automatic | ✅ | `aimX` from the stick |
| B6 | A rally reads as a sequence, not an exchange | ✅ 21–23 swings a session, BUMP → SET → SPIKE | `rally-drive.mts` |

## C. Reachability and control

| # | Criterion | Status | Where |
|---|---|---|---|
| C1 | Registry entry, enabled, routed, hosted | ✅ | `/play/volleyball` |
| C2 | A touch entry that names the mode's verbs | ✅ **D3 fixed** | `MODE_VERBS.volleyball` |
| C3 | Controller Link schema | ✅ **D4 fixed** | `MODE_CONTROLLERS.volleyball` |
| C4 | Camera holds the rally | ✅ 0 `[FEL-FRAME]` | baseline capture |

---

## D. Deviations

**D0 — The three-touch limit could never fire. → FIXED (Phase 2).**
Worse than the lock first recorded, and only visible from the code: every human
swing called `rally.cross()`, and `cross()` sets `touches = 0`. So the counter
never exceeded 1, a mode configured with `touchesPerSide: 3` played exactly like
one configured with 1, and "TOO MANY TOUCHES" was unreachable. A1 was marked ✅
in the first draft of this document on the strength of the config value; that was
wrong, and it is the reason to read the code path rather than the constant.

**D1 — The three touches were one touch, three times. → FIXED (Phase 2). The headline.**
`TouchTracker` enforces `touches > 3 → fault` and nothing else: bump, set and
spike are the same generic hit with the same input and the same result. In the
locked benchmark the *sequence* is the game — you bump to control, set to place,
and spike to win the point, and the spike is the moment the whole rally exists
to reach. A mode that models the three-touch **limit** without the three-touch
**vocabulary** has the rule but not the sport.

**D2 — No block. → FIXED (Phase 2), and re-balanced after a bug corrupted the
first reading.** See the sign-off's correction section: the stuff was awarding
the point to the opponent, so the balance figure it was tuned against was
meaningless. Its cost is now a cooldown, because a block's real cost is
positional and this mode has no player positioning.

**(original note) No block. → PHASE 2 of a later pass, now that there IS a spike.**
The defensive answer to an attack. It was meaningless while every touch was the
same hit; now that the attack exists and is the point-winning shot, a block is
the missing counter-play. Deferred rather than closed, and it needs an overlay
slot, which volleyball currently uses only one of.

**D3 — No `MODE_VERBS` entry at all. → FIXED (this pass).**
Touch fell through to `MODE_VERBS.default`, a single generic ACTION button —
the original `karate_vs` bug, in a mode that shipped. It survived the guard
written to prevent it because that guard scanned host components for a *static*
`modeId` literal, and volleyball is served by `makeTimingHost` with a variable.
The guard now asks the **registry** instead: every mode in
`ENABLED_BABYLON_MODES` must have an entry. It caught volleyball and only
volleyball.

**D4 — No Controller Link schema. → FIXED (Phase 5).**
`isControllerEnabled()` is a plain `modeId in MODE_CONTROLLERS`, so an absent
mode is not an error — it is a phone that never gets to join, silently. Same
gap the three board sports had.

**D5 — The scoreline needed a real driver, and building one found two more
defects. → FIXED (Phase 2).**

The generic bot taps A on a fixed cadence, which is not how a timing sport is
played. `scripts/rally-drive.mts` reads the mode's own shot meter and swings on
it. Building it turned up:

- **`shotMeterT` was a boolean wearing a meter's name.** It was set to `1` the
  instant the window armed and `0` on landing. Nothing rendered it — the
  basketball hosts publish a real ramp and draw a bar, the timing host draws
  nothing — so a mode *graded on contact timing* gave the player no timing cue,
  and no driver could time a swing either, because flights differ per touch
  (bump 1.56s, set 1.88s, spike 0.88s) and a fixed delay is wrong for all three.
  It is a genuine 0..1 ramp now.
- **The spike's geometry was wrong, twice.** A set lands the ball *at* the net,
  so a ground-launched spike is only ~25% along its arc at the tape and clips
  it: the opponent conceded 4–0 on nothing but "INTO THE NET". Raising the apex
  did not fix it and could not — the fault was the launch height. The attack is
  now struck from above the tape (`netHeight + 0.85`, solved against the flight
  equation, not guessed) and its arc grows with distance from the net, because a
  flat attack from the baseline evaluates below the net however high the contact
  is. Asserted across the whole court in `volleyball-rally-tests` D3.
- **AI error rates compounded.** The miss roll is per touch, so giving the
  opponent three touches tripled their error rate per rally: a competitive 4–5
  became 5–0. Errors now belong to the attack, which is where they belong in
  volleyball.

Measured after: 21–23 swings a session with BUMP → SET → SPIKE all appearing,
scorelines 3–0 and 1–1. Tennis, which shares this core, is unchanged at 14
swings and is guarded by `volleyball-rally-tests` section E.

**D6 — `ambient: 'stadium'` is mapped from 'beach'. → ACCEPTED.**
Noted in the mode itself: `SoundKit` only accepts `'stadium' | 'dojo' | 'none'`.
An ocean bed exists (`'ocean'`, used by surf) and would suit a beach court
better; recorded as a cheap Phase 7 improvement rather than a defect.
