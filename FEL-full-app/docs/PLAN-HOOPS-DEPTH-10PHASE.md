# Basketball depth — ten-phase pass (2026-09-23)

Modes: Flight Night (`dunk`) · 1v1 (`onevone`) · 3v3 (`threevthree`) · 3PT shootout (`threepoint`).
Bar = `~/Claude/outbox/SPEC-BASKETBALL-SUITE-DEPTH.md`, gates S1–S8 (stick feel · plant → takeoff · hang / air · land /
settle · contest windows · shot timing · footwork · facing + arms), the "2K21 / 2K27 feel bar": play that reads like a
modern 2K street slice on a TV from the couch — the stick moves the athlete with weight, plant → takeoff → hang → land is
a sentence, contests / shot timing / footwork are readable on sight, facing + arms match the play. Plus a reference decode
(web, cited) of 2K's shot meter, contest, gather / plant and finishing grammar. Owner decisions (2026-09-23): this suite;
S1–S8 + the decode as the bar; commit + push per green phase; ONE deploy after phase 10; WebSearch / WebFetch allowed.

What the earlier hoops passes already landed and this pass does NOT redo (verified, not re-tuned): the 2K right-stick map
(`core/StickHandle.ts`, `docs/SPEC-STICK-2K-DECODE.md`), the chain / handle gate, the cut cost, the ankle-bite, `RimDecides`
(the rim decides makes and misses, bank kisses), 3PT result banners, the arm's-length close-out (HOOPS-10PHASE-2026-09-22);
the dunk card (DunkCard: difficulty / execution / style) and the honest rim (dunk 10-phase); the SLAM beat seam and the on-beat
probe (CLOTHING-SOFT-RESIDUAL R2, d7adc57).

Instruments: `scripts/probes/_hoops-lab.mts` (1v1 / 3v3 possessions by named play, stick tally, contest, rim kinds),
`_dunk-lab.mts` (N attempts: launch, cue, slam readout, judges, the clip on the rig), `_r2-ontime-probe.mts` (the on-beat
slam, frames named by outcome), `_3pt-rim-probe.mts` (the shootout's timing ladder and rim result), `_mechanics-probe.mts`
(IDLE / DELIBERATE / MASHER / INTENT; DEV=1), `_intent-drivers.mts`, `_board-family-smoke.mts` (bodies: T-arms, dead arms,
clips, perf), `_footplant-probe.mts` / `_posture-bank-probe.mts` (feet and torso through moves), `_accessory-inspect.mts`.

1 Baseline — all four under the labs on the lane tree: the possession mix (1v1 / 3v3), eight dunks under the on-beat press,
  the 3PT ladder, the mechanics verdicts (silent %, mash vs intent vs idle), the body smoke (T-arms, dead arms, fps);
  each S-gate given its measurable proxy and its number before anything changes.
2 Reference decode — docs/SPEC-HOOPS-DEPTH-DECODE.md: 2K's shot meter and release timing (green window, early / late reads,
  the hop and set), contest system (hand-up vs body, the contest %), gather / plant and finishing (euro, hop, pro-hop,
  cradle), the hang and land of a dunk, movement weight (acceleration, the turbo, the plant on a cut), the on-screen reads;
  FEL's four grammars side by side; the gap table per S-gate.
3 Stick feel (S1) — camera-relative movement with weight on all four: acceleration / deceleration curves, the dead zone,
  no spin-in-place, facing agrees with the stick; the dunk approach on the stick. Measured: stick→facing error, time to
  full pace and to a stop, ice / teleport frames.
4 Plant → takeoff (S2) — the gather / plant readable and the jump spending approach momentum: the dunk's plant, the 1v1 /
  3v3 gather into a layup / dunk / jumper, the 3PT foot set / hop. Measured: plant frames before every takeoff, takeoff
  velocity vs approach speed, pop-jumps (a jump from a stand that reads like a sprint's).
5 Hang + land (S3 / S4) — the hang silhouette sport-correct with arms and ball readable, the landing an absorb crouch or
  the finish pose through the settle; no snap to idle, no T flash. Measured: the body smoke's T-arm / dead-arm frames in
  the air and on landing, snap frames at touchdown.
6 Contest windows (S5) — hand-up, body bump and strip timing readable, and the make / miss changing with the contest;
  no ghosting through a defender, no silent no-op contest. Measured: contest % → make % curve (1v1, 3v3), the dunk's
  car / prop contest, strips per press.
7 Shot timing (S6) — early / sweet / late read differently in the animation AND the result on every shot (jumper, 3PT,
  layup, drive dunk), the 3PT meter honest to its own window. Measured: the timing ladder (release offset → made %),
  the reads shown per band.
8 Footwork (S7) — jab / gather / euro / plant steps readable when the move fires; no feet slide, no moonwalk. Measured:
  the foot-plant probe through the move kit (plant distance while the foot bears weight).
9 Facing + arms (S8) — chest to the play, opposite-phase or sport arms on locomotion and the shot; no back-to-rim freeze,
  no dead arms, no dunk clip on the wrong mode. Measured: facing error to the play, the arm-phase metric, clip-scope audit.
10 Score loop + ship — every mode run to its end under the drivers, the mechanics probe, the body smoke; the one deploy;
  the summary in `~/Claude/outbox/finish-release/hoopsdepth/`.

## Landed (2026-09-23)

| phase | commit | what |
|---|---|---|
| 7 | (this commit) | S6 shot timing: every jump shot played ONE follow-through, so early / late looked green until the rim. `bball_follow_through_early` (the short arm: released below the top, the ball pushed off the forehead — shooting hand 1.56 m against the green 1.73 m on the rig) and `bball_follow_through_late` (the chest pitched over, the hands pushed out flat, a heavy landing — hands +0.14 m out, head +0.13 m forward), all three ending on the same stance; `followThroughFor(quality)` picks it in 1v1, 3v3 and 3PT. The 3PT meter draws the PERFECT band it grades (0.35 of the good band drew 0.056 against 0.06). Measured: 1v1 ladder vs `?dummy=1` (8 each) charged early 0.31 · good 0.80 · late 0.27 (makes 3/8 · 4/6 · 4/8, n small); live clip per band — 1v1 early 6/6 on the early clip, 3PT random presses green 4 (err ±0.086) · early 15 · late 2, 0 page errors. Suite 369 / 4502 |
| 6 | 4e1a142 + (this commit) | S5 contest windows: the release reads the contest on five tiers with the number it charged (4e1a142); the AI read the shooter ONCE, on the gather, and a closeout still arriving (3.0 m at the load, 2.3 m at the release) never raised a hand — 0 hand-ups on 20 of 20 1v1 jumpers, every contest distance-only (0.16–0.42), nothing ever read CONTESTED. `aiShotRead` keeps the read pending through the shooting motion and gives the closeout its hand-up roll the frame he is in range (no late block jump), 1v1 + 3v3. Measured (`_hoops-lab PLAY=jumper`, 10 each, 1v1): wide open (?dummy=1) 6/10 at 0.62 charged · light 3/6 at 0.56 (hand up 5/6) · contested 0/3 at 0.34 (hand up 3/3). 3v3 off the check: the shooter beats a 4 m closeout (late hand at 2.2 m, contest ≤ 0.13, 8/10) — honest, not changed. Suite 369 / 4501 |
| 1 | (this commit) | baseline on the lane tree, `~/Claude/outbox/finish-release/hoopsdepth/BASELINE-2026-09-23.md`: dunk approach a flat 6 m/s stick; 1v1 planted foot skates 2.9 cm median / 29 cm p90 per frame; dunk run loop straight-armed 639/732 frames, 3PT idle 731/731; dunk MASH 81 beats DELIBERATE 31; 3v3 B silent 5/6; R2 on-beat 3/3; 3PT timed 97 % |
| 2 | 07cbf98 | `docs/SPEC-HOOPS-DEPTH-DECODE.md`: 2K27 rhythm shooting (55 ms green, 15–20 ms pure), the eight-tier contest + impact arc, the metered dunk, the layup engine, cut-offs; FEL side by side; the gap table per S-gate |
| 5 | (this commit) | S3 / S4 hang + land: `bball_land_absorb` (authored, 0.3 s: the knees take the jump with the hands still high, the hips 7 cm down, then the stance) at feet-down of every jump shot — 1v1 / 3v3 at the rise-hop's touchdown, 3PT between the follow-through and the idle (it faded arms-overhead straight into idle_stand). Measured on the same play against a server on a9d9659 (`_hoops-lab PLAY=jumper SMOOTH=1`, 5 hops each): hero hand pops 63 (max 1.14 m) → 26 (max 0.54 m); the touchdown frame itself 0.074 → 0.070 m/frame. Hang (S3) read as-is: 1 T-arm frame on the jumpshot, 6 on the follow-through in the baseline smoke; the dunk hang untouched |
| 4 | a9d9659 | S2 plant → takeoff: 3PT gets a SET — the catch lands in the pull-up gather and holds loaded while the bar sweeps, the jump shot fades out of it at the fire (`_3pt-set-probe`: the top clip while the bar swept was idle_stand 100 % → the loaded gather 94 %, idle 6 % = the ball's flight to the hand); 1v1 / 3v3's pull-up gather measured as the plant that spends the run (0.34 s from 6.2 m/s, speed bled over it); the dunk's plant + air budget from the run-up unchanged. Suite 369 / 4496 |
| 3 | f93f39b | S1 stick feel + every press answered: the dunk approach rides `CourtMovement` (hoops gears, loaded first step, speed-scaled stop, cut cost; HOLD = sprint) instead of a flat 6 m/s stick — body smoke speed p90 0 → 3.85, peak 6.0 → 4.08 (the jog gear); the dunk MASHER 81 vs DELIBERATE 31 → 21 vs 31; 1v1's Circle on defence announces the plant (silent 10 → 0 %); 3v3's Circle answers while a mate carries and is heard on the press (silent 20 → 4 %); on-beat slams 3/3 (the probe presses in-page on the beat's own frame). Suite 369 / 4496 |
