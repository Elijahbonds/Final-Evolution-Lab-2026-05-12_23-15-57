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
