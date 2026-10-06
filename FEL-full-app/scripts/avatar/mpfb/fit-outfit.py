# fit-outfit.py — a MODELLED garment onto the FEL kit body, weighted and exported as a kit pack the game already loads
# (CREATOR-PLAN phase 4e, 2026-10-06; owner: "code-built clothes now, plus Mac scripts").
#
# UNTESTED: written in the cloud, where there is no Blender. It follows dress-kit.py (the kit's own MPFB2 body and
# fitted garments) and scripts/meshy/fit-garment.py (the Meshy jersey packs that ship today), and every Blender call in
# it is one those scripts already make — but nobody has run THIS file. Run it on the Mac, read its FELFIT lines, and look
# at the result in /dev/rig before it goes in the catalogue (docs/BRIEF-WARDROBE.md, "Modelled outfits": the checklist).
#
# WHAT IT MAKES. One GLB with exactly the game's 22-bone armature (taken from the kit GLB itself, so the bone names and
# the bind pose are the body's) and ONE skinned mesh named `Kit_<slot>_<itemId>` with its material named
# `<jersey|shorts|shoes>.<itemId>` — the contract lib/babylon/core/kit.ts reads: list it in KIT_PACKS and applyKit fetches
# it when a player wears the item, binds each of its bones to the body's matching node (attachKitPack), and the body
# mask hides the skin under it. The Closet's colour lands on it by the material's name prefix (playerIdentity.tintSlot).
#
# TWO WAYS IN.
#   --mhclo <asset.mhclo>   an MPFB / MakeHuman clothes asset (the best fit: MPFB fits it to the body by its vertex
#                           references, exactly as dress-kit.py fits the kit's own garments). The body is made with the
#                           kit's own macros (sex, age 0.5, muscle 0.6, weight 0.5, proportions 0.7), so it is the shape
#                           the kit GLB was exported at.
#   --mesh <file>           any modelled garment: .glb / .gltf / .fbx / .obj / .blend (a marketplace outfit, your own).
#                           It is placed on the slot's band of the body (or left where it is with --no-align, when you
#                           modelled it on the FEL body already), pushed out of the skin with a shrinkwrap (only what is
#                           INSIDE the body moves, to --ease outside it), and optionally smoothed.
# Either way the garment then takes its skin weights from the kit body (nearest face, interpolated — fit-garment.py's
# transfer), is parented to the kit armature, decimated to the slot's triangle budget, its textures capped at 1024²,
# and exported with ONLY the armature and the garment.
#
#   blender -b --python scripts/avatar/mpfb/fit-outfit.py -- --sex male --slot tops --item top_hoodie_moss \
#       --mhclo "<MPFB data>/clothes/<asset>/<asset>.mhclo" --out public/models/kits/top_hoodie_moss.glb
#   blender -b --python scripts/avatar/mpfb/fit-outfit.py -- --sex female --slot shorts --item shorts_cargo \
#       --mesh ~/Downloads/cargo_shorts.fbx --ease 0.008 --smooth 4 --out public/models/kits/shorts_cargo.glb
#
# Options: --kit <fel-kit-*.glb> (default: public/models/candidates/fel-kit-<sex>.glb), --object <name> (which mesh of a
# --mesh file; default: every mesh, joined), --ease <m> (default tops 0.008, shorts 0.012, shoes 0.004), --smooth <n>
# (corrective smoothing passes, default 2), --tris <n> (triangle budget; default tops 4000, shorts 2500, shoes 3000),
# --no-align, --keep-uv-scale. Output lines start FELFIT.

import bpy, bmesh, importlib, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def flag(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default
def has(name):
    return name in argv

SEX = flag('--sex', 'male')
SLOT = flag('--slot')
ITEM = flag('--item')
MHCLO = flag('--mhclo')
MESH = flag('--mesh')
if SLOT not in ('tops', 'shorts', 'shoes') or not ITEM or not (MHCLO or MESH) or (MHCLO and MESH):
    raise SystemExit('FELFIT usage: -- --sex male|female --slot tops|shorts|shoes --item <itemId> (--mhclo <file> | --mesh <file>) [--out <glb>]')
if not ITEM.replace('_', '').replace('-', '').isalnum():
    raise SystemExit('FELFIT --item must be letters, digits, _ and - (it becomes the mesh name Kit_<slot>_<item>)')
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
KIT = flag('--kit', os.path.join(APP, 'public', 'models', 'candidates', f'fel-kit-{SEX}.glb'))
OUT = flag('--out', os.path.join(APP, 'public', 'models', 'kits', f'{ITEM}.glb'))
EASE = float(flag('--ease', {'tops': 0.008, 'shorts': 0.012, 'shoes': 0.004}[SLOT]))
SMOOTH = int(flag('--smooth', '2'))
TRIS = int(flag('--tris', {'tops': 4000, 'shorts': 2500, 'shoes': 3000}[SLOT]))
MAT = {'tops': 'jersey', 'shorts': 'shorts', 'shoes': 'shoes'}[SLOT]
NAME = f'Kit_{SLOT}_{ITEM}'
# the body's band per slot, in metres up from the floor — measured off the kit body (lib/babylon/creator/clothes/bodyField
# landmarks: crotch 0.83 / 0.76, torso top 1.48 / 1.39, ankle 0.07 m, male / female); a modelled garment is scaled to it
BAND = {
    'male': {'tops': (0.90, 1.47), 'shorts': (0.55, 1.05), 'shoes': (0.0, 0.16)},
    'female': {'tops': (0.82, 1.38), 'shorts': (0.50, 0.97), 'shoes': (0.0, 0.16)},
}[SEX][SLOT]

def world_bbox(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))

def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)

bpy.ops.wm.read_factory_settings(use_empty=True)

# ── 1. the garment, in metres, Z up ────────────────────────────────────────────────────────────────────────────────
garment = None
if MHCLO:
    mod = 'bl_ext.user_default.mpfb'
    HumanService = importlib.import_module(mod + '.services.humanservice').HumanService
    TargetService = importlib.import_module(mod + '.services.targetservice').TargetService
    macro = TargetService.get_default_macro_info_dict()
    macro['gender'] = 0.9 if SEX == 'male' else 0.1
    macro['age'] = 0.5; macro['muscle'] = 0.6; macro['weight'] = 0.5; macro['proportions'] = 0.7   # dress-kit.py's
    human = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    garment = HumanService.add_mhclo_asset(MHCLO, human, asset_type='Clothes', material_type='MAKESKIN')
    if garment is None: raise SystemExit(f'FELFIT MPFB could not fit {MHCLO}')
    # keep the fitted shape as plain geometry: apply its modifiers (MPFB's fit, its mask), drop it off the MPFB rig
    select_only([garment])
    for m in list(garment.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e: print('FELFIT modifier', m.name, 'not applied', repr(e)[:120]); garment.modifiers.remove(m)
    garment.parent = None
    garment.vertex_groups.clear()
    human_box = world_bbox(human)   # the MPFB body it was fitted to (checked against the kit body below)
    for o in [o for o in bpy.data.objects if o is not garment]: bpy.data.objects.remove(o, do_unlink=True)
    print(f'FELFIT mhclo fitted by MPFB: {len(garment.data.vertices)} verts')
else:
    ext = os.path.splitext(MESH)[1].lower()
    before = set(bpy.data.objects)
    if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=MESH)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=MESH)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=MESH)
    elif ext == '.blend':
        with bpy.data.libraries.load(MESH) as (src, dst): dst.objects = list(src.objects)
        for o in dst.objects:
            if o: bpy.context.scene.collection.objects.link(o)
    else: raise SystemExit(f'FELFIT --mesh: {ext} is not a format this script reads (glb, gltf, fbx, obj, blend)')
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    want = flag('--object')
    if want: meshes = [o for o in meshes if o.name == want]
    if not meshes: raise SystemExit('FELFIT --mesh: no mesh found' + (f' named {want}' if want else ''))
    for o in meshes: o.parent = None
    select_only(meshes)
    for o in meshes:   # a rigged download keeps its own armature modifier: the garment is re-skinned to the FEL rig below
        for m in [m for m in o.modifiers if m.type == 'ARMATURE']: o.modifiers.remove(m)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    garment = bpy.context.view_layer.objects.active
    garment.vertex_groups.clear()
    for o in [o for o in bpy.data.objects if o is not garment]: bpy.data.objects.remove(o, do_unlink=True)
    print(f'FELFIT mesh {MESH}: {len(garment.data.vertices)} verts')

# ── 2. the kit body and its 22-bone armature, from the game's own file ─────────────────────────────────────────────
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=KIT)
kit = [o for o in bpy.data.objects if o not in before]
rig = next((o for o in kit if o.type == 'ARMATURE'), None)
body = next((o for o in kit if o.type == 'MESH' and o.name.split('.')[0] == 'Body'), None)
if not rig or not body: raise SystemExit(f'FELFIT {KIT}: no armature / Body (is it a fel-kit GLB?)')
if len(rig.data.bones) != 22: print(f'FELFIT WARNING the kit armature has {len(rig.data.bones)} bones, the game binds 22 by name')
# the kit's garments, hair and eyes are not wanted in the pack
for o in [o for o in kit if o.type == 'MESH' and o is not body]: bpy.data.objects.remove(o, do_unlink=True)
# the body in its rest shape, in world space, for fitting and weights (its face morphs at 0)
if body.data.shape_keys:
    for kb in body.data.shape_keys.key_blocks: kb.value = 0.0

# an MPFB fit is in the MPFB body's space; the kit GLB should be the same body (same macros) in the same place — if its
# box disagrees by more than a centimetre (a re-rooted or rescaled kit file), map the garment from one box to the other
if MHCLO:
    klo, khi = world_bbox(body)
    hlo, hhi = human_box
    off = max(abs(klo.z - hlo.z), abs(khi.z - hhi.z), abs((klo.x + khi.x) - (hlo.x + hhi.x)) / 2, abs((klo.y + khi.y) - (hlo.y + hhi.y)) / 2)
    print(f'FELFIT MPFB body vs kit body: boxes differ by {off * 100:.1f} cm')
    if off > 0.01:
        k = (khi.z - klo.z) / max(1e-6, hhi.z - hlo.z)
        select_only([garment])
        for v in garment.data.vertices:
            w = garment.matrix_world @ v.co
            w = Vector(((w.x - (hlo.x + hhi.x) / 2) * k + (klo.x + khi.x) / 2, (w.y - (hlo.y + hhi.y) / 2) * k + (klo.y + khi.y) / 2, (w.z - hlo.z) * k + klo.z))
            v.co = garment.matrix_world.inverted() @ w
        print(f'FELFIT mapped the fitted garment onto the kit body (scale {k:.4f})')

# ── 3. place a free-standing model on the slot's band (an MPFB fit is already in place) ─────────────────────────────
if MESH and not has('--no-align'):
    lo, hi = world_bbox(garment)
    bv = [body.matrix_world @ v.co for v in body.data.vertices]
    band = [v for v in bv if BAND[0] <= v.z <= BAND[1] and abs(v.x) < 0.30]   # the torso / hips / feet: never the T-pose arms
    if not band: raise SystemExit('FELFIT the body has no vertices in the slot band — wrong --sex or a non-kit --kit?')
    blo = Vector((min(v.x for v in band), min(v.y for v in band), min(v.z for v in band)))
    bhi = Vector((max(v.x for v in band), max(v.y for v in band), max(v.z for v in band)))
    # height to the band; a top keeps its own width:height (its sleeves reach past the torso band), the rest fit the body
    sh = (BAND[1] - BAND[0]) / max(1e-6, hi.z - lo.z)
    if SLOT == 'shoes': s = (sh, sh, sh)
    elif SLOT == 'tops': s = (sh, (bhi.y - blo.y) * 1.2 / max(1e-6, hi.y - lo.y), sh)
    else: s = ((bhi.x - blo.x) * 1.12 / max(1e-6, hi.x - lo.x), (bhi.y - blo.y) * 1.18 / max(1e-6, hi.y - lo.y), sh)
    select_only([garment])
    garment.scale = s; bpy.ops.object.transform_apply(scale=True)
    lo, hi = world_bbox(garment)
    garment.location = ((blo.x + bhi.x) / 2 - (lo.x + hi.x) / 2, (blo.y + bhi.y) / 2 - (lo.y + hi.y) / 2, BAND[1] - hi.z)
    bpy.ops.object.transform_apply(location=True)
    print(f'FELFIT aligned to the {SLOT} band {BAND}: scale {tuple(round(v, 3) for v in s)}')

# ── 4. out of the skin: only what is inside the body moves, to EASE outside it; then a light smooth ───────────────────
select_only([garment])
sw = garment.modifiers.new('fel_out', 'SHRINKWRAP')
sw.target = body; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.wrap_mode = 'OUTSIDE'; sw.offset = EASE
bpy.ops.object.modifier_apply(modifier='fel_out')
if SMOOTH > 0:
    cs = garment.modifiers.new('fel_smooth', 'CORRECTIVE_SMOOTH')
    cs.iterations = SMOOTH; cs.smooth_type = 'SIMPLE'; cs.use_only_smooth = True
    bpy.ops.object.modifier_apply(modifier='fel_smooth')
    # smoothing can pull a little back in: a second, gentler push out
    sw = garment.modifiers.new('fel_out2', 'SHRINKWRAP')
    sw.target = body; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.wrap_mode = 'OUTSIDE'; sw.offset = EASE * 0.6
    bpy.ops.object.modifier_apply(modifier='fel_out2')

# ── 5. the budget: decimate to the slot's triangle count ─────────────────────────────────────────────────────────────
dg = bpy.context.evaluated_depsgraph_get(); me = garment.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris = len(me.loop_triangles); garment.evaluated_get(dg).to_mesh_clear()
if tris > TRIS:
    dm = garment.modifiers.new('fel_decimate', 'DECIMATE'); dm.ratio = TRIS / tris; dm.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='fel_decimate')
    print(f'FELFIT decimated {tris} → ~{TRIS} triangles')

# ── 6. skin weights from the body (nearest face, interpolated), then the armature ────────────────────────────────────
garment.parent = rig
garment.matrix_parent_inverse = rig.matrix_world.inverted()
for vg in body.vertex_groups: garment.vertex_groups.new(name=vg.name)
dt = garment.modifiers.new('fel_weights', 'DATA_TRANSFER')
dt.object = body; dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
select_only([garment]); bpy.ops.object.modifier_apply(modifier='fel_weights')
# at most 4 influences per vertex, normalised (what the game's skinning reads)
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
empty = [vg.name for vg in garment.vertex_groups if not any(vg.index in [g.group for g in v.groups] for v in garment.data.vertices)]
for n in empty: garment.vertex_groups.remove(garment.vertex_groups[n])
arm = garment.modifiers.new('Armature', 'ARMATURE'); arm.object = rig

# ── 7. the contract's names; textures capped ────────────────────────────────────────────────────────────────────────
garment.name = NAME; garment.data.name = NAME
if not garment.data.materials:
    m = bpy.data.materials.new(f'{MAT}.{ITEM}'); garment.data.materials.append(m)
for i, m in enumerate(garment.data.materials):
    if m: m.name = f'{MAT}.{ITEM}' if i == 0 else f'{MAT}.{ITEM}.{i}'
for img in bpy.data.images:
    if img.size[0] > 1024 or img.size[1] > 1024: img.scale(min(1024, img.size[0]), min(1024, img.size[1]))
uses = sum(1 for v in garment.data.vertices if v.groups)
print(f'FELFIT {NAME}: {len(garment.data.vertices)} verts, weighted {uses}, groups {len(garment.vertex_groups)}, materials {[m.name for m in garment.data.materials if m]}')

# ── 8. export: the armature and the garment, nothing else ───────────────────────────────────────────────────────────
bpy.data.objects.remove(body, do_unlink=True)
select_only([garment, rig], rig)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, use_selection=True, export_skins=True,
                          export_animations=False, export_morph=False, export_image_format='AUTO', export_texcoords=True, export_normals=True)
print(f'FELFIT wrote {OUT} bytes={os.path.getsize(OUT)} bones={len(rig.data.bones)}')
print(f"FELFIT next: kit.ts KIT_PACKS['{ITEM}'] = '/models/kits/{ITEM}.glb'; wearable-catalog.ts WEARABLES row for '{ITEM}' (slot {SLOT}); look at it in /dev/rig.")
