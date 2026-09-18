# FEL scorecard — rc22

Rubric: docs/SCORECARD.md. A game passes when EVERY category is ≥ 7.5 (bold = below the bar).

**29/29 games pass.**

| game | controls | logic | body | visuals | feel | performance | min | mean | pass |
|---|---|---|---|---|---|---|---|---|---|
| dunk | 10 | 9.8 | 9.3 | 8 | 9.9 | 10 | 8 | 9.5 | PASS |
| try | 10 | 9.8 | 9.4 | 8 | 9.9 | 10 | 8 | 9.5 | PASS |
| karate | 8.8 | 10 | 9.9 | 9 | 9.9 | 9 | 8.8 | 9.4 | PASS |
| football | 10 | 8.5 | 9.9 | 9 | 10 | 10 | 8.5 | 9.6 | PASS |
| skateboard | 10 | 10 | 9.5 | 9 | 8.4 | 10 | 8.4 | 9.5 | PASS |
| snowboard_slalom | 10 | 8.5 | 9.9 | 9 | 9.2 | 10 | 8.5 | 9.4 | PASS |
| surf | 10 | 9.3 | 10 | 10 | 9.2 | 10 | 9.2 | 9.8 | PASS |
| tennis | 10 | N/A | 10 | 9 | 10 | 10 | 9 | 9.8 | PASS |
| derby | 10 | N/A | 9.7 | 9 | 10 | 10 | 9 | 9.7 | PASS |
| penalty | 10 | N/A | 10 | 9 | 9.3 | 10 | 9 | 9.7 | PASS |
| golf | 10 | N/A | 10 | 9 | 8.9 | 10 | 8.9 | 9.6 | PASS |
| onevone | 9 | N/A | 10 | 10 | 10 | 10 | 9 | 9.8 | PASS |
| threevthree | 10 | N/A | 10 | 9 | 10 | 10 | 9 | 9.8 | PASS |
| carnival | 9.3 | N/A | 10 | 8 | 9.2 | 10 | 8 | 9.3 | PASS |
| karate_vs | 10 | N/A | 8.8 | 9 | 8.3 | 10 | 8.3 | 9.2 | PASS |
| dunkduel | 10 | 10 | N/A | 9 | N/A | 10 | 9 | 9.8 | PASS |
| mixedcombat | 8.8 | N/A | 9.4 | 8 | 9.5 | 10 | 8 | 9.1 | PASS |
| sprint | 10 | N/A | 10 | 9 | 9.8 | 10 | 9 | 9.8 | PASS |
| showdown | 9.3 | N/A | 9.9 | 8 | 9.7 | 10 | 8 | 9.4 | PASS |
| duel | 10 | N/A | 10 | 8 | 9.8 | 10 | 8 | 9.6 | PASS |
| volleyball | 10 | N/A | 10 | 9 | 10 | 10 | 9 | 9.8 | PASS |
| dance | 10 | N/A | 10 | 9 | 9.3 | 10 | 9 | 9.7 | PASS |
| who_scene_it | 10 | N/A | N/A | 9 | 10 | 10 | 9 | 9.8 | PASS |
| freerun | 10 | N/A | 9.2 | 9 | 9 | 10 | 9 | 9.4 | PASS |
| threepoint | 10 | N/A | 10 | 10 | 10 | 10 | 10 | 10 | PASS |
| bigair | 8.8 | N/A | 10 | 8 | 9.7 | 10 | 8 | 9.3 | PASS |
| aeroaces | 10 | N/A | 10 | 8 | 10 | 10 | 8 | 9.6 | PASS |
| velocitykart | 10 | N/A | 10 | 9 | 10 | 10 | 9 | 9.8 | PASS |
| brainbrawl | 10 | N/A | N/A | 8 | 10 | 10 | 8 | 9.5 | PASS |

## Why

### dunk
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** 9.8: no gauntlet row; mash 42 vs best 31 = 1.4× (−0.2)
- **body** 9.3: 1.3% no clip (−0.6); 0% T-arms (−0); 0.5% awkward arms (−0); 0.9 clip changes/s (−0); every move plays its own motion
- **visuals** 8: review 1/2/2/1/2 — rc10: hero cropped at the frame edge in open/mid; late frame hero and rival bodies overlap
- **feel** 9.9: 97% rich answers; 31.4 juice/min
- **performance** 10: fps p10 60 / p50 60

### try
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** 9.8: no gauntlet row; mash 42 vs best 31 = 1.4× (−0.2)
- **body** 9.4: 1.3% no clip (−0.6); 0% T-arms (−0); 0.3% awkward arms (−0); 0.9 clip changes/s (−0); every move plays its own motion
- **visuals** 8: review 1/2/2/1/2 — rc10: same session as dunk — hero cropped, bodies overlap late
- **feel** 9.9: 97% rich answers; 31.4 juice/min
- **performance** 10: fps p10 60 / p50 60

### karate
- **controls** 8.8: 5% silent (−1.3); median 0 ms (−0)
- **logic** 10: no gauntlet row; mash 0 vs best 0
- **body** 9.9: 0% no clip (−0); 0% T-arms (−0); 1.3% awkward arms (−0.1); 1.9 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/1/2/2 — rc20: the YOU ring finds the hero and the wave now reads as seven separate fighters (MobPool keeps their shoulders out of each other — rc19 was one clump of overlapping bodies); the dojo light is still a flat cream wash
- **feel** 9.9: 97% rich answers; 126.6 juice/min
- **performance** 9: fps p10 60 / p50 60; load 9.0 s (−1)

### football
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** 8.5: no gauntlet row; idle scored 10 (−1.5); mash 270 vs best 335
- **body** 9.9: 0% no clip (−0); 0% T-arms (−0); 0.8% awkward arms (−0.1); 1.6 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/1/2/2 — rc12: the runner is framed in open and mid (the stall that lost the mid frame is fixed); stand glare still blows the top band
- **feel** 10: 100% rich answers; 80.4 juice/min
- **performance** 10: fps p10 60 / p50 60

### skateboard
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** 10: no gauntlet row; mash 253 vs best 385
- **body** 9.5: 0% no clip (−0); 0% T-arms (−0); 0.7% awkward arms (−0.1); 2.4 clip changes/s (−0.4); every move plays its own motion
- **visuals** 9: review 2/1/2/2/2 — rc10: plaza reads flat and sparse — few features between the walls
- **feel** 8.4: 69% rich answers; 53.9 juice/min
- **performance** 10: fps p10 60 / p50 60

### snowboard_slalom
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** 8.5: no gauntlet row; idle scored 50 (−1.5); mash 661 vs best 628
- **body** 9.9: 0% no clip (−0); 0% T-arms (−0); 0.7% awkward arms (−0.1); 1.1 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/2/1/2 — rc10: late frame a pine occludes the rider
- **feel** 9.2: 84% rich answers; 28.3 juice/min
- **performance** 10: fps p10 60 / p50 60

### surf
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** 9.3: no gauntlet row; mash 2441 vs best 1489 = 1.6× (−0.7)
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0.9 clip changes/s (−0); every move plays its own motion
- **visuals** 10: review 2/2/2/2/2 — rc10: clean — pier, horizon, readable rider
- **feel** 9.2: 84% rich answers; 23.8 juice/min
- **performance** 10: fps p10 60 / p50 60

### tennis
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0.8 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/2/1/2 — rc10: the hero shows no racket in open/mid
- **feel** 10: 100% rich answers; 78.4 juice/min
- **performance** 10: fps p10 60 / p50 60

### derby
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 9.7: 0% no clip (−0); 0% T-arms (−0); 3.9% awkward arms (−0.3); 0.8 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/1/2/2 — rc10: stadium light bloom blows out the upper frame
- **feel** 10: 100% rich answers; 58.7 juice/min
- **performance** 10: fps p10 60 / p50 60

### penalty
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0.4% awkward arms (−0); 0.7 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/1/2/2 — rc10: roof light bloom blows out the top band
- **feel** 9.3: 86% rich answers; 65.2 juice/min
- **performance** 10: fps p10 60 / p50 60

### golf
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/2/1/2 — rc20: the hole's green is a mown surface again rather than the white blob that rc19 showed (its albedo was clipping against the 2.60 directional); the mow bands and tree line read as a links. The green is still a hard-edged flat ellipse with no collar.
- **feel** 8.9: 78% rich answers; 37 juice/min
- **performance** 10: fps p10 60 / p50 60

### onevone
- **controls** 9: 4% silent (−1); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0.7 clip changes/s (−0); every move plays its own motion
- **visuals** 10: review 2/2/2/2/2 — rc10: clean — Venice court, palms, bus
- **feel** 10: 100% rich answers; 65.5 juice/min
- **performance** 10: fps p10 60 / p50 60

### threevthree
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 1.2 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/2/2/1 — rc12: the hero reads against the team; the hint strip is still one long unreadable line
- **feel** 10: 100% rich answers; 61.6 juice/min
- **performance** 10: fps p10 60 / p50 60

### carnival
- **controls** 9.3: 3% silent (−0.8); median 0 ms (−0); phone: not in check
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 1.3 clip changes/s (−0); every move plays its own motion
- **visuals** 8: review 2/2/1/1/2 — rc20: the beach carnival reads — the bar wall, the palms and the lit court behind the free-throw hoop, the runner framed in the coin storm. The hall behind the court is still near-black against a bright sky, and the coin storm's court z-fought the lawn along its edge (fixed for rc21).
- **feel** 9.2: 85% rich answers; 26.8 juice/min
- **performance** 10: fps p10 56 / p50 60

### karate_vs
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 8.8: 0% no clip (−0); 0% T-arms (−0); 3% awkward arms (−0.2); 2.9 clip changes/s (−0.9); every move plays its own motion
- **visuals** 9: review 2/2/2/1/2 — rc10: the two fighters interpenetrate in the mid clinch
- **feel** 8.3: 65% rich answers; 78.4 juice/min
- **performance** 10: fps p10 60 / p50 60

### dunkduel
- **controls** 10: camera flow (no pad on this game); ready in 0.0 s; camera live 960×540; chromium fake camera: a synthetic pattern, so no pose is ever found and no dunk is judged — the flow is measured to "armed and tracking"
- **logic** 10: camera flow (no masher on this game); ready in 0.0 s; camera live 960×540; chromium fake camera: a synthetic pattern, so no pose is ever found and no dunk is judged — the flow is measured to "armed and tracking"
- **body** N/A: a camera contest has no rig on screen
- **visuals** 9: review 2/1/2/2/2 — rc20: PROVE IT is a page, not a venue — the contest panel (both players, dunks left, JUDGED VS PRQ) and the camera gate read cleanly at a glance and the copy says what the tracker does. No venue to score; the judging itself still needs a person in front of a real camera (docs/SCORECARD.md).
- **feel** N/A: judged by a person in front of a real camera (no pad trace to time)
- **performance** 10: fps p10 60 / p50 60

### mixedcombat
- **controls** 8.8: 5% silent (−1.3); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 9.4: 0% no clip (−0); 0% T-arms (−0); 2.7% awkward arms (−0.2); 2.4 clip changes/s (−0.4); every move plays its own motion
- **visuals** 8: review 2/1/2/1/2 — rc10: a flat yellow slab over a dark void; the staff passes through a body
- **feel** 9.5: 89% rich answers; 57.9 juice/min
- **performance** 10: fps p10 60 / p50 60

### sprint
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/2/2/1 — rc10: mid frame missing; the late card reads NO PLAY RECORDED (the run ended on the driver)
- **feel** 9.8: 95% rich answers; 11.8 juice/min
- **performance** 10: fps p10 60 / p50 60

### showdown
- **controls** 9.3: 3% silent (−0.8); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 9.9: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 2.1 clip changes/s (−0.1); every move plays its own motion
- **visuals** 8: review 2/2/2/0/2 — rc10: fighters interpenetrate in every frame (no separation in the clinch)
- **feel** 9.7: 95% rich answers; 17.8 juice/min
- **performance** 10: fps p10 60 / p50 60

### duel
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 1.3 clip changes/s (−0); every move plays its own motion
- **visuals** 8: review 2/2/2/1/1 — rc10: staff through the body; the hint line overlaps the top HUD
- **feel** 9.8: 97% rich answers; 42 juice/min
- **performance** 10: fps p10 60 / p50 60

### volleyball
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0.7 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/2/2/2/1 — rc12: the net reads (posts, band, tape) and the sand no longer washes out; the HUD is still only a score chip
- **feel** 10: 100% rich answers; 65 juice/min
- **performance** 10: fps p10 60 / p50 60

### dance
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 1 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/1/2/2/2 — rc19: the cypher floor is lit pink with a ring of onlookers and pillars around it; the top half of the frame is still a dark void with a floating banner slab and a stray pine
- **feel** 9.3: 93% rich answers; 7.4 juice/min
- **performance** 10: fps p10 60 / p50 60

### who_scene_it
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** N/A: no hero body in 100% of samples (quiz / vehicle)
- **visuals** 9: review 2/2/2/1/2 — rc10: the open question image is an unreadable dark close-up
- **feel** 10: 100% rich answers; 58.2 juice/min
- **performance** 10: fps p10 58 / p50 60

### freerun
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 9.2: 0% no clip (−0); 0% T-arms (−0); 0.2% awkward arms (−0); 2.8 clip changes/s (−0.8); every move plays its own motion
- **visuals** 9: review 2/2/1/2/2 — rc13: the vault box and wall now separate from the ground and the start gate no longer washes the frame; the stadium haze still flattens the light
- **feel** 9: 80% rich answers; 136 juice/min
- **performance** 10: fps p10 60 / p50 60

### threepoint
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 1.2 clip changes/s (−0); every move plays its own motion
- **visuals** 10: review 2/2/2/2/2 — rc10: clean
- **feel** 10: 100% rich answers; 63.6 juice/min
- **performance** 10: fps p10 60 / p50 60

### bigair
- **controls** 8.8: 5% silent (−1.3); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0.4 clip changes/s (−0); every move plays its own motion
- **visuals** 8: review 2/2/1/2/1 — rc10: snow blown to white; the top-left attempt text is tiny
- **feel** 9.7: 95% rich answers; 25.8 juice/min
- **performance** 10: fps p10 60 / p50 60

### aeroaces
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0 clip changes/s (−0); every move plays its own motion
- **visuals** 8: review 2/1/2/1/2 — rc10: canyon floor fills the frame with no sky band; mid frame missing
- **feel** 10: 100% rich answers; 31.3 juice/min
- **performance** 10: fps p10 60 / p50 60

### velocitykart
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** 10: 0% no clip (−0); 0% T-arms (−0); 0% awkward arms (−0); 0 clip changes/s (−0); every move plays its own motion
- **visuals** 9: review 2/1/2/2/2 — rc12: a world ground under the whole course — no void, and the kart stays framed; off the road it is plain grass to the horizon
- **feel** 10: 100% rich answers; 115.9 juice/min
- **performance** 10: fps p10 60 / p50 60

### brainbrawl
- **controls** 10: 0% silent (−0); median 0 ms (−0)
- **logic** N/A: no gauntlet or mechanics evidence
- **body** N/A: no hero body in 100% of samples (quiz / vehicle)
- **visuals** 8: review 2/1/1/2/2 — rc20: the wheel reads — five category wedges on its face in the HUD's own colours, a disc that carries its own value, and you can see it turn (rc19 was a black disc with its wedges mounted behind it). The room around it is still a dark band between the sunset strip and the floor, and the crowd added in pass 4 is not in frame.
- **feel** 10: 100% rich answers; 49.1 juice/min
- **performance** 10: fps p10 60 / p50 60
