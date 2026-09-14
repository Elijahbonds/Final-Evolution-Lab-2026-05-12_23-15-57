# Dunk Contest — upgrade plan

**2026-09-14.** Owner ask: *"upgrade the dunking mode, come up with a plan, assess the needs."*

Assessment first, because dunk is the mode everything else was just measured against, and the fastest way
to waste this pass is to rebuild something that is already there. Everything below was grepped, not
remembered — two things I *did* remember turned out to be stale and are listed as such.

---

## What dunk already is

| system | state |
|---|---|
| air tricks | 8, each with a named cue beat (`rise` / `hang` / `preSlam`), a difficulty and an air cost |
| runway tricks | 6 — self-lob, kick-up, cartwheel, double-up, off-glass, bounce — thrown under the hold-run |
| combos | up to 2 a flight; capacity bought by the run-up at takeoff (`COMBO_AIR_SEC`) |
| judging | 5 judges, each with its own difficulty/execution/style weights and a bias; staged reveal |
| the rival | `RivalNerve` — swings bigger when trailing, and misses more for it |
| crowd | `CrowdEnergy`, tied to the contest's own beats; `ownsCrowd` keeps the harness off it |
| camera | `DunkReplayCam`, plus a zoom on the dunk beat |
| props | car / barrier / crate to go over, alley-oop and self-lob variants |
| body | posture layers, hand IK to the iron, real rim hang, contact dunk |
| session | `ContinuousNight` GO AGAIN — still the only mode with it, and now deliberately so |
| new this pass | `ImpactFrame` (dunk calls `feel.impact` 9×, so it gained the frame response for free) |

### Two things I misremembered — corrected here so they don't drive work

- *"Combos are near-impossible on the air budget."* **Stale.** `DUNK-BODY-MID` fixed it: capacity is read
  **once at takeoff** (`trickCapacity`), never against a remainder earlier tricks already spent. A real
  run-up gets two tricks and the chain bonus applies.
- *"`dunkResume` is a dead export."* **Wrong.** It is consumed by `cardProgression.ts:307` inside the card
  projection. Checked before writing it down.

---

## The gaps, in priority order

### P1 — Takeoff distance is not judged. There is no free-throw-line dunk.

`approachBonus(angleRad, takeoff)` reads exactly two things: the approach **angle** and whether it was a
one- or two-foot takeoff. **Distance from the rim at takeoff is not an input anywhere.** Jumping from the
restricted arc and jumping from the charity stripe produce the same base difficulty.

That is the single most iconic moment the event has, and the mode already knows everything needed to score
it — the runway measures position every frame and the obstacle system already computes a per-obstacle
takeoff line. This is a **scoring input, not new physics**.

Shape: extend `ApproachRead` with a distance band, add a floor marker on the runway so the line is a place
you can see and aim at, and let the judges' `difficulty` weight do the rest. Silk (style 0.5) and Prime
(difficulty 0.5) will disagree about it, which is exactly what the panel is for.

### P2 — No attempt economy. A miss is just a low score.

A blown dunk is judged (`missScores`) and the contest moves on. Real contests give you two or three
attempts and the drama is in **spending** them: the crowd noise on attempt three is the event. Right now
failure has no texture — you cannot chase a dunk you believe in.

Shape: N attempts per dunk, a visible counter, and a judge penalty that grows with attempts used. The
`CrowdEnergy` system already has the hush/roar vocabulary to carry it. Note this interacts with P5.

### P3 — The Music Room binding never landed, and it is mine.

`lib/babylon/music/WalkOut.ts` exists, with a full test suite. Its own header says, in capitals: *"THE BINDING (this is why it exists — do not build it
standalone)"*, and names the first binding as the authored track becoming the walk-out audio in Dunk
Contest.

**`DunkMode` references `WalkOut` zero times.** `musicCredential` is consumed by nothing but its own test.
I built the producer and never built the consumer — the exact failure this session has been cataloguing in
other people's code.

Shape: read the walk-out at mount, play it under the approach beat (SynthKit re-renders from the pattern —
nothing to license, nothing to ship), count a play, and surface the credential on the card. Small, and it
closes a thread that is currently just dead weight with a test suite.

### P4 — One rival, with no identity.

`RivalNerve` makes him *situational* but not *someone*. No roster, no signature dunk, no style he prefers,
nothing that persists across nights. The judges have more personality than the opponent does.

Shape: a small rival roster (name, preferred style tier, a signature trick, a nerve temperament), picked
per night. `athleteRoster.ts` already exists; this is mostly data.

### P5 — You cannot call your shot.

`B` cycles a style (POWER / FLASHY / SIGNATURE) and the d-pad picks a prop, so there *is* a pre-run choice
— but you never **declare a dunk**. Difficulty is discovered in the air rather than committed to on the
ground, so there is no moment of saying "I am doing the Eastbay" and having to live with it.

Shape: optionally call a trick before the run; landing what you called pays a bonus, failing it costs more
than an uncalled miss. This is the mechanic that makes P2's attempts matter.

### P6 — Smaller items

- `ScuffFx` is not wired to the runway. A standing dunk that plants hard should scuff the floor.
- `CrowdEnergy` does not read `ctx.momentum`. Dunk correctly opts out of the harness crowd bed
  (`ownsCrowd`), but its own crowd could still take the meter as one input.
- The `need` HUD chip exists for final-round pressure; nothing equivalent exists for round one.

---

## Suggested order

**P1 → P3 → P2 + P5 → P4 → P6.**

P1 is the biggest felt gain for the least new machinery and needs no new art. P3 is small, closes a dead
module, and is the honest thing to do next given I opened it. P2 and P5 should land together because
attempts without a called shot is just more retries, and a called shot without attempts is a single
coin-flip. P4 is mostly data. P6 is polish.

---

## What I need from you before building

P2 and P5 change the contest's rules, not just its feel — how many attempts, and whether calling a dunk is
optional or mandatory, are design calls with real consequences for pacing. P1, P3, P4 and P6 I can take
without further input.
