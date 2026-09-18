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
