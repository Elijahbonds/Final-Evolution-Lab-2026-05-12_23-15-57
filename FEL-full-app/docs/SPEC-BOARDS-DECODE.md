# Boards suite — reference decode (ten-phase pass, phase 2, 2026-09-22)

The owner's bar for the boards, in his words: "board sports need huge mechanic upgrades and visual polish — surf,
skateboarding, snowboarding should be as built out and developed as dunk"; SKATE-MAJOR / GATE-CRASHER-MAJOR (M1 core loop
honesty · M2 stick feel, no wall glue · M3 anims on sight · M5 juice honesty); BOARD-SPEED-WALL-UNSTUCK (B1 cruise that feels
fast · B2 wall unstuck · B3 bail honesty); "add kick plants off walls and wall rides … lip tricks too" (09-18).

## The references, as grammar

| Reference | Movement | Trick grammar | Links / combo | Landing | World |
|---|---|---|---|---|---|
| **THPS 1+2** | push (tap), crouch = pump, carve; the special meter fills on landed tricks | ollie (jump btn, hold = height); flip = direction + flip btn; grab = direction + grab btn; grind = grind btn near a rail (direction picks the grind); wallride = grind btn at a wall; wallplant = jump on the wall; lip = grind on a coping | **manual** (up-down on landing) and **revert** (grind btn landing a ramp) keep the combo alive; the multiplier is the link count, points × multiplier; a bail = the whole combo lost | clean / sketchy (late rotation) / bail; the landing compresses the knees | rails, ledges, quarterpipes, banks, gaps named and scored |
| **SSX (snow)** | carve on edge, tuck = speed, pre-wind a spin | grabs by direction + button, spins by holding a direction in the air; uber tricks off a full boost meter | landed tricks fill the boost; a crash empties it | crash on under-rotation | gates / rails / jumps down a long course |
| **Surf (a Kelly Slater / surf-game grammar)** | the wave is the world: pump down the face for speed, cut back up it, trim along the line | aerials off the lip (grab / spin), snaps and floaters on the lip, tubes | a line of manoeuvres per wave scores; a wipe ends the wave | wipeout | buoys / sections; the wave closes out |

## FEL today (phase 1 baseline, filled below)

| Mode | Movement | A | B | X | Y | R1 | links | landing |
|---|---|---|---|---|---|---|---|---|
| skateboard | BoardMovement SKATE (push, cruise, carve, brake) | ollie; hold dir = flip (left kickflip / right heelflip / down shuvit) | grab by dir (indy / melon / japan) | grind / lip stall / wallride / manual (grounded) | spins by dir (bs180 / fs360 / 540 / boardslide) | boost | manual, revert, grind → ComboChain | resolveLanding clean/sketchy/bail |
| snowboard_slalom | SNOW tuning (tuck = throttle; a held steer at speed spins) | ollie | B/X/Y tricks in the air; X held = grab | | | boost | ComboChain | gates x/z only; rocks never hit (rider at y 0 on a pitched piste — reported fixed via hardFloorY override, to verify) |
| surf | SURF tuning on the wave line | A | B | X grab (air) | Y | boost | | wipe |
| bigair | AirSessionCore run-up → air | A = spin (time-based) | B = stomp/plant | | | boost | | crash = spin still running off the half turn |
| carnival | court carnival events | any button begins the event; stick sideways + trick = 360 | | | | | | |

### Measured (phase 1)

- **skateboard**, the SKATE-MAJOR line (`_skate-major-probe`, 50 s, 2978 frames): elevator steps 0 · T frames 48 (all
  `skate_bail`) · air frames 352, feet off the deck 4 · wall-ride frames 61, detached 0 · longest stall 7 frames ·
  grinds: locked +300 (patrol rail), off after 1.32 s · walls: bounce off the funbox 2.6 m/s, slams into stair / funbox /
  spine / table / dh_lane / the fence, glances at 5.3 and 7.0 m/s, the wallride at y 1.27 · 8 touchdowns all
  "clean", **7 of 8 with 0 tricks counted** while the banners read KICKFLIP / INDY / GRAB — the landing does not see the
  air tricks (phase 4) · manual frames 0 on this line · errors 0.
- **named tricks** (`_board-trick-probe`, 60 s, skateboard): 18 distinct labels — BACKSIDE 180, INDY, MELON, MANUAL,
  NOSE MANUAL, REVERT → MANUAL, GRIND!, BONK, SLAMMED, BANKED +5 / +41 / +314 …
- **family smoke** (12 s of held forward, fake pad): surf rides on `board_ride_idle` only (732/732 frames, no push /
  pump clip); **snowboard_slalom stands** (`board_stand_idle` 730/730 — its throttle is the R2 tuck, a held stick alone
  does nothing); **bigair: no board clip at all and 391 of 729 frames in a T** (the athlete rides the shared `jump_up` /
  `dunk_launch` base clips); carnival: 0 arm frames (no rig under the hub camera), `board_ride_idle` / `board_air` on the
  event body; skateboard: push / ride / bail (93 bail frames in 12 s of holding forward: he slams into the plaza).
- **named tricks on the family** (`_board-trick-probe`, 50 s): surf 11 labels (STRAIGHT AIR, AIR REVERSE, ALLEY-OOP,
  FLOATER, IN THE BARREL / BARRELED! +250, GRAB); snowboard_slalom 15 (720, METHOD, RODEO 540, TAIL GRAB, STALEFISH,
  BOARDSLIDE, GATE ✓ / MISSED GATE); **bigair 2** (SPIN IN THE AIR, STOMP THE LANDING — the prompts, not tricks: A spins,
  B stomps, nothing is named).
- **the snow crawl** (`_snow-crawl`, neutral / forward / tuck): the rider spawned at y 0.2 and was at **y −148.6 for the
  whole run** — the piste's hard floor — after "Rider: 6 missed raycasts (y=−6.77) — hard-clamping to floor" at the first
  frames; forward moved him 0.3–0.6 m/s, the tuck 1.7 → 4.9 m/s, all of it under the mountain (the gate still counted:
  gates are x/z only). The trick probe's later run rode the snow normally (gates, 720s), so the fall is a LOAD-TIME event:
  a stalled first frame's dt drops the body through the piste before the ground ray has ever hit, the ray from 1.5 m above
  a body that is already under the surface never sees it, and the snow's hard floor is the mountain's bottom (−148), not
  the snow. Fixed before phase 3 (GroundRide: a capped gravity step, the ray cast from the last known ground, the clamp to
  the last known ground) — the instrument cannot measure a rider under the world.

## The gap table

| # | Gap | Reference rule | Phase |
|---|---|---|---|
| G0 | the snow rider can spawn under the mountain (a load stall tunnels him through the piste; the hard floor is 148 m down) | the ground is where the last ground was | fixed with phase 1–2 (GroundRide) |
| G1 | big air names nothing — A spins, B stomps, two prompts for the whole mode; the family smoke shows 391 of 729 frames in a T with no board clip | SSX: grabs by direction + button, spins by a held direction, a named trick per landing | 3 + 5 |
| G2 | the skate landing counts 0 tricks on 7 of 8 touchdowns that showed KICKFLIP / INDY banners — the combo does not see the air tricks | THPS: every landed trick is in the chain; the manual/revert links them | 4 |
| G3 | surf rides on `board_ride_idle` alone (no pump / paddle clip), 11 labels but no line score across a wave | the wave is a line of manoeuvres; pump = speed | 3 + 4 + 8 |
| G4 | the snowboard's throttle is a trigger (R2 tuck), the stick alone stands him still; the trick table's grabs are 4 | SSX: tuck = crouch on a button/trigger, carve = the stick, pre-wind | 3 + 8 |
| G5 | no shared measure of landing compression / bail read across the five (the major probe grades skate only) | THPS: clean / sketchy / bail read on the body | 5 + 6 |
| G6 | walls: skate slams into stair / funbox / spine / table / fence 7 times in 50 s on the scripted line (glances at 5–7 m/s); snow / surf have no wall read | B2/B3: bounce or slide off, a readable bail, never glue | 7 |
| G7 | speed: skate cruise vs the 66 m park (8 s end to end); the snow tuck reaches 4.9 m/s in 3 s on the crawl | B1: fast enough to enjoy | 8 |
| G8 | banners: skate names tricks + BANKED totals; snow GATE ✓ / MISSED; surf BARRELED; bigair only prompts; carnival cards | every landing, gate, wipe, judge score reads on the banner (= the caption bus) | 9 |
| G9 | score loops: Gate Crasher's title / win condition; big air's judge; carnival's rival | every mode ends and scores, readable | 10 |
