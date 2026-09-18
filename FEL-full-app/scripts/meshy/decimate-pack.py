"""Decimate a skinned kit pack in place, keeping its rig and weights (Pass 7: eight defenders in a 55k-vertex jersey put
~440k skinned vertices through the bone shader and football fell to 44 fps).

blender -b --python scripts/meshy/decimate-pack.py -- <in.glb> <out.glb> <ratio> [tex_px=1024]
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, ratio = argv[0], argv[1], float(argv[2]); tex = int(argv[3]) if len(argv) > 3 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']; rig = [o for o in bpy.data.objects if o.type == 'ARMATURE']
for m in meshes:
    bpy.context.view_layer.objects.active = m
    before = len(m.data.vertices)
    md = m.modifiers.new('dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = True
    # keep the Armature modifier; apply only the decimate
    bpy.ops.object.modifier_apply(modifier='dec')
    print(f"FELDEC {m.name} {before} -> {len(m.data.vertices)} verts, vgroups {len(m.vertex_groups)}")
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, use_selection=True, export_skins=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=85)
print(f"FELDEC wrote {out} bytes={os.path.getsize(out)} rig={len(rig)}")
