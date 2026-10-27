# VERTICAL-EASY — measuring a vertical, audited and fixed (lane `vertical-easy`, 2026-10-27)

Owner, 2026-10-27: *"It needs to be way easier to measure vertical."* Asked what was hard: **all four** — couldn't find
where to measure; setup and phone position; jumps that didn't register; too many steps and screens. First user: **the
solo athlete**, one person, phone propped up, measuring themselves. Coach and team flows come later and must not break.

Everything below is **measured**: the screens from the code at `94cda626` (this lane's base) and the live flow on the
bench. The bench (`lib/vertical/sim.ts`, `scripts/vertical-easy-bench.ts`) plays the **live** jump-only runner
(`lib/assess/runner.ts`, `JUMP_PARTS`) end to end with a synthetic athlete who reacts to it: stands in the shot, waits
for "Go", jumps, answers "Any pain in that one?" 1.5 s after it shows. Every frame is JUMP-PRO's physics bench filmed
through the app's own virtual camera (`lib/jump/ballistic.ts`), so each jump's force-plate truth is known. The jump
bench (`lib/jump/bench.ts`) grades a whole take offline; this one grades it the way a phone does, live, from only the
frames the runner kept — which is where most of the friction below was hiding.

---

## 1. Every place a person can measure a vertical (before)

Taps are counted from the signed-in home (`/` redirects to `/play`) unless noted; the browser's camera permission is
counted separately (first time only).

### 1.1 Quick Screen, jump only — `/screen` → `/play/mirror/assess?run=jump` (the real measurement; JUMP-PRO's reader)

| | Before |
|---|---|
| Path | Play → **Train** tab → **Quick Screen** row → `/screen` start card → **"Just test my jump (about 1 min)"** |
| Signed out | Not linked from the landing at all: `/screen` is reachable by QR or typing only |
| Taps from home to the first jump | **6** in-app (Train, Quick Screen, Just test my jump, age, pain, take-off foot) + camera permission |
| Screens before the camera | 5: start card (2 buttons, a disclaimer, an "Early version" label, a five-line list of checks, a privacy paragraph), age (4 answers), pain (2), take-off foot (3), the camera card (auto-skipped) |
| Setup demands | Camera card auto-skipped; device check auto-continues (0.9 s at ≥ 12 Hz). Live: "Camera setup — Prop your device at hip height, 2–3 m away, portrait or landscape." + the framing fix in amber, or "Whole body in view — ready". **No picture.** Calibration: 3 s stand, "arms down"; then "Hands on your hips the whole time. Dip and jump as high as you can, land, and stand still. Three jumps." (22 words, spoken over the countdown). **No height or reference to type** (free fall is the ruler). |
| Taps during the jumps | 0 (auto-detected, a beep per counted jump, "Two. Stand still, then go again.") |
| Taps after | 1 — "Any pain in that one?" Yes/No, after a 3 s "Jump: done." card |
| Jumps asked | 3 (best shown); up to 6 attempts or 90 s |
| Camera on → number (bench) | 24.2 s clean · **31.0 s mean / 43.9 s max** realistic 30 fps · **55.0 s mean / 108 s max** realistic 60 fps |
| Failure paths | Framing: one amber line. Refused jump: "The camera never saw you land." / "The camera lost your feet on that jump. Once more." / "Keep your hands on your hips." — no fix said for the first two. Calibration refused: "Hold still for a moment, arms by your sides." — **forever**, under a noisier camera. Tracking lost 6 s: "Lost you for a moment — trying this move once more." |
| Result | Disclaimer, stop line, "Your jump", 40 px number "about 17 ±1 in", an estimate paragraph, "3 jumps, best one shown", an inches/cm toggle, a meaning line, **5 buttons** (Do the full screen, Build my Dunk Program, Play free, Run it again + toggle), a privacy link — then for an adult three more cards (session card, slow-mo upload, more jump tests) |
| Under 18 | No camera at all (SCREEN-MINOR-LOCK): the age answer goes to a camera-free card. Unchanged by this lane. |

### 1.2 The same flow from other doors (each lands on `?run=jump`)

| Door | Path and label | Taps from home to the first jump |
|---|---|---|
| Profile jump tile (empty) | Profile → "Do a Mirror jump check →" | 5 + permission |
| Daily drill card (adult who saves) | Train → "Do a jump check" | 5 + permission |
| Signature programs | Train → Signature programs → "Do the jump check" | 6 + permission |
| A challenge link (`measure_first`) | the 409's link, "Do a Mirror jump check" | 4 + permission |

Four names for one thing ("Just test my jump", "Do a Mirror jump check", "Do a jump check", "Do the jump check").

### 1.3 The Mirror's **Jump** tab — `/play/mirror?pattern=jump`

| | Before |
|---|---|
| Path | Train → The Mirror → (health intake gate the first time) → **Jump** tab → start the camera |
| Reader | **A different one**: `DunkTracker` (`lib/irl/dunkTracker.ts`, flight time, no calibration, no re-timing), not JUMP-PRO's |
| Setup | The Mirror's framing; no countdown; no "hands on hips" |
| Result | "Best jump · estimated", **cm only**, plus a dunk-progress panel (streak, this week, attempts) |
| Taps | 3–4 + intake + permission; signed in only |

### 1.4 Daily readiness check — `/train/readiness` (verified adults)

| | Before |
|---|---|
| Path | Train → Readiness check → optional feel 1–5 → **"Start the jump check"** |
| Taps | 3 (+1 optional) + permission |
| Setup | A caption only: "Hold still, hands on hips…", then "Jump 1 of 3". **No framing feedback, no countdown, no voice, no picture.** |
| Detect | Same finder and grader (`lib/coach/readiness/capture.ts` → `detectFlights` / `gradeT5`); a refused jump just does not advance the count — **no reason shown** |
| Retry | "Stop and read what I did" button; a short take ends with one `why` line |
| Result | Ready / Normal / Low against the athlete's own normal; the vertical itself is a small "Best" cell |

### 1.5 Combine day — `/coach/combine` station, `/train/combine` (coach-run)

Coach taps "Start the camera: N jumps" per athlete; caption "<name>: hold still, hands on hips…", "Jump 1 of N"; the same
finder; no framing feedback, no reason for a refused jump; "Stop and read the jumps". Coach flow — out of the solo
athlete's way, left as is (§4, owner call 4).

### 1.6 Other places a vertical number appears

| Where | What | Note |
|---|---|---|
| **Prove It** dunk duel (`/play/dunkduel`, the Play primary) | `verticalCm` of each dunk (`DunkTracker`) | A dunk contest (consent, roster, prop-phone steps), not a standing vertical |
| **VERT** (`/play/irl`, on the Play shelf) | A vertical from the **phone's motion sensor** | The owner's rule is camera only, no sensors (§4, owner call 3) |
| Slow-mo upload, approach / touch height, drop / RSI, the jump tests (#437/#443/#455) | Reached only from an adult's jump result | Kept; now under "More detail" |
| Dunk "verified jump" unlock (PLAN-DUNK-FLAGSHIP phase 9) | Not built yet | When it is, it links `MEASURE_VERTICAL_HREF` |
| Onboarding (first-run) | No jump measurement (the dunk first-win is the game) | — |

---

## 2. Why jumps did not register — every refusal on the live bench, by cause

`npx tsx scripts/vertical-easy-bench.ts --seeds 6 --fps 30,60` (6 seeds × 14 conditions × 2 rates, 6 trials offered per
run). Before = this lane's base. "Runs to a number" counts runs that reached a result; "auto-detect" = jumps counted ÷
jumps the runner graded.

| Condition (30 / 60 fps) | Runs to a number, before | Cause, measured | Class |
|---|---|---|---|
| clean, realistic, bent-knee, flat-foot, tucked, occlusion, blur, quick re-jump, no rest | 6/6 each, **100 % detect** | — (the reader holds; bias/SD below) | — |
| realistic noise | 6/6, but **31 s / 55 s mean, up to 108 s** to the number | A **single missed pose frame** (the model drops ~1 % of frames) restarted the 1 s shot hold, threw away the 3 s stand, and sent the countdown back to 3 | framing (setup gate) |
| drops 10 % | **0/6** | the same, every few frames: the stand never completed | framing (setup gate) |
| heavy noise (2×) | **0/6** | "Hold still for a moment, arms by your sides." forever: the stand's sway gate (`calib.maxSway` 0.02) reads landmark **jitter** as sway — a still athlete on the realistic camera already uses 0.016 of it, 2× noise 0.025–0.032 | threshold |
| arm swing | **0/6, 0 % detect (0 of 36)** | "your hands left your hips" — the T5 protocol's rule (hips stand for the centre of mass; an arm swing moves it) | take-off read (protocol) |
| phone at 2 m / 4.5 m (athlete never moves) | 0/6 | Correctly held at framing: "Feet in the shot." / "Come closer." — the athlete has to move | framing (guided) |
| Lighting | — | Motion blur (dim room) reads at 100 % with a wider spread (−2.2/3.9 cm at 30 fps); dim is a warning, never a refusal | lighting |

The owner's own recorded jumps (`lib/pose/__fixtures__`, DeepMotion solves of the owner's phone video, 30 fps, through
the live flow):

| Fixture | Jumps | Counted before | Refusals |
|---|---|---|---|
| `jump_two_foot_low` (four in-place rebounds) | 4 | 4 (+1 flight at the clip's end, "never saw you land") | — |
| `jump_two_foot_high` (natural jumps, arm swing, 40 cm of travel) | 3 | **0** — no number after 90 s | hands left the hips; feet "did not rise as far as that air time needs" (travel toward the lens); never saw the landing |

---

## 3. The top 10 friction points, ranked (solo athlete first)

1. **Couldn't find it.** No "measure my vertical" anywhere: the jump lived behind Train → Quick Screen → a start card
   whose first word is "Just test my jump"; the signed-out landing had no door at all. Four names for one thing.
2. **A missed frame restarted the setup.** On a realistic 60 fps camera the stand and countdown restarted again and again:
   55 s mean, 108 s worst from camera-on to the number (24 s when nothing is missed). 10 % frame drops: never started.
3. **Arm swing is refused, every time, and people swing.** 0 of 36 on the bench; the owner's own natural jumps: 0 of 3.
   "Keep your hands on your hips" was a 5-word line after the fact; the instruction before was buried in a 22-word sentence
   spoken over the countdown.
4. **"Hold still" forever on a noisier camera.** The stand's sway gate reads jitter as sway; 2× noise never calibrated.
5. **Too many taps and screens before the first jump:** 6 taps + permission from home; 5 screens; the take-off foot is
   asked for a jump that does not use it.
6. **Setup in numbers, not a picture:** "hip height, 2–3 m away, portrait or landscape" — no picture of where the phone
   goes; the ready state was a sentence ("Whole body in view — ready").
7. **Refusals with no fix:** "The camera never saw you land." / "The camera lost your feet on that jump. Once more."
8. **The result was a page, not a number:** a 40 px number among two disclaimers, a paragraph, five buttons and three
   cards; no "what it means" against last time, no clear next step.
9. **A second, different jump measure** in the Mirror's Jump tab (another reader, cm only, no countdown), plus a
   motion-sensor VERT game — three numbers that can disagree.
10. **Readiness and combine say nothing when a jump is refused** — no framing feedback, no countdown, no reason.

---

## 4. What changed (step 2) — see §5 for the gates

1. **One front door** — `MEASURE_VERTICAL_HREF` (`lib/vertical/door.ts`), named **"Measure my vertical"** everywhere:
   a chip on Play (the signed-in home), a chip on the signed-out landing, the first row of Train's Measure group, the
   `/screen` start card's primary, and every jump CTA (profile tile, daily drill, signature card, challenge link).
2. **The jump alone skips the take-off foot** (`lib/screen/flow.ts`). It labels only the full screen's sided checks; "Do
   the full screen" after a jump asks it then. Age and pain are asked exactly as before.
3. **A blink is not a reset** (`lib/assess/runner.ts`): before a rep is up, fewer than `LOSS_FRAMES` (6) missed frames in
   a row are skipped instead of restarting the shot hold, the stand or the countdown — the same allowance the test itself
   already gave a rep. Nothing is read from a skipped frame; a real absence still resets. **TUNED (new behaviour).**
4. **A noisy camera still calibrates** (`calib.swayFallback` 0.05, new, in the register and the sign-off sheet): from the
   second refused stand, the same stand is read once more at 2.5× the sway. `calib.maxSway` 0.02 is unchanged; every other
   stand check is unchanged. **TUNED (new threshold).**
5. **The setup says itself** (`live-hud.tsx`, `components/vertical/setup-picture.tsx`): a picture of a phone leaning on a
   bottle with the person two or three steps away; ONE big word — the fix in amber ("Step back", "Whole body in view",
   "Come closer") or **"Ready"** in green with a tick; the full sentence under it. Before the countdown, the jump's one
   rule as a picture: hands on hips. The countdown ends **"3, 2, 1, Jump!"**, said and shown.
6. **Every refused jump says the reason and the fix**, then waits for the next (no button): "Your feet left the shot. Step
   back a little and jump again." · "I missed your landing. Step back a little and jump again." · "Your hands left your
   hips. Keep them there and jump again."
7. **The result is a number**: 88 px, "Your vertical", then three lines (CUE-STYLE §4) — *Best of your 3 jumps: about
   17 in.* / *This is your number to beat.* or *That is 1.5 in more than last time.* (against the last check the adult kept
   on this device; inside JUMP_SAME_BAND_IN it says "about the same") / *Measure again in a week, same spot and same time
   of day.* One primary, **Done**; a quiet **Jump again**; everything else under **More detail** (units, the estimate line,
   the full screen, the dunk program, Brain Brawl, and for adults the session card, slow-mo and the jump tests).

8. **Arms free on the front door** (owner, 2026-10-27: *allow arm swing*) — §7.

Not changed: the reader (`t5-cmj.ts`, `refine.ts`), every T5 threshold, the 3-jump protocol, hands on hips for the jump
check, the full screen and the readiness check, every under-18 rule (no camera under 18; the age question on every new Start), the pain questions before and after, nothing
sent, the video never leaves the device.

---

## 5. Gates, before → after

| Gate | Before | After |
|---|---|---|
| Taps from home to the first jump | 6 + permission (signed in); signed out: no door | **3** + permission (Measure my vertical, age, pain) — signed in and signed out |
| Taps from Train to the first jump | 5 + permission | **3** + permission |
| Setup screens before the camera | 5 (start card, age, pain, take-off, camera card) | **2** (age, pain) — the camera card still auto-skips |
| Setup words on the live card | 18 (eyebrow + "Prop your device at hip height, 2–3 m away, portrait or landscape." + the fix) | **1 big word** + a picture (the sentence under it only while something needs fixing) |
| Taps during the jumps | 0 | 0 |
| Taps after the jumps | 1 (pain check) | 1 (pain check — unchanged, owner call 2) |
| Camera on → number, realistic noise (bench, mean / max) | 31.0 / 43.9 s at 30 fps · 55.0 / 108.3 s at 60 fps | **24.1 / 24.1 s · 24.0 / 24.2 s** |
| First tap → number, a first-timer (estimate, below) | ≈ 55 s at 30 fps · ≈ 79 s at 60 fps | **≈ 40 s** |
| Runs reaching a number (bench; the 11 conditions an athlete can complete without moving the phone × 2 rates × 6) | 108 / 132 | **132 / 132** |
| … with arm swing (6 attempts each) | 0 / 12 | 0 / 12 (owner call 1) |
| Auto-detect, jumps counted ÷ jumps graded (all 14 conditions) | 324 / 396 = 82 % | 396 / 468 = 85 % — **100 % of every jump that kept hands on hips**, both before and after; the remainder is arm swing |
| The owner's recorded jumps (live flow) | low: 4 of 4 · high: 0 of 3 | identical (the reader is unchanged): low 4 of 4 · high 0 of 3 (arm swing, travel toward the lens) |
| Retry paths covered (a reason + a fix) | 1 of 3 jump refusals; calibration jitter: none; blink: none | 3 of 3; jitter: fallback; blink: skipped |
| Validation bias / SD (cm), the jump bench `scripts/jump-accuracy.ts --reader t5 --seeds 6` | realistic: −0.44/1.38 (30 fps), −0.67/1.42 (60) | **byte-identical tables** at 30 and 60 fps, every condition (§6.2) |
| Live-flow bias / SD vs force-plate truth of the best jump (cm) | realistic: −0.38/1.10 (30), −0.33/1.01 (60) | **identical** in every condition that read before; heavy noise and 10 % drops now read: −0.65/2.71, −1.82/3.04; −0.47/1.32, +0.40/1.03 |

**The first-timer estimate** (assumption: about 3 s to read and tap each screen before the camera, 2 s for the browser's
camera prompt, 3 s for the pose model to load on a phone, 1.4 s for the device check — 0.9 s held at ≥ 12 Hz plus its 0.5 s
read). Before: 6 taps × 3 s + 2 + 3 + 1.4 + 31.0 (30 fps) or 55.0 (60 fps) ≈ 55 / 79 s. After: 3 taps × 3 s + 2 + 3 + 1.4 +
24.1 ≈ 40 s. The camera-on part is measured; the rest is the assumption. The owner's phone check measures it for real.

## 6. Bench numbers

### 6.1 The live flow, before → after (`npx tsx scripts/vertical-easy-bench.ts --seeds 6 --fps 30,60`)

Camera on → number (s, mean / max) and best-jump bias / SD vs truth (cm). "Runs" = runs that reached a number, of 6.

| condition | fps | runs before → after | camera → number before → after | bias / SD before → after |
|---|---|---|---|---|
| clean | 30 | 6 → 6 | 24.2 → 24.2 | +0.10/0.00 → +0.10/0.00 |
| realistic noise | 30 | 6 → 6 | 31.0 / 43.9 → **24.1 / 24.1** | −0.38/1.10 → −0.38/1.10 |
| heavy noise (2×) | 30 | **0 → 6** | – → 27.1 / 27.1 | – → −0.65/2.71 |
| drops 10 % | 30 | **0 → 6** | – → 24.2 / 24.3 | – → −0.47/1.32 |
| bent-knee landing | 30 | 6 → 6 | 31.1 / 43.9 → 24.1 / 24.5 | +0.77/3.40 → +0.77/3.40 |
| motion blur (dim room) | 30 | 6 → 6 | 31.0 / 43.9 → 24.1 / 24.1 | −2.20/3.86 → −2.20/3.86 |
| quick re-jump (0.3 s rest) | 30 | 6 → 6 | 29.9 / 42.4 → 22.9 / 23.0 | −0.18/1.25 → −0.18/1.25 |
| arm swing | 30 | 0 → 0 | 42.8 / 55.8 → 35.9 / 36.0 (to "No jump counted") | – |
| clean | 60 | 6 → 6 | 24.0 → 24.0 | 0.00/0.00 → 0.00/0.00 |
| realistic noise | 60 | 6 → 6 | 55.0 / 108.3 → **24.0 / 24.2** | −0.33/1.01 → −0.33/1.01 |
| heavy noise (2×) | 60 | **0 → 6** | – → 27.0 / 27.3 | – → −1.82/3.04 |
| drops 10 % | 60 | **0 → 6** | – → 23.9 / 24.2 | – → +0.40/1.03 |
| bent-knee landing | 60 | 6 → 6 | 55.2 / 108.8 → 24.3 / 24.3 | +0.68/1.48 → +0.68/1.48 |
| motion blur (dim room) | 60 | 6 → 6 | 55.2 / 108.8 → 24.3 / 24.3 | −1.32/2.07 → −1.32/2.07 |
| arm swing | 60 | 0 → 0 | 66.4 / 120.0 → 35.5 / 35.5 | – |

Flat-foot, tucked, occlusion and no-rest read the same before and after (bias/SD identical; the time to the number drops
as for realistic noise). The phone at 2 m and at 4.5 m stays at the framing step with "Feet in the shot." / "Come closer." —
the bench's athlete never moves, so those two rows measure only that the guidance is right.

Heavy noise reads with a wider spread (SD 2.7–3.0 cm, the bench's own −0.34/2.80 and −0.90/2.83 at 30/60 fps): those jumps
carry their wide ± on the result and are never verified (lib/jump/session.ts, unchanged).

### 6.2 The validation bench, before → after (`npx tsx scripts/jump-accuracy.ts --reader t5 --seeds 6 --fps 30|60`)

Run on this lane's base and on this lane: the two tables are **identical, byte for byte**, at 30 and at 60 fps (every
condition, every column). The reader (`t5-cmj.ts`, `refine.ts`) and every T5 threshold are untouched; the bench grades a
take offline, so the runner's setup changes cannot reach it. Realistic noise: −0.44/1.38 (30), −0.67/1.42 (60); decoys:
0 of 24 valid at both.

### 6.3 The owner's recorded jumps (`npx tsx scripts/vertical-easy-bench.ts --recorded`)

Before and after are identical: `jump_two_foot_low` 4 of 4 counted (best 28.4 cm vs 32.0 cm flight truth — rebounds with
0.13 s contacts, not the protocol; `t5-cmj.test.ts` pins its mean error ≤ 6 cm), `jump_two_foot_high` 0 of 3 (arm swing,
travel toward the lens, a landing out of the clip). The repo holds no other recorded standing jumps; the CMU run-up and the
dunk takes are approaches, read by the approach reader (§9 of docs/JUMP-PRO.md), which this lane did not touch.

---

## 7. Arm swing on "Measure my vertical" (owner decision, 2026-10-27)

*"Allow arm swing."* The front door reads a natural jump, arms free, and its result says **"Your vertical, with arm swing"**.
The daily readiness check keeps hands on hips (a repeatable test), and so do the hands-on-hips jump check and the full
screen. The two results are **separate series, never compared**.

**How** (`lib/vertical/armsFree.ts`): the jump check's own read with one refusal lifted — T5's "your hands left your
hips", the last thing the grader checks, so a jump it refuses for anything else stays refused — and the set summed again
with JUMP-TESTS' `resummarise` (as its `cmjArms` test does). The runner takes `armsFree` (`lib/assess/runner.ts`), and its
setup line and on-screen picture say "arms free". Routes: `?run=vertical` is the front door; `?run=jump` stays the
hands-on-hips check.

**Two series.**
| Series | Where it is read | Where it is kept | Compared with |
|---|---|---|---|
| Arm swing (`vertical`) | "Measure my vertical" | this device, adults only (`lib/vertical/series.ts` → `lib/jump/historyStore.ts`, wipeable) | its own last result only |
| Hands on hips (`check`) | the jump check (`?run=jump`), the full screen, the readiness check | the server for a verified adult who opted in (the landing record), as before | its own history only |

The profile tile, the daily drill, challenges, verified jumps and PRQ power read the server's hands-on-hips rows, so their
links now point at the hands-on-hips check under one name, **"Jump check, hands on hips"** (they had pointed at
`?run=jump` before; only the label changed). A server home for the arm-swing series needs a schema or an allow-list
change — owner call 1.

**Accuracy proof.**
- *Does the read key on the hands?* No. The flight finder reads the feet (`footLowY`), a scoring frame needs the hips,
  knees and feet only (`SCORING_POINTS` 23–26 + feet), the re-timing fits the hips (`refine.ts` points 23/24) and checks
  movement on shoulder and hip width. The wrists are read in one place: the refusal lifted here. Measured: the same 36
  bench jumps filmed with and without an arm swing (30 and 60 fps, 6 seeds) read **identical heights, to 0.0 cm**
  (`tests/vertical-easy/arms-free.test.ts`).
- *Accepted on the bench, live:* see §7.1 — arm-swing jumps went from 0 % counted to 100 %.
- *Honest limit* (`lib/jump/protocols.ts`): an arm swing moves the centre of mass against the hips, and the bench's hips
  fly the parabola, so that error is not modelled. Flight-time height is what is read, the same way for both series; the
  force-plate pilot is what would put a number on the difference.

**One guard the hands rule had been hiding** (TUNED, new: `vertical.standDrift` 0.08 body heights). The owner's recorded
take `jump_two_foot_high` travels 40 cm. Read live from a stand where it ended, its first jump came back **62.5 cm for
30.5 cm of truth** — refused before only because the hands left the hips. Lifting that rule would have shown it. So an
arms-free jump whose feet, just before take-off, sit more than 0.08 body heights off the stand's floor line is refused:
*"You moved from your spot. Go back to where you stood and jump again."* The bench's own jumps never pass 0.021 (360 jumps,
every condition); a 25 cm step toward the lens reads 0.072 (kept, and read right: 39.6 cm for 40); the owner's travelled
take 0.148–0.161 (refused). It applies to the front door only; the hands-on-hips check is unchanged (owner call 6).

### 7.1 The front door on the live bench (`scripts/vertical-easy-bench.ts`, rows "FRONT DOOR")

FRONT_DOOR_TABLE

### 7.2 The owner's recorded jump (`jump_two_foot_high`), its number

RECORDED_TABLE
