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
for name in kit_objects: decimate(name, 0.35 if name.startswith('Kit_shoes') else 0.6)
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
