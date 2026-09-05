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

## Landed (2026-09-05)

- `lib/babylon/nexus/courtLocations.ts`: the location table, `applyLocation` (identity for Venice / unknown / non-basketball
  specs; strips the dressing kinds and keeps hoop, backboard pole, net, banner, crowd tiers), the pick (`?location=` →
  `fel-court-location` → Venice), and Blossom Park's decoration (procedural cherry trees, petal fall). 4 tests.
- `mountVenue(ctx, key, { location })` applies the overlay before the build, swaps the Kenney prop set, and runs the
  location's decoration under the venue root after the build. `HarnessOpts.location` → `ModeContext.location`; the five
  basketball modes pass it; the four basketball game components and the dev harness read the pick.
- Boot splash: a LOCATION row (ready locations only) on the ready and loading states of basketball splashes; a pick is
  remembered and reloads the route with `?location=`; the splash's eyebrow, tint and art follow the pick.
- Under a location the scanned Venice court map is NOT mounted (its palms and walls are baked into the GLB); the spec's
  own court, markings and hoop stand, at the same rim position. Venice with no pick keeps the map.
- Measured: Venice with no pick renders as before (dunk 60 fps, 31 draws, 0 errors). Blossom Park: dunk 60 fps, 81 draws;
  ones 60 fps, 63 draws; threes 60 fps; 0 errors everywhere. Texture footprint equal to Venice on both tiers (197.6 MB
  desktop, 93.6 MB mobile — the backdrop swaps one baked sky for another, the petal sprite is 16 px, the trees are meshes).
- Two passes on the trees: the first ring stood outside the dunk camera's 0.9 rad cone (invisible); the second read as
  white cloud under the grade and the location's fog — now deeper pinks, smaller and more heads, fog 0.0022.
- Orbit, Canopy Court and Night Rooftop are authored as environments but `ready: false` (hidden from the picker) until
  their decoration passes land.
- **Orbit landed (2026-09-05)**: a starfield painted on the inside of a 380 m sphere (inside the venue's own 400 m sky,
  which is opaque — a 900 m dome was hidden behind it), a planet of 80 m rising over the horizon behind the hoop with a
  procedural blue-white marble and a dark terminator, slow star drift; no backdrop, no fog. dunk 60 fps / 30 draws, ones
  60 fps / 31 draws, 0 errors; texture footprint BELOW Venice (176.7 MB desktop, 72.6 MB mobile — no baked sky image).
