# "Does this mechanic make sense?" — pass 1

**Date** 2026-09-12 · Scope: enabled modes, reading for *coherence* rather than correctness.

The question is not "does it run" — the suite already answers that. It is: does the rule the code
enforces match the rule the game claims, and does the fantasy survive it?

## Fixed

### 1. Skate — "LAND A 800+ COMBO" did not require landing
`SkateRunMode.ts` tested `combo.pot >= 800` **every frame**. `pot` is the live, in-progress chain;
`bank()` lands it, `bail()` burns it. So the goal credited the instant an airborne chain crossed 800,
and bailing on the very next frame kept it.

That removes the only tension skating has. A pot is worth nothing until you roll away from it —
that is the entire risk/reward loop, and the goal was paying out before the risk resolved.

Now scored inside the banking block off `banked`, the value `bank()` actually returns.

### 2. Skate — the buzzer paid for combos you never landed
`finalScore = combo.banked + combo.pot + coins * 5`. The live pot again: a run ending mid-air paid in
full, making the optimal endgame "throw the biggest chain you can as the clock dies and never land
it". It contradicted this mode's own rule, written 300 lines further down:

> *Skate 3's rule: you bank by landing and rolling away clean.*

Now: a rider who is **down and clean** at the buzzer is inside the settle window and would have banked
a moment later, so they are banked now. Anyone airborne, grinding or in a manual loses the pot,
exactly as a bail would.

## Checked and found coherent

- **Skate goal targets.** 5,000 points over 90 s needs ~55.6 pts/s sustained; a scripted probe run
  banked 45.1 pts/s (→ ~4,061). But one observed chain paid **2,926**, so two good chains clear it.
  A stretch goal reachable by combo play rather than grinding — that is deliberate design, not a bug.
- **Dunk judging.** Three-judge scorecard with variety memory (repeating a style+prop combo pays
  less), and `BAND_TOTAL` derived from `JUDGE_COUNT` rather than hardcoded — the file documents the
  earlier bug where a literal tuned to three judges would have broken silently at five.
- **Net sports.** `TennisMode.ts` is 27 lines of config over shared `NetSportMode` + `RallyCore`
  ("adding a net sport should cost a config, not a rewrite"). A first scan suggested tennis and
  volleyball had no scoring or end condition at all; that was the scan being wrong, not the game.
  This is the same pattern the locomotion core is chasing, already proven here.

## Open design questions — flagged, deliberately not changed

### 3v3 awards a draw to the player
`ThreeVThreeMode.ts:420` — at the buzzer, `myScore >= foeScore ? 'WIN' : 'LOSS'`. A 21–21 game
reports **WIN**.

Defensible for a 90-second arcade mode, and flipping it to a LOSS would feel punitive. But it is a
rule the game never states, and a player who ties and is told they won may not trust the scoreboard
the next time. Options: leave it, call it `DRAW`, or play next-basket-wins. **Your call — I did not
change it, because it is a design decision rather than a defect.**

## Not yet reviewed
Combat (karate / karate_vs / mixedcombat), football, carnival, freerun, dance, golf/derby/penalty,
who_scene_it, big air, snowboard, surf. This pass covered skate, dunk, 3v3 and the net sports.
