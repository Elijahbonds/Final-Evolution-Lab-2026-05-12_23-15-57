# Hoops motion — thirteen-phase pass (2026-09-24)

Owner, right after the dunk motion pass: *"upgrade the basketball suite with the same workflow we just used with the dunk mode
for all other animations and actions."*

Owner, the re-cut the same evening: *"upgrade all movement, dribbling, defensive slide, layup and variants animations, active
hands; get the character to feel aware of the scene, the ball, the rim, the defensive pressure. make and execute a game plan to fix
all moves to look good."* Also: *"the jumpshot looks ugly too."*

## Owner decisions

All were asked with AskUserQuestion. In rounds 2 and 3 the owner took the recommended option on every question.

**Round 1 (2026-09-24, after the dunk pass)**
- **Order:** movement play first, then this pass. Round 2 replaced this with "run in parallel".
- **What looks worst now:** the owner picked all four listed areas plus a write-in.
  - Write-in: *"dunk animations dont look like the ones we just built out in the dunk mode."* The 1v1 and 3v3 game dunks must use the contest's built dunks.
  - Shooting form.
  - Handles and moves.
  - Finishes at the rim.
  - Defence and the AI bodies.
- **Names:** generic and cleanly named. No matching to real players' signature moves (unlike the dunk pass's Kilganon and Jus Fly bar).
- **The show:** big plays only. That means a short replay cut plus a celebration on posterizers, ankle-breakers, game winners and the 3PT money-ball streak. Normal buckets stay quick.
- **Cadence:** commit and push each green phase on `lane/finish-release`, with one deploy at the end.

**Round 2 (2026-09-24 evening, "start that now")**
- **Parallel with movement play.** Hoops motion owns 1v1, 3v3, 3PT, the carnival and the basketball clips. Movement play's P6 (hoops by body) waits until this pass has landed phase 5. Both passes build in isolated worktrees and land gated commits in the lane.
- **Right-handed everywhere:** shots, layups, handles and the carry, on every body. The clips are mirrored, as the dunk pass did.
- **CMU true fps.** Fix the frame rate for every subject (75, 78, 88, 141 and 143 are 60 fps, not 120) and regenerate. Hoops clips then play at real speed. Combat and Free Run clips keep today's feel through a temporary speed pin until their own passes.
- **Thirteen phases, one deploy.**

**Round 3, the re-cut (2026-09-24, about 22:55)**
- **Scope:** the hoops suite now: 1v1, 3v3, 3PT, the carnival, and every body on the court. Combat and boards get their own motion passes next, built the same way.
- **Awareness.** All four are must-haves:
  - The eyes and head track the ball, the rim on the approach and the nearest defender. Defenders watch the handler.
  - Shield under pressure: far hand, off-arm bar, lower stance, back to the pressure, and jab or rip-through reads.
  - Rim-aware finishes: the gather step, take-off foot and finishing hand come from where the rim and the defender are, and contact adjusts them.
  - Active hands on defence: shot-lane hands, hand-check, swipes at a loose dribble, closeout hands high, box-out arms.
- **Order:** feet and ball first, then handles, defensive slides and AI bodies, layups, the jumpshot with 3PT and the carnival, game dunks, awareness A and B, passes/catches/rebounds with 3v3 parity, the show, and finally re-measure and deploy.
- **Source and bar:**
  - Source: the clips already on disk (CMU at true fps, the Meshy clips, authored keys), rebuilt with the dunk pass's smoothing and overlap.
  - Grading: against the owner's 10 tagged reels plus real basketball mechanics, with a 2K-style feel. The eye grades every phase, and the owner reviews ONE reel at the end.
  - No new recordings and no paid pack.

**Standing decisions that bind this pass**
- **Stepping defence (2026-09-23, hoops depth S7).** Author new stepping clips (a sprinting chop-step closeout, faster slides) so planted feet keep up with a 4.2 m/s defender. The owner chose this over capping the defender's speed.
- **Dunk-pass leftovers fold in here (2026-09-24):**
  - the gather's off-arm first-frame pop;
  - the windmill and tomahawk elbow trailing back;
  - hand-on-top varying from run to run.
  - The bus wall-run dunk stays deferred.
- **Audit decisions (2026-09-24):**
  - Lift CAMERA HOLD for the dunk run-up follow camera inside this pass.
  - The eye re-grades every pass.
  - No paid pack.
  - Fast-forward `main` to the lane after every green pass.
  - No untextured models (owner rule, 2026-09-18).

## The bar, the instrument, the evidence

- **The bar** is `docs/SPEC-HOOPS-MOTION-DECODE.md`, written in phase 2.
- **The instrument** is `scripts/probes/_hoops-motion-probe.mts`, with `_hoops-motion-page.js` for the in-page half and `_hoops-motion-compare.mts` for before/after tables.
  - It records the final drawn pose of every body on every rendered frame of a real action in 1v1, 3v3, 3PT and the carnival.
  - It measures with the dunk probe's metric definitions plus the hoops ones: foot slide while planted, which hand holds the ball (by rig bone and by the side it is drawn on), release against the feet apex, and clip name against what the body visibly did.
  - It replays each action frozen for side and front three-quarter sheets.
- **Every measurement runs on a virtual clock.** `performance.now`, `requestAnimationFrame`, `setTimeout` and `setInterval` are replaced in the page, and each rendered frame advances the game by exactly 16.667 ms. `Math.random` is seeded by take name.
  - Machine load changes how long a run takes, not what it measures.
  - 1v1 offence and 3PT reproduce exactly, idle or at 2× wall-time load.
  - Defence and AI runs can still diverge, so their gates use the mean of at least 5 attempts.
- **Evidence** goes to `~/Claude/outbox/finish-release/hoopsmotion/<tag>/`. Phase 1's is in `p1-baseline/`: `BASELINE.md` has every number, and `README.md` explains how to re-run it.

**Sources cited below**
- **MAP** = `hoopsmotion/MAP.md`, taken at 2ccf696. `S#` are its 1v1 seams, `gap #` its offence gaps, `D-gap #` its defence gaps.
- **V:clips, V:1v1, V:3v3, V:3pt, V:tooling, V:decode** = phase 1's re-verification of each MAP section at 71ea8f3. `C#` are corrections, and `N#` or a letter are new findings.
- **AUD** = phase 1's adversarial audit of the probe and its numbers.
- **B:action** = the baseline recordings in `p1-baseline/<action>/`.
- **LEDGER §4** = `audit-2026-09-24/OPEN-WORK-LEDGER.md`, section 4 "Hoops motion".
- **RORK n** = `RORK-ADDENDUM.md`, row n.
- **GP** = `hoopsmotion/GAME-PLAN.md`.
- File:line references are at 71ea8f3. The hotfix and movement play have moved lines since, so find code by symbol.

## Baseline

Phase 1 ran at lane 71ea8f3 and was re-measured by the audit: 81 actions and 382 recordings, mostly 3–9 attempts each. Each family figure is the mean of its actions' means.

| family (actions / recordings) | pops | severe (≥ 3000°/s) | whips | wrong-way elbow frames | locked-elbow frames | foot slide p90 (cm) | skating frames | SPARC |
|---|---|---|---|---|---|---|---|---|
| jumpers (7 / 30) | 9.4 | 1.07 | 6.1 | 5.4 | 11.2 | 5.6 | 14.2 | −3.82 |
| 3PT (4 / 14) | 8.5 | 1.82 | 11.6 | 1.5 | 23.1 | 4.7 | 5.8 | −3.11 |
| layups, floaters, hooks (7 / 42) | 11.3 | 1.03 | 8.2 | 3.1 | 12.0 | 7.6 | 13.9 | −3.68 |
| post moves (5 / 28) | 15.7 | 2.64 | 20.3 | 18.8 | 14.4 | 8.6 | 9.8 | −3.68 |
| game dunks (4 / 15) | 16.4 | 4.24 | 22.9 | 19.2 | 35.5 | 11.7 | 17.1 | −3.64 |
| handles and drives (12 / 65) | 9.2 | 0.38 | 6.9 | 1.6 | 2.2 | 8.7 | 15.4 | −3.46 |
| passes, catches (2 / 10) | 5.2 | 1.20 | 6.6 | 10.3 | 0 | 7.0 | 10.8 | −2.38 |
| defence (22 / 103) | 4.3 | 0.44 | 2.7 | 24.5 | 3.5 | 11.3 | 13.4 | −2.63 |
| rebounds, box-out (9 / 40) | 3.4 | 0.02 | 2.3 | 10.7 | 0 | 6.8 | 14.0 | −3.18 |
| idles, reactions (6 / 25) | 5.3 | 0.36 | 4.3 | 13.5 | 0.7 | 5.2 | 4.9 | −2.40 |
| carnival (3 / 10) | 6.0 | 2.50 | 5.8 | 2.1 | 22.0 | 5.7 | 0.3 | −2.70 |
| **all 81** | **7.6** | **0.97** | **6.9** | **12.3** | **7.9** | **8.4** | **12.3** | **−3.12** |
| hero (50) / AI (31) | 8.6 / 6.0 | 1.20 / 0.60 | 8.6 / 4.1 | 8.1 / 19.2 | 9.2 / 5.9 | 7.6 / 9.6 | 12.1 / 12.6 | −3.29 / −2.85 |

**The hoops columns (pooled over recordings):**

| measure | value |
|---|---|
| both hand bones motionless | 381 of 382 windows |
| hero ball frames drawn on the athlete's right, outside the dunks | 16% of held frames, 1.2% of dribble frames |
| hero ball frames drawn right, dunks | 85% |
| hero releases drawn right | 25 of 97, exactly the `_left`-named clips and the dunks |
| hero release against the feet apex (mean / median) | jumpers +98 / +117 ms; finishes +80 / +158 ms; post +164 / +133 ms; 3PT +267 ms |
| feet off the floor at the top | hero jumpers 0.27 m; hero finishes 0.31 m; 3PT 0.08 m; AI layups 0.04 m; 1v1 rival jumper 0.02–0.05 m |
| catalogue actions the game has no code path for | 5: `ai_1v1_rebound`, `ai_1v1_celebrate`, `hero_3v3_catch`, `ai_3v3_pass`, `ai_3v3_mate_shot` |

**How to read these numbers**
- **SPARC is reported, not gated.** More real movement in a window reads as more negative; the dunk pass went −3.44 → −3.60 while every other number improved.
- **"Ball against the palm" is uninformative.** It is a constant 0.15 m while the ball is attached, so phase 2a replaces it.
- **The audit changed the base numbers.**
  - It fixed a clock that started from wall time: a timer lasting a whole number of frames fired a frame late about 34% of the time.
  - It fixed a wrist-still formula that did not normalise quaternions.
  - It cut windows at possession resets.
  - Mean per action, `base` → `base-audit`: pops 8.42 → 7.77, severe 1.07 → 0.93.
- **The live re-recordings (AUD) confirm the defects and show the jumper's timing seam.** A late release wraps the looped `jumpshot` back to frame 0: 12 pops in one frame at +467 ms, Hips 5.5k°/s, both UpLegs about 6k°/s.

## What the sheets and the traces show

1. **Wrong hand everywhere.**
   - Rig RightHand draws on the athlete's left in every mode, on every body. The root yaw matches the feet's facing and a front sheet confirms it (AUD).
   - Every hoops ball attach is rig `RightHand`: 1v1:597/799/1573/2558/2664, 3v3:497/1600/2235/2327/3160, 3PT:384/614/871/963 (V:decode §4).
   - The side pickers reason in the root's +x (`bodyRight`, `HoopsMoves.ts:164`), but the clips are built on rig sides. So a layup from the right finishes with the inside hand, and a hook "away from him" shoots with the hand nearer him (V:1v1 N1, V:clips B).
   - The ball hand is a toggle (`switchHand`), not the side the move ends on (V:1v1 N2). The carry's side survives the possession (S29).
   - The 1v1 rival is the only right-handed body.
2. **The hands never move.** Both hand bones hold one rotation in 381 of 382 windows. No clip keys a Hand bone, so the "wrist snaps" comments (1v1:2838, 3PT:1053) describe nothing (AUD 2, V:3pt N4).
3. **Handles don't move the ball.**
   - The R-stick cross, between, behind, hesi and in-and-out keep the ball 24–28 cm to the drawn left in every attempt. It never goes under the legs or behind the hips, and the carry IK paints over the move clip (B:hero_1v1_cross/between/behind).
   - The only hand switches (the left-stick crossover, the snatchback, the rival's crossover) teleport the ball about 0.52 m in one frame (`ballCarry.ts:230-237`). On the rival the hand jumps 0.22–0.29 m and the arm pops at 9.6k°/s (B:ai_1v1_cross).
4. **Feet slide instead of stepping.**
   - Planted-foot slide p90 is 8.4 cm on average, with 12.3 skating frames per window.
   - At the handle jog the planted foot slides 2.0–2.6 m over 2.5 m of travel. The 3PT jog slides 10.6 cm p90.
   - The causes:
     - 16 of the 26 captures come from CMU subject 78. It is really 60 fps, but its header says 120, so they play 1.5–4× real speed. The stride references were tuned on those sped-up clips (V:clips A, V:decode A).
     - AI speed is a unit vector × 3.6/3.8/4.2 m/s with no acceleration (MAP D-gap 1).
     - `run_forward` gives every ball-less runner a dribbling capture (V:1v1 N6).
5. **The jumper leaves from the chest, after the top.**
   - 1v1 hero jumpers: the ball hand peaks at 1.24–1.41 m against a head at 1.41–1.76 m (20 of 20). The release comes 98 ms after the feet apex on average.
   - The capture's own defects:
     - Its hands freeze from 0.75 to 0.90 s, caused by the `extend` override in `opponent-clips.json` (V:clips C3).
     - Its hips twist 94° (N4).
     - The follow-through's first key jumps 0.51 m.
     - The gather → rise seam drops the ball 0.44 m and snaps the hips 55° (MAP gap 4).
   - Step-back: the right foot jumps 0.29–0.47 m in one frame at +217 ms, in 5 of 5. That is 21 pops and 4.8 severe.
   - The fade does not fade: 1% of its travel is sideways.
   - The 1v1 rival's hands sit at 1.02/1.04 m on every frame. He jumps 0.02–0.05 m, and the ball leaves from `dunk_charge_gather` (S12).
6. **3PT is flat-footed and double-weighted.**
   - `idle_stand` stays at full weight under the shot and the follow-through for 24 + 36 frames (V:3pt N1, the crossFade re-entrancy), so the ball is pushed from the chest.
   - The feet clear at most 0.14 m.
   - A make's celebration drops the arms 0.5–0.8 m in one frame into the next gather (6–10.7k°/s).
   - The shot plays at about 1.95× real speed.
7. **Finishes don't finish.**
   - The ball is 0.2–0.63 m below the head at release on every finger roll, floater, hook, scoop, post hook and 3v3 layup.
   - AI layups never leave the floor (10 of 10).
   - In 14 of 61 hero finishes, the whole body moves 15 cm or less in the 800 ms after the release.
   - Six right-hand finishes take off from the wrong foot (`basketball.ts:459,547,569,695,725,740`).
   - The euro step has no steps: the root slides 43–63% sideways under a still body.
   - The drop step snaps a leg at about 8000°/s (27 pops, 5.2 severe).
   - In 3 of 7 3v3 layups the ball leaves the hand on the gather's first frame.
8. **Game dunks are not the contest's.**
   - The hero's game dunk is a stiff board: legs straight and together, one hand 0.10–0.23 m from the ring. Per dunk: 18 pops, 67 locked-elbow frames and 25 wrong-way elbow frames. The contest's phase 13 reached 4.5 pops and 33 locked-elbow frames.
   - All 9 hero dunks sampled were DOUBLE CLUTCH.
   - The AI 3v3 POWER SLAM never reaches the rim: the hand gets to 2.24–2.8 m, and the ball is thrown in from 0.34–0.89 m off the ring.
   - The 360, PAUSIN', 360 WINDMILL and LOST & FOUND never turn, and the transfer dunks never move the ball (V:3v3 C2, N7).
9. **Defence thrashes and skates.**
   - The hero's clips change about every 200 ms (5 in 1.2 s), with 2–6 severe upper-arm rolls of 8–10k°/s at the switches.
   - The backpedal pitches the body onto a knee, and the closeout snaps it upright.
   - Planted feet skate 12–22 cm per frame.
   - The hands don't act: `hand_up` raises no hand (it ends −0.12 to +0.02 m relative to the head), the steal has no poke, and the 3v3 block leaves the floor by only 0.08–0.17 m.
   - Wrong-way elbow frames average 24.5 per defence window (32.3 for the AI).
10. **AI arms never show [AI-ARMS].**
    - Every AI body is the Meshy `Body.001`. Its skin barely weights the hands and forearms: summed weights RightHand 13, LeftHand 10, RightForeArm 111 and LeftForeArm 53, against the kit hero's 1796, 1800, 295 and 291.
    - The skeleton puts a hand 0.39 m above the head while the drawn arm hangs at the side.
11. **Nobody passes, catches, rebounds or boxes out.** No clips for any of these exist.
    - Rebounds are palm warps (0.7–1.4 m) or teleports: 1v1 defensive boards send both bodies to the check, and in 3v3 the body jumps 4.3 m and the ball 5.7–6.0 m, even under "OFFENSIVE BOARD".
    - L2 box-out freezes the stance for 1.3–1.9 s.
    - Passes leave from the dribble point near the floor.
    - The catch warps the ball 0.54–0.79 m into the palm, with a 4.0–5.3k°/s arm snap.
    - Mates never pass back, and foes never pass.
12. **The clip names don't match what plays.**
    - `bball_hesi` also plays the jab, the shimmy and the rival's step-back.
    - The in-and-out capture is a two-hand rip.
    - The rival's jumper tell is `dunk_charge_gather`.
    - Every make plays the dunk capture's crouched one-arm punch.
    - Posterized players play the karate knockdown, floor and get-up.
    - `contact_react` is every reaction (20 call sites in 1v1, 18 in 3v3).
    - The carnival loser plays a fighter's flinch.
13. **Bodies overlap.** 1v1 bodies stand at the 0.76 m root-to-root standoff and are drawn inside each other on drives, posts, handles and defence. The 3v3 foes are identical copies that intersect each other.
14. **The seams make the pops, again.**
    - One-shot captures start and end at a baked-in hip yaw: pivot +83°, spin +88 → −110°, jumpshot −46 → +48°, layup gather −33 → +75°. Each fades in over 3–6 frames (V:1v1 N4).
    - `freezeAtEnd` parked the authored clip after a capture had played (S1).
    - A left-stick crossover plays two beats in one frame (S2).
    - The pick-up warps the ball up to 0.86 m (S5).
    - The loops break velocity where they join (`closeLoop` blends only the last 20%; V:tooling).
15. **The stance forgets itself.** The knee bend is 66.8° on a fresh page, 51.9° after one shot, and 39–42° mid-session. This is game state, not the clock. Every group's numbers were taken mid-session.
16. **The carnival.**
    - At 71ea8f3, Slam Rush had no ball, looped a one-way gather, and launched a 0.12 m hop with the arms out in a T (42 locked-elbow frames).
    - Hotfix 1/6 made the gather one-way and put the textured ball in the rig's RightHand, which draws on the left.
    - Party-goer b0 floats about 0.5 m in the air, seated.

## The phases (the owner's re-cut order)

| # | Theme | What changes | Gate (headline; each phase section has the full list) |
|---|---|---|---|
| 1 | Instrument + baseline | the probe on a virtual clock, 81 actions, the audit, this plan | done (this commit) |
| 2 | Rebase, instrument II, true fps, the decode | `base2` at the rebased tip; the attempt runners folded into the probe plus 14 new metrics; CMU at true fps with the non-hoops speed pins; `SPEC-HOOPS-MOTION-DECODE.md` from the 10 reels and real mechanics | gravity fit 9.8 ± 1.5 m/s² on every hoops subject; subject-78 clips 0.9–1.15× real (base 1.55–4.0×); pinned clips' durations unchanged; every catalogue action decoded |
| 3 | Feet and ball | right-handed on screen (mirror + one visual-side helper); a carry on every body with a stride-locked dribble and a real hand switch; FootPlant, acceleration and a ball-less run; the dunk tooling ported (smoothing, anatomical poles, LimbDrag, WristLayer, hinged arm); one owner per body | hero ball drawn right ≥ 95% (base 16% held / 1.2% dribble); slide p90 ≤ 3 cm on every loop (base 8.4); both hands move on every ball action (base: frozen in 381 of 382 windows); wrong-way elbow ≤ 1 per window (base 12.3) |
| 4 | Handles and moves | real hand-offs; the move owns the arm, not the carry IK; re-cut captures; spin, hesi, in-and-out, step-back, snatch, PAUSIN' | ball changes sides on ≥ 95% of crossing moves (base 0 / 25); ball ≤ 0.15 m per frame (base 0.52 m jump); ≤ 4 pops, 0 severe per handle |
| 5 | Defensive slides + AI bodies | stepping slides and closeout for 4.2 m/s; AI acceleration; AI arms drawn; no defence thrash; no body inside another | AI root acceleration p99 ≤ 34 m/s² (base about 216); defence slide p90 ≤ 3 cm (base 11.3); AI drawn hand ≤ 0.05 m off its bone |
| 6 | Layups and variants | take-off foot, hop and stride, ball over the head, AI layups jump, each variant readable; post finishes | ball ≥ +0.10 m over the head at release (base −0.06); AI feet ≥ 0.25 m (base 0.04); right foot / hand pairing 100% |
| 7 | The jumpshot, 3PT, carnival | one jumper built like the dunks; 3PT at real speed with one owner; Slam Rush a real dunk | release −60…+20 ms of the feet apex (base +98); ball ≥ +0.10 m over the head; wrist flex ≥ 45°; 3PT stacked frames 0 (base 60) |
| 8 | Game dunks = contest dunks | 1v1 and 3v3 play the contest's dunks (gather, carry, DunkSpin, hand-offs, arcHeight, RimFlush, hang, land); the dunk-pass leftovers; Dunk Duel | ≤ 5 pops, ≤ 35 locked-elbow frames per dunk (base 18.2 / 66.8); ball ≤ 0.2 m from the ring's centre; 360s turn 330–390° |
| 9 | Awareness A: eyes/head + shield | a LookAt layer on every body; protecting the ball under pressure | head error ≤ 20° p90; ball on the far side ≥ 85% of pressured frames |
| 10 | Awareness B: rim-aware finishes + active hands | finish choice from rim and defender; contact reactions; the defence hands act; block timing | outside hand ≥ 90% of contested finishes; contest hand ≥ +0.20 m at the release; block apex ±80 ms of the ball |
| 11 | Passes, catches, rebounds, box-outs + 3v3 parity | the first pass, catch, rebound, tip and chin clips; no warps or teleports; box-out; 3v3 caught up with 1v1 | the 4 no-code-path actions found (base 0); catch jump ≤ 0.12 m (base 0.54–0.79); rebound feet ≥ 0.3 m |
| 12 | The show on big plays | replay cut + celebration on posterizers, ankle-breakers, game winners and the 3PT money-ball streak; celebrations for rivals and mates; no real names | a cut ≤ 2.5 s on 100% of big plays; ordinary buckets ±0.2 s; 0 real names |
| 13 | Re-measure + the reel + deploy | every number against `base2`; the eye grades the reel; the owner reviews it; ONE deploy | catalogue pops ≤ 3.5 per action (base 7.6), severe ≤ 0.25 (0.97), slide p90 ≤ 3 cm (8.4); every phase gate true at one tip |

## Phase by phase

Each phase lists what it changes and why (with the source), then its gate. A gate is written as base → target.
- **Base** is the audited phase 1 number.
- **`base2`** is the same catalogue re-taken in 2a, on the rebased tip with the fixed probe. Where `base2` differs from phase 1 by more than the spread between attempts, both numbers go in the phase's commit message and the absolute target stands.
  - **Measured in 2a: every delta is taken against `base2`, never against phase 1.** Phase 1's figures mix clocks. Its 382 recordings (the family table above, and `base-audit`) were taken before the audit fixed the clock and only re-measured after it. The audit's own 17 live re-recordings on the fixed clock, at the same tip 71ea8f3 (`audit-rerun`), read higher on the 16 actions they share with `base2`: pops 7.81 → 12.06, severe 1.06 → 2.50, whips 7.00 → 12.12, slide p90 7.79 → 9.16 cm. So a phase 1 → `base2` difference is not a measure of what the tip changed (`hoopsmotion/p2/README.md`). The phase 1 figures written as "base" in the gates below are context; the absolute targets stand.
- **Every phase is also compared with the previous phase's tag.**
- **A phase may not make an earlier gate worse.**

### 1. Instrument + baseline (done, this commit)

- **The probe** (`_hoops-motion-probe.mts`, `_hoops-motion-page.js`) and the compare tool (`_hoops-motion-compare.mts`).
  - It uses the dunk probe's metric definitions, plus the hoops metrics.
  - It records every body on the virtual clock and drives in-page: the agent bridge for 1v1 and 3v3, `InputBus.emit` for the right stick, keyboard events for 3PT and the carnival.
- **The baseline:** 81 actions, 382 recordings, and the audit's fixes.
- **The MAP re-verified at 71ea8f3.** No motion code changed between 2ccf696 and 71ea8f3; only lines moved.
- **The attempts runners stay uncommitted** until 2a folds them in: `_hoops-motion-attempts{,-finish,-handles,-dri}.mts` and `-table.py`.

### 2. Rebase, instrument II, true fps, the decode

**2a. Rebase and instrument II**
- **Rebase the hoops worktree onto the lane tip** (110560be when this was written). The hotfix landed after the baseline:
  - cba27d50: the `freezeAtEnd` deferred freeze and `beatOwner` `holdEnd`; a 3v3 miss is now a live board and a possession change ends it; the Slam Rush ball and its one-way gather.
  - 1637ee2b: the `poseClip` elbow-fold guard, `kneePoles`, and `mirrorKey` carrying `kneePoles`.
  - 220a87b1: `slamPress`, and reduced motion in `gameFeel`.
  - All of these change the numbers for the 3v3 holds, Slam Rush and the 3PT set.
- **Fold the four attempts runners into the probe** as `REPS` with named repeats, using the fixed `measure()` and anchors (AUD "still open"). Delete the copies.
- **New metrics:**
  1. **Ball path:** the most the ball moves in one frame while held, dribbled or caught. This catches warps and snaps.
  2. **Dribble contact:** the dribbling palm's distance to the ball at the top of each bounce.
  3. **Hip-yaw seam:** the largest change in hips yaw inside one frame at a clip hand-over.
  4. **Cadence:** steps per second and stride length from foot contacts, against root speed.
  5. **Finishing side:** the release hand relative to the rim line and the nearest defender.
  6. **Guide hand:** its gap to the ball within 50 ms of the release.
  7. **Wrist flex:** the Hand bone's rotation range through a release. It is readable now that the formula is fixed.
  8. **Overlap:** frames where two bodies' torso capsules interpenetrate.
  9. **AI-ARMS:** the drawn hand (skinned-vertex centroid) against the hand bone.
  10. **Look:** the head's forward direction against the look target.
  11. **Shield:** which side of the body the ball is on relative to the defender, and whether the off forearm is between them.
  12. **Catch reach:** the receiver's hand-to-ball distance 100 ms before the ball arrives.
  13. **Celebration visibility:** hand travel over the celebration window.
  14. **Pacing:** make-to-next-check time.
- **Swap the ball metric.** "Ball against the palm" goes: it is constant while the ball is attached.
- **Log animation-group weights every frame** around 3PT perfect and money-ball makes. This confirms or closes the `CharacterAnimator.crossFade` re-entrancy after the hotfix (V:3pt N1; LEDGER §4 asks for it in phase 1's measurement step).
- **Dunk control.**
  - Normalise the quaternions in `_dunk-motion-probe.mts` (the same wrist-still artefact, AUD 2).
  - Put it on the same virtual clock; its phase 13 numbers were taken on the wall clock (V:tooling).
  - Re-run the 21 contest dunks as `dunkmotion/p13-vclock`, the control for phase 8.
- **Re-take the whole catalogue as `base2`.** Take at least 5 attempts per action where the game allows, and always at least 5 for defence and the AI.
- **Add driver variants** for more than one dunk type (B: 9 of 9 were DOUBLE CLUTCH) and for a 3v3 layup outside traffic.

**2b. CMU at true fps**
- **Per-subject true fps.** `scripts/mocap/sources.mts:65` returns `fps: 1 / bvh.frameTime`. Replace it with a per-subject table: 75, 78, 88, 141 and 143 are 60 fps (LEDGER §4; V:clips A; memory: jumps at the stated rate fall at 30–42 m/s²).
  - Confirm each subject with the gravity fit that `lib/pose/synth.test.ts:262` already uses: gravity fitted to the hips over a jump or step flight must be about 9.8 m/s².
  - Check subjects 06 and 124 the same way before trusting them.
- **Convert the windows.** Every window of a 60 fps subject in `opponent-clips.json` was chosen in the header's seconds. Convert each to true seconds so the same frames are cut, then regenerate with `gen-opponent-clips.mts`.
  - Hoops clips take their real span as `duration`: real speed at rate 1.
  - One-shots that the plan re-paces won't slow down from the fps fix alone (V:clips trap 1): pivot 4.0×, pump fake 3.86×, step-through 3.6×, spin 2.5×, feint 2.55×. Their windows are re-cut in phases 4, 6 and 7.
- **Recalibrate the strides.** Re-derive `HOOPS_STRIDE_CAPTURE` (`core/StrideMatch.ts:60`; run 3.6, slide 2.0, walk 0.72, jog 2.8) from the regenerated clips' own measured strides.
  - At true speed, a 4.6 m/s sprint on the 78_06 run would need rate 1.9, above `RATE_MAX` 1.85 (`:83`). Split the run reference into jog, run and sprint rather than raising the cap blindly (V:clips trap 2).
- **Temporary speed pins.** These non-hoops clips keep today's played duration exactly, marked `TEMP` until the combat and boards passes:
  - `football_mc_run` (78_12)
  - `karate_mc_uppercut` (141_24)
  - `trick_jump_spin_kick` (88_06)
  - `trick_cartwheel` (88_07)
  - `cap_escape` (88_08)
  - `pk_backflip` (88_01)
  - `pk_360_jump` (75_09)
  - Subject 143 is used only by `scripts/body/synth-streams.mts`, which already says fps 60.
- **Stale comments to fix:** `opponentMotion.ts:53-56` still cites 06_15 (the clip is 124_05), and the file header says captures are opponent-only (V:clips 8, V:tooling).

**2c. The decode: `docs/SPEC-HOOPS-MOTION-DECODE.md`**
- **Format:** one row per catalogue action: (a) real mechanics, (b) what the code does, (c) the gap, (d) the measurable target that later gates use. The format is the MAP's.
- **The owner's 10 tagged reels** (RORK 18):
  - Read with `git -C ~/rork-final-evolution-lab show 13cb4c2:SourceVideos/Instagram/basketball/<file>` into the scratchpad only. Never copy them into `public/`, and never commit them.
  - Grab frames the way the dunk pass did (a scratch canvas or ffmpeg).
  - Tagged movements come from `video_metadata.json`. Nothing from that metadata goes on a card; "World Champion 2017" must be confirmed first.

  | reel | length | what it grades |
  |---|---|---|
  | 10 full-court game: crossover, BTB, euro, layups | 59.7 s | phases 4, 6, 7 (marked critical) |
  | 07 lateral-shuffle dribble, drive, dunk, layup, defensive stance | 33.0 s | phases 3, 4, 5, 6 |
  | 06 dribble, jumper, drive, two-hand, reverse, BTB pass, windmill | 8.8 s | phases 7, 8, 11 |
  | 08 casual game: dribbling, passing, shooting, dunking | 31.9 s | phases 7, 11 |
  | 04 reverse over 3 people, chest-bump celebration | 13.7 s | phases 8, 12 (marked critical) |
  | 01 session: reverse, alley-oop, one-hand, two-hand | 46.0 s | phase 8 |
  | 02 running one-hand dunk | 15.2 s | phase 8 (the approach and plant) |
  | 03 self alley-oop dunks | 21.9 s | phases 8, 11 (toss and catch) |
  | 09 slams + ball tricks | 51.3 s | phases 4, 8 |
  | 05 compilation, several players | 3.4 s | phase 8 |

- **Real-basketball references,** cited in the spec (web search allowed, as in the hoops-depth decode). Each target is written in a form the probe can measure:
  - **Jumper:** dip, set point above the forehead, release at or just before the top, guide hand off, wrist snap and hold.
  - **Layups:** the long penultimate step; take-off foot opposite the finishing hand; knee drive.
  - **Hook:** shoulder-on to the rim.
  - **Hesi:** chest and eyes rise, stride pauses, then explodes low.
  - **Crossover, between the legs, behind the back:** where the ball crosses (low and wide, through a split stance, around the hips).
  - **Spin:** 180–270° with a hand change.
  - **Euro:** two real steps.
  - **Slides:** feet never cross; push-step cadence at speed.
  - **Closeout:** sprint, then chop steps, hand high.
  - **Box-out:** hit, seal, wide base, arms out, then pursue.
  - **Rebound:** two hands, then chin it.
  - **Passes:** chest, bounce and overhead, with a step.
  - **Catch:** hands as a target, then give.
  - **Celebrations:** from the owner's reel 04 and generic ones.
- **2K-feel notes** go beside the mechanics (owner bar: 2K-style). Nothing is copied from 2K; the bar is how it reads.

**Gate**
- **Determinism:** two idle runs and one `HOG=60` run of `1v1-off` and `3pt` are identical in take lengths, frames and anchors, with SPARC within 0.04. Defence spreads are reported.
  - *Measured in 2a (`hoopsmotion/p2/det/`): FAILED as written.* No idle pair exists: A, B and C all ran while other probe browsers loaded the machine (C also with `HOG=60`). `DET=1` prints DETERMINISM FAIL (6) for A vs B, (7) for A vs C and (1) for B vs C. Take lengths and frames agree in every pair (29/29 1v1-off, 3/3 3PT); every failure is an AI window in 1v1-off (anchors 32/34 in A vs B, SPARC up to 0.30).
  - The hero and 3PT recordings agree in anchors, frame counts and window metrics in all three pairs, but the recordings are not identical: the recorded hero poses differ by up to 1.16 m, mostly on frames past the scored window.
  - The review could not record an idle pair either: other agents' dev servers and probes shared the machine throughout. Until one exists, "1v1 offence and 3PT reproduce exactly" means the same takes, anchors, frames and window metrics under load; the AI windows in 1v1-off do not reproduce.
- **`base2`:** every catalogue action that has a code path is recorded (76 of 81 catalogue actions plus the 5 supplemental windows).
  - *Measured in 2a:* 75 of 81 plus 5 of 5. `hero_3v3_def_steal` gave no hero steal in 74 takes at a37a90ce: the hotfix's poke gate takes a poke only from an unstunned hero within 1.6 m of a holder whose ball is in his hand.
- **Gravity fit** on the hips flight of every capture subject a hoops clip uses: 9.8 ± 1.5 m/s² (subject 78 at the stated rate: 30–42).
- **Speed:** every subject-78 `bball_mc_*` clip plays at 0.9–1.15× real speed at rate 1 (base 1.55–4.0×). The re-paced one-shots are listed with their real/played ratio for phases 4, 6 and 7.
- **Pinned durations:** the seven pinned non-hoops clips play the same duration as before, to the millisecond (a unit test).
- **The spec** has a row with a measurable target for every catalogue action, plus the 5 no-code-path actions. Each row cites a reel timestamp or a named reference.
- **The dunk control** exists (`p13-vclock`).
- **Build:** `tsc` 0 errors, the full `vitest` green, the count in the commit.

### 3. Feet and ball

**Right-handed on screen** (owner round 2; V:1v1 N1/N2; V:3v3 "what matters" 1; MAP tooling §3, recipe 5)
- Mirror the `^bball_` groups in place after `installOpponentMotion`, the way `groupMirror` did the dunks. It is idempotent through `felMirrored` (`groupMirror.ts:88-91`). Every body gets them.
- The ball starts in rig `LeftHand` with `felPalmMirrorLeft`, so it no longer sits "through the wrist" (S8). Replace every hard-coded `'RightHand'` listed above.
- **One visual-side helper** answers "which hand is on the athlete's right" and "which hand is away from X". `pickLayupSide`, `pickHookSide`, `reverseSide`, `doMove`'s "ends away from him" (1v1:2947-2950) and the rival's `bodySide` (`BasketballCore.ts:1249-1253`) all go through it.
- The carry's side resets every possession, including `giveBall`, `giveBallTo` and the catch (S29, V:3v3 N2).
- `mirrorKey` (`basketball.ts:79-84`) carries `handsRel`, `hold`, `feet` and `kneePoles`. Today the left spin layup loses its two-hand gather (V:clips E).

**A carry on every body**
- The 3v3 foe team and the rival bounce the ball; the 3v3 foes have no carry today (V:clips).
- The dribble locks to the stride, as DunkMode's does. Today the 3v3 carry isn't stride-locked, and the ball floats 0.4 m from the hand.
- The dribble hand meets the ball at the top of the bounce. Today the hand stays at the waist while the ball bounces between ankle and thigh (B:hero_1v1_idle).
- **The hand switch is a path, not a teleport.** `switchHand` resets `phase = 0` and flips the side, so the ball jumps about 0.52 m (S3, `ballCarry.ts:230-237`). The new switch carries the ball through the move's crossing point. Phase 4 hangs every move on it.
- **The pick-up and park are a gather, not a warp** (S5: up to 0.86 m).
- **3PT's `carryApply`** is its own two-hand IK (`ThreePointMode.ts:307`), so ballCarry fixes never reach it. It moves onto the shared carry (V:tooling).

**Feet**
- **FootPlanting and FootPlant on every body.** 3v3 has none today (V:3v3).
- **The AI moves with acceleration.** It uses the hero's CourtMovement model (accel 26 / decel 34 m/s²) and honours its `sprint` flag. Today it is unit steer × 3.6/3.8/4.2 m/s, a one-frame step of about 216 m/s² (MAP D-gap 1, V:3v3 N9, LEDGER §4).
- **The 3v3 rival's drive loop** runs at `RATE_MIN` 0.55 because its `speedMps` is 0, while he covers 2–5.4 m/s (V:3v3 C7). Its velocity is zeroed at 3v3:1448 (LEDGER §4).
- **A ball-less runner runs.** `run_forward` resolves to the dribbling `bball_mc_drive`, so every 3v3 mate and foe off the ball dribbles air (V:1v1 N6, B:ai_3v3_offball 5/5). `bball_mc_run` (78_12) is built but never requested.
- **The stance holds.** Find what drifts the knee bend 66.8° → 47.4° over a session. `HoopsPosture` state is the likely place; it is not a fatigue model (B handles §4, AUD).
- **The 3v3 hero after a mate's make.** The `shooting` flag never clears (V:3v3 C6), so he loops `bball_shoot_jumper` while sliding on defence and is slewed toward the rim.
- **The idle→drive dwell bypass** (71e9688) is measured first. It conflicts with `basketball-anim-tests.ts:102-111` (LEDGER §4).

**The dunk pass's tooling, ported** (LEDGER §4; MAP tooling recipe 2–4)
- **Smoothing.** `smoothByDefault` (`smoothKeys.ts:145-149`) covers the authored `bball_*` clips with joint-space cubic interpolation, with `hold: true` on the accents. The core `strafe`, `idle_stand` and `walk` clips are included.
  - Loops get a periodic option: today `closeLoop` blends only the last 20%, and the end slopes aren't periodic.
  - One-shot captures are A/B tested at prefilter 0 and 1.
  - `?heroMocap=0` A/Bs the captures against the authored clips.
- **Anatomical elbow poles** for the overhead families: floater, hook, reverse, finger roll, Mikan, up-and-under, spin and hang layups, fadeaway, block reach, hand up, and the late follow-through. That is about 20 live clips with their `_left` versions (V:tooling 2, V:clips 10).
  - The captured layup's `extend` pole `[0.85, 0.2, −0.35]` goes too (V:clips C).
  - The low handle and gather clips stay as they are. In the dunk pass, re-rolling the gathers made 84 forearm pops.
- **Mountable motion layers.** Lift LimbDrag and WristLayer out of DunkMode (`DunkMode.ts:1008-1009`; the hinged arm at `:1020-1028`) into one module and mount them per body:
  - 1v1 player and rival;
  - 3v3 inside `spawnBody`;
  - the 3PT player.
- **The layers' rules:**
  - They register insert-first and scale dt by `animationTimeScale`.
  - They drag the legs only when airborne and skip the ball arm around a release.
  - They add a side lean. The captures have none: roll is 0 in all 706 keys (V:clips F).
  - The hoops wrist cocks at the set, snaps for 0.18 s after the release, then holds its follow-through flex. It pushes on the dribble from `carry.phase`.
  - `?nomotion=1` A/Bs the layers.
- **The rim reach** (`rimReach.ts:58`) gets the anatomical pole, the elbow swing limit and the hinge. Today it picks the elbow side by bone name, so on the mirrored rig the elbow points across the chest (S26).
- **The hinged arm** (`hingeArmApply`) is the last writer on every hoops body, and on Dunk Duel and 3PT. Delete `limitArmTwist` and its stale comment (`HandIK.ts:113-125`; LEDGER §4).
- **Posture layer ordering.** It registers after FootPlanting and rewrites Hips yaw. Any new pose with `hipYawKeep` below 1 would swing planted feet (V:tooling). Keep it at 1, or plant after it.

**One owner per body** (the animator-level seams)
- **Crossfade re-entrancy.** A `prev.stop()` inside a crossfade can strand a new clip at weight 0 while the old one plays untracked (V:3pt N1). Close it in `CharacterAnimator`, not in the modes, if 2a's weight log still shows it.
- **Raw `onEnd` chains** in 3PT (`ThreePointMode.ts:583,981,1053`) move onto BeatOwner.
- **S1:** `freezeAtEnd` resolves the requested name, so it parks the authored clip after a capture has played. Wrap it through `opponentMotion` (`opponentMotion.ts:83-89`). Re-check after the hotfix.
- **S2:** a left-stick crossover plays two beats in one frame, from the tree at 1305 and the move picker at 1399-1413. One source decides.
- **N4, baked hip yaw.** The generator re-roots each one-shot capture to zero hip yaw at its start (pivot +83°, spin +88°, jumpshot −46°, layup gather −33°, feint ±41°, step-through +27°, hesi +24°, crossover ±20°).
- **S30:** two leg-IK writers during a plant. One wins.

**Gate**
- **Right hand:**
  - Hero ball drawn on the right ≥ 95% of held frames and ≥ 95% of dribble frames on every hero ball action in 1v1, 3v3 and 3PT (base 16% / 1.2%).
  - Every AI carrier the same (base AI 35%).
  - Deliberate off-hand moves are listed and excluded.
- **Ball path:** ≤ 0.15 m per frame while held or dribbled (base: switch 0.52 m; pick-up up to 0.86 m).
- **Dribble contact:** the palm within 0.08 m of the ball at every bounce top.
- **Feet:**
  - Slide p90 ≤ 3 cm and ≤ 3 skating frames per window on every locomotion and dribble loop, hero and AI (base: handles 8.7 cm / 15.4; hero drive 10–24 cm; AI 11–16 cm).
  - Planted slide ≤ 20% of root travel (base 80–100% at the handle jog).
  - Cadence within ±15% of the decode's reference at walk, jog, run and sprint.
- **AI acceleration:** root acceleration p99 ≤ 34 m/s² (base about 216).
- **Hands:** both hand bones move on every action with the ball (base 0 of 382 windows).
- **Elbows:** wrong-way elbow frames ≤ 1 per window on the overhead clips (base: post 18.8, game dunks 19.2, AI defence 32.3).
- **One owner:**
  - 0 frames with two clips at full weight on any body (base: 3PT 24 + 36 frames; set jumpers `land_absorb` + `idle_stand` ×2).
  - Hip-yaw seam ≤ 15° in one frame at any clip hand-over (base: 20–90° over 3–6 frames).
- **Stance:** the knee bend stays within ±5° of the first take's across a 10-take session (base 66.8° → 47.4°).
- **Ball-less runners:** no ball-less body plays a dribbling clip (a clip-scope test).
- **Catalogue:** pops per action ≤ 5.5 and severe ≤ 0.5 (base 7.6 / 0.97).

### 4. Handles and moves

- **Every crossing move carries the ball across on 3's hand-switch path.** That covers the crossover, between the legs, behind the back, double cross, Shammgod, the momentum cross and the momentum behind-the-back, each through the path its name says.
  - **The side is set, not toggled.** `switchHand()` flips the hand whatever the clip did (1323, 1366, 1843). Two crossovers the same way leave the clip and the ball on opposite hands (V:1v1 N2).
  - **The move owns the arm.** Today the carry IK, at weight ≥ 0.6, holds the ball on the old side over the move clip (S4, MAP gap 1).
- **Crossover.** The capture's hand barely reaches the midline (+0.03 m at t 0.25, V:decode 2). Re-cut it, or author one that crosses low and wide.
  - The rival's `crossover_left` / `_right` names are mirrored against what is drawn (B:ai_1v1_cross).
  - The rival's switch goes through the same path, not a one-frame switch (9.6k°/s).
- **Between the legs** goes through a split stance and a hip drop. The authored 0.25 m drop is painted over today.
- **Behind the back:** `behind_back_left` is anatomically wrong, and its `_right` version is a right-to-left wrap (MAP gap 1).
- **Spin.** The root turns 360° (`SPIN_SWEEP`, `HoopsMoves.ts:462`) and the capture turns the hips another 198° (S17, MAP gap 3). Keep one: a 180–270° spin with a hand change and a planted pivot foot.
  - The unrequested in-and-out that opens every R-stick sweep goes (B:hero_1v1_spin).
  - At speed within 6.5 m of the rim, the same sweep becomes a steezo roll, then a drop step, then a PAUSIN' dunk (B:hero_1v1_spin a5). Check that chain against the decode; the probe labels it.
- **Pivot and drop step.** Each turns once, not twice.
  - The drop step's hand targets turn with the hips (`handsRel`), and its −130° hips no longer snap to 0° at the layup (MAP gap 3; the drop step LeftUpLeg about 8000°/s).
- **Hesi.** The capture is the opposite shape: the spine goes down and the ball hand ends behind the hip. The authored hesi had it right, raising the chest and eyes (MAP gap 7).
  - The hesi stops standing in for the jab (1v1:1270, 3v3:1265), the shimmy (1v1:1534, 3v3:1633) and the rival's step-back (1v1:1839) (V:decode B). Each gets its own clip.
- **In-and-out.** The 78_20 capture is a two-hand rip (MAP gap 8). Use a one-hand feint. The rip-through becomes a triple-threat read in phase 9.
- **Step-back.** The push-off key is a forward stride (`basketball.ts:128`, MAP gap 13). The right foot jumps 0.29–0.47 m in one frame at +217 ms (B:hero_1v1_stepback 5/5).
  - The snatchback plays its own `bball_snatch_back`; today both modes play the step-back gather (V:decode B).
- **PAUSIN'.** The stick-hold is advertised (1v1:277) but dead: `pausedDribble` is never set true (S19, LEDGER §4). Build it.
- **The carry's lateral moves** `carry_slide` / `carry_slide_right` play the generic `strafe` clips with unkeyed knees (`basketballTree.ts:114-115`). They get a dribbling side-shuffle.
- **Stick sign.** `crossoverDir` reads camera-relative world x (1v1:1308, S31). Check it on the 1v1 camera at both ends.
- **Turbo rates** are re-tuned at true fps. Today the feint plays at about 3.4× real speed (V:clips A).
- **The rival's jumper tell** is a real jumper gather, not `dunk_charge_gather` (1v1:1852). It lands in phase 7 with his jumper; phase 4 only stops the hesi feeding into it.
- **Clean-up** (LEDGER §4):
  - delete `DRIBBLE_CLIP`, the `football_juke_left` borrow and the `MoveGraph` orphan (6 dead ids);
  - add the 8 clips missing from `BASKETBALL_CLIPS`.

**Gate**
- **Crossing:** the ball changes drawn side on ≥ 95% of crossover, between, behind, double-cross and Shammgod attempts (base 0 of 25 hero R-stick attempts).
- **Between the legs:** the ball passes between the feet (probe flag) in ≥ 90% (base 0 of 5).
- **Behind the back:** the ball passes behind the hips in ≥ 90% (base 0 of 5; it stays 0.15–0.20 m in front).
- **Ball path:** ≤ 0.15 m per frame through every move, hero and rival (base 0.52 m switch; rival hand 0.22–0.29 m in one frame).
- **Spin:** body turn 180–270° with a hand change (base 312 ± 89°, no change). Pivot-foot slide ≤ 3 cm (base 8.8–12.3 cm, 20–30 skates).
- **Hesi:** Spine2 rises ≥ 4 cm and the stride pauses ≥ 150 ms, then speed rises (decode targets; base: no hitch).
- **Pops:** ≤ 4 per handle and 0 severe (base: hero 8.7 / 0.24; rival cross 19 / 1.4).
- **Feet:** slide p90 ≤ 3 cm at the handle jog and at speed (base 3.0–3.7 / 10–14 cm).
- **Names:** the clip name matches the probe's visual verdict on 100% of the handles catalogue.
- **Build:** tsc 0 errors, vitest green, plus a stick-sign unit test for both baskets.

### 5. Defensive slides + AI bodies (movement play P6 may start after this lands)

- **Stepping clips for a 4.2 m/s defender** (owner 2026-09-23). The defender moves at 4.2 m/s, but the slide clips top out at 3.7 and the closeout at about 2.3.
  - Slides, hard slides, backpedal, closeout and stance at true speed (the phase 2 fix), stride-matched from 1.5 to 4.2 m/s.
  - A sprinting chop-step closeout: sprint, then 3 or more chops over the last 1.5 m, hips dropping, a high hand at the stop.
  - Author or re-cut from 78_26 / 78_30 at true fps.
  - Don't cap the defender's speed.
- **AI bodies move like players** (MAP D-gap 1):
  - acceleration and deceleration (from phase 3);
  - the `sprint` flag honoured (a closeout "sprint" is the slide speed today);
  - the stance trade (`stanceWish`);
  - posture exertion (0 for every AI today, 1v1:870);
  - FootPlant on cuts.
  - Stunned 3v3 bodies still update their tree; today `continue` skips `tree.update` (3v3:1446), so the last loop runs in place.
- **[AI-ARMS].** Every AI body in 1v1, 3v3 and the carnival is the Meshy `Body.001`, whose skin barely weights the hands and forearms (B defence §AI-ARMS). The skeleton raises a hand 0.39 m above the head while the drawn arm hangs, and the shirt tears at the shoulders.
  - Fix the weights on the cast body, or cast a kit-rigged body, within the model rules: Gate 0 rejects a raw Meshy rig, and no untextured models.
  - This comes before phase 10, whose active hands are invisible otherwise.
- **The defence thrash.** Clips change about every 200 ms (5 in 1.2 s), with 2–6 severe upper-arm rolls of 8–10k°/s at the switches.
  - Add a dwell and hysteresis in the tree's defence states, with the hinged arm from phase 3.
  - The backpedal stops pitching the body onto a knee. The closeout stops snapping it upright, and stops standing the AI up with locked legs mid-slide.
- **The hero's slide shape:** the trailing knee must not cross in (a knock-kneed squat with clawed hands, B:hero_1v1_def_slide). The 3v3 hero's "slide" is only 3–5% sideways.
- **The 3v3 hero's block and pump-fake bite leave the floor.** The mode logs "my block jump" at a 0.08–0.17 m hop (MAP D-gap 2, B:hero_3v3_def_block).
- **No body inside another.** The 1v1 bodies stand at the 0.76 m standoff and are drawn through each other (B: cross, hesi, drive, post, defence).
  - Give contact poses (arm bar, hand-check, chest-to-chest) inside the standoff, or a torso-capsule separation for drawing, without changing the rules' distances. Anchor any body-to-body threshold to `BODY_STANDOFF` (memory, hoops 10-phase).
- **The two-owner rebound on the 3v3 rival's miss** (the live board plus the `later(900)` race, V:3v3 "double owners"). Hotfix 1/6 made their miss a live board. Confirm it on `base2`, and remove the race if it is still there.
- **Weight class** (LEDGER §4, listed as "S1"): phase 2c scopes it in the decode. If it means body mass, it feeds this acceleration model.

**Gate**
- **AI acceleration:** root acceleration p99 ≤ 34 m/s² on every AI body (base about 216).
- **Feet:** foot slide p90 ≤ 3 cm on slides, closeouts, backpedals and stances, hero and AI (base: hero defence 13.4 cm, AI 9.2 cm; max 22.7 cm per frame).
- **Cadence** within ±15% of the decode at 1.5, 3.0 and 4.2 m/s.
- **Closeout:** ≥ 3 chop steps in the last 1.5 m, and the hips ≥ 8 cm lower at the stop than on the run.
- **Thrash:** defence clip switches ≥ 250 ms apart. Severe pops on hero defence 0 (base up to 2.4 per window).
- **Elbows:** wrong-way elbow frames ≤ 1 per window (base: defence 24.5, AI 32.3).
- **AI-ARMS:** the AI's drawn hand within 0.05 m of its hand bone on every AI body (base: skeleton +0.39 m over the head, drawn at the side).
- **Overlap:** torso capsules overlapping on ≤ 2% of any window's frames.
- **Stance:** the hero's knee bend ≥ 45° throughout stance and slide windows.
- **3v3 block:** feet ≥ 0.35 m on every logged 3v3 hero block jump (base 0.08–0.17 m).
- **Spread:** AI and defence gates hold on the mean of ≥ 5 attempts.

### 6. Layups and variants

- **Take-off foot.** Six right-hand finishes take off from the wrong foot: the hook, finger roll, Mikan, scoop, spin layup and hang layup (`basketball.ts:459,547,569,695,725,740`; MAP gap 2; LEDGER §4). The mirrored left-hand versions inherit it. A right-hand finish goes off the left foot with the right knee up.
- **The ball goes up.** At release it is 0.2–0.63 m below the head on every finger roll, floater, hook, scoop, post hook and 3v3 layup (B finishes). The finishing arm extends to the rim.
- **The layup capture.** The `extend` override with no `release01` holds the hand at 2.12 m through the landing (V:clips 3, 4; MAP gap 9). The hips twist 58° after the release, the airtime is 0.80 s against a physical 0.48 s, and the hop starts on the gather step.
- **AI layups jump.** 10 of 10 never leave the floor, releasing from the hip at 0.79–1.16 m (B:ai_1v1_layup, B:ai_3v3_layup).
- **No frozen follow-through.** In 14 of 61 hero finishes the body moves 15 cm or less for 800 ms after the release (B finishes). The visible celebration comes in phase 12.
- **The euro step.** Two real steps; today the root slides 43–63% sideways under a still body (B:hero_1v1_drive_finish).
- **The ball leaves at the release key.** In 3 of 7 3v3 layups it leaves on the gather's first frame and flies 320–470 ms before the apex (B:hero_3v3_layup).
- **The variants, each readable:**
  - **Reverse:** faces away from the rim. The shooting turn faces the rim today while the clip lays the ball behind the head (MAP gap 11).
  - **Scoop, spin, hang, finger roll and Mikan.** The Mikan uses the glass even when the glass button isn't pressed (MAP gap 15).
  - **Floater:** released early, on the way up (MAP gap 15).
  - **Hook:** shoulder-on, about 90° to the rim instead of about 42°, with a bent-elbow arm bar instead of a straight shield arm (MAP gap 10).
  - **Up-and-under:** the step foot plants before the release; the leg is still in the air today (MAP gap 14).
- **The post** (B:hero_1v1_post_up and friends): a wide base and a lean into the defender. Today it is upright and straight-legged.
  - The post hook sweeps. The shimmy fade leans back.
  - The pump fake keeps the ball: a 0.7 s capture in a 0.5 s slot drops it (GP 7). The pump fake itself belongs to phase 7's jumper family; the post version is fixed here.
- **3v3 mates take layups.** `teammateShoots` measures a 3-D distance (always ≥ 3.05 m) against `LAYUP_RANGE` 1.9 (V:3v3 N4). Make it planar.
- **`CAPTURE_RELEASE_01`** covers only the jumpshot. The finishes are paced on authored release keys (V:clips G) and get their own.

**Gate**
- **Take-off foot:** 100% on the six families, both hands (probe: the last foot to leave the floor against the release hand).
- **Ball up:** the ball hand ≥ 0.10 m over the head at release on layups, finger rolls, hooks, floaters and reverses (base −0.06 average; drive finishes −0.19; post hook −0.05).
- **AI layups:** feet ≥ 0.25 m at release (base 0.04 m).
- **Release timing:** layups within −100…+50 ms of the feet apex; floaters −150…−50 ms (decode; base drive finishes +178, floater +77).
- **Follow-through:** 0 frozen follow-throughs (base 14 of 61).
- **Euro:** two steps, each moving a foot ≥ 0.4 m sideways, with the planted slide ≤ 3 cm.
- **Pops:** ≤ 5 per finish and severe ≤ 0.2 (base: finishes 11.3 / 1.03; post 15.7 / 2.64; drop step 27.2 / 5.2).
- **3v3 ball timing:** 0 releases on the gather's first frame.
- **Post:** base ≥ 1.2× shoulder width, with a trunk lean of 10–25° toward the defender. The hook's shoulders are ≥ 70° to the rim line at release.
- **3v3 mates:** they take layups inside 1.9 m planar.

### 7. The jumpshot, 3PT, carnival (owner: "the jumpshot looks ugly too")

**One jumper, built like the dunks**
- **The motion:** dip → gather or hop → rise → release at the top → a follow-through that holds, with the wrist snapped, the guide hand off at the release, and the legs landing and absorbing.
- **The capture's defects:**
  - **Frozen hands.** 4 identical keys from 0.75 to 0.90 s in `bball_mc_jumpshot`, from the `extend` override `from01 .42 / peak01 .78` held to the end. Fix it in `opponent-clips.json` and regenerate (V:clips C3; V:1v1 5).
  - **The follow-through's 0.51 m first-key jump** (`from01 0 / peak01 .08`) and its +48° → −19° hip seam (S10).
  - **A late release wraps the looped hold to frame 0** (S9). The live set jumper: 12 pops in one frame, Hips 5.5k°/s (AUD).
  - **The 94° hip twist** (−46° → +48°). A real stance stays open 10–20°.
- **The gather → rise seam:** a 0.44 m ball drop and a 55° hip snap (MAP gap 4). The 3PT set has the same seam.
- **The pull-up gather is a dead stop** (0.27 s), and the body turns 60–90° to the rim during it. The momentum carries into the rise.
- **The step-back's one-frame foot jump** (phase 4 fixes the push-off; this phase checks it through the shot). **The fade** fades away from the defender and has a one-leg version (MAP gap 12; base 1% sideways).
- **Early and late follow-throughs** are 4-key authored poses. Rebuild them to the smoothing bar, or re-cut them from captures (GP 7). The early one starts the hand 0.6 m below the release pose (V:clips D).
- **The pump fake** keeps the ball: a 0.7 s capture in a 0.5 s slot drops it (GP 7).
- **`bball_fadeaway_left`** plays the right-hand clip (GP 7).
- **The landing cuts the follow-through** (S11; 3v3 N6: `land_absorb` fires 0.32 s after the rise, not when the arc resolves). The follow-through holds until the ball reaches the rim, or 0.6 s.
- **The 3v3 set jumper** holds the ball at the check in `mc_defend_stance` for 0.42 s (B 4 of 4). The 1v1 set jumper flicks into it in 3 of 5.
- **The rival and the mates** let go at frame 0, before the arm moves (S12, MAP gap 5).
  - The rival's jumper hops, and his tell is a jumper gather, not `dunk_charge_gather`.
  - The mates' jumper gets a gather.
  - The mocap and authored versions stop playing back to back (`mc_jumpshot` → `jumpshot`).
- **The shared `shooting` flag** in 3v3 (V:3v3 C6) is fixed in phase 3; this phase re-checks it.

**3PT**
- **Real speed.** `SHOT_CLIP_SPEED` 1.5 (`ThreePointMode.ts:303`) plays the capture at about 1.95× real. Its comment still says about 0.27 s.
- **One owner.** No `idle_stand` at full weight under the shot (the phase 3 crossfade fix; base 24 + 36 frames). The celebration gives way to the next gather without a one-frame drop (base 0.5–0.8 m, 6–10.7k°/s).
- **The feet leave the floor** on rhythm shots (base ≤ 0.14 m).
- **The rack pick-up** reaches: the rack stands 0.75 m behind the shooter at 0.78 m high, and the ball warps 0.15 m with a 20% size pop. A rack change hands the ball over.
- **The jog.** No 2.2× cadence skating (base 10.6 cm p90). The run starts facing the rim, not running in place 120° off it, and the 11.6 m final-round teleport goes behind a cut or a jog (V:3pt).
- **Real reactions.** The body reacts to a miss and to a plain make. The rivals react to their number with a score reaction, not a bump flinch. The standings freeze is phase 12's.

**Carnival**
- **Slam Rush** uses the dunk module from phase 8: a real approach, a real flight, a flush at the rim, and the ball in the drawn right hand. The hotfix put it in rig `RightHand`, which draws on the left, and `rightHandDunks` is never called there (V:tooling 7).
  - The same-frame loop-then-beat (V:3pt N7) goes.
  - The result stays the event's roll, which is a rules question and not motion. The body plays the matching made or missed flush.
- **Party-goer b0** stands on the floor (base: seated about 0.5 m in the air).
- **The carnival loser** plays a hoops or party reaction, not `karate_mc_hit_react`.

**Gate**
- **Release timing:** hero set, pull-up, step-back and 3v3 set jumpers release within −60…+20 ms of the feet apex in ≥ 80% of attempts (base +98 mean, +117 median; the decode can tighten the band).
- **Ball up:** the ball hand ≥ 0.10 m over the head at release (base: 1v1 −0.11 to −0.24; 20 of 20 below the head).
- **Guide hand** ≥ 0.08 m off the ball within 50 ms of the release. **Wrist flex** ≥ 45° through the release (base 0°).
- **Hips:** yaw travel ≤ 25° from the rise to the landing (base 94°).
- **Seams:** no wrap back to the set (0 frames of the jumpshot restarting). The ball moves ≤ 0.12 m per frame from the gather to the release (base 0.44 m).
- **Follow-through** held to the rim or 0.6 s in 100% of shots.
- **Pops:** ≤ 4 per jumper and 0 severe (base: step-back 21.4 / 4.8; live set jumper 19 / 7).
- **Step-back:** foot ≤ 0.10 m per frame. **Fade:** hips move ≥ 0.25 m away in the air.
- **Rival:** feet ≥ 0.2 m, and he releases after his ball hand passes his head (base 0.02–0.05 m; hands at 1.02 m).
- **3PT:**
  - 0 frames with two clips at full weight;
  - the clip at ≤ 1.1× real speed;
  - feet ≥ 0.12 m on rhythm shots;
  - celebration-to-gather hand drop ≤ 0.12 m per frame;
  - rack pick-up ball ≤ 0.10 m per frame, and the hand reaches the ball before it moves;
  - jog slide p90 ≤ 3 cm.
- **Slam Rush:** ball drawn right 100%, feet ≥ 0.6 m, the flush hand ≤ 0.2 m from the ring.
- **b0:** feet within 0.03 m of the floor.

### 8. Game dunks = contest dunks (the owner's write-in)

- **1v1 and 3v3 drive dunks** play the contest's built dunks: gather and carry, push 1-2 and take-off, `arcHeight` (the top at the rim), DunkSpin, the trick hand-offs, RimFlush and `pronateToward`, the rim hang and the landing (LEDGER §4; S22–S26).
  - The dunk no longer cuts in from the dribble loop 0.1 s before take-off (S22).
  - The hang is not the generic two-hand `dunk_score_hang` (S23).
  - The trick rate isn't hard-coded to a 0.7 s clip (S24).
  - The transfers move the ball (S25, V:3v3 N7).
  - The rim reach's elbow is on the anatomical side (S26).
  - One dunk module serves DunkMode, 1v1, 3v3, Slam Rush and the rival.
- **The turns.** 360, PAUSIN', 360 WINDMILL and LOST & FOUND turn through DunkSpin, and the 720 extends it (V:3v3 C2). EASTBAY stays `faceRim` by design.
- **The hero's game dunk stops being a stiff board.**
  - The legs tuck or scissor per the trick; today they are straight and together.
  - The pick-up doesn't float the ball 0.5–0.7 m from the palm for 3–4 frames.
  - The carry into the dunk is drawn right; today it swaps sides at the gather (B:hero_1v1_dunk, B:hero_3v3_dunk).
- **The AI dunk reaches the rim.** The 3v3 POWER SLAM's hand gets to 2.24–2.8 m and the ball is thrown in from 0.34–0.89 m off the ring. The AI gets the rim reach (3v3 mounts one only for the player, `:651`), the hang, and the showtime pool.
- **The alley-oop flies.** Today its root stays at y 0, and the ball is in `RightHand` while the mirrored tomahawk swings the left (V:3v3).
- **The glass dunk exists in 3v3 too** (LEDGER §4).
- **Dunk-pass leftovers** (owner 2026-09-24; LEDGER §4):
  - the gather's off-arm first-frame pop (9 of the 14 severe pops);
  - the windmill and tomahawk elbow trailing back;
  - hand-on-top varying from run to run (11 of 25 runs; 10 of 21 at phase 13);
  - the transfer dunks' 9–10 ball-far frames;
  - the double clutch meeting the iron 3 ms after the 280 ms timeout (283 ms).
- **Dunk Duel** (LEDGER §4): RimFlush replaces the ball lerp through the rim (`DunkDuelMode.ts:801`), and the hinged arm. The widening of the TV mode slam window is marginal and listed only.
- **DunkMode's inline posture layer** moves into the shared PostureLayer, chest-follows-arms first (LEDGER §4).
- **CAMERA HOLD lifted** for the dunk run-up follow camera (audit decision 10).
- **The show** on posterizers is phase 12.

**Gate** (the dunk probe's definitions, scored against the phase 2a virtual-clock dunk control)
- **Pops, per game dunk,** hero and AI, 1v1 and 3v3, at least 5 dunk types:
  - pops ≤ 5 (base hero 18.2, AI 14.5; contest at phase 13: 4.48);
  - whips ≤ 3 (base hero 27.5);
  - severe ≤ 1 (base hero 4.9);
  - locked-elbow frames ≤ 35 (base hero 66.8; contest 33.1);
  - wrong-way elbow frames 0 (base hero 25.5).
- **The flush:**
  - the ball ≤ 0.2 m from the ring's centre (contest 0.16);
  - the AI's hand reaches ≥ 3.0 m (base 2.24–2.8);
  - hand on top at contact ≥ 50% (contest 10 of 21).
- **Hands:**
  - the flush hand is drawn right in 100% of dunks (base: hero 85% of held frames; AI 3v3 39%);
  - the gather hand-off moves the ball ≤ 0.15 m per frame.
- **Turns:** the 360 family turns 330–390°, logged in game (`[DUNK-CUE] spin landed`; base 0°).
- **Transfers:** at least one hand-off each, with ball-far frames ≤ 2 (base 9–10).
- **The contest control:**
  - 0 first-frame off-arm pops at the gather (base 9 of 14 severe);
  - on the windmill and tomahawk, the elbow leads the swing on ≥ 80% of frames;
  - hand on top ≥ 15 of 21 on two runs;
  - the double clutch meets the iron inside 280 ms;
  - no other contest number worse than its phase 13 value.
- **Dunk Duel:** 0 frames of the ball passing through the rim metal.
- **Framing:** the run-up camera keeps the dunker framed (`[FEL-FRAME]` 0 off-screen frames on the run-up).

### 9. Awareness A: eyes/head + shield

- **A LookAt layer** on every body (owner round 3). It is the last head/neck writer, eased, with the target chosen per frame:
  - ball-handler: the rim on the approach, the nearest defender at the gap, the ball on a loose dribble;
  - off-ball: the ball;
  - defenders: the handler.
  - Today no hoops clip keys the Head, except the base `run` and `jumpshot` on the `heroMocap=0` path (V:clips 5).
- **Shield under pressure.** With a defender within 1.6 m:
  - the far hand;
  - an off-arm bar (forearm between the ball and the defender);
  - a lower stance;
  - the back to the pressure when he is on the hip;
  - jab and rip-through reads from the triple threat, each with its own clip (phase 4 removed the hesi stand-in).
- **The stance trade and bank** get the side lean the captures lack (phase 3's layer).

**Gate**
- **Head:** yaw/pitch error to the look target ≤ 20° p90 over offence and defence windows. Head speed ≤ 400°/s when the target switches (no snaps). Defenders' heads on the handler ≤ 20° p90.
- **Ball side:** on pressured frames, the ball is on the side away from the defender ≥ 85% of the time (base: it follows the carry side, drawn left, wherever the defender is).
- **Arm bar:** off-arm bar present ≥ 60% of pressured frames.
- **Stance:** hips ≥ 5 cm lower than unpressured.
- **No regressions:** awareness adds no severe pops and no foot slide (every phase 3–8 gate still holds).

### 10. Awareness B: rim-aware finishes + active hands

- **Finish choice.** Rim side and distance, plus the defender in the lane, choose the gather step, the take-off foot, the finishing hand and the finish type, all through phase 3's one visual-side helper. Today the pickers use the root's +x, which is the inside hand (V:1v1 N1).
- **Contact adjusts mid-air:** the contested-layup change (LEDGER §4, S3) and the and-one body (V:decode 7: the MC calls it, but no body does it).
- **Active hands on defence:**
  - shot-lane hands;
  - a hand-check reach in the slide;
  - swipes at a loose dribble;
  - closeout hands high;
  - one hand up, one down on the ball.
  - Today `hand_up` raises no hand and the steal has no poke (B defence). The box-out arms are phase 11's.
- **Steal:** the hand arrives before the ball comes loose; today the ball launches 0.15 s before the hand. Also a left-hand steal, an intercept reach, and no guaranteed 1v1 AI strip (MAP D-gap 6).
- **Block:**
  - the dip before lift-off;
  - the apex on the ball, where today the rim protector meets it 33–132 ms into his jump and the AI's apex is 0.16–0.23 s after the release;
  - no steering in the air;
  - a landing after the block (S27: the block reach ends before the feet come down);
  - a chase-down block;
  - a vault shape, not the arms-up block reach.
- **Reactions:**
  - a stagger toward the push on contact;
  - a real ankle-break stumble and slip, not the fighter's floor pose;
  - a hoops fall and get-up for a poster or a knockdown, not `karate_knockdown` → `karate_floor_hold` → `karate_get_up` (V:decode B; 1v1:1001/2769/3310, 3v3 7 sites);
  - a take-the-charge fall;
  - `dejected` fed (never set today, and mapped to a clip outside the hoops scope, V:1v1 N6).
  - `contact_react` stops being all 38 reactions (MAP D-gap 7).
- **Referee helpers.** Ref's unused `contactFoul` / `shotFoul` helpers (`Ref.ts:250-258`) are wired where contact now has a body, or deleted (LEDGER §4).

**Gate**
- **Finishing hand:** the hand away from the nearest defender on ≥ 90% of contested finishes. The finish type agrees with the decode's rim/defender table on ≥ 90%.
- **Contest hand:** ≥ 0.20 m above the head at the shooter's release, hero and AI, drawn (base: hero 1v1 −0.05, 3v3 −0.10; the AI's hand at its side).
- **Steal:** the reaching hand within 0.10 m of the ball before it comes free.
- **Block:** the jump's apex within ±80 ms of the ball's closest pass. A landing after every block.
- **Reactions:**
  - a reaction with ≥ 0.2 m of stagger toward the push on every contact event;
  - 0 `karate_*` clips on any hoops body (a clip-scope test);
  - `contact_react` call sites ≤ 5, each a real bump.
- **Hand-check:** the forearm reaches toward the handler's hip on ≥ 50% of on-ball slide frames.

### 11. Passes, catches, rebounds, box-outs + 3v3 parity

**The first pass, catch, rebound, tip and chin clips** (none exist today)
- **Passes:** chest, bounce and lob thrown from the chest or overhead, with a step. Today the ball leaves from the dribble point 0.37 m below the knee (B:hero_3v3_pass).
- **The pass fake** doesn't play the full `jumpshot` while the carry keeps dribbling (3v3:1526). The bite doesn't teleport the defender 0.9 m (`PASS_FAKE_SHIFT`, V:3v3 N5).
- **The catch.** The target hands meet the ball, then give. Today the ball warps 0.54–0.79 m into rig `RightHand` with a 4–5.3k°/s arm snap (B:ai_3v3_catch).
- **Rebounds:** a jump, two hands, then chin it.
  - Today the 1v1 defensive board teleports both bodies to the check.
  - The offensive board warps the ball 0.7–1.4 m into the dribble (S28).
  - Any 3v3 board by my team calls `resetPossession(true)` (3v3:2599): the body jumps 4.3 m and the ball 5.7–6.0 m, even under "OFFENSIVE BOARD — PUT IT BACK!".
  - The AI rebounder glides frozen in the `layup_gather` end pose. Re-check this after the `freezeAtEnd` hotfix.
- **The box-out:** hit, seal, wide base and arms out, then pursue. Today L2 freezes `defend_stance` for 1.3–1.9 s, and the AI's box-out is a stance or a head-whip, facing the man, not the rim (MAP D-gap 5).
- **The ball goes to the body that secured it.** Today, after a pick-off or a foe board, it warps to a random foe 2 times in 3 (3v3:3154/3160, V:3v3 N3).

**The five no-code-path actions become real**
- **Mates pass back.** `passFlight` today is only for the hero's pass; the hero gets the ball only through the reset's warp.
- **Foes pass.** The foe team is one `carrierId 'foeTeam'` token (3v3:264).
- **A mate shoots** (phase 6's planar layup range; the jumper from phase 7).
- **The 1v1 rival rebounds** instead of teleporting. **He celebrates** (phase 12).

**3v3 parity with 1v1** (LEDGER §4; MAP "where 3v3 lags")
- The missing pieces: FootPlant, `travelOffRad`, AttackerBrain reads, the foe carry and reach, DunkTrickStick, and the glass dunk.
- The DriveLine chokepoint AI paths around rails.
- The stale board: hotfix 1/6. Confirm it on `base2`.
- **The 3v3 AI bodies are all one roster look.** They hash to `m22-df555984`, so mates and foes are identical copies that intersect. Give each body its own look (the models pass's cast).
- **The 3v3 rival always scores 2.**
- **`later()` keeps running while paused.**
- **Off-ball roles** are fixed by team, not by possession (MAP D-gap 3). Add V-cuts and backdoor cuts, and a jump-stop and roll on screens (MAP D-gap 14).

**Gate**
- **Coverage:** `hero_3v3_catch`, `ai_3v3_pass`, `ai_1v1_rebound` and `ai_3v3_mate_shot` are FOUND with ≥ 3 attempts each (base 0; no code path).
- **Pass:** released from ≥ 0.9 m with a step (base 0.37 m below the knee, from the dribble point).
- **Catch:**
  - the receiver's hand within 0.25 m of the ball 100 ms before it arrives (base 0.69–1.40 m);
  - the ball ≤ 0.12 m per frame at the catch (base 0.54–0.79 m);
  - the receiver's arm makes 0 severe pops (base 4.0–5.3k°/s).
- **Pass fake:** the defender moves ≤ 0.12 m per frame (base 0.9 m in one frame).
- **Rebound:**
  - the rebounder's feet ≥ 0.3 m off the floor (base hips +0.00–0.18 m);
  - both hands on the ball, chinned within 300 ms;
  - 0 root teleports inside a rebound or board window (base: 5 of 5 `ai_1v1_rebound_board`, 4 of 5 `hero_3v3_rebound_board`).
- **Box-out:** a seal (hips within 0.5 m of the opponent, back to him ±30°, base ≥ 1.3× shoulder width) held ≥ 0.4 s before the ball comes off.
- **The ball** always goes to the body that secured it.
- **3v3 parity:** 3v3's shared actions (jumper, drive, cross, slide, layup, dunk) within 10% of 1v1 on pops, slide p90 and severe.
- **Roster:** no two identical AI looks on one court.

### 12. The show on big plays

- **The replay cut and the celebration** go on posterizers, ankle-breakers, game winners and the 3PT money-ball streak (owner round 1). Ordinary buckets stay quick.
  - Reuse the dunk pass's pose-replay cut (`DunkReplayCam.setPoseNodes/playCuts`, the pose written on `onAfterAnimations`) and its cameras.
  - The triggers are the MC's big-play classification (`micShotCall` / `micRunOver`, V:3pt N6) and MomentumBus. MomentumBus has one subscriber, and 1v1 publishes about 10 times without the host drawing any of it (LEDGER §4).
- **Celebrations that show.**
  - Today every make plays the dunk capture's crouched one-arm punch, and 11 of 20 move ≤ 0.26 m. That capture is mirrored with the dunk family while the rest of the hoops body wasn't.
  - Per play: a jog back and a point on an ordinary bucket; a real celebration on a big play.
  - Rivals and mates celebrate: the rival has `celebrate: false` (1v1:1970), and the `dunk_celeb_*` clips are reused.
  - The beaten react (`dejected`, from phase 10).
  - The 3v3 reset 300 ms after a make (`CELEBRATE_SEC` 0.8 against a 0.9 s clip) waits for the celebration.
  - The owner's reel 04 has his own chest bump.
- **The 3PT standings.** `update()` returns before the bio/posture block and the camera (V:3pt N5), so the hero stands frozen for 4 s or more. The hero and the rivals react to their numbers.
- **No real players' names.** `DunkCuts.ts:72-73` credits 'Brandon Ruffin' and 'Vince Carter' in `CELEBRATIONS`; make them generic labels (owner round 1; LEDGER §4). The clip ids stay; only the shown text changes.
- **A highlight clip on big plays** (RORK 19):
  - a ~5 s ring buffer of the game canvas, triggered by MomentumBus big plays;
  - it feeds the poster/share composer, which today shares a still;
  - never the camera self-view.
- **Hero face on slams** (RORK 21; low priority, hero only): the `jawOpen` / `browRaise` morphs on the replay close-ups.
- **The MC** gets comeback, lead-change and signature-dunk calls (LEDGER §4).
- **HoopJuice's rim and net** stop being neon (`HoopJuice.ts:43,50`).

**Gate**
- **Big plays:** 100% of big plays (poster, ankle-breaker, game winner, money-ball streak) give one replay cut ≤ 2.5 s, skippable on any button, plus a celebration.
- **Ordinary buckets:** make-to-next-check time within ±0.2 s of `base2`.
- **Celebrations:** ≥ 0.4 m of hand travel (base: 11 of 20 at ≤ 0.26 m). `ai_1v1_celebrate` is FOUND with ≥ 3 attempts. 0 reset teleports inside a celebration window.
- **3PT standings:** 0 frozen hero frames in the standings window.
- **Names:** 0 real people's names in the dunk and hoops UI and data (a grep test over `DunkCuts` and the celebration labels).
- **Highlight clip:** ≤ 5.5 s, 0 camera-feed frames.

### 13. Re-measure + the reel + deploy

- **Re-take the whole catalogue** with the probe (≥ 5 attempts per action) and compare with `base2` (`_hoops-motion-compare.mts`). `base-audit` is context only: its recordings predate the audit's clock fix (see "Phase by phase").
- **Re-run the contest dunks** against the phase 2a control.
- **The eye grades a reel of every family, and the owner reviews ONE reel** (owner round 3).
- **Summary:** `~/Claude/outbox/finish-release/hoopsmotion/HOOPS-MOTION-PASS-SUMMARY.md`.
- **One Firebase deploy,** then fast-forward `main` to the lane.

**Gate**
- **Every phase 2–12 gate holds at one tip.**
- **Catalogue against `base2`:**
  - pops per action ≤ 3.5 (base 7.6);
  - severe ≤ 0.25 (0.97);
  - whips ≤ 3 (6.9);
  - wrong-way elbow frames ≤ 1 (12.3);
  - slide p90 ≤ 3 cm on average and ≤ 5 cm on every action (8.4; max 17.3);
  - skates ≤ 2 (12.3).
- **Hands and ball:**
  - the hero's ball drawn right on ≥ 95% of frames (16% held, 1.2% dribble);
  - 0 windows with the ball in hand and both hand bones frozen (381 of 382 windows);
  - 0 missing catalogue actions (5);
  - root teleports only at a possession reset after a make (58 windows).
- **Reported, not gated:** SPARC.
- **Contest control:** no contest dunk number worse than its phase 13 value.
- **Build:** tsc 0 errors, the full vitest green with its count, and the CI suites green.

## The brief's phase list against the re-cut

The pass was launched with the list below (round 2). The owner's re-cut (round 3; `hoopsmotion/GAME-PLAN.md`) reordered it and added the awareness phases. Nothing from the launch list was dropped:

| launched as | now |
|---|---|
| 1 instrument + baseline | 1 |
| 2 reference decode (the 10 reels + real basketball) → `SPEC-HOOPS-MOTION-DECODE.md` | 2c |
| 3 smoothing + LimbDrag / WristLayer / hinged arm ported; the CMU fps fix first | 2b (fps) and 3 (the port) |
| 4 game dunks = contest dunks | 8 |
| 5 shooting | 7 |
| 6 handles & moves | 4 |
| 7 finishes at the rim | 6, plus rim-aware choice in 10 |
| 8 defense + AI bodies, stepping closeout and slides for a 4.2 m/s defender | 5, plus active hands in 10 |
| 9 passes, catches, rebounds, box-outs | 11 |
| 10 3v3 parity | 11 (and on every phase's 3v3 rows) |
| 11 3PT + carnival | 7 |
| 12 the show on big plays; no real names in `DunkCuts.ts` | 12 |
| 13 re-measure + ONE deploy | 13 |
| (new) feet and ball first | 3 |
| (new) awareness: eyes/head, shield, rim-aware finishes, active hands | 9 and 10 |

**Not in this pass:** RORK 20, the enemy grappler and rusher, belongs to combat motion. The Dunk Duel "round-one NEED chip" and the TV MODE widening (LEDGER §4) are listed in phase 8 but not gated.

## Rules

- **Worktrees.** Each phase builds in an isolated worktree off the lane tip, gets an adversarial review, and lands as a gated commit: tsc, the full vitest, and the probe numbers against `base2` and the previous phase. Workflows never write the lane directly (another session runs movement play in it).
- **Commits:** each green phase is committed and pushed with the suite count. `tsconfig.json` is never committed; `next dev` rewrites it.
- **Measuring:**
  - Every measurement uses the virtual clock, and `qaSpeed` is never used with the recorder.
  - Defence and AI gates use the mean of ≥ 5 attempts.
  - Find code by symbol, not by line number.
- **Never run anything that needs `DATABASE_URL`.** Probes use `/dev/mode/<mode>?agent=1`.
- **Disk:** sweep `.next-*/static/chunks` by size (`-size +20M -mmin +10`) every 2 minutes while agents edit; never touch `static/webpack`.
- **Movement play:** its P6 starts after phase 5 lands. Coordinate on the files both passes share (ModeHarness, InputBus, CharacterAnimator, PostureLayer).
- **Sources:** no new recordings and no paid pack. The owner's reels are read with `git show` into a scratch folder and never copied into `public/` or committed.
- **One deploy,** at the end.
