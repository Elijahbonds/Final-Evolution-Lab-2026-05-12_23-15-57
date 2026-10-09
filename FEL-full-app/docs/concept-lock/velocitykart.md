# Concept Lock — Velocity Kart

**Benchmark:** arcade kart racing: circuit laps, drift/mini-turbo, items,
rivals, ghosts, and cup progression. The mode was built rather than revived;
its file header names kart maps and gameplay as the product promise.

**Mode id:** `velocitykart` · **Implementation:** `lib/babylon/modes/VelocityKartMode.ts`
· **Route:** `/play/velocity-kart`

## Criteria

| # | Criterion | Status |
|---|---|---|
| A1 | Road circuit and checkpoint order define the race | Locked |
| A2 | Drift banks boost / mini-turbo instead of being cosmetic | Locked |
| A3 | Items and rival contact affect race position | Locked |
| A4 | Ghost and cup state give the race memory | Locked |
| A5 | Phone path exposes gas, brake, item, drift, tricks and boost | Locked |

## Deviations

The kart body is a game vehicle, not an athlete body; primitive fallback is
acceptable until a real kart asset exists.
