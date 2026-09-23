# Hoops depth — the reference decoded (phase 2 of the basketball-depth pass, 2026-09-23)

The bar the owner set is "2K21 / 2K27 feel": a modern 2K street slice on a TV from the couch. This is what 2K actually
does, row by row against what FEL does today, so each S-gate of `SPEC-BASKETBALL-SUITE-DEPTH` measures a named gap and
not a vibe. The stick-dribble grammar was decoded already (`SPEC-STICK-2K-DECODE.md`, 2K26 Pro Stick, the escape, the
snatchback, size-ups) and is not repeated here.

## Sources (web, 2026-09-23)

- 2K, *NBA 2K27 — Gameplay* feature page: rhythm shooting, the eight-tier contest, the dynamic dunk meter, the Dynamic
  Layup Engine, cutoffs, ankle-breakers. https://nba.2k.com/2k27/features/gameplay/
- NBA2KLab, *How to shoot* (2K27): the pure window 15–20 ms inside a ~55 ms green; tempo widens / rushing shrinks the
  window; the ±5.8–13.9 ms bands where ~70 % go in; meter off ≈ +10 points on late releases. https://www.nba2klab.com/how-to-shoot
- NBA2KLab, *How to dunk* (2K27): every dunk is metered (was optional in 2K26); hold the stick, release on the window.
  https://www.nba2klab.com/nba2k-how-to-dunk
- Operation Sports, *NBA 2K27 gameplay update* (2025-09-17): contests strengthened on tough shots, open looks boosted,
  standing dunks more consistent, steal ratings matter on contact, game speed standardised across modes.
  https://www.operationsports.com/nba-2k27-gameplay-update-adjusts-shooting-dunks-steals-and-game-speed/
- 2K26 shooting: the visible green window (~40–60 ms), meter-off bonus, "green or miss" universal timing.
  https://nba2k26cheats.org/blog/nba-2k26-shooting-guide/ · https://www.prismnews.com/hobbies/nba-2k/nba2klab-says-nba-2k26-shot-timing-still-hinges-on
- 2K26 contests: hands-up contest strength scales with wingspan (+6 % max vs min); contest quality also reads the
  shooter's jump-shot grades; a strong, well-timed contest narrows the green window; the devs' contest review.
  https://www.operationsports.com/nba-2k26-update-focuses-on-shot-contest/ · https://tech.yahoo.com/gaming/articles/developers-respond-contest-system-fixes-180241400.html
- 2K26 finishing: euro = Pro Stick down-left with the ball right, L2 held slows the gather; hop step = R2 + down-L/R;
  layup = hold up while driving. https://nba.2k.com/2k26/game-guide/gameplay/ · https://www.magicgameworld.com/how-to-do-the-euro-step-in-nba-2k26-standard-slow-step-tips/
- 2K26 movement: ProPLAY dynamic motion engine, "dynamic lower-body pose matching … launch, plant and cut realistically",
  the end of skating; size and weight change agility; start / stop / cut tightness by rating and dribble style.
  https://newsroom.2k.com/news/nbar-2k26-debuts-new-gen-9-gameplay-improvements-including-an-all-new-dynamic-motion-engine-powered-by-proplay · https://nba2kw.com/nba-2k26-gameplay-full-breakdown-proplay-shooting-dribbling-more
- 2K26 dunk meter: R2 + Pro Stick down while driving, release in the green; open dunks get bigger windows; flashy dunks
  off the button only when wide open. https://www.1v1me.com/blog/nba-2k26-how-to-dunk

(2K21 is remembered, not fetched: the shot stick with aiming, a shot meter with a yellow "perfect" tick, the RT-held
dunk with X, the pro stick escapes. Its feel bar is the same as 2K27's in the ways this pass measures; 2K27 is stricter.)

## What 2K does, by S-gate

### S1 Stick feel (movement with weight)
- Movement is camera-relative on the left stick; turbo (R2) is a held state with its own acceleration and a stamina cost.
- The motion engine pose-matches the LOWER body: a runner launches, plants and cuts on a planted foot; the marketing
  claim of 2K26 is precisely "the elimination of skating". Size and weight set agility: a guard stops in fewer frames
  than a big.
- Start / stop / cut tightness vary by rating and dribble style — a hard cut at pace COSTS speed, and the plant reads.
- The stick never fights a dead zone: sub-threshold input is a walk, not a twitch; over-threshold is a jog; turbo is a sprint.
- The read: the body leans into the run, the head leads the turn; a stop is a two-foot plant with a crouch.

### S2 Plant → takeoff
- A jump shot from a stand is a "set" shot (Set and Fire); a jump shot off movement is a pull-up or a hop (the HOP is
  a distinct two-foot plant that resets the feet — R2 + stick down). Neither is a pop from a sprint: the gather is
  visible for 3–6 frames and the takeoff spends the run.
- Layup gathers are components, not preset clips (2K27's Dynamic Layup Engine): the gather step, then the finish.
- The euro (down-away) and the hop step (R2 + down-L/R) are GATHERS: the plant is the move.
- A drive dunk gathers off the last dribble; a standing dunk (2K27 tuning) is its own animation family.

### S3 Hang / air
- The hang is the animation's own: two-hand, one-hand, cradle, windmill; the body's arc is the clip's, arms hold the
  ball to the side or above. There is no bind pose in the air — an interrupted flight is a contested layup animation.
- Contested finishes adjust the SHOOTING HAND mid-air (2K27: "automatic shooting-hand adjustments mid-air if contested"
  for high finishers).

### S4 Land / settle
- Every jump lands on an absorb (knees bend, the torso drops), then a recovery into idle / a run; a dunk lands with
  the rim hang (controllable in 2K27's "Controllable Rim Hang") or a drop.

### S5 Contest windows
- 2K27: an EIGHT-TIER, colour-coded contest; the Defensive Impact Indicator under the shooter draws the contest as an arc
  ("a small white arc" for a weak late contest, "a large crimson arc" for a suffocating one). UP on the stick = an
  aggressive hands-up (foul risk), DOWN = a conservative hands-up.
- Contest strength = position + timing + wingspan (+6 % max vs min) + the shooter's own grades; a strong contest NARROWS
  THE GREEN WINDOW (2K26 update), i.e. the contest acts on the timing, not only on a dice roll.
- Body-up (cut-offs): "flick the right stick for a one-step cutoff, R2 + flick to cover more ground"; a timed cutoff is a
  body-up collision that drains Adrenaline and can force a pick-up or a fumble.
- Steals resolve on contact, by rating (2K27 tuning).

### S6 Shot timing
- The window is TIME, not a bar position: 2K26 ~40–60 ms green; 2K27 a ~55 ms green with a 15–20 ms PURE window in it
  ("release inside it and the ball goes in, every single time"); ±5.8–13.9 ms bands where ~70 % fall by rating.
- The reads: EARLY / LATE by timing, and (2K27 rhythm shooting) FAST / SLOW by tempo; the meter's tick moves with the
  stick in real time; matching the tempo WIDENS the window, rushing shrinks it.
- Green or miss is universal (2K26): timing decides; the rim decides only how a miss looks.
- The animation differs by band: an early release is a short arm; a late release is a leaning, flat-footed push — the
  read is in the body before the ball reaches the rim.
- Meter off ≈ +10 points on late releases (a pro convention, not a rule).

### S7 Footwork
- Jab (triple threat), the gather step of a layup, the euro's two steps, the hop's two-foot plant, the pull-up's plant,
  the step-back's hop: each is a foot event the lower-body pose matching lands on the floor — no slide.
- A cut plants; a cut at pace costs speed; a defender's cutoff is a one-step plant.

### S8 Facing + arms
- The chest faces the play: the ball-handler squares to the rim on the catch; the defender squares to the handler; the
  shooter's follow-through holds; the off arm shields on a drive (2K27 head-tracking on no-look passes shows how far the
  facing model goes).
- Arms are never dead: dribbling arms carry the ball, running arms pump in opposite phase, defenders' arms are up or wide.

## FEL today, by S-gate (what the labs measure on the lane tree)

| S | FEL mechanism | Where | The number the pass reads |
|---|---|---|---|
| S1 | `CourtMovement` (steer, `CUT_COST_HOOPS` min 45°, max 0.3 of speed, from speed01 0.45), `StrideMatch` | core/CourtMovement.ts | stick→facing error; time to pace / to stop; skate cm per planted frame (`_footplant-probe`) |
| S2 | 1v1 / 3v3 `planGather` (gather inside the meter), dunk `PLANT_SEC` 0.1 s hold at the line, the drive dunk `resolveK`; 3PT catch-and-shoot has no hop / set | modes, core/DunkLegs.ts, core/DriveFlight.ts | plant frames before takeoff; takeoff v vs approach v; pop-jumps |
| S3 | dunk aerial clips + `PostureLayer` windows (rise / hang / extend / jam / brace), layup styles (`classifyShot`: layup, floater, scoop, spin, hang, finger roll, reverse, mikan, up-and-under, hook, fade) | core/Biomech.ts, core/BasketballCore.ts | body smoke T-arm / dead-arm frames in the air |
| S4 | dunk land clip (`dunk_land_crouch`), 1v1 / 3v3 landing = the clip's end into idle | modes | snap frames at touchdown (root y < 0.08) |
| S5 | contest level = 1 − d / 2.2 (BasketballCore 728), close-out to ARMS_LENGTH 1.25 m, hand-up contest `contest` slot, `contestJump` block, the dunk's car / prop | core/DefenderBrain.ts, core/BasketballCore.ts | contest → make % curve; strips per press; the contest read on screen |
| S6 | 3PT `SHOT_TARGET` 0.72 of the bar, PERFECT ± 0.06, GOOD ± 0.16 (bar units, not ms); 1v1 / 3v3 `ShotMeter` green per shot style; dunk window `qteWindowSec` (0.28 s) about clip 1.25 with the buffer back to the top of the arc; `RimDecides` (Weibull radial, P(made) = pct) | core/shootoutHud.ts, modes, core/RimDecides.ts | timing ladder: release offset → made %; the reads per band; the window in ms |
| S7 | `HandleSystem` / `StickHandle` moves, `DribbleController.stepBack`, `planGather`, post footwork (shimmy / drop step) | core/* | foot-plant probe through the move kit |
| S8 | `faceToward` rim rate on dunk, `HoopsPosture` chest aim, `ballCarry` arms, loco clips (`bball_mc_*`) | core/HoopsPosture.ts, anim/ballCarry.ts | facing error to the play; T-arm / dead-arm by clip (`teeBy`) |

## The gap table (what phases 3–9 fix, in 2K's terms)

| S | Gap | Phase |
|---|---|---|
| S1 | FEL has a cut cost and stride matching; it has no WEIGHT class (guard vs big stop the same), and the dunk approach is a RUN hold, not a stick with a walk / jog / sprint ladder | 3 |
| S2 | 3PT has no set / hop: the shot is a meter from a stand. 1v1 / 3v3 jumpers off the move have a gather but the takeoff does not spend the run (pop-jump). The dunk plant is 0.1 s at the line | 4 |
| S3 | dunk hang reads (last pass); 1v1 / 3v3 layup air poses come from few clips; a contested layup keeps the clean finish (no mid-air hand change) | 5 |
| S4 | 1v1 / 3v3 land straight into idle (no absorb); the dunk lands on a crouch but a miss's fall reads as a clip cut | 5 |
| S5 | contest is a distance scalar with one read (the meter narrows?) — no tiered read under the shooter, no hands-up vs body-up distinction, no cut-off collision; a contest changes the pct only | 6 |
| S6 | the 3PT window is 0.16 of a bar (hundreds of ms) with three bands; 1v1 / 3v3 greens vary by style; timing is graded but the ANIMATION does not change by band (early / late look alike); no tempo read | 7 |
| S7 | moves fire from the stick with the feet following the root (slide) — the foot-plant probe is the judge; the euro / hop gathers do not exist as foot events | 8 |
| S8 | chest aim exists on dunk and hoops posture; dead arms on some loco clips (the body smoke's `teeBy`), the 3PT shooter idles with straight arms | 9 |

The numbers on the right-hand side are filled in by the baseline (phase 1) and re-read after each phase.
