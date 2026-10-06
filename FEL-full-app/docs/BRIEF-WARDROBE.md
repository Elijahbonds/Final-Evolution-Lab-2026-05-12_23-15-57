# Wardrobe brief — what the kit body actually needs modelling

Owner, 2026-09-16: *"character appearance improvement pass for myself and for all characters, opponents, NPCs — how
can I make the models look better, clothes, shoes, accessories."* Kit body, everyone. Look: realistic material **and**
bold graphics. Rivals get a named signature; NPCs get variety.

This is the half that **cannot be written in code**. Everything in it needs the MPFB/Blender pipeline
(`scripts/avatar/mpfb/dress-kit.py`), which fits a garment to the body and ships it as a skinned mesh named
`Kit_<slot>_<itemId>` inside the hero GLB.

## The problem, stated plainly

The entire wardrobe is:

| slot | items | note |
| --- | --- | --- |
| tops | `top_lab`, `top_bonds` (+ `top_baseball`, `top_football` as kit packs) | a crude tee and a keyhole tank |
| shorts | `shorts_court`, `shorts_glitch` | **the same source garment sharing one material** — so really one |
| shoes | `shoes_evo`, `shoes_flight` | a hi-top and a low trainer |

Three slots, five real items, for every character in all 29 modes. Everybody is the same person in a different colour,
and no amount of material or shader work changes that. Measured on the dunk court: a wall of five NPCs is five bodies
in the same tank and the same shorts.

## What to model, in order of what it buys

1. **A second short.** `shorts_glitch` shares `shorts_court`'s material and mesh, so the slot has one item in it. A
   longer, baggier basketball short is the single highest-value garment in this list — it changes the silhouette of
   every character in the game, which no top can do from the back.
2. **A real basketball jersey** — sleeveless, wide armhole, a hem that falls over the shorts rather than stopping at
   the waistband. The current `top_bonds` tank reads as a vest. This is the garment the sport is played in.
3. **A hoodie and a long-sleeve tee.** Every character is currently bare-armed in every mode including the snow ones.
4. **Track pants / joggers.** Same argument as the short: the leg is half the body and it has one option.
5. **A second shoe silhouette** — a low skate shoe, flat-soled, visibly different from the two basketball shoes. The
   board modes borrow a basketball trainer today.

## What the code already does, so it is not modelled twice

- **Fabric** (`lib/babylon/core/fabric.ts`): a generated weave normal per fabric type — jersey knit, short weave, shoe
  canvas, sock rib — with per-fabric roughness and sheen. Garments do not need baked normal maps.
- **Shoe two-tone and the hi-top fold** (`lib/babylon/core/garmentFixes.ts`): the sole is split off to a light material
  at runtime and a boot's shaft is folded to a hi-top collar in bind space. **Do not bake a sole colour** into a shoe's
  texture; do keep the sole geometry a distinct band at the bottom of the mesh.
- **Tinting** (`lib/babylon/core/playerIdentity.ts`): materials are matched by name prefix
  (`jersey` / `shorts` / `shoes` / `skin` / `hair`). **A new garment's material must be named `<slot>.<itemId>`** or
  the Closet's colour will not land on it.
- **Per-sport defaults** (`lib/babylon/core/sportKitDefaults.ts`): every new item needs a row deciding which sports
  wear it, or it is a garment nobody is ever seen in.

## Bold graphics — the layer that does not exist yet

The owner asked for realistic material **and** bold graphics. The material half is done in code; the graphics half is
not, and it has two possible homes:

- **Baked into the garment's texture** (numbers, team marks, stripes) — simplest, but it fixes one number per item.
- **A decal/second UV set on the jersey** — a number that can be the player's own. If the jerseys are modelled with a
  clean flat chest/back area and a second UV channel laid out for it, the number can be generated in code exactly the
  way the floor and fabric textures already are, and every character can wear their own.

**Recommendation: the second UV set.** It is a small amount of extra work at model time and it is the difference
between one jersey and a roster of them.

## Accessories

Headband, wristbands, shooting sleeve, leg sleeve, crew socks and a chain are **built in code**
(`lib/babylon/core/accessories.ts`) and hung on bones, so they do not need modelling. They are currently opt-in while
their rig-relative sizing is finished — see the note in `CharacterLibrary`. If any of them turns out to want real
geometry (a chain with links, a sleeve that creases), it belongs in this document instead.

## Code-built clothes and modelled outfits (CREATOR-PLAN phase 4e, 2026-10-06)

Owner, 2026-10-06: *"You should be able to change their clothing too."* — code-built clothes now, plus Mac scripts for
real modelled outfits later. Every code-built piece, colour and paint is **free**; the coin store keeps selling its
special items (today's tops, shorts and shoes, and the modelled outfits below).

**What exists now, with no art.** The Studio's Clothing tab builds tops (tank, tee, long sleeve, hoodie, jacket, high
neck), bottoms (shorts, capris, pants, leggings, skirt), gloves and footwear **from the kit body itself**
(`lib/babylon/creator/clothes`): the body's own triangles in the piece's region, offset out by the fit, skinned with the
body's own weights, all pieces merged into one mesh. A built top / bottom / footwear replaces the kit garment in that
slot; an empty slot keeps the Closet pick, else the sport's default. That covers most of the list at the top of this
brief (a second short, a hoodie, a long sleeve, joggers) as *shapes*. What it cannot do is what modelling is for: real
cloth folds, a jersey's cut and seams, a hood with depth, pockets, a sneaker's sole and laces, a garment that is not the
body's surface (a puffer, a cape that hangs). That is the Mac pipeline.

### Modelled outfits — the owner's checklist (the Mac)

`scripts/avatar/mpfb/fit-outfit.py` takes a modelled garment and makes it a **kit pack** the game already loads: one GLB
with the game's own 22-bone armature (taken from the kit GLB, so the bone names and bind pose are the body's) and one
skinned mesh `Kit_<slot>_<itemId>` with material `<jersey|shorts|shoes>.<itemId>`. **It is untested** — written where
there is no Blender, following `dress-kit.py` and `scripts/meshy/fit-garment.py`; run it, read its `FELFIT` lines, and
look before shipping.

1. **Install** (once): Blender 5.1, the MPFB2 extension (the same one `dress-kit.py` uses, from
   `~/Developer/FEL-swarm/tools/mpfb2`), and its asset packs under MPFB2's user data
   (`~/Library/Application Support/Blender/5.1/extensions/.user/user_default/mpfb/data`).
2. **Pick the garment and an item id** (letters, digits, `_`, `-`; e.g. `top_hoodie_moss`). Generic garments only —
   never a named character's outfit, logo or preset. Check the licence of a marketplace model allows a game.
3. **Fit it** (from `FEL-full-app/`), once per body:
   - an MPFB / MakeHuman clothes asset (`.mhclo`; MPFB fits it by its vertex references — the best fit):
     ```
     blender -b --python scripts/avatar/mpfb/fit-outfit.py -- --sex male --slot tops --item top_hoodie_moss \
       --mhclo "$HOME/Library/Application Support/Blender/5.1/extensions/.user/user_default/mpfb/data/clothes/<asset>/<asset>.mhclo"
     ```
   - any modelled mesh (`.glb`, `.gltf`, `.fbx`, `.obj`, `.blend`; it is placed on the slot's band, pushed out of the
     skin, lightly smoothed, decimated to the slot's budget):
     ```
     blender -b --python scripts/avatar/mpfb/fit-outfit.py -- --sex female --slot shorts --item shorts_cargo \
       --mesh ~/Downloads/cargo_shorts.fbx --ease 0.008 --smooth 4
     ```
     Add `--no-align` when the model was made on the FEL body already; `--object <name>` to take one mesh of a file;
     `--tris <n>` to change the triangle budget (tops 4000, shorts 2500, shoes 3000).
   It writes `public/models/kits/<itemId>.glb` (or `--out`). The kit body carries ONE pack per item, so make the male
   and female fits under two ids (`top_hoodie_moss_m` / `_f`) or accept the male fit on both (packs bind by bone name, the
   proportions differ a little).
4. **Look at it**: `/dev/rig?avatar=/models/candidates/fel-kit-male.glb` with the item equipped
   (`/dev/mode/dunk?body=male&tops=top_hoodie_moss`), in a run, a dunk and a crouch. Skin poking through: re-run with a
   bigger `--ease`.
5. **Add it to the game** (code, a PR):
   - `lib/babylon/core/kit.ts` → `KIT_PACKS`: `top_hoodie_moss: '/models/kits/top_hoodie_moss.glb',`
   - `lib/closet/wearable-catalog.ts` → `WEARABLES`: `{ itemId: 'top_hoodie_moss', slot: 'tops', name: 'Moss Hoodie',
     coinPrice: 600, accent: '#4A6B4A' }` — that is what puts it in the coin store (the price is the owner's call:
     `TUNE(elijah)`).
   - optional: a sport that should wear it by default → a row in `lib/babylon/core/sportKitDefaults.ts`.
   - commit the GLB with the code (it is served from `public/`). Check its size (a pack is ~0.2–1 MB; the script caps
     textures at 1024²).
6. **Test**: `npx vitest run lib/babylon/creator/clothes/macScript.test.ts lib/babylon/core/kit.test.ts lib/closet`
   (the naming contract and the catalogue), then the usual gate.

A player who wears a built top over a bought one keeps the bought one — it shows again when the built piece comes off.
