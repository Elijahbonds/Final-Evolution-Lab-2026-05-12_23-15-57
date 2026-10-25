# VBT — camera velocity-based training (lane `vbt`, 2026-10-25)

Owner decisions 2026-10-25: **camera only** (no sensor, no Bluetooth); barbell (squat, bench, deadlift, clean/power,
press), dumbbell and kettlebell, body-only (push-up, pull-up, bodyweight squat, jump squat), med-ball release speed;
for coaches and teams, solo lifters and a game tie-in; **no accuracy claim until a validation pilot** — every number is
labelled an estimate with its ±. The market and the literature are in `docs/VBT-BENCHMARK.md` (Step 0).

## 1. What the athlete does — `/train/velocity`

1. **Set up**: the kind of move and the move, the load, their height (the ruler when no plate is seen; remembered on
   the phone), an optional **warm-up readiness read** (adults), and the stop line (the coach's for this lift, else 20 %).
   The guide: side-on, ~3 m, hip height, the whole bar path in the picture.
2. **Live**: the camera through the app's pose pipeline at 60 fps where the phone holds it (`requestHighRate`, the jump
   check's ask), shown **only through `SelfView`**. Each rep's speed in big type, coloured by its velocity zone, with its
   ±; the rep count and the speed loss; the **stop cue** ("Speed down X % from your best rep: end the set here", plus a
   buzz) once the loss reaches the stop line after two counted reps. It is a cue; nothing ends by itself.
3. **Summary**: every rep (MCV ±, flags: partial, bounce), best, speed loss, where the bar was read (plate / pose),
   the fps; for an adult the **load-velocity line and e1RM ±** and **loads for the target zone**, the warm-up readiness
   band; milestones unlocked. Kept on the server for a verified adult who opted in, else on the phone; a teen's set is
   kept nowhere.
4. **Or a slow-motion video**, read on the phone through the jump check's decoder (`lib/jump/slowmoDecode.ts`
   `poseDecoder`); the athlete says what it was filmed at and the clock is put back (×1/2/4/8, the phones' stretches).

## 2. How a rep is read (`lib/vbt/**`, pure)

- **Track** (`track.ts`): the plate's centre when the plate is found in ≥ 60 % of body frames, else the hands; the
  wrist for DB/KB; the hips or shoulders for body-only; the throwing wrist for a med ball. **Ruler**: a 45 cm bumper's
  fitted diameter (plate) or the near-side shoulder→hip→knee→ankle against the entered height (Drillis–Contini share
  0.779). The plate stands nearer the lens than the body, so the plate ruler is used only for the plate's own path.
- **Plate** (`plate.ts`, plain JS): Sobel edges in a window seeded by the wrists, a gradient Hough vote for the centre,
  the radius from the radial edges' distance histogram, a Kåsa least-squares refit; rim coverage ≥ 50 % and edge
  density ≥ 0.6 per pixel of arc, else no plate. Frame to frame it seeds from the last plate. The grey copy is read
  from an offscreen canvas and dropped (`components/vbt/frame-grab.ts`).
- **Kinematics** (`signal.ts`): a local quadratic fit on the camera's REAL frame times (uneven, dropped frames allowed).
- **Reps** (`reps.ts`): candidates rise faster than 0.05 m/s and peak over 0.10; sticking points merge; bottom/top
  levels are the median of the smoothed points near each extreme; edges are read δ off the bottom/top and carried to
  zero speed (2δ/v), walking out from the fastest point so a noisy pause never stretches a rep. MCV = range ÷ time,
  PV, MPV (to the first a < −g after the peak), ROM, velocity loss vs the fastest counted rep; partials (< 70 % of the
  set's range) listed, not counted; bounce = a pause under 80 ms after a lowering.
- **Med ball** (`medball.ts`): a wrist speed peak over 2 m/s that collapses by 25 % within 120 ms (the hand stops, the
  ball flies on — the separation cue); the speed from a short line fit.
- **± (95 %)**: smoothed jitter at the edges, the edge times, the frame clock, the ruler's SD, and for a hand/joint
  standing in for the load 4 %; a med-ball release adds 10 %.

## 3. Measured on the bench (`lib/vbt/bench.ts`; synthetic, known truth — not a validity claim)

Back squat, 6 reps 0.32–0.95 m/s, 10–12 seeds, landmark jitter 0.4 % of the picture, plate jitter 0.12 %, frame-time
jitter, 2 % dropped frames (`lib/vbt/bench.test.ts`):

| | MCV bias | 95 % of reps within | band covers | missed / ghost reps |
|---|---|---|---|---|
| plate, 30 fps | −0.016 m/s | 0.042 | 85 % | 0 / 0 |
| plate, 60 fps | −0.013 | 0.043 | 96 % | 0 / 0 |
| plate, 240 fps | −0.009 | 0.020 | 93 % | 0 / 0 |
| pose (hands), 30 fps | −0.02 | 0.13 | 96 % | 0 / 0 |
| pose, 60 fps | −0.005 | 0.058 | 100 % | 0 / 0 |
| pose, 240 fps | −0.009 | 0.042 | 100 % | 0 / 0 |

Benchmark target T1 (plate, 60 fps: |bias| ≤ 0.03, 95 % within ± 0.06) and T3 (no missed or ghost reps) hold on the
bench. The plate detector finds generated plates within 1 px from a seed 15 px off, with a rack upright and legs
behind it, and refuses a frame with none. The rig (`scripts/probes/_vbt-probe.mts`, 390 px, the real tracker reading
drawn plate frames) read 6 squat reps within 0.02 m/s of the truth at the plate and 5 push-ups within ±0.07 at the
shoulders. What the bench cannot measure: a real hand is not a bar, a real body's proportions are not the table's, real
plates blur. That is the pilot.

## 4. Load-velocity line, e1RM, zones, readiness

- **Line** (`profile.ts`): each load's fastest rep, least squares, ≥ 2 loads ≥ 5 kg apart, slope negative. **e1RM** at
  the lift's MVT (squat 0.30, bench 0.17, deadlift 0.24, press 0.19 m/s; cited in the benchmark), ± from the line's
  inverse prediction and the MVT's own spread (0.035 m/s). No MVT → no e1RM (cleans, jump squats, throws).
- **Zones** (`lifts.ts`): Mann's table (absolute strength < 0.5, accelerative 0.5–0.75, strength-speed 0.75–1.0,
  speed-strength 1.0–1.3, starting strength > 1.3 m/s). **Loads for a zone** from the line, rounded inward to 2.5 kg.
- **Readiness** (`readiness.ts`): a warm-up at a load the athlete uses (± 2.5 %) — its first three reps' best and mean
  — through the readiness check's OWN steps (`baselineOf`, `measure`, `applyRule` via `readDay`) with the coaches'
  rules. No new rule engine; normal noise never reads Low. The server reads the band again from the saved history.

## 5. Coaches and teams — `/coach/velocity`

- Clients who share (live roster + live `coach_view` + verified adult + live save opt-in): recent sets as zone-coloured
  rep bars, best speed, loss vs the stop line, warm-up bands. Anyone else is a name and "not shared".
- A team the coach runs: members who are adults, can save and turned on "share measured" (the groups lane's rule).
- **Target zones** on the coach's own program slots (`VbtZoneTarget`, one per `SessionExercise`): a zone and a stop line;
  the athlete's `/train/velocity` shows "Your coach's target …" and the live cue uses the line. The slot's lift is read
  from the exercise name (`liftFromName`).

## 6. Youth, privacy, data

- Under 13 and an unknown age: refused (one line, no camera). 13–17: **technique speed only** — live speed, zones and
  the loss cue; no e1RM / line / load suggestions, no readiness read, no med ball, **nothing kept** (`TEEN_E1RM`,
  `TEEN_VBT_SAVE`: owner calls). Adults: everything; saved only through `canSaveScanNumbers` (row **1n**).
- The video never leaves the phone (`tests/vbt/no-picture.scan.test.ts`): the picture is shown only through SelfView,
  the plate's grey copy is never shown or sent, the core sends nothing, the only POST is a kept set's numbers.
- Tables (pending SQL `prisma/pending/2026-10-26-vbt.sql`, NOT applied): `VbtSet`, `VbtZoneTarget`; before they exist
  every read says "not available" (`lib/coach/pendingSchema.ts` probe) and sets stay on the phone. Both in
  `lib/data-rights/registry.ts`.

## 7. Routed, not made (shared files changed in the last 24 h — docs/LANES.md §3)

1. **Train card** — `app/train/page.tsx`, after the Readiness check card:
   ```tsx
   {
     // VBT (2026-10-25): camera bar speed (13+; a teen sees technique speed only; the page says so)
     href: '/train/velocity', icon: Gauge, accent: '#00E5FF', title: 'Bar speed',
     line: 'Rep speed from your camera: zones, speed loss, your load-velocity line. Estimates, not lab numbers.',
     tag: 'Track a set',
   },
   ```
   (+ `Gauge` in the lucide import). Until then `/train/velocity` is reached by URL and from `/coach/velocity`'s door.
2. **Coach roster door** — `app/coach/_components/clients-view.tsx`, under `<TeamsPanel />`:
   `<Link href="/coach/velocity" className="fel-card block rounded-xl p-4 text-sm text-white/80">Bar speed: clients' reps, speed loss and target zones →</Link>`.
3. **Today's ease and the coach's alert from a bar-speed Low** — `lib/coach/readiness/server.ts` `todayReadiness` reads
   `ReadinessJumpCheck` only and `ReadinessAlert.checkId` is a foreign key to it. Proposal: a nullable `vbtSetId` on
   `ReadinessAlert` (or a `source` column) and `todayReadiness` taking the newest of today's jump check and today's
   warm-up `VbtSet` with a band. Not made: the readiness lane's files and SQL.

## 8. Owner calls

- **Apply** `prisma/pending/2026-10-26-vbt.sql` (additive; steps in its header).
- **Teens**: `TEEN_E1RM` / `TEEN_VBT_SAVE` stay false until a guardian consent covers camera training numbers.
- **Draft copy**: `lib/vbt/copy.ts`, the milestone labels and challenges in `lib/vbt/milestones.ts`.
- **New numbers** (all `(new)` in `lib/vbt/thresholds.ts` and beside their code): the 20 % stop default (Pareja-Blanco
  2017), the zone table, MVTs, the segment-ruler share, jitter and model SDs, rep thresholds, the 80 ms bounce line, the
  med-ball release cue, the 2.5 % readiness load window and 4 % bar-speed CV, the plate detector's coverage/density,
  the 90-day / 28-day history windows. Plain constants like the readiness lane's (coaching/measurement rules, not game
  feel; the feel panel only reaches playtest game runs).
- **Validation pilot** (add to the jump pilot): phone side-on at 3 m and 60 fps (and a 240 fps slow-mo) against a linear
  transducer (GymAware or RepOne): squat, bench, deadlift at 45–90 % 1RM, push-ups and pull-ups against motion capture
  or a transducer on the body, med-ball throws against radar; Bland–Altman bias and 95 % LoA, ICC, missed/ghost reps,
  e1RM vs a tested 1RM. Until then: estimates only.

## 9. Game tie-in

`lib/vbt/milestones.ts`: speed rungs (first tracked set; body-only 1.0 m/s; bar in the speed-strength zone; peak bar
2.0 m/s and KB 2.0 m/s and med-ball 6 m/s for adults) open **practice** challenge cards, kept on the device as ids
only. `openChallenges()` is the seam a game reads. Fairness: nothing changes a score, a stake, a payout or a match;
no game mode was edited by this lane.

## 10. Still short

- The plate is not read on a slow-mo import (pose only): the decoder exposes no pixels; a VBT decoder that also grabs
  luma per frame is the next step.
- No ball-blob separation cue for the med ball (the wrist's stop is the cue).
- DB/KB, body-only and med-ball reads are benched on synthetic paths only (bar paths, body translations, a throw).
- The routed wiring in §7.
