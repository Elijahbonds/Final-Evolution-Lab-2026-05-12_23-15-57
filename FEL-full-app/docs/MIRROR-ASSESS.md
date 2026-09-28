# Mirror Assess: the Quick Screen (phases 1–2)

A camera-only movement screen for jump and dunk athletes at **`/play/mirror/assess`**. It runs four tests live, scores
each one 0–3 and 0–100 per side with the measured reasons behind every score, rolls them up into a Movement Quality
Score (MQS) that sits **beside** PRQ, and writes PRQ **power** and **flexibility** as camera estimates.

Source spec: `FEL-MIRROR-REALTIME-SPEC.md` ("FEL Mirror: Real-Time Movement Assessment, Spec v1"). Built by the
mirror-realtime lane from Elijah's defaults for the spec's open questions (below). **Every threshold is provisional**:
see [MIRROR-ASSESS-THRESHOLDS.md](MIRROR-ASSESS-THRESHOLDS.md), the sign-off sheet.

## What it runs

| Test | View | Reps | What is scored |
|---|---|---|---|
| T1 Overhead squat | front 3, then side 3 | 3 + 3 | knee-inside ratio each knee, weight shift (front); depth, hip crease, trunk vs shin, arms overhead, heels (side) |
| T2 Ankle dorsiflexion (knee to wall) | side, tested side to the lens | 3 a side | shin angle from vertical at the furthest-forward rock, heel down; left–right gap |
| T3 Single-leg squat | front | 5 a side | FPPA vs standing, opposite-hip drop vs standing, trunk lean, depth; touch-downs cap at 1/3 |
| T5 Countermovement jump (hands on hips) | front | 3 | height from flight time (h = g·t²/8, refused over 130 cm); landing absorb, landing FPPA, feet-apart (≥ 50 fps only) |

T4 (hip hinge), T6 (drop landing) and T7 (hop & stick) are in the protocol registry and listed on screen as
"Full screen: coming later".

## The flow (spec §8)

Intro (the consent: what runs, where the picture goes) → device check (camera, model, measured pose rate; under 24 Hz it
says so and offers the lighter model) → framing (silhouette, chips from `lib/mirror/framing.ts`) → "Any pain right now?"
→ takeoff leg (asked once, remembered on the device) → 3 s calibration → T1 front → T1 side (2 s side-on calibration
first) → T2 left, right → T3 left, right → T5 → after each test a 3 s mini-result ("Single-leg squat L 2/3 · R 3/3") and
"Any pain in that one?" → results.

During a test: 3-2-1, a big rep counter with a tick per rep (green clean, amber fault, grey not read), the side label,
a skeleton coloured by the last rep, one spoken cue at a time (captioned; voice toggle). Scoring reps are not coached:
the cues are setup, the turn, the framing fix, the countdown, the count, "slower" and "a little deeper". Out of the
shot pauses the test; 6 s out restarts it. Pain at any prompt (or the stop button) ends the screen with the referral,
and nothing is saved.

## Scoring (spec §4, §5)

- metric 0–100: linear band `poor` → `good` (the same `band()` as `lib/mirror/assessment.ts`)
- test 0–100: 0.7 × weighted mean + 0.3 × worst metric; the median over the best three valid reps
- 0–3: 3 = ≥ 80 and no fault; 2 = 50–79 or any fault; 1 = under 50, or fewer than three valid reps, or balance lost; 0 = pain
- sided tests score their worse side; an asymmetry flag at 15 points apart, or a metric's own limit (T2: 5°)
- confidence: share of frames passing the gates × the pose-rate factor; **under 0.6 the test is "not scored"**, never a number
- MQS: 0.7 × mean + 0.3 × min of the scored tests − 5 per asymmetry flag (max 3); none with fewer than three scored
  tests; labelled "Quick"; FMS-style total (e.g. 11/12)
- every reason is a template filled with measured numbers and the rep it came from; the cross-test links (heel rise +
  ankle range, knee in + pelvic drop, knee in + ankle range, landing knee + single-leg knee) connect findings; drill hints
  are `[PLACEHOLDER DRILL]`, no doses

## PRQ (spec §5.2)

- **power** = `powerFromJumpCm(best valid CMJ)` (the `verticalJump` 12→40 in map). One valid jump is enough.
- **flexibility** = 0.625 × T2 axis + 0.375 × T1 mobility (the spec's 0.5/0.3 renormalised without T4). T2 axis = the
  worse side's shin angle through the new `ankleDorsiflexionDeg` key (30° → 0, 45° → 100) in
  `lib/profile/scanToSnapshot.ts`; T1 mobility = mean of T1's depth, arms and trunk–shin scores. Needs T2 scored with
  three valid rocks a side; T1 joins when it scored.
- Written as `PrqEntry { source: 'camera', unit: 'score', sessionId: <WorkoutScan id> }`. An axis that did not score
  writes nothing (never 50). MQS is never an axis. `lib/prq.ts` and `computeTraceablePrq` are unchanged.
- The results show each touched axis before → after with its reason, and coverage ("3 of 8 axes measured").

## Privacy and saving (spec §9, §10)

- Pose runs on the device (`lib/pose/PoseService`). No frame, image, video or landmark stream is uploaded or stored.
  The worst-rep skeletons on the results page are landmarks held in page memory, drawn on a blank canvas.
- The camera picture is PAINTED into the page's own canvas from PoseService's parked `<video>`, not placed with
  `showIn`: the app's rule (`components/games/bodyPlay.scan.test.ts`) keeps `SelfView` the only self-view, and SelfView's
  module reaches the Babylon session store, which this route must not load. A source scan (`lib/assess/replay.test.ts`)
  fails if the route ever exports a frame (`toDataURL`, `toBlob`, `getImageData`, `captureStream`, `MediaRecorder`) or
  opens any channel but the one `postAssessment` call.
- The camera stops when the screen ends and when the page unmounts.
- `POST /api/mirror/assessment` takes a numbers-only record (`lib/assess/prqWrite.ts` `toRecord`), refuses anything
  media-shaped (400), anything over 32 kB (413), any unknown field (400), a pain stop (422), and — failing closed — an
  athlete who may be a minor without an accepted guardian consent (412; `needsGuardianConsent`, an unknown birth year
  counts as a minor). It writes `WorkoutScan kind 'mirror_assessment'` (§9 shape: versions, device, per-test results,
  MQS, PRQ writes with entry ids, PRQ before/after, `program: null`) and the camera PrqEntry rows. Idempotent per
  `assessmentId`. `GET` returns the latest assessment and the traceable PRQ. Guests see their scores; nothing is saved.

## Owner defaults used (lane brief)

| Q | Default |
|---|---|
| Q1 MQS vs PRQ | MQS beside PRQ as a safety check, stored in the row; never a PRQ axis; PRQ formula unchanged |
| Q2 battery | T1–T7 is the protocol; Quick = T1, T2, T3, T5; T4/T6/T7 `notBuilt` |
| Q3 CMJ | hands on hips; a jump whose wrists pass the shoulders is not counted; arm-swing variant not built |
| Q4/Q5 | no RSI, no readiness writes, PRQ recovery never written |
| Q6 scoring | the spec's rules as written, all [TUNE-EJ] |
| Q7 drills | "Fix:" hints are `[PLACEHOLDER DRILL]` with `placeholder: true`, no doses |
| Q8 minors | saved only when signed in, and only with a known adult birth year or an accepted guardian consent (fails closed) |
| Q9 existing tabs | kept and untouched; Assess is a new route |
| Q11 takeoff leg | asked once in the flow, remembered on the device, labels the sided results and ranks findings |

## What was measured (synthetic and recorded fixtures)

- Geometry: every §3.2 measure within ±2° of the 3-D joints on the synthetic captures (`lib/assess/geometry.test.ts`).
- `squat_knee_in_left.json` flags T1 valgus on the left only; `squat_clean.json` flags nothing; a single-leg knee-in
  flags that side on T3.
- T2 under the synth's jitter: 0.7° mean, 1.9° worst.
- T5 on synthetic hands-on-hips jumps: flight within 10 ms clean; 1.8 cm (30 fps) / 1.4 cm (60 fps) mean height error
  under jitter (spec Phase 1 targets: 5 / 3 cm). The owner's recorded rebounding take: 5.1 cm.
- Replaying the same capture twice gives an identical result object.

## Known limits

- The synthetic bodies are not people: rigid feet, a kind visibility model. The gold-standard capture (spec §12 Phase 1)
  tunes the thresholds; the replay harness (`lib/assess/replay.ts`) and the register are ready for it.
- PoseService thins detection to 30 Hz, so the 60 fps request on T5 does not raise the pose rate yet; every CMJ is
  flagged under 50 Hz and landing symmetry is not scored. Needs an opt-in in `lib/pose/PoseService` (not this lane's file).
- `SharedProfile.prq` snapshots are not refreshed by this route (and `snapshotFrom` excludes camera estimates by the
  owner's rule), so the protocol gate does not see the new numbers. Follow-up for Elijah.
- No entry link from the Mirror or the menus yet (`lib/game-data.ts` / `lib/mode-menu.ts` belong to another lane).

## Files

`lib/assess/`: `thresholds.ts` (the register), `protocol.ts` (T1–T7), `geometry.ts`, `calibration.ts`, `reps.ts`,
`scoring.ts`, `graders/t1-overhead-squat.ts`, `t2-dorsiflexion.ts`, `t3-single-leg-squat.ts`, `t5-cmj.ts`, `why.ts`,
`prqWrite.ts`, `runner.ts` (the live flow + `gradeSession`), `replay.ts` (synthetic captures + replay), a test beside each,
and `assessment-route.test.ts` (the API run for real). `app/play/mirror/assess/` (page + `_components`),
`app/api/mirror/assessment/route.ts`.

Run the lane's tests: `npx vitest run lib/assess lib/profile/scanToSnapshot.test.ts`.

## QA without a camera

On a development server, or a local production build opened with `?agent=1`, the page installs `window.__FEL_ASSESS__`
(the same gate as `window.__FEL_POSE_FEED__`): `view()` reads the runner's step, part and rep count, and
`frames(part)` loads the synthetic captures (`lib/assess/replay.ts`, fetched only when asked) for
`'standFront' | 'standLeft' | 'standRight' | 'T1-front' | … | 'T5'`. A probe plays them with
`__FEL_POSE_FEED__.begin()` + `play(frames)`, taps the prompts, and runs the whole screen in a real browser.
