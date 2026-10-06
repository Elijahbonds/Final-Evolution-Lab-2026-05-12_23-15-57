# The Creator: make anyone (plan, 2026-10-06)

**Owner:** "Make the character creator really good to where people can make anyone if they're really good in the
builder. Like if someone wanted to they could have Spider-Man and someone else could've made their guy look like Goku
because of how he made his guy look. That way it's really all on the user."

The model is Soul Calibur's creator. Nobody picks "Spider-Man" from a list; they build him from general tools: a
skin-tight suit, a pattern layer, stickers placed anywhere, and parts placed freely on the body. So the Creator ships
**tools, never characters**. No preset, sticker, name or logo of anyone else's character ships with the game; what a
player builds with the tools is theirs.

## What exists (research, 2026-10-06; `docs/IMPROVEMENTS-2026-10-05.md` has the full list)

- The player's body is the MPFB kit body (`fel-kit-male.glb` / `fel-kit-female.glb`): MakeHuman UVs, 7 face morphs,
  6 hair meshes, separate top/shorts/shoes garments. Identity is applied by `lib/babylon/core/playerIdentity.ts`
  (`resolveIdentity` → `applyIdentity`), from `AvatarLook` (Closet) and `AthleteBuild` (Athlete Creator).
- Built but unwired: `lib/babylon/avatar/AvatarBuilder.ts` (decals, slots) and `TintMaterialPlugin.ts` (zone tint).
- Rigid, code-built accessories hang on bones (`accessories.ts`, `accessoryFit.ts`).
- Known bugs: Creator colours never reach a mode; bought accessories never render; eye/mouth/nose and most brows do
  nothing in 3D; Hijab shows bald; female bodies get male skin maps; tinted materials are re-cloned on every edit.
- **Storage:** `AvatarLook.face` is `Json`. The Creator document lives inside it (`face.creator`, slots in
  `face.creatorSlots`), so **no database migration**. Sanitised server-side, size-capped.

## The four tools that make "anyone" possible

1. **Parts, placed freely** (no art needed). A library of procedural shapes built in code (spike, cone, horn, blade,
   plate, disc, ring, sphere, capsule, box, visor, lens, fin, wing, strap, cape strip, shoulder pad, belt, mask shell,
   …). Each is placed on any bone with position, rotation, scale and squash, its own colour and finish (matte, gloss,
   metal, glow), mirrored left/right with one toggle. Spiked hair is ten spikes on `Head`; armour is plates on the
   chest and arms; a visor is a lens on the face. Parts are cosmetic: never pickable, never collide, never change a
   hitbox.
2. **Paint layers** (no art needed). A layer stack painted onto the body and garments. Layers include:
   - solid fills per body region (head, face, torso front/back, arms, hands, legs, feet), found from the skin
     weights, not hand-drawn;
   - procedural patterns: web/radial lines, stripes, chevrons, gradients, camo, dots, scales, checks, carbon, lines;
   - stamps from a generic shape library: circle, star, bolt, triangle, eye shapes, flame, wing, tribal curves, text;
     each with position, rotation, scale and colour.

   A **suit mode** hides the garments and paints the whole body, so a skin-tight suit, a full-head mask and an
   emblem on the chest are all the same tool.
3. **Colour everywhere.** A full HSV/hex picker with recent colours and saved palettes, on every part, layer, garment
   and hair; two-tone hair through paint.
4. **Shape.** The 7 face morphs today, read from a data-driven list so new ones appear without code; cosmetic body
   proportions (legs, torso, shoulders, neck, head, hands/feet) through counter-scaled bones that do not compound
   down the chain; arms stay at bind length (REACH-FREEZE) and ranked and fixed-frame modes keep 1.0
   (`playFrame.ts`).

Around them: undo/redo, randomise with locks, a real preview stage (face/bust/full cameras, lighting rigs, poses,
turntable), up to 5 saved characters, and **share codes** (a short versioned code anyone can paste to load a look,
sanitised on import).

## Phases (lane `lane/creator`, one PR, owner merges)

| Phase | Delivers |
|---|---|
| 1. Foundation | The six known bugs fixed. `CreatorDoc` v1: a versioned, sanitised, size-capped document (parts, paint layers, colours, shape) stored in `AvatarLook.face.creator`, read by `resolveIdentity` and applied in `applyIdentity`. A tinted-material cache. Undo/redo and randomise. Share-code encode/decode. |
| 2. Parts | The procedural part library, bone placement with transforms and mirroring, rendered in every mode via the identity layer, merged per material for draw calls, with a budget (64 parts). The editor's Parts tab. |
| 3. Paint | Region masks from skin weights, the pattern generators, stamps and text, the layer stack composited into a canvas texture over skin and garments, suit mode. The editor's Paint tab. Tier-aware texture size. |
| 4. Shape, stage, slots | Counter-scaled proportion sliders, the data-driven face morph list, the preview stage, 5 character slots, the share-code UI. One editor: the Closet's appearance tabs become the Creator (Body, Face, Hair, Parts, Paint, Colours, Share). |
| 5. New art (owner's Mac) | The asset spec and Blender/MPFB bake scripts for 40–60 face morphs, body-shape morphs and modular layered garments. Not runnable in the cloud (no Blender); the code from phases 1–4 picks them up by name. |

## Rules for every phase

- Cosmetic only: no part, paint or slider changes a hitbox, reach or a gameplay number.
- Performance: parts merged per material, one paint texture per body (1024 on phones, 2048 on desktop), every
  material cached by its inputs and disposed with the body. Measure draw calls and memory before and after.
- Privacy: the share code holds the look only, never a name, email or scan data. Face-scan data stays where it is.
- Safety: text stamps run through the same name sanitiser the jersey plate uses.
- IP: ship tools and generic shapes only.
