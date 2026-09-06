# The owner's Meshy assets — inventory and decisions (2026-09-05)

Owner: "Can we use my other hoop asset that I scanned from Meshy… use my other Meshy assets too, look at them all and
decide. No T-posing. Don't use me. If you can fix the T-pose problem and put the characters in Blender and ensure the
model doesn't T-pose then yes use it. Make sure it works."

Source: `~/Downloads/9_-_Finalize_Evolution_Lab_Game/Uploads/Meshy_AI_*_fbx*.zip` (46 zips) and four loose glbs in
`~/Downloads`. Every export is ONE mesh normalised to ~2 units with 4K textures, no skeleton, no animation.
Thumbnails of all 33 non-character assets were rendered through a scratch Babylon viewer before deciding.

## Pipeline (repeatable)
`scripts/meshy/bake-prop.py` (Blender, headless): import → real-metre scale on one axis → pivot (bottom-centre for
standing props, centre for balls) → decimate → textures resized → GLB under `public/models/meshy/`.
Runtime: `lib/babylon/visual/meshyProps.ts` — `dressHoop` (venue mount), `dressBall` (every ball sphere site),
`dressBoard` (boardCore), and the prop-set kit alias `meshy` (`public/models/props/meshy → ../meshy`). All visual only:
physics, rim constants, the ball spheres and the board box are untouched; a missing file leaves the procedural look.

## Decisions

| Asset | Decision | Where |
|---|---|---|
| **Venice beach basketball hoop** (backboard, pole, net) | **IN** — replaces the procedural hoop on every court and every location. Scaled 1.034× so the scan's ring (measured 2.95 m) meets the 3.05 m rim constant; slid so the ring centre meets the procedural rim | `dressHoop`, 10.9 MB, 73k verts |
| Basketball (high quality) | IN — dunk, ones, threes, three-point ball skin | `dressBall('basketball')` |
| Soccer ball (FIFA style) | IN — penalty | `dressBall('soccer')` |
| Tennis ball (bright) | IN — tennis (scaled to the mode's 0.14 m readability ball) | `dressBall('tennis')` |
| Venice skateboard / snowboard / surfboard | IN — the three board sports' decks | `dressBoard` via `buildRig(..., boardKind)` |
| Hoopbus, clean sedan | IN — parked behind the basketball hoop on the boardwalk side (prop set `venice-court-meshy`, basketball venues only; tennis keeps the plain set) | `venuePropSets.ts` |
| Venice Ball Shop kiosk | out — the second writer's Venice surround already carries a kiosk; the loose glb is 86 MB | — |
| Shimogamo dojo | baked (7.9 MB) but NOT placed — hidden behind the karate arena's own back wall; kept for a future dojo venue | `public/models/meshy/dojo.glb` |
| Veniceball rainbow ball | out — one basketball skin at a time; candidate for a Closet unlock | — |
| Sport asset PACKS (baseball, football, soccer, tennis, volleyball, board sports) | out for now — each is a single mesh bundling clothes, helmets, nets, shoes; using a piece means splitting loose parts in Blender, and the clothes are static shells that would need skinning to the FEL rig (rig work, owner sign-off) | — |
| Venue DIORAMAS (skatepark, tennis court, ballpark, soccer stadium, golf links, gym, stage, gymnastics gym, snowboard island, surf map, lab, blacktop court, the two Venice court scans) | out — 0.7–1.1 M-vertex miniatures whose geometry does not match the modes' play surfaces; each is a venue project (align, clip, collide), not a prop swap | — |
| **Characters** (players, NPCs, spectators, Eric Nash, the owner) | **OUT** — no armature in any export (checked in Blender), each is a posed statue with the ball fused into the hands. Rigging one means re-sculpting to a neutral pose first, which is the path that produced the T-pose failure last time. The owner is excluded by name. | — |

## Verified
- tsc clean; vitest green (`meshyProps.test.ts` ×3 added; the prop-set play-area table gained the new set).
- Frames: dunk (hoop aligned, ball skinned), ones, threes, three-point, skateboard, snowboard slalom, surf, tennis,
  penalty — `FEL-FRAME 0 | MISSING CLIP 0 | errors 0`, 60 fps. VRAM: dunk 139 → ~219 MB with the bus and sedan at 2K,
  re-baked at 1K.

## Round two (2026-09-05, evening) — store, skinned garments, the owner's scan, the boardwalk

Owner: "put the store next to the court · I approve skinning of the rigs · be proactive in troubleshooting · see if the
loader we built can accurately build me · that picture shouldn't be used as a background — recreate it as the environment".

- **Store**: `store.glb` (7 m, 1K textures) — now four shop fronts along the boardwalk plus two behind the hoop (prop set
  `venice-court-meshy`).
- **Garments skinned to the rig (kit packs)**: the sport packs split into loose fragments (700–2600 per pack), regrouped
  into objects by bbox proximity (`scratchpad cluster.py` → the jersey, helmets, bat, glove…). `scripts/meshy/fit-garment.py`
  joins a cluster, scales it per axis onto the body's slot band with ease (tops 1.16× width, 1.22× depth), copies skin
  weights from the Body (nearest face, interpolated), binds to the 22-bone rig and exports `public/models/kits/<item>.glb`.
  Runtime `kit.ts` KIT_PACKS: a sport default or Closet pick the body does not carry is fetched, its bones LINKED to the
  body's transform nodes (a straight skeleton swap collapsed the mesh — the pack's vertices live in the pack's bind space),
  and swapped into the slot. First item: `top_baseball` on derby/baseball. Verified on the batter.
- **The owner's scan** (`Elijah_Bonds` Meshy export, a T-pose statue, no skeleton): `scripts/meshy/rig-scan.py` scales it
  to height, floors and faces it like the body, copies weights from the body and binds. The FEL rig's REST pose is a T
  (arms horizontal, measured), so the T-pose scan needed no re-posing — the earlier "he's T-posing" was clips not driving
  a body, not a pose mismatch. Result `public/models/candidates/elijah-meshy.glb` plays karate and dunk through the
  `?hero=` flag: guard stance, dunk charge, jacket/shorts/slides intact, no T-pose. Frames sent to the owner.
- **Boardwalk** (`lib/babylon/nexus/veniceBoardwalk.ts`): the concept photo rebuilt in 3D for the basketball venues under
  Venice — concrete apron, park grass, a boardwalk strip with shops, tents, lamp posts and planters, palm rows, sand and
  water wrapping the north and west inside the 400 m sky sphere, a sun disc low over the northern water where the hoop
  camera looks. The baked `beach` dome is now the pure sunset-sky photo (no court in it), toned down; Venice fog is thin
  golden haze. Ground pieces are PBR (standard materials blew out under the venue sun and grade); the scan court is matte
  so it stops mirroring the dome. The second writer's Venice surround miniature still mounts under it (their lane).
