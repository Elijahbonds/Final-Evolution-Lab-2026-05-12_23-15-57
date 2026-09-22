# Combat suite — ten-phase pass (2026-09-22)

Modes: karate (The Hundred, horde) · karate_vs · mixedcombat · showdown · duel. Bar = the owner's standing briefs:
STORM grammar (09-17: "dashes with X, all button presses lead to different combos — look at how Naruto Storm is played"),
the Hundred de-lag (09-14), Neo co-op (09-07), Matrix physics + combat (09-18), arenas with walls (09-18).
Instruments: `_hundred-dynamics-probe.mts` (press→clip latency, eaten presses, speed/turn, karateNeo telemetry, DSL),
`_fight-route-probe.mts` ([KVS-ROUTE]), `_combat-verbs-probe.mts`, the A+ in-page fighters.

1 Baseline — all five: press→swing ms, eaten %, speed/turn, match outcome + length, dash/guard/Focus counters, page errors.
2 Reference decode — docs/SPEC-COMBAT-DECODE.md: Naruto Storm (dash/chakra dash/guard/substitution/strings/awakening),
  Soul Calibur (8-way run, guard impact, ring-out), the Matrix (bullet time, wall run); FEL's five grammars side by side; gaps.
3 Input grammar — one X reader (tap dash / double chakra dash / hold guard) on every mode incl. Showdown (X = block today)
  and Duel; every button a different move (A/B/Y × stick dir × air/dash). Measured: distinct moves per 12 presses.
4 Strings + cancels — the book + StrikeQueue rule on every mode (Showdown/Duel through StrikeSystem): eaten presses → 0,
  strings named on the HUD, enders reset. Measured: eaten %, presses→swings, strings landed.
5 Silhouette + weight — hit reactions on the BONES (root displacement, hips, launch height), hit-stop, knockback that
  reads; the dash's i-frames visible. Measured on the rig per mode.
6 Defence read — guard / parry / perfect dodge / substitution / guard impact windows, timed presses (`perfect:` DSL):
  window sizes, success on cue, punish opens. Measured per mode.
7 The wall decides — wall run / kick, ropes, drops, ring-outs on every arena; hazards. Measured: [ARENA] events per mode.
8 Focus everywhere — Matrix Focus on Showdown + Duel (rig clocks), perfect-dodge widening under Focus. Measured: clocks.
9 Results that read — hit / KO / round / ring-out banners + captions on every mode; the eye/ear (hit-stop, thud, flash)
  de-doubled. Measured: banner sequence from the dev HUD.
10 Rival + match flow — Mixed's ring-out losses, Showdown never ending (only heavies land), Duel's block-everything rival,
  the horde partner; every match ends and scores. Measured: win/loss/length over N matches; ship.
