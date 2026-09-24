# Dunk motion — ten-phase pass (2026-09-23)

Owner: *"all of the dunks need work, smoothening out, sharpening for accuracy in name and style. The body movement looks
unnatural."*

Owner decisions (AskUserQuestion, 2026-09-23):
- **Scope:** every dunk, everywhere.
- **Wrong today:** pose and positioning, stiff poses, names that don't match, hands / ball / timing.
- **Source:** the owner's captures where one matches the dunk, hand authoring against the reference otherwise.
- **Cadence:** ten phases, commit and push per green phase on `lane/finish-release`, one deploy at the end.

The bar is `docs/SPEC-DUNK-MOTION-DECODE.md`. The instrument is `scripts/probes/_dunk-motion-probe.mts`, which records
every rendered frame of a real attempt (the final drawn pose) and replays it frozen for side and front-three-quarter
sheets. Outbox: `~/Claude/outbox/finish-release/dunkmotion/<tag>/`.

## Baseline (phase 1, tag `base`: 22 dunks, one attempt each, slam on the NOW! tell)

| | range over the 22 |
|---|---|
| SPARC (mean of 9 effectors; −1.6 ≈ one smooth reach, more negative = jerkier) | −3.9 … −5.5 |
| one-frame pops (a bone's angular speed ≥ 3.5× its neighbourhood and ≥ 600°/s) | 16 … 49 per dunk |
| frames with an elbow locked past 172° in the air | 53 … 148 |
| wrists (Hand bones) still through the air | 99–100 % on every dunk |
| thoracic (Spine2) still through the air | 3 … 48 % |

What the sheets and the traces show (`base/sheet-*.png`, `base/rec-*.json`):
1. **A called dunk owns about a third of its own flight.** Every flight has the same three parts:
   - the owner's POWER capture (`dunk_mocap`, 1.3 s: the ball swung low at the hip) until the trick's beat, around 0.95 s real;
   - the trick's body for 0.5–0.8 s;
   - the generic two-hand `dunk_score_hang` as the finish, for 15 of the 16 air tricks.

   The seams between those three sources are where the motion goes wrong.
2. **The windmill and the tomahawk are thrown twice.** The trick plays at the rise, then the finish plays the same
   capture again at the slam.
3. **A perfect windmill hovers.** `finishRate = 0.6 / (WINDMILL_RELEASE_T 0.55 + 0.5)` plays the 0.6 s capture at 0.57×. The
   release beat was written for the old 0.85 s authored windmill. The result: the body parked at rim height (root y 0.95)
   for 0.95 s while the arm turns slowly.
4. **Authored clips are 3–7 keys, interpolated linearly.** Every bone moves at a constant speed between keys and changes
   speed on the key frame. There is no slow-in / slow-out and no follow-through, and every joint arrives at once: the
   "robotic" read.
5. **The reach-to-rim arm flips its twist** (a 112° upper-arm roll in one frame, with the hand and elbow still) when it is
   nearly straight. This is the dribble-arm roll again, on the reach.
6. **The wrists never move.** No clip keys a Hand bone, so the ball is carried, cocked and flushed on a flat, locked wrist.
7. Name accuracy (the decode):
   - the eastbay finishes on the non-dominant hand;
   - the cradle circles the head (Jordan's rocks the ball down to the hip and over);
   - the tomahawk's wind-up behind the head is erased by the reach to the rim;
   - the scorpion's ball is out front, not behind;
   - "between the legs" reads as a second eastbay.

## The phases

The owner added four asks while the pass ran (2026-09-23), and they reshaped phases 7–10:
1. "fix the arms when running too";
2. "have the model curve their approach … open up to the side, look at takeoff posture and in flight body mechanics";
3. "pay attention to the lower body … push 1-2 … not dropping their lead leg on off 1 dunks … forcefully strike their arms into
   the air at the same time they take off … reference my book";
4. "switch the model handedness to right hand … dribble on approach if you move the stick … change whether or not they dribble
   based on the dunk … take the ball away and put it where it goes till the model interacts with it … a dubble up eastbay".

The book is Elijah Bonds, *The Art of Dunking* (Final Evolution Press), ch. 7 (approach geometry, the penultimate, one- vs two-foot)
and ch. 8 (in-air kinematics, the hang-time illusion, the off-arm / off-leg as instruments).

| # | Theme | What changes | Gate |
|---|---|---|---|
| 1 | Instrument + baseline + decode | the probe, the decode, the baseline, this plan | done, db8a5f3 |
| 2 | Smooth pose clips | joint-space cubic resampling of the dunk family | done, e532d79 |
| 3 | Overlap and wrists | LimbDrag, WristLayer (mesh-read flex axis) | done, 8b22627 |
| 4 | The flight belongs to the dunk | carry-up + flush per hand, trick pacing, real hand-offs, the windmill thrown once | done, d76f347 |
| 5 | Take-off capture + running arms | the owner's real jump (capture f49–59), the wait as a cock, the chest follows the arms, the reach can't roll the arm, the dribble elbows point back | done, cad9e8a |
| 6 | Names I: one-hand family | real-speed windmill / tomahawk captures, Jordan's cradle, the cuff, the scorpion no-look | done, 002a6ff |
| 7 | The approach and the take-off (asks 2 + 3) | the J approach with the lean into the bend, the open body in the rise; PUSH 1-2 as two real steps; the one-foot take-off (knee drive, arm strike, the lead leg's drop) vs the two-foot capture; carry and flush by foot | done, 60c8d25 |
| 8 | Right-handed + the approach (asks 4a, 5, 6, 7) | the dunk family mirrored onto the rig's other side at spawn (groupMirror, bind-relative); push 1-2 at the runner's own speed (DunkGatherRun: the run kept into the penultimate, a staccato contact, the plant on the line) started ON the push foot (the check-mark strides); the dribble locked to the stride and only while moving; the pick-up eased; the two-foot arms back on the push and up on 2; the J only on triangle | done (this commit) |
| 9 | Joints and the finish (asks 8, 9) | the joint audit (each elbow and knee against its hinge read off the captures: sideways bend, hyperextension, roll continuity); a hinged arm solve (the off arm's roll flips); the off arm's job in every dunk (down and out off one hand, on the ball off two); the finish by common sense: the hand on top, the reach along the jump line, the wrist through, the let-go, the landing | every joint inside its range on every sheet |
| 10 | The Dubble Up + names II / III (ask 4b, owner decisions round 2) | the helper from the prop ring (1–10 in a line) or a call; A on the run near the helper = the straddle-and-grab (the old hop gone); Chen's version off two from the elbow; the eastbay to the dominant hand; behind / around / spins | the Dubble Up eastbay beat by beat against Chen Dengxing's |
| 11 | Right-handed everywhere; rim, hang, land | Dunk Duel, the rival, the 1v1 / 3v3 game dunks mirrored too (owner: "every dunk, every body"); the flush and hang, the drop and the land absorb | every dunk mode on the sheets |
| 12 | The score loop | the full re-measure against the baseline, the summary, ONE deploy | every number against the baseline |

The owner's asks grew the pass from ten phases to twelve (2026-09-23), with the same one deploy at the end:
5. "make the off the dribble approach look fluid, look at examples of elite dunkers";
6. "make the arms fluid with gait, back on push, up on 2 in push 1 2 … thats in a 2 foot jump";
7. "curve the approach only when you decide to press … the top button. make the movement normal elsewhere" (decision: triangle commits);
8. "fix the off arm on all the dunks";
9. "fix the orientation of the joints and proper biomechanics and common sense how you would complete the dunk. analyze it".

Rules (from the hoops-depth pass):
- Commit and push each green phase with the suite count.
- `tsconfig.json` is never committed.
- One deploy after phase 10.
