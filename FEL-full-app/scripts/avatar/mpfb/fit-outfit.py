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
# --no-align, --keep-uv-scale, --sided (shorts: each leg keeps its own leg's bones; the middle takes both evenly). Output lines start FELFIT.

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

def world_bbox(o, evaluated=False):
    # evaluated: the mesh as SHAPED (lane/kit-mac-jobs, 2026-11-18): an MPFB human's sex and build are shape keys, and its raw
    # vertices are the androgynous base mesh (1.695 m for both sexes) — reading them mapped every --mhclo garment wrongly
    if evaluated:
        ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        vs = [o.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    else: vs = [o.matrix_world @ v.co for v in o.data.vertices]
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
    human_box = world_bbox(human, evaluated=True)   # the MPFB body it was fitted to (checked against the kit body below)
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
    for o in meshes:
        o.parent = None
        # lane/kit-mac-jobs (first run, Blender 5.0.1): the kit GLB's two shorts share one mesh, and transform_apply refuses
        # a multi-user mesh ("Cannot apply to a multi user"). The garment takes its own copy.
        if o.data.users > 1: o.data = o.data.copy()
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
# --sided (lane/kit-mac-jobs, 2026-11-18; SHORTS-BUILD-STEPS §3 "the gusset takes both thighs' weights evenly"): on a garment
# whose legs nearly touch (the kit thighs are 1-7 mm apart), the nearest-face transfer gave part of each leg's inner wall to the
# OTHER thigh, and every stride tore it (one-piece short, headless: 92 -> 808 torn edges over 10 poses). With --sided a vertex
# off the middle line keeps only its own side's leg bones (+X is the left leg), and a vertex ON the middle (|x| <= 0.5 mm: the
# gusset, the centre seams) takes the left and right legs' weights evenly (mirrored and averaged), fading to its own side over
# --gusset-fade-x (3 cm) either side of the centre seams and over --gusset-fade-down (5 mm) below the gusset (a longer fade blended the legs' inner walls with the other leg: more tears).
if has('--sided'):
    gname = {vg.index: vg.name for vg in garment.vertex_groups}; gidx = {vg.name: vg for vg in garment.vertex_groups}
    LEG = ('UpLeg', 'Leg', 'Foot', 'ToeBase')
    def side_of(n):
        b = n.split(':')[-1]
        if not b.endswith(LEG): return 0
        return 1 if b.startswith('Left') else -1 if b.startswith('Right') else 0
    def mirror(n): return n.replace('Left', '\0').replace('Right', 'Left').replace('\0', 'Right')
    mw = garment.matrix_world; sided = centred = 0
    # the gusset: the lowest vertex ON the middle line. Its even weighting fades out over 3 cm to the sides and 5 cm down / 3 cm
    # up (a one-step change from even to one thigh tore the crotch's 1 cm edges in every stride, headless)
    mids = [(mw @ v.co).z for v in garment.data.vertices if abs((mw @ v.co).x) <= 0.0005]
    zg = min(mids) if mids else None
    FADE_X = float(flag('--gusset-fade-x', '0.03')); FADE_DOWN = float(flag('--gusset-fade-down', '0.005'))
    for v in garment.data.vertices:
        p = mw @ v.co; x = p.x
        w = {gname[g.group]: g.weight for g in v.groups if g.weight > 0}
        sgn = 1 if x > 0 else -1
        own = w if abs(x) <= 0.0005 else {n: val for n, val in w.items() if side_of(n) != -sgn}
        if len(own) != len(w): sided += 1
        if not own: own = {('LeftUpLeg' if sgn > 0 else 'RightUpLeg') if 'LeftUpLeg' in gidx else ('mixamorig:LeftUpLeg' if sgn > 0 else 'mixamorig:RightUpLeg'): 1.0}
        t = 0.0
        # the whole centre seam, front and back, up to the waist (on the female body the cloth bridging the gluteal cleft tore: its
        # weights jumped from one buttock to the other within 1 cm), and below the gusset fading out over FADE_DOWN
        if zg is not None and p.z >= zg - FADE_DOWN: t = max(0.0, 1 - abs(x) / FADE_X) * (1 - max(0.0, (zg - p.z) / FADE_DOWN))
        if abs(x) <= 0.0005: t = 1.0
        out = {n: val * (1 - t) for n, val in own.items()}
        if t > 0:
            centred += 1
            for n, val in w.items():   # the even share: each leg bone's weight split between it and its mirror
                if side_of(n): out[n] = out.get(n, 0) + t * val / 2; out[mirror(n)] = out.get(mirror(n), 0) + t * val / 2
                else: out[n] = out.get(n, 0) + t * val
        tot = sum(out.values()) or 1
        for g in list(v.groups): gidx[gname[g.group]].remove([v.index])
        for n, val in out.items():
            if n not in gidx: gidx[n] = garment.vertex_groups.new(name=n); gname[gidx[n].index] = n
            gidx[n].add([v.index], val / tot, 'REPLACE')
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    print(f'FELFIT --sided: {sided} verts lost the other leg\'s weights, {centred} near the centre seams share both legs (even on the middle line, fading over {FADE_X * 100:.0f} cm)')
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
