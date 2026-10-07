# Mirror Assess — threshold register (sign-off sheet)

**PROPOSED — pending Elijah (NASM-CES/PES) approval. NOT FINAL.** Every threshold, band, weight and drill cue the Quick
Screen uses lives in ONE file, [`lib/screen/PROPOSED-thresholds.ts`](../lib/screen/PROPOSED-thresholds.ts) (SCREEN-SHIP,
2026-09-29; it was `lib/assess/thresholds.ts`, which now only re-exports it). **Nothing is signed off.** Every score,
band and cue the app shows carries "PROPOSED · preview" ("Scoring thresholds are proposed and pending coach approval")
while any threshold behind it is unsigned, and a result records `thresholdsVersion`, so a re-tuned band never makes an
old reading look comparable when it is not.

How to sign one off: change its value in `lib/screen/PROPOSED-thresholds.ts` if needed, set `signedOff: true`, bump
`THRESHOLDS_VERSION`, and fill the last column here. `lib/assess/thresholds.test.ts` fails if this table and the
register disagree on an id or a value (regenerate the table from the register; do not edit it by hand).

Sources: **spec [TUNE-EJ]** = a starting guess from FEL-MIRROR-REALTIME-SPEC §4–§5 (or a lane default the spec leaves
open, marked "Lane default" in its line); **repo TUNE(elijah)** = a number the repo already uses, which was never checked
on a real athlete either; **research draft 2026-09-28** = Research & Advisor's proposed cutoffs and drill cues (common
movement-screen practice: NASM overhead squat assessment, knee-to-wall, single-leg squat, countermovement jump; not
validated for phone-camera tracking); **Screening Squad 2026-09-28** = the Squad's amendments (AMENDMENTS 2).

## The three bands (what the athlete sees)

- **Green**: "Good to go"
- **Yellow**: "Worth working on"
- **Red**: "Priority to work on"

Each graded check carries three bands in the register (the "Three bands" column): Green while the value is on the good
side of the Green edge, Red once it is past the Red line, Yellow between. The results screen reads the word from these
cut points, never from a score. For a mapped entry PR #20's band was rebuilt from the draft: `good` = the Green→Yellow
edge, `fault` = the Yellow→Red line (its comparison follows the draft's wording: "over 20" is `> 20`), and `poor` =
PR #20's poor unless it fell inside the new Yellow, where it is the Red line (the score reaches 0 where Red starts).

Jump height has **no band** (the draft: "no Red band for height, especially for kids"): it shows as a personal best to
beat. The landing weight shift is **hidden in v1** (Squad): not graded, shown or counted.

## The check → metric map

MAPPED = the draft's numbers replace PR #20's band. LABELS ONLY = the draft has no numbers, so PR #20's band stays and
the draft's words and cue attach. HIDDEN / NO BAND = never a grade.

| Test | Draft check | Map | Status | Register id | PR #20 metrics | Green / Yellow / Red | Drill cue |
|---|---|---|---|---|---|---|---|
| T1 | Knees cave in (knee angle from the front) | MAPPED | graded | `t1.valgus` | valgusLeft, valgusRight | under 0.4 hip half-widths / 0.4 to 0.8 / over 0.8 | Band lateral walks, clamshells, goblet squat with knees pushed out |
| T1 | Forward lean (chest compared with shin angle) | MAPPED | graded | `t1.trunkTibia` | trunkTibia | under 15° difference / 15 to 30° / over 30° | Calf and hip flexor stretch, goblet squat to a box |
| T1 | Arms fall forward (compared with torso line) | MAPPED | graded | `t1.shoulderFlex` | shoulderFlex | under 10° off the torso line / 10 to 25° / over 25° | Wall slides, lat stretch, foam roll upper back |
| T1 | Heels lift | MAPPED | graded | `t1.heelRiseReps` | heelRise | none / n/a / any lift | Ankle mobility (see knee-to-wall drills) |
| T1 | Depth | LABELS ONLY | graded | `t1.depthKneeFlex` | depthKneeFlex | thighs at parallel or lower / a bit above parallel / well above parallel | Box squats, lowering the box over time |
| T1 | (not in the draft: PR #20 scores it) | LABELS ONLY | graded | `t1.lateralShift` | lateralShift | 0.1 hip widths or less / 0.1 to 0.3 / 0.3 or more | Split squat, slow tempo |
| T2 | Shin angle | MAPPED | graded | `t2.tibia` | tibia | 38° or more / 30 to 37° / under 30° | Knee-to-wall rocks, banded ankle mobilization, calf stretch |
| T2 | Left vs right gap | MAPPED | graded | `t2.lrDiff` | lrDiff | under 5° / 5 to 8° / over 8° | Extra sets on the tighter side |
| T3 | Knee caves in | MAPPED | graded | `t3.fppa` | fppa | under 10° / 10 to 20° / over 20° | Step-downs with knee over the middle toes, banded glute work |
| T3 | Hip drops on the free-leg side | MAPPED | graded | `t3.pelvicDrop` | pelvicDrop | under 5° / 5 to 10° / over 10° | Side planks, single-leg glute bridge |
| T3 | Trunk leans sideways | MAPPED | graded | `t3.trunkLean` | trunkLean | under 10° / 10 to 15° / over 15° | Single-leg balance holds, split squats |
| T3 | Left vs right gap on any check | MAPPED | graded | `t3.lrGap` | fppa, pelvicDrop, trunkLean | under 5° / 5 to 10° / over 10° | Lead with the weaker side |
| T5 | Landing knees cave in | MAPPED | graded | `t5.landingValgus` | landingValgusLeft, landingValgusRight | under 10° / 10 to 20° / over 20° | Snap-down landings, drop-and-stick holds |
| T5 | Stiff landing (little knee bend on landing) | LABELS ONLY | graded | `t5.landingFlex` | landingFlex | soft landing / somewhat stiff / locked knees | "Land quiet" drills, box landings |
| T5 | Landing left vs right weight shift | HIDDEN | hidden-v1 | — | — | even / slight shift / clear shift | Single-leg hops and sticks |
| T5 | Jump height (no Red band for height) | NO BAND | personal-best | — | — | — | — |

## Notes measured while building (for the sign-off)

## Notes measured while building (for the sign-off)

- **T2 asymmetry fires on points before degrees.** T2's band is 8° wide (38° good, 30° poor, since SCREEN-SHIP; it was
  12° wide), so the spec's 15-point asymmetry rule trips at about a 1.2° left–right gap, well inside T2's own 8° Red
  line. Consider the metric limit alone for T2. (The Quick Screen's cards read the three bands, not this flag.)
- **T1 heel rise is all-or-nothing** (0 reps = 100, any rep = 0, weight 15), which with the 0.3·worst pull costs a
  squat about 40 points for one heel. The spec's rule, kept as written.
- **T1 hip crease** has weight 0 in the 0–100 (the spec's T1 weights sum to 100 without it) but still faults for the
  0–3, like FMS's femur-below-horizontal line.
- **Heel rise** is read as 1.5% of standing body height (spec §3.2), not the guided squat's 0.012 image units
  (`geom.heelRiseRepo`, kept as a reference row); the two agree at about 80% frame fill.
- **FPPA parallax.** A knee bending 60° toward a lens 3 m away read 2.5° "pushed out" before each point was moved to the
  hip's depth using MediaPipe's image z; the correction assumes a 60° lens (`geom.lensHfovDeg`).
- **T5 contact line.** Flight starts when both feet clear 2% of body height and is extrapolated back to the floor from
  the first ~50 ms of flight. On synthetic hands-on-hips jumps with the synth's jitter: 1.8 cm mean error at 30 fps,
  1.4 cm at 60 fps; on the owner's recorded rebounding take (`jump_two_foot_low`), 5.1 cm. Real feet peel off the floor,
  so the gold-standard capture (jump mat) is what should set `t5.contactLine` / `t5.airLine`.
- **T5 at 60 fps.** Until Mirror Phase 3, `lib/pose/PoseService` thinned pose detection to 30 Hz (`MIN_DETECT_GAP_MS`)
  even though the route asked the camera for 60 fps, so every CMJ read under the 50 Hz gate. Now T5 opts in
  (`PoseService.requestHighRate`): the camera at 60 fps, detection thinned to 60, measured on the first body frames.
  It holds where the device reaches 50 Hz with a detect within 12.5 ms, and falls back to 30 Hz with the reason
  otherwise. On a synthetic 60 fps CMJ the gate clears and landing timing is scored; the same take thinned to 30 Hz
  cannot. A mid-range phone may well fall back: the capture's frame-rate log says which.
- **Rep segmentation** (`t1.rep*`, `t2.repRise`, `t3.rep*`) are lane defaults: a squat that dips less than ~45° of knee
- **SCREEN-SHIP (2026-09-29).** The mapped bands are the research draft's; t1.valgus is the Squad's (hip half-widths,
  0.4 / 0.8: the draft's 10° / 20° are degrees and do not apply to this metric); three reps per check, graded on the
  median of the best three (A2-2). The flight finder's constants, the bottom-window shares, the calibration's acceptance
  and the live flow's limits moved here from the graders and the runner, with their values unchanged.

## Tuning on real people: the owner-led capture (Mirror Phase 3, 2026-10-07)

Owner decision: the thresholds are finished by a capture you lead (you and 2 adults, a mid-range Android and an
iPhone, pose numbers only, never video, no minors). **Your next step is [`MIRROR-CAPTURE-PROTOCOL.md`](MIRROR-CAPTURE-PROTOCOL.md).**

- **Record** the protocol's 44 labelled takes on `/dev/pose-record?set=capture`. Each take is a good set or one named
  fault done on purpose. The recorder saves numbers only, under an alias, with "adults only" and "consent" stated.
- **Ingest** with `npx tsx scripts/mirror-capture.ts ingest <files>`. It writes one fixture per person per phone to
  `lib/mirror/fixtures/captured/`, checked by `lib/pose/recordingsGuard.ts`.
- **Replay** with `npx tsx scripts/mirror-capture.ts report`. Every grader runs against the captures:
  - the Quick Screen's bands above;
  - the Mirror's squat, lunge, press/row, hinge and push-up audits (the Movement Screen's `LUNGE_THRESHOLDS` included);
  - the lite confidence floor.

  For each check it prints:
  - **Before:** the hit rate on good takes, the catch rate on labelled faults and the false alarms, at the value
    here, overall and by phone.
  - **A suggested TUNED value:** the line that best separates the labelled good takes from the faults, with the same
    table **after**.
- **Sign off** each value yourself. **The report never edits this register or any audit file.** Change the value
  here, set `signedOff: true`, bump `THRESHOLDS_VERSION`, and regenerate the table below. A Mirror audit's number is
  changed in its own file.

Two findings from the synthetic replay, for the capture to confirm or clear:

- **The lunge knee line.** Under the synth's landmark jitter, a clean lunge's worst knee read is 0.31 to 0.50 hip
  half-widths, past `LUNGE_THRESHOLDS.kneeInWarn` 0.30. The lunge has no persistence gate, unlike the squat.
- **The squat depth line.** The batch squat pattern (`lib/mirror/squatPattern.ts`, depth line 0.5) calls the repo's
  own clean squat fixture shallow (`squat_clean.json` reads 0.48).

New PROPOSED numbers from Phase 3, outside this register (both in `lib/pose`), which the capture also tunes:

- **The jump's high-rate trial:** 60 fps asked; it holds at 50 Hz or more with a detect within 12.5 ms.
- **The lite confidence floor:** a 1 s median visibility of 0.5, clearing at 0.6. Measured silent on every good
  fixture (lowest 0.928).

## Questions for Elijah (from the research draft, verbatim)

1. Are these cutoffs right for how you screen clients, or do you want them stricter or looser?
2. Any drills you'd swap for your go-to correctives?
3. Should the jump show inches, or just a score to beat next time?

## The Movement Screen (PR #22): listed, not moved

Its thresholds stay in mirror-coach's files, unchanged and equally unsigned; the PROPOSED file lists them by name
(`MOVEMENT_SCREEN_REGISTER`) and `lib/screen/PROPOSED-thresholds.test.ts` pins them. Its "What to work on" card
(`components/mirror/screen-next-steps.tsx`) carries the "PROPOSED · preview" label.

| Name | Where | What |
|---|---|---|
| `STATION_THRESHOLDS` | `lib/mirror/stationGraders.ts` | every station's flag line, spread and uncertainty limits (shoulder/hip level 0.08, knee window 0.5, head float 0.12, heel line 10° / asym 8°, single-leg sway 0.12 and touch-downs 1) |
| `MIN_GRADEABLE_CONFIDENCE, gradeOf` | `lib/mirror/assessment.ts` | 0.6 confidence; ELITE 80 / PRIMED 60 / READY 40 (and non-exported bands at L93–97) |
| `triageFor, the score penalties` | `lib/mirror/screen.ts` | ≥3 flags see a specialist, ≥1 address first; −22 one-sided / −15 / −6 borderline (not exported) |
| `MIN_READABLE_CAMERA_CHECKS / STATIONS` | `lib/mirror/screenClaims.ts` | 3 checks / 2 stations for a screen to count |
| `MIN_CHECKS_FOR_REWARD` | `lib/mirror/screenReward.ts` | 3 checks for the reward |
| `LUNGE_THRESHOLDS` | `lib/mirror/lungeAudit.ts` | kneeInWarn 0.30, hipDropWarn 0.18, torsoDriftWarn 0.40, wobbleWarn 0.035 (TUNE) |
| `CORRECTIVE_BLOCK, fixFor, FIX (screen.ts)` | `lib/mirror/screenCorrectives.ts, lib/mirror/screen.ts` | the corrective blocks and FIX lines shown in "What to work on" |
| `CORRECTIVE_REST_SECONDS, DOSE` | `lib/coach/mirrorToProgram.ts` | 30 s rest; the coach draft's doses (not exported) |

## The register

Generated from lib/screen/PROPOSED-thresholds.ts (THRESHOLDS_VERSION `jump-screen-0.2-proposed`, PROTOCOL_VERSION `jump-screen-1.0`), 79 entries.

| ID | What it is | Spec | Current value | Unit | Source | Three bands | Signed off | Elijah sign-off |
|---|---|---|---|---|---|---|---|---|
| `gate.minConfidence` | Below this confidence a test is "not scored", never guessed | §3.2 | 0.6 | share 0–1 | repo TUNE(elijah): `lib/mirror/assessment.ts MIN_GRADEABLE_CONFIDENCE` |  | no | |
| `gate.minPoseHz` | Pose-rate gate: under it the device check says so | §3.1 | 24 | Hz | repo TUNE(elijah): `lib/pose/modelChoice.ts MIN_CAMERA_FPS` |  | no | |
| `gate.jumpFps` | Jump timing: under this pose rate the CMJ is flagged and contact timing is not scored | §3.1, §4 T5 | 50 | Hz | spec [TUNE-EJ] |  | no | |
| `gate.visibility` | Per-landmark visibility for tracking | §3.1 | 0.5 | visibility 0–1 | spec [TUNE-EJ] |  | no | |
| `gate.visibilityScoring` | Per-landmark visibility for a scoring frame | §3.1 | 0.65 | visibility 0–1 | spec [TUNE-EJ] |  | no | |
| `gate.minValidReps` | Fewer valid reps than this caps the test at 1/3 and writes no PRQ | §4 rules | 3 | reps | spec [TUNE-EJ] |  | no | |
| `gate.absenceRestartMs` | Out of frame this long restarts the test | §8 | 6000 | ms | repo TUNE(elijah): `lib/mirror/screenRunner.ts ABANDON_MS` |  | no | |
| `calib.frontMs` | Standing still facing the camera | §3.3 | 3000 | ms | spec [TUNE-EJ] |  | no | |
| `calib.sideMs` | Standing still side-on | §3.3 | 2000 | ms | spec [TUNE-EJ] |  | no | |
| `calib.maxSway` | Lane default: hip sway allowed during a calibration hold | §3.3 | 0.02 | body-height fraction | spec [TUNE-EJ] |  | no | |
| `calib.accept` | Lane default: a hold counts when it spans 90% of its time with 60% of its frames usable (at least 5), and the body is over 0.2 of the image tall (moved from calibration.ts) | §3.3 | spanShare 0.9 · frameShare 0.6 · minFrames 5 · minBodyHeight 0.2 | share / frames / image height | spec [TUNE-EJ] |  | no | |
| `geom.heelRise` | Heel lifts above its calibrated floor line by more than this | §3.2 | 0.015 | body-height fraction | spec [TUNE-EJ] |  | no | |
| `geom.lensHfovDeg` | Lane default: lens width the FPPA parallax correction assumes (a knee moving toward the lens) | §3.2 | 60 | deg | spec [TUNE-EJ] |  | no | |
| `geom.heelRiseRepo` | Reference only (not read by the scorer): the guided squat's heel line; ≈ geom.heelRise at 80% frame fill | §4 T1 | 0.012 | image-height units | repo TUNE(elijah): `lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts heelRiseWarnPx` |  | no | |
| `geom.nominalBodyHeight` | Lane default: the body height the live heel check assumes before any calibration (moved from runner.ts) | §3.2 | 0.7 | image-height units | spec [TUNE-EJ] |  | no | |
| `t1.repEnter` | Lane default: a squat rep starts past this hip drop | §4 rules | 0.1 | hip drop / standing hip height | spec [TUNE-EJ] |  | no | |
| `t1.repExit` | Lane default: …and ends back under this | §4 rules | 0.05 | hip drop / standing hip height | spec [TUNE-EJ] |  | no | |
| `t1.repMinPeak` | Lane default: a dip shallower than this (~45° of knee bend) is not a rep; a shallow squat past it IS one, and scores low on depth | §4 rules | 0.15 | hip drop / standing hip height | spec [TUNE-EJ] |  | no | |
| `t1.bottomWindow` | Lane default: the frames a squat's "bottom" is read over (moved from the T1 grader) | §4 T1 | 0.7 | share of the rep's peak hip drop | spec [TUNE-EJ] |  | no | |
| `t2.repRise` | Lane default: a knee-to-wall rock is a tibia swing of at least this | §4 T2 | 6 | deg | spec [TUNE-EJ] |  | no | |
| `t2.heelFloorPercentile` | Lane default: the heel's own floor line over the test is its 90th-percentile y (moved from the T2 grader and the runner) | §4 T2 | 0.9 | percentile | spec [TUNE-EJ] |  | no | |
| `t3.repEnter` | Lane default: a single-leg squat rep starts past this | §4 T3 | 20 | deg knee flexion | spec [TUNE-EJ] |  | no | |
| `t3.repExit` | Lane default: …and ends back under this | §4 T3 | 12 | deg knee flexion | spec [TUNE-EJ] |  | no | |
| `t3.repMinPeak` | Lane default: shallower than this is not a rep | §4 T3 | 30 | deg knee flexion | spec [TUNE-EJ] |  | no | |
| `t3.bottomWindow` | Lane default: the frames a single-leg squat's deepest point is read over (moved from the T3 grader) | §4 T3 | 0.9 | share of the rep's peak knee flexion | spec [TUNE-EJ] |  | no | |
| `t1.reps` | Reps asked for, each view | A2-2 | 3 | reps | Screening Squad 2026-09-28 |  | no | |
| `t2.reps` | Rocks asked for, each side | A2-2 | 3 | reps | Screening Squad 2026-09-28 |  | no | |
| `t3.reps` | Reps asked for, each side (was 5, spec §4 T3) | A2-2 | 3 | reps | Screening Squad 2026-09-28 |  | no | |
| `t5.reps` | Jumps asked for; the best one is the personal best, the landings are graded on the median | A2-2 | 3 | jumps | Screening Squad 2026-09-28 |  | no | |
| `t1.depthKneeFlex` | Depth: knee flexion at the bottom (side). Draft "Depth" row, LABELS ONLY (the draft gives no numbers) | §4 T1 | good 110 · poor 70 · fault < 80 | deg | spec [TUNE-EJ] | Green >= 110 · Red < 80 | no | |
| `t1.hipCrease` | Hip crease vs knee line at the bottom (side); counts for 0–3 only, weight 0 | §4 T1 | good 0 · poor 0.15 · fault > 0 | thigh-length fraction above the knee | repo TUNE(elijah): `squat-audit.ts depth01 knee line` |  | no | |
| `t1.trunkTibia` | Forward lean: trunk angle minus tibia angle at the bottom (side) | draft §1 | good 15 · poor 35 · fault > 30 | deg | research draft 2026-09-28 | Green < 15 · Red > 30 | no | |
| `t1.shoulderFlex` | Arms fall forward: shoulder flexion ∠(hip, shoulder, wrist), 180 = arm in the torso line; the draft's deviation d = 180 − this (Green d < 10, Red d > 25) | draft §1 | good 170 · poor 140 · fault < 155 | deg | research draft 2026-09-28 | Green > 170 · Red < 155 | no | |
| `t1.heelRiseReps` | Heel lift: reps where a heel rose (side); any rep is Red | draft §1 | good 0 · poor 1 · fault >= 1 | reps | research draft 2026-09-28 | Green <= 0 · Red >= 1 | no | |
| `t1.valgus` | Knees cave in: knee-inside ratio at the bottom (front), each knee. The draft's 10°/20° are degrees and are NOT used for this metric | A2-1 | good 0.4 · poor 0.8 · fault > 0.8 | hip half-widths | Screening Squad 2026-09-28 | Green < 0.4 · Red > 0.8 | no | |
| `t1.lateralShift` | Lateral weight shift from the standing line (front). The draft is silent: PR #20's band | §4 T1 | good 0.1 · poor 0.4 · fault >= 0.3 | hip widths | repo TUNE(elijah): `squat-audit.ts lateralWarn 0.3` | Green <= 0.1 · Red >= 0.3 | no | |
| `t1.weights` | T1 metric weights (valgus 20 split 10 per knee) | §4 T1 | depthKneeFlex 25 · trunkTibia 15 · shoulderFlex 15 · heelRise 15 · valgusLeft 10 · valgusRight 10 · lateralShift 10 | weight | spec [TUNE-EJ] |  | no | |
| `t2.tibia` | Shin angle from vertical at max knee-forward, heel down (10 cm from the wall ≈ 35–38°) | draft §2 | good 38 · poor 30 · fault < 30 | deg | research draft 2026-09-28 | Green >= 38 · Red < 30 | no | |
| `t2.lrDiff` | Left vs right shin-angle gap: the asymmetry flag at the Red line | draft §2 | good 5 · poor 8 · fault > 8 | deg | research draft 2026-09-28 | Green < 5 · Red > 8 | no | |
| `t3.fppa` | Knee caves in: FPPA at the deepest point, minus the standing baseline | draft §3 | good 10 · poor 20 · fault > 20 | deg | research draft 2026-09-28 | Green < 10 · Red > 20 | no | |
| `t3.pelvicDrop` | Hip drops on the free-leg side, minus the standing baseline | draft §3 | good 5 · poor 12 · fault > 10 | deg | research draft 2026-09-28 | Green < 5 · Red > 10 | no | |
| `t3.trunkLean` | Trunk leans sideways at the deepest point | draft §3 | good 10 · poor 20 · fault > 15 | deg | research draft 2026-09-28 | Green < 10 · Red > 15 | no | |
| `t3.lrGap` | Left vs right gap on any check: the worst \|L − R\| of the per-side medians of t3.fppa, t3.pelvicDrop and t3.trunkLean (all degrees), computed on the phone | A2-1 | good 5 · poor 10 · fault > 10 | deg | Screening Squad 2026-09-28 | Green < 5 · Red > 10 | no | |
| `t3.lrGapHalfWidths` | The same gap for a metric in hip half-widths. UNUSED: no T3 metric is in hip half-widths | A2-1 | good 0.2 · poor 0.4 · fault > 0.4 | hip half-widths | Screening Squad 2026-09-28 |  | no | |
| `t3.depth` | Depth reached (knee flexion). Not a Quick Screen check (the draft has no row); PR #20's score only | §4 T3 | good 60 · poor 30 · fault < 45 | deg | spec [TUNE-EJ] |  | no | |
| `t3.balanceReps` | Reps with a touch-down or hop; any caps the test at 1/3 (an unfinished check for the clean-screen rule) | §4 T3 | good 0 · poor 2 · fault >= 1 | reps | spec [TUNE-EJ] |  | no | |
| `t3.weights` | T3 metric weights | §4 T3 | fppa 40 · pelvicDrop 25 · trunkLean 20 · depth 15 | weight | spec [TUNE-EJ] |  | no | |
| `t5.contactLine` | A foot below this height is on the floor (flight ends at the first foot down) | §3.2 | 0.02 | body-height fraction | spec [TUNE-EJ] |  | no | |
| `t5.airLine` | Both feet above this = airborne (hysteresis over the contact line) | §3.2 | 0.035 | body-height fraction | repo TUNE(elijah): `lib/irl/dunkTracker.ts AIRBORNE_RISE 0.03 image units, restated per body height` |  | no | |
| `t5.flightMinMs` | A shorter flight is a hop, not a jump | §4 T5 | 180 | ms | repo TUNE(elijah): `lib/irl/dunkTracker.ts MIN_FLIGHT_MS` |  | no | |
| `t5.flightMaxMs` | A longer flight is refused (the camera lost the feet) | §4 T5 | 1200 | ms | repo TUNE(elijah): `lib/irl/dunkTracker.ts MAX_FLIGHT_MS` |  | no | |
| `t5.maxHeightCm` | Heights over this are refused | §4 T5 | 130 | cm | repo TUNE(elijah): `lib/irl/dunkTracker.ts MAX_VERTICAL_CM` |  | no | |
| `t5.nominalHeightM` | Lane default: the body height a flight's sanity check assumes when there are no world landmarks (a flight's feet must rise half what its air time needs) | §4 T5 | 1.6 | m nose to floor | spec [TUNE-EJ] |  | no | |
| `t5.flightDetect` | Lane default: the flight finder (planted-foot speed and window, floor-run level and length, edge fit span/top/slack, step-settle window, search limits, the landing's apex drop, and the half-rise sanity share), measured on the synthetic and recorded CMJs (moved from t5-cmj.ts) | §4 T5 | plantedSpeed 0.45 · plantedMs 66 · plantedMinShare 0.5 · floorFrames 12 · runLevel 0.03 · minRunFrames 3 · lookbackMs 800 · edgeSpanMs 50 · edgeTop 0.15 · edgeSlackMs 17 · settleMs 130 · settleFrames 3 · settleRise 3 · searchMs 3000 · limitSlackMs 1500 · apexDrop 0.05 · riseShare 0.5 | body heights / ms / frames | spec [TUNE-EJ] |  | no | |
| `t5.landingWindowMs` | Landing metrics read the peak within this long of touchdown | §4 T5 | 300 | ms | spec [TUNE-EJ] |  | no | |
| `t5.landingFlex` | Stiff landing: the landing knee-flexion proxy. Draft "Stiff landing" row, LABELS ONLY (the draft gives no numbers) | §4 T5 | good 0.25 · poor 0.1 · fault <= 0.1 | hip drop / standing hip height | spec [TUNE-EJ] | Green >= 0.25 · Red <= 0.1 | no | |
| `t5.landingValgus` | Landing knees cave in: landing FPPA at peak flexion, minus the standing baseline | draft §4 | good 10 · poor 20 · fault > 20 | deg | research draft 2026-09-28 | Green < 10 · Red > 20 | no | |
| `t5.landingSymMs` | Left/right touchdown gap (1 frame / 3 frames at 60 fps); only scored at ≥ 50 fps. Timing, NOT the draft's weight shift (hidden in v1) | §4 T5 | good 17 · poor 50 · fault >= 50 | ms | spec [TUNE-EJ] |  | no | |
| `t5.cvPct` | Height variation across the three jumps: flagged, not scored | §4 T5 | good 5 · poor 12 · fault >= 12 | % | spec [TUNE-EJ] |  | no | |
| `t5.weights` | Lane default: CMJ quality weights (the spec gives none) | §4 T5 | landingFlex 40 · landingValgusLeft 20 · landingValgusRight 20 · landingSym 20 | weight | spec [TUNE-EJ] |  | no | |
| `t5.armSwingWrist` | Lane default: a wrist above the shoulder line in flight means the hands left the hips; the jump is not the standard | §4 T5 (Q3) | 0 | image-height units above the shoulder line | spec [TUNE-EJ] |  | no | |
| `score.bestOf` | A metric is the median of the best this-many valid reps (moved from reps.ts) | §4 rules | 3 | reps | spec [TUNE-EJ] |  | no | |
| `score.peakWindowMs` | Lane default: a rep's extreme is the median over ± this long around its extreme frame (moved from reps.ts) | §4 rules | 100 | ms | spec [TUNE-EJ] |  | no | |
| `score.meanWorst` | Test score = 0.7·weighted mean + 0.3·worst metric | §4 rules | mean 0.7 · worst 0.3 | weight | repo TUNE(elijah): `lib/mirror/assessment.ts assessSquat` |  | no | |
| `score.bands03` | 0–3: 3 ≥ 80 with no fault; 2 at 50–79 or any fault; 1 under 50 | §4 rules | three 80 · two 50 | score | spec [TUNE-EJ] |  | no | |
| `score.asymmetryPoints` | Asymmetry flag when \|L − R\| test scores differ by this | §4 rules | 15 | points | spec [TUNE-EJ] |  | no | |
| `mqs.flagPenalty` | MQS loses this per asymmetry flag | §5.1 | 5 | points | spec [TUNE-EJ] |  | no | |
| `mqs.maxFlags` | At most this many flags count | §5.1 | 3 | flags | spec [TUNE-EJ] |  | no | |
| `mqs.minTests` | Fewer scored tests: no MQS | §5.1 | 3 | tests | spec [TUNE-EJ] |  | no | |
| `grade.bands` | ELITE / PRIMED / READY / RECOVERING | §5.1 | elite 80 · primed 60 · ready 40 | score | repo TUNE(elijah): `lib/prq.ts prqGrade, lib/mirror/assessment.ts gradeOf` |  | no | |
| `prq.verticalJump` | Power axis: CMJ height 12 in → 0, 40 in → 100 | §5.2 | floor 12 · ceiling 40 | in | repo TUNE(elijah): `lib/profile/scanToSnapshot.ts verticalJump` |  | no | |
| `prq.ankleDorsiflexionDeg` | Flexibility input: tibia angle 30° → 0, 45° → 100 | §4 T2, §5.2 | floor 30 · ceiling 45 | deg | spec [TUNE-EJ] |  | no | |
| `prq.flexWeights` | Flexibility = 0.625·T2 axis + 0.375·T1 mobility | §5.2 (renormalized, no T4) | t2 0.625 · t1Mobility 0.375 | weight | spec [TUNE-EJ] |  | no | |
| `run.maxAttempts` | Lane default: attempts before a part ends anyway, so a heel that keeps lifting cannot trap the athlete (moved from runner.ts) | §8 | T1 6 · T2 7 · T3 8 · T5 6 | reps per part | spec [TUNE-EJ] |  | no | |
| `run.maxMs` | Lane default: active time before a part ends anyway (moved from runner.ts) | §8 | T1 60000 · T2 60000 · T3 60000 · T5 90000 | ms per part | spec [TUNE-EJ] |  | no | |
| `cue.minGapMs` | Lane default: at most one spoken cue per this long | §8 | 2500 | ms | spec [TUNE-EJ] |  | no | |
| `cue.slowerRepMs` | Lane default: a rep quicker than this is told "Slower." (tempo, allowed by the spec; moved from runner.ts) | §8 | 800 | ms | spec [TUNE-EJ] |  | no | |
| `ui.miniResultMs` | Per-test "done" card on screen | §8 | 3000 | ms | spec [TUNE-EJ] |  | no | |
| `ui.timing` | Lane default: the 3-2-1, how long a rep's colour holds, a repeated cue's quiet time, and how often / how long after landing the live jump counter reads (moved from runner.ts) | §8 | countdownMs 3000 · markMs 1200 · cueRepeatMs 8000 · jumpScanMs 500 · jumpSettleMs 400 | ms | spec [TUNE-EJ] |  | no | |
