# Net + precision — the reference decode (2026-09-22)

What the references do, what FEL does, and the gap between them. Numbers in the gap table are measured on the lane
(`~/Claude/outbox/finish-release/netprec/b1`), not remembered.

## The references
| game | the read | the verb | the loop | the punish |
|---|---|---|---|---|
| **Wii Sports Tennis** | WHEN you swing decides WHERE it goes (early = cross, late = down the line); the body runs itself | one swing; a top-spin / slice by the motion; a lob by a late upward swing | rally → point → game, to 4 games | a mistimed swing goes wide / into the net; no silent press |
| **Wii Sports Golf** | the club's carry as a meter with lines; a ring where it lands; the wind arrow | pull back = power, swing through = strike; over-swing = hook / slice; B cycles clubs | tee → fairway → green → cup, strokes vs par, a card | a wild swing shows its curve at once; OB says so |
| **Wii Sports Baseball (derby)** | the pitch's arrival; the PCI over the ball; timing = direction (early pull, late push) | one swing, aimed by timing; a bunt | ten pitches; homers counted; outs | a whiff, a foul, a fly-out — each named |
| **Switch Sports Volleyball** | three touches with three windows: BUMP (receive) → SET (a lofted ball, the timing tell) → SPIKE (jump + hit, aimed by the stick); BLOCK at the net | three distinct verbs on a rhythm, the spike aimed | rally → point → set to 25 | a touch out of rhythm floats; a blocked spike is STUFFED |
| **Mario Tennis Aces** | the energy gauge; a ZONE SHOT slows time and aims; a TRICK SHOT dives; a racket breaks on a bad block | drive / slice / lob / drop on four buttons, charged by early positioning | games + energy economy | a broken racket is a loss; a mis-read zone shot is punished |
| **Everybody's Golf** | the shot arc drawn before the swing; the 3-press meter (start, power, impact); the lie and the wind change the arc | the meter's impact press decides the shape | course + card; sidespin / backspin | a missed impact draws the slice on screen |

## FEL's five, today (read off the modes on the lane)
| mode | the read shown before commit | verbs | windows | loop / end | the arena |
|---|---|---|---|---|---|
| tennis (`NetSportMode` + `TennisMode`) | landing ring for the shot you hold, meter bands scaled to the flight, wind drift | A DRIVE / B SLICE / X DROP / Y LOB; L stick = footwork AND aim; R1 aerial (cage) | perfect / good / late / miss off the flight's landing point; energy gauge; ZONE shot | rally → point → deuce → 4 games; WIN / LOSS | the glass cage: bank, wall run, overhead smash, meteor, rally multiplier |
| volleyball (`NetSportMode` + `VolleyballMode`) | bands for the touch | A HIT (all three touches the same), B BLOCK | one window per touch; STUFF | to 25 | the beach |
| golf (`precisionModes` GolfMode) | aim arrow, landing ring, meter ticks in metres (Wii clubs), wind word, weather | stick swing (pull ≤ −0.6 arms, push through), B club, Y springboard, LT slide putt, flicks in the air | power + accuracy off the swing's shape | 3 holes vs par; CARD_IN | rings, turbine, the bank around the green |
| derby (`precisionModes` DerbyMode, modeId baseball) | the pitch spec (7 kinds), the PCI reticle, the wall's targets | A SWING (aimed by the stick's bearing), B BAT FLIP (flow) | contact q; the wall decides (target / robbed / homer / off the wall) | 20 pitches or outs; DERBY_END | tiered wall, targets, glass multipliers, two fielders |
| penalty (`precisionModes` PenaltyMode, modeId soccer) | the flow gauge, the 9 s clock, the keeper off his line | run + A STRIKE (stick = corner / chip), R1 bank on the glass, LT slide-cancel curler, A rainbow near the keeper | keeper read probability; off-his-line saves / parry-kick; rebounds | 5 kicks + sudden death; SHOOTOUT_WIN / LOSS | glass side walls, posts / bar rebounds |

## The gap table (filled from the phase 1 baseline)
| # | measured on the lane (phase 1, 2026-09-22) | the reference | phase |
|---|---|---|---|
| G0 | **every mode answers every press**: silent 0 % on tennis / derby / penalty / volleyball; golf 7 % (A in `flight` says nothing) — the MECHANICS pass already landed here | no silent press | 3 |
| G1 | **volleyball's idle player scores** (idle 1, deliberate 2, mash 2 in 30 s): the points come from the AI's own errors, not from play; the three touches are one button by count | Switch Sports: bump / set / spike are three reads; a point is earned | 3 + 6 |
| G2 | **tennis: 0 points in 30 s for the deliberate driver and the masher** (banner THEIR ZONE SHOT) — nobody who is not an intent driver wins a point; volleyball 2. The cage itself fires (x5, a back-wall smash, 3 points in 14) | Wii tennis: a beginner wins points by timing alone | 4 + 6 |
| G3 | **the timing read is uneven**: tennis draws meter bands for the flight; volleyball draws NONE (bands only for touchesPerSide 1); golf's meter is bands + ticks; derby is the PCI; penalty a power meter | the read before the commit, on every mode | 4 |
| G4 | **golf's driver flies out of bounds and picks up** (the park probe: OB + pick-up; 150 points = one hole in 30 s); 2 of 10 A presses silent | Everybody's Golf: the arc is drawn before the swing, OB is rare on a fairway club | 4 + 7 |
| G5 | **the body**: golf 734/734 frames with both elbows past 160° under `golf_address_idle` (an address holds the arms straight — a metric to re-read, not a T), volleyball 4 T-frames, tennis / derby / penalty 0; the penalty smoke's speed peak 381 m/s is a respawn teleport | the body at contact reads the sport | 5 |
| G6 | **the arenas fire**: cage (bounces → x5, wall run, smash), park (flicks, gusts, no ring hit), wall (2 homers of 3 swings, 0 targets — q 0.26–0.49 aimed at 0° / ±17°), breakaway (bank goal, curler miss, rainbow goal, slide-tackled); deferred asks stand (keeper crossbar vault / parry-kick, 2v2, islands) | the brief's full arenas | 7 |
| G7 | **flow / energy read**: derby flow 35–70 → x1.10–x1.21; breakaway flow 8–47; tennis energy spends on a METEOR; volleyball has no gauge; golf none | a gauge that drives the play on every mode | 8 |
| G8 | **results**: the penalty HUD `score` is the string `0–0` (the probe reads null); derby ends DERBY_END, golf CARD_IN, tennis WIN / LOSS, volleyball never ends in a session; no per-mode headline line for the card beyond the twins | every mode ends and reads | 9 + 10 |
| G9 | **the opponent**: tennis AI 0.82 / volleyball 0.78 never beaten by a driver (A+ P0: gameWinPunch verified by construction only); the keeper reads habits; the pitcher's 7-pitch mix | beatable by intent | 6 + 10 |
