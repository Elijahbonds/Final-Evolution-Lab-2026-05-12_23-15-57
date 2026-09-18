"""Extract one object from a Meshy sport pack (a fragment cluster) as a standalone game prop (Pass 7 phase 3: dressing density).

blender -b <pack-parts.blend> --python scripts/meshy/extract-prop.py -- <out.glb> <cluster centre x,up,d> <cluster size x,up,d> <axis> <target_m> <pivot:bottom|center> [tex_px=1024] [gap=0.03]

The .blend is a pack after Separate > Loose Parts (cluster.py lists centres/sizes). Fragments whose bbox centre falls in the
box are joined, scaled so <axis> spans <target_m>, re-pivoted, textures resized, exported. No rig.
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]; cc = [float(v) for v in argv[1].split(',')]; cs = [float(v) for v in argv[2].split(',')]
axis, target, pivot = argv[3], float(argv[4]), argv[5]
tex = int(argv[6]) if len(argv) > 6 else 1024; gap = float(argv[7]) if len(argv) > 7 else 0.03
def bb(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return (min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs), max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))
lo = (cc[0]-cs[0]/2-gap, cc[2]-cs[2]/2-gap, cc[1]-cs[1]/2-gap); hi = (cc[0]+cs[0]/2+gap, cc[2]+cs[2]/2+gap, cc[1]+cs[1]/2+gap)
picked = []
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    b = bb(o); c = ((b[0]+b[3])/2, (b[1]+b[4])/2, (b[2]+b[5])/2)
    if all(lo[k] <= c[k] <= hi[k] for k in range(3)): picked.append(o)
if not picked: raise SystemExit('FELPROP no fragments in the box')
for o in bpy.data.objects: o.select_set(o in picked)
bpy.context.view_layer.objects.active = picked[0]; bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
for o in [o for o in bpy.data.objects if o is not ob]: bpy.data.objects.remove(o, do_unlink=True)
ob.name = os.path.splitext(os.path.basename(out))[0]
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
b = bb(ob); ext = {'x': b[3]-b[0], 'y': b[5]-b[2], 'z': b[4]-b[1]}; ext['max'] = max(ext.values())
s = target / ext[axis]; ob.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
b = bb(ob); cx, cy = (b[0]+b[3])/2, (b[1]+b[4])/2; cz = b[2] if pivot == 'bottom' else (b[2]+b[5])/2
for v in ob.data.vertices: v.co.x -= cx; v.co.y -= cy; v.co.z -= cz
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, use_selection=True, export_image_format='JPEG', export_jpeg_quality=85)
b = bb(ob); print(f"FELPROP {os.path.basename(out)} frags={len(picked)} verts={len(ob.data.vertices)} size x={b[3]-b[0]:.2f} up={b[5]-b[2]:.2f} d={b[4]-b[1]:.2f} bytes={os.path.getsize(out)}")
