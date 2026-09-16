# DUNK 10-PHASE PASS — P10, the proof (rc25, 2026-09-16)

Instrument: `scripts/probes/_dunk-lab.mts`. Every number below is a live production build, not a unit test.

## The three points of the ladder, measured

| what the player does | execution | outcome | card |
|---|---|---|---|
| presses the instant the read lifts (0 ms reaction) | 26% | **clanks off the iron** — "SCORPION · THREW IT AT THE IRON TOO EARLY" | miss |
| answers the prompt like a human (180 ms) | 46% | goes in | ~36–38 |
| waits for the window's own tell (NOW!) | 74–76% | goes in | 42–45 |

rc22, before the pass: **every** press scored EXECUTION 0% or 68%, every dunk flushed, and the card moved 5 points.

## What separates dunks now

DIFF, same run-up, same slam: TOMAHAWK 7.1 · WINDMILL 7.6 · CRADLE 7.9 · SCORPION 8.7 · a WINDMILL → 360 combo 10.0.
rc22 read **10.0 for all of them**.

## The body

`scorpion → dunk_scorpion → dunk_score_hang` — the called dunk keeps its own shape through the flush. rc22:
`scorpion → dunk_scorpion → dunk_finish_tomahawk`, and the banner shouted TOMAHAWK!. A plain dunk still earns the
windmill flourish, because there the game is not renaming anything.

Scorecard body for dunk: **10** (0 T-arms, 0 awkward, 0 clip-less frames), up from 9.3.

## The scorecard, whole card

`| dunk | 9.3 | 9.8 | 10 | 8 | 9.9 | 9 |` — 29/29 games still pass with the dunk pass in.
(fps p10 read 50 on this run against 60 before; the machine was building and serving at the same time. Worth a
re-measure on a quiet box before reading anything into it.)

---

## The new moves, and the audit (2026-09-16, after the ten phases)

Owner: *"add cartwheel dunks, dubble ups, tetris dunk, add back flip dunks, add the kick up"*, then *"look at the named
dunks on youtube and see if the dunks named are being performed properly"*, then *"the kick up eastbay - by Elijah
Bonds"*.

| move | where it lives | verified live |
| --- | --- | --- |
| BACK HANDSPRING (was the cartwheel) | runway, `X` | rc26 · `dunk_back_handspring` on the rig · DIFF 10.0 vs 7.6 |
| BACKFLIP | runway, `B` + UP held | rc26 · `dunk_backflip` on the rig · DIFF 10.0 |
| DOUBLE-UP | runway, `A` in the gather window | rc26 · `dunk_double_up` on the rig · DIFF 9.1 |
| THE TETRIS | obstacle: two of the game's own bodies, stacked | rc26 · "OVER THE TETRIS!" · DIFF 10.0 vs 8.1 |
| THE KICK-UP EASTBAY | signature: `kickup` + `eastbay` | rc26 · banner "THE KICK-UP EASTBAY — ELIJAH BONDS" |
| LOST & FOUND (fixed) | air, `left` + `B` | rc26 · `[DUNK-CUE] spin 1 turn(s) @0.30 → rim-facing by 1.00` |

**The audit.** Scorpion, Hide & Seek and Between-the-legs are honest. LOST & FOUND was not: the real dunk is a
self-alley-oop thrown behind the back with a full 360 under it, and ours had the behind-the-back hand-off with no lob
and no spin — plus a clip that keyed its own hip yaw, which is exactly what a `spinThrough` trick must never do (whole
turns are a yaw LAYER so a crossfade cannot strand a body half-way round).

**The double-up had never fired.** `A` is the jump, so a press one stride early took off instead; the window was 1.8 m
at 4 m/s — about 0.26 s at a full run, for a move nothing taught. It is 3.2 m / 3 m/s now, and the hold-run hint is the
move list (`runwayTeachLine`, built from `RUNWAY_TRICKS` itself), which turns into `DOUBLE-UP — tap A` inside the window.

**Two faults only a frame of the runway could show** (`SHOT_AT_MS` in the lab):
1. `OVER THE ${label}` + a label of `THE TETRIS` = the game shouting **OVER THE THE TETRIS**.
2. Two winged elbows on the stack that read as the rider flexing — they were the **base's** arms, his own head hidden
   behind the rider. Settled by moving the rider's arms and watching these not move; the carry holds the shins down
   against the chest now.

---

## The physics / aesthetics / visuals / effects pass (2026-09-16)

Owner: a 10-phase pass on physics, aesthetics and visuals — "effects?". Decisions: full effects pass, feel-first
physics measured rather than re-solved, **60 fps p10 as a gate**, commit only.

**P0 — the instrument.** `scripts/probes/_dunk-look.mts`. A frame at each beat the mode itself announces, and the cost
of the whole attempt split by beat (fps p50/p10/p1, worst frame, active meshes, particle systems, live particles).
Screenshots corrupt a frame record, so `SHOTS=1` and the cost run are separate.

| phase | the fault, as seen in a frame | where it lived |
| --- | --- | --- |
| P1 | the flash **hid the dunk** — opacity 0.85 over the whole viewport | `JuiceKit`, 20+ callers in 10 modes |
| P2 | the ball trail was a **pile of orbs**, not a trail | `EffectsKit.ballTrail` + the mode's levels |
| P3 | the runway **taught mid-flight** ("DOUBLE-UP — tap A" in the air) | `DunkMode.launchDunk` |
| P4 | the gulls were **white rectangles** flying through the play | `EffectsKit.ambient` |
| P5 | the **net splash** fired in the judges' step, seconds late | `DunkMode.contactPunch` |
| P6 | **every landing** raised the same puff | `DunkMode.landSettle` |
| P7 | the shadow was **four black spikes** (acne at a grazing sun) | `LightRig` cascaded shadows |
| P8 | the verdict **overlapped itself** — two blocks 2% apart | `components/games/dunk-babylon.tsx` |
| P9 | the gate | measured on rc31 |

**The gate, measured:** fps p10 **54.1 → 59.2**, p1 53.5 → 56.5, worst frame 20 ms, peak particles **129 → 99**. The
pass costs less than the baseline it replaced.

**The physics, measured rather than assumed:** a true parabola, 1.84 m of rise, the ball crests at 3.35 m, iron contact
at 3.22 m with the let-go at 0.175 m of clearance, through the net 304 ms after. About a third longer in the air than a
person manages — deliberately, because the trick vocabulary does not fit in a human 0.9 s hang — and internally
consistent, so it stays.

---

## The vocabulary audit and the chains (2026-09-16)

Owner: "make sure they are performing each dunk as dynamically as they could, it's a dunk contest… cross reference each
one with something you can find on YouTube", then five named chains.

**THE LEGS NEVER MOVED.** `AIR_LEGS` — one symmetric tuck, both thighs −30°, both knees 45° — was on every key of the
windmill, the tomahawk, the cradle, the lost & found and the hide & seek. Five of the ten named dunks flew from take-off
to flush with legs that never moved and were mirror-identical: a one-foot take-off is asymmetric by construction, and
nobody holds a shape for a second in the air. There is a leg vocabulary now (drive / spread / kickBack / kickOut /
cross / tuckTight / long) and three tests across the whole vocabulary — not one flies with frozen legs, every one
finishes LONG, and somewhere in every dunk the two legs are doing different things. They caught the 360 (finished still
tucked; 0.12 m of leg travel in the whole trick) and the double clutch on top of the five.

**The audit, against the real dunks.**

| dunk | verdict |
| --- | --- |
| EASTBAY | ✓ Rider's East Bay Funk Dunk is a between-the-legs with a one-handed finish — ours is that |
| BETWEEN THE LEGS | ✓ same family, different execution (the plain transfer) |
| HIDE & SEEK | ✓ hidden behind the head, revealed late |
| LOST & FOUND | fixed earlier this day — it is a behind-the-back self-oop **with a 360** |
| **SCORPION** | **wrong** — Kilganon's is a NO-LOOK, BEHIND-THE-BACK jam: he watches the floor and brings the ball behind him. Ours had the arch (which is what names it) and then his head UP and the ball out FRONT. Its own test asserted the opposite of the real dunk on both counts. |
| TOMAHAWK | shape was wrong: it is a SPREAD EAGLE, and ours flew tucked |
| WINDMILL / CRADLE / 360 / DOUBLE CLUTCH | motion correct, legs static — fixed above |

**THE CHAINS.** Five named combinations in `SIGNATURE_DUNKS`, credited, order-sensitive. Four needed pieces the
vocabulary lacked: the plain BEHIND THE BACK, its FAKE, and the DOUBLE EASTBAY (two passes through the legs in one
jump). X had never been read in the air, so the slots were free. `trickCapacity` gained a third tier — a full-speed
attack buys three, obeying the mode's own rule that the run-up owns how many fit.

Two faults that only driving it could find: the **recognizer carried its own button list** (`A || B || Y`, twice)
beside the table lookup, so an X trick was silently undroppable — no banner, no refusal, no log; and a **threshold
placed on the exact value of a float sum** (full-speed POWER "is" 1.55 and evaluates to 1.5499999999999998) refused the
dunk it was sized for, through two builds.
