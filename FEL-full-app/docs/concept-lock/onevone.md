# Concept Lock — Streetball 1v1

**Benchmark (LOCKED, bible §4.1): NBA 2K.**
**Mode id:** `onevone` · **Implementation:** `lib/babylon/modes/OneVOneMode.ts`

Phase 1 of the convergence pass. The bible calls this mode the **"validated
reference implementation / gold standard — full pass complete"** and instructs
every other mode to diff against it. That claim is the reason this pass matters:
if the reference is wrong, everything measured against it inherits the error.

It was wrong in six ways.

---

## A. Contest format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Half court, ONE basket | ✅ **fixed** | full court, two hoops — D1 |
| A2 | First to a target score | ✅ | `TARGET_SCORE = 11` — see D6 |
| A3 | Twos and threes | ✅ **fixed** | a dunk scored **1** — D4 |
| A4 | **Real three-point arc, not a circle** | ✅ **fixed** | flat 6.7m radius — D3 |
| A5 | Possession alternates on a make/board | ✅ | `startDefense`, rebound race |
| A6 | Regulation 10ft rim | ✅ **fixed** | built at 2.70m — D2 |

## B. On-court play

| # | Criterion | Status |
|---|---|---|
| B1 | Shot meter with a green release window | ✅ centre 0.62, ±0.09, tightened by contest |
| B2 | Shot selection by context | ✅ `classifyShot` — layup / floater / jumper / fadeaway |
| B3 | Contested shots are worse | ✅ `contestLevel` narrows the window AND the pct |
| B4 | Turbo is a resource | ✅ `TurboMeter` |
| B5 | Drive dunks, posterize | ✅ `checkDriveDunk` |
| B6 | Ankle-breakers off a stick snap | ✅ `checkAnkleBreak` |
| B7 | Defence: block, steal, box out | ✅ **box out fixed** — D5 |
| B8 | Momentum swings outcomes | ✅ `MomentumBus` multiplier 0.94–1.10 |

---

## D. Deviations

**D1 — The reference mode shot at a rim that was not there. → FIXED.**
`RIM` is `(0, 3.05, -0.6)` and play is clamped to z 0.5–14.5, but the venue gave
it a full court with baskets at z ±12.5, so the nearest real hoop stood at
z +13.22 — **behind the player**. Corrected venue-side to a single basket on the
mode's rim, no gameplay logic touched. Guarded by `basketball-rules-tests`.

**D2 — The rim was a foot low.** 2.70m against a regulation 3.05m, in every
basketball mode. Fixed in the shared hoop builder.

**D3 — The three-point line was a circle.** A flat `THREE_POINT_RADIUS = 6.7`.
The real arc is 6.71m in the corners and 7.24m at the top. This is the **third**
independent occurrence of the same mistake (3PT's D1, 3v3's D3) — the signature
of the correct arc living inside one mode instead of the shared core. Now
`isThree()` from `BasketballCore`.

**D4 — A dunk was worth one point.** The comment above `TARGET_SCORE` records the
scale being fixed from "1 inside the paint, 2 outside" to real 2s and 3s — and
only the jump-shot branch was updated. The dunk kept awarding 1, so the best
shot in basketball was worth half a jumper, in the same file as its own
post-mortem. 3v3 had the identical bug.

**D5 — BOX OUT was unreachable on touch.** The mode's own on-screen hint says
"hold L1/LT to BOX OUT" while the touch overlay drew no such button, and the B
slot sat inert rendering the bare letter "B". A phone player was told to use a
control that did not exist. B is now BOX OUT, emitting L1.

**D6 — First to 11 with 2s and 3s. → RULED, kept.**
2K's Park plays to 21; this mode plays to 11 with the same 2s-and-3s scoring, so
a game is roughly five buckets. That is short, but "11, straight up" is a
completely standard pickup 1v1 format and a 1v1 to 21 drags. Recorded so the
number is a decision rather than an accident. 3v3 keeps 21.

**D7 — Pressing forward walked you away from the basket. → FIXED.**
Same platform-level convention clash documented in 3v3's D9: every input source
reports up-stick as negative y, `CourtMovement` documents and implements the
opposite. Negated at this mode's boundary.

**D8 — The start button paused the game on the player's first shot. → FIXED.**
A clicked `<button>` keeps focus, and the browser activates a focused button on
**space** — which is the shoot/charge key in every mode here. So a player who
started with a mouse and then pressed space to shoot re-fired START, and
`ModeHarness` reads "playing + START" as PAUSE. The mode froze mid-shot, on the
first input, with nothing on screen explaining why. `BootSplash` now blurs on
start and retry, so it is fixed for **every** mode, not just this one.

This one cost real investigation time and is worth recording honestly: it first
presented as "the core scoring loop is broken — no shot ever resolves", and the
evidence genuinely looked like that (meter fills, no banner, 0–0 after ten
attempts, on both sides). It was only distinguishable from a real gameplay bug
by tracing the update-loop frame counter through `document.title` — console
output is dropped under load and had been quietly lying about frame counts.

---

**D9 — The opponent could not get the ball. → FIXED (console pass).**
The rebound was a bare distance comparison, which made it deterministic — and
since you shoot after driving, you are essentially always the closer body.
Measured with **every** shot deliberately missed, the banner read "YOUR BOARD"
every single time and the opponent never got a possession at all. `foeScore` was
**0 in every run this mode has ever been played**, because an opponent who
cannot get the ball cannot score.

Distance still names the favourite, but BOX OUT is now worth a real body length
on top of it — which is the point of a verb the mode tells you to hold, and which
did nothing for rebounds until now — and a bounce of randomness keeps a board
from being decided before the ball leaves the rim.

Verified: missing every shot now loses **0–2**; releasing in the green wins
**6–2**. Both, from the same script, on the same build.

---

## E. Exit criteria

Parity when A1–A6 and B1–B8 hold, with D6 ruled.

**Currently: 15 of 15 criteria hold.**

---

## F. Depth pass (2026-09-01) — from "rules are right" to "feels like 2K"

The structure pass made the mode *correct*; a 2K player would still not
recognise it in the first minute. This pass attacked the three absences such
a player notices first, and found that two of them were not missing features
but *existing features that could not fire*.

**F1 — Dribbling is a vocabulary.** Added the HESITATION: a pull-back tap of
the stick (held ≤0.35s, then released or snapped forward) plants you dead —
your momentum is the price — and arms a 0.6s explode-out window. Works from a
run *and* from a triple-threat standstill. A hard diagonal snap stays the
explosive crossover. A defender who is **closing** (or closed within the last
~1s — the on-their-heels window) and within 2.4m **bites**: 0.45s frozen. A
set defender does not. All deterministic reads, no dice.
`DribbleController` in the shared core, guarded by `onevone-depth-tests`.

**F2 — Defence is a skill, on both sides.** The steal was
`Math.random() < 0.5`. Now the rival's drive weaves (`driveBallExposure`):
the ball is exposed mid-weave and protected at the gather, so a poke has a
real window (measured: the first ~0.6s of the 2.2s drive is live). A reach
into a protected ball costs you 0.45s off your feet. Block timing (A) is
unchanged. The AI defender now *slides* (speed-matched deny depth), *presses*
a stationary handler into poke range, and *bites* on the hesi.

**F3 — Shot feedback says why.** Release banners name the quality and the
context: `GREEN! — CONTESTED`, `EARLY — WIDE OPEN`, `WAY LATE`. Their makes
grade your defence (`THROUGH YOUR CONTEST` / `LEFT WIDE OPEN`).

### What the depth pass found underneath (root causes, all fixed)

- **D10 — The dribble vocabulary was unplayable on keyboard.** Reversal
  detection compared *consecutive frames*; a keyboard always reports neutral
  between key-up and key-down, so no crossover or hesi could ever fire from
  WASD. Reversals now measure against the last *committed* direction within
  a 0.25s flick window. (Found by the depth driver; headless tests had
  asserted atomic reversals only — the classic "the driver is the test"
  trap.)
- **D11 — The AI defended a palm-local ball.** `attachBallToHand` parents the
  ball to the hand bone, so `ball.position` is ~origin while carried — and
  both 1v1 and 3v3 fed `ball.position` to the AI brains. The 1v1 defender's
  deny point collapsed onto the rim: measured live, it parked at (0, 0.3) and
  never marked anyone. In 3v3 `markHasBall` could never be true, so no
  defender ever played on-ball defence. Both modes now feed
  `getAbsolutePosition()`.
- **D12 — The defender's steal gate was 3D.** `dist < 1.1` compared against a
  deny point whose Y is lerped toward the rim (3.05m) — ~1.3m of phantom
  altitude meant the AI's poke roll **never fired in any game this mode has
  played**. Distance is planar now.
- **D13 — The rival's drive stopped 5m short of the rim.** It targeted
  `RIM.z + 2` and released from there every time. Now drives to the basket,
  which is also what makes the block/steal dance reachable in the flow of
  play.
- **D14 — Poke ranges sat on the body standoff.** Bodies rest ~1.1m apart;
  steal application ranges of 1.2m flickered across the boundary. Now 1.6m.

### Deferred, with reasons

- **Size-up packages, behind-the-back, step-back as distinct animations** —
  the controller vocabulary (hesi/crossover/explode) now exists; visual
  packages are an animation-suite task, not a mechanics one.
- **Layup packages / and-ones** — the foul system (`ContactSystem`) already
  pays fouls on shot contact ("FOUL! — BALL BACK"); distinct gather
  animations deferred with the packages.
- **Timeouts / crowd as a system** — `MomentumBus` tiers already swing make%,
  ambient level and banners; a timeout verb is a format decision (1v1 to 11
  is five buckets; a timeout would be dead weight).
- **Pick-and-roll / off-ball screens** — 3v3's department.
