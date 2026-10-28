# TOOLS-EASY: every training and measuring tool, audited and fixed (lane `tools-easy`, 2026-10-28)

Owner, 2026-10-28: *"Gameplay needs to be really clean. All tools need to be accessible, easy to use."* He confirmed it
covers the training and measuring tools. His standing rules: it plays by itself with no extra taps, it is never
confusing, it uses plain words (`docs/CUE-STYLE.md`) and the dark premium look, and it uses the camera only. This lane
applies the pattern of VERTICAL-EASY (#480) and SCREEN-EASY (#485) to the other tools: one obvious door, the shared
self-guiding setup card, auto-detect, a reason and a fix for every refusal, the P3 result card (#484) and one name for
each thing.

"Before" is this lane's base: `e4c72630` (screen-easy) for the benches, and `3ed66a72` (`lane/finish-release` with #484
and #485 merged) for the screens. Both are built from git objects, never a worktree. "After" is this lane.

**What was measured, and how.**
- **Taps and doors:** read from the code. Taps are counted from the signed-in home (`/` → `/play`); the Train tab counts
  as one tap. The browser's camera permission is counted apart (first time only).
- **Screens and words before the camera, and the premium rule:** `scripts/probes/_tools-easy-{entry.tsx,phone.mts}`
  renders the real components at 390 px in headless Chromium, on the pose service's own feed, with the API answered in
  the page. The page's title and lede are drawn above each tool, as its `TabPage` shows them.
- **The live takes:** `lib/tools-easy/sim.ts` + `scripts/tools-easy-bench.ts` play the readiness check's and the combine
  jump station's live take end to end. A synthetic athlete stands, reacts to the take, jumps and stands still. Every
  frame is JUMP-PRO's physics bench filmed through the app's virtual camera (`lib/jump/ballistic.ts`), so each jump's
  force-plate truth is known. 4 seeds × 8 conditions × 30 and 60 fps.
- **Bar speed:** the VBT bench (`lib/vbt/bench.ts`) through the live reader (`lib/vbt/live.ts`).
- **The Mirror's Movement Screen:** the station list (`lib/mirror/screen.ts`), with SCREEN-EASY's turn times
  (`lib/screen-easy/sim.ts` `MOVE_S`: a quarter turn 2 s, a half turn 2.5 s).

**assumption:** on the take bench, the athlete starts the first dip 1.5 s after the take turns to "jump". The base shows
it only as a caption ("Jump 1 of 3"); this lane also says "Jump!". The same 1.5 s is used before and after.

---

## 1. Each tool, before

### 1.1 Bar speed (VBT) — `/train/velocity`

| | Before |
|---|---|
| Door | Train → Measure → **Bar speed** (13+; a teen gets technique speed only) |
| Taps from Home to the camera | **3** (Train, Bar speed, Start the set) + typing: a **load is required** for every loaded lift (Start is disabled until one is typed) and the height the first time |
| Before the camera (rig) | 1 screen, **187 words**, 21 controls, 3 inputs, 7 font sizes, 9 button looks: the move tabs, the lift chips, load, height, the warm-up box, the stop line, a 4-line set-up list, the privacy line, the slow-mo panel |
| Setup demands | Side-on, about 3 m, hip height, the whole bar path in view; a plate in view, or your height as the ruler. **No picture.** |
| Live setup | One small status line ("Step into the picture, side-on.") in a card at the top; no picture, no big word, no voice |
| Per rep | 0 taps: reps auto-detected; the speed in 56 px, coloured by zone |
| End | A tap: "End the set". The stop line (20 % slower) is a pink box and a 250 ms buzz — **not said** |
| Refusals | "Enter your height (or show the plate)" can appear mid-set, where it cannot be done; "No reps were read" after the set |
| Camera → first number (bench, 60 fps) | **2.5 s** (42 ms after the first rep ends) |
| Result | The P3 card (#484) |

### 1.2 Sprint speed — `/train/speed`

| | Before |
|---|---|
| Door | Train → Measure → **Sprint speed** (verified adults) |
| Taps from Home to the run | **6**: Train, Sprint speed, Start the camera, tap the finish line twice (or "Use the centre line": 5), "Start: On your marks…" |
| Before the camera (rig) | 1 screen, **204 words**, 20 controls, 7 font sizes, 6 button looks: 4 test chips, a diagram, **4 set-up steps of 18–27 words**, 7 distances, 2 start modes, 3 body points |
| Plain words | The speed-trace step says "a Samozino profile (v_max, τ, F0, Pmax)": four of CUE-STYLE's banned words |
| After the camera starts | **214 words**: the set-up and settings stay above the camera picture; the tap prompt is 14 px |
| Auto-detect | The crossing and the end of the run are auto-detected (`SprintSession.over()`) |
| Refusals | 16 reasons; **6 have no fix** ("The Go has not sounded yet.", "The turns were not on opposite sides.", "Too little of the run was seen…", "The run did not fit a sprint from a start…", "That crossing came too soon…", "The two crossings were too close together…") |
| Camera → first number | The run itself (≈ 5–8 s for 40 yd) + the read; the set-up taps are the cost |
| Result | The P3 card (#484) |

### 1.3 The jump tests — squat jump, arm swing, hands on hips, single leg, 10-5 bounce, drop jump, strength and speed profile

| | Before |
|---|---|
| Door | **None.** They live under an adult's "Measure my vertical" result, inside **More detail**, behind a "More jump tests" button |
| Taps from Home to the first test | **8** + a whole vertical run: Measure my vertical, age, pain, (camera, 3 jumps, the pain check), More detail, More jump tests, pick a test, Film it |
| Before the camera (rig, the closed button) | 24 words |
| Setup | Each test's own 3–5 steps (`lib/jump/protocols.ts`), filmed with the phone's camera app or picked from its videos, read on the phone |
| Refusals | Every refused jump has its reason beside it (`invalidWhy`) |
| Result | The P3 card (#484) |

### 1.4 Daily readiness check — `/train/readiness`

| | Before |
|---|---|
| Door | Train → Measure → **Readiness check** (verified adults) |
| Taps from Home to the camera | **3** (+1 optional "How do you feel?") |
| Before the camera (rig) | 1 screen, **79 words**, 7 controls, 6 font sizes |
| Live setup | A caption only: "Hold still, hands on hips…" then "Jump 1 of 3", 18 px across the room. **No picture, no big word, no framing fix, no voice, no countdown.** |
| The stand's refusal | calibrateFront's own line, **"Hold still for a moment, arms by your sides."**, while the caption says hands on hips |
| A refused jump | **Counts toward the three, silently.** The dot turns green (rig: an arm-swing jump shows "Jump 2 of 3") |
| Camera → number (bench, realistic, 30 / 60 fps) | **13.3 / 13.2 s** |
| Heavy noise (2×) | **0 of 8 runs** ever read the stand (the sway gate reads landmark jitter as sway — the problem VERTICAL-EASY fixed in the Quick Screen's runner, not here) |
| First jump with an arm swing | 8 of 8 read, from **2 jumps** (the refused one used a slot) |
| First two with an arm swing | **0 of 8**: after the take, "Only 1 jump counted (one did not: your hands left your hips). Do the check again" — **the whole check is thrown away** |
| Result | The P3 card (#484) |

### 1.5 The Mirror — live coach, Jump tab, Movement Screen — `/play/mirror`

| | Before |
|---|---|
| Door | Train → Measure → **The Mirror** ("Squat coach and movement screen") |
| Taps from Home | Train, The Mirror, **the health intake** (a consent screen and 8 skippable questions the first time; one tap after), the tab (it opens on **Press / Row**, not the squat), **Start session**: **4 + the intake** |
| Live coach | Framing, one voice (CUE-REWRITE's `holdFor`), auto rep count, review card. In scope of CUE-STYLE already; not changed here beyond the names |
| **Jump tab** | **A different reader** (`DunkTracker`: flight time, no stand, no countdown, cm only). Its own "best jump · estimated" in cm — a third vertical number that can disagree with "Measure my vertical" (arm swing) and the jump check (hands on hips) |
| **Movement Screen** | 6 held stations, **104 s of holds**: heels from **behind**, front stack, breath, head **side-on**, one leg L/R (front). The athlete starts facing the camera, so it is **4 turns** (2 half turns and 2 quarter turns, ≈ 9 s) — SCREEN-EASY counted 3 after the first |

### 1.6 Form review — "Film a set for your coach" — `/coach/form-review?slot=…`

| | Before |
|---|---|
| Door | A coached athlete's Today → a session exercise → the small **"Film a set"** link (≈ 5 taps); plat-p06's session player is reworking that path |
| Before the camera (rig) | 1 screen, **54 words** |
| Live setup | **No framing check, no picture, no big word, no voice.** The rep count appears once recording starts |
| End | A tap: "Stop — I'm done" |
| Refusals | None live. A set filmed out of frame is found only after Stop ("unread" reps) |
| Result | Flags in three parts (CUE-REWRITE); not on the P3 card |

### 1.7 Combine day — the jump station (coach-run) — `/coach/combine`

| | Before |
|---|---|
| Door | Train → Program → **Combine day** (coaches only), the station, the athlete, "Start the camera: 3 jumps" |
| Live setup | The readiness check's take and caption ("Maya: hold still, hands on hips…", "Jump 1 of 3"); no picture, no word, no voice |
| A refused jump | A silent **No mark** (a coach's call, by design) — but no reason, so the coach cannot tell the athlete what to fix |
| Heavy noise (2×) | 0 of 8 ever read the stand |
| Camera → number (bench, realistic) | 13.3 / 13.2 s at 30 / 60 fps |
| Result | The P3 card (#484, the athlete's own combines) |

### 1.8 Done in #480 and #485 (for the consistency table)

"Measure my vertical" (3 taps, ≈ 40 s first tap → number) and "Screen my movement" (3 taps, ≈ 2.6 min).

---

## 2. One table across the tools (before)

| Tool | Name on Train | Name on its page | Start button | Stop button | One door | Setup card | Refusal: reason + fix | Voice | Result card |
|---|---|---|---|---|---|---|---|---|---|
| Vertical | Measure my vertical | Your vertical | (auto) | (auto) | ✓ | ✓ | ✓ | ✓ | its own (#480) |
| Movement screen | Screen my movement | Quick Screen | (auto) | (auto) | ✓ | ✓ | ✓ | ✓ | its own (#485) |
| **Jump tests** | — | Jump tests | Film it | — | **✗ (8 taps + a run)** | steps list | ✓ (per jump) | — | P3 |
| **Readiness** | Readiness check | Readiness check / "Daily readiness · 30 seconds" | Start **the jump check** | Stop and read what I did | ✓ | **✗** | **✗ live; a whole redo after** | **✗** | P3 |
| **Bar speed** | Bar speed | Bar speed | Start the set | End the set | ✓ | **✗ (a list)** | partly | **✗** (a buzz) | P3 |
| **Sprint** | Sprint speed | Sprint speed | Start the camera, then Start: On your marks… | Stop and read the run | ✓ | a diagram + 4 long steps | 10 of 16 | the Go only | P3 |
| **Mirror coach** | The Mirror | Press / Row (first tab) | Start session | End session | ✓ (+ intake) | its own framing | ✓ | ✓ | its own review |
| **Mirror Jump tab** | — | Vertical Jump | Start session | End session | a 2nd door to a 3rd number | ✗ | partly | ✓ | cm only |
| **Form review** | — (Today) | Film a set for your coach | Start the camera | Stop — I'm done | small link | **✗** | **✗ live** | **✗** | three-part flags |
| **Combine jump** | Combine day | — | Start the camera: 3 jumps | Stop and read the jumps | ✓ (coach) | **✗** | **✗** (a silent no-mark) | **✗** | P3 |

Five start labels and five stop labels for the same two acts; the readiness check's button calls it "the jump check",
which is the name of a different tool since #480 ("Jump check, hands on hips").

---

## 3. The top 15, ranked

1. **The jump tests have no door.** Eight taps and a whole vertical run before the first test, behind "More detail" and
   "More jump tests". Squat jump, single leg, the 10-5 bounce, the drop jump and the strength and speed profile are all
   in there.
2. **The readiness check throws a day away for one wrong jump.** A refused jump counts toward the three without a word;
   two refused jumps end in "Do the check again" after the take (0 of 8 bench runs with two arm-swing jumps got a number).
3. **The readiness check and the combine station never start on a noisier camera** (0 of 8 bench runs at 2× noise): the
   stand's sway gate reads jitter as sway. Its refusal says "arms by your sides" while the caption says "hands on hips".
4. **Readiness and combine say nothing across the room.** No picture of where the phone goes, no big word, no framing
   fix, no voice; the only cue to jump is an 18 px caption changing.
5. **Sprint: 204 words and 20 controls before the camera,** four set-up steps of 18–27 words, and jargon (v_max, τ, F0,
   Pmax, Samozino). After the camera starts, all of it stays on screen above the picture (214 words).
6. **Bar speed: 187 words, 21 controls and 3 inputs before the camera,** Start locked until a load is typed, and the set-up
   is a bullet list instead of a picture.
7. **The Mirror's Jump tab measures a vertical with a different reader** (cm only, no stand, no countdown): a third number
   that can disagree with "Measure my vertical" and the jump check.
8. **The Mirror's Movement Screen turns four times**, starting with the athlete's back to the camera. Front-on first is two
   turns.
9. **Five names for "start" and five for "stop".** The readiness button says "the jump check" (another tool's name).
10. **Form review has no framing check:** no picture, no word, no voice. A set filmed with the feet out of the shot is found
    out only after Stop.
11. **A combine no-mark has no reason,** so the coach cannot tell the athlete what to change before the next try.
12. **The Mirror opens on Press / Row** and asks the health intake first: 4 taps + the intake to the squat coach.
13. **Six sprint refusals have no fix.**
14. **Bar speed's stop line is not said** — a 250 ms buzz on a phone propped 3 m away.
15. **Two results are still off the P3 card:** form review's flags and the Mirror's reviews.

---

## 4. What changed (step 2)

1. **One Measure hub on Train** (`lib/tools-easy/door.ts` `MEASURE_TOOLS`, `app/train/page.tsx`,
   `messages/en/train.json`). In order: Measure my vertical, Screen my movement, **Jump tests (new)**, Readiness check,
   Sprint speed, Bar speed, The Mirror, then Drills and Where you stand. Each line says what it costs ("30 seconds",
   "18 and over"). The Mirror card opens on its squat coach (`?pattern=squat`), not Press / Row.
2. **The jump tests' own door**, `/train/jumps` (`app/train/jumps/page.tsx`, `components/tools-easy/jump-tests-door.tsx`).
   It opens on the list (JumpTests `startOpen`), with the drop jump and the history kept on this phone. Verified adults
   only, the sprint page's rule; anyone else reads one line and no camera is asked for. The readers are unchanged, and
   nothing is sent. They are also still under an adult's vertical result.
3. **The readiness check and the combine jump station say why** (`lib/tools-easy/liveJump.ts`). Each jump is judged as
   it lands by T5's own grader (`gradeT5`, unchanged). A refused jump says its reason and its fix, aloud and on screen.
   - Readiness — **TUNED (behaviour), flagged:** only a jump that counts fills one of the three. A refused one says
     "Your hands left your hips. Keep them there and jump again." and the check waits for the next. Before, it filled a
     slot silently, and two refused jumps meant "Do the check again".
   - Combine — attempts are unchanged: a refused jump is still a no-mark (the coach's call). It now comes with its
     reason ("No mark. Your hands left your hips…").
   - The stand uses VERTICAL-EASY's accepted sway fallback (`calib.swayFallback` 0.05, signed off 2026-10-27), from the
     second stand refused for sway. It never said "arms by your sides" again; it says "Stand still, hands on hips."
4. **The shared setup card** (`components/tools-easy/setup-card.tsx`): the vertical lane's card, look and words
   (`lib/vertical/copy.ts`), for every other camera tool. It shows a picture of where the phone goes and ONE big word —
   the fix in amber or "Ready" in green with a tick — read live from the Mirror's framing check
   (`lib/tools-easy/setup.ts`; a word must hold 0.5 s, so it does not flicker).
   - Readiness and combine: front-on, then the hands-on-hips picture and "Stand still", then "Jump!" and "2 of 3" big.
   - Bar speed: side-on, until the first rep.
   - Form review: squat, lunge and hinge, until the first rep. A push-up starts lying down, which the standing framing
     check cannot read, so it gets no card.
5. **One voice, every line heard in full** (`lib/tools-easy/voiceQueue.ts`, `components/tools-easy/use-one-voice.ts`).
   A line starts only when the one before has ended (its end event, or twice its length if the event is lost). At most
   two lines wait. When the take ends, the line being said finishes and nothing after it is said. The voice is new on
   readiness, combine, bar speed (the setup word and the stop line — before, a 250 ms buzz) and form review.
6. **Sprint** — no reader change:
   - Every set-up step is in plain words, 24 words or fewer. The "Samozino profile (v_max, τ, F0, Pmax)" is gone from the
     athlete's words; the profile is still under Details.
   - The settings sit behind one line that says what is set ("Settings: 40 yd · the phone says Go").
   - Once the camera is on, the test, the set-up and the settings fold into one closed line and the history hides.
   - The tap prompt is big and amber.
   - The six refusals with no fix get one (`lib/tools-easy/sprintFix.ts`, the reader's words kept).
7. **Bar speed** — no reader change:
   - Start no longer waits for a weight. The speed needs none, and a set with no weight was already allowed
     (`lib/vbt/sets.ts`).
   - The weight is labelled optional; it only adds the set to the max estimate.
   - The set-up is a side-on picture and one line; the other tips and the slow-mo reader are one tap away.
8. **The Mirror** (no other lane holds its files now):
   - The **Jump tab no longer measures.** Its one action is "Measure my vertical", and the dunk progress stays. This was
     VERTICAL-EASY's owner call 5.
   - The **Movement Screen walks front-on first** (`lib/mirror/screen.ts` `screenRunFor`, `ScreenRunner`
     `order: 'frontFirst'`, which the Mirror passes): front, then side-on, then from behind. That is 2 turns instead of
     4. This was SCREEN-EASY's owner call 5.
   - The protocol order stays the default. Everything that stores, claims or scores a screen reads it, and every hold,
     check and grader is unchanged.
   - The front stack's cue no longer says "Turn and face… Stand the same way".
9. **One name per act:** "Start the camera" and "Stop and read it" on readiness, combine (stop), bar speed (start) and
   form review (stop); bar speed keeps "End the set", which is how lifters say it. The readiness button and its
   adults-only line no longer call it "the jump check" (another tool's name since #480).

**The P3 result card (#484)** landed during this lane. It already covers readiness, sprint, bar speed, the jump tests
and combine; this lane did not touch `lib/results/**`. Form review's flags and the Mirror's reviews are still off it
(§7, call 4).

**Not changed:**
- Every reader, grader, band and threshold. One threshold is reused: the stand's sway fallback, applied to two more
  takes.
- The 3-jump protocol, and hands on hips for readiness and combine.
- The pain questions and "Something hurts: stop", the medical disclaimer ("It does not say why", "not a diagnosis"),
  and every under-18 rule: readiness and sprint are verified adults only, bar speed is 13+ (teen technique only), and
  the jump tests' new page is verified adults only.
- Consent and privacy. Video stays on the phone and nothing new is sent.

## 5. Gates, before → after

### 5.1 Per tool

| Tool | Taps from Home to the camera | Words before the camera (rig) | Time to the first number | Refusals: reason + fix |
|---|---|---|---|---|
| **Jump tests** | **8 + a whole vertical run** → **4** (Train, Jump tests, pick, Film it) | the list was out of reach → 62, the five tests on open | a ≈ 40 s vertical run first → none first (the video read on the phone is unchanged) | every jump, before and after |
| **Readiness** | 3 (+1 optional) → 3 (+1) | 79 → **63** | 13.3 / 13.2 s → **13.3 / 13.2 s** (30 / 60 fps, realistic); 2× noise never → **15.3 s**; two arm-swing jumps: no number → **21.7 / 21.6 s** | none live → **every refused jump**, said and shown |
| **Bar speed** | 3 + **a typed weight** (+ height once) → **3, nothing to type** (height once, for the pose ruler) | 187 → **115**; controls 21 → 16; button looks 9 → 6 | 2.5 s (42 ms after the first rep) → unchanged | "Enter your height" mid-set (cannot be done) → "Show the plate / Or end the set and type your height" |
| **Sprint** | 6 (5 with the centre line) → 6 (5) | 204 → **146**; controls 20 → **8**. With the camera on: 214 → **58**, controls 21 → **3** | the run → unchanged | 10 of 16 → **16 of 16** |
| **Mirror coach** | 4 + the intake → **3** + the intake (opens on the squat) | not rigged (the Babylon page) | unchanged | unchanged |
| **Mirror Jump tab** | a camera on a different reader → **1 tap to the front door** | — | — | — |
| **Mirror Movement Screen** | unchanged | unchanged | turns **4 → 2** (≈ 9 s → ≈ 4 s of turning, SCREEN-EASY's turn times); holds unchanged | unchanged |
| **Form review** | unchanged | 54 → 54 | unchanged | none live → the setup card's fix before the first rep |
| **Combine jump** | unchanged (coach-run) | live: 25 → 36 (the no-mark's reason) | 13.3 / 13.2 s → unchanged; 2× noise never → **15.3 s** | silent no-mark → **every no-mark says why** |

### 5.2 The takes on the bench (`scripts/tools-easy-bench.ts --seeds 4 --fps 30,60`)

First try = runs that reached a number without starting again. Time = camera on → the number (s, mean / max). Counted =
jumps in the number. Bias / SD = shown best vs force-plate truth (cm).

| Tool | Condition | fps | First try | Time | Counted | Bias / SD |
|---|---|---|---|---|---|---|
| readiness | clean | 30 | 4/4 → 4/4 | 13.4 / 13.4 → 13.4 / 13.4 | 3 → 3 | -0.2 / 0 → -0.2 / 0 |
| readiness | clean | 60 | 4/4 → 4/4 | 13.2 / 13.2 → 13.2 / 13.2 | 3 → 3 | 0.1 / 0 → 0.1 / 0 |
| readiness | realistic noise | 30 | 4/4 → 4/4 | 13.3 / 13.4 → 13.3 / 13.4 | 3 → 3 | 0.6 / 2.76 → 0.6 / 2.76 |
| readiness | realistic noise | 60 | 4/4 → 4/4 | 13.2 / 13.2 → 13.2 / 13.2 | 3 → 3 | -0.85 / 1.68 → -0.85 / 1.68 |
| readiness | drops 10% | 30 | 4/4 → 4/4 | 13.4 / 13.5 → 13.4 / 13.5 | 3 → 3 | 0.47 / 0.86 → 0.47 / 0.86 |
| readiness | drops 10% | 60 | 4/4 → 4/4 | 13.2 / 13.2 → 13.2 / 13.2 | 3 → 3 | -0.53 / 0.9 → -0.53 / 0.9 |
| readiness | heavy noise (2x) | 30 | 0/4 → 4/4 | – → 15.3 / 15.4 | 0 → 2.8 | – → -0.13 / 2.35 |
| readiness | heavy noise (2x) | 60 | 0/4 → 4/4 | – → 15.3 / 15.3 | 0 → 3 | – → -1.33 / 1.95 |
| readiness | bent-knee landing | 30 | 4/4 → 4/4 | 13.4 / 13.5 → 13.4 / 13.5 | 3 → 3 | 1.67 / 3.06 → 1.67 / 3.06 |
| readiness | bent-knee landing | 60 | 4/4 → 4/4 | 13.3 / 13.3 → 13.3 / 13.3 | 3 → 3 | 0.53 / 0.25 → 0.53 / 0.25 |
| readiness | quick re-jump (0.3 s rest) | 30 | 4/4 → 4/4 | 11.9 / 12 → 11.9 / 12 | 3 → 3 | 0.58 / 1.11 → 0.58 / 1.11 |
| readiness | quick re-jump (0.3 s rest) | 60 | 4/4 → 4/4 | 11.8 / 11.8 → 11.8 / 11.8 | 3 → 3 | -0.2 / 0.77 → -0.2 / 0.77 |
| readiness | first jump with arm swing | 30 | 4/4 → 4/4 | 14 / 14 → 17.8 / 17.9 | 2 → 3 | -0.27 / 0.9 → -0.27 / 0.9 |
| readiness | first jump with arm swing | 60 | 4/4 → 4/4 | 13.8 / 13.8 → 17.7 / 17.7 | 2 → 3 | 0.7 / 2.12 → 0.82 / 1.97 |
| readiness | first two with arm swing | 30 | 0/4 → 4/4 | – → 21.7 / 21.7 | 0 → 3 | – → -0.27 / 0.9 |
| readiness | first two with arm swing | 60 | 0/4 → 4/4 | – → 21.6 / 21.6 | 0 → 3 | – → 0.82 / 1.97 |
| combine | clean | 30 | 4/4 → 4/4 | 13.4 / 13.4 → 13.4 / 13.4 | 3 → 3 | -0.2 / 0 → -0.2 / 0 |
| combine | clean | 60 | 4/4 → 4/4 | 13.2 / 13.2 → 13.2 / 13.2 | 3 → 3 | 0.1 / 0 → 0.1 / 0 |
| combine | realistic noise | 30 | 4/4 → 4/4 | 13.3 / 13.4 → 13.3 / 13.4 | 3 → 3 | 0.6 / 2.76 → 0.6 / 2.76 |
| combine | realistic noise | 60 | 4/4 → 4/4 | 13.2 / 13.2 → 13.2 / 13.2 | 3 → 3 | -0.85 / 1.68 → -0.85 / 1.68 |
| combine | drops 10% | 30 | 4/4 → 4/4 | 13.4 / 13.5 → 13.4 / 13.5 | 3 → 3 | 0.47 / 0.86 → 0.47 / 0.86 |
| combine | drops 10% | 60 | 4/4 → 4/4 | 13.2 / 13.2 → 13.2 / 13.2 | 3 → 3 | -0.53 / 0.9 → -0.53 / 0.9 |
| combine | heavy noise (2x) | 30 | 0/4 → 4/4 | – → 15.3 / 15.4 | 0 → 2.8 | – → -0.13 / 2.35 |
| combine | heavy noise (2x) | 60 | 0/4 → 4/4 | – → 15.3 / 15.3 | 0 → 3 | – → -1.33 / 1.95 |
| combine | bent-knee landing | 30 | 4/4 → 4/4 | 13.4 / 13.5 → 13.4 / 13.5 | 3 → 3 | 1.67 / 3.06 → 1.67 / 3.06 |
| combine | bent-knee landing | 60 | 4/4 → 4/4 | 13.3 / 13.3 → 13.3 / 13.3 | 3 → 3 | 0.53 / 0.25 → 0.53 / 0.25 |
| combine | quick re-jump (0.3 s rest) | 30 | 4/4 → 4/4 | 11.9 / 12 → 11.9 / 12 | 3 → 3 | 0.58 / 1.11 → 0.58 / 1.11 |
| combine | quick re-jump (0.3 s rest) | 60 | 4/4 → 4/4 | 11.8 / 11.8 → 11.8 / 11.8 | 3 → 3 | -0.2 / 0.77 → -0.2 / 0.77 |
| combine | first jump with arm swing | 30 | 4/4 → 4/4 | 14 / 14 → 14 / 14 | 2 → 2 | -0.27 / 0.9 → -0.27 / 0.9 |
| combine | first jump with arm swing | 60 | 4/4 → 4/4 | 13.8 / 13.8 → 13.8 / 13.8 | 2 → 2 | 0.7 / 2.12 → 0.7 / 2.12 |
| combine | first two with arm swing | 30 | 4/4 → 4/4 | 14 / 14 → 14 / 14 | 1 → 1 | -0.2 / 1.6 → -0.2 / 1.6 |
| combine | first two with arm swing | 60 | 4/4 → 4/4 | 13.8 / 13.8 → 13.8 / 13.8 | 1 → 1 | 0.3 / 1.83 → 0.3 / 1.83 |

**Accuracy unchanged.** Every condition that read a number before reads the same number after: the same bias and SD to
the hundredth, the same time to the hundredth of a second. A combine attempt's value is identical in every condition.
What changed is what used to fail or mislead:
- 2× noise now reads.
- A refused jump no longer takes a readiness slot.
- Every refusal says why.

Nothing else measured anything a new way:
- **Bar speed, sprint, jump tests:** no reader line changed. Their suites (`tests/vbt`, `lib/vbt`, `tests/sprint-speed`,
  `lib/sprint`, `tests/jump-tests`) pass unchanged.
- **The Mirror:** each station is graded as before; only the order changes. `lib/mirror/fixtures/baseline.json` differs
  only in the front stack's cue text.

### 5.3 The premium rule at 390 px (`scripts/probes/_tools-easy-phone.mts`)

Each cell: font sizes · button looks · controls · visible words · sideways scroll (px). The rig draws each page's title
and lede above the tool, which adds three font sizes (12, 28, 15 px) to every scene.

| Screen | Before | After |
|---|---|---|
| readiness, before the camera | 5 · 3 · 7 · 79 · 0 | 5 · 3 · 7 · 63 · 0 |
| readiness, the stand | 5 · 2 · 2 · 28 · 0 | 6 · 2 · 2 · 23 · 0 |
| readiness, a refused jump | 5 · 2 · 2 · 28 · 0 | 7 · 2 · 2 · 34 · 0 |
| combine, the stand | 5 · 1 · 1 · 25 · 0 | 6 · 1 · 1 · 25 · 0 |
| combine, a no-mark | 5 · 1 · 1 · 25 · 0 | 7 · 1 · 1 · 36 · 0 |
| bar speed, set-up | 6 · 9 · 21 · 187 · 0 | 6 · 6 · 16 · 115 · 0 |
| bar speed, live before the first rep | 5 · 2 · 3 · 45 · 0 | 6 · 2 · 3 · 49 · 0 |
| sprint, set-up | 7 · 6 · 20 · 204 · 0 | 7 · 6 · 8 · 146 · 0 |
| sprint, camera on | 6 · 5 · 21 · 214 · 0 | 6 · 2 · 3 · 58 · 0 |
| jump tests (after: the door) | 4 · 1 · 1 · 24 · 0 | 5 · 1 · 5 · 62 · 0 |
| form review, before the camera | 6 · 1 · 1 · 54 · 0 | 6 · 1 · 1 · 54 · 0 |

Held: 0 sideways scroll on every screen. On the live stage the tool's own sizes are 4 or fewer: the word or count, the
refusal and the stop button. The readiness and combine stages gained the big count and the refusal line, which are
the point. Bar speed's set-up went from 9 button looks to 6.
Contact sheet: `tools-easy-before-after.jpg` in this lane's scratchpad (the path is in the PR body).

## 6. Flags

- **TUNED (behaviour), readiness:** only a counted jump fills one of the three; a refused one is said and waited past.
  Before, a refused jump filled a slot. On the bench, every condition that read before reads the same: identical
  bias / SD and identical time. A take with refused jumps now runs longer (17.7 s for one refused jump, 21.6 s for two)
  instead of ending short or failing.
- **Threshold reused, flagged:** `calib.swayFallback` (0.05, VERTICAL-EASY, signed off 2026-10-27) now also serves the
  readiness and combine stands. It applies from the second stand refused for sway; `calib.maxSway` 0.02 is unchanged.
- **Protocol run order, flagged:** the Mirror's Movement Screen is walked front, side-on, behind (`order:
  'frontFirst'`). The protocol order stays the default and is what every stored screen and score reads.
- **Bar speed:** Start no longer requires a typed weight. A set kept without one is not on the weight-and-speed line
  (it was already allowed by `lib/vbt/sets.ts`).
- **Tests changed (each says why in place):**
  - `tests/mirror-first/train-quick-screen.test.ts` pinned the Mirror card before the Quick Screen card. The Measure
    group now lists the measuring tools first.
  - `tests/mirror-first/harness-live.test.ts` dropped the Jump tab's frame-budget row, because the tab has no live
    frames now. It gains a test that the tab offers the front door and no Start session.
  - `lib/mirror/fixtures/baseline.json`'s two `firstSay` strings follow the front stack's new cue. That is the only
    change in it.
  - `scripts/mirror-coach-tests.ts` checked the source text `new ScreenRunner(screenIdRef.current)`. It now accepts the
    same call with its walk order. The check is the same: the runner is built from the picker's current value.
- **Shared files:**
  - `lib/coach/readiness/capture.ts`, `copy.ts` (the adults-only line's name), `components/readiness/readiness-check.tsx`
    (the live and intro regions; the P3 result region untouched).
  - `lib/combine/jumpTake.ts`, `components/combine/jump-camera.tsx`.
  - `components/vbt/velocity-session.tsx` (the set-up and live regions).
  - `components/sprint/{speed-app,sprint-runner,setup-diagram,run-result}.tsx` (the failed-run line only in
    `run-result`).
  - `components/jump/jump-tests.tsx` (one prop).
  - `components/coach/form-review/record-set.tsx` (plat-p06 works near the session player; this touches only the
    recording view).
  - The Mirror: `mirror-harness.tsx`, `lib/mirror/{screen,screenRunner,hudChip}.ts`, `lib/mirror/fixtures/baseline.json`.
  - Train: `app/train/page.tsx`, `app/train/{readiness,speed,velocity}/page.tsx` (the ledes), `messages/en/train.json`.
- **assumption:** the athlete reacts 1.5 s after the take turns to "jump" (the same before and after).
- **assumption:** a word on the setup card must hold 0.5 s before it changes (`WORD_HOLD_MS`, new, not a feel number).

## 7. Owner calls (recommendation first)

1. **Readiness: count only the jumps that count.** Recommend: keep. One wrong jump no longer throws the day away, and
   the number reads the same.
2. **The combine no-mark says why, aloud.** Recommend: keep. A coach asked to call a no-mark wants the reason too. If
   the voice is unwelcome at a busy combine, the words stay on screen without it.
3. **Bar speed without a weight.** Recommend: keep. The speed is the tool and the weight is a bonus; the weight-and-speed
   line asks for it when it is missing.
4. **Form review and the Mirror's reviews onto the P3 card.** Recommend: a follow-up with plat-p03. A set review is a
   list of flags, not one number, so it needs the card's "no number" variant.
5. **A countdown for readiness and combine** ("3, 2, 1, Jump!", like the vertical). Recommend: no. These takes start
   once the stand reads; the voice says "Jump!" then. A countdown would add 3 s to a 30-second check.
6. **Sprint: a camera-side "Go" for the solo athlete** (the phone is at the finish line, 40 yd away). Recommend: a
   follow-up. The Go is loud enough on the bench's assumption, but the owner's phone check should say.
7. **Combine's coach flow** (the station picker, the roster). Out of this lane's reach. The jump station's live take
   is this lane's.

## 8. Owner phone check (10 minutes)

1. Train → the **Measure** group. Expect, in order: Measure my vertical, Screen my movement, **Jump tests**, Readiness
   check, Sprint speed, Bar speed, The Mirror.
2. **Readiness check** → Start the camera. Prop the phone, step back.
   - Expect a big amber word until the whole body shows, then green "Stand still" with the hands-on-hips picture, then
     "Jump!" said and shown.
   - Do the first jump swinging your arms. Expect "Your hands left your hips. Keep them there and jump again.", said in
     full, and "0 of 3".
   - Do three more with hands on hips: "One.", "Two.", "Three.", then the result card.
3. **Jump tests** → Squat jump → Film it. Expect the list at once, with no vertical run first.
4. **Bar speed** → Start the camera without typing a weight. Stand side-on. Expect the side-on card and its word, then
   your first rep's speed. Keep going until the bar slows 20 %: expect the stop line **said**.
5. **Sprint speed** → Start the camera. Expect the set-up to fold into one line, a big amber "Tap one end of the finish
   line", then the run.
6. **The Mirror** (from Train). Expect it to open on the squat. Expect the Jump tab to show only "Measure my vertical"
   and your dunk progress. On the Screen tab, expect the stations front-on first, then side-on, then from behind.
