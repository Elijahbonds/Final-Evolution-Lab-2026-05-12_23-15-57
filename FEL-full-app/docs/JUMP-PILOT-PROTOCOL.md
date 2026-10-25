# Jump pilot protocol: the app against force plates

Status: **draft for the owner (2026-10-25), lane `jump-tests`.** Nothing here is a result. The owner rule stands: the app
makes no accuracy claim until this study is done, published, and the public wording is approved by the owner.

The study design follows the competitor teardown (`scratchpad/round7/scorecard/jump.md`, "The study that would beat My
Jump Lab in public"). This page turns it into a protocol a lab can pre-register, and describes the app's side of it:
the capture mode that logs the raw timing, and the script that scores it.

## 1. Question and pass bar

**Question.** For adults, how closely do the app's jump numbers agree with dual force plates, and how repeatable are
they across days? The numbers are jump height, take-off velocity and power. The app is tested at three settings:
live camera at 30 fps, live camera at 60 fps, and a 240 fps slow-motion video. My Jump Lab runs alongside as the
comparison app.

**Primary outcome:** countermovement-jump height, app against the plates' take-off-velocity height.

**Pass bar.** The pre-registered bar applies to the height, for each app setting separately:

| statistic | bar |
|---|---|
| mean bias (app − plate) | within ±1 cm |
| 95 % limits of agreement | both inside ±3 cm |
| ICC(2,1), app vs plate | 0.97 or higher |

Secondary outcomes have no bar unless the lab pre-registers one. They are the drop-jump and approach-jump heights,
the 10-5 RSI, take-off velocity, the power estimates, and test–retest reliability (typical error, CV and MDC95).

## 2. Who runs it

- **An independent university lab** runs the study. Pre-register it (OSF or a similar registry) before the first
  participant. Include the hypotheses, the pass bar, the analysis below and the exclusion rules.
- **FEL staff do not collect or analyse the data.** FEL supplies the app build with pilot capture switched on, the
  phones if the lab needs them, and this protocol.
- Ethics approval goes through the lab's own board. Informed consent is required. **Adults only (18 or older).** Minors
  are never in the study.

## 3. Participants

- **40 or more adults**, men and women, from recreational to college level. Aim for at least 15 of each sex.
- Exclusions: injury or pain in the last 4 weeks, and any condition the lab's screening rules out for maximal jumping.
- Participants are recorded only as **codes** (for example `P07`), never by name. The lab keeps the key that links codes
  to people. Neither the app nor FEL ever holds it.

## 4. Equipment

- **Criterion:** dual force plates sampling at **1,000 Hz or more**. Take-off velocity comes from impulse–momentum, and
  height = v0² / 2g. Movement onset is body weight − 5 SD, and take-off and landing use a 20 N threshold, as
  pre-registered by the lab.
- **The app, recording the same trials at the same time:**
  - a mid-range Android phone running the live jump check at **30 fps**;
  - an iPhone running the live jump check at **60 fps**;
  - a phone filming a **240 fps slow-motion** video, read afterwards by the app's slow-motion reader;
  - **My Jump Lab** on its own phone, used as its documentation says.
- Phone placement: hip height, about 3 m away, facing the participant for standing and drop jumps. For approach jumps,
  side-on at 4–5 m. Every phone is on a fixed tripod. Light the room brightly (no motion blur), and keep the floor in
  the frame.
- The app build has `NEXT_PUBLIC_JUMP_PILOT_CAPTURE=1` set (§6). **Production builds never set it.**

## 5. Procedure

Each participant attends two sessions, **2 to 7 days apart**, at the same time of day, with the same warm-up and the
same footwear.

1. Standard warm-up (the lab's), then two practice jumps of each kind.
2. **Countermovement jump**, hands on hips: 3 trials, 60 s rest between them.
3. **Drop jump** from a 30 cm box: 3 trials. Step off, land, and rebound at once.
4. **Approach jump**: 3 trials, the athlete's own run-up, one-foot or two-foot take-off (record which).
5. Optional, if the lab adds them as secondary outcomes: squat jump ×3, arm-swing countermovement jump ×3, single-leg
   jumps ×3 a side, and the 10-5 repeated-jump test ×1.

Every trial is numbered the same way on every device and on the plates: participant, session (1 or 2), test and trial
number. This shared key is how the files line up. Write down any trial a device missed or refused, and the reason.
Do not re-number the rest.

Exclusions decided **before unblinding**: plate trials that are not clean (a foot off the plate, a double contact, or
a landing off the plate), and trials where the participant reports pain. The app's own refusals are counted and
reported. They are not silently dropped (§7).

## 6. The app's side: pilot capture mode

**Switched off everywhere unless the build sets `NEXT_PUBLIC_JUMP_PILOT_CAPTURE=1`.** Switching it on is an owner call
for the lab's build only. Changing the value takes a rebuild.

When it is on, the adult jump result shows a **Pilot capture** panel (`components/jump/pilot-capture.tsx`). From then
on, every trial the app times on that page is logged: the live jump check, the slow-motion reader and each jump test.
The operator does the following:

1. Types the **participant code** and the **session** (letters, digits, `-` and `_` only; a name is refused).
2. Optionally types the participant's **body mass** (kg). This fills the power columns of the export and is not kept.
3. Runs the trials, then taps **Export pilot CSV** after each participant. The log lives in the page's memory only.
   Nothing is stored on the phone and nothing is sent, so leaving the page forgets the log.

The export has one row per trial (`lib/jump/pilot.ts PILOT_HEADER`):

| column | meaning |
|---|---|
| `participant`, `session`, `test`, `trial` | the shared key (test: `check` = the live jump check, `slowmo`, `sj`, `cmjHips`, `cmjArms`, `singleLeft`, `singleRight`, `rj105`) |
| `capture`, `source`, `clock` | which read on the page; `live` or `video`; `page` = `performance.now()` ms of the live camera, `file` = the video's own time divided by its slow-motion stretch |
| `fps`, `stretch` | the rate the trial was timed at, and how stretched the exported video was (1, 2, 4 or 8) |
| `method` | `refined` (re-timed from the whole flight), `frames` (the finder's frame edges) or `manual` (frames picked by hand in the review) |
| `valid`, `why` | the app's own refusal and its reason |
| `takeoff_ms`, `landing_ms`, `flight_ms` | raw timing on that clock |
| `height_tov_cm`, `height_flight_cm`, `height_sd_cm`, `flags` | take-off-velocity height, the plain g·T²/8, the trial's own ±1 SD, and its quality flags |
| `v0_mps`, `v0_sd_mps`, `push_off_cm`, `time_to_takeoff_ms`, `rsi_mod`, `contact_ms` | take-off velocity, push-off distance, time to take-off, RSI-mod, and the ground contact before a rebound |
| `load_kg`, `body_mass_kg`, `peak_power_w`, `mean_force_n`, `mean_power_w` | the power estimates (Sayers peak and Samozino mean), filled only when a mass was typed |
| `wall_clock` | the wall-clock time of take-off (live camera only), so the plates' clock can be lined up as well as the trial key |
| `app_register` | the version of the jump register the build ran (`lib/jump/PROPOSED-jump.ts`) |

**The plate file** the lab exports needs columns `participant, session, test, trial, height_cm`. It can also have
`v0_mps`, `peak_power_w` and `mean_power_w`. My Jump Lab's numbers go in a third file with the app's column names
(`height_tov_cm`, and so on) and the same key.

## 7. Analysis (pre-registered; `scripts/jump-pilot/analyze.ts`)

```
npx tsx scripts/jump-pilot/analyze.ts --app fel.csv --plate plate.csv [--group test,source,fps] [--json out.json]
npx tsx scripts/jump-pilot/analyze.ts --app myjumplab.csv --plate plate.csv
```

The maths is in `lib/jump/pilotStats.ts` and is unit-tested with known answers (`lib/jump/pilotStats.test.ts`):

- **Agreement**, per app setting (group) and per measure (height, v0, peak power, mean power). Each pair is
  d = app − plate. The script reports the bias (mean d), the SD of d, the 95 % limits of agreement (bias ± 1.96·SD) and
  ICC(2,1) (two-way random, absolute agreement, single measure).
- **Pass or fail** of the height against §1, with each failed part named (bias, LoA or ICC).
- **Test–retest**, when sessions 1 and 2 are both present. For each participant and session the best trial is kept.
  For the app and for the plates separately, the script reports the typical error (SD of the change / √2), CV %
  (typical error / grand mean), MDC95 (1.96·√2·TE), ICC(2,1) and the mean change.
- **Refusals.** The app's refused trials are counted and kept out of the pairing (they never yield a height), as are
  trials missing from either file. Report the refusal rate per setting next to the agreement: a reader that refuses its
  hard trials and then agrees well has not passed.
- The lab also checks for proportional bias, by regressing d on the pair mean. If it is present, the lab reports that
  in place of the plain limits of agreement (Bland & Altman 1999).

The script's exit code is 0 when every height group passes, 1 when any fails, and 3 when there were no height pairs.

## 8. Reporting and what the app may say afterwards

- Publish a **preprint with open data** (the codes and the CSVs) first. Then submit it for peer review.
- The public claim is written **after** that, in words the owner approves. Until then the app's copy says "estimate",
  and a guard test keeps it that way (`tests/helpers/claimFree.ts`, used by `lib/screen/flight-jump.test.tsx` and
  `tests/jump-tests/claims-ui.test.tsx`). Copy may not call a number accurate, lab-grade, validated, precise or
  "within ±N".
- If a setting fails the bar, it is reported as failed. The register's TUNE numbers are then re-tuned on this data and
  re-tested on a new sample, not on the same one.

## 9. What only the owner can do

- Fund the pilot and choose the lab.
- Approve the pre-registration.
- Switch pilot capture on for the lab's build (`NEXT_PUBLIC_JUMP_PILOT_CAPTURE=1`), and never for production.
- Approve the public wording after publication.
