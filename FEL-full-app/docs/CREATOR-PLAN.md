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
turntable), up to 5 saved characters (**5 slots max, owner, 2026-10-06**), and **share codes** (a short versioned code anyone can paste to load a look,
sanitised on import).

## The Studio: the builder itself has to be dope (owner, 2026-10-06: "make the builder dope")

The tools above are what makes "anyone" possible. The Studio is what makes people *want* to spend an hour in it. Every
phase builds toward this, not toward a settings page with sliders.

- **Full-screen stage.** The body stands centre stage under studio light (key, rim, a coloured back light), on a
  turntable you can spin with a drag, a stick or a swipe. Smooth camera moves between full body, bust and a close face
  view whenever a tab or a part needs them. A dark, clean frame with the game's own type (Chakra Petch) and colours.
- **Direct manipulation.**
  - Tap the body to select a region.
  - Drag a part or sticker straight onto the body: stickers ride the surface under the pointer, parts snap to the
    nearest bone.
  - On-model handles move, rotate and scale.
  - One switch mirrors left and right, both for parts and for symmetric painting.
  - Sliders stay as the precise fallback, with typed values.
- **Instant.** Every edit shows on the next frame (only what changed is rebuilt; paint redraws only its layer). No
  apply button, no loading spinner between choices.
- **Fearless.** Unlimited undo/redo (Ctrl/Cmd+Z, a pad button, a swipe), a history you can scroll back through, a
  before/after toggle, randomise with locks per section, and duplicate-to-slot before a big change.
- **Pose it.** Preview the look in poses from the modes (a dunk hang, a fight stance, a board grab, a sprint start,
  a victory) and under each venue's light, so it reads right in the game it will be played in.
- **Photo mode and sharing.**
  - A posed shot with a backdrop and frame, saved as an image card that carries the look's share code.
  - Paste a code to load someone's look as a new slot, and start your own build from it.
- **Every input.** Mouse and keyboard, touch (pinch to zoom, two-finger orbit), and a gamepad, so the couch player can
  build on the TV.
- **Feel.** Soft UI sounds and haptics on snaps and selections, 60 fps on a phone in the editor (budgets below),
  and a 30-second first-run walkthrough (place a part, paint a layer, save) that the player can skip.

## Phases (lane `lane/creator`, one PR, owner merges)

| Phase | Delivers |
|---|---|
| 1. Foundation | The six known bugs fixed. `CreatorDoc` v1: a versioned, sanitised, size-capped document (parts, paint layers, colours, shape) stored in `AvatarLook.face.creator`, read by `resolveIdentity` and applied in `applyIdentity`. A tinted-material cache. Undo/redo and randomise. Share-code encode/decode. |
| 2. Parts | The procedural part library, bone placement with transforms and mirroring, rendered in every mode via the identity layer, merged per material for draw calls, with a budget (64 parts). The editor's Parts tab. |
| 3. Paint | Region masks from skin weights, the pattern generators, stamps and text, the layer stack composited into a canvas texture over skin and garments, suit mode. The editor's Paint tab. Tier-aware texture size. |
| 4a. Slots and the make-anyone tools | **Done (2026-10-06).** A slot is a whole character (`CreatorSlotV2`: body, face, sliders, height/build, worn items, doc); `face.activeSlot` picks the one every mode spawns (`lib/creator/look/slots.ts` `activeLook`, read by `resolveIdentity`). The Closet's slot bar (select, Play as, new, duplicate, rename, delete with a confirm, paste a code as a new slot, copy a code) and a "Play as …" switcher on the game start screen. Share code v2 carries the whole slot, deflated. Procedural eyes (iris colour/size, pupil round/slit/none, sclera, glow, hide). Hide and cut-out (eyes, ears, head, hair; an `ears` paint region). Any colour for skin, hair and eyes, with a clean far-from-human skin. Ten archetype fixtures (test-only) with a render check and the cosmetic-only invariant. |
| 4b. Shape v2 and presentation scale | **Done (2026-10-06)** (`lib/creator/look/shape.ts`, `lib/babylon/creator/shape/**`, the Closet's Shape tab). Reach-safe proportions in every mode, ranked included: the head is the Head bone's own scale (a leaf), the neck moves only the Head joint, and hands and feet are a MESH scale about the wrist / the sole (not a bone scale: the hand bone carries the ball, a staff and the bat). Legs, torso and shoulders lengthen joint offsets inside the play clamp (`COSMETIC_CLAMP`) and are exactly 1.0 in ranked / standard-frame modes; the skeleton is lifted so longer legs stand on the floor. Per-segment bulk (head, neck, chest, belly, upper arms, forearms, thighs, calves) as a procedural inflate on the body and every worn garment, summed with the hand / foot scale into ONE morph target per mesh (the kit body: 7 face + 1 = the WebGL1 cap of 8). The Studio size (`CreatorSlotV2.presentation`, 0.6–1.35) is a slot field only a Studio / photo scene reads. The data-driven face morph list moves to 4c. |
| 4c. More part and paint tools | **Done (2026-10-06)**. The face sliders are DATA-DRIVEN: built from the morph targets the loaded body carries (`faceMorphs.morphNamesOf`, labels in `lib/creator/look/faceMorphList.ts`), every sanitiser keeps any name the morph rule allows (never `fel*`, a picture key or an Object built-in; ≤ 64), and the identity layer drives each target by name — phase 5's morphs appear without code; saved faces sanitise unchanged. Ten new generic shapes (bolt, skirt, helmet, hood, ear, tail segment, beard shell, boot and glove shells, hair strand). Two-tone parts: a second colour as a split or a band along a shape axis, cut crisply into the geometry and cached by its inputs (`parts/twoTone.ts`), no extra draw or material. A `glow` paint blend lighting the material's emissive channel, only while a layer glows (desktop 1/2 size, phone 1/4 size and ≤ 3 glowing layers). Player-drawn stamps: a 128² draw pad, stored as compact run-length text (`lib/creator/look/marks.ts`, ≤ 2 per doc, ≤ 1 536 runs — the size cap and the "drawings, not photos" line), drawn like any stamp via a distance field, in share codes. Bendable parts: a cape strip, strand or tail segment with `swing` > 0 is skinned to its own 4-link chain that rides its bone with a fixed-step spring (`parts/swing.ts`: one skeleton per body, one mesh per finish, 30 Hz and 6 chains on a phone, no per-frame allocation, never pickable). Parts can `follow` the bulk of their segment. Doc caps raised with the worst case (36k doc, 240k face, 50k code). The archetypes use all of it. |
| 4d. The Studio | **Done (2026-10-06)** (`lib/creator/look/studio/**`, `lib/babylon/creator/studio/**`, `components/closet/studio/**`; the Closet IS the Studio — one editor, its tabs unchanged). A full-screen stage round the same preview: warm key, cool rim, a coloured back light and a low fill (four lights), the repo's procedural environment map (`scene/EnvironmentIBL`, from a mood: no art), a 2-mesh plinth, a CSS dark frame and glow behind a transparent canvas; full / bust / face shots in body heights that follow the tab or the selection and turn the turntable to show a back or a side; drag, fling, stick to spin. Direct manipulation on the real body through a CPU-skinned ray (the kit is quantised and skinned; parts are never pickable): tap a region (tap again widens it), tap a part, drag the selected part — it snaps to the bone that owns the skin under the pointer and renders where it was dropped (≤ 4 mm, posed or not) — drag a sticker over the surface (the compositor's frame inverted, ≤ 2 mm), DOM knobs to move / rotate (about the line of sight) / scale, a Mirror switch; sliders stay. Fearless: Ctrl/Cmd+Z, Shift+Z, pad X / Y, a history strip that jumps to any step, Before/After (as opened or last saved), and after a big change an offer to keep the old look as a new slot (5-slot cap). Poses from the modes (dunk hang, fight stance, board grab, sprint start, victory) and every venue's light, read-only. Photo mode: a posed shot on a backdrop in a frame with the share code PRINTED WHOLE on the card, a local download only (nothing uploaded, for anyone); the shot stamps `felPresentation` 'photo'; the stage's Code button opens the slot bar's paste. Mouse, touch (pinch, two-finger orbit), keys and a gamepad (through `lib/input/profiles`). SoundKit ticks and haptics on selections and snaps; a skippable ~30 s first-run walkthrough remembered per device. Render on demand (holds for camera / turntable / pose / paint / drag; idle frames held), the scene stamps its tier (a phone paints at 1024², not 2048²), `?perf`. Measured on the ten archetypes: +2 draws (the plinth), +2 lights, +0.5 MiB environment map; a phone's paint 21.3 → 5.3 MiB GPU. `/dev/studio` (dev-only) to look at it; screenshotted at phone portrait and 1080p (SwiftShader), a GPU and a real phone are still to see. |
| 4e. Clothing builder | **Done (2026-10-06)** (`lib/creator/look/clothes.ts`, `lib/babylon/creator/clothes/**`, the Studio's Clothing tab `components/closet/clothes-tab.tsx`, `scripts/avatar/mpfb/fit-outfit.py`). Owner: "You should be able to change their clothing too." CODE-BUILT CLOTHES from the body itself, no art: tops (tank, tee, long sleeve, hoodie, jacket, high neck) with sleeve (none, cap, short, elbow, ¾, long, knuckles), hem (crop, waist, hip, thigh coat, knee coat), neckline (crew, scoop, V, high, collar), hood (none, down, up), an open front; bottoms (shorts, capris, pants, leggings, skirt) with leg length, rise, waistband, flare; gloves (full, fingerless; wrist or gauntlet cuff); footwear (shoes, boots: low, ankle, mid-calf, knee); fit; a second colour (trim, sleeves, half, yoke, side stripe, sole). Each piece is the kit body's own triangles in its region (heights and the arm axis measured off the MESH: the female kit's skeleton is not where her mesh is), clipped on the cut, offset out by the fit, skinned with the body's own weights, so it moves with the body in every animation; a skirt or a long coat is a tube shrink-wrapped round the body's convex cross-section. Layers are the doc's order (≤ 6: three tops, two bottoms, gloves, footwear), each at least 6 mm out from the one under it. All pieces are ONE mesh, ONE material (vertex colours) per body on the body's own skeleton, cached by inputs, tier-aware; the 4b shape morph shapes it (its own one target); paint on the garments reaches it. The skin deep inside a piece is not drawn (the body mask). A built top / bottom / footwear replaces the kit garment in that slot (applyKit is told; a late kit pack stays hidden); an empty slot keeps the Closet pick, else the sport's default; bought items stay bought and show again when the piece comes off. Measured on both kits: no skin through the cloth in covered regions at rest or in four clips' extreme poses (tubes clip in deep crouches: logged); ≤ +1 draw per body on the ten archetypes (−3 where it replaces the kit). The Mac pipeline fits a MODELLED garment (an MPFB asset or any .glb/.fbx/.obj/.blend) into a kit pack — untested, the owner's checklist is in `docs/BRIEF-WARDROBE.md`. |
| 5. New art (owner's Mac) | The asset spec and Blender/MPFB bake scripts for 40–60 face morphs, body-shape morphs and modular layered garments. Not runnable in the cloud (no Blender); the code from phases 1–4 picks them up by name. |

## Owner decisions (2026-10-06)

- **5 slots max.** "5 max slots." (`MAX_SLOTS = 5`; the research suggested 10.)
- **Teens: every mode, device only.** An under-18 (or unknown-age) player's look stays on the device and is never
  uploaded; it now applies in every mode through `resolveIdentity` (`TEEN_DEVICE_LOOK_EVERYWHERE = true` in
  `lib/creator/look/slots.ts`), not just racing.
- **Giant and tiny builds: Studio and photo only.** Presentation scale beyond the play clamp (`playFrame.COSMETIC_CLAMP`)
  shows only in the Studio and photo mode (phase 4b). Every mode keeps the play clamp, and ranked / standard-frame modes
  keep 1.0. Phase 4b built it as a slot field (`presentation`) that `identityFrom` never carries, read only from a Studio /
  photo scene's own metadata (`lib/babylon/creator/shape/presentation.ts`); a mode or ranked scene always answers 1.

- **Clothing (2026-10-06): "You should be able to change their clothing too."** Code-built clothes now (tops, hoodies,
  jackets, tanks with sleeve length; pants, shorts, leggings, skirts with leg length; collars, hoods, gloves, boots,
  layers, any colour and paint) **plus** Mac scripts for real modelled outfits. **Cost:** every code-built piece, colour
  and paint is free; the coin store keeps selling its special items (today's tops and shoes, future modelled outfits).
  **Where:** every mode, like the Closet's picks; a sport's uniform only fills a slot the player left empty. Cosmetic
  only, never a hitbox. Ship tools, never a named character's outfit, logo or preset (phase 4e).

## Rules for every phase

- Cosmetic only: no part, paint or slider changes a hitbox, reach or a gameplay number.
- Performance: parts merged per material, one paint texture per body (1024 on phones, 2048 on desktop), every
  material cached by its inputs and disposed with the body. Measure draw calls and memory before and after.
- Privacy: the share code holds the look only, never a name, email or scan data. Face-scan data stays where it is.
- Safety: text stamps run through the same name sanitiser the jersey plate uses.
- IP: ship tools and generic shapes only.
