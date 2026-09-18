"""Fit a garment cluster from a Meshy pack onto the FEL body and skin it to the 22-bone rig (owner approval 2026-09-05).

blender -b <pack-parts.blend> --python scripts/meshy/fit-garment.py -- <hero.glb> <out.glb> <slot:tops|shorts|shoes> <itemId>
    <cluster centre x,up,d> <cluster size x,up,d> [gap]

The pack .blend holds the loose fragments (scripts/…/cluster.py found the clusters). Fragments whose bbox centre lies inside
the given cluster box are joined into one garment mesh. The garment is scaled so its height matches the body's slot band
(tops: 0.94–1.45 m, shorts: 0.80–1.03, shoes: 0–0.21) and its width the body's width there (+ a 5 % ease), centred on the
body's slot band centre, then skin weights are copied from the Body (nearest face, interpolated), parented to the rig and
exported with ONLY the armature + garment as Kit_<slot>_<itemId>. Bone names are untouched (Gate 0: 22 unprefixed bones).
"""
import bpy, sys, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
hero, out, slot, item = argv[0], argv[1], argv[2], argv[3]
cc = [float(v) for v in argv[4].split(',')]; cs = [float(v) for v in argv[5].split(',')]
gap = float(argv[6]) if len(argv) > 6 else 0.03
BAND = {'tops': (0.94, 1.45), 'shorts': (0.80, 1.03), 'shoes': (0.0, 0.21)}[slot]

def bb(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return (min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs), max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))
# 1. pick the fragments in the cluster box (Blender: x, y = depth, z = up; cluster given as x, up, d)
lo = (cc[0]-cs[0]/2-gap, cc[2]-cs[2]/2-gap, cc[1]-cs[1]/2-gap); hi = (cc[0]+cs[0]/2+gap, cc[2]+cs[2]/2+gap, cc[1]+cs[1]/2+gap)
picked = []
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    b = bb(o); c = ((b[0]+b[3])/2, (b[1]+b[4])/2, (b[2]+b[5])/2)
    if all(lo[k] <= c[k] <= hi[k] for k in range(3)): picked.append(o)
for o in bpy.data.objects: o.select_set(o in picked)
if not picked: raise SystemExit('FELFIT no fragments in the cluster box')
bpy.context.view_layer.objects.active = picked[0]
bpy.ops.object.join(); garment = bpy.context.view_layer.objects.active; garment.name = f'Kit_{slot}_{item}'
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o is not garment]: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
gb = bb(garment); print(f'FELFIT garment frags={len(picked)} verts={len(garment.data.vertices)} size x={gb[3]-gb[0]:.2f} up={gb[5]-gb[2]:.2f} d={gb[4]-gb[1]:.2f}')
# 2. the hero: body + rig
bpy.ops.import_scene.gltf(filepath=hero)
rig = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
body = bpy.data.objects['Body']
bv = [body.matrix_world @ v.co for v in body.data.vertices]
band = [v for v in bv if BAND[0] <= v.z <= BAND[1] and abs(v.x) < 0.30]   # the torso / hips / feet only — the T-pose arms are excluded
bw = max(v.x for v in band) - min(v.x for v in band); bd = max(v.y for v in band) - min(v.y for v in band)
bcx = (max(v.x for v in band) + min(v.x for v in band)) / 2; bcy = (max(v.y for v in band) + min(v.y for v in band)) / 2
# 3. scale per axis: height to the band; width and depth to the body's torso PLUS ease so the garment sits outside the skin
EASE_W, EASE_D = {'tops': (1.16, 1.22), 'shorts': (1.14, 1.20), 'shoes': (1.0, 1.0)}[slot]
sh = (BAND[1] - BAND[0]) / (gb[5] - gb[2])
sw = max(bw * EASE_W, (gb[3] - gb[0]) * sh) / (gb[3] - gb[0]) if slot == 'tops' else bw * EASE_W / (gb[3] - gb[0])   # a top keeps its sleeves: never narrower than its height-scaled width
sd = bd * EASE_D / (gb[4] - gb[1])
s = (sw, sd, sh) if slot != 'shoes' else (sh, sh, sh)
bpy.ops.object.select_all(action='DESELECT'); garment.select_set(True); bpy.context.view_layer.objects.active = garment
garment.scale = s; bpy.ops.object.transform_apply(scale=True)
gb = bb(garment)
garment.location = (bcx - (gb[0]+gb[3])/2, bcy - (gb[1]+gb[4])/2, BAND[1] - gb[5])
bpy.ops.object.select_all(action='DESELECT'); garment.select_set(True); bpy.ops.object.transform_apply(location=True)
gb = bb(garment); print(f'FELFIT fitted scale={tuple(round(v,3) for v in s)} size x={gb[3]-gb[0]:.2f} up={gb[5]-gb[2]:.2f} d={gb[4]-gb[1]:.2f} at up {gb[2]:.2f}..{gb[5]:.2f}; body band width {bw:.2f} depth {bd:.2f}')
# 4. weights from the body, then the rig
garment.parent = rig
for vg in body.vertex_groups: garment.vertex_groups.new(name=vg.name)
dt = garment.modifiers.new('weights', 'DATA_TRANSFER'); dt.object = body; dt.use_vert_data = True
dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.context.view_layer.objects.active = garment; bpy.ops.object.modifier_apply(modifier='weights')
arm = garment.modifiers.new('Armature', 'ARMATURE'); arm.object = rig
# 5. export: rig + garment only
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o is not garment]: bpy.data.objects.remove(o, do_unlink=True)
for img in bpy.data.images:
    if img.size[0] > 2048: img.scale(2048, 2048)
bpy.ops.object.select_all(action='DESELECT'); garment.select_set(True); rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, use_selection=True, export_skins=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=85)
import os; print(f'FELFIT wrote {out} bytes={os.path.getsize(out)} bones={len(rig.data.bones)} vgroups={len(garment.vertex_groups)}')
