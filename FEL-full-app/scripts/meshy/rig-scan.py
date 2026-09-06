"""Rig a Meshy body scan onto the FEL 22-bone rig WITHOUT the T-pose problem (owner ask 2026-09-05: "see if the loader can build me").

blender -b --python scripts/meshy/rig-scan.py -- <scan.glb> <hero.glb> <out.glb> [height_m] [arm_deg]

Meshy scans have no skeleton and stand in a T-pose. Binding a T-posed mesh to the A-pose rig is what made the earlier hero
T-pose in game. So: (1) scale the scan to the body's height, feet on the floor, facing the body's way; (2) pose the rig's
upper arms out to the scan's arm angle (default 90° = T); (3) copy skin weights from the POSED body to the scan (nearest
face, interpolated) and bind; (4) clear the pose — the scan now deforms into the rig's A-pose — and bake that deformation
into the mesh; (5) bind again on the rest rig and export scan + rig only. Bone names untouched (Gate 0).
"""
import bpy, sys, math, os
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
scan_path, hero_path, out = argv[0], argv[1], argv[2]
height = float(argv[3]) if len(argv) > 3 else 1.71
arm_deg = float(argv[4]) if len(argv) > 4 else 90.0

def wverts(o): return [o.matrix_world @ v.co for v in o.data.vertices]
def bbox(o):
    vs = wverts(o); return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
def forward_sign(o):
    """+1 if the toes point to -Y (Blender forward), -1 if +Y: the feet's lowest 4 % of vertices reach further toward the toes."""
    vs = wverts(o); zmin = min(v.z for v in vs); h = max(v.z for v in vs) - zmin
    feet = [v for v in vs if v.z < zmin + 0.04 * h]; cy = sum(v.y for v in feet) / len(feet)
    return 1 if (cy - min(v.y for v in feet)) > (max(v.y for v in feet) - cy) else -1

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=scan_path)
scan = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(o in scan)
bpy.context.view_layer.objects.active = scan[0]
if len(scan) > 1: bpy.ops.object.join()
scan = bpy.context.view_layer.objects.active; scan.name = 'Body'; scan.data.name = 'Body'
scan.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.data.objects if o is not scan]: bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.import_scene.gltf(filepath=hero_path)
rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
body = bpy.data.objects['Body.001'] if 'Body.001' in bpy.data.objects else [o for o in bpy.data.objects if o.type == 'MESH' and o is not scan and o.name.startswith('Body')][0]
# 1. scale / floor / centre / facing
lo, hi = bbox(scan); s = height / (hi.z - lo.z)
bpy.ops.object.select_all(action='DESELECT'); scan.select_set(True); bpy.context.view_layer.objects.active = scan
scan.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
if forward_sign(scan) != forward_sign(body):
    scan.rotation_euler = (0, 0, math.pi); bpy.ops.object.transform_apply(rotation=True)
lo, hi = bbox(scan); blo, bhi = bbox(body)
scan.location = (-(lo.x + hi.x) / 2 + (blo.x + bhi.x) / 2, -(lo.y + hi.y) / 2 + (blo.y + bhi.y) / 2, -lo.z + blo.z)
bpy.ops.object.transform_apply(location=True)
lo, hi = bbox(scan)
print(f"FELRIG scan verts={len(scan.data.vertices)} height={hi.z-lo.z:.2f} width={hi.x-lo.x:.2f} depth={hi.y-lo.y:.2f} body width={bhi.x-blo.x:.2f}")
# 2. pose the rig's upper arms out to the scan's arm angle (about the body's forward axis)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
for name, side in (('LeftArm', 1), ('RightArm', -1)):
    pb = rig.pose.bones[name]
    head = rig.matrix_world @ pb.head; tail = rig.matrix_world @ pb.tail
    d = (tail - head).normalized()
    target = Vector((side, 0, 0)).lerp(Vector((side * math.cos(math.radians(90 - arm_deg)), 0, -math.sin(math.radians(90 - arm_deg)))), 0) if arm_deg == 90 else Vector((side * math.sin(math.radians(arm_deg)), 0, -math.cos(math.radians(arm_deg)))).normalized()
    q = d.rotation_difference(target)
    pb.matrix = Matrix.Translation(pb.matrix.translation) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pb.matrix.translation) @ pb.matrix
    bpy.context.view_layer.update()
    head = rig.matrix_world @ pb.head; tail = rig.matrix_world @ pb.tail; nd = (tail - head).normalized()
    print(f"FELRIG {name} rest dir {tuple(round(c,2) for c in d)} → posed {tuple(round(c,2) for c in nd)}")
bpy.ops.object.mode_set(mode='OBJECT')
# 3. weights from the posed body, bind
for vg in body.vertex_groups: scan.vertex_groups.new(name=vg.name)
dt = scan.modifiers.new('weights', 'DATA_TRANSFER'); dt.object = body; dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.context.view_layer.objects.active = scan; bpy.ops.object.select_all(action='DESELECT'); scan.select_set(True)
bpy.ops.object.modifier_apply(modifier='weights')
scan.parent = rig
arm = scan.modifiers.new('Armature', 'ARMATURE'); arm.object = rig
# 4. clear the pose → the scan deforms into the A-pose; bake it
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.transforms_clear(); bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()
bpy.context.view_layer.objects.active = scan; bpy.ops.object.select_all(action='DESELECT'); scan.select_set(True)
bpy.ops.object.modifier_apply(modifier='Armature')
lo, hi = bbox(scan); print(f"FELRIG after re-pose: width={hi.x-lo.x:.2f} (T-pose was wider; the A-pose body is {bhi.x-blo.x:.2f})")
# 5. bind on the rest rig, export scan + rig
arm = scan.modifiers.new('Armature', 'ARMATURE'); arm.object = rig
for m in scan.data.materials:
    if m: m.name = 'scan'
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o is not scan]: bpy.data.objects.remove(o, do_unlink=True)
for img in bpy.data.images:
    if img.size[0] > 2048: img.scale(2048, 2048)
bpy.ops.object.select_all(action='DESELECT'); scan.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, use_selection=True, export_skins=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=85)
print(f"FELRIG wrote {out} bytes={os.path.getsize(out)} bones={len(rig.data.bones)}")
