# Jersey build steps — for the owner's Mac (Blender + MPFB)

Owner 2026-11-13: the new basketball and football jerseys are made **in-house, free**, from the MakeHuman garments, in Blender on
your Mac (docs/OWNER-DECISIONS.md). This page is the whole job, start to finish. It takes about an hour per jersey. You need:
Blender 5.1, the MPFB2 extension and its asset packs (the same set-up `scripts/avatar/mpfb/dress-kit.py` already uses), and this
repository checked out.

## 1. Start from the right free garment

| Jersey | Start from (MPFB clothes library, CC0) | Why |
|---|---|---|
| Basketball (`top_basketball`) | `elvs_crude_t-shirt_male` (male) / `toigo_basic_tucked_t-shirt` (female) | The kit's own tee: same fit, clean front and back UVs, already weighted to the body. The rivals' sleeveless jersey is cut from it the same way (`scripts/avatar/mpfb/style.py`, `cut_sleeves`). |
| Football (`top_football`) | `namuhekam_male_polo_shirt` | A real collar line, a looser body, short sleeves you keep. |

Do **not** start from the keyhole tank (a tiled leopard map) or from the Meshy football jersey (mirrored print, baked footballs).

## 2. Make the body and put the garment on

In Terminal, from the repository's `FEL-full-app` folder:

```bash
blender -b --python scripts/avatar/mpfb/dress-kit.py -- --sex male --out /tmp/kit-male-src.glb
```

Then open Blender with the UI (`blender`), **File → Import → glTF** `/tmp/kit-male-src.glb`, and in the MPFB panel add the garment
from step 1 to the body (**Apparel → Library → Clothes**). Save as `~/jerseys/basketball-male.blend`.

## 3. The cut (basketball)

1. Select the garment, **Edit Mode**.
2. **Sleeves off:** in the Python console run `import sys; sys.path.append('<repo>/FEL-full-app/scripts/avatar/mpfb'); import style;
   style.cut_sleeves(bpy.context.object)` — it removes everything the garment's own skin hangs on the arms.
3. **Wide armholes:** select the armhole edge loop (**Alt-click**), scale it out 15 % (**S 1.15**), then move it 3 cm down (**G Z -0.03**).
   A basketball jersey's armhole reaches the bottom of the chest.
4. **Long hem over the shorts:** select the bottom edge loop, move it 10 cm down (**G Z -0.10**). It must end below the shorts'
   waistband: the game tucks the shorts **under** the top.
5. **Neck:** select the neck loop, scale 1.1 and move 2 cm down (a scoop, not a crew neck).
6. **Smooth:** select all, **Mesh → Clean Up → Merge by Distance** (0.1 mm), then one **Smooth Vertices** (factor 0.3, 2 repeats).

**Football:** keep the sleeves. Make the body 8 % wider (**S 1.08**, X and Y only) and the shoulders 3 cm higher for the pads. Hem as in step 4.

## 4. The number and name slots (a second UV set)

The game will print each player's own number and name, so the jersey needs a place for them:

1. **Object Data → UV Maps → +** to add a second map named `decal`.
2. In **Edit Mode**, select the chest faces (a rectangle about 20 × 20 cm in the middle of the front), **U → Project from View**
   from the front view, and scale them in the UV editor to fill the **left half** of the square (`0–0.5`, `0–1`).
3. Select the back faces (25 cm wide × 35 cm tall, between the shoulder blades), project from the back view, and fill the
   **right half** (`0.5–1`, `0–1`). The name goes in the top fifth of that half, the number under it.
4. Every other face of the `decal` map goes into one tiny corner (select all the others, scale them to 0 at `0, 0`).

Keep the garment's FIRST UV map exactly as MPFB made it: the fabric, the paint and the tint use it.

## 5. Export the way the game expects

Use the repository's exporter, which does the weights, the 22 bones, the names and the texture cap for you:

```bash
blender -b --python scripts/avatar/mpfb/fit-outfit.py -- \
  --sex male --slot tops --item top_basketball --mesh ~/jerseys/basketball-male.blend --object <the garment's object name> \
  --no-align --tris 3000 --out ~/jerseys/top_basketball.glb
```

What it checks and does (read its `FELFIT` lines in the output):
- **22 bones, unprefixed** (no `mixamorig:`), the kit body's own armature and bind pose (GATE 0);
- skin weights from the body (nearest face, blended), at most 4 per vertex;
- one mesh named `Kit_tops_top_basketball`, its material named `jersey.top_basketball` (the Closet's colour lands on `jersey`);
- textures capped at 1024 × 1024 (the phone cap: no image larger);
- decimated to the triangle budget: `--tris 3000` for the basketball jersey, 4000 (the default) for the football one.

The script was written without a Blender to run it on (its header says so): if a step fails, send the FELFIT lines back with
the file and we fix the script, not the jersey.

## 6. Look at it before handing it back

```bash
npx tsx scripts/avatar/kit-fit/pack.ts ~/jerseys/top_basketball.glb ~/jerseys/top_basketball.fit.glb \
  public/models/candidates/fel-kit-male.glb public/models/candidates/fel-kit-female.glb
```

This pushes any part of the jersey that sits inside either kit body back out (the step that fixed the football jersey). Then open
`/dev/rig?avatar=/models/candidates/fel-kit-male.glb` in the dev site and put the jersey on in the Closet.

## 7. Hand the file back

Put `top_basketball.fit.glb` (and the female one if you made it) in a folder, and send it to the session (drag it into the chat,
or commit it to a branch named `art/jerseys`). Say which garment you started from. We then:
1. copy it to `public/models/kits/`, register it in `lib/babylon/core/kit.ts` (`KIT_PACKS`) and the catalogue, and make it the court
   modes' default top (`sportKitDefaults.ts`);
2. run `scripts/kit-fit-tests.ts` (the rig fingerprint, the fit) and the browser rig before/after;
3. wire the number and name onto the `decal` map.

Nothing is merged until those numbers are green.
