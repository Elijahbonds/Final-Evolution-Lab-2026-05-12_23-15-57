# The right stick, decoded against 2K (Phase 2 of the hoops upgrade pass, 2026-09-22)

Owner, 2026-09-18: *"optimize dribble moves with the right stick next pass. look at 2k controls and dribble
tutorials, look at a steezo tutorial."* The stick handle on disk (`lib/babylon/core/StickHandle.ts`, consumed by
1v1 and 3v3) was tuned by feel. This is the reference it is now measured against, and the gap, row by row.

## Sources

- NBA 2K26 official game guide, Gameplay — Pro Stick dribble moves and shooting (`nba.2k.com/2k26/game-guide/gameplay/`)
- 2K controls guides (lockercodes.io, magicgameworld.com) for the escape / RT-held variants
- Steezo (Steezo The God) ISO tutorials for 2K25/26 — by title and description only; the videos themselves were not
  watched. What they consistently teach: the **escape** (R2 + flick) as the spine of every combo, the **snatchback**
  (a step-back that crosses), **momentum spins** chained back-to-back, the **freeze** (a held stick that stalls the
  defender and then explodes), and speed — the whole vocabulary thrown inside a second or two, never returning to a
  neutral dribble between moves. That is the FEEL target, over and above the map.

## 2K's grammar (ball in the RIGHT hand; everything mirrors when the ball is in the left)

| Move | Stick | Modifier |
|---|---|---|
| Hesitation | flick **toward the ball hand** (right) | — |
| In and out | flick **up** | — |
| Between-the-legs cross | flick **away from the ball hand** (left) | — |
| Crossover | flick **up-away** (up-left) | — |
| Behind the back | flick **down-away** (down-left) | — |
| Step-back | flick **down** (plain) | — |
| Step-back crossover (snatchback) | flick down | **R2 held** |
| Spin | **rotate** the stick (clockwise, ball right) | — |
| Half spin | quarter-circle | — |
| Breakdown combo | flick up | R2 held |
| Size-ups | left/right, or up, **repeatedly in rhythm** | — |
| Escape version of any move | the same flick | **R2 held** |
| Quick protect / hold off | **L2 tap / L2 hold** while dribbling | — |
| Eurostep / hop step (finishes) | down-away / down-L or R at the rim | R2 for the hop |

Two things define the grammar more than any single row: **the map is relative to the ball hand**, and **R2 held is
the escape** — the sharper, travelling version of the same gesture.

## FEL today (`stickMoveFor`, absolute — the ball hand is never read)

| Gesture | FEL move |
|---|---|
| flick left / right | crossover — **momentum cross** if `speed01 >= 0.4` or sprinting |
| flick down | hesi |
| flick down-diagonal | behind the back — **momentum BTB** if moving or within 0.7 s of a move |
| flick up-diagonal | size-up cycle (yoyo → in-and-out → between-legs) |
| flick up | in-and-out (between-the-legs if slow and pressured) |
| L2 + flick | spin |
| L2 + down | step-back (arms the step-back jumper) |
| hold | PAUSIN' (freeze) |
| half-circle sweep | steezo roll (drop step at the rim with turbo) |

The ball hand exists — `ballCarry.side`, swapped by `switchHand()` on every crossover — and no mode reads it.

## The gap

| | 2K | FEL | Decision for Phase 3 |
|---|---|---|---|
| Frame of reference | ball hand | absolute | **Mirror `dir8` by `meCarry.side`.** One line at the read; every row below assumes it. |
| Hesi | toward the ball hand | down | **Move to "toward the ball hand".** Down is freed for the step-back. |
| Between the legs | away from the ball hand | up, only when slow + pressured | **Away from the ball hand, always.** No more speed gate. |
| Crossover | up-away | left / right | **Up-away.** Left/right no longer cross. |
| In and out | up | up | keep |
| Behind the back | down-away | down-diagonal (either) | **Down-away only.** Down-toward becomes free (or the eurostep at the rim). |
| Step-back | plain down | L2 + down | **Plain down.** L2 is freed. |
| Snatchback | down + R2 | — (missing) | **Add**: step-back that crosses to the other hand. |
| Spin | rotation | L2 + flick | **Rotation is the spin.** The sweep detector already measures ≥140°; it becomes spin, half-turn = half spin. |
| Steezo roll / drop step | (a momentum spin at the rim) | half-circle sweep | **Rotation + R2.** Keeps the drop-step branch already coded. |
| Escape / momentum | R2 held | inferred from speed ≥ 0.4 | **R2 held decides.** Speed alone no longer promotes a move — a walking flick is a plain move, as in 2K. |
| Size-ups | up or L/R in rhythm | up-diagonal cycle | keep up-diagonal for now; a rhythm detector is a Phase 4 item if it measures worth it |
| Freeze / pausin' | (a held stick; steezo's "freeze") | hold | keep |
| L2 while dribbling | protect (tap) / hold off (hold) | spin + step-back modifier, post-up | **After the remap L2 is free:** tap = protect, hold = hold off; post-up stays contextual near the block |

## What this changes in the detector (`StickHandleReader`)

- Nothing for flicks: `dir8Of` already gives the eight ways; the mirror is applied after it.
- The **sweep** becomes the spin. Its `sweepRad` (2.4 ≈ 140°) is a full spin; a quarter-circle (≈ 90°) inside
  `sweepSec` is the half spin — one new threshold, same accumulator.
- **R2 held** must reach `stickMoveFor` as a read (`escape: boolean`), the way `brace` does today.

## What gets measured (Phase 3's bar)

Every row above becomes one `[X-STICK] gesture → move` line in the lab. The pass is: each 2K gesture, thrown with the
ball in each hand, produces the 2K move, in 1v1 and in 3v3, ≥ 95 % of throws — measured with the in-page emitter the
lab already has (`PLAY=rstick`), before and after.

## Measured (2026-09-22)

Before, 1v1, six possessions: 14 throws produced effectively two moves — 12 of 14 read as `momentum_cross` because
speed alone promoted a side flick, and the L/R/L/R spam scored a chain-4 highlight with an 0.80 ankle-break. Against
the eight 2K gestures: 1/8.

After, 3v3, six possessions: 8/8 in every possession, every line tagged with the ball hand; the rotation is the spin
every time. 1v1: 16/16 throws that reached the reader mapped correctly, all eight gestures represented; fewer throws reached it
because 1v1's possessions ended after three or four (the hero lost the ball, 0/6 offence, as in the before run) — a
pre-existing 1v1 possession behaviour under the lab's jog at the defender, open by name.

Open, for Phase 4: a rotation's entry sample crosses the flick ring before the 140° accumulates, so every spin is
preceded by a spurious in-and-out. Either the detector defers a flick while the stick keeps turning, or the spin's
own start cancels the flick's clip — measured, not guessed.

