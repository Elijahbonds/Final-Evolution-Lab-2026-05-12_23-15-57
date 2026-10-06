# Concept Lock — Brain Brawl

**Benchmark:** Trivia Crack category wheel plus Big Brain Academy graded
cognitive minigames, readable as a Mario Party-style stage show. This is the
Babylon party-mode version documented in `BrainBrawlMode.ts`.

**Mode id:** `brainbrawl` · **Implementation:** `lib/babylon/modes/BrainBrawlMode.ts`
· **Route:** `/play/brain-brawl`

## Criteria

| # | Criterion | Status |
|---|---|---|
| A1 | Category wheel selects the challenge and lands honestly | Locked |
| A2 | Challenges grade speed and accuracy, not just trivia recall | Locked |
| A3 | Solo and duel flows both run from the same stage | Locked |
| A4 | Host, contestants, answer reveal, and score pops make outcomes readable | Locked |
| A5 | Replay restarts in place without rebooting the whole shell | Locked |

## Deviations

No Blueprint content, spaced repetition, or backend feed mechanics belong in
the standard match. It is a self-contained party cognition game.

## Owner decision 2026-10-06: the REVIEW round (Knowledge Feed v2)

"Brain Brawl 'Review' round: YES, as a separate round type; normal Brain Brawl
stays generic and unchanged."

- **Separate round type, separate entry.** `/play/brain-brawl?round=review`,
  reached from the Learn feed's "Test yourself" (`components/learn/feed-card.tsx`).
  Without that parameter the page is the standard match, exactly as locked above
  (A1–A5 unchanged; its generators and tests untouched).
- **What it asks.** Up to five of the player's own learned quiz cards (answered
  at least once in `/learn`), picked by `lib/knowledge/review.ts`: due reviews
  first, weakest Leitner box first, at most two per topic. Read from the device,
  or from the account for a verified adult who syncs. Fewer than three learned
  cards: the mode says so and plays a standard match.
- **How it plays.** Solo, no wheel and no claims. Each card is timed (20 s) and
  graded like any challenge, on speed and accuracy (`challengeScore`, tier 1).
  The answer's "why" shows at the reveal. It keeps its own best
  (`fel.brainbrawl.review.best`) and never posts a "win".
- **What stays out.** The standard match still reads no feed content and runs
  no spaced repetition. The review round reads the Leitner schedule to choose
  its questions but does not write answers back to it (a fuller version could).
- **Code.** `BrainBrawlCore.ts`: `RoundKind`, `roundKindFrom`, `reviewChallenge`,
  `REVIEW_*` (appended). `BrainBrawlMode.ts`: the REVIEW ROUND block, plus one
  hand-over line each in `showPick`, `begin`, `resolve` and `afterResult`.
  `modes/brainBrawlReview.ts` loads the set. `brainbrawl-babylon.tsx`: a review
  strip in place of the claims, the "why" at the reveal, and a three-answer card
  hides its empty fourth button.
