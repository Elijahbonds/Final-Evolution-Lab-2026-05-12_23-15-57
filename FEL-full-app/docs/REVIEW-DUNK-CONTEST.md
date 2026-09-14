# Flight Night — Dunk Contest

**Review, 2026-09-14.** Played on `/dev/mode/dunk`, Venice court, desktop, ~58 fps.

Everything below came from playing it and measuring it. Where I quote a number, a probe produced it.

---

## The verdict up front

There is a genuinely good dunk contest in here, and it is hiding behind a wall of silence.

The systems are deep — ten air tricks with named fire beats, six runway tricks, five judges who each weight
difficulty, execution and style differently, a rival who presses harder when he's behind, three attempts
with a growing penalty, and an optional called shot. That is more contest than most licensed basketball
games ship. The bodies are authored rather than canned: the hand rides the ball to the iron, the spine
answers the trick, there's a real rim hang.

And then you press the button and the game tells you nothing.

**7.5 / 10** — *Deep, good-looking, and almost entirely unwilling to explain itself.*

---

## What works

**The art carries it.** The Venice court at golden hour is genuinely lovely — painted lines, palms, the
ocean behind the baseline, a crowd that isn't cardboard. Nothing here looks unfinished.

**The trick vocabulary is real.** Ten air tricks, each with its own body and its own cue beat, plus six
runway tricks thrown under the hold-run. Throwing a windmill off a double-up gather and watching the arms
actually swing is the moment the mode is selling, and it lands.

**The judges have opinions.** Silk scores style at 0.5 and Reign carries a −0.4 grudge. Two identical
dunks score differently depending on who's watching, which is exactly right for this event.

**The contest has stakes now.** Three attempts, a penalty that grows as you burn them, an optional called
dunk that pays if you land it and costs more if you don't. Real tension.

---

## What doesn't

### 1. The game will not tell you why you missed. This is the big one.

Measured, sweeping the slam press across attempts:

| press after jump | score |
|---|---|
| 1.6 s | **38** |
| 2.0 s | 0 |
| 2.4 s | 0 |
| 2.8 s | 0 |
| 3.2 s | **22** |
| 3.6 s | 0 |

Three of six attempts produced **nothing at all** — no points, no explanation, no sense of what to change.
And the one that worked logged this, to the developer console, where no player will ever see it:

```
[DUNK-SLAM] buffered press @0.99 fired at the window (117 ms early, execution 0.29)
```

That line is everything a player needs. They were 117 ms early. Their execution scored 0.29 out of 1 — a
near-total failure on a press the game itself **accepted, buffered and fired for them**. None of it reaches
the screen. You get a number between 30 and 50 and no idea which of difficulty, execution or style you just
lost.

To be fair to the design: the execution curve is deliberate and well-argued in the source — a flat floor
for buffered presses was tried and rejected because it created a cliff where pressing *earlier* scored
better. The curve isn't the problem. **The silence is.**

### 2. The camera looks away at the exact moment that matters

The rim cut fires at 0.30 into the flight, and on my attempt it framed the backboard half out of the left
edge with the dunker off to the right — so the money shot shows a man jumping *near* a hoop rather than at
one. The flight itself is fine (the hero tracks dead down the x=0 line the whole way, measured); it's the
framing that sells a miss.

### 3. It judders

58 fps average sounds fine. The frame log says **53 of 120 frames were over budget**, worst 66.8 ms. That's
44% of frames late, and you feel it in the hang — the one part of the flight the whole mode is built around.

### 4. Small stuff

- The approach hint is a 130-character run-on sentence naming six controls.
- Nothing tells you what the called-dunk bonus or penalty actually is before you commit.

---

## What I'd fix, in order

**F1 — Show the player their timing.** A post-flush readout: `117 ms EARLY · EXECUTION 29%`, and the same
three-way split on the judges' card (difficulty / execution / style). The data already exists and is
already computed; it goes to `console.info` instead of the screen. Highest value, smallest change.

**F2 — Fix the rim cut's framing** so the rim and the dunker are both in shot.

**F3 — Chase the long frames.** 44% over budget is the "smoothness" problem in one number.

**F4 — Cut the approach hint down** to the two things that matter on your first run.
