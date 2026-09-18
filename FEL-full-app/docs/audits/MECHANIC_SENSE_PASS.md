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

---

# Pass 2 — the verdict contract

## Fixed: Karate VS recorded every win as a loss

`KarateVSMode.ts:314` ends with `'MATCH_WON'` / `'MATCH_LOST'`. `karate-vs-babylon.tsx:37` compared
`r.outcome === 'WIN'` — a string the mode never emits. `won` was therefore **false for every match
ever played**, so a won fight displayed "DEFEATED" and posted as a loss.

The same file had a second bug of the same shape: `score: Number(r.stats?.wins ?? 0)`, but the mode's
stats are `{ rounds, foeWins }` — there is no `wins` key, so the score was **always 0**. The score
rides `r.score`, now floored at 0 because the mode's own formula (`myWins * 100 - foeWins * 40`) goes
negative on a sweep.

Its sibling `mixedcombat-babylon.tsx` already carried both fixes *and a comment describing them*.
karate_vs was simply missed.

## Fixed: Duel had the identical mismatch
`DuelMode` emits `'DUEL_WON'`; the host compared `'WIN'`. Duel is retired from
`ENABLED_BABYLON_MODES`, so it harmed nobody — it would have bitten on revival.

## Fixed: dead residue in the dunk host
`dunk-babylon.tsx` still compared `'WIN' || 'CONTEST_WON'`. The `'WIN'` half was dead on arrival —
`DunkMode` only emits `CONTEST_WON` / `CONTEST_LOST`. Removed: a comparison against a string the mode
cannot produce reads like a second supported outcome, and is how this drifts again.

## The root cause, and the fix that outlives this pass

A mode ends with `ctx.end('SOME_STRING')`. Its host decides "did the player win" by comparing
`r.outcome` to a literal it holds **independently**. Nothing links them. That pair has now drifted
apart four times — dunk, mixedcombat, karate_vs, duel — each found by hand, months apart.

`tests/locomotion/verdict-contract.test.ts` reads both sides from source and fails if a host compares
any outcome its mode cannot emit. It caught the dunk residue on its first run.

**Add a row when you add a mode.** That is the point of the list being explicit.
