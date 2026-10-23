# Concept Lock - Showdown

**Benchmark:** Naruto Storm arena fighting with a support partner. The mode is
not a plain karate clone: the signature promise is spending chakra and partner
resources to extend pressure, escape pressure, or cash out into a cinematic
ultimate.

**Mode id:** `showdown` | **Implementation:** `lib/babylon/modes/ShowdownMode.ts` |
**Route:** `/play/showdown`

## Criteria

| # | Criterion | Status |
|---|---|---|
| A1 | Lock-on arena movement keeps both fighters readable | Locked |
| A2 | Tap X dashes, double-tap X chakra-dashes, and hold X guards | Locked |
| A3 | Chakra is a visible resource spent on dashes, substitution, and ultimate | Locked |
| A4 | SELECT support assist extends pressure and has a cooldown | Locked |
| A5 | R1 substitution answers a committed incoming strike, not neutral movement | Locked |
| A6 | Full chakra + Y plays a cinematic ultimate with a clear damage/cash-out beat | Locked |
| A7 | Rounds, timer calls, KO beats, and match verdicts publish through the shared HUD | Locked |

## Deviations

The cast, arenas, and effects are original FEL work. The lock is the Storm-style
combat grammar: dash pressure, support timing, substitution reads, and chakra
cash-out.
