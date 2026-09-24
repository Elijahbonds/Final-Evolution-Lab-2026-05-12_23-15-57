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

| # | Theme | What changes | Gate |
|---|---|---|---|
| 1 | Instrument + baseline + decode | the probe, the decode, the baseline, this plan | this table |
| 2 | Smooth pose clips | `buildPoseClip` resamples its keys as a spherical cubic in joint space (every bone, every 1/30 s), with per-key `hold` easing | dunk-family SPARC up, pops down, no new locked limbs |
| 3 | Overlap and wrists | successive breaking of joints (the chain lags its parent by a frame or two, collapsing at contact keys); `wrists` keys (grip, cock, snap, relaxed) | wrists move in every dunk; thoracic stillness down |
| 4 | The flight belongs to the dunk | the trick is paced to reach its flush pose on the window's centre; per-family flush clips replace the generic two-hand hang; the called windmill / tomahawk is thrown once; the hover is fixed | no held generic finish; the windmill's jam in ≤ 0.35 s |
| 5 | Take-off and rise | a long, low penultimate step, the plant, the arm swing up the front, the lead knee drive; the rise sets up the called dunk instead of swinging the ball at the hip | the plant-to-apex frames read as a jump |
| 6 | Names I: one-hand family | power, tomahawk (the wind-up survives the reach), windmill (a full front-to-back circle, long arm), rock the cradle (re-authored), two-hand, the tap | each dunk's signature shape measured on the sheet |
| 7 | Names II: through the legs | eastbay (left to right under the left leg, dominant-hand finish), double eastbay, between the legs (under both), fake eastbay | the ball path measured against the legs |
| 8 | Names III: behind, around, spins | behind the back, the fake, scorpion (ball behind, eyes down), hide & seek, lost & found, double clutch, 360, 360 windmill | the signature shapes |
| 9 | Rim, hang, land; the reach roll | the flush wrist snap, the hang's swing, the drop, the land absorb; the reach IK's twist held continuous; locked elbows | pops at the rim ≈ 0; elbow-lock frames down |
| 10 | Everywhere + the score loop | the game dunks (1v1 / 3v3 via HoopsDunks), Dunk Duel, the contest rival; the full re-measure, the summary, the deploy | every number above against the baseline |

Rules (from the hoops-depth pass):
- Commit and push each green phase with the suite count.
- `tsconfig.json` is never committed.
- One deploy after phase 10.
