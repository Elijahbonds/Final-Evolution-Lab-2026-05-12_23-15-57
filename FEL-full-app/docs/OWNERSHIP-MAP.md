# Ownership map and commit gate (owner decision, 2026-09-05 15:30)

Two writers share this tree. Each area below has ONE owner; anyone else reads it, proposes in `docs/`, and does not edit
it. **Gate before every commit: `npx tsc --noEmit` clean and `npx vitest run` green, with the count in the message.**
Parallel agents work in isolated worktrees on lane ports (3005–3007, never 3000–3002) and merge through the lane owner.

| Area | Files | Owner |
|---|---|---|
| Court locations, venue specs, venue mount, props, kits of the venue | `lib/babylon/nexus/courtLocations*.ts`, `lib/babylon/nexus/venueSpecs.ts`, `lib/babylon/core/NexusVenue.ts`, `lib/babylon/visual/venuePropSets*.ts`, `lib/babylon/visual/VenueProps.ts`, `lib/babylon/ui/venueThumbs.ts` | Claude (this session) |
| Boot splash location row | `components/games/boot-splash.tsx` (LOCATION row only) | Claude |
| Pad chrome and verb tables | `lib/babylon/ui/TouchOverlay.tsx`, `lib/babylon/ui/modeVerbs.ts` | Claude — dunk's verbs by agreement with the dunk owner |
| Session-ending rules, drivers, probes, gauntlet, docs, kitchens, wallet fold, proof lines, MP | `lib/babylon/modes/{FootballRush,precision}Modes.ts` (rules), `scripts/**`, `docs/**`, `lib/kitchens/**`, `app/kitchens/**`, `components/kitchens/**`, `lib/wallet/**`, `lib/proofLine.ts`, `lib/mp/**` | Claude |
| Dunk feel, camera, slow-mo; Venice look pass and its assets; athlete bodies and loader | `lib/babylon/modes/DunkMode.ts`, `DunkDuelMode.ts` (feel/camera), `lib/babylon/visual/veniceSurroundVisibility.ts`, `public/models/maps/venice-*`, `public/models/elijah-*.glb`, `lib/babylon/core/CharacterLibrary.ts`, `lib/babylon/core/athleteRoster.ts`, `lib/babylon/modes/modeConfigs.ts` (hero/rival urls) | the second writer (Athlete / Venice LOOK lane) |
| Play shell copy, wallet chip copy, hub | `components/games/game-shell.tsx`, `components/dual-wallet-chip.tsx`, `components/hub-world.tsx` | the second writer (copy passes) — Claude for wiring |

Cross-lane needs go as a line in `docs/SHIP-PASS-5.md` under "Two writers, one tree" and a message to the owner. Two
exceptions stand from today: a one-line guard in the dunk modes so the Venice look steps aside under a non-Venice
location, and the athlete revert the owner ordered.
