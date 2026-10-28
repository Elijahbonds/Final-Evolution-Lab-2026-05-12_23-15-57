# SCREEN-EASY: the movement screen, audited and fixed (lane `screen-easy`, 2026-10-28)

Owner, 2026-10-28: *"Screening needs to be faster and easier."* His standing rules: it plays by itself with no extra
taps, it is never confusing, it uses plain words and the dark premium look, and it uses the camera only. Targets: a
first-timer's full screen in **≤ 3 min** from the first tap to the result, **≤ 5 taps** in all, and no typing.

Everything below was **measured**. "Before" is `f7b6de6b` (`lane/finish-release` with VERTICAL-EASY #480 merged), built
from git objects. "After" is this lane.

**The bench.** `lib/screen-easy/sim.ts` and `scripts/screen-easy-bench.ts` play the **live** full-screen runner
(`lib/assess/runner.ts`, `QUICK_PARTS`) from start to finish. The athlete in them is synthetic and reacts to the runner:
- they hear where to stand;
- they turn, step to a wall or switch legs;
- they wait for "Go", then do the reps (and do a rep again if it did not count);
- they answer each prompt.

Every movement is one of `lib/assess/replay.ts`'s synthetic captures (the ones `runner.test.ts` drives), filmed through
the app's virtual camera, either clean or with the synth's seeded jitter. Missed pose frames are seeded too.

**assumption:** how long a person takes between parts. The same values are used before and after:
- They start moving once the first sentence of the line is said (2.5 words a second, `lib/cue-style/speech.ts`).
- A quarter turn takes 2 s, a half turn 2.5 s, stepping to a wall 5 s, leaving it 4 s, and switching legs 1 s.
- A tap means walking to the phone: the tap comes 4 s after the prompt shows, then 3 s back into the shot.
- Both hands up comes 3.5 s after the prompt shows.

The 390 px rig (`scripts/probes/_screen-easy-{entry.tsx,phone.mts}`) renders the real screens. Its live scenes are the
real `LiveHud`, fed the views from that same simulated run.

---

## 1. Every screening path (before)

| Path | Where | What it runs | Taps from Home | Camera time |
|---|---|---|---|---|
| **Quick Screen, full** (`/play/mirror/assess?run=full`) | Play → **Train** → **Quick Screen** card → `/screen` start card → **Do the full screen** | overhead squat front + side, ankle bend L/R (knee to wall), single-leg squat L/R, hands-on-hips jump | **6** before the camera (Train, Quick Screen, full screen, age, pain, take-off foot) + permission, **+4** pain checks in the camera = **10** | 165.7 s mean / 169.8 s max (realistic + 1 % missed frames) |
| Quick Screen, jump only / "Measure my vertical" | VERTICAL-EASY's front door | T5 | 3 + permission | ~24 s (VERTICAL-EASY-AUDIT) |
| **The Mirror's Movement Screen** (`/play/mirror`, Screen tab) | Train → The Mirror → (the health intake the first time) → **Screen** tab → Modified (picked) → **Start** | 6 held stations: heels from behind 12 s, front stack 14 s, breath 8 s, head side-on 10 s, one leg L/R 30 s each | 3 + the intake, + the 2 breath questions at the end = **5** | 104 s of holds + 3 turns (back → front → side → front); the picker says "about two minutes" |
| Coach: "Ask them to run the Mirror's movement screen" (`components/coach/screen-prescriptions.tsx`) | the coach's client view | points the athlete at the Mirror's screen | — | — |
| Combine day / readiness | coach-run / daily | the jump only (VERTICAL-EASY §1.4–1.5) | — | — |

The Mirror's Movement Screen belongs to the Mirror lanes (`mirror-harness.tsx` is exclusive to them). This lane audited
it and did not change it (§6, owner call 5).

### 1.1 Before the camera (Quick Screen, full)

| Screen | Words (390 px rig) | Taps |
|---|---|---|
| `/screen` start card | 73 (the jump-or-full buttons, the disclaimer, "Early version", the five-line list of checks, the privacy paragraph) | 1 |
| Age | 16 | 1 |
| Pain | 25 | 1 |
| Take-off foot | 31 | 1 |
| Camera card | 0 (it skips itself) | 0 |
| **Total** | **145 words, 4 screens** | **4** (+ Train + the card = 6 from Home) |

---

## 2. Where the time went: the live flow, before

`npx tsx scripts/screen-easy-bench.ts --seeds 4 --parts`, run on the before tree.

| Condition (30 fps, 4 seeds) | Runs that reached a result | Camera → result (s, mean / max) | Walks to the phone | Lines cut off | Refusals, spoken line × n |
|---|---|---|---|---|---|
| clean | 4/4 | 160.3 / 160.3 | 4 | 9.0 | – |
| realistic noise | 4/4 | 165.7 / 169.7 | 4 | 9.3 | T2-left "Keep your heel flat on the floor." ×4; T2-right ×1 |
| realistic + 1 % missed frames | 4/4 | **165.7 / 169.8** | 4 | 9.3 | the same |
| realistic + 10 % missed frames | 4/4 | 163.6 / 168.1 | 4 | 9.3 | T2-left ×4 |
| first-timer mistakes (one heel up, one foot down, one hand off the hips) | 4/4 | 175.0 / 180.8 | 4 | 10.3 | T2-left ×8, T5 "Your hands left your hips…" ×4, T2-right ×1 |
| no wall | — | the runner has no way out: the person stands there | — | — | — |

Per part, one realistic run. "Hear and get there" is the athlete's time; "wait in place" is time spent waiting on the
runner after they arrived; "after" is the done beat, or the 3 s card plus the walk to the phone and back.

| Part | Hear and get there | Wait in place | 3-2-1 | Reps | After |
|---|---|---|---|---|---|
| T1 front | 2.0 | 0.0 | 3.0 | 10.6 | 1.2 |
| T1 side | 4.8 | 3.1 | 3.0 | 10.5 | **7.0** |
| T2 left (wall) | 6.6 | 0.0 | 3.0 | **16.1** (a refused rock) | 1.2 |
| T2 right | 4.1 | 2.0 | 3.0 | 8.5 | **7.1** |
| T3 left (away from the wall) | **9.6** | 2.0 | 3.0 | 7.9 | 1.2 |
| T3 right | 3.0 | 0.0 | 3.0 | 8.0 | **7.0** |
| T5 | 3.0 | 1.9 | 3.0 | 9.6 | **7.0** |

Seconds by runner step (mean, realistic + 1 %): position 31.8 · countdown 26.9 · active 69.0 · the "done" card 12.0 · the
pain check 16.2 · done beats 3.7 · stand 3.0 · side-on stand 2.1 · framing 1.0.

## 3. The top 10 friction points, ranked

1. **Four walks to the phone.** The pain check after each test was a tap ("Tap yes or no when you walk back"). Each one
   was a walk of 2–3 m, a tap, and a walk back into the shot: about 7 s, 28 s a screen, and 4 of the 10 taps.
2. **Six taps before the camera.** The in-app door went through the QR start card (73 words), whose first button is the
   jump. Then age, pain and the take-off foot. **Nothing on the Quick Screen's result reads the take-off foot**: it only
   labelled `findings`, which the results page never shows, and the landing record's jump is not sided.
3. **Every set-up line was cut off.** The voice says one line at a time and cancels the one before
   (`speakNatural`), and the 3-2-1 started about 2 s after a set-up line that took 9–15 s to say. There were 9.3 cut
   lines a run. "Ankle bend, left leg. Left side to the camera, left foot forward toward a wall. Step one foot
   forward…" was heard for 1.9 s of 15.2 s, then "3".
4. **The order made you move around.** It went front, side-on, the wall, turn around, away from the wall, front again:
   three turns, and a walk to a wall and back in the middle (T3 left took 9.6 s just to get into place).
5. **A 3 s "done" card before each pain check:** 12 s of dead time a run.
6. **A false refusal on the ankle bend.** The live heel check compared one raw frame's heel to a smoothed floor. Camera
   jitter alone refused about 1 rock a run ("Keep your heel flat on the floor."), and the grader, reading smoothed
   frames, then counted that same rock.
7. **3-2-1 seven times:** 21 s. That includes the second leg of the single-leg squat and the second side of the ankle
   bend, where the athlete is already in place.
8. **The side-on stand's 3-2-1 started at once, over its own line.** A stale `countdownReady` from the last part skipped
   the still hold, and "3" cut off "Stay still, side-on, while I measure you."
9. **No way out without a wall.** The knee to wall needs one, and there was no picture of the set-up and no skip.
10. **The result was a long page:** 242 words, 5 font sizes, 4 button looks, four check cards, the jump, the screenshot
    line and the links, all at once. There was no single read of the whole screen.

Also found and not fixed (§6): the runner starts the T2 3-2-1 while the athlete is still walking to the wall (it cannot
see the wall); the Mirror's Movement Screen turns three times; the QR start card keeps its 73 words.

---

## 4. What changed (step 2)

1. **Front-on moves first, then side-on, with the wall last** (`QUICK_PARTS`): T1 facing, T3 left, T3 right, T5, T1
   side-on, T2 left, T2 right. There is now one turn to side-on and one walk to a wall, at the end. A test is done when no
   later part belongs to it, and its pain check comes then. Each test is graded exactly as before (`gradeSession` reads
   the captures in test order). **Protocol order flagged:** this changes spec §8's run order; the grading does not change.
2. **"No pain? Put both hands up."** (`lib/screen-easy/handsUp.ts`). The pain check after each test is still asked every
   time and still waits for an answer (SCREEN A). Both hands up, held 0.8 s, is the "no", given from where the athlete
   stands:
   - it only counts once the hands have come down first, so hands left up from the last overhead squat do not count;
   - a missed pose frame does not break the hold;
   - "Yes" is still one big tap;
   - "Something hurts: stop" stays on screen the whole time and still works at the check (`tests/screen-easy/flow.test.ts`).

   **Owner call 1:** the coordinator approved it on two conditions, both met and both tested: a "yes" path one obvious
   tap away, and the stop control still working.
3. **Lines are heard.** The 3-2-1 waits until the set-up line has been said. The set-up lines are rewritten to 6–15
   words (`lib/screen-easy/copy.ts`; the jump's is 6). No framing fix is said over the line. The 0.9 s still hold now
   runs while the line is being said, instead of after it.
4. **The 3 s "done" card is gone.** "Three. Single-leg squat: done." is the first part of the pain question, in one line
   and on one screen. **TUNED:** `ui.miniResultMs` (3000) is no longer used by the live flow: 3 s → 0.
5. **The second side starts on "Go."** The ankle bend's other side starts once the right side faces the camera. The
   single-leg squat's other leg starts once that leg is seen standing with the other foot up. **TUNED:** a countdown was
   removed on 2 of 7 parts. A first side keeps its 3-2-1.
6. **The single-leg squat waits for the right leg.** If the wrong foot is up for `LOSS_FRAMES` frames, it says "Other
   leg. Stand on your right leg." and holds; before, those reps would have been read as the other side. **TUNED, new:**
   `STANCE_FOOT_UP` = 2 × `t5.contactLine` (0.04 body heights).
7. **The ankle bend's heel check reads the filtered heel at the bottom** (the same series as its floor). This removes
   the false refusal; the grader is unchanged.
8. **The side-on stand's still hold is no longer skipped** (`go('countdown')` resets `countdownReady`).
9. **No wall:** a plain picture (`components/screen-easy/pictures.tsx`, `WallSetup`) and **"No wall here? Skip it"**
   while the ankle bend is set up. It is then not read, never guessed. One tap; "Ankle bend skipped: it needs a wall."
   is said with the closing line.
10. **No take-off-foot question** (`lib/screen/flow.ts` `ASKS_TAKEOFF`, which is empty). The runner gets `null`
    (unknown); there is no default foot (SCREEN A requirement 2 still holds). A check that needs it later can bring the
    tap back with one line. **Owner call 2.**
11. **One front door, "Screen my movement"**, opening the full screen directly: a chip on Play (the signed-in home), and
    Train's card renamed to it. Both go to `?run=full`, which still asks the age question first (`minor-lock.test.tsx`),
    then pain. `/screen` stays the QR address with its start card. The pain step now carries the start card's privacy
    line ("The video stays on this device.").
12. **The result is one screen** (`results-view.tsx`):
    - the disclaimer and the stop line;
    - **one big read**: "Good to go", "Two things to work on" or "Not fully read", from the cards' own bands, never a
      score;
    - the top priorities only (`TOP_PRIORITIES` = 2, ≤ 3), each with what we saw, what it means and what to do next,
      plus the replay and the autoplay demo;
    - the book, the one primary;
    - **More detail**: the other checks, the jump, the screenshot line and the privacy page;
    - Done.

**Not changed:**
- Every grader, band, threshold, calibration and scoring rule, and `checks.ts`/`why.ts`. `git diff f7b6de6b` on
  `lib/assess/graders`, `scoring.ts`, `thresholds.ts`, `calibration.ts`, `lib/screen/PROPOSED-thresholds.ts`,
  `checks.ts` and `why.ts` is empty.
- 3 reps per check. `gate.minValidReps` is 3: two reps would cap every test at 1/3, so fewer reps cannot keep the same
  confidence.
- The pre-camera pain question, the medical disclaimer, "If anything hurts, stop.", every under-18 rule (no camera under
  18, the age asked on every new Start), and nothing sent (the video never leaves the device).

## 5. Gates, before → after

| Gate | Before | After |
|---|---|---|
| **Taps from Home (Play) to the result** | 10 + permission (Train, Quick Screen, full, age, pain, take-off, 4 pain checks) | **3** + permission (Screen my movement, age, pain); from Train 4 |
| Screens before the camera | 4 (start card, age, pain, take-off) | **2** (age, pain) |
| Words before the camera (rig) | 145 (73 + 16 + 25 + 31) | **48** (16 + 32) |
| Walks to the phone during the screen | 4 | **0** (1 with no wall: the skip) |
| **Camera → result, realistic + 1 % missed frames** (mean / max) | 165.7 / 169.8 s | **142.9 / 143.0 s** |
| … clean · 10 % missed · first-timer mistakes | 160.3 · 163.6 / 168.1 · 175.0 / 180.8 | **143.0 · 144.3 / 147.9 · 153.8 / 155.6** |
| … no wall | stuck | 108.9 s (one tap, the ankle bend not read) |
| **First tap → result, first-timer (estimate)** | ≈ 190 s (3.2 min) | **≈ 158 s (2.6 min)** |
| Set-up lines cut off per run | 9.3 | **0** (2.3 lines a run are still cut: the calibration's "three, two, one", which runs with its 3 s stand, and a turn fix that ends once they turn) |
| Refusals per run, realistic (by check: T1 · T2 · T3 · T5) | 0 · 1.25 · 0 · 0 | **0 · 0.25 · 0 · 0** |
| Refusals on the first-timer mistakes (the ones the athlete really made) | T2 ×9, T5 ×4 | T2 ×5, T5 ×4 (the 4 noise-only T2 refusals are gone) |
| Scores, bench (every condition) | T1:3/2 T2:3 T3:3 (1 with a foot down) T5:3 | **identical** |
| Validation | — | no grader, band or threshold line changed; the fixture and grader suites pass unchanged |
| Result page (flagged screen): words · sizes · looks · primary | 242 · 5 · 4 · none marked | see §5.1 |

**The first-timer estimate** uses the same assumptions as VERTICAL-EASY: about 3 s to read and tap each screen before the
camera, 2 s for the camera prompt, 3 s for the pose model, and 1.4 s for the device check. Before: 6 × 3 + 6.4 + 165.7.
After: 3 × 3 + 6.4 + 142.9. The camera part is measured; the rest is the assumption.

### 5.0 Where the 143 s goes now (one realistic run)

| Part | Hear and get there | Wait in place | 3-2-1 | Reps | After |
|---|---|---|---|---|---|
| T1 front | 0.8 | 4.1 (its line, 4.8 s) | 3.0 | 10.6 | 1.2 |
| T3 left | 3.2 | 3.3 (the line) | 3.0 | 7.9 | 1.2 |
| T3 right | 2.6 | 0.6 | **0** | 8.0 | 4.3 (hands up) |
| T5 | 0.4 | 2.0 | 3.0 | 9.5 | 4.4 (hands up) |
| T1 side | 5.2 | 4.7 (the 2 s side-on stand + its line) | 3.0 | 10.5 | 4.4 (hands up) |
| T2 left | 7.0 | 0.0 | 3.0 (runs during the walk to the wall) | 8.5 | 1.2 |
| T2 right | 4.9 | 1.1 | **0** | 8.5 | 4.3 (hands up) |

Framing and the 3 s stand come first: 4.0 s. The totals: the reps 63.5, hearing and getting there 24.1, the pain checks
17.4, waiting in place 15.8 (nearly all of it the set-up lines being said), the 3-2-1s 15.0, and the done beats 3.6.
What is left to cut is tuned or an owner call: the 3-2-1 (§6 call 4), and the lines themselves.

### 5.1 The premium rule at 390 px (`scripts/probes/_screen-easy-phone.mts`)

Each cell: font sizes · button looks · the primary's height · visible words · sideways scroll (px).

RIG_TABLE

---

## 6. Owner calls (recommendation first)

1. **"No pain? Put both hands up."** Recommend: keep it. The coordinator approved it on two conditions: a "yes" one
   tap away, and the stop control always working. Both are kept and tested. It saves four walks to the phone and about
   28 s.
2. **The take-off foot is no longer asked.** Recommend: keep it that way until a check on screen uses the jumping leg.
   Then add that run to `ASKS_TAKEOFF`.
3. **Remember the age and pain answers across runs.** Recommend: no. AGE-RESET (audit 2.2) asks the age again on every
   new Start because phones are shared, and the pain question is about right now. It would save 2 taps.
4. **The 3-2-1, 3 s → 2 s** for every part after the first (TUNED feel). Recommend: leave it at 3 s until the phone
   check; it would save about 4 s.
5. **The Mirror's Movement Screen:** reorder its stations to front-on first (front stack, breath, one leg L/R, head
   side-on, heels from behind). That is 2 turns instead of 3. Recommend: yes, in a Mirror lane. It is their file.
6. **The wall.** The camera reads the shin angle, and the wall only standardises the test. Recommend: keep the wall plus
   the skip.
7. **A stance gate at the wall** (feet split before the 3-2-1), so the countdown cannot run while the athlete is still
   walking there. Recommend: yes, as a follow-up after the phone check.
8. **The QR start card keeps its 73 words.** Owner addendum 2 names its list of checks, and the in-app doors no longer
   pass through it. Recommend: leave it.

## 7. Owner phone check (5 minutes)

1. On a phone, signed in, tap **Screen my movement** on Play.
2. Answer 18 or older, then No, nothing hurts, then allow the camera.
3. Prop the phone at hip height, 2–3 steps away. Expect a green **Ready**, then "Overhead squat. Face the camera, arms
   straight up…", **said in full**, then 3-2-1.
4. Do three overhead squats, then hear "Stand on your left leg…". Stand on your **right** leg first and expect "Other
   leg". Then do three left, and "Now your right leg" starts on **Go.** with no countdown.
5. Expect "Three. Single-leg squat: done. Any pain? If not, put both hands up…". **Raise both hands**, and it moves on
   without a tap.
6. Do the jump, then side-on overhead squats, then the wall. Try **"No wall here? Skip it"** once.
7. Expect the result on one screen: one big read, at most 2 cards, the book, then **More detail**.
8. Time it from the first tap (target ≤ 3 min), and count the taps (target ≤ 5).
