# How FEL talks about movement — the cue and results style guide

**Status: for the owner to approve** (CUE-REWRITE lane, 2026-10-27). The code holds every rule here
(`lib/cue-style/style.ts`, `lib/cue-style/result.ts`, `lib/cue-style/names.ts`), and `lib/cue-style/corpus.test.ts`
checks every line in scope against it. The audit and the before/after are in `docs/CUE-AUDIT.md`.

Why it exists, in the owner's words after the 2026-10-27 playtest: *"The fitness cueing stuff didn't work well either,
it was weird. It needs heavy revision. The language needs to change. It needs to be clear. It needs to be appropriate.
People need to be able to understand and interpret the results and understand what they are doing."*

**What it covers:** every word a person reads or hears while doing or reviewing a movement. That means the Mirror's live
coach and its review cards, the Movement Screen, the Quick Screen, the form-review flags, the jump, readiness, bar-speed
and sprint results, the exercise library, and the programs' and the coach session player's cues. **Today's drill** is the
today-drill lane's, and this guide is shared with it. **Legal, consent and policy lines** (the "not a medical exam" and
"not a diagnosis" disclaimers, the privacy pages, the guardian and health gates) are out of scope and unchanged.

---

## 1. Say the right amount for the moment

How long a line can be depends on when the person meets it.

| Kind of line | When the person meets it | Limit | Example |
|---|---|---|---|
| **Live cue** | Said or flashed **mid-rep** | **2–5 words.** No number, no technical term. | "Knees out over toes" · "Heels down" · "Push the floor away" |
| **Prompt** | Said **between reps or before a set** (a reset, a framing fix, "stop and do this") | ≤ 14 words | "Step back two steps." · "Stop. Squat slowly to a chair, knees over toes. Five reps." |
| **Card** | **Read before the set** (a library cue, a program cue) | ≤ 18 words, one or two short sentences | "Push your hips back and sweep both hands past the front shin to the floor, then stand." |
| **Set-up** | Where to stand and what to hold, before the first rep | ≤ 24 words | "Kettlebell a foot in front of you, feet a little wider than your hips. Push your hips back and grip it." |
| **Label** | A name: a fault, a movement, a button | ≤ 8 words | "Knees cave in" · "Hip hinge" |
| **Result** | Each of the three parts of a result (§4) | ≤ 24 words each | "That is under your 20% line: you still had speed left." |

## 2. Live cues

- **Action first, positive, said in the moment.** Tell the person what to do, not what went wrong: "Heels down", not
  "Your heels are lifting".
- **One cue at a time.** The coach says one thing and lets it land. It never talks over itself (§7).
- **Plain body words are fine when they are the clearest thing to say.** "Knees out over toes" beats "Press the floor
  apart with your feet — knees travel out over your second toes". Where an outside image is just as clear, use it:
  "Push the floor away", "Pull the handle back". **Owner call 1:** the older rule put an outside thing first in every cue
  (`lib/coach/cueLint.ts`); this guide lets a cue of five words or fewer name a body part with its direction (§9).
- **Never a muscle to squeeze** ("squeeze your glutes", "engage your core"). That rule is unchanged.
- **Never shame.** No "bad rep", "lazy", "sloppy", "wrong", "weak".
- **The repeat is simpler, not louder.** When a fault keeps coming back, the coach says a shorter version ("Knees wide"),
  then a firmer one ("Slow down. Knees out."), then a reset when the set stops.

## 3. Plain words

- **About a 6th–8th grade reading level.** Short sentences and everyday words. The screen checks each line (Flesch–Kincaid
  ≤ 10) and each surface's average (≤ 8).
- **Body parts people know:** knees, hips, heels, chest, back, shoulders, upper back, lower back. Not "trunk",
  "pelvis", "scapula", "posterior chain".
- **A technical term only with its plain meaning, in the same line.** People read one line at a time, so every line counts
  as the first use. Examples:
  - "Hip hinge: push your hips back, back flat."
  - "Bounce score (RSI: time in the air ÷ time on the ground)"
  - "Estimated max: the most you could lift once…"
  - "Strength and speed profile, also called force-velocity"
- **Words we do not use with the athlete:** valgus, varus, eccentric or concentric (unless glossed), triple extension,
  tripod, cylinder, dorsiflexion, thoracic, lumbar, RNT, axial loading, plyometrics, 90/90, v_max, τ, F0, Pmax, e1RM,
  R², "fault", "cued", "regress", "work set", "the check".

## 4. Results: always three parts

Every result card, review line and flag says three things, in this order:

1. **What we saw**, in plain words. "Knees cave in on rep 4." · "Best rep: 0.62 m/s (metres a second). Your slowest rep
   was 18% slower than your best."
2. **What it means for you.** "Knees that stay over your toes are easier to control." · "That is under your 20% line: you
   still had speed left."
3. **What to do next:** one concrete action, with a link when the app has a place for it. "Next set, think: 'Knees out
   over toes'." · "Rest 2 to 3 minutes before the next set." · "Run the screen again in a few weeks and try to beat it."

Rules for numbers:

- **Every number gets a meaning:** a comparison ("about the same as last week", "under your 20% line") or what it is for.
- **Estimates say so.** Use "about" and "estimate", and show the ± where the method has one. Never add precision the
  camera does not have.
- **A position is not a measurement.** "On rep 4" needs no meaning; "42 cm" does.

The shape is `lib/cue-style/result.ts` (`ResultLine`: saw / means / next). The screen fails a result that is missing a part,
or that has a number with nothing to compare it to.

## 5. Safety and what is appropriate

- **No medical, diagnosis or injury words.** The weekly draft's `MEDICAL_WORDS` screen (`lib/coach/weeklyDraft/copy.ts`)
  is extended in `lib/cue-style/style.ts` (clinician, physician, clinical, dysfunction, impingement, instability, deficit,
  pathology, symptom…). It runs on every line in scope, and on every string in every file this lane touched. Use "med
  ball", not "medicine ball".
- **Pain always routes to stop, and to a person.** "If anything hurts, stop. Tell your coach or an adult, and see a health
  professional." A question that asks about pain ("Any pain right now?") is a question, not a route.
- **Written so a teenager can read it,** and safe for one to follow: no max-effort wording on a youth entry.
- **No body-shaming. Nothing about weight or appearance:** no fat, skinny, toned, burn, slim. "Weight" means the thing you
  lift.
- **Inclusive.** Say "your less-used hand", not "your weak hand". Say "help-side", not "weak-side". No gendered or ability
  put-downs.

## 6. One name for each thing, everywhere

Each fault and movement has **one** name, in `lib/cue-style/names.ts`. The Mirror's review, the form-review flags, the
Quick Screen rows, the HUD and the library all use it. Examples:

| Canonical name | Retired names |
|---|---|
| Knees cave in (one side: "Left knee caves in") | Knee drifting inward on the descent · knee caves · valgus · Front knee drifting in off the midline |
| Heels lift | Heels lifting on the descent |
| Weight shifts to one side | Lateral weight shift |
| Not deep enough | Shallow depth · Reps stopping short of the bottom |
| Back bends | Head-to-hips line breaking (the broomstick line) · Back line breaks |
| Knees bend too much | Knees doing the work — hips not travelling back |
| Hips sag or pike | Hips off the head-to-heels line (sagging or piking) |
| Squat · Lunge · Hip hinge · Push-up · Press and row | Corrective Squat · Split-Stance Lunge · Hip Hinge · Split-Stance Press / Row |
| Knees from the front · Heels from behind · Head position · One-leg balance | Knee window · Heel line · Head float · Single-leg stance |

## 7. When a cue is said (timing)

Measured on the rig's synthetic pose feeds (`tests/cue-timing/timing.test.ts`):

- **One voice at a time.** No line starts while another line is still being said. The coach waits for a stage line, a
  framing fix or "sit deeper" to finish (`CueEngine.holdFor`, with each line's length from `lib/cue-style/speech.ts`).
- **No talking after the set is over.** A mid-rep cue is never said once the review opens.
- **No spam.** At most one correction every other rep (the existing 6-second hold-down), and none at all on a clean set.
- **No contradiction.** No praise and correction for the same fault inside 6 seconds.
- **The coach says less as the person improves.** The faded schedule is unchanged.

Detection, thresholds and tuned timings are **not** changed by this guide. It changes the words, and when they are said.

## 8. Checklist for a new line

- [ ] Which kind is it (§1)? Is it within the limit?
- [ ] Could a 13-year-old read it once and act on it?
- [ ] Is any technical term glossed in the same line?
- [ ] If it is a result: does it say what we saw, what it means, and what to do next?
- [ ] Does every number say what it means, and say "about" if it is an estimate?
- [ ] No medical, shaming or body-image words? Does pain route to stop and to a person?
- [ ] Does it use the canonical name (`names.ts`)?
- [ ] Run `npx vitest run lib/cue-style`.

## 9. Owner calls in this guide

1. **Body-part live cues.** A live cue of five words or fewer may name a body part with its direction ("Knees out over
   toes", "Heels down"). The brief's own examples ("Knees out", "Chest up") failed the old external-focus lint (rules 3–4
   in `lib/coach/cueLint.ts`), so that lint is relaxed for this case only. Longer lines still lead with the outside world.
2. **The limits** in §1 (card 18 words, set-up 24, label 8) are this lane's choice. The brief fixed only the live cue
   (2–5 words).
3. **The reading-level heuristic** (Flesch–Kincaid ≤ 10 per line, ≤ 8 per surface) is approximate on short lines.
