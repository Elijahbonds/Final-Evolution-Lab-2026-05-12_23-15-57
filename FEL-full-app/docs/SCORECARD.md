# FEL 10-point game scorecard

**The owner's bar (2026-09-15): "Don't stop till all games read 7.5 or higher."** Decision: a new 10-point scorecard, one rubric for every game, each category measured by probes plus frame review. **A game passes only when EVERY category is 7.5 or higher**; the overall is the mean and is reported, but it cannot carry a weak category.

Produced by `scripts/probes/_scorecard-capture.mts` (one measured session per game on a production build) and `scripts/probes/_scorecard.mts` (scores the capture plus the release gauntlet, mechanics probe, phone-controls check and the frame-review sheet). The report goes to `~/Claude/outbox/finish-release/scorecard/SCORECARD-<tag>.md`.

## The six categories (each 0–10, clamped)

### 1. Controls: does every press do something you can see or hear?
Source: the capture session (deliberate driver: every live verb, moving with purpose) through `QaTrace`, plus the phone check.
- start at **10**
- − silent presses: `silentPct / 4` (10 % silent = −2.5)
- − slow answers: `(median press→answer ms − 150) / 100`, capped at 2
- − phone: **2** if the route fails the phone-controls check

### 2. Logic: does playing well beat noise, and does the game end?
Source: the release gauntlet plus the mechanics probe (idle / deliberate / masher; per-family intent drivers where they exist).
- start at **10**; **capped at 5** if the gauntlet does not reach the end card
- − **1.5** if idle play scores
- − noise wins: `min(4, (mash ÷ best-of-intent-or-deliberate − 1.2) × 1.5)` when the ratio is above 1.2
- − **1** per unexplained score change (score with no cue), capped at 3

### 3. Body: does the character move like a person?
Source: the capture, sampling `__FEL_DEV__.anim()` (production-safe) at 10 Hz on the hero.
- start at **10**
- − bind pose: **0.5** per % of frames with no clip playing
- − T-arms: **1** per % of frames with both hands out wide at shoulder height
- − awkward arms: **0.08** per % of frames the arms verdict fails its window (behind the body, over the head where the clip says they should not be)
- − clip jitter: `max(0, top-clip changes per second − 2)`

### 4. Visuals: does it look good?
Source: frame review of three captured frames per game (opening, mid-play, action). A reviewer scores five checks at 2 points each and records them in `scorecard-visual.json` with a one-line reason each:
1. the hero is clearly framed and readable
2. the venue is dressed: no empty voids, no untextured slabs, a horizon
3. light and exposure are pleasing: nothing blown out or crushed
4. no visual defects: clipping, z-fighting, floating, bind pose, broken materials
5. the HUD is readable and uncluttered

Then − **1** per `[FEL-FRAME] hero off-screen` in the session, capped at 3.

### 5. Feel: does it respond with weight and juice?
Source: the capture's `QaTrace` timeline.
- `5 × rich` + `5 × min(1, juicePerMin / 8)`
- `rich` is the share of answered presses whose answer includes a juice beat, a sound or an impact (not only a HUD field or a clip change)
- `juicePerMin` counts JuiceKit beats + feel.impact per minute of play

### 6. Performance: is it smooth and stable?
Source: the capture (in-page rAF fps, console errors, load time).
- fps p10 ≥ 55 → **10**; linear down to fps p10 30 → **5**; below 30 → `fps/6`
- − **3** per console / page error (capped at 9)
- − **1** if load-to-ready exceeds 8 s

## Rules
- Measured on a **production build** (`next start`), logged in, shipping routes.
- A category that cannot be measured for a game (e.g. body on a quiz with no hero) is reported **N/A with the reason**, never scored 10 by default.
- A score only moves on evidence: fix, rebuild, re-capture, re-score. The report keeps every run.
