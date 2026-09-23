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
| 1 | (this commit) | baseline on the lane tree, `~/Claude/outbox/finish-release/hoopsdepth/BASELINE-2026-09-23.md`: dunk approach a flat 6 m/s stick; 1v1 planted foot skates 2.9 cm median / 29 cm p90 per frame; dunk run loop straight-armed 639/732 frames, 3PT idle 731/731; dunk MASH 81 beats DELIBERATE 31; 3v3 B silent 5/6; R2 on-beat 3/3; 3PT timed 97 % |
| 2 | (next commit) | `docs/SPEC-HOOPS-DEPTH-DECODE.md`: 2K27 rhythm shooting (55 ms green, 15–20 ms pure), the eight-tier contest + impact arc, the metered dunk, the layup engine, cut-offs; FEL side by side; the gap table per S-gate |
