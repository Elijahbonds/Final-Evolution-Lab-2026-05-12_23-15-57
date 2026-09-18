"""Bake a Meshy export into a game-ready GLB (owner ask 2026-09-05: use the Meshy assets).

blender -b --python scripts/meshy/bake-prop.py -- <src.glb|.fbx> <dst.glb> <axis:x|y|z|max> <target_m> <pivot:bottom|center> <decimate_ratio> <tex_px>

Meshy exports one mesh normalised to ~2 units with 4K textures. This: imports, scales the chosen extent to real metres, moves the
pivot (bottom-centre for standing props, centre for balls), decimates (collapse) to the ratio, resizes every image to tex_px, exports.
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, axis, target, pivot, ratio, tex = argv[0], argv[1], argv[2], float(argv[3]), argv[4], float(argv[5]), int(argv[6])
bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith('.fbx'): bpy.ops.import_scene.fbx(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# extent in world (Blender Z-up)
xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
ext = {'x': max(xs) - min(xs), 'y': max(zs) - min(zs), 'z': max(ys) - min(ys)}   # glTF y = Blender z
ext['max'] = max(ext.values())
s = target / ext[axis]
ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
cz = min(zs) if pivot == 'bottom' else (max(zs) + min(zs)) / 2
for v in ob.data.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= cz
if ratio < 1:
    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio
    bpy.ops.object.modifier_apply(modifier='dec')
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_image_format='JPEG' if tex <= 2048 else 'AUTO', export_jpeg_quality=85)
zs = [v.co.z for v in ob.data.vertices]; xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]
print(f"FELBAKE {os.path.basename(dst)} verts={len(ob.data.vertices)} size_m x={max(xs)-min(xs):.2f} y(up)={max(zs)-min(zs):.2f} z={max(ys)-min(ys):.2f} bytes={os.path.getsize(dst)}")
