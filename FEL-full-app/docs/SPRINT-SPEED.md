# Sprint speed by camera (SPRINT-SPEED, 2026-10-25)

Owner decision, 2026-10-25: measure sprint speed **by camera** — replace hand timing where it can, and read top speed and
splits. Camera only. **No accuracy claim until a validation pilot** (the jump rule): every number is labelled an
estimate and carries its own ± band. The benchmark of public tools is `docs/SPRINT-BENCHMARK.md`.

Route: **`/train/speed`** (a Train card). Verified adults only (§9). Code: `lib/sprint/**`, `components/sprint/**`,
`app/train/speed/page.tsx`. Tests: `tests/sprint-speed/**` (synthetic sprinters, `tests/helpers/sprintSynth.ts`). Bench:
`npx tsx scripts/sprint-accuracy.ts`. Rig: `scripts/probes/_sprint-speed-probe.mts`.

## 1. The four tests

| Test | Phone | What it reads | Status |
|---|---|---|---|
| **Sprint** (gate) | ON the finish line's extension, 3–5 m from the lane, aimed across it | start → the torso (or hips / chest) crossing the tapped line | built |
| **Flying 10 / 20** | far back (≥ 12 m for 10 m), square to the lane, both lines in view | line 1 → line 2, and the speed between | built |
| **Speed trace** | far back, side-on (≥ 20 m to see 30 m) | the hips across the picture → speed curve, top speed, Samozino v_max, τ, F0, Pmax; splits from the model | built |
| **5-10-5** | ≈ 9 m back, square to the three cones | first movement → the two line touches (foot) → back through the middle | **beta** (§5) |

## 2. The line (gate-line timing)

- **Calibration.** Two taps on the picture make the line (`lib/sprint/geometry.ts`); or "use the centre line" when the
  phone is aimed square. Lengths are in picture heights (x × aspect, y), so the maths is the same in portrait and
  landscape. The picture is `SelfView` (not mirrored), the overlay inside it, so a tap lands where it looks.
- **Why the phone sits on the line.** Only then is the line's vertical plane one line on screen: a body crossing it in
  the picture is crossing it in the world, at any distance from the lens (photo-finish geometry).
- **Crossing** (`lib/sprint/crossing.ts`): each frame's body point is a signed distance from the line at the frame's
  real capture time (`PoseFrame.t`, requestVideoFrameCallback's captureTime). The sign change is found on the distance
  averaged over ±25 ms (so at 240 fps a point jittering more than it moves per frame is one crossing), held on both
  sides (≥ 2 frames and ≥ 40 ms), then timed by a least-squares fit to the RAW samples within ±max(2 frames, 60 ms): a
  straight line, or a parabola with 6+ frames (the body speeding up or slowing), whose root is the crossing. The ± is
  the fit's own SD at the root.
- **Start** (`lib/sprint/start.ts`):
  - **(a) the phone's Go** — "On your marks" (beep), "Set" (two beeps), a random 1.5–2.5 s hold, "Go" (long beep, the
    screen flashes). The Go's time comes from the audio clock (`getOutputTimestamp`, else `outputLatency`), plus the
    sound's travel to the athlete (distance ÷ 343 m/s: **0.107 s over 40 yd**). The time **includes the athlete's
    reaction**, and every result says so.
  - **(b) first movement** in frame — the body point's stillness is measured; the first frame that leaves it for good
    is found; then the next 150 ms are fitted as a body starting from rest (√displacement straight in t) and the start
    is that line's zero (earlier than the threshold frame by however long the body took to move that far).
  - **(c) two phones** — §6.

## 3. Flying sprint

Two lines in one wide frame, each tapped on a pole **on the running line** (bottom and top). Their planes miss the lens,
so running off the marker line moves each crossing: the stretch is off by `span × offset ÷ camera distance`. The ±
includes that for a 0.3 m offset (register `sprint.laneOffsetM`) at the phone distance typed (or, untyped, the span).

## 4. Speed trace and the Samozino profile

The hips are tracked across the picture and turned into metres along the run by **two marker taps a known distance
apart** (± from where a tap lands), or by the **athlete's height** (the leg, thigh + shank, is 0.491 of stature,
Drillis–Contini; ± 3 % for the person-to-person ratio — markers are better). Speed is a local straight-line slope over
±60 ms. The model `x(t) = x0 + v_max((t − t0) + τ e^(−(t−t0)/τ) − τ)` is fitted (x linear in v_max and x0; τ and t0 by
nested golden-section search); **t0 is always fitted**, never held — a held Go or a held first-movement read biased
v_max by −3 % on the rig. ± by a seeded residual bootstrap, plus the scale's ±. F-V as Samozino 2016: F_H = m·a +
½ρA_fC_d v², F0 and V0 from the straight line, Pmax = F0·V0/4; per kg without a body mass (no air), N and W with one.
The F-V slope is shown with its warning (the least repeatable number, JSSM 2021). The body mass is never kept.

## 5. The 5-10-5 (beta)

Three cones tapped (left, middle, right; the outer two are 10 yd apart). Start: first movement (or the Go). Each turn
is where the hips dwell at their furthest point; it counts as a **touch** only when the turning foot (ankle, heel or
toe within 0.3 s) gets within 0.15 m of the line or past it. A missed line is said ("about 32 cm short") and gets **no
time**. Finish: the torso back through the middle line, sub-frame. On the synthetic runs it times within its ± and
caught every 30 cm short turn (§10). **It stays beta** and combine day keeps hand timing as the default for it: the
open risk is a turning foot hidden behind the other leg on a real field, which synthetic runs cannot show.

## 6. Two phones (built as a core; the transport is an adapter)

`lib/sprint/sync.ts`: an NTP handshake — ping t0, their arrival t1 and reply t2, back at t3; offset =
((t1−t0)+(t2−t3))/2, error ≤ the round trip ÷ 2; the shortest of several pings wins. `measureOffset` / `answerPings`
run over a `SyncLink` (send JSON, hear JSON), and `startFromPhone` puts the start phone's Go or first movement on the
finish phone's clock with the bound in its ±. **No UI offers two phones**: the app's only peer channel is the controller
link's WebRTC DataChannel (`lib/controller-link`), which carries gameplay input between a host and phones joined through
a mode's control schema. Wiring a timing pair needs a schema row, a host/phone role pair and its signalling — files
another lane holds. That is the next step (owner call), and the core is ready for it.

## 7. Storage: numbers only, on the phone (owner call)

Every run is kept **on this phone** (`lib/sprint/store.ts`, `localStorage` `fel.sprint.runs.v1`, at most 200): times,
splits, speeds, the F-V numbers per kg, how each was read. No picture, no pose, no body mass, no account id. CSV export
through the shared `lib/csv` (JUMP-TESTS, #455, merged during this lane: formula cells defused, numbers kept as numbers). Nothing is sent (a source scan in
`tests/sprint-speed/store-adapter.test.ts` and the rig's `fetch` trap hold it).

**Why not the server** (evidence, for the owner): the movement-save path is the AB-04 gate — verified 18+ **and** the
opt-in whose sentence is pinned as *"Save my jump numbers to my account. Numbers only, never video."*
(`lib/privacy/scanSaveConsent.ts`, "Do not paraphrase it"). A sprint time is not a jump number, and that sentence is
consent copy this lane may not change. The ready alternative, no new table: `POST /api/train/sprint` writing
`WorkoutScan` kind `'sprint'` (numbers only, idempotent on a run id) behind `canSaveScanNumbers`, row `1n` of
`SCAN_SAVE_ROUTES`, `'sprint'` added to `SAVED_NUMBER_KINDS` so withdrawing consent erases it — once the consent
sentence covers sprint numbers.

## 8. Combine day: camera or hand, per station (`cameraSprint`)

Combine day (PR #453) **merged into `lane/finish-release` while this lane ran**, so it is wired (the final merge commit
of this lane picked it up):

- **Setup** (`components/combine/combine-setup.tsx`): a sprint station (any straight distance) or the 5-10-5 has a
  "Timed by: hand / camera · switch" button. The pick is `StationConfig.timing = 'camera'`, kept by `parseStation` only
  where `timingChoices(kind, variant)` offers the camera (the 3-cone and the shuffle stay hand), stored with the combine
  and read back. The station is named "Sprint · 40 yd (camera)"; a hand station keeps "(hand-timed)".
- **Run** (`components/combine/combine-run.tsx`): at a camera station, an athlete whose `access.camera` is true (a
  verified adult) gets `<CameraSprintTimer>` (`components/sprint/camera-sprint-timer.tsx`: the finish-line run or the
  5-10-5 through the same runner as `/train/speed`, then "Record 5.04 s ± 0.01 (camera)"), with a "Use the stopwatch for
  this one" fallback; everyone else gets the `HandTimer`. The attempt keeps `method: 'camera'` (`Attempt.method`,
  `recordAttempts` only for a camera-open athlete, `cleanSlots` keeps it) and its slot says "camera".
- **Report and CSV**: the best of a camera station says "camera" or "hand-timed"; the CSV gets a "<station> timed by"
  column (camera / hand-timed / camera + hand) for a camera station only (hand stations' headers are unchanged); the
  footer says **camera and hand times are not directly comparable** (hand reads ≈ 0.2 s fast over 40 yd) — mixing them
  in one ranking is an owner call.
- **Save** (`lib/combine/server.ts`): a camera-timed attempt is a camera number. `CAMERA_TIMES_SAVED`
  (`lib/sprint/cameraSprint.ts`) is **off**: such a station is returned in `keptOnDevice` and stays on the coach's phone,
  for the consent reason in §7. On, it would be kept exactly as combine's camera stations are (a verified adult with the
  live opt-in, row 1m; `method` column `'camera'`), and read back only while that still holds.

## 9. Who may use it

The page mounts the app only for a **verified adult** (`verifiedAdult(dobYear)` from the database, as the readiness
check). Everyone else reads one line and no camera is asked for — as the Quick Screen's camera (18+) and combine day's
camera stations. **Owner call:** teens (it needs the camera opened to minors first).

## 10. Numbers (synthetic bench, `scripts/sprint-accuracy.ts`)

SYNTHETIC: a stick figure through a pinhole camera, seeded landmark noise (σ 0.0015–0.002 of the picture width), 0.3 ms
timestamp jitter, 4 % dropped frames. It bounds the maths, not a phone. "Inside" = truth within the read's ±2 SD.

| Read | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| Line crossing core (1.5 heights/s, σ 0.004): mean / p95 error, inside | 1.07 / 2.81 ms, 94 % | 1.10 / 2.71 ms, 92 % | 0.85 / 2.08 ms, 94 % | 0.63 / 1.44 ms, 95 % |
| 40 yd finish, phone 4 m from lane | 0.28 / 0.68 ms, 100 % | 0.32 / 0.88 ms, 85 % | 0.17 / 0.35 ms, 95 % | 0.12 / 0.30 ms, 100 % |
| First-movement start | 13.4 / 27.7 ms, 93 % | 7.4 / 21.5 ms, 98 % | 6.0 / 13.0 ms, 95 % | 4.2 / 11.9 ms, 93 % |
| Flying 10 m, poles on the line, 15 m away | 0.80 / 1.45 ms, 100 % | 0.96 / 2.63 ms, 100 % | 0.75 / 1.88 ms, 100 % | 0.53 / 1.24 ms, 100 % |
| Trace, 25 m away: v_max / τ mean error, v_max inside | 0.14 % / 0.59 %, 100 % | 0.07 % / 0.32 %, 100 % | 0.07 % / 0.31 %, 100 % | — |
| 5-10-5: mean / p95, inside, 30 cm short turn caught | 13.3 / 26.8 ms, 95 %, 100 % | 9.7 / 21.2 ms, 100 %, 100 % | — | — |

Rig (390 px, esbuild + Playwright, synthetic feed; shots in the lane's scratchpad): 40 yd on the Go 5.21 s ± 0.01
(truth 5.210), flying 10 1.06 s ± 0.04 (truth 1.059), trace v_max 9.2 m/s ± 0.1 (truth 9.2), 5-10-5 4.49 s ± 0.03
(truth 4.492); four runs in the history, a five-line CSV, no sideways scroll, no page error, nothing fetched.

What the bench cannot show and the **validation pilot** must (owner call: phone vs timing gates, and a radar for the
trace): motion blur and rolling shutter at sprint speed, pose dropouts at the line, real `captureTime` jitter, a phone
that delivers 30 fps when 60 was asked, and the Go's real output delay.

## 11. The register

Every threshold is in `lib/sprint/PROPOSED-sprint.ts`, TUNE and unsigned, each with its source (bench, benchmark,
literature or lane guess). None is a gameplay feel number, so none is a feel-panel knob. **Assumption:** at a phone Go
for the 5-10-5, the athlete stands 9 m from the phone (the setup says ≈ 9 m); the gate uses its own distance, and the
trace fits its own start, so its Go only cues the athlete.
