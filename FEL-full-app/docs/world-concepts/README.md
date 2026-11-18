# World concepts from the "3D Art & Assets" agent (owner-shared, 2026-11-18)

The owner shared these four images in chat on 2026-11-18. They come from the owner's "3D Art & Assets" agent (Grok).
None of these specs were in the repo before this. Each image is labelled **IDEAS / PROPOSAL, not approved**, so treat
them as direction for the owner to confirm, not decisions. Decisions go in `docs/OWNER-DECISIONS.md`.

## 1. Open world v1 blockout (`open-world-v1-blockout.jpg`)

Header: "FEL open world v1 blockout (knob `story.openWorldV1`, off)". Grey lines are hub gates; orange lines are the
sky-moose / flight loop (30–45 m). Each zone streams as a separate level, in 100 m cells.

| Zone (theme) | Size |
|---|---|
| **Crossroads Court** (hub, Court) | 150 m |
| Sanctuary (exists already) | 60 m |
| Ch. 2 District (exists already) | 220 × 160 m |
| Sandstorm Reach (Sand) | 600 m |
| Mirror Hall (Mirror) | 450 m |
| The Lab (Static) | 400 m |
| Blue Courts (Tide) | 500 m |
| Ember Heights (Ember) | 450 m |

The knob `story.openWorldV1` does not exist in the repo.

## 2. World map concept (`world-map-concept.jpg`)

Header: "PROPOSAL, not to scale". It shows a hub plus 5 zones, joined by Kaelor flight or gate travel, with each zone
streamed separately.

- **Hub:** Crossroads Court, about 150 m, for 60–80 players.
- **Ch. 2 District:** about 400 m. This is the **first zone**, at 24–40 players per instance.
- **Sanctuary:** 60 m.
- **Finale Venue:** about 360 m, a night arena.
- **Blue Courts:** about 450 m, coast and piers.
- **The Lab:** about 400 m, test arenas.
- **Sandstorm:** about 600 m, dunes and canyons.

## 3. Partner roster (`partner-roster.jpg`, dated Nov 3, 2026)

Header: "IDEAS, not approved". These are Blender block shapes at true scale.

- **Kaelor:** a winged partner with a base look and four branch looks: **Sand**, **Tide**, **Ember** and **Court**.
- **Six companions:**
  - Panther "Shade"
  - Ram / ibex
  - Manta / sea-glider
  - Owl / hawk
  - Bison / rhino
  - Fox / hare

## 4. Partner Garden greybox (`partner-garden-greybox.jpg`)

The garden is a 60 × 60 m sanctuary off the Ch. 2 district. Its layout:

- **Centre:** a feeding plaza with 5 partners.
- **Left top:** a half court with a 10 ft rim (swift / exhibition).
- **Right top:** a pond (Tide / manta).
- **Right:** a climb wall with ledges (Court / ram).
- **Left:** a sand pit (Sand).
- **Bottom:** a rest shelter and the gate to the district.
- Trees are fruit, and the purple shapes are crystals.

## How this lines up with what is already built

| This concept | Built already (owner decisions 2026-11-12 to 11-18) |
|---|---|
| Hub: Crossroads Court, 150 m | **Venice Beach** hoops park, `/play/venice`, on `main` (the owner said "It's really Venice beach") |
| Blue Courts (Tide), coast and piers | **Coast & Islands**, `/play/coast`: dock, beach, islands, partner, creatures and log, with the town in progress |
| Kaelor and its branch looks | The Coast zone walks with the existing Adventure partner (a placeholder) |
| Six companions | Four placeholder creatures in the Coast zone (Shellhopper, Ember Gull, Palm Glider, Reef Stone) |
| Partner Garden | Not built |
| Kaelor flight / sky-moose loops | Not built; Venice and Coast are linked by a boat |

The owner's answers on how to merge the two go in OWNER-DECISIONS; this file stays a record of the concept.
