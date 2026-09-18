"""Group a Meshy pack's loose fragments into objects by bbox proximity (union-find) and report them.

blender -b <pack-parts.blend> --python scripts/meshy/cluster.py -- [gap_m=0.012]
The .blend is a pack glb after Edit > Separate > By Loose Parts (see docs/MESHY-ASSETS-2026-09-05.md). Each cluster row gives
centre and size (x, up, depth) to hand to fit-garment.py.
"""
import bpy, sys
gap = float(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0.012
parts = [o for o in bpy.data.objects if o.type == 'MESH']
def bb(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return (min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs), max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))
boxes = [bb(o) for o in parts]
par = list(range(len(parts)))
def find(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
def near(a, b):
    return all(a[k] - gap <= b[k+3] and b[k] - gap <= a[k+3] for k in range(3))
for i in range(len(parts)):
    for j in range(i+1, len(parts)):
        if near(boxes[i], boxes[j]):
            ri, rj = find(i), find(j)
            if ri != rj: par[ri] = rj
groups = {}
for i in range(len(parts)): groups.setdefault(find(i), []).append(i)
rows = []
for g, idx in groups.items():
    b = [min(boxes[i][k] for i in idx) for k in range(3)] + [max(boxes[i][k] for i in idx) for k in range(3, 6)]
    verts = sum(len(parts[i].data.vertices) for i in idx)
    rows.append((verts, len(idx), b))
rows.sort(key=lambda r: -r[0])
name = bpy.path.basename(bpy.data.filepath)
for verts, n, b in rows[:16]:
    # Blender: x right, y depth(-gltf z), z up
    print(f"FELCL {name} verts={verts} frags={n} size x={b[3]-b[0]:.2f} up={b[5]-b[2]:.2f} d={b[4]-b[1]:.2f} centre x={(b[0]+b[3])/2:.2f} up={(b[2]+b[5])/2:.2f} d={(b[1]+b[4])/2:.2f}")
print(f"FELCL {name} clusters={len(rows)} gap={gap}")
