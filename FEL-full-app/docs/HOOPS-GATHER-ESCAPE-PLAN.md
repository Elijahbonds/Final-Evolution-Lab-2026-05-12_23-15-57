# Hoops: gathers, pick-ups and escapes — measured, and the plan (lane/hoops-gather, phase A, 2026-11-12)

The owner (2026-11-12): **"We need good escape moves, good gathers and pick ups."** The same day: a euro step dunk, a spin move
into a dunk, a baseline dunk, a one-dribble pull-up and a step-back 3, mid-air adjustment (bail out of a blocked layup into a double
clutch, a reverse or an up-and-under), pro hops and jump stops in traffic, continuity between movement, and dribble-to-shot blending
without a hitch. The bar is the genre's AAA level; nothing of another game's names, art, modes or UI is proposed for copying.

This is phase A: **measured and specified, no game file changed.** Release measured: `eec53f24` (lane/finish-release, after phases 6
and 9 merged; the play audit `HOOPS-AAA-GAP-PLAY.md` was measured before them). New probe: `scripts/probes/hoops-gather/`.

**In one paragraph.** At the top of the bounce the pick-up is good: the ball is 3–9 cm from the palm on the frame it is taken and is
seated at once. Everywhere else it is not. Press while the ball is near the floor and the game takes it from **57–94 cm below the
palm and flies it up at a fixed 8.1 m/s to a hand that does not move** (the hand closes 0–4 % of the gap; the ball does the rest), seated
**7–24 frames** later — in 41 of 45 floor presses the ball is lifted from under the knee. Pressed mid-bounce it is 23–29 cm away. The
gathers themselves bring 1–5 hard pops each, the planted foot slides 6–14 cm a frame on every drive gather (bar 3), and the ball dips a
second time 10–30 cm on its way up on most drive shots (a hitch). Escapes do not escape: against the 1v1 defender a step-back that
travels 0.5–1.0 m, a snatch-back and a behind-the-back all end **exactly 1.10 m from him, as they started** — he mirrors at a fixed
stand-off — and in a 3v3 double team no move made separation from either man (−0.09 to +0.07 m). The retreat dribble gains ground only
by running away, with the ball hand whipping 112–146° in one frame in the behind-the-back clip. The rotation for the spin came out as a between-the-legs every time it registered (6 of 6). None of the combo finishes the owner asked for exists (a euro and a hop never end in a dunk; the spin
dunk is always the 360), and a layup cannot change once it is in the air.

## 1. What was measured, and how

| Source | What it is | Where |
|---|---|---|
| **[GX]** the gather probe (new) | The hoops-gap rig (the real 1v1 / 3v3, dev bundle, the deterministic 1/60 s clock and seed 7, PRO), driven through the real InputBus. One TRIAL at a time: reset the possession with the mode's own seam, approach the way the gather asks (stand, jog, drive, sprint), **wait until the dribble is at a chosen point of its bounce** — the top, falling, the floor, rising — then press (or flick, for an escape), let go at the meter's green, and keep every drawn frame from 40 before the press. Read in Node by `analyze.mjs`. | `scripts/probes/hoops-gather/{trials.mjs, page-gather.js, analyze.mjs}`; run through `../hoops-gap/run-set.sh` (`SCEN=ext`) |
| **[C]** code | `file:line` at `eec53f24`. | |
| **[AUDIT]** | The play audit's numbers (gameplay-clean counter with a real player, the intent bot). Cited as such. | `docs/HOOPS-AAA-GAP-PLAY.md` |

Two full runs per mode (`full1`, `full2`), every gather kind × the four bounce points × 2, the finishes, the escapes, and in 3v3 the
trap. 169 gather trials and 51 escape / trap trials read; trials whose possession had already ended (the first run hit the end of the
1v1 game and the 3v3 game clock: fixed in the second, see §7) or whose press found no ball to pick are left out of the gather tables.

**What each number is** (per trial, from the press — the first drawn frame that could answer it):

- *gap at the pick*: the ball's surface to the nearer palm (hand bone + 8 cm along forearm → hand, as hoops-gap measures it) on the
  frame the ball is parented to a hand (`ballRig.gatherBallToHand`); *seat*: frames until that gap is ≤ 5 cm; *yank*: taken below
  0.45 m and lifted ≥ 0.3 m inside 6 frames; *hand share*: of the gap closed between the pick and the seat, the share the HAND
  closed (the root's frame; 1 = the hand went to the ball, 0 = the ball flew to a still hand).
- *bounce point*: read on the last frame drawn before the press could be answered: held, top (ball ≥ 0.85 m), floor (≤ 0.35 m),
  falling, rising.
- *hard pops*: `gameplay-clean/popCount.mjs`, the counter's own rule (≥ 600°/s and ≥ 3.5× its ±6-frame median, events within 10
  frames grouped, HARD ≥ 1500°/s), over 18 bones from 2 frames before the press to 20 after the release. *Press blend*: the hard events
  from −2 to +6 frames (the dribble → gather blend itself). The 20 frames BEFORE the press are counted apart (the approach's own dribble:
  the audit's sinker 1, not a gather).
- *arm > 25°*: shoulder / arm / forearm / hand turns of more than 25° in one frame (the audit's bar), after the press.
- *slide*: the planted foot's travel a frame (low within 5 cm of the trial's 5th-percentile foot height, the lower foot, not rising).
- *re-drop*: once the ball has started up from the pick, the most it falls again before the release (a second dip = a hitch).
- *escape*: separation from the nearest defender (and in a trap the second) at the flick and 0.8 s later; the root's travel.

**The control (the probe checked against a known-good instrument first).** For 3 s of standing dribble before any trial, both this probe
and the hoops-gap recorder (`page.js`, the instrument phases 1–5 were measured with) recorded the same frames. At every dribble top
the two palm gaps agree to **0.05 cm (1v1, 6 tops) and 0.02 cm (3v3, 5 tops)**. Two things this check found and fixed before any number
below was trusted: (1) a recorder that runs after `hoops/contactPoses` restores its arm bar reads a pose that was never drawn (1.85 cm off
the drawn palm) — the probe records first, as page.js does; (2) **page.js labels its frames one early** (its record `i = 0` is drawn on
`HG.f0 + 1`): without the +1 the comparison was off by up to 13 cm. That label offset is page.js's, for every lane that correlates its
frame numbers with the log (assumption: nobody has; noted for the rig's owner, not changed). `analyze.mjs --selftest` holds the
analyser to a synthetic trial with known answers (8 / 8).

## 2. The measured table

### 2a. The pick-up, by where the bounce was when you pressed (all gather and finish kinds pooled, both runs)

| Mode · bounce | Trials | Gap at the pick, median / worst | Frames to seat, median / worst (not seated) | Yanked off the floor | Hand share (median) | Hard pops after the press (press blend) | Arm turns > 25° in a frame | Planted slide p90 (median) / worst | Re-drop median / worst |
|---|---|---|---|---|---|---|---|---|---|
| 1v1 · top | 27 | **4.3** / 75 cm | **0** / 50 (1) | 1 | 0.31 | 35 (9) | 267 | 5.6 / 25 cm | 14 / 37 cm |
| 1v1 · falling | 24 | 28.9 / 43 cm | 7 / 47 (4) | 0 | 0 | 26 (3) | 198 | 6.5 / 16 cm | 11 / 52 cm |
| 1v1 · **floor** | 27 | **67.1 / 87 cm** | **9 / 24** (11) | **25 of 27** | **0.04** | 36 (10) | 173 | 4.3 / 17 cm | 7 / 34 cm |
| 1v1 · rising | 29 | 24.1 / 44 cm | 7 / 23 (3) | 0 | 0.01 | 39 (11) | 208 | 6.4 / 20 cm | 16 / 125 cm |
| 3v3 · top | 11 | **9.4** / 44 cm | 4 / 22 (1) | 0 | 0.11 | 12 (4) | 74 | 6.0 / 15 cm | 1 / 33 cm |
| 3v3 · falling | 17 | 23.4 / 32 cm | 6 / 15 (1) | 0 | 0 | 23 (7) | 84 | 6.9 / 17 cm | 7 / 88 cm |
| 3v3 · **floor** | 18 | **65.6 / 94 cm** | **9 / 22** (4) | **16 of 18** | **0** | 22 (8) | 143 | 4.9 / 19 cm | 0 / 53 cm |
| 3v3 · rising | 16 | 24.0 / 57 cm | 8 / 30 (3) | 1 | 0 | 17 (8) | 110 | 6.5 / 17 cm | 0 / 119 cm |

The ball's step into the hand is **13.5 cm a frame in every non-top trial**: exactly `GATHER_MPS` 8.1 m/s (`anim/ballRig.ts:66`), the
gather's cap. The press → pick-up delay is 0 frames in every trial but four (below): the pick-up never waits for the bounce
(`gatherBallToHand` is called on the squeeze frame: `OneVOneMode.ts:2019` and `:3168` via `gatherToShootingHand` (`:3612`), `:3067`; `ThreeVThreeMode.ts:2385`, `:2996`, `:3088`). "Not seated" = the ball left the hand (released or a finish's own hold) before it ever came within 5 cm of the palm.

### 2b. By gather kind (all bounce points pooled, both runs)

| Mode · gather | Trials | Gap median / worst | Seat median / worst | Yanks | Hard pops (press blend) | Worst arm °/frame | Slide p90 median / worst | Press → release (median) | Re-drop median / worst |
|---|---|---|---|---|---|---|---|---|---|
| 1v1 · set (standing jumper) | 14 | 34 / 64 cm | 7 / 16 | 3 | 14 (3) | 57.7 (the release's wrist: `bball_mc_jumpshot` → `follow_through`, every set shot) | 1.2 / 8.6 cm | 400 ms | 3 / 13 cm |
| 1v1 · pull-up | 12 | 29 / 72 cm | 7 / 15 | 4 | 17 (4) | 134 (RightArm, the jog dribble into the gather) | 5.4 / 17 cm | 700 ms | 14 / 24 cm |
| 1v1 · step-back (down flick, then Square) | 14 | 13 / 72 cm | 3 / 24 | 1 | 15 (2) | 57.6 | 2.4 / 11 cm | 917 ms | 6 / 22 cm |
| 1v1 · hop step | 15 | 26 / 70 cm | 7 / 37 | 4 | 17 (5) | 76 | **7.8** / 17 cm | 667 ms | 11 / 30 cm |
| 1v1 · euro | 13 | 25 / 66 cm | 6 / 50 | 2 | 16 (2) | 95 | **9.6** / 20 cm | 800 ms | 13 / 29 cm |
| 1v1 · pump → step-through | 13 | 23 / 87 cm | 5 / 39 | 4 | **27 (11)** | **174** (LeftArm) / 160 (RightArm) | 5.0 / 25 cm | 983 ms | **26 / 125 cm** |
| 1v1 · layup drive | 13 | 31 / 78 cm | 8 / 33 | 4 | 17 (4) | 54 | 6.5 / 11 cm | 700 ms | 17 / 24 cm |
| 1v1 · dunk drive | 13 | 29 / 74 cm | 7 / 15 | 4 | 13 (2) | 47 | 5.7 / 15 cm | 733 ms | 13 / 32 cm |
| 3v3 · set | 7 | 23 / 60 cm | 7 / 10 | 1 | 6 (1) | 57.8 (the release's wrist) | 0.5 / 6.7 cm | 383 ms | 0 / 4 cm |
| 3v3 · pull-up | 7 | 23 / 74 cm | 6 / 12 | 2 | 8 (3) | 48 | 1.5 / 13 cm | 383 ms | 0 / 20 cm |
| 3v3 · step-back | 9 | 38 / 94 cm | 7 / 20 | 3 | 10 (2) | 58 | 2.0 / 11 cm | 917 ms | 1 / 17 cm |
| 3v3 · hop step | 9 | 10 / 77 cm | 4 / 21 | 1 | 13 (5) | **132** (LeftArm) | **11.9** / 17 cm | 667 ms | 26 / 53 cm |
| 3v3 · euro | 7 | 11 / 70 cm | 1 / 9 | 2 | 6 (1) | 46 | **9.2** / 19 cm | 867 ms | 22 / 32 cm |
| 3v3 · pump → step-through | 8 | 44 / 75 cm | 10 / 30 | 3 | 12 (7) | **147** (RightArm) | 5.9 / 17 cm | 983 ms | 24 / 119 cm |
| 3v3 · layup drive | 7 | 26 / 66 cm | 8 / 11 | 2 | 6 (3) | **145** (LeftArm, the scoop off the floor bounce) | 3.2 / 15 cm | 250 ms | 0 / 0 |
| 3v3 · dunk drive | 8 | 31 / 76 cm | 12 / 22 | 3 | 13 (5) | 99 | **10.9** / 16 cm | 733 ms | 3 / 88 cm |

What a drive ended in is whatever the mode chose (its own log line is kept per trial: a "layup" drive pressed at 3.7 m is a pull-up
jumper, a "dunk" drive pressed at 3 m with the turbo is a hop step — the face-up reads decide, as they do in play).

### 2c. The escapes (each trial: the move the mode played, the gap to the defender at the flick → 0.8 s later, the root's travel)

| Mode · escape (as played) | n | Gap at the flick → 0.8 s later (m) | Travel (m) | Worst arm °/frame | Hard pops | Slide p90 |
|---|---|---|---|---|---|---|
| 1v1 · step-back dribble (down) | 4 | 1.10 → 1.10, 1.12 → 1.19, 1.10 → 1.10, 1.10 → 1.10 | 0.5–1.0 | 34–50 (hand) | 0–1 | 0.8–1.0 cm |
| 1v1 · snatch-back (R2 + down) | 3 | 1.10 → 1.10, 3.56 → 4.02, 1.10 → 1.10 | 0.45–1.13 | 30–53 | 0–1 | 0.6–1.8 cm |
| 1v1 · behind-the-back, set (down-away) | 3 | 1.10 → 1.10 (all three) | 0.03–0.22 | **122–146 (RightHand)** | 0–1 | 0.5–1.2 cm |
| 1v1 · BTB slide (set, with room) | 1 | 3.46 → 3.77 | 0.75 | 30 | 1 | 0.8 cm |
| 1v1 · retreat dribble (back away + down-away) | 3 | 1.10 → 2.76, 3.87 → 6.34, 2.49 → 4.37 | 2.2–2.6 | **112–130 (RightHand)** | 0–1 | **10.5–11.7 cm** |
| 1v1 · momentum cross (R2 + up-away, at speed) | 2 | 2.64 → 1.10, 1.10 → 1.10 | 0.4–2.6 | 42–62 | 2, 2 | 6.6–13.9 cm |
| 1v1 · the spin (a half-circle of the right stick) | 3 | 1.10 → 1.16, 1.10 → 1.16, 1.36 → 1.17 | 1.2–1.4 | 30 | 0–1 | 9.7–13.6 cm |
| 3v3 · step-back / snatch-back / BTB slide | 6 | 1.77 → 1.38, 1.89 → 1.58; 2.55 → 2.67, 5.63 → 6.45; 2.28 → 2.82, 6.37 → 3.16 | 0.45–0.9 | 30–40 | 0–1 | 0.6–3.5 cm |
| 3v3 · retreat dribble | 2 | 4.13 → 3.78, 7.40 → 7.11 | 2.1 | **128–136 (RightHand)** | 1, 1 | 8.9–9.2 cm |
| **3v3 · the trap, holding** (control: the double came, no move) | 2 | man 1: 1.10 → 1.09, 1.09 → 1.06; man 2: 1.25 → 1.10, 1.66 → 1.10 | — | 31–32 | 0–1 | 8.1–10.2 cm |
| **3v3 · the trap, snatch-back** | 2 | man 1: 1.18 → 1.09 (both); man 2: 1.49 → 1.10, 3.58 → 2.06 | 0.55–1.42 | 30–49 | 0–1 | 1.8–8.5 cm |
| **3v3 · the trap, the spin** | 1 | man 1: 1.10 → 1.09; man 2: 1.10 → 1.17 | 1.12 | 30 | 1 | 9.6 cm |

"The spin" never threw a spin: every half-circle that registered a move came out as **between-the-legs (6 of 6:** 1v1 and 3v3, jogging, in a trap):
its first sample is past the flick ring, so the flick reads first. assumption: the rig's sweep (8 samples over 8 frames,
`hoops-gap/page.js` `sweep`) is a fair half-circle — phase 1's buffer test throws a spin with the same sweep from a standstill, so the
difference is worth one owner try on the phone before anyone calls it a defect. The 3v3 double team came in 4 of the 10 trap trials (in the rest the ball did not stay the double's 0.45 s in the paint); in every one that came, no move moved the handler off either man.

## 3. The worst five findings

1. **The pick-up yanks the ball off the floor.** Pressed near the bottom of the bounce, the ball is taken **57–94 cm from the palm** (median 66–67 cm, both modes), flown
   up at the gather's fixed 8.1 m/s while the **hand does not move** (hand share 0–0.04), and seated 9 frames later (worst 24, 400 ms).
   41 of 45 floor presses were a yank. At the top it is 4–9 cm and seated at once — so the fix is to READ the bounce, not to retune the
   ease. [GX] §2a. Cause: `gatherBallToHand` on the squeeze frame, whatever the dribble's phase (`OneVOneMode.ts:3612–3616`, `:3067`; `ThreeVThreeMode.ts:2996`, `:3620–3624`; `ballCarry.ts:1197` on a deactivation).
2. **Escapes buy nothing against a set man.** The 1v1 defender holds a fixed 1.10 m stand-off and mirrors every escape to the
   centimetre: a step-back that travels 0.99 m ends 1.10 m from him (4 of 4), the snatch-back and the set behind-the-back the same. In a
   3v3 double team no escape moved the handler off either defender (−0.09 to +0.07 m; holding still: −0.03). The only separation in the
   set — the retreat dribble's 1.7–2.5 m — is the handler running away at 3 m/s. Nothing reads the man: whether he is leaning, how far
   he is, where the second defender is. [GX] §2c. Cause: the stand-off is the AI's (`BasketballCore.ts` ARMS_LENGTH 1.25 + its
   spacing), and the escapes are clips with a fixed impulse (`HandleSystem.ts`, `StickHandle.ts:218`).
3. **The behind-the-back whips the ball hand 112–146° in one frame,** every time it is thrown (set, retreating, 1v1 and 3v3: 9 of 9),
   15–25 frames into `bball_behind_back_left`, the ball hand only. It is the escape a retreating handler is given automatically
   (`HandleSystem.ts:435`: "backing out: behind the back"). [GX]
4. **The pump → step-through is the roughest gather:** 27 hard pops in 13 trials (11 in the blend itself), the arm through 160–174°
   in a frame (1v1) and 147° (3v3), and the ball dipping a second time a median **24–26 cm (worst 119–125 cm)** before the
   up-and-under releases — the pump's own gather, the pump clip, then the step-through clip each take the ball on their own path.
   [GX] §2b.
5. **Every drive gather skates.** The planted foot slides **p90 7.8–11.9 cm a frame on the hop step, 9.2–9.6 cm on the euro, 10.9 cm
   on a 3v3 dunk gather** (bar 3 cm; a set jumper is 0.5–1.2 cm): the root's travel is driven by the gather plan's legs
   (`HoopsMoves.gatherWish`, `legs`) while the clip's feet are planted where the clip authored them. [GX] §2b.

Also measured and kept for the plan:

- **The dribble → shot hitch.** On a drive the ball rises from the pick, then **dips again a median 11–17 cm (1v1)** before the release
  (pull-up 14, layup 17, hop 11, euro 13; worst 24–32 cm), so a pull-up off a dribble shows two low points. A set shot's is 0–3 cm. The
  decode's bar is one low point (`SPEC-HOOPS-MOTION-DECODE.md` §2 "Dip").
- **The release wrist.** Every set jumper and step-back snaps the off hand 57.6° in one frame at the release
  (`bball_mc_jumpshot` → `bball_mc_follow_through`, +33 frames on a set shot): one hard pop per shot, the same on every one.
- **The euro's sell collides with the bump spin.** Driving into contact arms the spin (`spinOffContact`, `OneVOneMode.ts:1964`), and the euro's sell is the left stick swung across — so a euro pressed just after a bump threw a 270° spin first and the euro 39–40 frames later (5 of 13 1v1 euro trials; the ball stayed on the dribble for those frames).
- **Press → release** is unchanged by any of this: a set jumper 383–450 ms, a pull-up 683–700 ms, a step-back 867–933 ms, a euro
  833–867 ms, a hop 600–683 ms (the meter's own pacing; the plan keeps every one).

## 4. What exists today (verified at `eec53f24`)

| Piece | What is there | Where |
|---|---|---|
| Gathers into a rise | set (no gather), pull-up (a plant over 0.20–0.34 s by speed), step-back (STEPBACK_SEC back, then 0.16 s) | `core/HoopsMoves.ts:34–103` `planGather` |
| Footwork gathers | step-through (after a pump), hop (sprint squeeze or a double tap), euro (stick sells a side, help in the lane), skip (stick away, no help), shimmy and drop step (post) | `HoopsMoves.ts:603–981`, `core/FinishFootwork.ts` |
| Finishes | 11 styles; the euro ends in a layup or floater, the hop in a rise, layup or floater; never a dunk | `HoopsMoves.ts:845–849`, `FinishFootwork.ts:58` `hopThen` |
| Dunks | picked by speed, angle, contest (`pickHoopsDunk`); REVERSE when the drive is ≥ 0.72 across the rim's face (the baseline dunk); PAUSIN' = the spin thrown into the take-off, always the 360; the family stick at take-off and the trick stick in the air | `core/HoopsDunks.ts`, `core/GameDunks.ts`, `StickHandle.ts` `pausinWanted` |
| The pick-up | `gatherBallToHand`: parented on the squeeze frame with its world position, eased to the palm over 0.20 s, never more than 8.1 m/s; a ball further than 1.3 m is attached outright | `anim/ballRig.ts:53–160` |
| The dribble's phase | known to the carry (`ballCarry.phase`, the pushed bounce, the stride lock) and never read by a gather | `anim/ballCarry.ts:1118`, `anim/Dribble.ts` |
| Escapes | step-back (down), snatch-back (R2 + down), behind-the-back / BTB slide (down-away), momentum cross and wrap (R2), spin (rotation), retreat → behind-the-back by context; separation is a clip and an impulse; whether a MOVE beats the man is now a read since phase 9 (`hoops/rulebook.ts` `readTheMan`: off balance, committed, wrong way) | `core/StickHandle.ts:190–228`, `core/HandleSystem.ts:405–440`, `hoops/rulebook.ts:195–222` |
| The double team (3v3) | the ball 0.45 s inside 3.0 m of the rim brings the nearest other defender; it ends on a pass, the handler leaving the paint, or 2.0 s | `hoops/teamDefense.ts` |
| Mid-air | dunks: the family stick (first 18 % of the flight) and the trick stick; layups: nothing once airborne | `core/GameDunks.ts:31`, `OneVOneMode.ts:2819` |
| Jump stop / pro hop | the hop step is forward, two feet, 0.26 s, ≤ 0.9 m, and ends in a shot; no jump stop into a pass or a pump, no sideways hop | `HoopsMoves.ts:801–815` |
| Clips on the rig that the plan can use | `bball_pullup_gather`, `bball_stepback_gather`, `bball_stepback_release`, `bball_euro_step(_left)`, `bball_hop_step`, `bball_step_through`, `bball_skip_gather_*`, `bball_pump_fake`, `bball_pivot_v2_*`, `bball_spin` / `bball_mc_spin`, `bball_snatch_back_v2_*`, `bball_btb_slide_*`, `bball_behind_back_*`, `bball_mc_dribble_back` (a backing-up dribble, captured), `bball_layup_reverse(_left)`, `bball_up_and_under(_left)`, `bball_layup_scoop`, `bball_layup_hang`, `bball_finger_roll`, `dunk_take_off_one`, `dunk_gather_one` / `_two`, `dunk_double_clutch`, `dunk_finish_*`, `dunk_360_spin`, `dunk_cradle` | `anim/clipRegistry.ts` |

## 5. The plan

Seven phases, in the order that unblocks the most. Every number below that is new is a feel knob (`lib/feel-panel/knobs.ts` + 
`docs/FEEL-PANEL.md`, group "Hoops · gathers") **whose default restores today exactly**, with a test that says so; no existing tuned
number changes (GATHER_SEC 0.2, GATHER_MPS 8.1, the gather plans' seconds and speeds, STEPBACK_*, EURO_*, HOP_* stay as they are).
Every exit gate is read by `scripts/probes/hoops-gather/` (the same trials, the same seed) unless it says otherwise; "both modes" means
1v1 and 3v3. **GATE 0** = a clip or rig change (verify the rig's naming and rest state before and after). **Capture** = what a new
captured clip would do best.

Who can build what, when: hoops-p08 owns `OneVOneMode.ts` / `ThreeVThreeMode.ts` and their HUD hosts until it merges; the builder lane
will touch `HandleSystem.ts`. G1's pure half (`ballRig`, `ballCarry`) can start before p08 merges; the mode lines wait for it.

### G1 — Pick-ups that read the bounce (size M)

*What.* The squeeze still starts the shot on its frame (the meter, the body's gather, every timing stays). Only the BALL's hand-off
reads the dribble: at the top it is taken at once (today's behaviour, which measures well); falling or at the floor, the carry keeps
the ball on its own bounce and the hand goes DOWN to meet it on its way up (the carry's own rising leg, `risingPhaseAt`, and the reach
the carry already solves with `HandIK`), parented on the frame the palm and the ball meet; rising, the hand meets it where it is going.
A wait longer than the knob's limit (a dead-low ball on a crossover's floor contact) takes it as today. The same reading for the
deactivation hand-off (`ballCarry.ts:1197`: a pass, a pick-up off a held move).

*Existing clips:* all of it — no clip changes; the carry, the hand IK and the pushed bounce already exist. *GATE 0:* none.
*Capture:* a low two-hand "rip" pick-up (both hands down to a ball at the knee) would make the deep case read as a choice, not a reach.

*Knobs (new):* `hoops.pickupReadOn` (0 = today), `hoops.pickupWaitMaxSec` (the longest the hand-off waits for the bounce; 0 = never
waits = today), `hoops.pickupReach01` (how much of the gap the hand closes; 0 = the ball flies to a still hand = today).

*Exit gate (both modes, every gather kind, the four bounce points, 2 reps):* gap at the pick ≤ 8 cm at every bounce point (today 4–9
at the top, 23–29 mid, 66–67 at the floor); seated ≤ 2 frames after the pick; 0 yanks (today 41 of 45 floor presses); hand share ≥ 0.5
on every pick whose gap was > 10 cm; the ball's step ≤ its own bounce speed plus 2 cm a frame; press → meter / body unchanged (≤ 1
frame, the phase-1 input test) and press → release unchanged ± 1 frame; with the knobs at their defaults the table in §2a reproduces
to the frame.

### G2 — Gathers that blend from any dribble (size M–L)

*What.* (a) The gather clip enters at the point that matches the hands it inherits, not at frame 0: the pull-up and step-back gathers
from the frame whose ball height matches the drawn ball (as the rise already enters at its own rise, `riseStartOf`), with the
inertialized blend the animator has (`anim/inertialize.ts`) instead of the 0.06 s crossfade (`OneVOneMode.ts:3036`, `:3186`).
(b) **One low point**: from the pick to the release the ball follows one path — down to the dip once, then up — the gather's own dip
replacing the jumpshot's second load (the decode's §2 bar). (c) The drive gathers' feet: the gather plan's legs drive the root, so the
plan's step timing is laid onto the clip's own foot contacts (the legs' seconds stay; their start lines up with the clip's plant), and
the existing foot planting holds the planted foot (`anim/FootPlanting.ts`). (d) The pump → step-through: the pump hands the ball to
the step-through's own path — one owner of the ball through the pump, the step and the up-and-under. (e) The release wrist: the
follow-through's hand enters from the release frame's wrist (a 57.6° snap on every set shot today).

*Existing clips:* the pull-up, step-back, euro, hop, step-through and pump clips do it with entry points and the blend. *GATE 0:* the
euro and hop clips' foot contacts may need re-timing to the plan's legs (`EURO_KEYS` 4 keys / 0.48 s; the hop 0.26 s) — authored
keys, the rig untouched. *Capture:* a euro and a hop step captured at game speed with the ball (the authored euro has no real steps:
the decode's "the root slides 43–63 % sideways under a still body").

*Knobs (new):* `hoops.gatherEntryMatchOn` (0 = frame 0 as today), `hoops.gatherInertialOn` (0 = the 0.06 s crossfade as today),
`hoops.gatherOneDipOn` (0 = today's second load), `hoops.gatherFootSyncOn` (0 = today's legs), `hoops.pumpBallHandOn` (0 = today).

*Exit gate:* per gather trial 0 hard pops in the press blend (today 60 over 169 trials) and ≤ 1 from the press to the release + 20 (today
1–5); no arm turn > 25° in a frame from the press to the release (today 1 257 over 169 trials); re-drop ≤ 5 cm on every pull-up,
step-back, hop and euro (today median 11–26, worst 125); planted slide p90 ≤ 3 cm and worst ≤ 5 cm on every gather (today 6–12 p90 on
the drives); press → release unchanged ± 1 frame (the meter's green still lands on the clip's release key); the step-through's worst arm
≤ 25°/frame (today 160–174).

### G3 — A real escape set that reads the defenders (size L)

*What.* Four escapes, each decided by geometry and the men's motion, never a roll, each with its own body:
**the hop-back** (a two-foot hop away, from the step-back's input: down); **the spin-out** (the rotation, away from the near shoulder);
**the retreat dribble** (the stick held away from the rim with the ball shielded: a backing-up dribble, not a sprint away); **the
crossover escape** (the cross that splits a trap: through the gap between two defenders, or past the side the near man is leaning to).
The read uses what phase 9 built (`hoops/rulebook.ts` `readTheMan`: off balance, committed, the wrong way) plus two new reads: the
**gap between two defenders** (a trap: the angle and width of the opening) and **his reach** (an escape thrown inside his arm's length
on his ball side is stripped; thrown away from his reach it is not). A read that is right buys separation (his reaction is late by the
tier's reaction time, phase 9's numbers); a read that is wrong keeps the ball safe and buys nothing — and a wrong read into a trap's
closed side is a strip. The 1v1 defender's fixed stand-off gives ground on a right read (he recovers at his own speed from where the
escape left him) instead of mirroring.

*Existing clips:* `bball_stepback_gather` / `bball_stepback_rival` (the hop-back's body), `bball_spin` / `bball_mc_spin`
(the spin-out), `bball_mc_dribble_back` (the retreat — a captured backing-up dribble already on the rig, used by nothing in play today),
`bball_crossover_*` / `bball_momentum_cross_*` (the split). *GATE 0:* the behind-the-back clip's ball hand (112–146° in one frame,
`bball_behind_back_left`, 15–25 frames in) is fixed in the clip before it is used as an escape. *Capture:* a split-the-trap crossover
(low, between two bodies) and a hop-back escape would be best captured; the rest can ship on the existing clips.

*Knobs (new):* `hoops.escapeReadOn` (0 = today's escapes and today's stand-off), `hoops.escapeLateSec` (how late a beaten man reacts;
default from phase 9's tier reaction), `hoops.trapGapMinM` (the opening a split needs), `hoops.escapeStripReachM` (the reach inside
which a wrong-side escape is stripped), `hoops.standoffGiveOn` (0 = the 1v1 defender mirrors as today).

*Exit gate (headless sim first — a `scripts/hoops-escape-tests.ts` suite over the real reads — then the rig):* 0 rolls in the dice
ledger's escape rows; against a set 1v1 defender with the right read each escape gains ≥ 0.8 m in 0.8 s, with the wrong read ≤ 0.2 m
(today 0.0 for every standing escape); in a 3v3 double team the split through an open gap leaves ≥ 1.0 m from both men in 0.8 s, and a
split into a closed side is a strip ≥ 9 times in 10 (headless) (today −0.09 to +0.07 m, either way); the spin throws a spin on the
rotation 8 of 8 (today 0 of 6 on the rig's sweep, owner check first); every escape's worst arm ≤ 25°/frame and ≤ 1 hard pop (today the
behind-the-back 112–146°); planted slide p90 ≤ 3 cm on the hop-back and the spin-out (today 9.7–13.6 on the spin's stand-in).

### G4 — Combo finishes: the euro into a dunk, the spin into any dunk, the hop into a dunk (size M)

*What.* A footwork gather may END in a dunk: with the turbo held at the squeeze, enough speed (a knob) and the last plant inside dunk
range, the euro's second step and the hop's two-foot landing take off into the dunk `pickHoopsDunk` would pick for that approach (the
euro's cross gives the angle: a windmill or a cradle; the hop's two feet: a two-hand or a tomahawk; a body in the way: the double
clutch), and the spin's exit takes off into whatever the family stick names (no stick: the drive picks; today PAUSIN' is always the
360). The baseline dunk stays the REVERSE pick and is added to the gate (not measured here: none of the trial geometries ran the baseline).
The euro's sell is read before the bump spin (the collision in §3).

*Existing clips:* `bball_euro_step(_left)` → `dunk_take_off_one` → `dunk_finish_*`; `bball_hop_step` → `dunk_gather_two` →
`dunk_finish_two_hand` / `_power`; `bball_spin` → the family. *GATE 0:* none expected (hand-offs between existing clips); the euro's
last plant must land on the take-off foot (G2's foot sync). *Capture:* a euro into a one-foot take-off and a spin into a take-off,
captured, would read best.

*Knobs (new):* `hoops.comboDunkOn` (0 = a euro or a hop never dunks, the spin dunk is the 360: today), `hoops.comboDunkMinMps`.

*Exit gate:* with the conditions met, euro → dunk, hop → dunk and spin → dunk each fire 10 of 10 on the rig, and without the turbo 0 of
10 (today's finishes untouched); the take-off is the euro's / the hop's last plant (the foot that pushes is the planted one, slide ≤ 3
cm); ≤ 1 hard pop from the gather to the flush, the ball ≤ 0.2 m from the ring's centre at the flush (phase 8's dunk gate); the spin
into ≥ 4 different dunks by the family stick; the baseline drive (lateral ≥ 0.72) into the REVERSE 10 of 10.

### G5 — A mid-air adjustment window (size M)

*What.* From the take-off to the finish's release key, the right stick flicked toward a side changes the finish in the air: away from a
hand in the way → the **double clutch** (pull down, re-extend), under the rim → the **reverse** to the far side, a man in the air in
front → the **up-and-under**, across → the **switch hand**. Whether it beats the block is the real hand-and-ball geometry phase 2 built
(`hoops/blocks.ts`): the adjustment moves the release point, and the block reads where the ball now is. No roll. The window, the
flight and the green are unchanged unless a knob says so (the adjust may add hang only behind its own knob).

*Existing clips:* `bball_layup_reverse(_left)`, `bball_up_and_under(_left)`, `bball_layup_hang(_left)`, `bball_finger_roll`, the
mirrored twins (switch hand), `dunk_double_clutch` (for dunks). *GATE 0:* entering a finish clip mid-flight needs the clips' airborne
frames as entry points (timing keys, the rig untouched). *Capture:* a double-clutch layup and an in-air hand switch.

*Knobs (new):* `hoops.airAdjustOn` (0 = today: no change after take-off), `hoops.airAdjustFromK` / `hoops.airAdjustToK` (the window as a
share of the flight), `hoops.airAdjustHangSec` (0).

*Exit gate:* a flick inside the window changes the finish on the next frame in 10 of 10 (outside it 0 of 10); the release point moves
≥ 0.4 m from the blocker's hand; the ball's path stays continuous (≤ 15 cm a frame); ≤ 1 hard pop per adjustment; the flight's length is
unchanged with `airAdjustHangSec` 0; the dice ledger gains no row.

### G6 — Jump stops and pro hops in traffic (size M)

*What.* **The jump stop:** the hop step with the stick at rest (or pulled back) lands on two feet and STOPS — the ball held, a pivot
foot chosen by the stick, and from there the pump, the pass (3v3), the pivot, the shot or the finish; today the hop always ends in a
shot. **The pro hop:** the same two-foot hop with the stick across — a sideways hop through traffic (around a man in the lane) into the
finish. Both legal by the travel rule the hop already keeps (`HOP_TRAVEL_MAX`).

*Existing clips:* `bball_hop_step`, `bball_land_absorb`, `bball_pump_fake`, `bball_pivot_v2_*`, `bball_catch_hop` (a two-foot land).
*GATE 0:* a sideways hop (the hop clip's root turned across, its keys mirrored for the other side). *Capture:* a pro hop and a
jump stop at game speed.

*Knobs (new):* `hoops.jumpStopOn`, `hoops.proHopOn` (both 0 = today's hop), `hoops.proHopSideM` (how far across).

*Exit gate:* both feet land within 1 frame of each other, the planted slide ≤ 3 cm; from the landing the pump / pass / pivot / shot
answers in ≤ 1 frame; travel ≤ 0.9 m (no travel call); the pro hop moves ≥ 0.6 m across; 0 hard pops on the landing.

### G7 — Re-measure (size S)

The gather probe at one tip (both modes, every kind, four bounce points, 2 reps), the escapes and the trap, the gameplay-clean counter
with a real player (`hoops-audit/mash-audit.mjs PLAYER=script` and `mash`): the hard pops a minute that are gather / escape events
(the counter's transition list) at 0, and every gate above. Frame strips of the same moments as §6 for the owner's eye.

| Order | Phase | Size | Needs |
|---|---|---|---|
| 1 | G1 pick-ups read the bounce | M | the pure half now; the mode lines after hoops-p08 merges |
| 2 | G2 gathers blend from any dribble | M–L | GATE 0 (foot keys of the euro / hop); owner eye on the result |
| 3 | G3 escapes that read the men | L | the builder lane's `HandleSystem.ts`; GATE 0 (the behind-the-back hand); **owner**: is a wrong-side escape into a trap a strip? |
| 4 | G4 combo finishes | M | G2's foot sync; owner eye |
| 5 | G5 mid-air adjustment | M | GATE 0 (entry points); **owner**: the input (the right stick in the air, as the dunk trick stick) |
| 6 | G6 jump stop, pro hop | M | GATE 0 (the sideways hop); **owner**: the input (the hop with the stick at rest = the jump stop?) |
| 7 | G7 re-measure | S | — |

## 6. The worst moments, drawn

One JPG, `scratchpad/hoops-gather/gather-escape-worst.jpg` (the lane's scratch folder; its absolute path is in the lane's report): five
rows, each eight frames (every second drawn frame, cropped to the hero), from a drawn 1v1 run at 480×270 that reproduced the numbers
above — the pull-up pressed at the floor (62 cm, seated 9 frames later, hand share 0.05), the standing jumper pressed at the floor
(61 cm, a yank), the pump → step-through (the left arm 98° in one frame at +8), the set behind-the-back (the ball hand 120° in one
frame at +21, the gap 1.10 m before and after) and the retreat dribble (the same clip, 132° at +20). The 3v3 strips (the scoop off
the floor bounce, the trap) did not fit the gate hold: not drawn; their numbers are in §2.

## 7. Flags, assumptions, and how to re-run

- **assumption:** the AI's strip / block / hand-up ROLLS were forced off in every trial (the modes' own dev seam, `luck(0.99)`), so a
  drive is not stripped on the bump before its gather. What is measured is the body and the ball, not the outcome; the defender still
  stands, moves and bumps. 1v1 drive trials start from the mode's own `poster()` seam (me 5.2 m out on the line at speed, him 1.3 m off
  the rim): from the check the AI walls a straight drive at arm's length and the hero runs in place at ~5.9 m (22 of 32 drive trials in
  the first run pressed there).
- **assumption:** a shot's flight is cut by the next trial's reset (22 frames after the ball leaves the hand), and free throws are
  missed on purpose, so the 1v1 game never reaches 11; the 3v3 score and clock are put back each trial with its own `forceTie` seam.
  The first run did not, and its trials after the game ended are left out (§1).
- **Shared probe touched (flagged):** `scripts/probes/hoops-gap/drive.mjs` — an `ext` scenario (`EXT=<module>` runs another lane's
  trials on the driver's own clock) and `SETTLE_TRIES` (caps the load's settle loop; default 240 as before). Nothing else in it changed.
- **For the rig's owner:** `hoops-gap/page.js` labels a recorded frame one early (§1), and `NODRAW=1` makes the render watchdog see a
  black frame and re-mount the mode ~6 s in (`core/RenderWatchdog.ts`; this probe answers that one 64×64 read grey under NODRAW only).
- No game file, clip, rig or tuned number was changed. No dependency.

```
# build the rig once (dev bundle), then one hold of the gate lock per set (the static server on :3695 starts and stops inside it)
node scripts/probes/hoops-gap/build.mjs <site> dev --dev
/home/user/wt/gate-run.sh 890 scripts/probes/hoops-gap/run-set.sh <site> <out> \
  "onevone ext EXT=scripts/probes/hoops-gather/trials.mjs SET=control,gathers,finishes,escapes PHASES=top,down,floor,up REPS=2 NODRAW=1 TAG=g" \
  "threevthree ext EXT=scripts/probes/hoops-gather/trials.mjs SET=control,gathers,finishes,escapes,trap PHASES=top,down,floor,up REPS=2 NODRAW=1 TAG=g"
node scripts/probes/hoops-gather/analyze.mjs <out>/gather-*.json            # per trial group, the escapes, the control check
node scripts/probes/hoops-gather/analyze.mjs --pooled <out>/gather-*.json   # §2a / §2b
node scripts/probes/hoops-gather/analyze.mjs --selftest
# the strips (drawn: no NODRAW)
... "onevone ext EXT=scripts/probes/hoops-gather/trials.mjs SET=strips STRIP_KINDS=pullup:floor,set:floor TAG=s"
scripts/probes/hoops-audit/sheet.sh <out.jpg> "<caption>|<frame.jpg>,…" …
```
