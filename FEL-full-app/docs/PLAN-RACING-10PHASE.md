# Racing suite — ten-phase pass (2026-09-23)

Modes: Velocity Kart (`velocitykart`, seven kart courses, championship cups) · Aero Aces (`aeroaces`, five Diddy-Kong-style
circuits) · Free Run (`freerun`, the momentum parkour racer, four tracks) · Sprint (`sprint`, the 100 m d-pad cadence race).
Bar = the owner's standing briefs: the Free Run brief (`~/Claude/outbox/finish-release/freerun/BRIEF-2026-09-18.md`:
flow, route tiers, drafting, speed gates, drive-by / parry-vault / overdrive, the controller map, the HUD table), "Aero Aces
is supposed to be like Diddy Kong flyers", the MECHANICS PASS (every press a named, perceivable action; AI by your rules;
Velocity Kart's silent BOOST), the models pass's new vehicle bodies. Shape: ten themes across all four, autonomous, commit per
green phase, ONE deploy at the end.

Instruments: `scripts/probes/_race-lab.mts` (new: each racer run to its own end under DRIVER=intent|idle — result, place,
time, callouts, banners, fps, errors), `_intent-drivers.mts` (kart / aero / sprint drivers new; freerun exists),
`_mechanics-probe.mts` (IDLE / DELIBERATE / MASHER / INTENT, DEV=1), `_race-contact.mts`, `_freerun-flow.mts` (per track and
lane), `_board-family-smoke.mts` (bodies: T-frames, clips, perf).

1 Baseline — all four run to the end under the intent drivers and idle: does each race end, who wins, in what time, what the
  mode says; the mechanics verdicts (silent %, mash vs intent vs idle); fps; errors.
2 Reference decode — docs/SPEC-RACING-DECODE.md: Mario Kart 8 (drift mini-turbo tiers, rocket start, slipstream, items by
  place), Diddy Kong Racing (planes, balloon levels, stunts, zippers), Mirror's Edge / Titanfall 2 (runner flow), Track &
  Field / Mario & Sonic (reaction start, cadence, dip); FEL's four grammars side by side; the gap table.
3 Input grammar honesty — every press answered on all four (kart BOOST empty, aero rudder / brake, the Free Run controller
  map against the brief, sprint's face buttons); measured: silent %.
4 The start — a countdown and a start you can win (the rocket start) on kart and aero; freerun's GO; sprint's gun
  reaction read. Measured: start-boost rate under a timed driver vs a mistimed one.
5 The race read — place + gap top-left, lap / final lap, the next gate, WRONG WAY, the speed read (the brief's ring);
  what a frame tells you without the dev pane.
6 The rivals — beatable by intent, not by luck; the bounded rubber band honest in both directions; measured: intent place
  distribution vs idle, the pack spread at the line.
7 The track decides — route tiers, shortcuts, speed gates, drafting lanes, hazards; each Free Run track and lane, the kart /
  aero courses' lines; measured per track.
8 Flow + feel — drift sparks / mini-turbo tiers, draft, the flow gauge, one thud per hit, speed juice (FOV, lines);
  measured: beats per minute, silent boosts.
9 Results that read — the finish card: place, time, medal, the ghost delta, the cup standings; every callout on the caption bus.
10 Score loop + ship — every race run to the end under a driver, the one deploy, the summary.
