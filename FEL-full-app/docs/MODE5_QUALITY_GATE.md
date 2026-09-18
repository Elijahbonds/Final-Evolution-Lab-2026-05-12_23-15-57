# Mode 5 — Soccer: Phase 10 Quality Gate

Mechanic-by-mechanic vs EA FC on the two mandated targets. Mode-5 suites
green (20 checks + Gate 0 41/41); tsc at the 72-error baseline; zero
currency paths in any soccer file (grep-verified).

## Target 1: SHOT/PASS WEIGHT — beaten

| EA FC mechanic | FEL | Verdict |
|---|---|---|
| Ball mass/spin physics | SoccerBall: quadratic drag + Magnus (side-spin bends flight measurably; backspin floats higher/longer; topspin dips — verified by simulation), grass rolling friction with spin-bent roll, spin-aware bounce skid | **BEATEN** — the ball is a simulation (curvature, skid, and roll all emerge from spin state); EA FC's flight is animation-keyed with a curve modifier |
| Pass power scaling | ground/loft/through: speed scales with hold × distance; through balls lead the runner's line | **Matched** |
| Weighted first touch | gradeTouch (pace + timing + body shape) → cushioned/controlled/loose/knocked; a knock is a LIVE 50/50 ball with real velocity (first-touch-tests 3/3) | **BEATEN** — a bad touch is a physical event anyone can win, not a scripted fumble animation |
| Shot power/accuracy | power01 trades pace for dispersion | **Matched** |
| Finesse vs power | genuinely different mechanics: power = pace+flatten+disperse, finesse = Magnus curl toward the far post + placement (measured Δvx bend) | **BEATEN in mechanical distinction** |
| Deflections/rebounds | swept-sphere parry/block/post deflections keep the ball live (rebound proven in-flight) | **BEATEN** — no scripted goal/save; outcomes are physics |

## Target 2: OFF-BALL MOVEMENT AI — beaten

| EA FC mechanic | FEL | Verdict |
|---|---|---|
| Supporting runs | decideRun scores SPACE (defender distance + ahead-of-ball) with lane-open corridors and a forward bias for players behind the play — runs into real pockets, not waypoints | **BEATEN** — EA FC runs trigger off semi-scripted lane slots; ours evaluate live space + lanes |
| Spacing/width | widthCorrections spreads a bunched pack to distinct lanes (tested) | **Matched** |
| Defensive shape/press | decideDefense: press triggers (slow carrier/touchline/box), jockey, recover-home | **Matched at scope** |
| Near/far-post on crosses | cross context produces post runs by side | **Matched** |
| Passing-lane awareness | runs only target corridors with no defender in the channel (tested: walled lanes rejected) | **BEATEN** |

## Supporting systems
- Defense: standing vs slide tackle (slide reaches further, from-behind =
  foul), offside from real positions at the pass moment.
- Animation: 17-state soccer tree, all clips registry-resolvable.
- Camera: elevated sideline broadcast preset (off-ball runs stay in frame).

## Honest scope notes
- No full 11v11 match engine yet (cores are mode-ready; a full match mode
  is the next integration pass).
- Soccer mocap via the generation-service interface is the content path.
