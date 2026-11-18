# render.py — a garment on its kit body at rest, front / side / back, as one JPG (lane/kit-mac-jobs, 2026-11-18).
# Cycles on the CPU, so it runs headless with no GPU. The body is skin-coloured, each shown garment flat grey-blue, so the
# silhouette (baggy or fitted) is what reads.
#   python -I render.py -- <kit.glb> --show Kit_shorts_shorts_court,Kit_tops_top_lab [--swap <garment.blend|glb>] --out x.jpg
#   --swap: meshes in that file replace the kit's meshes of the same name (a .blend from onepiece-shorts.py / jersey.py, or a
#   fit-outfit.py GLB). --crop shorts|tops|full frames the camera.
import bpy, math, os, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
def flag(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
KIT = argv[0]; SHOW = [s for s in flag('--show', '').split(',') if s]; OUT = flag('--out', '/tmp/render.jpg')
CROP = flag('--crop', 'full'); RES = int(flag('--res', '360')); LABEL = flag('--label', '')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=KIT)
swap = {}
if flag('--swap'):
    for path in flag('--swap').split(','):
        before = set(bpy.data.objects)
        if path.endswith('.blend'):
            with bpy.data.libraries.load(path) as (src, dst): dst.objects = list(src.objects)
            for o in dst.objects:
                if o: bpy.context.scene.collection.objects.link(o)
        else: bpy.ops.import_scene.gltf(filepath=path)
        for o in bpy.data.objects:
            if o not in before and o.type == 'MESH': swap[o.name.split('.')[0]] = o
            elif o not in before: o.hide_render = True
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    base = o.name.split('.')[0]
    if base == 'Body' and o not in swap.values(): o.hide_render = False; continue
    keep = base in SHOW and ((o in swap.values()) or base not in swap)
    o.hide_render = not keep
def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.7
    return m
skin, cloth, cloth2 = mat('skin', (0.62, 0.42, 0.32)), mat('cloth', (0.16, 0.24, 0.45)), mat('cloth2', (0.55, 0.12, 0.12))
for o in bpy.data.objects:
    if o.type != 'MESH' or o.hide_render: continue
    o.data.materials.clear()
    base = o.name.split('.')[0]
    o.data.materials.append(skin if base == 'Body' else (cloth2 if base.startswith('Kit_shorts') else cloth))
    o.active_material = o.data.materials[0]
    for p in o.data.polygons: p.material_index = 0
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(flag('--samples', '12')); sc.cycles.use_denoising = False
sc.render.resolution_x = RES; sc.render.resolution_y = int(RES * 1.25); sc.render.film_transparent = False
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.85, 0.86, 0.88, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.0; sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(30))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
zc, span = {'shorts': (0.80, 0.62), 'tops': (1.18, 0.85), 'full': (0.95, 1.9)}[CROP]
if 'female' in os.path.basename(KIT): zc -= 0.07
cam.data.ortho_scale = span
frames = []
for i, (name, yaw) in enumerate((('front', 0), ('side', 90), ('back', 180))):
    a = math.radians(yaw)
    cam.location = Vector((3 * math.sin(a), -3 * math.cos(a), zc)); cam.rotation_euler = (math.radians(90), 0, a)
    sun.rotation_euler = (math.radians(55), 0, a + math.radians(35))
    path = OUT.replace('.jpg', f'.{name}.jpg'); sc.render.filepath = path
    bpy.ops.render.render(write_still=True); frames.append(path)
# stitch the three into one JPG
imgs = [bpy.data.images.load(p) for p in frames]
W, H = imgs[0].size; out = bpy.data.images.new('sheet', W * 3, H)
px = [0.0] * (W * 3 * H * 4)
for k, im in enumerate(imgs):
    src = list(im.pixels)
    for y in range(H):
        row = src[y * W * 4:(y + 1) * W * 4]; o = (y * W * 3 + k * W) * 4; px[o:o + W * 4] = row
out.pixels = px; out.filepath_raw = OUT; out.file_format = 'JPEG'; out.save()
for p in frames: os.remove(p)
print('RENDER wrote', OUT, LABEL)
