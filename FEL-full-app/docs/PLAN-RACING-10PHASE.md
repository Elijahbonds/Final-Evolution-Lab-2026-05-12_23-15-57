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

## Landed (2026-09-23)

| phase | commit | what |
|---|---|---|
| 1 | c377961 | baseline + `_race-lab.mts` + kart / plane / sprint intent drivers: kart OUT 4th, plane WIN, free run P1 "complete", sprint win 9.83 s; 0 % silent except the sprint masher (13 %) |
| 2 | 44247e9 | `docs/SPEC-RACING-DECODE.md`: MK8 / DKR / Mirror's Edge + Titanfall 2 / Track & Field decoded; a fifteen-row gap table |
| 3 | 1488c9c | stick clicks (InputBus LS / RS, keys V / R): L3 LOOK BACK (a camera cut) on kart, plane, free run; R3 who-is-around-you (kart, plane) and LOCK-ON (free run); the empty boost says what fills it; the sprint answers every press |
| 4 | 4b04cdb | the start: `racing/RaceStart.ts` countdown + ROCKET START on "2" / BURNOUT on "3" for kart and plane (planes launch at GO); the sprint's reaction time on the finish |
| 5 | c4f5779 | the race read: `/dev/race/<key>` (shipping hosts, no login); the gap under the place; kart WRONG WAY + FINAL LAP; the sprint host's double harness (every stride a STUMBLE in dev) |
| 6 | 3e7c9ca | the field: the kart field raced gate chords (off the road on 13–50 % of a lap) → the road; standings by progress along the road (`lapProgress`, both seams at the line); rivals capped at the road's holdable corner speed; kart field +0.15 over the tier, plane pace 1.22 / corner bite 0.1 |
| 7 | f440e3f | the SLIPSTREAM (`racing/Slipstream.ts`) on kart and plane; every Free Run track x lane under the lane runner |
| 8 | a68c3de | the MINI-TURBO (`racing/MiniTurbo.ts`: blue / orange / purple sparks, a zip on release); the plane's silent gates chime and pop; the sprint's DIP at the tape |
| 9 | f3a12e7 | results that read: the kart can be won and its DNF says DNF; Free Run is won by finishing first (not by grade); the sprint says whether you beat the pacer |
| 10 | this commit | every racer run to the end under the drivers, the mechanics probe, the body smoke; the one deploy |

### Phase 10 — every racer to its end

| mode | intent driver | idle | fps (median / p10) | juice beats / min | errors |
|---|---|---|---|---|---|
| velocitykart | dnf 1326, P4, 120 s | dnf 0, 123 s | 60 / 59.9 | 118 | 0 |
| aeroaces | FINISHED 420, P4, 171 s | OUT 50, 203 s | 60 / 59.9 | 21.1 | 0 |
| freerun | win 2600, P1, 19 s | timeout 0, 171 s | 60 / 59.9 | 47.4 | 0 |
| sprint | win 1199, 10 s | dnf 0, 18 s | 60 / 59.9 | 78 | 0 |

Idle after the phase 10 fixes (kart DNF scored 1274 before; an idle sprint never ended). Mechanics probe (IDLE / DELIBERATE / MASHER / INTENT):
0 % silent on every driver in all four. Body smoke (15 s under the drivers): kart / plane / sprint 0 locked-T; Free Run's straight-elbow
frames sit under freerun_air_hold / run (the air-hold pose already on record), 60 fps in all four.

The intent kart row ran before the DNF-score fix (it scores 0 now). Fixed in phase 10: an idle sprint never ended (the pacer waited for the player's first stride) and a kart DNF was paid on the clock (1274 for never leaving the grid).

### Open
- the Free Run route tiers run backwards from the brief: HIGH (the "fastest, precision" line) is the slowest on three of four tracks and LOW the fastest on two (phase 7's table) — a course-design call for the owner
- the kart intent driver is 20–30 % off an ideal clean kart and spends 3–18 % of a race on the grass; its losses on the twisty courses measure the driver. A simulated ideal clean kart without boost beats the best PRO rival by 3.1–5.6 s on every course
- the plane's Red Rock Canyon is now the hard circuit (the skilled driver 4th of 8 in a 130 m pack) while Neon Skyline still goes to a driver with no items by 10 m
- the brief's HUD asks not built: the reticle speed ring (Free Run has a speed bar), on-character flow trails, the perimeter speed vignette
- items are not weighted by place (the decode's gap 12)
