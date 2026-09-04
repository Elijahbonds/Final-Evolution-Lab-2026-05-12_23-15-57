# dress-kit.py — a FEL body from MPFB2 with the Closet's fitted garment library
# (ship pass 3, rung 3). Like dress.py, plus: every Closet wearable for tops,
# shorts and shoes is added as its own skinned garment named
# Kit_<slot>_<itemId> with material <jersey|shorts|shoes>.<itemId>; the runtime
# shows one per slot (lib/babylon/core/kit.ts). Sex from --sex male|female.
#   blender -b --python scripts/avatar/mpfb/dress-kit.py -- --sex male --out /path/mpfb-kit-m.glb
import bpy, importlib, sys, glob
mod = 'bl_ext.user_default.mpfb'
HumanService = importlib.import_module(mod + '.services.humanservice').HumanService
MaterialService = importlib.import_module(mod + '.services.materialservice').MaterialService
TargetService = importlib.import_module(mod + '.services.targetservice').TargetService
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv
def flag(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
SEX = flag('--sex', 'male'); OUT = flag('--out', '/tmp/mpfb-kit.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
U = "/Users/elijahbonds/Library/Application Support/Blender/5.1/extensions/.user/user_default/mpfb/data"
macro = TargetService.get_default_macro_info_dict()
macro['gender'] = 0.9 if SEX == 'male' else 0.1     # MakeHuman: 0 = female, 1 = male; the default 0.5 is androgynous
macro['age'] = 0.5; macro['muscle'] = 0.6; macro['weight'] = 0.5; macro['proportions'] = 0.7
basemesh = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
armature = HumanService.add_builtin_rig(basemesh, 'mixamo', import_weights=True)
print('KIT body verts', len(basemesh.data.vertices), 'bones', len(armature.data.bones), 'sex', SEX)
skin = 'middleage_caucasian_male' if SEX == 'male' else 'young_caucasian_female'
try:
    MaterialService.create_v2_skin_material('skin', basemesh, mhmat_file=U + f'/skins/{skin}/{skin}.mhmat')
    print('KIT skin material assigned', skin)
except Exception as e: print('KIT skin FAILED', repr(e)[:200])
def add(kind, path, label, material=None):
    try:
        obj = HumanService.add_mhclo_asset(path, basemesh, asset_type=kind, material_type='MAKESKIN')
        if obj is not None:
            obj.name = label
            if material and obj.data.materials:
                for m in obj.data.materials:
                    if m: m.name = material
        print('KIT', kind, label, 'ok')
        return obj
    except Exception as e: print('KIT', kind, label, 'FAILED', repr(e)[:220]); return None
# the Closet's wearables (lib/closet/wearable-catalog.ts) → MakeHuman garments (all CC0)
KIT = {
    'tops':   [('top_lab', 'toigo_basic_tucked_t-shirt' if SEX == 'female' else 'elvs_crude_t-shirt_male'), ('top_bonds', 'toigo_keyhole_tank_top')],
    'shorts': [('shorts_court', 'cortu_jeans_shorts'), ('shorts_glitch', 'cortu_jeans_shorts')],
    'shoes':  [('shoes_evo', 'culturalibre_hero_boots_1' if SEX == 'male' else 'culturalibre_heroine_boots_1'), ('shoes_flight', 'shoes01')],
}
MAT = {'tops': 'jersey', 'shorts': 'shorts', 'shoes': 'shoes'}
kit_objects = []
for slot, items in KIT.items():
    for item_id, garment in items:
        obj = add('Clothes', U + f'/clothes/{garment}/{garment}.mhclo', f'Kit_{slot}_{item_id}', f'{MAT[slot]}.{item_id}')
        if obj: kit_objects.append(obj.name)
eyes = sorted(glob.glob(U + '/eyes/low-poly/*.mhclo'))
if eyes: add('Eyes', eyes[0], 'eyes')
FACE = [('faceLong', 'head-rectangular'), ('faceRound', 'head-round'), ('faceSquare', 'head-square'), ('faceHeart', 'head-invertedtriangular'),
        ('faceDiamond', 'head-diamond'), ('jawOpen', 'chin-jaw-drop-incr'), ('browRaise', 'eyebrows-trans-up')]
for fel, target in FACE:
    try: TargetService.load_target(basemesh, TargetService.target_full_path(target), weight=0.0, name=fel)
    except Exception as e: print('KIT morph', fel, 'FAILED', repr(e)[:160])
# budget: garments decimated and baked (no shape keys there); the body keeps its keys
def decimate(name, ratio):
    obj = bpy.data.objects.get(name)
    if not obj: return
    m = obj.modifiers.new('fel_decimate', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='fel_decimate')
for name in kit_objects: decimate(name, 0.35 if name.startswith('Kit_shoes') else 0.6)
decimate('eyes', 0.5)
import bmesh
helper_groups = [vg.index for vg in basemesh.vertex_groups if vg.name.lower().startswith(('helper', 'joint', 'hair', 'tights', 'skirt', 'fur'))]
if helper_groups:
    bm = bmesh.new(); bm.from_mesh(basemesh.data); dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if dl is not None and any(g in v[dl] for g in helper_groups)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(basemesh.data); bm.free()
    print('KIT helpers deleted', len(kill), 'verts; body now', len(basemesh.data.vertices))
for m in list(basemesh.modifiers):
    if m.type == 'MASK': basemesh.modifiers.remove(m)
if basemesh.data.shape_keys:
    for kb in list(basemesh.data.shape_keys.key_blocks):
        if kb.name.startswith('$md'): basemesh.shape_key_remove(kb)
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles(); n = len(me.loop_triangles); tris += n; ev.to_mesh_clear()
        print('KIT tris', o.name, n)
print('KIT tris total', tris)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_skins=True, export_morph=True, export_morph_normal=False, export_animations=False, export_apply=False, export_yup=True, export_image_format='AUTO', export_texcoords=True, export_normals=True)
print('KIT exported', OUT)
