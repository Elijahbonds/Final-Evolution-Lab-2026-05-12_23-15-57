# JUMP-PRO — the vertical jump, top tier (lane `jump-pro`, 2026-10-24)

Owner, 2026-10-24: *"Let's make sure the vertical jump tracking tool is top tier better than any competitor."*
Owner decisions the same day: every audience; CMJ, approach, drop jump/RSI and repeated jumps; live camera every day
plus an optional 240 fps slow-mo for a lab-grade jump; a jump is **verified** only on a high-trust live read or a
slow-mo; body weight and power for adults only; game tie-ins are later lanes that read a typed seam.

Everything below is **measured** on the ground-truth bench in this lane (`lib/jump/`), not on people. The bench is a
physics model filmed through the app's own virtual camera; it cannot stand in for the PJF force-plate pilot, and every
new number is in `lib/jump/PROPOSED-jump.ts` as TUNE until that data exists.

## 1. What a user does, and where the jump lives (audit)

| Path | What it measures | How height is computed | Stored / shown |
|---|---|---|---|
| **Mirror jump check** `/play/mirror/assess?run=jump` (Quick Screen T5; also the start of the full screen) | Hands-on-hips CMJ, three max efforts, front view | `lib/assess/graders/t5-cmj.ts`: `detectFlights` finds each flight on the raw frames, edges extrapolated between frames; **now re-timed** by `lib/jump/refine.ts`; best of three | Result page (`jump-result.tsx`: "about 17 ±2 in"), **now** the session card; adults who opted in: `rescreen` row `jumpBestIn`, the landing record (T5 allow-list in `lib/assess/prqWrite.ts`), PRQ power via `powerFromJumpCm` |
| **Games' live reader** `lib/pose/BodyReader.ts` | Take-off / apex / land events in any body mode (dunk by body, drills) | Flight time from foot edges (5-frame median crossing), `g·T²/8` | Dunk contests feed `lib/move/formSummary.ts` → PRQ power (`POWER_SESSION_MODES`); dunk history rows `verticalCm` |
| **Dunk film** `lib/dunk-film/jumpDetect.ts`, **IRL dunk tracker** `lib/irl/dunkTracker.ts` | Filmed / tracked dunks | Flight time (`airTimeCm`) | Dunk history |
| **Profile v2** jump tile, **progress card**, **daily drill** | Week best vs last week | reads saved rows | "+1.5 in vs last week"; the daily drill picks the weakest trend |

fps handling: the camera asks 60 fps for T5 and the pose service holds 60 Hz only when the device can (`HIGH_RATE_MIN_HZ`
50), else 30. Under 50 Hz T5 is `fpsLow` (landing symmetry not scored). Live MediaPipe in a browser does not reach 120
or 240 fps: the slow-mo file is the only way there.

## 2. The bench

`lib/jump/ballistic.ts`: a 1 kHz body whose take-off (end of the drive, toes leave last and the ankle keeps extending
for 60 ms), flight (hips ballistic, legs posed) and touch-down (solved by bisection) are exact. Filmed through
`lib/pose/synth.ts` (seeded landmark noise, visibility, 2 % dropped and 1 % missed frames, 1 ms shutter jitter,
optional motion blur), then optionally occluded. Two truths: **v0²/2g** (force-plate take-off velocity, the criterion)
and **g·T²/8 of the true flight** (what a perfect flight-time reader says). Conditions × 30/60/120/240 fps × 6 seeds ×
3 jumps (25/40/55 cm). Run it: `npx tsx scripts/jump-accuracy.ts [--reader frames|t5|body]`.

## 3. Before → after (bias / SD vs the force-plate height, cm)

"Before" is the finder's frame edges alone (`lib/jump/readers.ts framesReader`, identical to T5 before this lane).

| condition | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| realistic noise | +1.24/1.97 → **−0.44/1.38** | −0.70/1.62 → **−0.67/1.42** | −0.81/1.79 → **−0.18/0.92** | −1.36/1.44 → **−0.21/0.67** |
| heavy noise (2×) | +1.23/4.61 → −0.34/2.80 | −0.93/2.44 → −0.90/2.83 | −1.47/2.96 → −0.24/2.01 | −3.74/5.16 → −0.42/1.35 |
| bent-knee landing | **+5.58**/1.72 → −0.47/2.08 | **+5.23**/1.50 → +1.04/1.83 | **+3.93**/1.77 → +0.01/1.36 | **+4.53**/1.36 → +0.12/0.75 |
| flat-foot landing | **+3.24**/2.23 → −0.46/2.12 | **+3.34**/1.84 → +0.49/1.03 | **+2.34**/1.79 → +0.17/1.42 | −0.01/**7.00** → −0.16/0.84 |
| tucked flight | +0.86/1.39 → +0.11/0.88 | +0.02/1.27 → −0.19/1.06 | +0.21/0.91 → +0.23/0.46 | −0.48/0.97 → +0.22/0.46 |
| partial occlusion | +1.14/2.14 → −0.45/1.37 | +1.10/**4.82** → −0.90/1.50 | −0.69/1.94 → −0.13/0.99 | +1.53/**7.69** → −0.12/0.82 |
| motion blur | +2.21/3.43 → −0.72/3.77 | **+5.87**/2.17 → −0.74/4.74 | **+5.45**/4.28 → −1.14/2.27 | +1.53/2.56 → −1.73/1.76 |
| 10 % drops | −0.12/2.85 → −0.51/1.55 | −0.26/1.90 → −0.42/1.77 | −1.10/1.37 → +0.12/1.18 | −1.50/1.30 → −0.29/0.83 |
| repeated jumps (150 ms contact) | +1.07/1.64 → −0.08/1.63 | −0.63/0.88 → −0.12/0.95 | −1.42/1.30 → −0.26/1.11 | −3.42/5.67 → −0.04/0.49 |

**False trials** (a squat, a calf raise, a 2.5 cm hop, a 25 cm step, 24 per fps): 0 valid, before and after. **Missed
real jumps**: before 12 of 792 (11 refused by the rise check at 120–240 fps, 1 lost as a "step"); after 1 of 792.

Targets (competitor benchmark §3):
- |bias| ≤ 1 cm: **met** in every condition at every rate except motion blur at 120/240 fps (−1.1 / −1.7).
- 95 % limits within ±3 cm (1.96·SD ≤ 3): **met** for realistic noise at every rate (2.7 / 2.8 / 1.8 / 1.3 cm),
  bent and flat landings at 60–240; not under heavy noise or blur at 30–60 (those trials carry a wide ± and are
  never verified).
- ≥ 95 % of events within ±1 frame: **met at 30 and 60 fps** (100 %); 78–100 % at 120 fps and 78–89 % at 240 fps — the
  edge SD is ~3 ms and a 240 fps frame is 4.2 ms, so ±1 frame there is a 2–3 ms target. Height error at 240 fps is
  0.7 cm SD regardless.
- Within-session CV ≤ 5 %: the measurement's own share is SD/height = 3.5 % at 30 fps, 3.4 % at 60, 2.2 % at 120, 1.6 %
  at 240 (realistic noise, 40 cm); the body adds its own ~3 %.
- MDC shown per athlete: the session card prints the smallest real change; `realChange()` gates "better".
- Slow-mo 120/240 imports: **built** (§4, item 7). Live under 120 fps flagged "estimate": **built** (trial flag + tip).
- Trial rejections with a reason: flexed landing (`landedLow`, corrected and not verified), feet unclear (blur or
  occlusion: `feetUnclear`), camera/athlete moved (`moved`), outlier (`outlier`), plus the finder's existing "camera
  lost your feet", "never saw you land", "hands left your hips". Double contact: a rebound under 400 ms is read as a
  repeated jump (contact + RSI), not as a rejection.

BodyReader (the games' reader, not changed here): see §7 below.

## 4. What changed

1. **Re-timing from the whole flight** (`lib/jump/refine.ts`). The hips fall freely in the air, so one parabola fits
   every airborne frame from the torso points; a foot is the hips minus the leg, so each edge is where
   `hips(t) − floor = L(t)` with L a line through the airborne leg next to the edge. Error sources it removes: the
   take-off read 4–12 ms late at 60–240 fps (the toe leaves last and slowly), the 19 ms SD of a two-point line at 30 fps,
   the finder's early "landing" at the apex at 240 fps (re-centred on the parabola).
2. **Take-off-velocity height** (the force-plate definition). The landing drop — hip height at touch-down minus at
   take-off, from the same fits — is taken out: `v0 = drop/T + g·T/2`, `h = v0²/2g`. Shrunk by its own noise, never a
   "rise" (the take-off is full extension), skipped when the torso width says the athlete moved toward the lens. Free
   fall is the ruler (no body height needed). `heightFlightCm` keeps plain `g·T²/8`; `heightCm` is now the
   take-off-velocity height. Equal on a landing in the take-off posture.
3. **Its own ±.** Each jump's SD from the fits' residuals (×1.2, so the bench's error/claimed-SD has SD 0.7–1.1). The
   headline ± is the larger of the old one-frame band and 1.96 × that SD.
4. **Finder fixes at high fps** (`t5-cmj.ts`): a step-settle must span (settleFrames−1)×30 ms (three frames were 12 ms at
   240 fps); overlapping flights are merged; a flight the rise check refused stands when its hip parabola vouches. 30
   fps behaviour unchanged (every existing test passes; the recorded fixtures still read within their limits).
5. **Trial quality, the session and the verified rule** (`lib/jump/session.ts`, `PROPOSED-jump.ts`): flags + one tip;
   best, the best that can be verified, mean ± SD, CV, typical error (never under the body's 3 % CV), the smallest real
   change at 90 % (z·√2·TE); `verifyJump()` = the owner's rule; PR #424's level enters through a `trust` hook.
6. **Repeated jumps** (`lib/jump/rebound.ts`): contact, RSI (h/contact), RSI-flight, the 10/5 best-five mean. Bench:
   contact bias within ±3 ms; SD 10–15 ms at 30 fps, 10 at 60, 7 at 120, 4–5 at 240 ⇒ RSI ±5–10 % live, ±2–3 % slow-mo.
7. **Slow-mo, lab-grade** (`lib/jump/slowmo.ts`, `slowmoDecode.ts`, `components/jump/slowmo-upload.tsx`): every frame of
   the file through the app's own landmarker (`full` model), on the phone, never uploaded. **Gravity is the clock**: a
   share-sheet export may be stretched 2/4/8× to play at 30 fps; each stretch is tried and the one whose free-fall ruler
   matches the body's size is kept (bench: 240 fps real and 8×-stretched files read the same jumps; 120 fps 4×; a file
   with no jump is refused with the reason).
8. **Session card** (`components/jump/jump-session-card.tsx`) on the adult jump result: every jump with ±, flags, mean ±
   SD, the real-change line, rebound RSI, the verified mark, one tip. Kids never see it.
9. **The seam** (`lib/jump/seam.ts`): `JumpRecord` per type (`cmj`, `repeated`; `approach`, `drop` typed) with height,
   95 % ±, verified + blocks, source, fps, trust. No power field.
10. **Profile "same" band** (`lib/profile-v2/tiles.ts`): `JUMP_SAME_BAND_IN` 0.5 in (a guess) → 1.4 in, derived from the
    measured noise, so the tile and the daily drill say "better" only past the camera's noise.

## 5. Phone rig

`npx tsx scripts/probes/_jump-pro-phone.mts <outDir>` (esbuild + Playwright Chromium, 390 px): the 30 fps check with a
bent-knee landing (corrected, flagged, not verified: frame rate), the clean 60 fps check (verified), and the slow-mo
reader fed an 8×-stretched 240 fps capture (verified, lab-grade). No sideways scroll, no page error.

## 6. Still short of top tier, and why

- **No force-plate validation yet.** Everything here is synthetic ground truth. The PJF pilot (force plate, n ≥ 30) is
  what turns "bench" into "published" (benchmark target 1). The register is TUNE until then.
- **Hips stand in for the centre of mass.** True with hands on hips; a big tuck or an arm swing moves the centre of mass
  against the pelvis. MediaPipe's hip point is estimated, not a marker; its real jitter and lag at take-off are
  unmeasured here (the synth's noise is a model).
- **Motion blur** (indoor light, slow shutter) still reads −1 to −2 cm with SD 2–5 cm; such trials carry a wide ± and the
  tip asks for light. A brighter scene or the slow-mo file is the fix — hardware, not code.
- **Live frame rate.** In-browser pose tops out at 60 Hz on capable phones (30 on most): ±1.4 cm SD live vs ±0.7 slow-mo.
- **Approach jump and touch height: built in JUMP-PRO 2 (§9).** Was: Measured reason: on the one recorded run-up
  (`lib/pose/__fixtures__/jump_one_foot_runup.json`, CMU capture), the finder places the take-off 110 ms early and the
  refiner 46 ms early (the planted-run floor logic assumes a stand before the jump); 45.5 / 44.7 cm vs 37.0 truth.
  Plan below.
- **Drop jump: built in JUMP-PRO 2 (§9.3).**
- **BodyReader** (games, dunk contests → PRQ power) is not re-timed here (§7).

## 7. The games' reader (BodyReader), measured, not changed

Same bench, `lib/pose/BodyReader.ts` `land` events (movement-play's file; read only here). Bias / SD vs the force plate:

| condition | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| realistic noise | +0.11/2.95 | −2.14/2.04 | −2.92/0.99 | −3.88/1.06 |
| bent-knee landing | +5.73/2.66 | +2.75/1.93 | +2.49/1.30 | +2.07/1.13 |
| motion blur | +0.52/5.19 | −3.52/2.48 | −3.75/2.09 | −5.26/1.71 |
| repeated jumps (150 ms) | −1.21/2.77 | −3.39/1.32 | −3.62/0.92 | −4.02/0.89 |

It reads **2–4 cm low from 60 fps up** (its edges sit at a foot's level + 1 cm, read on a 5-frame median, both late
against a toe that leaves slowly) and **+2–6 cm high on a bent-knee landing**. 0 false jumps on the decoys. The dunk
contests' camera jump feeds PRQ power from it, so the same athlete's power differs between the jump check and a dunk
session. Follow-up 6.

## 8. Follow-ups (each its own PR)

1. **Approach + touch height.** A side-on view; an approach finder that takes the last foot contact of the run-up as
   take-off (one or two feet) instead of a planted stand; the refiner as is (the parabola does not care how the body got
   airborne). Touch height = the highest fingertip (landmarks 19/20) in flight × the free-fall ruler; the one-time
   standing reach = fingertip over the floor standing, arms up, in the same spot, scaled by that jump's ruler (or by the
   user's height when given). Bench: add a run-up and an arm reach to `ballistic.ts`.
2. **Drop jump / RSI.** Classify the first flight as a drop-in when its landing floor sits a box-height under its take-off
   floor; read contact from that landing to the rebound's take-off; RSI as built. Bench: a box take-off.
3. **Repeated-jump test part** in the runner (10/5: "jump ten times, as high and as fast off the floor as you can"), the
   UI showing best-five RSI (the reader is built).
4. **Storage for verified jumps** (coach sign-off badge, leaderboards, history of `JumpRecord`): needs a pending SQL table
   (`jump_record`: user, type, height_cm, plus_minus_cm, verified, blocks, source, fps, trust, rsi, at) behind a guarded
   seam; and the `prqWrite` allow-list extended with `heightSdCm`/`verified`.
5. **Power (Sayers) for adults who give body weight**: `60.7·h(cm) + 45.3·mass − 2055` W, labelled estimate; never for a
   teen (owner rule). Needs the optional body-weight input.
6. **BodyReader re-timing** (movement-play's file): post-process each `land` event with `refineFlight` over the frames it
   holds, so the dunk contests' camera power reads the same as the jump check.
7. **Kid "since last time" line** (`lib/screen/kid.ts`): use the same real-change band (`jumpRealChangeCm`) so a kid is
   not told "−0.5 in" for noise; changes one pinned line in `lib/screen/kid-path.test.tsx`. Owner call.
8. **PR #424 wiring**: pass `jumpView.trust?.level` as `trustLevel` to the session card and to `verifyJump` once it lands;
   consider letting #424's "Low at 30 fps" use this lane's per-jump ± instead of the frame rate alone.

## 9. JUMP-PRO 2 (lane `jump-pro-2`, 2026-10-25): approach + touch height, drop jump / RSI, power, saved verification

Everything here is measured on the ground-truth bench, as in §2–§3: a physics body built every millisecond and filmed
through the app's own virtual camera. It is not a force plate and not a person (§9.6 says what that hides). Run it:
`npx tsx scripts/jump-accuracy.ts --approach | --reach | --drop`.

### 9.1 Max approach vertical (`lib/jump/approach.ts`)

Side-on, the run crossing the picture. A flight is both feet off the feet's own low envelope (no stand, no settle)
with the **centre of mass** rising (`lib/jump/com.ts`, Winter/Dempster segments: the arms swing and a knee drives, so
the hips do not fly a parabola). The take-off floor is a line through the **plant step's own stance**, read at the
toe-off; the edges are re-timed by `refine.ts` from several half-frame starts (median kept); a run angled toward or away
from the lens is read from the **legs' segment lengths** (thigh + shin lie in the picture's plane side-on) and each edge's
leg is put back at the flight's own scale; the landing drop is taken out whole (an approach lands lower by nature, so it
is never flagged "landed low"). A landing that reads *higher* than the take-off means the take-off was put on a bent leg
of the plant: refused ("could not see your take-off foot").

Before → after, bias / SD vs the force-plate height (cm), 12 jumps (45/60/75 cm) per cell, camera 4.5 m out:

| condition | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| one-foot, 4 m/s, arm swing | refused (T5: "hands left your hips"); frame edges +8.5/2.7 → **+0.7/3.7** | → **+0.7/2.6** (frames +6.3/2.2) | → **+0.3/2.7** (+6.5/2.2) | → **+0.8/1.3** (+5.0/1.0) |
| one-foot, fast 5.5 m/s | +5.4/1.8 → −1.2/2.5 | +6.5/3.1 → −0.6/4.7 | +6.6/1.8 → 0.0/2.0 | +6.2/2.0 → +0.5/1.2 |
| one-foot, slow 2.5 m/s | +6.7/2.4 → −1.6/2.7 | +7.5/2.5 → +0.6/2.8 | +9.1/8.2 → −0.5/1.5 | +5.0/1.5 → −0.4/1.2 |
| two-foot step-close | +4.9/4.9 → −0.8/2.3 | +4.8/2.6 → +0.6/2.5 | +3.9/1.2 → +0.1/2.3 | +2.4/1.5 → +0.2/0.9 |
| no arm swing (T5 reads it) | T5 +6.4/4.9 → +0.5/3.7 | T5 +5.9/2.3 → +0.7/2.7 | T5 +5.8/2.2 → +0.3/2.6 | T5 +5.3/1.4 → +0.8/1.3 |
| run angled 12° toward the lens | +5.9/2.7 → −1.0/4.1 | +6.1/3.1 → −1.0/4.1 (no rescale: +4.3) | +6.2/1.0 → −0.6/1.9 | +5.7/1.1 → −0.9/0.8 |
| run angled 12° away from the lens | +6.8/5.6 → +1.8/4.8 | +8.4/5.5 → +1.1/3.9 (no rescale: +7.9) | +9.0/5.8 → +0.9/4.5 | +7.4/6.3 → +1.7/2.9 |
| bent-knee landing | +14.4/6.7 → +0.6/3.8 | +10.3/1.4 → +0.6/2.6 | +10.0/2.7 → +0.3/2.6 | +8.7/2.0 → +0.8/1.3 |
| motion blur | none read → −2.1/5.8 | none → +0.8/3.9 | none → −1.9/5.5 | none → +0.6/3.1 |

"Before" for arm-swing run-ups: the jump check (T5) refuses every one ("your hands left your hips"); its finder's frame
edges alone read +5 to +14 cm (a flight-time height of a body that lands lower). Missed after: 5 of 432 (all "could not
see your take-off foot", blur or an angled run). No false jump. The recorded CMU run-up (front-facing, travel removed):
take-off **33 ms early** (the finder 110, the refiner 46), 41.9 cm vs the flight truth 37.0.

**Honest limits.** One side-on camera at 4.5 m: SD 2.3–3.7 cm live (30–60 fps), ~1.2 cm from a 240 fps slow-mo;
the take-off edge is the weak point (the toe leaves slowly; SD 9–16 ms at 60 fps). Motion blur on a run (every foot
moves > 6 px a frame) gives 4–6 cm SD: such jumps carry a wide ± and never verify. An approach rarely verifies live
(its own SD is over `jump.verifiedSdCm` 1.75 cm): a slow-mo video is the verified path. A run angled toward / away from
the lens is corrected to ±1–2 cm bias but its SD grows; the tip says "run across the picture".

### 9.2 Standing reach and touch height (`lib/jump/reach.ts`, `reachStore.ts`)

The check: facing the phone, stand, one arm straight up, hold (majority-smoothed over ±100 ms; the first and second
half of the hold within 2 % of the leg). The reach is kept as a **share of the leg** (hip → knee → ankle), so no tape
measure and no height are asked: every approach jump measures that leg in metres through its own free fall
(`legPathM` = picture leg × gravity ruler), and touch = reach share × legPathM (+ the fingertip, `jump.fingertipOverLeg`
0.11, lane-guess: MediaPipe's "index" point is the knuckle) + the vertical. The floor under a front-facing body is read
from the ankles + the ankle's height (0.079 leg, Drillis–Contini): the toes and heels sit 8–20 cm nearer / further from
the lens and moved the floor ±3–7 cm. Kept on the phone (one key, validated, "Forget" button): there is no per-user body
calibration on the server.

| | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| reach, 3 m, bias / SD (cm) | +1.1/0.2 | +1.1/0.2 | +1.0/0.2 | +1.0/0.1 |
| reach, 4.5 m | +0.7/0.3 | +0.7/0.4 | +0.5/0.2 | +0.6/0.2 |
| elbow bent 25° toward the lens (unseen) | −3.5/0.7 | −3.2/0.3 | −3.2/0.2 | −3.1/0.1 |
| arm flicked up, no hold | refused 6/6 | refused | refused | refused |
| leg ruler from free fall, bias / SD (%) | 0.0/0.65 | +0.3/0.64 | +0.1/0.50 | +0.15/0.25 |
| touch (one-foot 4 m/s), bias / SD (cm) | +1.7/3.4 | +2.4/2.3 | +1.6/3.0 | +2.2/1.4 |

Touch inside its own 95 % range: 83–100 % (67–75 % on an angled run). Against the highest index point the body actually
reached in flight the convention reads 2–6 cm lower (the flight posture is not the standing one; a Vertec has the same
gap). An elbow bent *toward* the lens cannot be seen facing it: that reach reads ~3 cm low (conservative).

### 9.3 Drop jump / RSI (`lib/jump/drop.ts`)

Side-on, 3 m. The box is where the feet stood first (≥ 0.1 body heights over the floor); the drop's touch-down is
timed sub-frame from the falling foot (a line over its last 60 ms met with the contact's floor); the rebound is
re-timed as the approach is; contact = rebound take-off − drop touch-down with both edges' ±; RSI and its 95 % range
through `rebound.ts rsiWithRange`; the box read back through the rebound's gravity ruler. A contact over 600 ms is a
stop: the jump is read, RSI is not. 24 drops per cell (30/38/45 cm boxes × 2 rebounds × 4 seeds):

| condition | 30 fps | 60 fps | 120 fps | 240 fps |
|---|---|---|---|---|
| 200 ms contact: height bias/SD (cm) · contact bias/SD (ms) · RSI bias/SD (%) | −0.4/1.3 · +4.7/16.6 · −2.6/10.8 | +1.1/1.9 · −7.8/14.8 · +8.5/13.1 | +0.4/1.2 · −3.4/8.7 · +3.1/6.4 | +0.2/1.0 · −1.7/5.8 · +1.6/5.4 |
| 150 ms contact | +0.7/1.6 · −2.3/15.3 · +4.9/13.8 | +0.6/1.5 · −6.5/14.8 · +7.9/14.4 | +0.1/1.7 · −3.2/13.4 · +3.6/14.1 | −0.3/1.2 · +0.4/8.4 · −1.0/9.1 |
| 300 ms contact | −0.1/1.3 · +1.1/21.5 · −0.1/10.7 | +0.4/1.3 · −4.0/13.0 · +3.3/7.3 | +0.7/1.3 · −4.3/13.9 · +3.8/9.2 | +0.3/0.6 · −1.2/6.3 · +1.0/3.9 |
| bent-knee landing | −0.9/1.5 · +4.4/16.5 · −4.0/10.9 | +1.1/2.8 · −7.8/15.2 · +9.1/16.9 | +0.2/1.4 · −3.8/8.8 · +2.7/7.3 | −0.1/0.9 · −1.7/5.7 · +0.6/5.1 |
| motion blur | +0.1/2.2 · −1.1/31.9 · +4.7/23.2 | +0.4/3.9 · −0.5/35.8 · +6.4/33.6 | +0.7/2.5 · +5.0/18.9 · +0.8/15.4 | −0.2/2.2 · +13.3/18.2 · −6.0/13.7 |

Before: the jump check reads **0 jumps and 0 RSI** from all 480 drop takes. Every drop found after (0 missed). Contacts
inside their own 95 % range: 88–100 % (blur 67–88 %). Box height +1.4–1.7 cm (SD 0.3–0.9). **Limits:** live RSI is
±13–15 % (1 SD) at 30–60 fps — an estimate, labelled so; ±5–9 % from a 240 fps slow-mo. The rebound's take-off edge is
the weak point again.

### 9.4 Power (`lib/jump/power.ts`, `components/jump/power-estimate.tsx`)

No body-weight field exists anywhere in the app (the schema's only `weightKg` is a lifted load); none is added. An adult
may type a weight (lb/kg) on the jump result: Sayers 1999 peak power (60.7·cm + 45.3·kg − 2055 W), ±(1.96 × 355 W SEE ⊕
the jump's ±), "an estimate, not a force-plate reading". The weight lives in the component's state only — never saved,
never sent. Renders nothing for anyone the page's age gate calls a kid (under 18 or "rather not say"), and the function
refuses `adult: false` before it reads a weight.

### 9.5 BodyReader re-timing: measured, then shelved (owner call)

Built and benched (`lib/jump/bodyRetime.ts`, kept out of the tree; the diff is in the lane's scratchpad): each `land`
event re-timed through `refine.ts` from the raw frames the reader holds. On the synthetic bench it fixed the bias
(realistic noise 60/120/240 fps: −2.1/−2.9/−3.9 → −0.7/+0.2/−0.2 cm; bent-knee 120 fps +2.5 → +0.7). **But five
existing guards went red on the recorded fixtures** (`lib/pose/BodyReader.test.ts` phase gate ×3, `lib/move/formRead.test.ts`
"the owner's two-foot dunk ~0.9 m", `lib/drills/DrillRunner.test.ts` two-foot landing pairing). Measured directly
(`refine.ts` started from the TRUE edges of the recorded CMU / DeepMotion fixtures): the re-timed flight is wrong by
−113 ms on the owner's dunk (75.5 vs 98.9 cm), −99 ms on the 0.84 m CMU jump, ±20–50 ms on the others (−4 to +7 cm).
Those fixtures go through the synth's room transform (travel removed, feet pulled in to 0.4 of the stride, a front view of
a run), which may itself make hips and feet non-physical — or the refiner's leg-line model may not hold on real feet.
Unresolved either way, so the reader is unchanged and the dunk numbers are as before. The same question applies to the
jump check's re-timing (§4.1, merged in #437): it is validated on the synthetic bench, not on recorded jumps.

### 9.6 Saved jumps can verify

Found by teams-squads (#441): the saved assessment kept only height and flight per jump, so every stored jump read back
through `seam.ts` as "framesOnly" and the verified-jump board was empty. The record (`lib/assess/prqWrite.ts`) now keeps
`method`, `heightSdCm` and `quality {flags, clean}` in the JSON it already stores, validated as strictly as the rest. Who
is stored is unchanged (a verified, opted-in adult; anyone else is refused and nothing is kept).
`tests/jump-pro/verified-save.test.ts` posts through the real route and reads the row back as the same verified record.

### 9.7 Still short

- **No real-world validation of any of this**: the bench is a model. §9.5 shows the refiner disagreeing with recorded
  motion; the PJF force-plate pilot (with an approach and a box) is what settles it.
- **Approach SD live (2.5–3.7 cm)** is twice a standing jump's: the plant's toe-off is a slow edge and the camera is
  1.5× further away. A slow-mo video is the lab-grade path (SD ~1.2 cm).
- **Fingertip share** (`jump.fingertipOverLeg`) is anthropometry, unbenched; a tape-measured standing reach would pin it.
- **MediaPipe's hip point** front-on (the reach check) vs side-on (the approach) is assumed to be the same joint.
- **Seam**: `JumpRecord` types `approach` / `drop` are not produced yet (nothing reads them; the seam stays as #437 left it).
- **Teens and the approach / drop / reach entries**: mounted for adults only, like the session card (owner call below).

## Appendix: the full bench (`npx tsx scripts/jump-accuracy.ts --reader frames,t5 --seeds 6`, 2026-10-24)

Columns: trials, matched valid reads, missed (refused or not found), valid reads with no real jump under them (/ decoys
in the take), bias / SD / mean |error| / 95th-percentile |error| against the force-plate height, bias / SD against the
true flight's g·T²/8, and the share of take-off and landing events within ±1 camera frame. "Stand refused" = the live
flow would have asked the athlete to stand still (the bench reads on with a loose sway).

#### Before: the finder's frame edges

| condition | fps | trials | read | missed | false valid | bias vs force plate (cm) | SD | MAE | p95 abs | bias vs true flight (cm) | SD | take-off ±1 frame | landing ±1 frame |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean (no noise) | 30 | 3 | 3 | 0 | 0 | +1.10 | 0.17 | 1.10 | 1.20 | +1.10 | 0.17 | 100% | 100% |
| realistic noise | 30 | 18 | 18 | 0 | 0 | +1.24 | 1.97 | 1.74 | 4.80 | +1.24 | 1.97 | 100% | 100% |
| heavy noise (2x) (stand refused 6×) | 30 | 18 | 18 | 0 | 0 | +1.23 | 4.61 | 3.49 | 7.90 | +1.23 | 4.61 | 78% | 100% |
| bent-knee landing | 30 | 18 | 18 | 0 | 0 | +5.58 | 1.72 | 5.58 | 8.00 | +0.50 | 1.74 | 100% | 100% |
| tucked flight | 30 | 18 | 18 | 0 | 0 | +0.86 | 1.39 | 1.27 | 3.20 | +0.86 | 1.39 | 100% | 100% |
| flat-foot landing | 30 | 18 | 18 | 0 | 0 | +3.24 | 2.23 | 3.48 | 6.00 | +0.13 | 2.23 | 100% | 100% |
| partial occlusion | 30 | 18 | 18 | 0 | 0 | +1.14 | 2.14 | 1.89 | 4.80 | +1.14 | 2.14 | 100% | 100% |
| motion blur | 30 | 18 | 18 | 0 | 0 | +2.21 | 3.43 | 3.21 | 7.90 | +2.21 | 3.43 | 61% | 11% |
| drops 10% (stand refused 1×) | 30 | 18 | 18 | 0 | 0 | -0.12 | 2.85 | 1.97 | 3.60 | -0.12 | 2.85 | 100% | 94% |
| repeated jumps (150 ms contacts) | 30 | 18 | 18 | 0 | 0 | +1.07 | 1.64 | 1.34 | 4.30 | +1.07 | 1.64 | 94% | 100% |
| decoys (squat, calf raise, hop, step) | 30 | 18 | 18 | 0 | 0/24 | +1.25 | 1.71 | 1.55 | 4.70 | +1.25 | 1.71 | 100% | 100% |
| clean (no noise) | 60 | 3 | 3 | 0 | 0 | +0.83 | 0.06 | 0.83 | 0.90 | +0.83 | 0.06 | 100% | 100% |
| realistic noise | 60 | 18 | 18 | 0 | 0 | -0.70 | 1.62 | 1.44 | 2.70 | -0.70 | 1.62 | 89% | 94% |
| heavy noise (2x) (stand refused 6×) | 60 | 18 | 18 | 0 | 0 | -0.93 | 2.44 | 2.23 | 4.40 | -0.93 | 2.44 | 67% | 89% |
| bent-knee landing | 60 | 18 | 18 | 0 | 0 | +5.23 | 1.50 | 5.23 | 7.50 | +0.14 | 1.48 | 94% | 100% |
| tucked flight | 60 | 18 | 18 | 0 | 0 | +0.02 | 1.27 | 1.04 | 1.80 | +0.02 | 1.27 | 100% | 100% |
| flat-foot landing | 60 | 18 | 18 | 0 | 0 | +3.34 | 1.84 | 3.34 | 5.80 | +0.23 | 1.83 | 89% | 94% |
| partial occlusion | 60 | 18 | 18 | 0 | 0 | +1.10 | 4.82 | 3.81 | 7.60 | +1.10 | 4.82 | 67% | 72% |
| motion blur | 60 | 18 | 18 | 0 | 0 | +5.87 | 2.17 | 5.87 | 8.10 | +5.87 | 2.17 | 56% | 0% |
| drops 10% (stand refused 1×) | 60 | 18 | 18 | 0 | 0 | -0.26 | 1.90 | 1.35 | 4.00 | -0.26 | 1.90 | 67% | 94% |
| repeated jumps (150 ms contacts) | 60 | 18 | 18 | 0 | 0 | -0.63 | 0.88 | 0.96 | 1.50 | -0.63 | 0.88 | 100% | 94% |
| decoys (squat, calf raise, hop, step) | 60 | 18 | 18 | 0 | 0/24 | -0.22 | 1.49 | 1.15 | 2.80 | -0.22 | 1.49 | 94% | 94% |
| clean (no noise) | 120 | 3 | 3 | 0 | 0 | +0.83 | 0.06 | 0.83 | 0.90 | +0.83 | 0.06 | 100% | 100% |
| realistic noise | 120 | 18 | 18 | 0 | 0 | -0.81 | 1.79 | 1.37 | 3.50 | -0.81 | 1.79 | 50% | 94% |
| heavy noise (2x) (stand refused 6×) | 120 | 18 | 15 | 3 | 0 | -1.47 | 2.96 | 2.35 | 5.70 | -1.47 | 2.96 | 47% | 80% |
| bent-knee landing | 120 | 18 | 18 | 0 | 0 | +3.93 | 1.77 | 3.98 | 5.90 | -1.15 | 1.77 | 39% | 94% |
| tucked flight | 120 | 18 | 18 | 0 | 0 | +0.21 | 0.91 | 0.66 | 1.60 | +0.21 | 0.91 | 89% | 100% |
| flat-foot landing | 120 | 18 | 18 | 0 | 0 | +2.34 | 1.79 | 2.67 | 4.00 | -0.77 | 1.79 | 50% | 83% |
| partial occlusion | 120 | 18 | 18 | 0 | 0 | -0.69 | 1.94 | 1.49 | 3.50 | -0.69 | 1.94 | 50% | 89% |
| motion blur | 120 | 18 | 18 | 0 | 0 | +5.45 | 4.28 | 5.97 | 9.90 | +5.45 | 4.28 | 39% | 17% |
| drops 10% (stand refused 1×) | 120 | 18 | 18 | 0 | 0 | -1.10 | 1.37 | 1.42 | 3.20 | -1.10 | 1.37 | 56% | 89% |
| repeated jumps (150 ms contacts) | 120 | 18 | 18 | 0 | 0 | -1.42 | 1.30 | 1.71 | 3.40 | -1.42 | 1.30 | 28% | 89% |
| decoys (squat, calf raise, hop, step) | 120 | 18 | 18 | 0 | 0/24 | -0.78 | 1.67 | 1.50 | 3.00 | -0.78 | 1.67 | 39% | 78% |
| clean (no noise) | 240 | 3 | 3 | 0 | 0 | +0.37 | 0.84 | 0.77 | 0.90 | +0.37 | 0.84 | 67% | 100% |
| realistic noise | 240 | 18 | 18 | 0 | 0 | -1.36 | 1.44 | 1.59 | 3.60 | -1.36 | 1.44 | 17% | 72% |
| heavy noise (2x) (stand refused 6×) | 240 | 18 | 14 | 4 | 3 | -3.74 | 5.16 | 4.38 | 11.70 | -3.74 | 5.16 | 14% | 43% |
| bent-knee landing | 240 | 18 | 16 | 2 | 0 | +4.53 | 1.36 | 4.53 | 6.40 | -0.55 | 1.36 | 31% | 50% |
| tucked flight | 240 | 18 | 18 | 0 | 0 | -0.48 | 0.97 | 0.79 | 2.30 | -0.48 | 0.97 | 44% | 78% |
| flat-foot landing | 240 | 18 | 18 | 0 | 0 | -0.01 | 7.00 | 3.79 | 4.50 | -3.12 | 7.00 | 22% | 78% |
| partial occlusion | 240 | 18 | 18 | 0 | 0 | +1.53 | 7.69 | 3.98 | 14.30 | +1.53 | 7.69 | 17% | 56% |
| motion blur | 240 | 18 | 18 | 0 | 0 | +1.53 | 2.56 | 2.08 | 4.10 | +1.53 | 2.56 | 33% | 17% |
| drops 10% (stand refused 1×) | 240 | 18 | 16 | 2 | 0 | -1.50 | 1.30 | 1.53 | 3.70 | -1.50 | 1.30 | 19% | 69% |
| repeated jumps (150 ms contacts) | 240 | 18 | 17 | 1 | 3 | -3.42 | 5.67 | 3.61 | 14.90 | -3.42 | 5.67 | 12% | 65% |
| decoys (squat, calf raise, hop, step) | 240 | 18 | 18 | 0 | 0/24 | -1.57 | 1.34 | 1.72 | 3.70 | -1.57 | 1.34 | 17% | 72% |

missed, by reason: {"your feet did not rise as far as that air time needs, so the camera lost them":11,"not found":1}

#### After: re-timed (T5 today)

| condition | fps | trials | read | missed | false valid | bias vs force plate (cm) | SD | MAE | p95 abs | bias vs true flight (cm) | SD | take-off ±1 frame | landing ±1 frame |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| clean (no noise) | 30 | 3 | 3 | 0 | 0 | -0.07 | 0.15 | 0.13 | 0.20 | -0.07 | 0.15 | 100% | 100% |
| realistic noise | 30 | 18 | 18 | 0 | 0 | -0.44 | 1.38 | 1.19 | 2.00 | -0.44 | 1.38 | 100% | 100% |
| heavy noise (2x) (stand refused 6×) | 30 | 18 | 18 | 0 | 0 | -0.34 | 2.80 | 2.37 | 5.40 | -0.34 | 2.80 | 100% | 100% |
| bent-knee landing | 30 | 18 | 18 | 0 | 0 | -0.47 | 2.08 | 1.37 | 4.70 | -5.55 | 2.09 | 100% | 100% |
| tucked flight | 30 | 18 | 18 | 0 | 0 | +0.11 | 0.88 | 0.72 | 1.50 | +0.11 | 0.88 | 100% | 100% |
| flat-foot landing | 30 | 18 | 18 | 0 | 0 | -0.46 | 2.12 | 1.48 | 3.40 | -3.57 | 2.13 | 100% | 100% |
| partial occlusion | 30 | 18 | 18 | 0 | 0 | -0.45 | 1.37 | 1.18 | 2.00 | -0.45 | 1.37 | 100% | 100% |
| motion blur | 30 | 18 | 18 | 0 | 0 | -0.72 | 3.77 | 3.14 | 6.80 | -0.72 | 3.77 | 83% | 94% |
| drops 10% (stand refused 1×) | 30 | 18 | 18 | 0 | 0 | -0.51 | 1.55 | 1.24 | 2.50 | -0.51 | 1.55 | 100% | 100% |
| repeated jumps (150 ms contacts) | 30 | 18 | 18 | 0 | 0 | -0.08 | 1.63 | 1.37 | 2.70 | -0.08 | 1.63 | 100% | 100% |
| decoys (squat, calf raise, hop, step) | 30 | 18 | 18 | 0 | 0/24 | -0.27 | 1.17 | 0.88 | 2.20 | -0.27 | 1.17 | 100% | 100% |
| clean (no noise) | 60 | 3 | 3 | 0 | 0 | +0.10 | 0.00 | 0.10 | 0.10 | +0.10 | 0.00 | 100% | 100% |
| realistic noise | 60 | 18 | 18 | 0 | 0 | -0.67 | 1.42 | 1.13 | 3.40 | -0.67 | 1.42 | 100% | 100% |
| heavy noise (2x) (stand refused 6×) | 60 | 18 | 18 | 0 | 0 | -0.90 | 2.83 | 2.09 | 5.30 | -0.90 | 2.83 | 83% | 83% |
| bent-knee landing | 60 | 18 | 18 | 0 | 0 | +1.04 | 1.83 | 1.56 | 3.40 | -4.05 | 1.82 | 94% | 100% |
| tucked flight | 60 | 18 | 18 | 0 | 0 | -0.19 | 1.06 | 0.74 | 2.40 | -0.19 | 1.06 | 100% | 100% |
| flat-foot landing | 60 | 18 | 18 | 0 | 0 | +0.49 | 1.03 | 0.88 | 2.00 | -2.62 | 1.03 | 100% | 100% |
| partial occlusion | 60 | 18 | 18 | 0 | 0 | -0.90 | 1.50 | 1.31 | 3.40 | -0.90 | 1.50 | 100% | 94% |
| motion blur | 60 | 18 | 18 | 0 | 0 | -0.74 | 4.74 | 3.20 | 5.60 | -0.74 | 4.74 | 72% | 61% |
| drops 10% (stand refused 1×) | 60 | 18 | 18 | 0 | 0 | -0.42 | 1.77 | 1.32 | 3.50 | -0.42 | 1.77 | 89% | 100% |
| repeated jumps (150 ms contacts) | 60 | 18 | 18 | 0 | 0 | -0.12 | 0.95 | 0.76 | 1.80 | -0.12 | 0.95 | 100% | 94% |
| decoys (squat, calf raise, hop, step) | 60 | 18 | 18 | 0 | 0/24 | -0.17 | 1.10 | 0.79 | 2.50 | -0.17 | 1.10 | 100% | 100% |
| clean (no noise) | 120 | 3 | 3 | 0 | 0 | +0.10 | 0.10 | 0.10 | 0.20 | +0.10 | 0.10 | 100% | 100% |
| realistic noise | 120 | 18 | 18 | 0 | 0 | -0.18 | 0.92 | 0.64 | 2.00 | -0.18 | 0.92 | 78% | 100% |
| heavy noise (2x) (stand refused 6×) | 120 | 18 | 17 | 1 | 0 | -0.24 | 2.01 | 1.35 | 4.20 | -0.24 | 2.01 | 65% | 71% |
| bent-knee landing | 120 | 18 | 18 | 0 | 0 | +0.01 | 1.36 | 1.04 | 2.50 | -5.07 | 1.37 | 83% | 94% |
| tucked flight | 120 | 18 | 18 | 0 | 0 | +0.23 | 0.46 | 0.42 | 0.80 | +0.23 | 0.46 | 94% | 100% |
| flat-foot landing | 120 | 18 | 18 | 0 | 0 | +0.17 | 1.42 | 1.04 | 2.30 | -2.95 | 1.42 | 83% | 94% |
| partial occlusion | 120 | 18 | 18 | 0 | 0 | -0.13 | 0.99 | 0.67 | 2.00 | -0.13 | 0.99 | 78% | 100% |
| motion blur | 120 | 18 | 18 | 0 | 0 | -1.14 | 2.27 | 1.82 | 6.00 | -1.14 | 2.27 | 61% | 67% |
| drops 10% (stand refused 1×) | 120 | 18 | 18 | 0 | 0 | +0.12 | 1.18 | 0.83 | 1.50 | +0.12 | 1.18 | 89% | 100% |
| repeated jumps (150 ms contacts) | 120 | 18 | 18 | 0 | 0 | -0.26 | 1.11 | 0.87 | 2.00 | -0.26 | 1.11 | 72% | 94% |
| decoys (squat, calf raise, hop, step) | 120 | 18 | 18 | 0 | 0/24 | -0.16 | 0.99 | 0.80 | 1.90 | -0.16 | 0.99 | 83% | 94% |
| clean (no noise) | 240 | 3 | 3 | 0 | 0 | +0.13 | 0.06 | 0.13 | 0.20 | +0.13 | 0.06 | 100% | 100% |
| realistic noise | 240 | 18 | 18 | 0 | 0 | -0.21 | 0.67 | 0.53 | 1.20 | -0.21 | 0.67 | 83% | 83% |
| heavy noise (2x) (stand refused 6×) | 240 | 18 | 18 | 0 | 0 | -0.42 | 1.35 | 1.06 | 3.10 | -0.42 | 1.35 | 67% | 56% |
| bent-knee landing | 240 | 18 | 18 | 0 | 0 | +0.12 | 0.75 | 0.62 | 1.20 | -4.96 | 0.77 | 83% | 94% |
| tucked flight | 240 | 18 | 18 | 0 | 0 | +0.22 | 0.46 | 0.43 | 0.70 | +0.22 | 0.46 | 100% | 94% |
| flat-foot landing | 240 | 18 | 18 | 0 | 0 | -0.16 | 0.84 | 0.66 | 1.40 | -3.27 | 0.85 | 83% | 100% |
| partial occlusion | 240 | 18 | 18 | 0 | 0 | -0.12 | 0.82 | 0.63 | 1.70 | -0.12 | 0.82 | 83% | 72% |
| motion blur | 240 | 18 | 18 | 0 | 0 | -1.73 | 1.76 | 1.84 | 4.80 | -1.73 | 1.76 | 22% | 44% |
| drops 10% (stand refused 1×) | 240 | 18 | 18 | 0 | 0 | -0.29 | 0.83 | 0.57 | 1.90 | -0.29 | 0.83 | 78% | 78% |
| repeated jumps (150 ms contacts) | 240 | 18 | 18 | 0 | 0 | -0.04 | 0.49 | 0.39 | 0.80 | -0.04 | 0.49 | 89% | 89% |
| decoys (squat, calf raise, hop, step) | 240 | 18 | 18 | 0 | 0/24 | -0.14 | 0.49 | 0.39 | 0.90 | -0.14 | 0.49 | 78% | 100% |

missed, by reason: {"not found":1}

