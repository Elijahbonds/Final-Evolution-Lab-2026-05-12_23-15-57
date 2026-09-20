"""Cut a Meshy character SHEET into one GLB per person.

blender -b --python /tmp/split-row.py -- <pack.glb> <out-prefix>

Meshy's NPC exports are sheets: Spectator_Male_NPC_1 is five men standing shoulder to shoulder inside ONE mesh with one
material. Skinned whole to a single 22-bone rig, the idle tears the sheet apart — the hand bones end up driving the
neighbour two along. Neither loose parts nor bbox clustering cuts it (the exporter splits every UV seam, so one person
is hundreds of fragments and single-linkage chains straight across the row). What DOES separate people standing in a
line is the gap between them: the vertex histogram along the row has a floor under each person and a valley between.
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, prefix = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
whole = max([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: len(o.data.vertices))
vs = [whole.matrix_world @ v.co for v in whole.data.vertices]
xs = [v.x for v in vs]; zs = [v.z for v in vs]
lo, hi = min(xs), max(xs); height = max(zs) - min(zs); width = hi - lo
BINS = 80
hist = [0] * BINS
for x in xs: hist[min(BINS - 1, int((x - lo) / max(1e-9, width) * BINS))] += 1
# smooth, so a fold in a jacket is not a gap between two men
sm = [sum(hist[max(0, i - 2):i + 3]) / len(hist[max(0, i - 2):i + 3]) for i in range(BINS)]
peak = max(sm)
minw = max(3, int(BINS * (height * 0.30) / max(1e-9, width)))   # nobody is narrower than a third of their height
cuts = []
i = minw
while i < BINS - minw:
    if sm[i] < peak * 0.55 and sm[i] <= min(sm[i - 2:i + 3]):    # a real trough, not a ripple
        if not cuts or i - cuts[-1] >= minw: cuts.append(i)
        i += minw
    else: i += 1
edges = [0] + cuts + [BINS]
print(f"SPLIT sheet width={width:.2f} height={height:.2f} → {len(edges)-1} people, cuts at {cuts}")
bands = [(lo + a / BINS * width, lo + b / BINS * width) for a, b in zip(edges, edges[1:])]
# every loose fragment goes to the band its centroid falls in
bpy.context.view_layer.objects.active = whole
for o in bpy.data.objects: o.select_set(False)
whole.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
buckets = [[] for _ in bands]
for o in parts:
    pv = [o.matrix_world @ v.co for v in o.data.vertices]
    cx = sum(v.x for v in pv) / max(1, len(pv))
    k = min(range(len(bands)), key=lambda i: 0 if bands[i][0] <= cx <= bands[i][1] else min(abs(cx - bands[i][0]), abs(cx - bands[i][1])))
    buckets[k].append(o)
kept = 0
for k, g in enumerate(buckets):
    n = sum(len(o.data.vertices) for o in g)
    if n < 2000: continue
    pv = [o.matrix_world @ v.co for o in g for v in o.data.vertices]
    cx = (min(v.x for v in pv) + max(v.x for v in pv)) / 2
    cy = (min(v.y for v in pv) + max(v.y for v in pv)) / 2
    for o in g: o.location.x -= cx; o.location.y -= cy        # stand this one on its own origin
    for o in bpy.data.objects: o.select_set(False)
    for o in g: o.select_set(True)
    bpy.context.view_layer.objects.active = g[0]
    # ONE PERSON, ONE MESH. The exporter splits every UV seam, so a band is hundreds of fragments; left that way the
    # skin transfer reads mesh 0 and rigs an 86-vertex scrap of a sleeve.
    if len(g) > 1: bpy.ops.object.join()
    g = [bpy.context.view_layer.objects.active]
    out = f"{prefix}-{kept}.glb"
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, use_selection=True,
                              export_skins=False, export_animations=False)
    h = max(v.z for v in pv) - min(v.z for v in pv)
    w = max(v.x for v in pv) - min(v.x for v in pv)
    print(f"SPLIT {os.path.basename(out)} verts={n} height={h:.2f} width={w:.2f}")
    kept += 1
    for o in g: o.location.x += cx; o.location.y += cy        # put it back so the next band measures true
print(f"SPLIT done {kept} people")
