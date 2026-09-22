# Combat suite — reference decode (ten-phase pass, phase 2, 2026-09-22)

The owner's bar for the fight modes, in his words: "Fighting — Endless, vs, mixed combat. Add more dynamic movement,
dashes with X, all button presses lead to different combos — look at how Naruto Storm is played" (09-17); "Add enter
the matrix physics and combat" (09-18); arenas with walls to run off and three per mode (09-18); the Hundred's "laggy"
(09-14). Duel is the Soul Calibur lane by its own header; Showdown is the Storm lane built on StrikeSystem.

## The references, as grammar

| Reference | Movement | Attack grammar | Defence | Resource / burst | Stage |
|---|---|---|---|---|---|
| **Naruto Ultimate Ninja Storm** | free 3-D run; X tap = dash, double tap = chakra dash (homes), hold = guard | ○ strings (4–5 hits) branch by stick direction (neutral / forward / back / up); △ = jutsu (chakra), ○ in the air = air string, launcher → air → spike | guard (hold), **substitution** on a hit's first frames (costs chakra, teleports behind), guard break by throw/heavy | chakra meter: charge (hold △), spent on dash/sub/jutsu; awakening at low HP | walls to run up (chakra), edges bounce, support assists |
| **Soul Calibur** | 8-way run on a disc, facing locked | A/B/K + directions; strings of 2–4; guard impact (block + toward) reflects | guard (hold), **guard impact** window ~6 f, just-guard | soul gauge (guard burn), critical edge | **ring-out** wins the round; edge pressure is a plan |
| **The Matrix (game read)** | bullet time on a meter: the room slows, you less | any hit in Focus launches; wall run → kick | the dodge in bullet time (lean) | Focus refills on hits / dodges / KOs | walls to run along; a kick off the wall drops the line |
| **Beat-em-up (Sifu / Arkham) for the horde** | 22 rad/s turn, lunge to the target | strings with **cancel points**; a press before the cancel queues; crowd stun on enders; grab/throw | parry on cue (perfect window at the FIRST frames), dodge | focus/chi | crowd geometry, walls |

## FEL today (measured phase 1)

| Mode | Grammar file | X button | strings/cancel | defence | Focus | arenas |
|---|---|---|---|---|---|---|
| karate (Hundred) | HordeDynamics book + StrikeQueue, StormCombat X | tap dash / double chakra / hold guard | 16 moves, air links, cancel points on the game clock, 0.4 s queue | perfect dodge (first 0.12 s), guard | yes (R2, room 0.32 / hero 0.92), wall run + kick | 3 (gauntlet, cage, foundry) |
| karate_vs | FightCore attacks (jab 120 / kick 180 / heavy 260 ms startup) + book + XButtonReader | tap dash / double / hold guard | queue of ONE key, stale 0.4 s | parry, guard, block | yes (pass 2) | 3 (dojo, cage, foundry) |
| mixedcombat | same + loadout | same | same | same + ropes | yes | 4 (dojo, cage, foundry, pit…) |
| showdown | StrikeSystem (frame data) + DefenseSystem + ResourceMeter | **X = block only**; L1 = dash-cancel (chi); R1 = substitution; SELECT assist; full chi + Y ultimate | StrikeSystem cancel windows | parry / guard impact / substitution | **no** | ? |
| duel | StrikeController + arsenal (fists / staff / blade) | block-tap; guard impact = block + toward inside 90 ms | weapon movesets | guard impact, parry | **no** | 3 drops (pit, rooftop, cliff) |

Baseline numbers (`_hundred-dynamics-probe`, fake pad, 39 strike presses each): karate_vs 27 swings, **13 eaten**,
press→swing median **545 ms**, walk 0.78 m/s under a held stick, the X tap produced **no dash** (pressed inside a heavy's
recovery — refused, not queued); mixedcombat 27 swings, 12 eaten, median 558 ms, dash peak 7.6 m/s. karate (the Hundred, the reference implementation of the de-lag): 31 swings, **0 eaten**, 28 cancels, 17 lunges, 6 redirects, a dash peak of 19.2 m/s, 3 slow-mo beats, 7 finishers in 20 s; showdown 40 presses → **8 swings, 32 eaten (80 %)**, median 318 ms, ground speed **0.00 m/s** under a held stick (the fake pad's stick never moved him); duel 40 presses → **5 swings, 35 eaten**, no dash, ground speed 0.00 (same).

## The gap table

| # | Gap | Reference rule | Phase |
|---|---|---|---|
| G1 | Showdown's X is block; Duel has no dash. Storm's X is dash / chakra dash / guard on every mode | one X reader (StormCombat) on all five; Showdown's block moves to the hold, L1 keeps the chi dash-cancel | 3 |
| G2 | a press during a swing is queued ONE deep and stale in 0.4 s; a third of a mash is eaten; the queued press waits for a cancel point ~half a second out | Storm/Sifu: the press at the cancel point fires the NEXT link; the cancel point is ~40 % into the clip; a queue holds the latest press but never drops a link mid-string | 4 |
| G3 | a dash pressed mid-recovery is refused | the dash cancels recovery past the cancel point, else queues | 3/4 |
| G4 | hit reactions are clips on a root that does not move (the ankle-bite finding, again) | a hit displaces the body by the attack's knockback on its bones; a launcher lifts the hips | 5 |
| G5 | defence windows are per-mode constants nobody measured (perfect dodge 0.12 s, guard impact 90 ms, substitution ?) | Storm sub ≈ first 10 f; SC guard impact ≈ 6 f | 6 |
| G6 | Duel's arenas are drops only; Showdown's arena unknown; wall run only on horde/VS/Mixed | every mode: at least one wall to run, one edge that decides | 7 |
| G7 | Focus missing on Showdown + Duel | the Matrix read is suite-wide | 8 |
| G8 | banners: hit / KO / round / ring-out inconsistent across modes (Duel's format differs; Showdown never ends) | every connect, KO, round reads the same way and reaches the caption bus | 9 |
| G9 | Mixed is unwinnable by ring-outs, Showdown never ends (only heavies land), Duel's rival blocks everything | the rival can be beaten AND can beat you; every match ends | 10 |
