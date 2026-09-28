# Mirror Assess — threshold register (sign-off sheet)

Every threshold, weight and band the Quick Screen scores with, from `lib/assess/thresholds.ts` (spec §13). **None is
signed off.** Every score the app shows carries "Provisional" while any threshold it used is unsigned, and every saved
row records `thresholdsVersion`, so a re-tuned band never makes an old score look comparable when it is not.

How to sign one off: change its value in `lib/assess/thresholds.ts` if needed, set `signedOff: true`, bump
`THRESHOLDS_VERSION`, and fill the last column here. `lib/assess/thresholds.test.ts` fails if this table and the register
disagree on an id or a value.

Sources: **spec [TUNE-EJ]** = a starting guess from FEL-MIRROR-REALTIME-SPEC §4–§5 (or a lane default the spec leaves
open, marked "Lane default" in its line); **repo TUNE(elijah)** = a number the repo already uses, which was never checked
on a real athlete either.

## Notes measured while building (for the sign-off)

- **T2 asymmetry fires on points before degrees.** T2's band is 12° wide (42° good, 30° poor), so the spec's
  15-point asymmetry rule trips at about a 1.8° left–right gap, well inside T2's own 5° limit. Consider the metric
  limit alone for T2.
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
- **T5 at 60 fps.** The route asks the camera for 60 fps on the jump, but `lib/pose/PoseService` thins pose detection
  to 30 Hz (`MIN_DETECT_GAP_MS`), so every CMJ today reads under the 50 Hz gate: flagged, landing symmetry not scored.
- **Rep segmentation** (`t1.rep*`, `t2.repRise`, `t3.rep*`) are lane defaults: a squat that dips less than ~45° of knee
  bend is not a rep; a shallow squat past that line is one, and scores low on depth.

## The register

Generated from lib/assess/thresholds.ts (THRESHOLDS_VERSION `jump-screen-0.1-provisional`, PROTOCOL_VERSION `jump-screen-1.0`), 62 entries.

| ID | What it is | Spec | Current value | Unit | Source | Signed off | Elijah sign-off |
|---|---|---|---|---|---|---|---|
| `gate.minConfidence` | Below this confidence a test is "not scored", never guessed | §3.2 | 0.6 | share 0–1 | repo TUNE(elijah): `lib/mirror/assessment.ts MIN_GRADEABLE_CONFIDENCE` | no | |
| `gate.minPoseHz` | Pose-rate gate: under it the device check says so | §3.1 | 24 | Hz | repo TUNE(elijah): `lib/pose/modelChoice.ts MIN_CAMERA_FPS` | no | |
| `gate.jumpFps` | Jump timing: under this pose rate the CMJ is flagged and contact timing is not scored | §3.1, §4 T5 | 50 | Hz | spec [TUNE-EJ] | no | |
| `gate.visibility` | Per-landmark visibility for tracking | §3.1 | 0.5 | visibility 0–1 | spec [TUNE-EJ] | no | |
| `gate.visibilityScoring` | Per-landmark visibility for a scoring frame | §3.1 | 0.65 | visibility 0–1 | spec [TUNE-EJ] | no | |
| `gate.minValidReps` | Fewer valid reps than this caps the test at 1/3 and writes no PRQ | §4 rules | 3 | reps | spec [TUNE-EJ] | no | |
| `gate.absenceRestartMs` | Out of frame this long restarts the test | §8 | 6000 | ms | repo TUNE(elijah): `lib/mirror/screenRunner.ts ABANDON_MS` | no | |
| `calib.frontMs` | Standing still facing the camera | §3.3 | 3000 | ms | spec [TUNE-EJ] | no | |
| `calib.sideMs` | Standing still side-on | §3.3 | 2000 | ms | spec [TUNE-EJ] | no | |
| `calib.maxSway` | Lane default: hip sway allowed during a calibration hold | §3.3 | 0.02 | body-height fraction | spec [TUNE-EJ] | no | |
| `geom.heelRise` | Heel lifts above its calibrated floor line by more than this | §3.2 | 0.015 | body-height fraction | spec [TUNE-EJ] | no | |
| `geom.lensHfovDeg` | Lane default: lens width the FPPA parallax correction assumes (a knee moving toward the lens) | §3.2 | 60 | deg | spec [TUNE-EJ] | no | |
| `geom.heelRiseRepo` | Reference only (not read by the scorer): the guided squat's heel line; ≈ geom.heelRise at 80% frame fill | §4 T1 | 0.012 | image-height units | repo TUNE(elijah): `lib/babylon/nexus/neuro-mirror/rules/squat-audit.ts heelRiseWarnPx` | no | |
| `t1.repEnter` | Lane default: a squat rep starts past this hip drop | §4 rules | 0.1 | hip drop / standing hip height | spec [TUNE-EJ] | no | |
| `t1.repExit` | Lane default: …and ends back under this | §4 rules | 0.05 | hip drop / standing hip height | spec [TUNE-EJ] | no | |
| `t1.repMinPeak` | Lane default: a dip shallower than this (~45° of knee bend) is not a rep; a shallow squat past it IS one, and scores low on depth | §4 rules | 0.15 | hip drop / standing hip height | spec [TUNE-EJ] | no | |
| `t2.repRise` | Lane default: a knee-to-wall rock is a tibia swing of at least this | §4 T2 | 6 | deg | spec [TUNE-EJ] | no | |
| `t3.repEnter` | Lane default: a single-leg squat rep starts past this | §4 T3 | 20 | deg knee flexion | spec [TUNE-EJ] | no | |
| `t3.repExit` | Lane default: …and ends back under this | §4 T3 | 12 | deg knee flexion | spec [TUNE-EJ] | no | |
| `t3.repMinPeak` | Lane default: shallower than this is not a rep | §4 T3 | 30 | deg knee flexion | spec [TUNE-EJ] | no | |
| `t1.depthKneeFlex` | Depth: knee flexion at the bottom (side) | §4 T1 | good 110 · poor 70 · fault < 80 | deg | spec [TUNE-EJ] | no | |
| `t1.hipCrease` | Hip crease vs knee line at the bottom (side); counts for 0–3 only, weight 0 | §4 T1 | good 0 · poor 0.15 · fault > 0 | thigh-length fraction above the knee | repo TUNE(elijah): `squat-audit.ts depth01 knee line` | no | |
| `t1.trunkTibia` | Trunk angle minus tibia angle at the bottom (side) | §4 T1 | good 10 · poor 35 · fault > 25 | deg | spec [TUNE-EJ] | no | |
| `t1.shoulderFlex` | Arms stay overhead: shoulder flexion (side) | §4 T1 | good 170 · poor 140 · fault < 150 | deg | spec [TUNE-EJ] | no | |
| `t1.heelRiseReps` | Reps where a heel rose (side); any rep is a fault | §4 T1 | good 0 · poor 1 · fault >= 1 | reps | repo TUNE(elijah): `squat-audit.ts heelRise` | no | |
| `t1.valgus` | Knee-inside ratio at the bottom (front), each knee | §4 T1 | good 0.15 · poor 0.7 · fault >= 0.35 | hip half-widths | repo TUNE(elijah): `squat-audit.ts valgusWarn 0.35 / valgusFault 0.70` | no | |
| `t1.lateralShift` | Lateral weight shift from the standing line (front) | §4 T1 | good 0.1 · poor 0.4 · fault >= 0.3 | hip widths | repo TUNE(elijah): `squat-audit.ts lateralWarn 0.3` | no | |
| `t1.weights` | T1 metric weights (valgus 20 split 10 per knee) | §4 T1 | depthKneeFlex 25 · trunkTibia 15 · shoulderFlex 15 · heelRise 15 · valgusLeft 10 · valgusRight 10 · lateralShift 10 | weight | spec [TUNE-EJ] | no | |
| `t2.tibia` | Tibia angle from vertical at max knee-forward, heel down | §4 T2 | good 42 · poor 30 · fault < 35 | deg | spec [TUNE-EJ] | no | |
| `t2.lrDiff` | Left–right tibia difference: asymmetry flag at the fault line | §4 T2 | good 3 · poor 8 · fault >= 5 | deg | spec [TUNE-EJ] | no | |
| `t3.fppa` | FPPA (valgus) at the deepest point, minus standing baseline | §4 T3 | good 5 · poor 20 · fault > 10 | deg | spec [TUNE-EJ] | no | |
| `t3.pelvicDrop` | Contralateral pelvic drop, minus standing baseline | §4 T3 | good 3 · poor 12 · fault > 8 | deg | spec [TUNE-EJ] | no | |
| `t3.trunkLean` | Lateral trunk lean at the deepest point | §4 T3 | good 5 · poor 20 · fault > 12 | deg | spec [TUNE-EJ] | no | |
| `t3.depth` | Depth reached (knee flexion) | §4 T3 | good 60 · poor 30 · fault < 45 | deg | spec [TUNE-EJ] | no | |
| `t3.balanceReps` | Reps with a touch-down or hop; any caps the test at 1/3 | §4 T3 | good 0 · poor 2 · fault >= 1 | reps | spec [TUNE-EJ] | no | |
| `t3.weights` | T3 metric weights | §4 T3 | fppa 40 · pelvicDrop 25 · trunkLean 20 · depth 15 | weight | spec [TUNE-EJ] | no | |
| `t3.reps` | Reps asked for, each side | §4 T3 | 5 | reps | spec [TUNE-EJ] | no | |
| `t5.contactLine` | A foot below this height is on the floor (flight ends at the first foot down) | §3.2 | 0.02 | body-height fraction | spec [TUNE-EJ] | no | |
| `t5.airLine` | Both feet above this = airborne (hysteresis over the contact line) | §3.2 | 0.035 | body-height fraction | repo TUNE(elijah): `lib/irl/dunkTracker.ts AIRBORNE_RISE 0.03 image units, restated per body height` | no | |
| `t5.flightMinMs` | A shorter flight is a hop, not a jump | §4 T5 | 180 | ms | repo TUNE(elijah): `lib/irl/dunkTracker.ts MIN_FLIGHT_MS` | no | |
| `t5.flightMaxMs` | A longer flight is refused (the camera lost the feet) | §4 T5 | 1200 | ms | repo TUNE(elijah): `lib/irl/dunkTracker.ts MAX_FLIGHT_MS` | no | |
| `t5.maxHeightCm` | Heights over this are refused | §4 T5 | 130 | cm | repo TUNE(elijah): `lib/irl/dunkTracker.ts MAX_VERTICAL_CM` | no | |
| `t5.nominalHeightM` | Lane default: the body height a flight's sanity check assumes when there are no world landmarks (a flight's feet must rise half what its air time needs) | §4 T5 | 1.6 | m nose to floor | spec [TUNE-EJ] | no | |
| `t5.landingWindowMs` | Landing metrics read the peak within this long of touchdown | §4 T5 | 300 | ms | spec [TUNE-EJ] | no | |
| `t5.landingFlex` | Landing knee-flexion proxy: stiff landing at the fault line | §4 T5 | good 0.25 · poor 0.1 · fault <= 0.1 | hip drop / standing hip height | spec [TUNE-EJ] | no | |
| `t5.landingValgus` | Landing FPPA at peak flexion, minus standing baseline (T3 bands) | §4 T5 | good 5 · poor 20 · fault > 10 | deg | spec [TUNE-EJ] | no | |
| `t5.landingSymMs` | Left/right touchdown gap (1 frame / 3 frames at 60 fps); only scored at ≥ 50 fps | §4 T5 | good 17 · poor 50 · fault >= 50 | ms | spec [TUNE-EJ] | no | |
| `t5.cvPct` | Height variation across the three jumps: flagged, not scored | §4 T5 | good 5 · poor 12 · fault >= 12 | % | spec [TUNE-EJ] | no | |
| `t5.weights` | Lane default: CMJ quality weights (the spec gives none) | §4 T5 | landingFlex 40 · landingValgusLeft 20 · landingValgusRight 20 · landingSym 20 | weight | spec [TUNE-EJ] | no | |
| `t5.armSwingWrist` | Lane default: a wrist above the shoulder line in flight means the hands left the hips; the jump is not the standard | §4 T5 (Q3) | 0 | image-height units above the shoulder line | spec [TUNE-EJ] | no | |
| `score.meanWorst` | Test score = 0.7·weighted mean + 0.3·worst metric | §4 rules | mean 0.7 · worst 0.3 | weight | repo TUNE(elijah): `lib/mirror/assessment.ts assessSquat` | no | |
| `score.bands03` | 0–3: 3 ≥ 80 with no fault; 2 at 50–79 or any fault; 1 under 50 | §4 rules | three 80 · two 50 | score | spec [TUNE-EJ] | no | |
| `score.asymmetryPoints` | Asymmetry flag when \|L − R\| test scores differ by this | §4 rules | 15 | points | spec [TUNE-EJ] | no | |
| `mqs.flagPenalty` | MQS loses this per asymmetry flag | §5.1 | 5 | points | spec [TUNE-EJ] | no | |
| `mqs.maxFlags` | At most this many flags count | §5.1 | 3 | flags | spec [TUNE-EJ] | no | |
| `mqs.minTests` | Fewer scored tests: no MQS | §5.1 | 3 | tests | spec [TUNE-EJ] | no | |
| `grade.bands` | ELITE / PRIMED / READY / RECOVERING | §5.1 | elite 80 · primed 60 · ready 40 | score | repo TUNE(elijah): `lib/prq.ts prqGrade, lib/mirror/assessment.ts gradeOf` | no | |
| `prq.verticalJump` | Power axis: CMJ height 12 in → 0, 40 in → 100 | §5.2 | floor 12 · ceiling 40 | in | repo TUNE(elijah): `lib/profile/scanToSnapshot.ts verticalJump` | no | |
| `prq.ankleDorsiflexionDeg` | Flexibility input: tibia angle 30° → 0, 45° → 100 | §4 T2, §5.2 | floor 30 · ceiling 45 | deg | spec [TUNE-EJ] | no | |
| `prq.flexWeights` | Flexibility = 0.625·T2 axis + 0.375·T1 mobility | §5.2 (renormalized, no T4) | t2 0.625 · t1Mobility 0.375 | weight | spec [TUNE-EJ] | no | |
| `cue.minGapMs` | Lane default: at most one spoken cue per this long | §8 | 2500 | ms | spec [TUNE-EJ] | no | |
| `ui.miniResultMs` | Per-test mini-result on screen | §8 | 3000 | ms | spec [TUNE-EJ] | no | |
(node:6894) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
