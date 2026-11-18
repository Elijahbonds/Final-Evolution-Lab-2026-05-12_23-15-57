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

## 5. Partner system (the 3D Art agent's brainstorm, relayed by the owner 2026-11-18)

The brainstorm merges ideas from the Gameplay, Research and PM agents and the owner.

- **Kaelor always takes slot 1.** He evolves down one of four branches:
  - **Sand:** hang time
  - **Ember:** power and fire
  - **Tide:** water and fins
  - **Court:** climbing and wall-runs
- **Companions:** you also pick up to 4 companions from a pool of six:
  - a panther (working name "Shade") for speed
  - a ram for climbing
  - a manta for gliding over water
  - an owl for support
  - a bison for power
  - a fox, the starter
- **The Sanctuary:** a 60 × 60 m home court off the Ch. 2 district, where your partners live (image 4).
  - Feeding, play, training and items found in the world push each partner toward a branch, and the change shows: wings, horns, more mass.
  - Races and sparring there are cosmetic "Garden Exhibitions".
  - **Nothing is random or paid.**
- **Creator cards:** reward cards that unlock a signature partner skin, dunk or Finish animation.
  - No stat boosts and no random packs.
  - A real person gets a card only after written consent, a licence and a revenue split.
  - This is legal and money territory, so it is the owner's call before anything is built (CLAUDE.md).
- **Built into the layout** (it is a proposal; the Gameplay agent owns the mechanics):
  - **Fight spaces:** room for lock-on fights where dunks are your attacks, with rims and poles to dunk off, and space to dash and knock people back.
  - **Event courts:** courts around the world where story beats turn into Flight Night rounds.
  - **Climbing and wall-running:** routes with ledges spaced to match how far you can jump and reach.
  - **Kaelor:** sky lanes, landing pads, and swoop-dunk spots onto 10 ft rims.
  - **Camera:** enough clearance that the high gameplay camera never clips into walls or ceilings.
  - **Souls-like structure:** rest courts, shortcuts that unlock, and rival encounter spots.
- **Benchmark names are references only.** The brainstorm mentions other games ("Sparking! Zero", "2K High camera", "Chao Garden"). They describe a quality bar and must not be copied: no names, art, modes or UI. "Chao Garden" is already renamed the Sanctuary.

## 6. Story keyframes (`story-keyframes.jpg`)

Twelve frames:
- K00 Prologue
- K05 Stop 05
- K06 Ch 06
- K08 Stop 08
- K10 Ch 10
- K14 Ch 14

They show the player from behind on courts and drills, the glowing rings, and the bus on the road at the end. **The story is on hold** (owner, 2026-11-17, "Leave the story alone for now"), so this is a record only.

## 7. Ch. 2 District greybox (`ch2-district-greybox-3d.jpg`, `ch2-district-greybox-top.jpg`)

These are rough sizes and layout only, not concept art. The layout is:
- grey building blocks with yellow doors;
- red event-court volumes;
- a blue water or edge volume;
- purple crystal or rooftop pickups;
- green and yellow framed pads (likely rest courts, landing pads or spawn points).

## 8. Set paintings, key art, the full keyframe board, and Blender work in progress (owner-shared 2026-11-18, batch 3)

- **`set-paintings-and-rival.jpg`** holds six set paintings and the rival sheet:
  - SET-01, the prologue park court;
  - SET-02, the Ch. 2 gymnastics gym, with a partner creature in the gym;
  - SET-03, the Ch. 11 **Blue Courts**: beach courts with palms, a lifeguard tower and the sea. This is very close to what Venice Beach already is.
  - SET-04, Ch. 12 **Sandstorm**, with a winged sand beast;
  - SET-05, Ch. 15 **The Lab**: a training hall with holographic body scans;
  - SET-06, the **Finale Venue**, a night court with a crowd, floodlights and a car under the rim;
  - the **rival sheet**: a red and white kit with a headband and arm sleeve, front, side and back.
- **`keyart-car-dunk-night.jpg` / `keyart-car-dunk-day.jpg`**: two posters. Each shows a player dunking off a car's bonnet, with an armoured winged partner (the Kaelor line) above the rim.
- **`story-keyframes-full-board.jpg`**: the full board, K00 Prologue through K17, then the Finale and Epilogue. The story is **on hold**, so this is a record only.
- **`ch2-gym-dressing-kit-rival-blender.jpg`**: **real Blender work in progress** from the 3D Art agent, not paintings.
  - the Ch. 2 gym environment at LOD0, with a climb-tag view (cyan = CLIMB, gold = WALLRUN, ledges by height);
  - a **dressing kit**: fence, scaffold, rim tower, pillar, ladder, street light, car and bleacher, each with climb tags;
  - a WIP **rival LOD0** body, front, side and back.
  
  These model files are not in the repo. To be used in the game they must be pushed as `.glb` (or `.blend` plus an export script), with a licence/credits line and the climb-tag naming written down.
