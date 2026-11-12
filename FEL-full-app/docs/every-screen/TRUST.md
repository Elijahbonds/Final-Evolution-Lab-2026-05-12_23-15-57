# Numbers you can trust: what each measured number was checked on

Written by `scripts/every-screen/trust.mts` (it runs the code a phone runs; re-run it when a reader changes). Every result card, the jump check, the two screens and My progress show these as one line under the number (`lib/results/trust.ts`).

| Tool | Checked on | What it found | What the screen says |
|---|---|---|---|
| Jump (the jump check, the jump tests, readiness) | RECORDED: 6 of 7 motion-captured jumps (jump_two_foot_low, jump_two_foot_high), each read 11 times | mean miss 3.2 cm, bias -0.8 cm; the same jump read again moves 2.1 cm | ± (mean miss) on recorded jumps; ± (repeat spread) |
| The Mirror's movement screen | RECORDED: its landmark fixtures, 10 reads with the camera's noise | score 100 every time (± 0), 0 flags the key does not hold | ± points; no flag the recording lacks |
| The Quick Screen (Screen my movement) | SYNTHETIC: a clean computer-made mover, 8 screens | same colour 94 % of the time; angles ± 0.7°; the clean mover failed 5 of 48 checks; camera to result 143 s | same colour %; computer-made, no recorded screen yet |
| Sprint | SYNTHETIC: 70 computer-made runs at 60 fps | mean miss 0.001 s, 95 % within 0.003 s; the truth inside the run's own ± 85 % of the time | ± s; no recorded run yet |
| Bar speed | SYNTHETIC: 60 computer-made reps | mean miss 0.014 m/s (bias -0.012); the same set read again moves 0.014 m/s | ± m/s; no recorded set yet |
| Approach jump, bounce score (RSI), drop jump | not measured here | — | "Not yet measured on recorded ...: treat it as a camera estimate." |

Gaps for the owner: there is no recorded sprint, bar-speed set, approach jump or Quick Screen take with a known answer in the repository, so those lines say "computer-made" or "not yet measured". A recorded fixture for each (a phone video plus its timing gates, plate or force plate) would turn them into recorded measurements with no change to the screens.
