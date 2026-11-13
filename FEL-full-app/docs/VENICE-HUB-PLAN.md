# The Venice hub: the survey and the build plan (lane/venice-hub, 2026-11-12)

**Owner, 2026-11-12.** Decided earlier today: a PARK area for social basketball (outdoor home courts, a run you queue for,
a place to hang out), part of the Adventure hub, built after the current hoops work, with one-tap 1v1/3v3 kept in the
menus. Then: **"It's really Venice beach, look at all the locations we have for the game modes, figure out how to wire it
in and put it together."** Later the same day, relayed by the coordinator: **"Should be DBZ Kakarot / Pokémon Legends
Arceus / Sword / Scarlet level open world"**, with the owner's choices: **big open zones joined by a hub town**, Venice
Beach is the hub town, each zone large and seamless inside with a short load between zones, zones shipped one at a time;
the zones hold flying and riding, creatures and partners to find, fight or befriend, side quests, small towns and
landmarks, and sports spots everywhere that launch their game modes.

The named games are a **quality and structure bar only**. Nothing of theirs ships: no names, characters, creatures, art,
maps or UI. The IP line in `docs/ADVENTURE-PLAN.md` holds, and every name below is `[PLACEHOLDER]` until the owner names it.

This is a plan. This lane ships nothing: a document, a layout as data with its test, two probes and a developer-only
prototype page. No mode file, no shared runtime file and no `/play` route changed.

| File | What it is |
|---|---|
| `docs/VENICE-HUB-PLAN.md` | This plan |
| `lib/adventure/venice/layout.ts` (+ `layout.test.ts`, 11 tests) | The hub grid, districts, walk-up spots and zones as typed data, with the pure lookups (which district, which spot, which streaming tier) |
| `scripts/probes/venice-hub/inventory.ts` | §1's table: each mode's place files and sizes, measured from the shipped data |
| `scripts/probes/venice-hub/map.mts` | Draws the two maps below from the layout data, saved as JPG |
| `lib/adventure/venice/protoScene.ts`, `app/dev/venice-hub/*` | The walkable prototype (404 outside `next dev`) |
| `scripts/probes/venice-hub/proto-entry.ts`, `proto-shot.mts` | Screenshots of the prototype and its phone-profile cost |

---

## 0. In plain words

- **The game already lives in Venice.** 34 modes are on the Play shelf. **15 have a natural place in a real-world Venice
  Beach** (the courts, the skate park, the surf, the beach volleyball nets, the paddle courts, the bike path, the
  boardwalk's street stage). **11 more fit a believable Venice spot** (a ring at the outdoor gym, a gridiron and a goal
  on the sand, a neighbourhood ball field, an arcade, an outdoor screen). **8 have no Venice place** (snow, sky, the race
  circuits, the golf course, the free-run tracks, the karate gauntlet and the story): those live in the **open zones**,
  reached through doors in Venice. No mode needs a bare portal any more.
- **The hub is 5 × 8 world pieces** (320 × 512 m): the sea, the sand, a park strip (courts, skate park, outdoor gym,
  paddle courts, bike path), the boardwalk (stage, screen, arcade, plaza) and the town (rooftops, ball field, canals,
  marina), north to south. The **courts are built first** (V1), a 2 × 2-piece park with four courts.
- **Walking up to a court starts its game** with the same player, look and party, by opening the mode's own page, so no
  mode changes to be launched. When the game ends you are put back beside the court you left.
- **Five open zones** are proposed, each themed from places the modes already have: the Coast & Islands, the Temple
  Wilds, the Neon City, the Mountain and the Canyon & Sky. **The first should be the Coast, 6 × 6 pieces (384 m)**:
  that is the scale a phone holds at budget, measured below.
- **The zone tech (streaming, levels of detail) moves up** to right after the hoops park and the run (V3), and is proven
  on Venice itself before any zone is built.
- **Measured on the prototype:** the whole Venice hub, every district in view as placeholders with the real court kit on
  the four courts, costs 117 of a phone's 450 draw calls and 46 MB of textures, before any bodies. The courts' cost is
  texture memory, not draws (§5.2).
- **What is realistic:** zones 384–768 m across, not the several kilometres of the reference games, on a 3–4-year-old
  phone in a browser with this team. Sparse places (sea, snow, sky) can be bigger than dense ones (a town). The binding
  limit is texture memory, not draw calls (1v1 already uses 214 of the phone's 256 MB).

---

## 1. The location inventory

Every shelf mode (`lib/nav/families.ts`), measured by `npx tsx scripts/probes/venice-hub/inventory.ts` (add `OUT=<file>`
for JSON, `FILES=1` for every file). **Place files** = the place's own downloads: the baked map if mounted, every distinct
prop GLB of the default prop set (`VenueProps.propSetFor`), the Venice dunk dressing's GLBs where the set is
`venice-dunk`, the painted backdrop dome, and named extras (the hoop, the default vehicle). Bodies, balls and audio are
not counted (they are shared by every mode). **Phone** = the mode's row in `lib/babylon/config/mobileBudget.json`
(390 × 844, DPR 3, 4× CPU throttle, SwiftShader; worst frame): draw calls / active meshes / texture MB. "not measured"
means the mode has no row.

**How a mode is started today** is the same for almost all: Play shelf → `/play/<route>` → the boot splash (where the
place, court location or circuit is picked) → START. Exceptions are noted. `/play/onevone`, `/play/threevthree` and
`/play/karate` can also be started by the party host's "Start together" (`server/netd/src/partyRules.ts ONLINE_MODES`,
two humans each).

| Mode | Route | Venue or scene (where it is mounted) | Places on the picker | Kind | Venice today | Place files MB (n) | Phone | Hub home | Fit |
|---|---|---|---|---|---|---|---|---|---|
| Flight Night (dunk) | `/play/dunk` | spec `basketball_dunk` (`DunkMode.ts:1562`) | 5 court locations: Venice, Blossom, Orbit, Canopy, Rooftop | court | yes | 5.57 (16) | 144 / 67 / 183 | Courts | natural |
| Ones (1v1) | `/play/onevone` | spec `basketball_h2h` (`OneVOneMode.ts:1030`) | 5 court locations | court | yes | 5.50 (15) | 168 / 69 / 214 | Courts | natural |
| Threes (3v3) | `/play/threevthree` | spec `basketball_3v3` (`ThreeVThreeMode.ts:1023`) | 5 court locations | court | yes | 5.54 (15) | 173 / 81 / 145 | Courts | natural |
| Downtown (3-point) | `/play/threepoint` | spec `basketball_h2h` (`ThreePointMode.ts:1412`) | 5 court locations | court | yes | 5.50 (15) | 220 / 77 / 144 | Courts | natural |
| Prove It (dunk duel) | `/play/dunkduel` | spec `basketball_dunk` (`DunkDuelMode.ts:871`); started from the Play hero | 5 court locations | court | yes | 5.57 (16) | not measured | Courts | natural |
| Game Night (carnival) | `/play/carnival` | spec `court_carnival` (`CourtCarnivalMode.ts:212`) | Carnival Court, Boardwalk, Neon Block | court | a pick | 0.24 (8) | 212 / 59 / 163 | Courts | natural |
| The Hundred (karate) | `/play/karate` | spec `karate_endless` (`KarateEndlessMode.ts:1918`) | 7 combat arenas | ring | no | 8.36 (12) | 154 / 64 / 81 | Temple Wilds zone | zone |
| Storm Duel | `/play/karate-vs` | spec `karate_h2h` (`KarateVSMode.ts:982`) | 7 combat arenas | ring | no | 8.36 (12) | 135 / 52 / 219 | Outdoor gym | stretch |
| Ring's Edge | `/play/mixedcombat` | spec `karate_h2h` (`MixedCombatMode.ts:892`) | 7 combat arenas | ring | no | 8.36 (12) | 133 / 51 / 193 | Outdoor gym | stretch |
| Duel | `/play/duel` | spec `karate_h2h` (`DuelMode.ts:836`) | 7 arenas, the cage first | ring | no | 8.36 (12) | not measured | Outdoor gym | stretch |
| Showdown | `/play/showdown` | spec `karate_h2h` (`ShowdownMode.ts:765`) | arenas and place looks | ring | no | 8.36 (12) | not measured | Outdoor gym | stretch |
| Venice Lines (skate) | `/play/skateboard` | its own park (`rideWorlds`) + prop set `skatepark` (`SkateRunMode.ts:676`) | Venice Park, City Plaza, The Warehouse | skate park | yes | 9.89 (10) | 264 / 81 / 212 | Skate park | natural |
| Gate Crasher (snow) | `/play/snowboard` | its own run + prop set `slope` (`SnowboardSlalomMode.ts:588`) | Alpine Run, Night Park, Glacier | snow | no | 0.10 (10) | not measured | Mountain zone | zone |
| The Break (surf) | `/play/surf` | its own sea + prop set `surf-break` (`SurfBreakMode.ts:490`) | The Break, Sunset Point, The Reef | water | a pick | 7.03 (11) | 153 / 76 / 175 | The break (south of the pier) | natural |
| Stomp (big air) | `/play/big-air` | its own hill + prop set `bigair-run` (`AirSessionMode.ts:741`) | one hill | snow | no | 0.10 (10) | not measured | Mountain zone | zone |
| Velocity Kart | `/play/velocity-kart` | procedural circuits + kart GLBs (`racing/kartCircuits.ts`) | 7 circuits: Boardwalk Loop, Stadium Oval, Rooftop, Alpine Descent, Harbor Run, Orbit Station, Summit Climb | road | a pick | 5.20 (2) | 323 / 66 / 284 | Neon City zone | zone |
| Aero Aces | `/play/aero-aces` | procedural circuits + plane GLBs (`racing/aeroCircuits.ts`) | 5 circuits: Red Rock Canyon, Coconut Cove, Frostbite Caverns, Ember Caldera, Neon Skyline | sky | no | 4.03 (2) | 134 / 57 / 231 | Canyon & Sky zone | zone |
| Free Run | `/play/freerun` | procedural course (`nexus/freeRunTracks.ts`) | 4 tracks: Neon Rooftop, Hydro-Dam, Freight Terminal, Sunken Temple | town | no | 0 (procedural) | not measured | Neon City zone | zone |
| Beach Sprint | `/play/sprint` | procedural track (`nexus/placeLooks.ts`) | home, Beach Dash, Night Meet | track | a pick | 0 (procedural) | not measured | Bike path | natural |
| Breakaway (football) | `/play/football` | spec `football_rush` (`FootballRushMode.ts:772`) | Gridiron, Beach Bowl, The Dome | field | a pick | 1.67 (13) | 184 / 51 / 193 | Beach Bowl (sand) | stretch |
| Twelve Yards (soccer) | `/play/soccer` | spec `penalty` (`precisionModes.ts:2127`) | home, Street Cage, Beach Pitch | field | a pick | 2.44 (12) | not measured | Beach Pitch (sand) | stretch |
| Baseball | `/play/baseball` | spec `derby` (`BaseballInningsMode.ts:83`) | home, Sandlot, Night Game | ball field | no | 1.75 (17) | not measured | Sandlot (town) | stretch |
| Moonshot Derby | `/play/derby` | spec `derby` (`precisionModes.ts:1341`) | home, Sandlot, Night Game | ball field | no | 1.75 (17) | not measured | Sandlot (town) | stretch |
| Match Point (tennis) | `/play/tennis` | spec `tennis` (`NetSportMode.ts:1186`) | home (the Venice set), Red Clay, The Lawn | court | yes | 0.25 (8) | 115 / 49 / 141 | Paddle courts | natural |
| Tiebreak Blitz | `/play/tiebreak` | spec `tennis` (`TiebreakMode.ts:406`) | 3 place looks | court | yes | 0.25 (8) | not measured | Paddle courts | natural |
| Beach Rally (volleyball) | `/play/volleyball` | spec `volleyball` (`NetSportMode.ts:1186`) | home (beach), Night Beach, The Gym | beach | yes | 10.20 (26) | not measured | The nets (sand) | natural |
| The Loop (golf) | `/play/golf` | spec `golf_loop` (`precisionModes.ts:599`) | Coastal Links, Desert, Alpine Dawn | field | no | 0.23 (13) | 160 / 77 / 152 | Coast zone | zone |
| Brain Brawl | `/play/brain-brawl` | spec `brain_brawl` (`BrainBrawlMode.ts:1013`); couch phones | 3 place looks | stage | no | 0.13 (1) | not measured | The arcade | stretch |
| Spot the Scene | `/play/who-scene-it` | the question's own venue (`WhoSceneItMode.ts:504`); couch phones | every venue | screen | a pick | 0 (borrows) | not measured | The screen | stretch |
| IRL Dunk | `/play/irl` | your real court (camera) | none | court | no | 0 | not measured | The camera hoop (courts) | stretch |
| The Cypher (dance) | `/play/dance` | spec `dance` (`DanceMode.ts:1580`) | The Cypher, Neon Club, Rooftop Dusk | stage | no | 8.27 (12) | not measured | The stage | natural |
| Groove Academy (music) | `/play/music` | 2D | none | stage | no | 0 | not measured | The stage | natural |
| Acting | `/play/acting` | 2D | none | stage | no | 0 | not measured | The stage | natural |
| Story | `/story` (The Nexus Initiative); the Adventure is `/play/adventure`, unlisted | Adventure pieces: hub + World 1 (`adventure/world/story/storyMap.ts`) | hub, World 1 | wilds | no | 0 (pieces) | 53 / 19 / 100 (`adventure-story`) | Temple Wilds zone | zone |

**Totals:** 34 shelf modes: **15 natural, 11 stretch, 8 zone**. 81 distinct place files, 35.2 MB in all. Off the shelf:
the Adventure BR (`/play/adventure-br`, unlisted; its map is 5 × 5 pieces, 320 m; phone 86 / 34 / 169), the
Homebrew Shelf (`/play/gb-shelf`, flag-gated: a natural fit for the arcade when it opens) and the training doors
(`/train`, `/play/mirror`, `/play/drills`: the outdoor gym's weight pen is their door).

**The rest of the place assets, by folder:**

| Asset | Size | Used by | Notes |
|---|---|---|---|
| `public/models/maps/*.glb` (raw Meshy) | 0.24–3.07 MB each, 16 files | nothing loads these directly | The baked copies below are what loads |
| `public/models/maps/baked/*.glb` | 1.6–3.3 MB each, 13 files | soccer, penalty (`soccer-stadium`), baseball (`baseball-park`), golf (`coastal-links`, the plain spec only), gymnastics (`dojo`), snowboarding spec (`mountain-slope`), surfing spec (`surf-break`), the market (`shop`) | `venice-blue-court` is `meshDisabled` (the painted court replaced it); **`venice-skatepark` (3.27 MB) is mapped to the `skateboarding` spec but the skate mode never mounts a spec, so it is not loaded by the skate mode** |
| `public/models/props/venice/*` | 0.90 MB: `pier_far` 88 KB, 4 sail billboards 12 KB each, `env2/` palm LOD0–2 (375 / 84 / 59 KB), boardwalk kit 172 KB, crowd cards 70 KB | the Venice hoops courts (`venice-dunk`, `venice-court-meshy` sets) | The core of the hub's look, and small |
| `public/models/story-hub.glb` | 1.38 MB | **never loaded** (ADVENTURE-PLAN.md says so too) | A Meshy hub for the old Nexus story, not Venice. Not used here |
| Adventure world pieces | procedural | `/play/adventure` (hub + World 1), `/play/adventure-br` | `world/pieces.ts` (flat, ramp, block), `world/pieces/brTiles.ts` (64 m tiles: plaza, tower, mesa, ruins, grove, field), `br/map.ts` (5 × 5) |
| `nexus/veniceBoardwalk.ts` | code | 1v1, 3v3, 3-point, carnival (the lawn build); dunk and duel (`venice-dunk`) | The procedural Venice: apron, sand, sea, sun road, bike path, the promenade, the plaza; mounts the env2 dressing |
| `nexus/courtLocations.ts` | code | the hoops modes | Venice (identity), Blossom, Orbit, Canopy, Rooftop: an environment swapped under an unchanged court |
| `nexus/boardVenues.ts`, `placeLooks.ts`, `combat/arenas.ts`, `racing/{kart,aero}Circuits.ts`, `nexus/freeRunTracks.ts` | data | board, spec-mounted, combat, racing, free run | Every place each mode can be played in: the zones' raw material (§3) |
| Painted backdrop domes, `public/backdrops/baked/*.jpg` | 8 families | every spec venue | `beach` and `ocean` already paint a Venice-like horizon |

**What the inventory turned up** (each one shapes the plan):

1. **3v3 online seats two humans today, not six** (`ONLINE_MODES` threevthree `humans: 2`, the second seat `net1`). A
   party of six fits a netd room (`MAX_PLAYERS = 6`) but not today's 3v3. V2 has to add four seats.
2. **"Builder ratings" do not reach the hoops modes yet.** 1v1 reads `BASELINE_HANDLE` (50) or a `?handle=` override
   (`OneVOneMode.ts:587, 1080–1081`); a search found no code for the 2026-10-20 decision "Creator ratings slightly widen the
   green in casual modes". So the hub has nothing to carry; when the hoops lanes wire ratings, the mode reads them itself.
3. **The end screen's exit goes to `/play` or `/story` only** (`components/games/end-screen/end-screen.tsx`
   `exitHrefFor`). Coming back to the hub needs one more branch there.
4. **Texture memory is the binding phone limit.** 1v1 uses 214 MB of the 256 MB ceiling and the kart 284 MB (a known
   overage). A hub cannot keep a court district's textures alive under a running mode: the mode must run on its own page
   with the hub's scene gone, which page navigation gives for free.
5. **The heaviest place files are single Meshy GLBs**: the dojo (7.9 MB, karate and dance sets), the store (6.1 MB,
   volleyball and skate sets). The hub never loads them; it shows a light stand-in and lets the mode load its own.

---

## 2. The Venice Beach layout

**Maps (drawn from the layout data by `scripts/probes/venice-hub/map.mts`):**
- the hub: `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/venice-hub/venice-hub-map.jpg`
- the hub and the zones to scale: `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/venice-hub/venice-zones.jpg`

**The data:** `lib/adventure/venice/layout.ts` (`DISTRICTS`, `SPOTS`, `ZONES`), held by `layout.test.ts`: every cell has
exactly one district, every spot stands inside its own district, every shelf mode has exactly one home, every route a spot
opens exists, every name is a placeholder.

**The frame** is the Adventure's: 64 m world pieces, metres, x west (−) to east (+), **north is −z**, which is how the
shipped Venice dressing already faces (the sea to the west, the pier to the north of the dunk's court). The hub is 5 × 8
pieces, 320 × 512 m, centred on the origin.

**Public geography only**, simplified: the Pacific to the west; a wide beach; then, running north–south, a strip of
public recreation (painted walls, a concrete skate park, outdoor basketball courts, an open-air gym, small paddle-tennis
courts) with the beach bike path along its east edge; the boardwalk promenade of stalls, shop fronts and street
performers; behind it the town, with residential canals and a harbour to the south-east; a long pier at the south end.
No game's map, names or UI.

```
            i=0 (west)     i=1            i=2                 i=3                i=4 (east)
            x −160..−96    −96..−32       −32..32             32..96             96..160
 j=0  N     water          sand           art walls (V4)      boardwalk (V3)     rooftops (V5)
 j=1        water          Beach Bowl     skate park (V4)     boardwalk          town
 j=2        water          ┌─ THE COURTS (V1): 4 courts ─┐    the stage          town
 j=3        water          └──────────────────────────────┘   the screen         town
 j=4        water          the nets       outdoor gym/ring    the arcade         sandlot
 j=5        water          Beach Pitch    paddle courts       THE PLAZA (home)   canals
 j=6        the pier ─────── the pier     bike path (sprint)  boardwalk          canals
 j=7  S     surf break     sand           bike path           boardwalk          marina
```

| District | Cells | Phase | Spots (what you walk up to → the mode) |
|---|---|---|---|
| **The Courts** | (1..2, 2..3), 128 × 128 m | **V1** | Court 1 → Ones (`/play/onevone`) · **Court 2, The Run** → Threes (`/play/threevthree`), with the bench (queue) · Court 3 → Flight Night, Prove It (`/play/dunk`, `/play/dunkduel`) · Court 4 → Downtown, Game Night (`/play/threepoint`, `/play/carnival`) · the camera hoop → IRL Dunk · the court gate (V1 home spawn) |
| The Plaza | (3, 5) | V3 | Home spawn from V3 · **the shuttle stop: a door to every zone** |
| The Stage · The Screen · The Arcade | (3, 2) · (3, 3) · (3, 4) | V3 | Dance, Groove Academy, Acting · Spot the Scene · Brain Brawl (and the Homebrew Shelf when it opens) |
| The Boardwalk | (3, 0..1), (3, 6..7) | V3 | The spine: stalls, food, the promenade (no game spot; side quests later) |
| The Skate Park · The Art Walls | (2, 1) · (2, 0) | V4 | The bowl → Venice Lines · the gap in the wall → **door to the Temple Wilds** |
| The Outdoor Gym | (2, 4) | V4 | The ring → Storm Duel, Ring's Edge, Duel, Showdown · the weight pen → Train |
| The Paddle Courts | (2, 5) | V4 | Match Point, Tiebreak Blitz |
| The Bike Path | (2, 6..7), and a lane down the whole strip | V4 | The start line → Beach Sprint |
| The Sand: Beach Bowl, the nets, Beach Pitch | (1, 1), (1, 4), (1, 5) | V4 | Breakaway · Beach Rally · Twelve Yards |
| The Water · The Break | (0, 0..5) · (0, 7) | V4 | The lineup → The Break |
| The Sandlot | (4, 4) | V4 | Home plate → Baseball, Moonshot Derby |
| The Pier | (0..1, 6) | V5 | The pier end → **door to the Coast & Islands** (a boat) |
| The Town · The Rooftops | (4, 1..3) · (4, 0) | V5 | The rooftop lift → **door to the Neon City**; the rooftop court (a hoops court location that already ships) |
| The Canals · The Marina | (4, 5..6) · (4, 7) | V5 | The marina lot → **door to the Neon City** (the kart's way in) |

**Modes with no Venice place are reached through zones, not portals** (coordinator, 2026-11-12: zones replace the gates
where a zone fits better). Every zone has a themed door in Venice (the pier's boat, the rooftop lift, the gap in the art
walls, the marina lot) and the plaza's **shuttle stop** reaches all of them, so a player never walks across the hub to
leave it. The shuttle is a pick-a-destination card, the same one-tap shape as the shelf.

**The hoops park, first (V1).** Four courts in a 2 × 2-piece block between the sand and the bike path, each one a real
half court (the modes' own 16 × 19 / 18 × 20 half courts; the plan reserves 18 × 30 m each with its apron). Court 2 is
the run court, with a bench along its sideline. Walks run between the courts; the sand is to the west and the bike path,
then the boardwalk, to the east. The hub loads this district and the player first.

---

## 3. The open zones

Each zone is its own world: large and seamless inside, a short load from Venice (a page or scene change behind the door's
card), shipped one at a time. Themes come from places the modes already have, so every zone opens with sports spots
that work on day one.

| Zone | Theme | Drawn from (already shipped) | Home of | Extra spots | First cut | Full | Door | Phase |
|---|---|---|---|---|---|---|---|---|
| **The Coast & Islands** | Islands, reefs, a harbour town, sea between every island | `coastal-links` golf, Sunset Point and The Reef breaks, Coconut Cove (aero), Harbor Run (kart), Night Beach | The Loop (golf) | The Break, Aero Aces, Velocity Kart, Beach Rally | **6 × 6 (384 m)** | 12 × 12 (768 m) | the pier end (boat) | V5 |
| The Temple Wilds | Forest, a cliff shrine, a sunken temple, a dam: the story's first chapter | the dojo and shrine (karate), the Shadow Gauntlet, the cliff arena, Sunken Temple and Hydro-Dam (free run), Canopy and Blossom courts, Adventure World 1 | The Hundred, the Adventure story | Free Run, Storm Duel, Ones | 6 × 6 | 10 × 12 | the art walls | V6 |
| The Neon City | Rooftops, a stadium district, a freight yard, a night circuit | Rooftop Circuit and Stadium Oval (kart), Neon Rooftop and Freight Terminal (free run), the gridiron, soccer and baseball stadiums, cage / rooftop / foundry arenas, the rooftop court, Neon Skyline (aero), Neon Club (dance) | Velocity Kart, Free Run | Breakaway, Twelve Yards, Baseball, Derby, Duel, Threes, The Cypher | 6 × 6 | 12 × 12 | the rooftop lift, the marina lot | V7 |
| The Mountain | One mountain: a long run, a kicker park, a glacier, a summit road | Alpine Run, Night Park, Glacier (`mountain-slope`), the big-air hill, Alpine Descent and Summit Climb (kart) | Gate Crasher, Stomp | Velocity Kart | 4 × 11 (the 678 m run fits) | 10 × 14 | the shuttle | V7 |
| The Canyon & Sky | A red-rock gorge, mesas, a caldera: room to fly | Red Rock Canyon, Ember Caldera, Frostbite Caverns (aero), the BR's mesa and tower tiles | Aero Aces | — | 8 × 8 (sparse) | 16 × 16 | the shuttle | V7 |

An optional sixth, **Orbit** (the Orbit Station kart circuit, the Orbit court location), is a small event zone for later.

**What fills a zone** (the owner's four, all chosen): fast traversal (the Adventure's run, rails, riding and fused flight,
`docs/ADVENTURE-PLAN.md` pillars 1–2); creatures and partners (its monsters and partner, pillars 3 and 5); side quests,
small towns and landmarks (the story's beat and quest format, `core/StoryHub.ts` `QuestDef`); and sports spots (the same
walk-up spot as Venice, §4).

### What scale is realistic (measured, and said plainly)

| Measured on the phone profile (`mobileBudget.json`) | Area | Draws | Active meshes | Texture MB | Bodies |
|---|---|---|---|---|---|
| Adventure BR map: 25 grey pieces, fog, 7 bodies | 320 × 320 m | 86 | 34 | 169 | 7 |
| Adventure story (hub + World 1) | ≈ 72 × 72 m in view | 53 | 19 | 100 | 6 |
| One dressed Venice court (1v1): the court, the Venice dressing, 12 bodies | ≈ 128 × 128 m | 168 | 69 | 214 | 12 |
| Skate park: the most dressed place | 112 × 112 m | 264 | 81 | 212 | 14 |
| The Venice hub prototype, the whole hub in view (placeholders + the court kit, §5.2) | 320 × 512 m | 117 | 202 | 46 | 0 |
| Phone ceiling / the Adventure's plan budget (75 %) | | 600 / 450 | 400 / 300 | 256 / ≈ 200 | 16 / 12 |

- **Grey pieces are cheap; dressed places are not.** A whole 5 × 5 BR map of untextured blocks costs about half of what
  one dressed Venice court costs. The court's cost is the dressing and the bodies, and above all their **textures**: one
  court with its bodies already takes 214 MB of the 256 MB ceiling.
- **So a phone can hold about one dressed district at full detail, plus cheap rings around it.** That is the streaming
  plan below: full detail within one piece of the player, one merged mesh per piece in the next ring, and one silhouette
  for everything else.
- **The reference games' zones are kilometres across** and built by large art teams for consoles. In a browser on a
  3–4-year-old phone, with a team of agent lanes plus the owner and no art team, a realistic first zone is **6 × 6
  pieces (384 m, about 0.15 km²)**, growing to 12 × 12 (768 m) once streaming is proven. A zone can be bigger where it is
  sparse (sea, snow, sky), not where it is dense (a town).
- **Flight sets the scale problem.** The Adventure's fused cruise is 40 m/s [TUNE]: it crosses a 384 m zone in under
  10 s. Either cruise is capped inside zones (recommended for the first zones) or zones are 768 m+ and mostly sparse.
- **Recommendation:** the first zone is **the Coast & Islands at 6 × 6 pieces**. It continues Venice's look (the same
  sky family, the palm kit, the sand textures already shipped), the sea between islands makes natural, cheap streaming
  cells, and four modes get a spot there on day one (golf, surf, aero, kart).

### Streaming, LOD and the phone budget, per zone

The same rules for the hub and every zone (they are made of the same pieces):

| Ring (by 64 m piece, around the player's piece) | Phone | Desktop | What is drawn |
|---|---|---|---|
| Full | the player's piece + its 8 neighbours (3 × 3, 192 m) | 5 × 5 | everything: dressing, props, spots, NPCs |
| LOD | the next ring (5 × 5 minus full: 16 pieces) | 7 × 7 | one merged, untextured-or-atlased mesh per piece (≤ 4 draws) |
| Far | everything else | everything else | one silhouette mesh for the whole zone + the painted dome |
| Load ahead / drop | load the LOD ring's pieces as full before they are needed; drop a piece's full detail one ring after it leaves (hysteresis) | same | |

| Phone budget (worst frame) | Draws | Active meshes | Texture MB |
|---|---|---|---|
| Bodies: the player, the partner, ≤ 4 party, ≤ 6 NPCs or creatures (12) | 130 | 110 | 90 |
| Full pieces: 9 × (25 draws / 16 meshes) | 225 | 144 | one zone atlas set ≤ 64 |
| LOD ring: 16 × 4 / 1 | 64 | 16 | (shared) |
| Far silhouette, sea or terrain, sky dome, HUD | 25 | 15 | 30 |
| **Total** (the Adventure plan's 75 % budget: 450 / 300 / ≈ 200) | **444** | **285** | **≤ 184** |

- **Chunk = one 64 m piece on phones** (assumption: a change from ADVENTURE-PLAN.md's 256 m chunks, which hold 16 pieces:
  too many to swap at once on a phone without a hitch). Each piece type is one `AssetContainer`, instanced per placement.
- **Floating origin is not needed for these sizes.** Each zone is its own coordinate space (the load between zones resets
  it) and the largest full size is about 1 km; float precision at 1 km is well under a millimetre. Babylon 9.23 has a
  built-in large-world rendering option (`useLargeWorldRendering`) to measure first, if a zone ever passes ~4 km.
- **Load budget (owner, 2026-10-20): playable in 8 s, full in 20 s on a mid-range phone.** Arriving in a zone: the
  player's 3 × 3 pieces and the player are the playable set; the LOD ring, the silhouette, the creatures and the spots'
  extras stream after. Every phase that adds content measures it with `scripts/probes/_perf-sweep.mts` and holds it with
  a static guard (§4, "Phone budget").

---

## 4. The wiring

Every piece names the code it reuses or extends. Files other lanes hold today (`OneVOneMode.ts`, `ThreeVThreeMode.ts`,
`HandleSystem.ts`, the hoops hosts, SoundKit, the character pipeline, `anim/ballCarry.ts`) are **not** touched by this
plan before the hoops lanes finish; where a change in them is needed it is named and routed.

**The hub runs as one Adventure mode.** A new `VeniceHubMode` (a `ModeDefinition`, registered and **not** in
`ENABLED_BABYLON_MODES`, like `adventure`) hosts the hub on the Adventure's host: `lib/babylon/adventure/host/AdventureHost.ts`
(fixed step, systems), the movement sim (`adventure/movement/*`: run, jump; no combat in Venice), `host/inputMap.ts`,
`host/BodyBudget.ts` (body fidelity by distance), the camera, and the player through `CharacterLibrary.spawn` (the identity
layer dresses them: `core/playerIdentity.ts`). The ground is world pieces (`adventure/world/pieces.ts`). It lives at an
unlisted route, `/play/hub` [PLACEHOLDER], with the same noindex and no-links rule as `/play/adventure`
(`host/hiddenRoute.test.ts`).

### Walk-up to play
- A **spot** is a gate whose destination is a mode route instead of a world spawn: the shape of `story/gates.ts` and
  `core/StoryHub.ts` `GateSystem` / `WorldGate`, read through `layout.ts` `spotAt`. Inside its radius a one-tap card
  offers the spot's modes (Play · with party · Watch on a run court).
- **Launching opens the mode's own page** with a client navigation (`router.push`), the exact mechanism the party's
  "Start together" uses (`components/party/social/party-start.tsx`): the party, in the root layout, never unloads. The
  query is `?from=hub&spot=<id>` plus what the mode already reads: `?location=venice` for the courts
  (`nexus/courtLocations.ts` `readCourtLocation`), `?place=` for place looks (`nexus/placeLooks.ts`). **No mode file
  changes to be launched.**
- **Same player, look, ratings, party:** the look is applied by every mode already (`playerIdentity` through
  `CharacterLibrary`); the party is global; ratings are read by the mode from the account (none are wired into hoops yet:
  §1 finding 2). The hub passes nothing a mode does not already read: one source of truth.
- **One shared-file change, routed:** the boot splash should skip its place pick and start straight away when
  `?from=hub` is present (`components/games/boot-splash.tsx`, owned by the screen lanes). Additive, behind the
  parameter; without it the splash is unchanged.

### Party
- The party bar (`components/party/social/party-dock.tsx`) is on every page, so it is in the hub.
- **"Start together" from a court:** at a run court the host's card offers "Run with the party", which calls
  `partyClient().startTogether('threevthree')` — the existing 5 s countdown with Cancel, decliners stay, everyone is
  back in the party after (`lib/party/social/client.ts`, `server/netd/src/partyRules.ts`).
- **Six humans in a 3v3** (netd `MAX_PLAYERS = 6`) needs four more net seats in `ThreeVThreeMode.ts` (`net1` today) and
  `ONLINE_MODES` `humans: 2 → 6`. Routed to the hoops lane after its current work; the netd side is a redeploy the owner
  runs (`docs/OWNER-DECISIONS.md` 2026-10-09: netd changes are additive, the owner redeploys).
- **Seeing friends in the hub:** one netd room per party for presence (position, facing, animation state, 10 Hz), an
  additive message type on `lib/net/protocol.ts` over the existing transport (`lib/net/NetdTransport.ts`,
  `NetSession.ts`). Party-only: no strangers (owner question 4).

### The court run (V2)
- A pure run machine, `lib/adventure/venice/run.ts` (new): a queue per run court, **next up** called by name on the
  board, **winners stay** (streetball's rule; owner question 5), bots fill a short team. Tested headless.
- **Fits netd's six:** a 1v1 king-of-the-court seats 2 and up to 4 watch from the bench (6 in one room); a 3v3 with six
  humans has everyone playing, so nobody waits; a party of 4 plays 2 + 2 bots a side.
- **Spectating from the sideline:** a receive-only seat in the match room (snapshots in, no input out) — an addition in
  `lib/net/attach.ts` and a `?watch=1` seat in the hoops modes (routed to the hoops lane). Until it exists, the bench shows
  the live score on the court's board (from the match room's result messages).

### Coming back
- **Where you return:** the hub writes `{ spot, at }` to `sessionStorage` (`fel.hub.return`, every access in try/catch)
  when it launches a mode; on load it spawns you at that spot's exit point beside the court, facing it. Saves elsewhere
  record `{ worldId, spawnId }`, never raw coordinates (ADVENTURE-PLAN.md), so the return point is the spot's, not a
  position.
- **The exit:** `exitHrefFor` in `components/games/end-screen/end-screen.tsx` gains one branch: a session started with
  `?from=hub` exits to `/play/hub?spot=<id>`. Additive (§1 finding 3), routed to the end-screen's owner.

### Assets: reuse, or a hub-scale version
- **Reuse where the place is light and shared.** The courts reuse the shipped Venice kit exactly as the modes load it:
  the painted court (`visual/CourtSurface.ts` `mountStreetCourt`), the Meshy hoop (`visual/meshyProps.ts`), the Venice
  dressing (`nexus/veniceBoardwalk.ts` `mountVeniceDunkDressing`: 0.78 MB of palms and boardwalk kit). Because the files
  are the same, the mode's own load of them is a browser-cache hit.
- **A hub-scale stand-in where the place is heavy.** The dojo (7.9 MB), the store (6.1 MB), a stadium: the hub shows a
  merged low-detail silhouette (≤ 0.3 MB, procedural first) and the mode loads its real venue on its own page.
- **Prefetch on approach:** entering a spot's district warms the mode's place files (`fetch` with low priority, the
  file list from §1's probe), so the mode's load after the tap is shorter.

### Loading
- **The hub loads the court and you first** (the "court + you first" rule, 2026-10-20, as the dunk's first load does:
  `NexusVenue` `deferDressing`, FIRST-DUNK-BUDGET). Playable set: the player's 3 × 3 pieces, the player's body (the phone
  body file, `core/heroBody.ts`), the court surface and the hoops. Then the dressing, the LOD ring, the far silhouette.
- **A mode loads only its own extras:** the court, hoop and Venice dressing are cached by then; the mode adds its bodies,
  ball, crowd and sound.
- **The streaming index** is `adventure/host/spatialGrid.ts` (ADVENTURE-PLAN.md: "it becomes the streaming index"),
  keyed by piece; `layout.ts` `tiersAround` is the rule (full / LOD / far).
- **Budget:** playable ≤ 8 s, full ≤ 20 s on a mid-range phone. The SwiftShader rig overstates a phone's time
  (`docs/SHIP-READINESS.md` §1: dunk 44 s there); each phase records the rig number and the owner's device number.

### Phone budget
- A **`venice_hub` row** in `lib/babylon/config/mobileBudget.json` per phase, measured with `scripts/probes/_perf-sweep.mts`.
- A **static guard**, `scripts/venice-hub-budget-tests.ts`, built the way `scripts/hoops-phone-budget-tests.ts` is: it
  reads the layout and the GLBs (no browser), computes each district's draws, active meshes and texture MB at the phone
  rule, holds them to the row, and as its own control recomputes a known-over scene and checks it fails.
- Per district at full detail: ≤ 25 draws, ≤ 16 active meshes per piece (the courts district: 4 pieces, ≤ 100 draws),
  textures from one shared atlas set per district.

### Teens
- The party rules already decided hold everywhere in the hub: **friends-only parties, no voice, no free text** (preset
  quick-chat and emotes only), enforced server-side (`server/netd/src/party.ts`, `partyRules.ts`).
- The hub is **party-only**: no strangers walk your Venice. A teen's look never uploads (`TEEN_DEVICE_LOOK_EVERYWHERE`,
  `lib/creator/look/slots.ts`), so friends see the default look, as in the Adventure's online plan.
- No new data leaves the device: the return spot is in `sessionStorage`; presence is relayed, never stored.

### Menus
- **One tap stays.** The Play shelf, every `/play/<mode>` route and the party's Start together are unchanged. The hub is
  one more door (owner question 2), never a step in front of a game.

---

## 5. The phased build plan

The Adventure's phases A–C exist (the shared core, the hub and Chapter 1, the bot BR). D (the BR online), E (the
autobiography) and F (the open world) do not. **The zone tech (F) moves up to V3**, right after the hoops park and the
run, and is proven on Venice before any zone is built. D can run beside V4 (it shares V2's netd work); E runs whenever the
owner sends chapters.

Sizes are lane-weeks of one agent lane (S ≤ 1, M 1–2, L 2–3, XL 3–5).
Marks: **OWNER** (names, art, money, a redeploy, a device test), **GATE 0** (animation or rig work: verify the rig first),
**ART** (new art beyond the shipped kits and procedural pieces).

| Phase | Delivers | Size | Exit gates (all measured) | Marks |
|---|---|---|---|---|
| **V1 The hoops park** | `VeniceHubMode` on the Adventure host (run, no combat); the courts district from pieces with the shipped Venice kit (one painted court texture shared by the four courts, §5.2); four courts; walk-up cards launching 1v1, 3v3, dunk, dunk duel, 3-point, carnival, IRL; return to the spot; `/play/hub` unlisted; a `venice_hub` phone row and the static guard | **L** | Phone profile, worst frame ≤ 450 draws / 300 active / 200 MB; playable ≤ 8 s and full ≤ 20 s (rig, then the owner's phone); E2E: walk up → the mode starts in one tap → end → back at the same court; **no mode file in the diff**; every shelf route still one tap; tsc, ci-suite, vitest green | OWNER: the device feel walk; placeholder names stand. GATE 0 check only (walk and idle use existing clips; no rig edit). No ART |
| **V2 The run, party, online** | `run.ts` (queue, next up, winners stay, bots fill); "Run with the party"; 3v3 at six humans; the receive-only watch seat; hub presence for the party | **XL** (half of it in hoops files, after the hoops lanes) | 5 headless runs rotate correctly; 6 real devices play a 3v3 started from the hub; 4 watch a 1v1 from the bench; a host leaving hands over; a teen account sends no text or voice in the hub (server test); the budget holds with 6 bodies in view | OWNER: the netd redeploy, the 6-device test |
| **V3 The zone tech, on Venice** (Adventure F, moved up) | Per-piece streaming (`spatialGrid` as the index, `AssetContainer` per piece type, load-ahead and drop with hysteresis), the LOD ring, the far silhouette, prefetch on approach; the whole 5 × 8 hub streamed with placeholders | **L** | A 10-minute scripted walk of the whole hub on the phone profile: worst frame within budget, no frame over 100 ms from a load, texture memory flat (nothing leaks); playable ≤ 8 s | none |
| **V4 The boardwalk spine and the Venice places** | The stage, screen, arcade, plaza, skate park, outdoor gym, paddle courts, the sand's fields, the bike path, the break, the sandlot, as hub-scale places; 26 spots; the shuttle stop's card (zones "coming soon") | **L** | Every Venice spot launches its mode in one tap and returns; each district within its budget; the guard holds every district | OWNER: names for the districts. ART: optional (procedural and kits first) |
| **V5 The town, the pier and the first zone (Coast & Islands, 6 × 6)** | The town, rooftops, canals, marina and pier; the doors; the Coast zone: islands, sea, a harbour town, golf / surf / aero / kart spots, first creatures and a side quest | **XL** | The zone at budget on the phone profile; door → zone playable ≤ 8 s, full ≤ 20 s; its four spots launch their modes; a creature encounter and a side quest complete headless | OWNER: zone names, creature direction (q. 9–10). **ART**: islands and terrain; creature bodies (and a non-humanoid rig: **GATE 0**) |
| **V6 The story worlds attached (Temple Wilds)** | The Adventure's Chapter 1 world placed in the Temple Wilds zone; the story's hub gates become Venice doors; `/play/adventure` keeps its behaviour until the owner flips it | **XL** | Chapter 1 played start to finish from Venice on a phone; the PLACEHOLDER marks visible; `/play/adventure` unchanged by test | OWNER: names, the chapters (Adventure E), the flip. ART. GATE 0 for creature rigs |
| **V7 and on: the other zones and their full sizes** | The Neon City, the Mountain, the Canyon & Sky, one at a time; then each zone's growth to its full size | **L–XL each** | Each zone as V5's gates; growth only after the zone holds its budget at the first cut | OWNER and ART per zone |

**V1 needs nothing from the owner to start** except the hoops lanes finishing (the owner's timing decision). V2's hoops
half waits on the same. V3 can start as soon as V1 lands.

### 5.2 The prototype (dev only)

`/dev/venice-hub` (a 404 outside `next dev`) builds `lib/adventure/venice/protoScene.ts`: every hub cell as a 64 m tile
in its district's colour, a placeholder block per district, a ring and a sign at every spot, the sea, and in the courts
district the **shipped** Venice kit (the painted court and the Meshy hoop on all four courts, the Venice dressing around
Court 3). WASD or the arrows walk at eye height; the overlay shows the district, the spot you stand in (with a link to its
mode) and the frame's cost; three views: walk, courts, map. It shows **place and scale, not the look**.

Shots and the phone-profile count come from `scripts/probes/venice-hub/proto-shot.mts` (esbuild bundle, the shared
browser gate, this lane's port 3741):

**Measured** (SwiftShader, the phone profile 390 × 844 DPR 3 touch with the mobile tier, worst of 20 frames per view;
no bodies in the scene; frame rates on this rig are not a phone's and are not reported):

| View | Draws | Active meshes | Texture MB |
|---|---|---|---|
| Walking up to the courts (eye height), with the court kit | 31–36 (two runs) | 69 | 46 |
| The courts from above, with the court kit | 61 | 99 | 46 |
| **The whole hub at once** (top view, every district and spot), with the court kit | **117** | **202** | **46** |
| The whole hub, placeholders only (no court kit) | 105 | 105 | 7 |
| Desktop, whole hub, with the court kit | 119 | 204 | 63 |

What it says:
- **The whole 5 × 8 hub as placeholders costs a quarter of the phone's draw budget** (117 of 450) with every piece in
  view and no streaming at all. The layout's size is not the problem; the dressing and the bodies will be.
- **The court kit's real cost is texture memory**: four courts add 39 MB (7 → 46 MB) but only 12 draws. Each painted
  court makes its own texture (`CourtSurface.mountStreetCourt`, 1024² on a phone, ≈ 5.6 MB each with mips), so four
  courts are ≈ 22 MB of identical paint. **V1 should paint one court texture and share it** across the park's courts.
- Active meshes run above draws with the kit (202 against 117) because the palms are instances: Babylon counts each
  instance as active and draws them together. The phone budget's active-mesh line (300) is the one to watch as the
  dressing grows.

Shots:
- walking up to the courts: `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/venice-hub/venice-proto-walkup-desktop.jpg` (phone: `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/venice-hub/venice-proto-walkup-phone.jpg`)
- the four courts from above: `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/venice-hub/venice-proto-courts-desktop.jpg`
- the whole hub from the top: `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/venice-hub/venice-proto-map-desktop.jpg`. In the engine's top view south is at the top: see §7
  on the mirrored frame.

---

## 6. Owner questions (multiple choice, recommendation first)

**The hub**
1. **The hub's name.** (a) **Venice Beach, as the app already says** ("Venice Beach Court", "Venice Skatepark" ship
   today), with invented names for the districts that you pick; (b) an invented name inspired by it; (c) Venice Beach,
   with real street and landmark names too. *Recommended (a).* (Adventure open decision 1, for the hub.)
2. **Where the hub lives in the nav.** (a) **Its own door on Play, beside the shelf** (the shelf stays one tap);
   (b) under `/story` with The Nexus Initiative; (c) only inside the Adventure. *Recommended (a).* (Adventure decision 11.)
3. **Is Venice the Adventure's hub?** (a) **Yes: Venice replaces the plaza hub, and the story's gates become Venice
   doors (V6)**; (b) keep both hubs. *Recommended (a).*
4. **Who is in your Venice.** (a) **Your party only** (friends-only for teens, as decided); (b) adults may also see
   strangers in a shared Venice. *Recommended (a).*
5. **The run's rule.** (a) **Winners stay on, next team up**; (b) everyone rotates; (c) the host picks. *Recommended (a).*
6. **3v3 online.** (a) **Six humans** (the hoops lane adds four seats; you redeploy netd); (b) two humans plus bots, as
   today. *Recommended (a).*

**The zones**
7. **The five zone themes:** (a) **as proposed** (Coast & Islands, Temple Wilds, Neon City, Mountain, Canyon & Sky);
   (b) three to start (Coast, Wilds, Mountain); (c) different themes (say which). *Recommended (a).*
8. **The first zone.** (a) **The Coast & Islands** (cheapest to stream, continues Venice's look, four modes on day one);
   (b) the Temple Wilds (carries the story's Chapter 1); (c) the Mountain (two board modes). *Recommended (a).*
9. **Zone size against flight.** (a) **First zone 6 × 6 pieces (384 m), fused cruise capped inside zones**; (b) 12 × 12
   (768 m), mostly sea, full cruise. *Recommended (a).*
10. **Creature direction** (Adventure decision 3). (a) **Built from the Creator's parts first, the owner's Meshy for the
    signature creatures**; (b) Meshy for all; (c) Blender on the Mac. All need a non-humanoid rig (GATE 0).
    *Recommended (a).*
11. **Can creatures be collected?** (a) **Befriend: one partner at a time, plus a field log of every creature seen and
    befriended**; (b) collect many, swap partners, a roster; (c) fight only. *Recommended (a)*, with (b) a later
    decision. The verb must be our own, never a reference game's.
12. **Streaming unit on phones.** (a) **One 64 m piece** (a change to the Adventure plan's 256 m chunk); (b) keep 256 m.
    *Recommended (a).*
13. **Art for the hub and zones.** (a) **The shipped kits, procedural pieces and your Meshy, as today**; (b) commission
    art (money). *Recommended (a).*

**The Adventure's other open decisions this touches** (from `docs/ADVENTURE-PLAN.md`, with its recommendations):
14. (decision 4) **Adventure level separate from the account level** (recommended) or one.
15. (decision 9) **Teens in online play: allowed, others see the default look** (recommended), or offline only.
16. (decision 10) **Flight first unlocks at Chapter 1's boss** (the plan's assumption), and in Venice it opens the
    rooftops; or earlier, in the hub.

---

## 7. Flags and assumptions

- `assumption:` "builder ratings" means the Creator's ratings the owner decided may widen the green in casual hoops;
  nothing reads them in hoops today (§1 finding 2).
- `assumption:` the courts' order (Ones and The Run to the north, Flight and The Arc to the south) and every coordinate in
  `layout.ts` are [TUNE] placeholders for the owner's walk of the prototype.
- `assumption:` a phone chunk of one piece, not 256 m (owner question 12).
- `assumption:` the per-piece budget (25 draws, 16 meshes) is derived from the measured rows above, not measured on a
  built piece; V1's guard measures it.
- **The shipped Venice frame is a mirror of the real coastline.** The dressing puts the sea at −x and north at −z
  (`nexus/veniceBoardwalk.ts`); in Babylon's left-handed space that means a player facing north has the sea on the
  RIGHT, where on the real beach it is on the left. The layout keeps the shipped frame so the shipped dressing drops in
  unchanged; the 2D maps are drawn north-up with the sea on the left as the data names it. `assumption:` nobody will
  notice a mirrored real-world-inspired beach; if the owner wants it true to life, the hub flips the sign of x (one
  transform on the hub root, and the dressing's own placements are mirrored with it).
- No tuned number, no mode file, no shared runtime file, no route a player can reach was changed.

_Sources: the owner's words (2026-11-12, relayed); `docs/ADVENTURE-PLAN.md`; `docs/OWNER-DECISIONS.md`; `docs/LANES.md`;
`lib/nav/families.ts`; `lib/babylon/modes/registry.ts` and each mode's venue call (cited per row);
`lib/babylon/nexus/{venueSpecs,courtLocations,veniceBoardwalk,boardVenues,placeLooks,freeRunTracks}.ts`;
`lib/babylon/visual/{venuePropSets,VenueProps,VenueMaps,meshyProps,CourtSurface}.ts`; `lib/map-data.ts`;
`lib/babylon/racing/{kart,aero}Circuits.ts`; `lib/babylon/combat/arenas.ts`; `lib/babylon/config/mobileBudget.json`;
`scripts/hoops-phone-budget-tests.ts`; `docs/SHIP-READINESS.md`; `server/netd/src/{room,partyRules}.ts`;
`components/party/social/party-start.tsx`; `components/games/end-screen/end-screen.tsx`;
`lib/babylon/adventure/{world,br,host}/*`._
