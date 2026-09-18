import bpy, importlib, sys, glob
mod = 'bl_ext.user_default.mpfb'
HumanService = importlib.import_module(mod + '.services.humanservice').HumanService
MaterialService = importlib.import_module(mod + '.services.materialservice').MaterialService
bpy.ops.wm.read_factory_settings(use_empty=True)
U = "/Users/elijahbonds/Library/Application Support/Blender/5.1/extensions/.user/user_default/mpfb/data"
basemesh = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=False, feet_on_ground=True, scale=0.1)
armature = HumanService.add_builtin_rig(basemesh, 'mixamo', import_weights=True)
print('DRESS body verts', len(basemesh.data.vertices), 'bones', len(armature.data.bones))
try:
    MaterialService.create_v2_skin_material('skin', basemesh, mhmat_file=U + '/skins/middleage_caucasian_male/middleage_caucasian_male.mhmat')
    print('DRESS skin material assigned')
except Exception as e: print('DRESS skin FAILED', repr(e)[:200])
def add(kind, path, label):
    try:
        obj = HumanService.add_mhclo_asset(path, basemesh, asset_type=kind, material_type='MAKESKIN')
        if obj is not None: obj.name = label
        print('DRESS', kind, label, 'ok', obj.name if obj else None)
    except Exception as e: print('DRESS', kind, label, 'FAILED', repr(e)[:220])
add('Clothes', U + '/clothes/elvs_crude_t-shirt_male/elvs_crude_t-shirt_male.mhclo', 'jersey')
add('Clothes', U + '/clothes/cortu_jeans_shorts/cortu_jeans_shorts.mhclo', 'shorts')
add('Clothes', U + '/clothes/culturalibre_hero_boots_1/culturalibre_hero_boots_1.mhclo', 'shoes')
eyes = sorted(glob.glob(U + '/eyes/low-poly/*.mhclo'))
if eyes: add('Eyes', eyes[0], 'eyes')
# the Closet's seven face morphs, as MPFB targets → shape keys named for FEL
# (lib/babylon/core/faceMorphs.ts FACE_MORPH_NAMES order is the weight order)
TargetService = importlib.import_module(mod + '.services.targetservice').TargetService
FACE = [('faceLong', 'head-rectangular'), ('faceRound', 'head-round'), ('faceSquare', 'head-square'), ('faceHeart', 'head-invertedtriangular'),
        ('faceDiamond', 'head-diamond'), ('jawOpen', 'chin-jaw-drop-incr'), ('browRaise', 'eyebrows-trans-up')]
for fel, target in FACE:
    try:
        TargetService.load_target(basemesh, TargetService.target_full_path(target), weight=0.0, name=fel)
    except Exception as e: print('DRESS morph', fel, 'FAILED', repr(e)[:160])
print('DRESS morphs', [k.name for k in basemesh.data.shape_keys.key_blocks] if basemesh.data.shape_keys else None)
# budget: the full avatar must stay under 25k triangles in the browser; the boots
# and eyes carry most of the excess — decimate them (planar-safe collapse)
def decimate(name, ratio):
    obj = bpy.data.objects.get(name)
    if not obj: return
    mod = obj.modifiers.new('fel_decimate', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
for name, ratio in [('shoes', 0.35), ('eyes', 0.5), ('jersey', 0.7), ('shorts', 0.7)]: decimate(name, ratio)
# Blender's glTF exporter drops every shape key when it applies modifiers, so:
# bake the decimation into the clothes (no shape keys there), remove the body's
# helper geometry by deleting its vertices (shape keys survive that, the mask
# modifier would not export), and export WITHOUT applying modifiers.
import bmesh
for name in ['shoes', 'eyes', 'jersey', 'shorts']:
    obj = bpy.data.objects.get(name)
    if obj and obj.modifiers.get('fel_decimate'):
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier='fel_decimate')
helper_groups = [vg.index for vg in basemesh.vertex_groups if vg.name.lower().startswith(('helper', 'joint', 'hair', 'tights', 'skirt', 'fur'))]
if helper_groups:
    bm = bmesh.new(); bm.from_mesh(basemesh.data)
    dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if dl is not None and any(g in v[dl] for g in helper_groups)]
    bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(basemesh.data); bm.free()
    print('DRESS helpers deleted', len(kill), 'verts; body now', len(basemesh.data.vertices))
for m in list(basemesh.modifiers):
    if m.type == 'MASK': basemesh.modifiers.remove(m)
# only the Closet's seven morphs ship; MPFB's macro-detail keys are authoring state
if basemesh.data.shape_keys:
    for kb in list(basemesh.data.shape_keys.key_blocks):
        if kb.name.startswith('$md'): basemesh.shape_key_remove(kb)
    print('DRESS shape keys kept', [k.name for k in basemesh.data.shape_keys.key_blocks])
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles(); n = len(m.loop_triangles); tris += n; ev.to_mesh_clear()
        print('DRESS tris', o.name, n)
print('DRESS tris after decimate', tris)
out = sys.argv[sys.argv.index('--out') + 1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_morph=True, export_morph_normal=False, export_animations=False, export_apply=False, export_yup=True, export_image_format='AUTO', export_texcoords=True, export_normals=True)
print('DRESS exported', out)
