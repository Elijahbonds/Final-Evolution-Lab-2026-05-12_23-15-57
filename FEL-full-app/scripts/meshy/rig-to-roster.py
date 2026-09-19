"""rig-to-roster.py — put the app's skeleton inside one of the owner's Meshy characters.

    blender -b --python scripts/meshy/rig-to-roster.py -- <meshy.glb> <rigged-ref.glb> <out.glb> <height_m> <decimate> <tex_px>

WHY THIS EXISTS (owner, 2026-09-19: "Use the other meshy models as the other opponents and NPCs instead of the ones
that are there, it'll add more character to the game").

Every character Meshy exports is ONE UNRIGGED MESH IN A T-POSE — skins 0, joints 0 — so none of them can be an
athlete, and they cannot even stand courtside because a T-pose reads as broken. The roster they would replace
(public/models/athletes/*.glb) is the kit body carrying the app's 22-joint skeleton, and every clip in the game
animates those joints BY NAME. So the job is not to import a character: it is to move that skeleton into the new body.

HOW:
  1. import the rigged reference (the kit body) — armature + its mesh
  2. import the Meshy body, scale it to the reference's height, and sit it on the same floor
  3. put the ARMATURE into the Meshy body's pose before binding. The reference binds in an A-pose and Meshy exports a
     T-pose; binding a T-pose mesh to an A-pose skeleton hangs the arms through the ribs. The arm chain is rotated to
     match, the pose is applied as the new rest pose, and the inverse bind matrices that come out of the exporter are
     the ones that match the mesh.
  4. parent with automatic weights, drop the reference mesh, decimate and shrink the textures
  5. export — same bone names, same hierarchy, so every existing clip plays on it

WHAT IT DOES NOT DO: faces, fingers or cloth simulation. Automatic weights on a jacket will stretch at the shoulder
under a big swing. Check the result in the game, not in Blender.

STATUS 2026-09-19: NOT YET WORKING on this machine (Blender 5.1.2). Everything up to the export is correct —

    VGROUPS 22   DEFORM bones 22   parent=Human.rig   mods=['ARMATURE'] (object set, enabled)

— and the exporter still says "Mesh_0 has no skin, skipping adding neutral bone data on it", writing a glTF with
JOINTS_0/WEIGHTS_0 on the mesh and no `skins` array, which loads as an unskinned body. Ruled out, each with a run:
  · the animation flags        — exporting with the defaults changes nothing
  · the order of the decimate  — before or after the bind, same result
  · the rest-pose apply        — skipping `armature_apply` entirely, same result
  · missing operator context   — every op now runs under `temp_override`; they return FINISHED either way
And the tell that something deeper is wrong: `modifier_apply` reports FINISHED while the decimate does not change the
vertex count (60,112 in, 60,112 out), so the ops are reporting success on something that is not this mesh.

NEXT THING TO TRY, in order: build the skin by hand (write JOINTS_0/WEIGHTS_0 and the `skins` array into the glTF
with a script rather than through the exporter), or take Meshy's own auto-rig — the "Vibrant Athlete biped" export
carries a 26-joint rig with walk and run — and retarget the app's clips onto it by bone name.
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, ref, dst = argv[0], argv[1], argv[2]
height = float(argv[3]) if len(argv) > 3 else 1.83
ratio = float(argv[4]) if len(argv) > 4 else 0.25
tex = int(argv[5]) if len(argv) > 5 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)


def imported(before):
    return [o for o in bpy.data.objects if o not in before]


# ── the rigged reference ──────────────────────────────────────────────────────
bpy.ops.import_scene.gltf(filepath=ref)
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
assert arm, 'the reference has no armature'
ref_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
ref_low = min((o.matrix_world @ Vector(c)).z for o in ref_meshes for c in o.bound_box)
ref_high = max((o.matrix_world @ Vector(c)).z for o in ref_meshes for c in o.bound_box)
ref_h = ref_high - ref_low
print(f'REF armature "{arm.name}" bones={len(arm.data.bones)} height={ref_h:.2f}')

# ── the Meshy body ────────────────────────────────────────────────────────────
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=src)
new = [o for o in imported(before) if o.type == 'MESH']
assert new, 'the source has no mesh'
for o in bpy.data.objects:
    o.select_set(o in new)
bpy.context.view_layer.objects.active = new[0]
if len(new) > 1:
    with bpy.context.temp_override(object=new[0], active_object=new[0], selected_objects=new, selected_editable_objects=new):
        bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

lo = min((body.matrix_world @ Vector(c)).z for c in body.bound_box)
hi = max((body.matrix_world @ Vector(c)).z for c in body.bound_box)
k = (height if height > 0 else ref_h) / max(0.01, hi - lo)
body.scale = (k, k, k)
bpy.ops.object.transform_apply(scale=True)
lo = min((body.matrix_world @ Vector(c)).z for c in body.bound_box)
cx = sum((body.matrix_world @ Vector(c)).x for c in body.bound_box) / 8
cy = sum((body.matrix_world @ Vector(c)).y for c in body.bound_box) / 8
body.location = (body.location.x - cx, body.location.y - cy, body.location.z - lo + ref_low)
bpy.ops.object.transform_apply(location=True)
print(f'BODY scaled x{k:.3f} to {height:.2f} m, feet on the reference floor')

# ── the arms: A-pose reference → T-pose mesh ──────────────────────────────────
# The reference rests with its arms down; the Meshy body stands with them straight out. Rotate the arm chain into the
# T before binding, then make that the rest pose, so the weights are solved against the shape the mesh is actually in.
ARM_LIFT = {
    'LeftArm': math.radians(48), 'RightArm': math.radians(-48),
    'LeftForeArm': math.radians(6), 'RightForeArm': math.radians(-6),
}
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm], selected_editable_objects=[arm]):
    bpy.ops.object.mode_set(mode='POSE')
lifted = []
for name, ang in ARM_LIFT.items():
    pb = arm.pose.bones.get(name)
    if not pb:
        continue
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler.rotate_axis('Y', ang)
    lifted.append(name)
with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm], selected_editable_objects=[arm]):
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)   # the T becomes the rest pose; the IBMs follow it out of the exporter
    bpy.ops.object.mode_set(mode='OBJECT')
print(f'ARMS lifted into the T on {lifted or "nothing — bone names not found"}')

# ── budget, BEFORE the bind ───────────────────────────────────────────────────
# Decimating after the bind left the exporter reporting "Mesh_0 has no skin" even with the ARMATURE modifier and all
# 22 vertex groups in place — applying a modifier underneath a fresh armature bind loses it. Thinning first also gives
# the weight solver less to chew on.
if ratio < 1:
    m = body.modifiers.new('dec', 'DECIMATE')
    m.ratio = ratio
    # IN BACKGROUND MODE AN OPERATOR HAS NO CONTEXT TO INHERIT. Called bare, modifier_apply and parent_set below
    # returned CANCELLED in silence: the decimate never ran (60,112 verts in, 60,112 out) and the exporter then
    # reported "Mesh_0 has no skin". Every op here states its own context.
    with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body], selected_editable_objects=[body]):
        bpy.ops.object.modifier_apply(modifier='dec')
for img in bpy.data.images:
    if img.size[0] > tex:
        img.scale(tex, tex)

# ── bind ──────────────────────────────────────────────────────────────────────
for o in bpy.data.objects:
    o.select_set(False)
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[body, arm], selected_editable_objects=[body, arm]):
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
print('BOUND with automatic weights')

# the reference's own mesh goes: the new body replaces it
for o in ref_meshes:
    bpy.data.objects.remove(o, do_unlink=True)

print('VGROUPS', len(body.vertex_groups), 'DEFORM bones', sum(1 for b in arm.data.bones if b.use_deform))
for o in bpy.context.scene.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
# Blender 5.1's exporter wrote JOINTS_0/WEIGHTS_0 with NO `skins` array when animations were switched off — a glTF
# that loads as an unskinned mesh. Leaving the animation defaults alone fixes it; the rest pose is what we want anyway.
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=85)
print(f'RIGGED {os.path.basename(dst)} verts={len(body.data.vertices)} bytes={os.path.getsize(dst)}')
