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
