# Concept Lock - Duel

**Benchmark:** Soul Calibur weapon duel. Duel is the spacing-and-ring-out fight:
weapon reach changes the correct distance before a button is pressed, and the
edge is a win condition instead of just scenery.

**Mode id:** `duel` | **Implementation:** `lib/babylon/modes/DuelMode.ts` |
**Route:** `/play/duel`

## Criteria

| # | Criterion | Status |
|---|---|---|
| A1 | 8-way movement orbits and closes around the opponent | Locked |
| A2 | Fists, staff, and blade trade reach, speed, and power | Locked |
| A3 | Weapon pick and rival counter-pick happen once per round flow | Locked |
| A4 | Guard, parry, guard impact, and substitution are distinct defensive reads | Locked |
| A5 | Ring-outs end a round immediately on the picked arena boundary | Locked |
| A6 | Best-of-three round structure survives clock expiry and draws | Locked |
| A7 | KO, ring-out, guard-impact, and critical-edge beats are visible in HUD and presentation | Locked |

## Deviations

There is no licensed weapon set, stage, or character borrowing. The lock is the
Soul Calibur grammar: reach first, edge pressure always live, and defensive
timing deciding whether the next hit is earned.
