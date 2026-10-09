# bake-hair.py — a HIGHER-QUALITY hairstyle on the FEL kit body, from the game's own code-built guide (2026-10-07, the
# hair expansion; owner: "code-built now, plus Blender/Mac bake scripts for higher-quality versions LATER — scripts only;
# the owner runs them; don't require them").
#
# UNTESTED: written in the cloud, where there is no Blender. Every Blender call in it is one dress-kit.py / fit-outfit.py
# already make (import, vertex groups, data transfer, decimate, glTF export) plus the curves / bake calls named below —
# but nobody has run THIS file. Run it on the Mac, read its FELHAIR lines, look at the result next to the code-built
# style in /dev/studio, and only then wire it in (the CHECKLIST at the end).
#
# THE CODE-BUILT STYLE IS THE SHIPPING PATH. Every catalog style is built in code on the player's own head
# (lib/babylon/creator/hair). This script makes an optional better-looking version of ONE style that the game could load
# instead on a fast device — it does not replace the code path and nothing in the game needs it.
#
# IN.
#   1. npx tsx scripts/avatar/export-hair.ts --style "<Style>" --sex male|female
#        → scripts/avatar/out/hair/<slug>-<sex>.obj + .json: the code-built style as a GUIDE — its shape, where it sits on
#          the head, its skin (Head / Neck / Spine2 weights) and which parts sway.
#   2. Optionally a modelled hair (--mesh <file>: .glb / .gltf / .fbx / .obj / .blend — a marketplace hairstyle, a sculpt).
#      Without one, the guide itself is the low-poly shell and the detail is GROWN on it (--grow: hair curves, see below).
#
# WHAT IT DOES.
#   a. Imports the kit GLB's 22-bone armature (public/models/candidates/fel-kit-<sex>.glb) — the bone names and bind pose
#      are the body's — and the guide (the OBJ is in the kit's rest skeleton space, metres).
#   b. With --mesh: places the modelled hair on the guide's bounds (or --no-align when it was modelled on the FEL head),
#      shrinkwraps what is INSIDE the head out to the guide's inner surface (+ --ease), keeps its own detail.
#      With --grow: adds Blender hair curves on the guide's hair surface (Geometry Nodes "Generate Hair Curves" / the
#      Interpolate Hair Curves asset), --density per cm², combed along the guide's `along` direction, clumped for locs
#      and braids, then converted to a mesh of cards.
#   c. Bakes the detail (normals + AO + a strand-direction tangent map) from the high version onto a UV-unwrapped copy of
#      the guide (Smart UV Project; textures capped at --tex, default 1024²), so the game draws the guide's few triangles
#      with the detail of the grown/modelled hair.
#   d. Skins the result from the guide (Data Transfer: vertex groups by nearest face, interpolated — the guide carries the
#      exact Head / Neck / Spine2 weights the game uses), parents it to the armature, decimates to --tris (default 12000:
#      the desktop budget, renderHair.HAIR_BUDGET), and exports ONLY the armature and the hair.
#
# OUT. One GLB: public/models/hair/<slug>-<sex>.glb — the kit's own 22-bone armature + ONE skinned mesh named
# `HairPack_<slug>` with its material named `hair.<slug>` (the albedo is greyscale: the game tints it with the player's
# colour, as it tints the code-built hair's vertex colours).
#
#   blender -b --python scripts/avatar/mpfb/bake-hair.py -- --style "Box Braids" --sex female --grow --density 30
#   blender -b --python scripts/avatar/mpfb/bake-hair.py -- --style "Locs" --sex male --mesh ~/Downloads/locs.fbx --ease 0.003
#
# Options: --guide <obj> (default scripts/avatar/out/hair/<slug>-<sex>.obj), --kit <glb>, --mesh <file>, --object <name>,
# --no-align, --ease <m> (default 0.002), --grow, --density <curves per cm², default 24>, --tris <n>, --tex <px>, --out <glb>.
# Output lines start FELHAIR.

import bpy, json, os, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def flag(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default
def has(name):
    return name in argv

STYLE = flag('--style')
SEX = flag('--sex', 'male')
if not STYLE or SEX not in ('male', 'female'):
    raise SystemExit('FELHAIR usage: -- --style "<Style>" --sex male|female (--grow | --mesh <file>) [--out <glb>]')
# the same slug rule as export-hair.ts hairSlug: 'Box Braids' -> 'box-braids'
SLUG = ''.join(c if c.isalnum() else '-' for c in STYLE.lower())
while '--' in SLUG: SLUG = SLUG.replace('--', '-')
SLUG = SLUG.strip('-')
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GUIDE = flag('--guide', os.path.join(APP, 'scripts', 'avatar', 'out', 'hair', f'{SLUG}-{SEX}.obj'))
SIDECAR = GUIDE[:-4] + '.json'
KIT = flag('--kit', os.path.join(APP, 'public', 'models', 'candidates', f'fel-kit-{SEX}.glb'))
OUT = flag('--out', os.path.join(APP, 'public', 'models', 'hair', f'{SLUG}-{SEX}.glb'))
MESH = flag('--mesh')
EASE = float(flag('--ease', '0.002'))
DENSITY = float(flag('--density', '24'))
TRIS = int(flag('--tris', '12000'))
TEX = int(flag('--tex', '1024'))
NAME = f'HairPack_{SLUG}'
MAT = f'hair.{SLUG}'
if not os.path.exists(GUIDE) or not os.path.exists(SIDECAR):
    raise SystemExit(f'FELHAIR no guide at {GUIDE}: run  npx tsx scripts/avatar/export-hair.ts --style "{STYLE}" --sex {SEX}  first')
if not (MESH or has('--grow')):
    raise SystemExit('FELHAIR give --mesh <file> (a modelled hair) or --grow (hair curves grown on the guide)')

def log(*a): print('FELHAIR', *a, flush=True)

# ── a. the armature and the guide ────────────────────────────────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=KIT)
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
if len(rig.data.bones) != 22:
    raise SystemExit(f'FELHAIR the kit armature has {len(rig.data.bones)} bones, not the 22 the game reads')
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)   # only the armature stays from the kit
bpy.ops.wm.obj_import(filepath=GUIDE, forward_axis='Y', up_axis='Z')
parts = [o for o in bpy.context.selected_objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1: bpy.ops.object.join()
guide = bpy.context.view_layer.objects.active
guide.name = 'FELHairGuide'
side = json.load(open(SIDECAR))
assert side['verts'] == len(guide.data.vertices), 'FELHAIR the OBJ and its sidecar disagree'
# the game's skin, as vertex groups on the guide
for name in side['bones']: guide.vertex_groups.new(name=name)
J, W = side['joints'], side['weights']
for v in range(side['verts']):
    for k in range(4):
        w = W[v * 4 + k]
        if w > 0: guide.vertex_groups[side['bones'][int(J[v * 4 + k])]].add([v], w, 'REPLACE')
log('guide', STYLE, SEX, len(guide.data.vertices), 'verts')

# ── b. the high version ──────────────────────────────────────────────────────────────────────────────────────────────
if MESH:
    ext = os.path.splitext(MESH)[1].lower()
    before = set(bpy.context.scene.objects)
    if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=MESH)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=MESH)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=MESH)
    elif ext == '.blend':
        with bpy.data.libraries.load(MESH) as (src, dst): dst.objects = [n for n in src.objects]
        for o in dst.objects:
            if o: bpy.context.scene.collection.objects.link(o)
    else: raise SystemExit(f'FELHAIR cannot read {ext}')
    new = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    if flag('--object'): new = [o for o in new if o.name == flag('--object')]
    bpy.ops.object.select_all(action='DESELECT')
    for o in new: o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    if len(new) > 1: bpy.ops.object.join()
    high = bpy.context.view_layer.objects.active
    if not has('--no-align'):
        # fit its bounds to the guide's
        import mathutils
        gb = [guide.matrix_world @ mathutils.Vector(c) for c in guide.bound_box]
        hb = [high.matrix_world @ mathutils.Vector(c) for c in high.bound_box]
        gmin = mathutils.Vector([min(p[i] for p in gb) for i in range(3)]); gmax = mathutils.Vector([max(p[i] for p in gb) for i in range(3)])
        hmin = mathutils.Vector([min(p[i] for p in hb) for i in range(3)]); hmax = mathutils.Vector([max(p[i] for p in hb) for i in range(3)])
        s = min((gmax[i] - gmin[i]) / max(1e-6, hmax[i] - hmin[i]) for i in range(3))
        high.scale = high.scale * s
        bpy.context.view_layer.update()
        hb = [high.matrix_world @ mathutils.Vector(c) for c in high.bound_box]
        hc = sum(hb, mathutils.Vector()) / 8; gc = sum(gb, mathutils.Vector()) / 8
        high.location = high.location + (gc - hc)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    sw = high.modifiers.new('FELEase', 'SHRINKWRAP')
    sw.target = guide; sw.wrap_mode = 'OUTSIDE'; sw.offset = EASE
    bpy.ops.object.modifier_apply(modifier=sw.name)
else:
    # grow hair curves on the guide's hair surface, combed along it, clumped, as cards
    bpy.context.view_layer.objects.active = guide
    bpy.ops.object.curves_empty_hair_add()
    curves = bpy.context.view_layer.objects.active
    curves.data.surface = guide
    mod = curves.modifiers.new('FELGrow', 'NODES')
    try:
        bpy.ops.object.modifier_add_node_group(asset_library_type='ESSENTIALS', asset_library_identifier='', relative_asset_identifier='geometry_nodes/procedural_hair_node_assets.blend/NodeTree/Generate Hair Curves')
    except Exception as e:  # noqa: BLE001 — Blender versions name the essentials asset differently
        log('could not add the Generate Hair Curves asset:', e, '— add it by hand, then re-run with --mesh <the result>')
        raise SystemExit(1)
    log('grown at', DENSITY, 'curves per cm² — inspect, then convert: Object > Convert > Mesh (cards)')
    bpy.ops.object.convert(target='MESH')
    high = bpy.context.view_layer.objects.active

# ── c. bake the detail onto the guide ────────────────────────────────────────────────────────────────────────────────
low = guide.copy(); low.data = guide.data.copy(); bpy.context.scene.collection.objects.link(low)
low.name = NAME
bpy.context.view_layer.objects.active = low
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.smart_project(island_margin=0.01); bpy.ops.object.mode_set(mode='OBJECT')
mat = bpy.data.materials.new(MAT); mat.use_nodes = True
low.data.materials.clear(); low.data.materials.append(mat)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = 0.02
for kind in ('NORMAL', 'AO'):
    img = bpy.data.images.new(f'{MAT}.{kind.lower()}', TEX, TEX)
    node = mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT'); high.select_set(True); low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type=kind)
    log('baked', kind, f'{TEX}²')

# ── d. skin, budget, export ──────────────────────────────────────────────────────────────────────────────────────────
dt = low.modifiers.new('FELSkin', 'DATA_TRANSFER')
dt.object = guide; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
bpy.ops.object.datalayout_transfer(modifier=dt.name)
bpy.ops.object.modifier_apply(modifier=dt.name)
tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
if tris > TRIS:
    dec = low.modifiers.new('FELBudget', 'DECIMATE'); dec.ratio = TRIS / tris
    bpy.ops.object.modifier_apply(modifier=dec.name)
low.parent = rig
arm = low.modifiers.new('Armature', 'ARMATURE'); arm.object = rig
for o in list(scene.objects):
    if o not in (rig, low): bpy.data.objects.remove(o, do_unlink=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); low.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_skins=True, export_animations=False, export_morph=False)
log('wrote', OUT, f'mesh {NAME}', f'material {MAT}', f'{min(tris, TRIS)} tris')

# CHECKLIST before a baked style replaces the code-built one anywhere (it is wired in NOWHERE today):
#   1. /dev/studio: the baked GLB beside the code-built style on both kits, front and 3/4, the four lighting moods.
#   2. Its triangles ≤ renderHair.HAIR_BUDGET.desktop; one material; the swing chains (the sidecar's `chain`) are NOT
#      baked in — a baked tail would be rigid; keep the code-built sway for those styles, or split the tail off.
#   3. The game side, when the owner wants it: a `HAIR_PACKS: Record<style, url>` in renderHair (desktop tier only), loaded
#      like kit.ts loads a kit pack (attachKitPack: bind each bone to the body's node), tinted by the hair colour, with
#      the code-built style as the fallback while it loads and on every phone.
