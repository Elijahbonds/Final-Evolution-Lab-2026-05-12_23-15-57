# Boards suite — ten-phase pass (2026-09-22)

Modes: skateboard (Venice / THPS spirit) · snowboard_slalom (Gate Crasher) · surf · bigair · carnival. `carnival` is the Court
Carnival party shell (six court events, not a board) — in scope for loop honesty, input, results and the score loop (phases
1, 3, 9, 10); the board themes (tricks, landing, world, speed) do not apply to it. Bar = the owner's
standing briefs: SKATE-MAJOR / GATE-CRASHER-MAJOR (M1–M6: core loop honesty, stick feel with no wall glue, anims on sight,
juice honesty), BOARD-SPEED-WALL-UNSTUCK (B1 cruise speed, B2 wall unstuck, B3 bail honesty), ANIM-READABILITY, "surf /
skate / snow as built out as dunk". Instruments: `_skate-major-probe.mts` (the scripted line, per-frame grades),
`_board-family-smoke.mts` (any board mode: held forward, elbows, clips, errors), `_board-trick-probe.mts` (named tricks reached),
`_skate-wall-lab.mts`, `_snow-crawl.mts`, `_surf-pick.mts`.

1 Baseline — all five: the skate line's grades, the family smoke's clips/elbows/errors, named tricks reached, speed, run end.
2 Reference decode — docs/SPEC-BOARDS-DECODE.md: THPS 1+2 (ollie / flip / grab / grind / manual / revert / special / wallride
  / lip), SSX (carve, tuck, gates), a surf grammar (line, pump, wipe); FEL's five grammars side by side; the gap table.
3 Input grammar — one board stick on all five (direction + button = the named trick, the grind ask remembered, manual on
  landing, revert on ramps); bigair + carnival read the same table. Measured: distinct named tricks per 12 presses per mode.
4 Chains + the combo meter — the THPS loop on every mode: manual / revert links keep the combo alive, the multiplier is
  honest, a bail drops it with a read. Measured: combo lengths, multiplier vs points, drops named.
5 Silhouette + weight — feet on the deck in the air, landing compression, the bail on the bones, the T-arms gone; measured
  per frame on all five (the major probe's grades generalised).
6 The landing read — clean / sketchy / bail windows honest and measured; snow gate hit/miss and the rock; surf wipe.
7 The world decides — walls (no glue, B2/B3), rails, lips; the snow rider ON the pitched piste (rocks / yeti reachable);
  the surf wave line. Measured: [SKATE-WALL] / [SNOW-*] / [SURF-*] events, stick frames.
8 Speed + flow — B1: cruise that feels fast; the run's length vs the world (the 66 m park); the tuck as the throttle.
9 Results that read — trick names, combo totals, gate hit / miss, wipe, judge scores on the banner (= the caption bus).
10 Score loop + ship — Gate Crasher's title + win condition, big air's judge, carnival's gauntlet; every mode ends and
   scores; the summary.
