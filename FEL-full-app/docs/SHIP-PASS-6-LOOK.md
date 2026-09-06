# Ship Pass 6 — LOOK (2026-09-05, evening)

Owner: "make my scan the default hero, fix the arms of the NPCs and models, make sure animations work, double check the
other modes, let's do a 10-phase on everything visual and aesthetic per mode. It needs to look good."

Owner decisions (multiple choice, 2026-09-05): the scan is the hero **everywhere, rivals stay on the roster**; the scan
keeps its **baked outfit** (Closet kits apply to other bodies); phones load a **decimated mobile bake** of the scan; the
three-point contest's capsules become **roster bodies**.

Standing rules: Gate 0 (22 unprefixed bones) before any animation work · tests green + count before every commit · a
risk level on every change · never edit imported code while a sweep runs · the second writer owns the hero loader and
Venice look — the owner's direct order to make the scan the hero is executed here and logged for them.

| # | Phase | Deliverable | Proof |
|---|---|---|---|
| 0 | Gate + plan | sweep finished, this plan, decisions saved | gauntlet report, memory |
| 1 | The scan is the hero | default hero URL → the scan (desktop) and a decimated mobile bake; rivals/partners/crowd stay on the roster; splash + Closet preview follow | karate/dunk/skate/tennis frames desktop + mobile tier, `?hero=` removed from the path |
| 2 | Animations on the scan | every clip family plays on the scan: idle/run/jump, dunk set, karate set, board set, swing/throw set — a clip-coverage probe renders a contact sheet; shoulder/hip weights fixed where a clip tears | contact sheet, 0 MISSING CLIP |
| 3 | Arms | diagnose the NPC/rival arm pose (idle clip vs rest pose vs weights), fix at the source; the scan's arms checked at rest, run, guard and overhead | before/after frames per body |
| 4 | Per-mode visual audit | all 14 modes + wide shots; one line per mode: sky, floor, dressing, actors, HUD clutter | `docs/LOOK-AUDIT-2026-09-05.md` |
| 5 | Fix batch A — basketball | dunk / ones / threes / three-point: floor colour under dusk, boardwalk polish, roster shooters replace capsules, crowd | frames |
| 6 | Fix batch B — combat + board | karate / karate_vs / skate / snow / surf: dressing, sky, floor, props | frames |
| 7 | Fix batch C — field + court | football / penalty / golf / derby / volleyball / tennis: dressing, sky, floor, props | frames |
| 8 | Kits | more Meshy garments skinned as kit packs (football jersey, soccer kit, tennis/volleyball shoes) with sport defaults; the scan keeps its outfit | derby/football/tennis frames |
| 9 | Mobile parity | VRAM + draw budgets per mode on the mobile tier; mobile bakes for the scan and heavy props | mtier gauntlet rows |
| 10 | Close | full gauntlet, docs, memory, tag `v0.9.0-rc.6` (local) | report |

## Log

## Pass 7 — DETAILS (owner, same evening: "add detail everywhere. 10 phase pass on just details")

Runs after Pass 6, same rules. Detail means the small things a camera catches at play distance, never new systems.

| # | Phase | Deliverable |
|---|---|---|
| 1 | Court surface | painted lines, scuffs, a key and a logo on every court; matte floors with a real albedo, not a colour |
| 2 | Ground textures | procedural grass, sand, concrete and asphalt textures (tiled, normal-mapped) for every venue floor and surround |
| 3 | Dressing density | benches, bins, cones, cups, towels, bags, water bottles, rails and fences where people would leave them; no empty apron |
| 4 | Signage | boardwalk signs, court banners, scoreboard plates, shop awnings, lamp-post flags — with real venue names |
| 5 | Sky and air | clouds, birds or gulls on the beach, dust and petal motes tuned per venue, sun shafts where the sun is low |
| 6 | Crowd and life | roster spectators on benches and stands, idle animations, a dog on the boardwalk, seagulls on the sand |
| 7 | Materials | wear on rims and poles, dirt on shoes and balls, cloth sheen on kits, sweat on skin in long sessions |
| 8 | Shadows and contact | contact shadows under every athlete and prop, ball shadow, rim shadow on the board |
| 9 | HUD and pad polish | icon glyphs on the verbs, hit sparks, score pops, a cleaner dev overlay in play |
| 10 | Close | frames per mode before/after, gauntlet, docs, `v0.9.0-rc.7` |

### Phase 0–3 log (2026-09-05, ~19:40–20:30)
- Sweep at the boundary: every dev-mode row 0/0/0 (stopped before its login/mobile tail on the owner's "go, continue").
- **Phase 1 — the scan is the hero.** `DEFAULT_HERO_URL` → `/models/elijah-meshy.glb`; mobile tier → `/models/elijah-meshy.mobile.glb`
  (54k verts, 1K, 3.5 MB, rig-scan.py `decimate` arg). The forge hero stays as `FORGE_HERO_URL` (the Closet's kit body).
  Frames: karate, dunk, skateboard, tennis desktop; karate + dunk mobile tier; logged-in ones (identity layer reports one
  mesh). `CharacterPipeline.spawnNpc`: an NPC asked to wear the hero slot with no tint takes a roster body (seeded tints),
  so the dunk rival stopped being a second owner.
- **Phase 3 — arms.** Three causes, three fixes. (a) The venue spec's placeholder actors are armless capsules and several
  modes never hid them → `mountVenue` hides them 2.5 s after mount. (b) The procedural `lamp` prop is a glowing sphere on a
  5 m pole; karate's were purple, and from the fighting camera they read as people on the rails → lantern amber. (c) The
  authored idle keyed the hands at the HERO's metres from the root, so shorter-armed roster bodies bent their elbows to reach
  → `hangFor(sk)` derives the hang from each skeleton's bind arm length (rest positions from bind matrices chained through
  parents — the live absolute matrices read mid-pose and failed the clip test). Roster rival now hangs its arms.
  Onlookers (skate rail, slope, surf, pit) are roster bodies now (`visual/Onlookers.ts`, cap 8, same API + `count`).
  Alias `idle → idle_stand`: karate enemies asked for a clip only the old hero file baked (7 MISSING CLIP → 0).
- **Batch A (basketball)**: three-point's five rivals wait along the sideline as roster bodies; the procedural court plane
  hides under a mounted map (it never did — a blue PBR plane z-fought the scan and mirrored the dome); the ones camera frames
  the rim when the foe is inside 2.2 m (the two-point fit had put the camera inside a body); the 3D sun disc is gone (a navy
  coin from threes/ones — the dome's painted sun carries it). The orange far half of the threes court is the scan's own
  painted surround (Luma look, second writer's lane). Committed 1916ccb.
- **Batch B (board + air), 21:00–21:40**: the white walls behind skate, slope, surf and big air were the harness-level
  painted backdrop (`visual/Backdrops.ts` — `mountBackdrop` by mood: dome 280 m + silhouette ring 235 m). A second dome
  inside it (a SkyDome module, three attempts) was drawn but never showed; the fix went into the existing mount instead:
  a family with a baked photo dome uses it as the dome texture (park→neon, alpine→mountains, ocean→ocean, stadium,
  dojo, venice→beach), painted sky as fallback, ring skipped when baked. Golf's spec gained its links dome. Alias
  `cheer → jump_up` (the roster crowd's cheer asked for a clip no body bakes; big air logged 6 MISSING CLIP).
  Capture hangs during this stretch were the dev server recompiling after many edits, not the modes — a shell watchdog
  now wraps every capture.
  **Root cause of the white walls (21:50)**: not clipping, not the grade alone. The backdrop dome (radius 284, centre at
  the origin) has its equator at the camera's eye line; the bakes paint their horizon at v = 0.6, so from the court the
  camera only ever saw the bright gold horizon band, which exposure + bloom pushed to cream. A red emissive proved the
  dome was on screen; detaching the grade showed the band as flat orange. Fix: `vOffset = 0.1` on the baked texture so
  the painted horizon meets the real one, and the dome dimmed to 0.82 under the grade.
  **Still open (22:05)**: with the horizon aligned and the dome at 0.55 the skate sky still measures near white under the
  grade; the venue skies read pale pastel from the same deep bakes. Suspect: the emissive sky path is gamma-lifted twice
  (StandardMaterial output + the pipeline's tone map). Parked for a measured fix (pixel samples in the log); the props +
  depth brief (inbox, 20:03) runs next on top of this work.
- **Batch B committed 1815afe (22:20)** — the emissive fix restores a sky to every non-venue mode: skate under a magenta
  dusk, surf under a sunset gradient, slope and big air under the alpine bake.
- **Props + depth (PM brief 20:03) committed ad5d7a0 (22:40)** — near / mid / far layers in every venue prop set; outbox
  note `/Users/elijahbonds/Claude/outbox/PROPS-DEPTH.md`. Batch C's field and court venues took their dressing here.
- Remaining: Phase 8 kits (more Meshy garments as packs), Phase 9 mobile parity (gauntlet mtier rows), Phase 10 close
  (gauntlet, tag `v0.9.0-rc.6`); then Pass 7 details.
- **Phase 8 (kits)**: the Meshy football jersey is the second kit pack (`public/models/kits/top_football.glb`, football's
  sport default, Closet "Gridiron Jersey"). The scan keeps its own outfit; packs dress the roster bodies and the forge hero.
- **Phase 9 (mobile parity)**: gauntlet mtier rows — dunk 93 draws, karate 104, skate 102, volleyball 88, golf 27, football
  51, dance 34, all 60 fps (football was 45 fps this morning). No fix needed.
- **Phase 10 (close)**: full gauntlet on the pass — tsc PASS, 320 tests, every dev-mode / login / mtier / mobile row 0/0/0
  (mobile dunk "NO RESULT" predates the pass); the only diffs vs the previous run are the test count and the identity
  layer reporting one mesh (the scan). Tag `v0.9.0-rc.6` (local).

## Pass 7 log
- **Phases 1–2 (court surface, ground textures), 21:55–22:20**: `visual/groundTextures.ts` — seeded, tiling procedural
  albedos (grass blade speckle, sand grain + damp streaks, concrete slab seams + aggregate, asphalt grain) as 512²
  DynamicTextures, one per kind per scene, copied per surface for its own uScale/vScale (a DynamicTexture `clone()` hands
  back an empty canvas — the first attempt turned every flat white). The Venice boardwalk flats wear them; a 3.6 m FEL
  half-court logo decal sits on the scan's centre circle. Dunk frame: 99 draws, 60 fps.
- **Owner asks 22:35 (b314d5b)**: the scanned hoop stands on the far baseline too (mirrored); the baseline aprons start
  where the scan's paint ends (26 m scan under a 28 m court — the "cut off" strip was the orthophoto showing through);
  Venice dressing thinned so the six-athlete threes mode returns under the 150-draw budget.
- **Disk full, 22:45**: the scratchpad's converted Meshy copies (~2 GB) and capture frames filled the volume; the shell
  could not open its own output file. Cleared (converted copies, frames, sweep shots) → 41 GB free. The dev server's
  build cache was written during the outage and served 404s; `.next` cleared and the server restarted clean.
- **Phase 3 (dressing density)**: `scripts/meshy/extract-prop.py` lifts one object out of a Meshy pack's fragment cloud
  (cluster.py's box) as a real-metre prop: football helmets ×2 (the 'football' cluster was a second helmet), a bat and a
  glove → `public/models/meshy/{helmet,helmet2,bat,glove}.glb`, placed at the gridiron bench and the ballpark dugout.
- **Football frame rate (23:10)**: read 44–50 fps at the end of every capture after the cache wipe. Probed: ~1M real
  triangles (the scan a third of it) — decimated the scan to 97k tris, the jersey packs to ~15k vertices, the helmets to
  a fifth; attach rebuilt around one template per pack (mesh clone sharing geometry + skeleton clone) and the runtime
  inflate skipped for packs. Still 46–50 — and 50 WITHOUT the pack. So the cost is the dev server recompiling every route
  after `.next` was cleared, not the scene; the warm gauntlet decides. The lighter assets stay (they cost nothing).
- **Warm gauntlet 22:37–23:00 (b2bc6d1)**: tsc PASS, 320 tests, every dev / login / mtier / mobile row 0/0/0 at 60 fps —
  football included, confirming the cold-server read. Diff vs previous: no change.
- **Phase 4 (signage), 23:05–23:20**: `signTexture` paints boards with real names — the VENICE BEACH COURTS gate sign on two
  posts at the south end, a FLIGHT NIGHT scoreboard plate beside the far hoop, FEL flags on four boardwalk lamp posts.
  Unlit boards (emissive black under the paint). Canvas text painted top-down onto a plane's bottom-up v read upside down
  on the first frame — `vScale = -1` on every sign texture.
- **Venice basket (owner 23:35–00:20, PM brief VENICE-BASKET)**: the "structure in front of the rim" was the Luma scan's own
  two hoop stands baked into `venice-blue-court.glb`. Finding them took a while: the map is mounted with `mapRotationY = π/2`
  (lib/map-data.ts), so the court's length runs along the file's x axis — every cut box laid along z hit mid-court side
  clutter instead. Deleting the stands opened a hole (their base shares the floor's vertices); `scripts/map/cut-scan-stands.py`
  now FLATTENS them onto the local floor (248 + 190 vertices, mesh closed, textures untouched). A texture repaint of the
  ghost paint was attempted and parked: the repainted image never reached the screen. The Meshy hoop stands on the play
  rim (dressHoop) and mirrored on the south baseline; the stores left the Venice set for the second writer's venice kit
  (far pier, three sail billboards, all ≥ 15 m).
- **Owner references (2026-09-06, 00:30–01:40)**: four Luma views of the real Venice court — both hoops on the concrete apron
  right behind each baseline. Dunk's rim sits at z −11 while the scan is mounted for the half-court rim (north baseline at
  z −2), so under dunk the venue slides the scan −9 once it mounts (`NexusVenue`, `scanShiftZ`); aprons, far hoop, centre
  decal and gate sign follow. Five Luma views of Shimogamo Jinja (the Meshy dojo's subject) — the karate mat had the baked
  `dojo` map (a pavilion at 8×) roofed over it, which is what the fighting camera always showed. Karate specs: no map,
  mats to pale raked gravel with dark lines, soft overcast daylight (`dusk` 0.7, thin fog), the back wall to stone, the
  Meshy shrine placed behind the wall the camera faces.
- **PM brief VENICE-JUICE-P0 (838ca82)**: hit-stop 70 / shake 0.12,140 / flash / rim thud on the make's flush frame, once per
  attempt, in dunk and duel; no second slow-mo. Outbox VENICE-JUICE-P0.md.
- **Pass 7 phase 5 (sky and air), 02:30**: six gulls wheel over the northern water on slow ellipses — billboards on a
  painted chevron, one observer, ~6 draws — visible as small dark chevrons from the dunk camera. Drifting cloud planes were
  tried and dropped: they read as hard white blobs against the dome (the painted dome carries the clouds).
- Sweep on 4cbe55d: every row clean; "vitest: 1 failed" was the headless timeout (fixed in 883d4cd — test timeout 180 s
  now outlasts the script's 120 s); penalty's 44 fps row was my concurrent suite run, 60 fps on recapture.
- **Pass 7 phase 2 spread (floor grain), 03:40**: a PBR detail map multiplies a tiled grain over every procedural floor the
  fenced builder paints — grass on pitches, diamonds and greens (a 9 m mottle; blades mipmap away, and mower stripes read as
  a checkerboard), sand on the beach court, asphalt on the skatepark slab, a faint concrete on hardcourt; markings stay the
  albedo. Also on the older kit's fields (golf keeps the kit green on top of the spec floor). Court, mat, stage, snow and
  water keep their paint. Found on the way: my hook's `else` bound to the loop's inner `if`, so the grain first ran only under
  scanned maps. Frames: golf mottled turf, skate crack lines and grit, volleyball and tennis unchanged in read.
- **Penalty keeper round (found by the frames)**: THEIR kick was framed from inside a spectator, then inside the stadium's
  stand, then behind the map's baked goal — a SOLID block on the goal line with the keeper inside it. Now: the gallery bank
  stands 2 m further back, both baked goal blocks are flattened under the floor at mount (`visual/mapSurgery.ts`, a per-mode
  flatten table beside the dunk slide in `NexusVenue.ts`), and the round is shot high from behind the spot (CameraDirector
  preset `keeper`) with the keeper facing the camera in the goal mouth. 60 fps, 0/0/0. Open: the penalty rival wears the
  hero scan (should be a roster body).
