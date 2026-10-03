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
this mode. It is a self-contained party cognition game.
