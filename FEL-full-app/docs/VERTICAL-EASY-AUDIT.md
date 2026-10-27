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

Not changed: the reader (`t5-cmj.ts`, `refine.ts`), every T5 threshold, the 3-jump protocol, hands on hips, every
under-18 rule (no camera under 18; the age question on every new Start), the pain questions before and after, nothing
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
| Camera on → number, realistic noise (bench, mean / max) | 31.0 / 43.9 s at 30 fps · 55.0 / 108.3 s at 60 fps | see §6 |
| Runs reaching a number (bench, 28 cells × 6) | 108 / 168 | see §6 |
| Auto-detect rate (bench) | 324 / 396 = 82 % | see §6 |
| Retry paths covered (a reason + a fix) | 1 of 3 jump refusals; calibration jitter: none; blink: none | 3 of 3; jitter: fallback; blink: skipped |
| Validation bias / SD (cm) | unchanged — see §6 | unchanged |

## 6. Bench numbers

Filled in by the final run (`scripts/vertical-easy-bench.ts`), §6.1–6.3 below.
