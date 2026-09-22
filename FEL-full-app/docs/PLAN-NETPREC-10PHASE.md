# Net + precision suite — ten-phase pass (2026-09-22)

Modes: tennis (Center Court, glass cage) · volleyball (Beach Pro) · golf (links, Wii clubs, parkour hole) · derby (Home Run
Derby, route key `derby`, modeId `baseball`, parkour wall) · penalty (the Breakaway shootout, route key `penalty`, modeId
`soccer`). Bar = the owner's standing briefs: the MECHANICS PASS (every press a named, perceivable action; AI by your
rules), the 2026-09-18 briefs (Parkour Baseball / Golf / Tennis / Soccer arenas, "football, tennis and soccer upgrades",
the Wii read: WHEN you swing bends WHERE it goes), NET-PRECISION-A+ P0 (one thud, no second slow-mo), ANIM-READABILITY-NET
(the body at contact, holds not loops), the volleyball concept lock (bump / set / spike are three touches). Instruments:
`_mechanics-probe.mts` (IDLE / DELIBERATE / MASHER / INTENT per mode; silent %; score from nowhere), `_tennis-cage.mts`,
`_golf-park.mts`, `_derby-park.mts`, `_soccer-break.mts` (the arenas' seams), `_board-family-smoke.mts` (any mode: T-frames
by clip, speed, errors), `_intent-drivers.mts` (derby, golf exist; tennis / volleyball / penalty to write).

1 Baseline — all five: the mechanics verdicts (silent %, mash vs deliberate vs idle), the arena probes' counts, the smoke's
  clips / T-frames / errors, whether each mode ends and what it says.
2 Reference decode — docs/SPEC-NETPREC-DECODE.md: Wii Sports tennis / golf / baseball, Wii Sports Resort table tennis,
  Switch Sports volleyball, Mario Tennis Aces (zone shot / energy), Everybody's Golf; FEL's five grammars side by side;
  the gap table.
3 Input grammar honesty — every press on every mode answered (tennis X, volleyball's hits out of reach, golf B / Y in every
  phase, derby / penalty prompts); volleyball's three touches are three verbs (bump / set / spike). Measured: silent %.
4 The timing + aim read — the Wii read on all five: the meter's bands / the PCI / the landing ring / the aim arrow visible
  BEFORE the commit; perfect / good / late windows honest and measured off the scene (not the lagging HUD).
5 Silhouette + contact — the body at contact on every clip's contact key (swing, spike, putt, kick, bat), strafes, the
  keeper; T-frames 0 on all five; measured per frame.
6 The opponent — beatable by intent, not by luck: tennis and volleyball have never been won by a driver (AI 0.82 / 0.78);
  the keeper's read; the pitcher's mix. Measured: intent-driver win / hold rates.
7 The arena decides — the four parkour arenas re-measured (glass, rings / turbine, wall targets / fielders, keeper /
  rebounds), the deferred asks triaged (keeper crossbar vault / parry-kick, 2v2 cage, floating islands).
8 Flow + feel — the gauges (energy, flow, multiplier) drive the play; one thud per hit; the pace (rally speed, shot clock,
  pitch cadence, the meter's tempo). Measured: gauge use per session, juice beats per minute.
9 Results that read — every grade, point, hole, homer, save on the banner (= the caption bus); per-mode lines.
10 Score loop + ship — win conditions and cards for all five, run to the end under a driver, the one deploy, the summary.
