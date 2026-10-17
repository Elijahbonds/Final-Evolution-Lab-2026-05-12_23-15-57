# rival.py — ONE rival body from MPFB2, from a spec (owner 2026-10-16: "the meshy opponents need to be replaced by our models
# because they are broken, make our npcs look better than the meshy models"; decision: forge bodies, made varied).
#
# dress-kit.py's body with its own anatomy and its own look per rival, instead of the kit's one fixed build: the MakeHuman
# macros (sex, age, muscle, weight, height, proportions and the three race weights that shape the face), two face targets
# baked into the basis, one of the pack's skins, one hair asset, eyebrows, eyes, and the kit's garment contract —
# Kit_<slot>_<itemId> meshes with <jersey|shorts|shoes>.<itemId> materials, so applyKit, the fits and the team tints find
# them the way they find the player's (the Meshy rivals were ONE mesh with one material: no team colour ever reached them).
# The rig is MPFB's own Mixamo rig with MPFB's weights (import_weights) — not a nearest-vertex transfer, which is what tore
# the Meshy bodies (RETIRED_ATHLETES; the hands carried 13 vertices against the kit's 1,796).
#   blender -b --python scripts/avatar/mpfb/rival.py -- --spec /path/rival.json --out /path/rival-mpfb.glb
# The spec (scripts/avatar/rivals.mts writes it): { key, sex, macro: {age, muscle, weight, height, proportions, african,
#   asian, caucasian}, face: {target: weight}, skin, hair: <asset>|null, hairKey, brows, tops: {itemId: garment},
#   shorts: {itemId: garment}, shoes: {itemId: garment} }
import bpy, importlib, sys, glob, json
mod = 'bl_ext.user_default.mpfb'
HumanService = importlib.import_module(mod + '.services.humanservice').HumanService
MaterialService = importlib.import_module(mod + '.services.materialservice').MaterialService
TargetService = importlib.import_module(mod + '.services.targetservice').TargetService
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv
def flag(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
SPEC = json.load(open(flag('--spec', '/tmp/rival.json'))); OUT = flag('--out', '/tmp/rival-mpfb.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
U = "/Users/elijahbonds/Library/Application Support/Blender/5.1/extensions/.user/user_default/mpfb/data"
mc = SPEC['macro']
macro = TargetService.get_default_macro_info_dict()
macro['gender'] = 0.95 if SPEC['sex'] == 'male' else 0.05
for k in ('age', 'muscle', 'weight', 'height', 'proportions'):
    if k in mc: macro[k] = mc[k]
race = {k: float(mc.get(k, 0)) for k in ('african', 'asian', 'caucasian')}
tot = sum(race.values()) or 1.0
macro['race'] = {k: v / tot for k, v in race.items()}
basemesh = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
armature = HumanService.add_builtin_rig(basemesh, 'mixamo', import_weights=True)
print('RIVAL', SPEC['key'], 'verts', len(basemesh.data.vertices), 'bones', len(armature.data.bones))
try:
    MaterialService.create_v2_skin_material('skin', basemesh, mhmat_file=U + f"/skins/{SPEC['skin']}/{SPEC['skin']}.mhmat")
    print('RIVAL skin', SPEC['skin'])
except Exception as e: print('RIVAL skin FAILED', repr(e)[:200])
def add(kind, path, label, material=None):
    try:
        obj = HumanService.add_mhclo_asset(path, basemesh, asset_type=kind, material_type='MAKESKIN')
        if obj is not None:
            obj.name = label
            if material and obj.data.materials:
                for m in obj.data.materials:
                    if m: m.name = material
        print('RIVAL', kind, label, 'ok')
        return obj
    except Exception as e: print('RIVAL', kind, label, 'FAILED', repr(e)[:220]); return None
# the macro shape (and with it the race weights that make the face) baked into the basis BEFORE anything is fitted to it
# (dress-kit.py's measured order: fitted to the evaluated shape, exported from the basis)
def bake_mix(tag):
    if not basemesh.data.shape_keys: return
    mix = basemesh.shape_key_add(name=tag, from_mix=True)
    basis = basemesh.data.shape_keys.reference_key
    for i, v in enumerate(mix.data):
        basis.data[i].co = v.co
        basemesh.data.vertices[i].co = v.co
    for kb in list(basemesh.data.shape_keys.key_blocks):
        if kb != basis: basemesh.shape_key_remove(kb)
bake_mix('felBakedMacro')
# his own face: a couple of MakeHuman head / feature targets at the spec's weights, baked in too (no morphs ship on a rival)
for target, w in (SPEC.get('face') or {}).items():
    try: TargetService.load_target(basemesh, TargetService.target_full_path(target), weight=float(w), name=target)
    except Exception as e: print('RIVAL face', target, 'FAILED', repr(e)[:160])
bake_mix('felBakedFace')
MAT = {'tops': 'jersey', 'shorts': 'shorts', 'shoes': 'shoes'}
kit_objects = []
for slot in ('tops', 'shorts', 'shoes'):
    for item_id, garment in (SPEC.get(slot) or {}).items():
        obj = add('Clothes', U + f'/clothes/{garment}/{garment}.mhclo', f'Kit_{slot}_{item_id}', f'{MAT[slot]}.{item_id}')
        if obj: kit_objects.append(obj.name)
hair_objects = []
if SPEC.get('hair'):
    obj = add('Hair', U + f"/hair/{SPEC['hair']}/{SPEC['hair']}.mhclo", f"Hair_{SPEC['hairKey']}", f"hair.{SPEC['hairKey']}")
    if obj: hair_objects.append(obj.name)
if SPEC.get('brows'):
    brow = glob.glob(U + f"/eyebrows/{SPEC['brows']}/*.mhclo")
    if brow: add('Eyebrows', brow[0], 'brows')
eyes = sorted(glob.glob(U + '/eyes/low-poly/*.mhclo'))
if eyes: add('Eyes', eyes[0], 'eyes')
def decimate(name, ratio):
    obj = bpy.data.objects.get(name)
    if not obj: return
    m = obj.modifiers.new('fel_decimate', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='fel_decimate')
# THE CASUAL WARDROBE (style pass, owner 2026-10-16): the shapes the library does not have, made from the fitted garments it
# does — before the decimation, which skips a shaped garment (it was densified on purpose). scripts/avatar/mpfb/style.py.
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import style
import numpy as np
STYLE = SPEC.get('style') or {}
# THE LANDMARKS ARE READ OFF THE FITTED GEOMETRY, not the armature: its rest bones are the default build's (a woman's Spine2
# read 1.298 m, the man's, while her tee topped out at 1.351 m — her chest print sat above her shirt).
def zrange(obj):
    zs = [v.co.z for v in obj.data.vertices]; return min(zs), max(zs)
# the baggy short's hem and crotch as shares of the pant's own length (measured on the first build: hem 4 cm under the knee
# at 0.40, the crotch at 0.80)
HEM_SHARE, CROTCH_SHARE = 0.40, 0.80
shaped = set()
for slot in ('tops', 'shorts'):
    for item_id, st in (STYLE.get(slot) or {}).items():
        obj = bpy.data.objects.get(f'Kit_{slot}_{item_id}')
        if obj is None: print('STYLE', slot, item_id, 'FAILED no garment'); continue
        if st.get('baggy'):
            b = st['baggy']
            style.densify(obj, 1)
            z0, z1 = zrange(obj); L = z1 - z0
            hem = z0 + HEM_SHARE * L; crotch = z0 + CROTCH_SHARE * L
            axes = style.leg_axes(basemesh, crotch, hem + 0.04, max(z0 + 0.08, hem - 0.3))
            cut = style.cut_below(obj, hem)
            moved = style.loosen_legs(obj, axes, crotch, hem, float(b.get('loosen', 0.045)))
            st['_axes'] = axes; st['_crotch'] = crotch
            shaped.add(obj.name); print('STYLE baggy', item_id, 'hem', round(hem, 3), 'cut', cut, 'moved', moved, 'verts', len(obj.data.vertices))
        elif st.get('densify'):
            style.densify(obj, 1); shaped.add(obj.name)
        if st.get('sleeveless'):
            cut = style.cut_sleeves(obj, float(st['sleeveless'].get('threshold', 0.5)))
            print('STYLE sleeveless', item_id, 'cut', cut, 'verts', len(obj.data.vertices))
for name in kit_objects:
    if name not in shaped: decimate(name, 0.35 if name.startswith('Kit_shoes') else 0.6)
def _diffuse(obj):
    for m in obj.data.materials:
        if m and m.use_nodes:
            for nd in m.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image and 'diffuse' in (nd.label + nd.name).lower(): return nd.image
    return None
# THE GAME DRAWS A FORGE BODY MIRRORED LEFT-RIGHT against Blender (measured 2026-10-16: blaze's front "7" reads right on the
# GLB re-imported into Blender and backwards on /dev/model — the codebase's "hand as drawn" vs the rig-named hand). So a print is
# painted mirrored, to read right where it is seen. `style.mirror: false` in a spec paints it as Blender shows it.
MIRROR = bool(STYLE.get('mirror', True))
def boxes(top):
    """Where a print sits on this top, in the body's metres (x across, z up): under its own neckline."""
    _, zt = zrange(top)
    return {
        'chest': (-0.13, 0.13, zt - 0.32, zt - 0.06),
        'chestBig': (-0.155, 0.155, zt - 0.42, zt - 0.05),
        'back': (-0.155, 0.155, zt - 0.40, zt - 0.03),
    }
for slot in ('tops', 'shorts'):
    for item_id, st in (STYLE.get(slot) or {}).items():
        pr = st.get('print'); obj = bpy.data.objects.get(f'Kit_{slot}_{item_id}')
        if not pr or obj is None: continue
        try:
            size = int(pr.get('size', 512))
            base = style.tonal_from(_diffuse(obj), size, lo=float(pr.get('lo', 0.62)))
            layers = []
            ys = [v.co.y for v in obj.data.vertices]; cy = (min(ys) + max(ys)) / 2   # the garment's own mid-depth: front is -Y
            BOX = boxes(obj) if slot == 'tops' else {}
            if pr.get('front'): layers.append({'kind': 'front', 'box': BOX[pr.get('frontAt', 'chest')], 'decal': style.load_decal(pr['front']), 'cy': cy, 'mirror': MIRROR})
            if pr.get('back'): layers.append({'kind': 'back', 'box': BOX[pr.get('backAt', 'back')], 'decal': style.load_decal(pr['back']), 'cy': cy, 'mirror': MIRROR})
            for band in pr.get('bands', []):
                L = dict(band)
                if L['kind'] == 'yoke': L['z'] = zrange(obj)[1] - float(L.get('below', 0.12))
                if L['kind'] == 'stripe':
                    if '_axes' not in st: print('STYLE stripe', item_id, 'FAILED not a baggy short'); continue
                    L['axes'] = st['_axes']; L['zmax'] = st['_crotch'] + float(L.get('above', 0.0))
                layers.append(L)
            arr = style.paint(obj, size, base, layers)
            if os.environ.get('STYLE_DEBUG'):
                zz = zrange(obj); print('STYLE debug', item_id, 'z', round(zz[0], 3), round(zz[1], 3), 'cy', round(cy, 3), 'box', [round(b, 3) for b in BOX.get(pr.get('frontAt', 'chest'), (0, 0, 0, 0))])
            style.set_print(obj, arr, f"felprint_{SPEC['key']}_{slot}")
            print('STYLE print', item_id, size, 'layers', len(layers), 'mean', round(float(arr.mean()), 3))
        except Exception as e: print('STYLE print', item_id, 'FAILED', repr(e)[:240])
for name in hair_objects: decimate(name, 0.5)
decimate('eyes', 0.5)
import bmesh
helper_groups = [vg.index for vg in basemesh.vertex_groups if vg.name.lower().startswith(('helper', 'joint', 'hair', 'tights', 'skirt', 'fur'))]
if helper_groups:
    bm = bmesh.new(); bm.from_mesh(basemesh.data); dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if dl is not None and any(g in v[dl] for g in helper_groups)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(basemesh.data); bm.free()
for m in list(basemesh.modifiers):
    if m.type == 'MASK': basemesh.modifiers.remove(m)
if basemesh.data.shape_keys:
    for kb in list(basemesh.data.shape_keys.key_blocks):
        if kb != basemesh.data.shape_keys.reference_key: basemesh.shape_key_remove(kb)
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles); ev.to_mesh_clear()
print('RIVAL tris', tris)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_skins=True, export_morph=False, export_animations=False, export_apply=False, export_yup=True, export_image_format='AUTO', export_texcoords=True, export_normals=True)
print('RIVAL exported', OUT)
