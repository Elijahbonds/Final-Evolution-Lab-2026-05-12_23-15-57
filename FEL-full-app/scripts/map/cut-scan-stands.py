"""Remove the scanned court furniture from the baked Venice court scan (owner 2026-09-05: 'that structure needs to go').

The Luma scan bakes the real court's two hoop stands and a corner umbrella frame into Mesh_0. The game stands its own Meshy
hoops now, so those go. Each cut box (file units, ≈14× in the app) removes only vertices more than 0.05 above the box's
OWN floor (its 3rd-percentile height) — the scan's floor is not flat, and a global threshold tore paint out of the court.

blender -b --python scripts/map/cut-scan-stands.py -- <in.glb> <out.glb>
"""
import bpy, bmesh, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
# The map is mounted with mapRotationY = π/2 (lib/map-data.ts): the court's LENGTH runs along the file's x axis, so the two
# hoop stands sit at file x ≈ ±0.75 on the centre line (|z| small). Boxes are (xlo, xhi, zlo, zhi) in file units, explicit.
BOXES = [
  (0.55, 0.98, -0.22, 0.22),    # stand at one baseline
  (-0.98, -0.55, -0.22, 0.22),  # stand at the other
]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bm = bmesh.new(); bm.from_mesh(ob.data)
world = [(v, ob.matrix_world @ v.co) for v in bm.verts]
kill = set(); report = []
for bi, (xlo, xhi, zlo, zhi) in enumerate(BOXES):
    inside = [(v, w) for v, w in world if xlo <= w.x <= xhi and zlo <= -w.y <= zhi]
    if len(inside) < 20: report.append(f"box{bi}: {len(inside)} verts, skipped"); continue
    zs = sorted(w.z for _, w in inside); floor = zs[max(0, len(zs) * 3 // 100)]
    # FLATTEN, don't delete: the stand's base shares vertices with the court floor, and deleting them opened a hole that
    # showed the scene's clear colour (a navy patch on the key). Pressing them onto the floor removes the structure and
    # keeps the surface closed; its paint stays as a flat ghost the runtime can cover.
    inv = ob.matrix_world.inverted()
    picked = [(v, w) for v, w in inside if w.z - floor > 0.02]
    for v, w in picked:
        w2 = w.copy(); w2.z = floor; v.co = inv @ w2
    report.append(f"box{bi}: {len(inside)} verts, floor {floor:.3f}, flattened {len(picked)}")
bm.to_mesh(ob.data); bm.free()
print("FELCUT " + " | ".join(report))
# ── the painted furniture: the capture kept the IMAGE of a frame where it lost the geometry. Repaint those texels with the
# court's own paint, sampled from clean court faces near the centre circle. Boxes in file units (x, z); both z signs.
PAINT_BOXES = []   # texture repaint parked (2026-09-05 late): the repainted image never reached the screen; the ghost stands are covered by court patches at runtime (veniceBoardwalk.ts)
PAINT_SIGNS = (1,)                           # the loader mirrors glTF z on import: app z = 10.9 - 14·(file z); the south key is file z < 0
SAMPLE_BOX = (0.25, 0.42, -0.1, 0.1)          # plain paint between the centre circle and the sideline
me = ob.data; uv = me.uv_layers.active.data
imgs = []   # the images that feed Base Color and Emission Color — the normal and ORM maps are left alone
for slot in ob.material_slots:
    m = slot.material
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                targets = [l.to_socket.name for o in n.outputs for l in o.links]
                if any(s in ('Base Color', 'Emission Color') for s in targets): imgs.append(n.image)
img = imgs[0] if imgs else None
for img in (imgs if PAINT_BOXES else []):
    W, H = img.size; px = list(img.pixels)
    def in_box(box, w, sign):
        return box[0] <= w.x <= box[1] and box[2] <= sign * -w.y <= box[3]
    # sample colour
    samples = []
    for poly in me.polygons:
        ws = [ob.matrix_world @ me.vertices[i].co for i in poly.vertices]
        if all(in_box(SAMPLE_BOX, w, 1) for w in ws):
            for li in poly.loop_indices:
                u, v = uv[li].uv; x = min(W-1, max(0, int(u * W))); y = min(H-1, max(0, int(v * H))); k = (y * W + x) * 4
                samples.append((px[k], px[k+1], px[k+2]))
    n = len(samples); samples.sort(key=lambda c: 0.3*c[0] + 0.59*c[1] + 0.11*c[2])
    col = list(samples[n // 2]) if n else [0.1, 0.2, 0.4]
    # rasterise the target polygons' UV triangles
    def fill_tri(a, b, c):
        xs = [a[0], b[0], c[0]]; ys = [a[1], b[1], c[1]]
        for y in range(max(0, int(min(ys))), min(H - 1, int(max(ys)) + 1)):
            for x in range(max(0, int(min(xs))), min(W - 1, int(max(xs)) + 1)):
                d = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
                if abs(d) < 1e-9: continue
                l1 = ((b[1]-c[1])*(x-c[0]) + (c[0]-b[0])*(y-c[1])) / d; l2 = ((c[1]-a[1])*(x-c[0]) + (a[0]-c[0])*(y-c[1])) / d; l3 = 1 - l1 - l2
                if l1 >= -0.02 and l2 >= -0.02 and l3 >= -0.02:
                    k = (y * W + x) * 4; px[k] = col[0]; px[k+1] = col[1]; px[k+2] = col[2]
    painted = 0
    for poly in me.polygons:
        ws = [ob.matrix_world @ me.vertices[i].co for i in poly.vertices]
        if any(all(in_box(box, w, s) for w in ws) for box in PAINT_BOXES for s in PAINT_SIGNS):
            pts = [(uv[li].uv[0] * W, uv[li].uv[1] * H) for li in poly.loop_indices]
            for i in range(1, len(pts) - 1): fill_tri(pts[0], pts[i], pts[i+1])
            painted += 1
    if painted == 0: continue
    img.pixels = px
    # a packed image does not go dirty on a pixel write: save the buffer out and reload it so the exporter embeds the repaint
    tmp = os.path.splitext(out)[0] + f'_repaint_{img.name}.png'
    img.filepath_raw = tmp; img.file_format = 'PNG'; img.save()
    img.source = 'FILE'; img.filepath = tmp; img.reload(); img.pack()
    try: os.remove(tmp)
    except OSError: pass
    print(f"FELCUT repainted {painted} faces with court colour {[round(c,2) for c in col]} from {n} sampled texels ({W}x{H})")
if not imgs:
    print("FELCUT no base colour image found — paint step skipped")
print(f"FELCUT {len(ob.data.vertices)} vertices kept (stands flattened)")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_image_format='AUTO')
print(f"FELCUT wrote {out} bytes={os.path.getsize(out)}")
