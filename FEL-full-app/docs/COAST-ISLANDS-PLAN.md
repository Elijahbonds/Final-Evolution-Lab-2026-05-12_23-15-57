# The Coast & Islands: the first open zone (lane/coast-islands, 2026-11-18)

**Owner, 2026-11-12 and 2026-11-17.** The world is big open zones joined by a Venice Beach hub town, with a load between
zones. The bar is the open zones of DBZ Kakarot, Pokémon Legends Arceus, Sword and Scarlet — **a bar only**: no names, art,
creatures, maps or UI of theirs. A zone's life is flying and riding, creatures and partners, side quests and towns, and
sports spots everywhere. **The first zone is the Coast & Islands.** You travel with **one partner** and keep a **creature
log**. Play is **party-only** (nobody but your party walks your zone). Art comes from the shipped kits, procedural pieces and
the owner's Meshy (owner 2026-11-17, default 6). Every name here is `[PLACEHOLDER]` until the owner names it.

This file is the zone's build plan, phases A to F. Phase A is built (below); B to F are next.

---

## 1. What the engine already has (the survey)

| Piece | Where | What the zone takes from it |
|---|---|---|
| The Adventure host: a fixed 60 Hz step, the systems, the input, the camera hints | `lib/babylon/adventure/host/*` | The zone runs ONE host with the movement only, exactly as the Venice hub does |
| Movement: run, jump, dash, slopes, steps, riding, flight | `lib/babylon/adventure/movement/*`, `flight/*` | Walk, run and jump now; riding and flight are phase E. **No movement or camera number is changed** |
| World pieces: flats, ramps, blocks, the ground and sight questions | `adventure/world/pieces.ts`, `host/hostWorld.ts` | The zone's WorldSource answers the same two questions from a heightfield |
| 64 m pieces | `world/pieces/brTiles.ts` (the BR's 5 × 5 tiles), `lib/adventure/venice/layout.ts` (`PIECE_M`, `tiersAround`) | The same 64 m piece and the same full / LOD / far rings. **There was no streaming code yet** (the plan's V3); phase A adds a small streamer for the zone (below) |
| The partner: brain, identity, fusion, evolution | `adventure/partner/*` | Phase B: one partner travels with you |
| Monsters and their defs, the bestiary | `adventure/combat/monsters`, `world/ch1/bestiary.ts` | Phase C: the zone's creatures and the log |
| Story beats and quests | `core/StoryHub.ts` `QuestDef`, `adventure/story/*` | Phase D: side quests |
| The Venice hub on the host, its page, its phone row and guard | `VeniceHubMode`, `app/play/venice/**`, `scripts/venice-hub-budget-tests.ts` | The zone is built the same way (the Venice files are the Venice lane's and are not touched) |
| The floating phone stick | `lib/babylon/ui/floatStick.ts`, `TouchOverlay` `FLOAT_STICK_MODES` | The zone walks on it |
| The Creator look at the hoops builder's height, the body merge | `CharacterPipeline.spawnPlayer`, `hoops/ratedPlay` `ratedLookScale`, `core/bodyMerge.ts` | The player is spawned exactly as in Venice |
| Island and sea content | `coastal-links` golf, the surf breaks, Coconut Cove (aero), Harbor Run (kart), Night Beach; the Venice sea | Their MODES are the zone's sports spots (phase D). Their art is mode-sized; the zone draws its own sea and terrain from the same procedural approach |
| Shipped art the zone can use | `public/models/props/nature` (Kenney, CC0: palms, rocks, bushes), `public/models/meshy` (the owner's surfboard), `visual/groundTextures` (the sand tile) | Used now |

---

## 2. The zone, as built in phase A

`/play/coast` (unlisted, noindex) mounts **`CoastZoneMode`** (`lib/babylon/modes/CoastZoneMode.ts`, registered, not in
`ENABLED_BABYLON_MODES`) on the Adventure host: walk, run, jump; no partner, no creatures, no combat yet.

**The map** (`lib/adventure/coast/zoneLayout.ts`, the Venice frame: x west to east, north is −z, the sea to the west):

- **6 × 6 pieces of 64 m (384 m)**, the plan's first cut. About 60 % is water you cannot stand in.
- **The mainland**: a curving beach strip along the east side, sand to the dune line, grass behind, palms along the dunes.
- **The Landing** [PLACEHOLDER]: the arrival dock, a jetty out from the beach. **The boat from Venice is moored at its end.**
  You arrive on the dock, facing Palm Key.
- **Palm Key** [PLACEHOLDER]: the near island, palms and a low hill, joined to the beach by **the Boardwalk Bridge**.
- **Reef Rock** [PLACEHOLDER]: the far island, rocks and sea stacks, reached by **wading the sandbar** from Palm Key.
- **The sea**: shallows you can wade (to 0.85 m deep), then deep water. On the ground deep water stops you like a wall; a
  jump off the dock that ends over deep water puts you back where you could stand (`coast.deepWaterTurnBack`).

**The ground and the picture are one function.** `terrainY(x, z)` is the sim's ground (`zoneWorld.ts`) and the drawn
terrain's height (`zoneView.ts`), so what you see is what you stand on.

**Streaming** (`ZoneStreamer`, `zoneView.stream`): each 64 m piece with land or shallows has its own terrain mesh. The 3 × 3
pieces round you are drawn fine (2 m) with every prop; the next ring (the 5 × 5) coarse (8 m) with only the tall props
(palms, sea stacks); everything further, coarse only. A fine mesh is built when its piece reaches the 5 × 5 (ready before
you arrive) and dropped when it falls to far. A piece drops its detail only one piece after leaving its ring
(hysteresis), and nothing changes until you cross into another piece. Open-sea pieces draw nothing of their own: one sea
plane and one sea floor travel with the camera. Each prop model is loaded once and drawn as thin instances of the pieces
that want it.

**The way in and out** (`lib/adventure/coast/door.ts`):
- **From Venice (to be wired by the Venice lane):** Venice's pier end (`pier.end` in `lib/adventure/venice/layout.ts`,
  `zone: 'coast'`) calls `router.push(coastEntryHref('pier.end'))` → `/play/coast?from=venice&spot=pier.end`. That is the
  whole hook. The zone does not need it to work: any visit arrives on the dock.
- **Back to Venice:** the boat on the dock (walk into its ring: "Back to Venice") and the "Venice" corner link both go to
  `veniceReturnHref(search)` → `/play/venice?spot=pier.end`. For the player to land at the pier end, Venice reads
  `?spot=pier.end` the way it already reads a court's spot; until it does, the hub's normal start.

**Phone budget**: the `coast_zone` row in `lib/babylon/config/mobileBudget.json`, measured on the phone rig
(`scripts/probes/coast-islands/zone-rig.mts`) against the Venice hub in the same session, and the static guard
`scripts/coast-zone-budget-tests.ts` (section 4).

---

## 3. The phases

Sizes are lane-weeks of one agent lane (S ≤ 1, M 1–2, L 2–3, XL 3–5). Marks: **OWNER** (a name, a decision, a device
test), **GATE 0** (animation or rig work: verify the rig first), **ART** (beyond the shipped kits, procedural and Meshy).

| Phase | Delivers | Size | Exit gates (all measured) | Marks |
|---|---|---|---|---|
| **A — The walkable shell** (BUILT, this lane) | `/play/coast` on the Adventure host: the beach, the sea, Palm Key and Reef Rock, the dock with the boat, the bridge, the sandbar; 64 m streaming; the Creator look at builder height; the boat back to Venice and the Venice hook; the `coast_zone` phone row and guard | M | Both islands reached on the real host headless; deep water holds; streaming rings and hysteresis tested; the phone row inside budget with the guard's control failing; every-screen clean on `/play/coast`; tsc, ci-suite, vitest green | OWNER: the walk on a phone, the names |
| **B — The partner and the creature log** | One partner walks with you from the dock (the Adventure's `partner/*`: brain, identity; follow, wait, come here); the log screen (every creature seen and befriended), saved in the Adventure save on the device | M | The partner keeps up across the bridge and the sandbar headless; never stands in deep water; the log saves and reloads; the budget holds with two bodies | OWNER: the partner's look and name; "befriend" is our verb (VENICE-HUB-PLAN q. 11). GATE 0 if the partner is not a humanoid |
| **C — Creatures** | Three to five creature kinds on the islands and the shallows, built from the Creator's parts first, the owner's Meshy for one signature creature; idle, wander, flee, follow; befriend one into the log (no fights in the first cut) | L | Each kind spawns, wanders and despawns with its piece's streaming; a befriend completes headless; at most 6 creatures in the 3 × 3; the budget holds | **GATE 0** (a non-humanoid rig), ART (creature bodies), OWNER: the creature direction (q. 10) |
| **D — The harbour town, side quests, sports spots** (BUILT, lane/coast-d: section 4d) | A small harbour town on the mainland (the kit, procedural first); 2–3 side quests in the story's beat and quest format; sports spots that open their modes with `?from=coast&spot=`: golf (coastal-links), surf (the breaks), Aero Aces (Coconut Cove), Velocity Kart (Harbor Run), Beach Rally; the end screen's way back to the zone | L | Each spot launches its mode in one tap and returns to it; a side quest completes headless; the town's pieces within the per-piece budget | OWNER: the town's and the spots' names. A one-line route in `end-screen.tsx` (the end screen's owner) |
| **E — Riding and flying** | Riding the partner over the shallows and the sea between the islands (the movement's `riding`), short glides; the fused cruise capped inside the zone (VENICE-HUB-PLAN q. 9); load-ahead two pieces ahead at speed | L | Ride to every island; no frame over 100 ms from a load at riding speed; the budget holds at speed | OWNER: when flight unlocks (Adventure decision 10); the cruise cap is a new feel knob |
| **F — Growth and finish** | The zone to its full 12 × 12 (768 m): more islands and reefs, the far silhouette, a sky that suits it; the Venice door wired end to end with the boat's short load; online presence for the party | XL | Door → zone playable ≤ 8 s and full ≤ 20 s on the owner's phone; a 10-minute walk with texture memory flat; the Venice → coast → Venice round trip E2E | OWNER: the device test, the names, the netd redeploy for presence |

Not started in this run: the partner, creatures, flying, riding, quests (phases B to E).

---

## 4. Phase A, measured

**The phone rig** (`scripts/probes/coast-islands/zone-rig.mts`, 2026-11-18 08:50–09:20 UTC): the real mode bundled with esbuild, a
phone (390 × 844, DPR 3, touch), SwiftShader, the page's JS throttled 4× until it is playable; the zone and **the Venice hub as the
same-session control**, interleaved, three runs each; then the zone with streaming off. The walk: from the dock along the beach
toward the bridge, crossing four 64 m pieces. SwiftShader overstates a phone; the comparison with the control is the point.

| Run | Playable (s) | Worst frame: draws / active meshes / texture MB / bodies | Fine pieces / props drawn (max) |
|---|---|---|---|
| Zone 1 · 2 · 3 | 34.7 · 32.4 · 28.3 (median 32.4) | 60 / 34 / 37 / 1 (all three within 1) | 16 / 147 |
| Venice hub (control) 1 · 2 · 3 | 38.9 · 33.1 · 33.3 (median 33.3) | 48 / 51 / 73 / 1 | — |
| Zone, streaming off (`coast.streamOn` 0) | 31.2 | 59 / 35 / 37 / 1 | 30 / 187 |

- **The zone is playable as fast as the Venice hub** on the same rig and session (median 32.4 s against 33.3 s), and costs fewer
  active meshes and half the texture memory (37 MB against 73 MB). It draws 12 more calls than the hub (60 against 48): one per
  land piece's terrain mesh. All well inside the phone plan's 450 draws / 300 meshes / 200 MB.
- **Streaming** halves what is drawn in triangles (the guard: the worst standable piece 38,568 triangles, 75,858 with streaming
  off) and drops props and fine terrain pieces by a third on the rig (147 against 187 props, 16 against 30 fine pieces). It
  does not change draw calls: every land piece always draws one terrain mesh, fine or coarse.
- **Frame time on the rig** (rAF gaps while walking, throttle off): the zone's worst frame was 3.5 / 2.1 / 1.5 s against the
  hub's 1.4 / 1.7 / 1.2 s (p95 1.8 / 1.2 / 1.0 s against 1.2 / 1.2 / 0.7 s). The rig draws a 1170 × 2532 phone frame in software,
  so these are the rig's, and three runs do not separate the zone from the box's noise; the zone does more on a walk (it crosses
  pieces and builds terrain). **Not measured on a phone.** Phase F's gate (no frame over 100 ms from a load) needs the owner's
  phone or a GPU rig; if a hitch shows, building a crossing's new fine pieces one per frame is the first fix.
- The `coast_zone` row in `lib/babylon/config/mobileBudget.json`: measured 60 / 34 / 1 / 37 / 0, budget (× 1.2) 72 / 41 / 2 / 45 / 0.
- **The static guard** `scripts/coast-zone-budget-tests.ts` (in ci-suite): the worst standable piece's triangles (38,568, cap
  40,400) and place draws (51, cap 53), the place's textures (2.1 MB: only procedural; the Kenney models carry none), the model
  list, and its **control**: streaming off must come out over the triangle cap (it does: 75,858).

**Headless, on the real Adventure host** (`lib/adventure/coast/coast.test.ts`): dock → beach → bridge → Palm Key → sandbar →
Reef Rock, every leg reached, never in deep water; running off the dock stops at the deep water; a jump off its side is turned
back, and with `coast.deepWaterTurnBack` 0 (the control) the same jump does end over deep water.

**Pictures** (phone, JPG, from the rig): arrival on the dock; the beach from the shallows; Palm Key and the bridge from beside it,
in `scratchpad/coast-islands/` (paths in the lane report).

**Every-screen on `/play/coast`: not scored in phase A** (it was in phase B: clean, section 4b). The scorer needs a production build (3.2 GB); two builds were killed
for memory beside other lanes' builds, the third succeeded but was deleted to free disk before the scorer's turn, and the disk
then stayed under the 7 GB-free rule (3.4 GB free). The page is built the same way as `/play/venice`, which scored clean
(VENICE-HUB-PLAN §8): a back link (here "Venice"), 16 px text, 44 px targets, one action. It needs a scorer run before the
zone is linked from anywhere.

**Found and fixed on the way:** the palms were never drawn on the first rig run — a Babylon clone keeps its source's parent, so
the baked prop masters were disposed with the import's root (held now by `zoneProps.test.ts`, mutation-checked).

---

## 4b. Phase B, built (lane/coast-b, 2026-11-18)

**What it adds.**
- **One partner walks with you.** It is the Adventure's own partner: the brain (`adventure/partner/brain.ts`: a slot behind
  and to the right, a sprint when it falls behind), its speed and its body, spawned by the host from the Adventure save. A
  player with no partner yet walks with the Adventure's default creature (strideraptor) on loan, never written to the save.
  The zone adds a keeper (`lib/adventure/coast/zonePartner.ts`): the partner reappears 3 m behind you, on ground you walked
  over, when you leave it 24 m behind, when it is in deep water, after a turn-back that left it, or when something blocks it
  for a second while it is more than 6 m back. It never blocks you (the movement sim has no body-to-body collision; it
  keeps its slot).
- **Four creatures** (`zoneCreatures.ts`): the Shellhopper in the shallows below the Landing, the Ember Gull on the dunes,
  the Palm Glider on Palm Key, the Reef Stone on Reef Rock (all names `[PLACEHOLDER]`). Each wears the Adventure's shipped
  creature body (a colour per element, wings from stage 2), wanders near home on ground it can stand on, and is drawn only
  while its piece is drawn. They do not fight.
- **The creature log** (`creatureLog.ts`, `zoneLife.ts`): within 16 m a creature is *seen*, within 3 m you have *met* it. The
  page has a "Log n/4" button (top right) and a panel listing each creature: its name once found, where it lives, Seen or
  Met; a short note says when one goes in. **It is saved in the Adventure save**, the same document and path as all
  Adventure progress, as story flags `coast.log.<id>`: on the device first, and to the account under the Adventure save
  policy — which today keeps everyone's Adventure save on the device, because the account-side Adventure save (its table)
  is not built yet (`save/policy.ts` `ADVENTURE_SERVER_SAVE_ENABLED`, the owner's step). No schema change, no new save
  version.
- **A phase A fix the partner found:** the dock and the bridge stood 0.7 m above the sand all the way to their landward ends,
  above the movement sim's 0.45 m step, so anyone walking up beside the bridge was stuck against its side (a slow walk
  reached 2 of 6 points). A deck now lies 0.15 m on the sand, rises with the water's depth through the shallows, and is
  level over the water. With it, the partner follows the whole route by itself.

**Measured** (the phone rig, 2026-11-18 14:12–14:32 UTC, one session: phase B three times against the same zone with the partner and
the creatures switched off — phase A — three times, interleaved; the walk from the dock past the Shellhopper, down the beach,
over the bridge onto Palm Key, 6 of 6 points reached in every run, no page errors):

| | Phase B (partner + creatures) | Phase A control |
|---|---|---|
| Playable (s) | 30.9 · 31.8 · 25.8 (median 30.9) | 30.5 · 28.2 · 27.3 (median 28.2) |
| Worst frame: draws / active meshes / texture MB | 75–76 / 37–38 / 37 | 60 / 34 / 37 |
| Skinned bodies | the player only (the partner and the creatures are placeholder shapes, not skinned) | the player |
| Partner's distance behind you: mean / 95th percentile / max (m) | 7.3 / 16.8 / 17.1 · 5.4 / 6.7 / 6.9 · 8.4 / 22.9 / 23.3 | — |
| Catch-ups on the walk | 1 · 0 · 1 (all "stuck", none "far") | — |

- **What the partner and the four creatures cost:** about 16 draws and 4 active meshes, no texture memory, no skinned body. The
  static guard counts 12 draws for them (`scripts/coast-zone-budget-tests.ts`); the rig sees 16 (the partner's movement view
  and the shadow pass add a few). The `coast_zone` row: measured 76 / 38 / 1 / 37 / 0, budget (× 1.2) 92 / 46 / 2 / 45 / 0.
- **Load:** playable about 2.7 s later at the median (30.9 against 28.2 s; the runs overlap: 25.8–31.8 against 27.3–30.5). The
  rig overstates a phone; the owner's phone is the judge.
- **Frame time on the rig** (software raster): worst 0.9 / 0.9 / 1.6 s against 1.1 / 0.9 / 3.3 s: no difference the rig can
  separate. Not measured on a phone.
- **The log:** every phase B run logged the Shellhopper (met in two runs, seen in one) and two logged the Palm Glider (seen).
- **Every-screen on `/play/coast`** (the production build, 390 × 844, 4× throttle; the scorer's planted-fault control passed
  first): **clean**. Clear, finished and right pass; first content 288 ms, layout shift 0. "Fast" reads *not measured*: the
  scorer does not time a tap on a screen running 3D (the rig has no real GPU), as for every 3D screen. The first score
  (12:40) found a dead end and a 2.7 s tap: it read the page while the 3D stage was still loading, and the Venice link lived
  inside the stage. The link is now drawn outside it, from the first paint, and the zone's load gives the page turns.

**Knobs** (Coast · zone, `docs/FEEL-PANEL.md`): `coast.partnerOn` 1, `coast.partnerCatchupM` 24, `coast.partnerStuckSec` 1,
`coast.creaturesOn` 1, `coast.logSeenM` 16, `coast.logMeetM` 3. Each 0 or off restores phase A.

**Next (phase C):** the creatures as real Adventure bodies (a non-humanoid rig, GATE 0), befriending one into the log, the
partner's look and name chosen by the owner, and a dedicated `log` field in the save once the log outgrows a handful.

## 4d. Phase D, built (lane/coast-d, 2026-11-18)

**What it adds.**
- **A harbour town** (`lib/adventure/coast/zoneTown.ts`, `zoneTownView.ts`) at the landward end of the dock: a 78 m street
  running inland, four houses on its south side (procedural boxes and gables, one merged mesh, solid to walk into), the
  shipped Venice boardwalk kit (four shopfronts and three stalls, `public/models/props/venice/env2/venice_boardwalk_kit.glb`,
  read and never edited) as the market strip on its north side, and four townsfolk wearing the Venice watchers' crowd bodies
  (`Onlookers`, the same roster bodies, idling and paused while off screen). Names are `[PLACEHOLDER]`: Marisol the
  harbourmaster, Teo the beach coach, Pip, Ana at the market. Walk up to one and a card shows their line.
- **Four sports spots that open games already in the registry** (none skipped; no new game): **Surf** (`/play/surf`) on the
  beach south of the dock, **Beach Volleyball** (`/play/volleyball`) on the beach to the north, **Golf** (`/play/golf`) from
  a tee on Palm Key's headland, **Velocity Kart** (`/play/velocity-kart`) from a start line at the town's far end. Each has
  a marker (a board, a net, a flag and tee box, a start gantry), a ground ring at the card's edge and a sign high above it.
  Step into the ring and a card offers "Play <game>" in one tap — the Venice courts' way: the coast writes a return mark
  (`spotReturn.ts`, sessionStorage `fel.coast.return`, three hours) and opens `<route>?from=coast&spot=<id>`; the shared end
  screen's "Back to the coast" button (shown when the mark is there and Venice's is not) returns to
  `/play/coast?from=coast&spot=<id>`, and you stand just outside that ring, facing it.
- **Three side quests** (`zoneQuests.ts`), offered by a "!" over the giver: *The stone out past Palm Key* (Marisol: log the
  Reef Stone), *A match at the net* (Teo: play a match at the volleyball spot and come back), *Hello, Shellhopper* (Pip: meet
  one). A "Quests n/m" button (under the Log button) opens the list; a note says when one is done. **Saved like the creature
  log:** story flags in the Adventure save (`coast.quest.<id>` 1 taken / 2 done, `coast.played.<spot>`), on the device first
  and under the Adventure save policy. No schema change, no new save version.
- `assumption:` "win a game at the volleyball spot" became "play a match there and come back": the end screen does not tell
  the zone who won, and reading a result from another mode's store would be new plumbing across lanes. A win condition is a
  one-line change in `zoneQuests.ts` once a mode reports its result to the return.

**Measured** (the phone rig, 390 × 844, 4× throttle, one session: phase D three times against the same zone with the town, the
sports spots and the quests switched off — phase B — three times, interleaved; the walk from the dock up the town's street
to Pip, back to the beach, past the Shellhopper, to the volleyball net, down the beach, over the bridge onto Palm Key, 10 of
10 points in every run, both cards seen in every phase D run, no page errors). Two sessions: d1 (16:04–16:35 UTC, a quiet
box, the town loading with the zone) and d4 (18:55–19:25 UTC, the town loading after you can move; a test run shared the box
for its first half, so its frame times are noisier):

| | Phase D | Phase B control |
|---|---|---|
| Playable (s), d1: the town loads with the zone | 28.2 · 29.6 · 28.1 (median 28.2) | 22.8 · 21.6 · 23.4 (median 22.8) |
| Playable (s), d4: the town loads 0.5 s after you can move | 28.4 · 24.7 · 29.6 (median 28.4) | 28.9 · 32.4 · 22.5 (median 28.9) |
| Worst frame: draws / active meshes / texture MB (d4) | 120–136 / 58–66 / 63 | 75–81 / 44 / 37 |
| Skinned bodies | the player and the four townsfolk | the player |
| Worst frame time (s), d1 · d4 | 2.1 / 1.1 / 1.3 · 2.9 / 3.7 / 3.8 | 1.0 / 0.9 / 0.9 · 2.1 / 2.8 / 1.3 |
| Partner's distance behind (m), d4: mean / 95th pct / max | 5.1 / 8.1 / 8.5 · 5.6 / 7.9 / 8.2 · 5.2 / 7.6 / 8.3 | 5.6 / 8.0 / 8.3 · 5.4 / 7.9 / 8.2 · 5.2 / 7.4 / 8.3 |

- **What the town costs:** about 55 draws, 20 active meshes, 26 MB of texture memory and four skinned bodies. The static guard
  counts 20 draws for the houses, the street, the market kit (nine pieces), the sports markers and the quest marks; the rest
  is the four townsfolk (each body draws several meshes, its outline and its shadow). The `coast_zone` row: measured
  136 / 66 / 5 / 63 / 0, budget (× 1.2) 164 / 80 / 6 / 76 / 0 — a raise, inside the phone ceiling (600 / 400 / 16 / 256).
- **Load:** loaded with the zone, the market kit and the townsfolk made the zone playable about 5 s later on the rig (d1).
  They now start loading 0.5 s after you can move (`coast.townLoadAfterSec`), and the d4 runs show no difference in time to
  move (median 28.4 against 28.9 s). The price is in play: the bodies land while you walk, and the worst frame on the rig was
  about 1 s longer than the control's in both sessions. One frame, once, in the first seconds; the rig rasterises in
  software, so the owner's phone is the judge. With `coast.townsfolk` 0 the town costs 90 draws and no hitch from bodies
  (diag1).
- **Every-screen on `/play/coast`** (the production build, the scorer's planted-fault control passed first): **clean** in d1, d2
  and d5, the last on the final code (first content 256 / 668 / 292 ms, layout shift 0; "fast" not measured on a 3D screen,
  as before).
- **The way back from a game, on the real page:** `/play/coast?from=coast&spot=volley.net` puts you just outside the net's
  ring facing it; one push on the move stick and the card offers the game (d2). The round trip's other half (the end screen's
  "Back to the coast" button) is covered by `end-screen.test.tsx` and `phaseD.test.ts`, not by a played match.
- **Found and fixed by the pictures:** a sports sign that filled the screen once you stood in its ring (now 6.5 m up), the
  volleyball net reading as a white wall (now two tapes), the kart's gantry filling the view back from a race (now 5 m up),
  the cards sitting under the Quests button (now below it), and rings drawn smaller than the card's trigger (now the same).

**Knobs** (Coast · zone, `docs/FEEL-PANEL.md`), all new: `coast.townOn` 1, `coast.townsfolk` 4, `coast.townLoadAfterSec` 0.5,
`coast.sportsOn` 1, `coast.questsOn` 1. Each off restores phase B.

## 4f. Phase F, first part: the Venice door, end to end (lane/coast-door, 2026-11-18)

**What it adds.** The boat from Venice to the coast and back, through the app's own links:
- **Venice:** a landing on the sand west of the courts — a plank jetty to the water's edge and a boat moored at its end (one
  merged, vertex-coloured mesh: one draw, no texture), with a gold ring at the jetty's head (an instance of the courts' own
  ring). Step into it and the courts' walk-up rule (a short dwell, a metre's hold) brings up a card: "The Boat to the Coast"
  with one button, **Take the boat to the coast**, which opens `/play/coast?from=venice&spot=pier.end`. The mini-map shows the
  boat. Behind the knob `venue.coastDoor` (1; 0 = no boat, no card, and `?spot=pier.end` lands at the court gate as before).
- `assumption:` the landing stands in for the pier end. The plan's pier end is in the Pier district (`layout.ts`, a V5
  district) and the hub walks only V1's courts district today, so the pier cannot be reached yet. The landing uses the same
  spot id (`pier.end`), so when the pier is walkable the landing moves there and nothing else changes.
- **The coast:** `/play/coast?from=venice&spot=pier.end` lands you on the dock (its arrival, unchanged); the boat back's card
  and the corner link open `/play/venice?spot=pier.end`, and the hub lands you beside the boat's ring, facing the boat.
- Venice's courts are unchanged: their walk-up, returns, solids and tests are as they were (the boat's ring is far from every
  court's place; the tests hold that).

**Measured on the production build** (the every-screen rig's `next start`, a phone: 390 × 844, DPR 3, touch;
`scripts/probes/coast-islands/door-roundtrip.mts`, kept in the repo, run inside the gate hold with `DOOR=1`):
- **The round trip passed on the app's own links** (r4): the hub's walk to the boat brought its card up; *Take the boat to the
  coast* opened `/play/coast?from=venice&spot=pier.end`; the coast landed the player on its dock (55, 24: its arrival); the walk
  to the coast's boat back brought its card up; *Back to Venice* opened `/play/venice?spot=pier.end`; the hub landed the player
  beside the boat's ring, facing the boat (−98.5, −69: the boat's return spawn then). No page errors; a tap at each button's
  centre lands on the button (nothing covers the cards).
- Once in r4 the scripted walk ran 5.5 m on past the ring at the rig's 2–3 frames a second and the card went before the press;
  the ring now reaches the rim (x −104 → −106), so a walk that runs on stops at the rim still in the boat's place.
  On the final code (r6, x −106, 21:54–22:12 UTC) the round trip passed first time, no walk back: the walk ran on to the rim
  (x −109.9) and the card stayed up; the coast landed on its dock (55, 24); the hub landed beside the boat (−100.5, −69);
  no page errors. Every-screen clean on both pages again (first content 288 / 392 ms).
- **Every-screen** (the scorer's planted-fault control passed first each time): **clean** on `/play/venice` and `/play/coast`
  in r2, r3 and r4 (first content 364–456 ms, layout shift 0; "fast" not measured on a 3D screen, as before).
- **Cost:** the landing is one draw (one merged mesh, one material, no texture, no model; `scripts/venice-hub-budget-tests.ts`
  now holds that, with a planted-texture control that fails it); its ring is an instance of the courts' ring. Venice's place
  texture memory is unchanged (the guard's 15 checks as before, plus 3). The `venice_hub` row is unchanged: the landing adds at
  most one draw and two active meshes where it is in view (the row: 46 / 56 draws, 58 / 65 active meshes, measured / budget). Not re-measured on the phone rig.

**Knob:** `venue.coastDoor` 1 (new). 0 = the hub as before the door.

## 4g. Phase F-lite: the walking hitch, and the zone grows past Reef Rock (lane/coast-f, 2026-11-18)

**Where the hitches came from** (two diagnosis runs on the phone rig, each long frame taken apart with Babylon's own counters —
render, active-mesh evaluation, render targets, shader compiles, the time between frames — and the zone's update timed by part):
- **The zone's own code was never the hitch.** Its update never took more than 141 ms in a frame; streaming's work in the frame
  you cross into a piece was 2.4 ms at worst (the coarse ground is always built; the fine ground and the prop refresh are cheap).
- **Shader compiles at first sight** were the zone's real hitches: 3,379 ms for two programs the first time something came into
  view mid-walk, 1,751 ms for the market kit's shadow-depth program when it landed. A phone compiles faster than the rig, but
  this is the hitch a phone feels too.
- **Most long frames on the rig are the time between frames** (2–3 s, with the frame itself 5–20 ms): the software GPU drawing
  a 780 × 1688 frame. That is the rig's, not a phone's, and it scales with what is in view.

**What changed** (each behind a knob; both ship off):
- `coast.prewarmLate` (**ships 0**, see below): everything that lands after the load — the seven prop models, the market kit, each townsperson's body —
  has its shaders (lit, shadow depth, instanced, skinned) compiled as it lands (`core/hitchProbe` prewarmMeshes, the harness's
  own phone pre-warm), not on the frame it first comes into view. The townsfolk already land one a frame apart (Onlookers
  oneBodyPerFrame); their compile now happens with each landing instead of at first sight.
- `coast.streamSliced` (**off by default, no measured win on the rig; try on a real phone**): crossing into a piece no longer builds the new full pieces' fine ground and refreshes all seven prop
  models in that frame; the coarse ground stands in and one job runs a frame. Small on the rig (the work was 2.4 ms), kept for
  phones with slower CPUs.
- `coast.zoneGrow`: see below.

**Measured** (the phone rig, 390 × 844, DPR 3, the walk from the dock up the town's street, the beach, the bridge onto Palm Key,
10 of 10 points in every run, no page errors; 3 runs a side, interleaved, same session; the control is the same zone with the
phase F-lite switches off):

| | Worst frame (s) | 95th-percentile frame (ms) | Shader compiles on the walk (ms) |
|---|---|---|---|
| m1 (23:21 UTC): slices + late pre-warm | 3.40 · 2.94 · 2.74 | 1,225 · 1,140 · 1,105 | 5,061 · 5,186 · 5,182 |
| m1 control (the old way) | 2.35 · 3.81 · 2.20 | 1,172 · 1,139 · 676 | 2,351 · 1,896 · 2,749 |
| m2 (23:55 UTC): slices only | 1.54 · 1.52 · 1.79 | 574 · 632 · 604 | 2,682 · 1,069 · 2,041 |
| m2 control (the old way) | 1.47 · 2.30 · 1.44 | 511 · 513 · 606 | 4,140 · 467 · 1,293 |

- **No measurable gain on the rig.** The slices are within the noise of the old way in both sessions (they move ~2 ms of work), so they **ship off** too (coordinator 2026-11-19: a behaviour ships on only on a measured win; try on a real phone);
  the late pre-warm was worse — it compiles every variant a mesh could draw, doubling the compile time — so it **ships off**
  (the knob stays for a phone with parallel shader compiles to try).
- **The session matters more than the switch:** the same zone's worst frame was 2.2–3.8 s in m1 and 1.4–2.3 s in m2, a quieter
  box (Venice's was 1.2–1.7 s in phase 1). The rig's long frames are mostly its software GPU, which a phone does not have; the
  owner's phone is the judge.
- **The townsfolk:** they already land one a frame apart (Onlookers oneBodyPerFrame) and start 0.5 s after you can move
  (phase D); a body's setup is one ~1 s frame on the rig and cannot be split further without changing the shared crowd code.
  Not changed beyond what phase D did.
- **Budget:** draws 118–134, active meshes 58–67, textures 63 MB, the player and four townsfolk; the `coast_zone` row's active
  meshes 66 → 67 measured (budget 80 → 81), the rest unchanged (136 / 67 / 5 / 63 / 0, budget 164 / 81 / 6 / 76 / 0).
- **Every-screen on `/play/coast`** (the production build of this branch, 00:16–00:25 UTC; the planted-fault control passed first):
  **clean** (first content 220 ms, layout shift 0).
- **Gull Key** reached on the rig too: on past Palm Key along the sandbar, over Reef Rock and down the sandbank (15 of 15 points;
  pictures `coast-sandbank-phone.jpg`, `coast-gullkey-phone.jpg`).

**The zone grows** (`coast.zoneGrow`, the budget allowed it): the 2 × 2 block of 64 m pieces north-west of Reef Rock — mostly
open sea (over 70 % of the block is water you cannot stand in), a sandbank from Reef Rock's west shore (its crest 0.55 m under,
wadeable), and Gull Key, a 15 m palm islet (`[PLACEHOLDER]`). The grid gained two columns west (x −320 … −192), of which only
that block is zone; phase A's pieces keep their places. 40 pieces now; the way to 768 m (12 × 12) is the same move again.
Walked on the real host from Reef Rock along the sandbank onto Gull Key, never in deep water (`phaseF.test.ts`). The static
guard: the worst standable piece 40,864 → 41,388 triangles (cap 42,900), worst draws 83 → 87 (cap 87: the four new land
pieces' coarse ground), textures unchanged.

## 5. Flags and assumptions

- `assumption:` the zone's layout — which side the mainland is on, the islands' places and sizes, the dock, the bridge and
  the sandbar — is a [TUNE] placeholder for the owner's walk. The frame is Venice's (the sea to the west), so the boat from
  Venice's west-facing pier lands on a west-facing beach.
- `assumption:` wading to 0.85 m deep, and a beach whose shallows run 12 m out before the drop. New numbers, not feel knobs:
  they are the shape of the land, held by the tests.
- `assumption:` the boat is a placeholder built from boxes (procedural, like the hub's placeholders); the owner's Meshy can
  replace it.
- New knobs (Coast · zone, `docs/FEEL-PANEL.md`): `coast.streamOn`, `coast.streamFull`, `coast.streamLod`, `coast.streamKeep`,
  `coast.deepWaterTurnBack`. No shipped number moved.
- Props are scenery: you walk through a palm or a rock (no collision), as in Venice. A rock you cannot walk through is phase
  D's (a block piece under each big rock).
- The sky: the harness's painted ocean dome travels with the camera, as the Adventure's story does (`AdventureMode`).
- No Venice file was touched. The Venice hook is described in section 2 and in `lib/adventure/coast/door.ts`.
- Phase D, shared file: `components/games/end-screen/end-screen.tsx` gains a "Back to the coast" button, the Venice courts'
  pattern beside Venice's own (Venice's wins when both marks are set); two assertions added to its test, none changed.
- Phase D, the static guard's caps raised for the town (computed + 5 %): `PLACE_TRIS` 40400 → 42900, `PLACE_DRAWS` 66 → 87,
  `PLACE_TEX_MB` 2.2 → 10.6 (the market kit's maps). Its control (streaming off) still fails the triangle cap.
- Phase D reads, never edits, the Venice boardwalk kit GLB and the `Onlookers` crowd bodies.
