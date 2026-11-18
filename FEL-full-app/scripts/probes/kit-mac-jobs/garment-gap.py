# garment-gap.py — how far each garment sits off the skin, at rest (lane/kit-mac-jobs, 2026-11-18).
# For every vertex of a Kit_<slot>_* mesh: the signed distance to the body's nearest surface point (+ = outside the skin,
# - = inside), in metres, at the bind pose, in the kit file's own space. Printed as percentiles per region, so a garment's
# fit can be compared before and after (the owner: "skin tight and not baggy").
#   python -I garment-gap.py -- <kit-or-pack.glb> [--body <kit body glb, when the first file is a pack>] [--only <mesh name>]
import bpy, sys
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:]
def flag(n, d=None): return argv[argv.index(n) + 1] if n in argv else d
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
garments = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Kit_') and not o.name.startswith('Kit_shoes')]
if flag('--body'):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=flag('--body'))
    body = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH' and o.name.split('.')[0] == 'Body')
else:
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] == 'Body')
if flag('--only'): garments = [o for o in garments if o.name.split('.')[0] == flag('--only')]
dg = bpy.context.evaluated_depsgraph_get()
def world_bvh(o):
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world); bm.normal_update()
    return bm, BVHTree.FromBMesh(bm)
bbm, bvh = world_bvh(body)
def pct(a, p): return a[min(len(a) - 1, int(p * (len(a) - 1)))] if a else float('nan')
for g in garments:
    gbm, _ = world_bvh(g)
    rows = {}
    for v in gbm.verts:
        loc, n, i, d = bvh.find_nearest(v.co)
        if loc is None: continue
        s = d if (v.co - loc).dot(n) >= 0 else -d
        z = v.co.z
        if g.name.startswith('Kit_shorts'): reg = 'band' if z > 0.86 * (1 if 'female' not in argv[0] else 0.93) else 'legs'
        else: reg = 'body' if abs(v.co.x) < 0.2 else 'arms'
        rows.setdefault(reg, []).append(s); rows.setdefault('all', []).append(s)
    for reg, a in sorted(rows.items()):
        a.sort(); inside = sum(1 for x in a if x < 0)
        print(f'GAP {g.name:28s} {reg:5s} n={len(a):5d} inside={inside:4d} p10={pct(a,.1)*1000:6.1f} p50={pct(a,.5)*1000:6.1f} p90={pct(a,.9)*1000:6.1f} max={a[-1]*1000:6.1f} mm')
