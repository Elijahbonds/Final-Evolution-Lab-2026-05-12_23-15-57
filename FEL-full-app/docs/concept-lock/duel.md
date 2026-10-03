# Concept Lock — Duel

**Benchmark:** Soul Calibur lane weapon duel, as stated in `DuelMode.ts`:
8-way run, weapon reach/speed/power tradeoffs, guard impact, ring-out, and
best-of-three pacing.

**Mode id:** `duel` · **Implementation:** `lib/babylon/modes/DuelMode.ts`
· **Route:** `/play/duel`

## Criteria

| # | Criterion | Status |
|---|---|---|
| A1 | 8-way movement around a locked opponent | Locked |
| A2 | Fists / staff / blade change reach and tempo | Locked |
| A3 | Guard impact is a timing read, not a passive block | Locked |
| A4 | Ring-out is an immediate round loss condition | Locked |
| A5 | Rounds resolve through best-of-three match pacing | Locked |

## Deviations

Weapon identities are original. The benchmark comparison is the duel grammar:
spacing, reach, guard impact, and ring edge pressure.
