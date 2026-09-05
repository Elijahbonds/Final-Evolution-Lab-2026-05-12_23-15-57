# Court locations — spec (owner ask 2026-09-05)

Elijah: "let people choose their location in the basketball modes … cherry blossoms, the space one, the forestry one …
keep Venice but add other locations that will be beautiful."

## Owner decisions (2026-09-05, multiple choice)

| Question | Decision |
|---|---|
| When | after the football / three-point proofs on the production bundle |
| Which | **all four**, Blossom Park first: Blossom Park, Orbit, Canopy Court, Night Rooftop; Venice stays the default |
| Picker | on the boot splash before READY, remembered per player, honoured by `?location=` |
| Unlock | free for all in the friend test; the shop hook stays for later |

## The idea in one line

A location is the **environment half** of a venue spec swapped under the **court half**. Sky, horizon backdrop, mood,
surround props, ground surround and ambient particles change; the court, its markings, the hoop, the crowd tiers, the
actors and the camera do not. Play, rim and camera are untouched, so Venice is byte-identical when nothing is chosen.

## Where it plugs in

- `lib/babylon/nexus/venueSpecs.ts` — the three basketball specs (`basketball_dunk`, `basketball_h2h`, `basketball_3v3`)
  keep their court; a `courtLocations.ts` table supplies environment overlays keyed by location id.
- `lib/babylon/core/NexusVenue.ts` — `mountVenue(ctx, key, opts)` gains `opts.location`; it merges the overlay's
  environment / props / ground surround over the spec before building. No mode code changes beyond passing the option.
- Modes: DunkMode, DunkDuelMode, ThreePointMode, OneVOneMode, ThreeVThreeMode read the chosen location from the mode
  config (set by the game component from the splash pick / URL) and pass it to `mountVenue`.
- Picker: `components/games/boot-splash.tsx` gets a location row (thumbnails from `venueThumbs`, one per location) shown
  only for basketball modes; the pick is written to `localStorage` (`fel-court-location`) and to `?location=`.
- Budget: every location is measured with `_vram-diag` on both tiers; a location may not push a mode over 2× the median.

## The four locations (assets on disk only — Kenney CC0 kits, procedural textures; no downloads)

| id | Name | Sky / backdrop | Surround | Ambient | Notes |
|---|---|---|---|---|---|
| `venice` | Venice Beach Court | dusk, 'beach' backdrop (as today) | beach dressing | as today | default, unchanged |
| `blossom` | Blossom Park | soft pink-grey dusk, skyline horizon | nature-kit trees (`tree_default`, `tree_oak`, `tree_detailed`) with the leaf material tinted blossom pink at mount; benches / fence from the suburban kit | petal fall — the slope's snowfall system with pink petal sprites | first to build |
| `orbit` | Orbit | black; procedural starfield sphere; a planet sphere with a procedural blue-white marble texture on the horizon | none — the court floats; white lines on a near-black slab | slow drifting stars | cheapest, best screenshot |
| `canopy` | Canopy Court | deep green-gold dusk under trees | dense nature trees and bushes ringing the court; a painted mural wall behind the hoop (Meshy mural later) | dappled light: a leaf-pattern projection texture on the key light; leaf motes | mural wall painted until a Meshy pass |
| `rooftop` | Night Rooftop | night, lit skyline backdrop | parapet, string lights, rooftop furniture from the suburban kit | light bokeh | all procedural |

## Out of scope

Physics, rim position, court size, camera presets, the crowd, the Meshy mural (untouched), Studio.

## Acceptance

- Venice with no pick renders byte-for-byte as before (capture diff on the dev harness).
- Each location: a gauntlet-style capture on dunk, ones, threes; 0 errors; both tiers under the texture budget.
- The pick survives reload and is honoured by `?location=`; the splash shows the current pick.
