# Concept Lock - Tiebreak Blitz

**Benchmark:** Tennis tiebreak pressure compressed into a timing rally. The
mode's promise is not a full tennis sim; it is the decisive return window:
read the side, wait for the closing ring, and win by two under mounting tension.

**Mode id:** `tiebreak` | **Implementation:** `lib/babylon/modes/TiebreakMode.ts` |
**Route:** `/play/tiebreak`

## Criteria

| # | Criterion | Status |
|---|---|---|
| A1 | First to the target must still win by two | Locked |
| A2 | The incoming side determines the correct left/right return | Locked |
| A3 | The hit-window ring closes onto the ball before the valid swing window | Locked |
| A4 | Warm-up balls teach the timing before score can be lost | Locked |
| A5 | Rally, best rally, swing timing, and match call are visible to the player | Locked |
| A6 | Rival serve, return swings, bounce cue, ball shadow, and outgoing flight make the rally legible | Locked |
| A7 | Set-point and win-by-two tension change presentation without changing the pure rally rules | Locked |

## Deviations

No doubles positioning, full tennis shot taxonomy, or court-selection meta is in
scope for the standard match. The lock is the tiebreak moment: side read,
timing discipline, and pressure scoreboard.
