# onepiece-shorts.py — job 1 of docs/SHORTS-BUILD-STEPS.md (the one-piece short), scripted (lane/kit-mac-jobs, 2026-11-18).
#
# The owner (2026-11-18): "make the clothes appear to be skin tight and not baggy, or more natural, right now it looks poofy."
# Today's court short is three pieces: a waistband ring (5 rows x 24) and two leg tubes (7 rows x 14) that each reach about
# 10 cm past the middle into the other leg (measured on fel-kit-male.glb: x -0.099..0.199 and -0.196..0.099). This script
# does every step of SHORTS-BUILD-STEPS §2 on THAT mesh, read from the game's own kit file, and saves a .blend that §3's
# exporter (fit-outfit.py) turns into the game's GLB:
#
#   §2.1 cut the overlap ........ each tube's rows are clipped at x = 0 (the left leg is +X), a bisect, not a box select
#   §2.2 join the legs .......... above the gusset the two cut halves are welded at the front and back centre seams; below it
#                                 each leg's inner open edge is bridged closed (its inseam wall); the gusset is the bridge
#                                 between the two legs' inner edges, `--gusset-cuts` points (the steps' "Number of Cuts 2"),
#                                 hung `--gusset-drop` (default 2.5 cm, the steps' 2-3 cm) below the body's measured crotch
#   §2.3 join the band .......... the band's rows and the seat's rows are one loft, and Merge by Distance (0.5 mm) runs on
#                                 the whole piece; the non-manifold check must find exactly three openings (waist, two legs)
#   (fit) ....................... NEW, the owner's brief: each row is fitted to the body by rays from the row's centre (the
#                                 hips above the gusset, each thigh below it), at `--ease` off the skin (the hem `--hem-ease`)
#   §2.4 smooth ................. Smooth Vertices factor 0.3, 3 repeats, the waist and leg opening loops left out; then any
#                                 vertex the smoothing pulled under `--min-ease` goes back out along the skin's normal
#   §2.5 UVs .................... Smart UV Project, angle 66, island margin 0.02
#
# Resolution: the tubes' 14-vertex rings are too coarse to sit close to a thigh (a 25.7 degree facet sags 2.3 mm into a
# 9 cm thigh), so every row is resampled by arc length (`--half` points a side) and rows are added every `--row` metres.
#
#   python -I onepiece-shorts.py -- --sex male --out ~/shorts/court-male.blend [--kit <fel-kit-*.glb>] [--ease 0.008]
# then (SHORTS-BUILD-STEPS §3):
#   python -I fit-outfit.py -- --sex male --slot shorts --item shorts_court --mesh ~/shorts/court-male.blend \
#     --object Kit_shorts_shorts_court --no-align --tris 2500 --ease 0.004 --smooth 0 --out ~/shorts/shorts_court-male.glb
# Runs in Blender 4.2+ (`blender -b --python ... --`) or the `bpy` module (tested on bpy 5.0.1, Linux, headless).
# Output lines start ONEPIECE.
import bpy, bmesh, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def flag(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default
SEX = flag('--sex', 'male')
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
KIT = flag('--kit', os.path.join(APP, 'public', 'models', 'candidates', f'fel-kit-{SEX}.glb'))
OUT = flag('--out', f'/tmp/court-{SEX}.blend')
SRC = flag('--object', 'Kit_shorts_shorts_court')
EASE = float(flag('--ease', '0.008'))          # thigh and seat, metres off the skin along the row's ray
BAND_EASE = float(flag('--band-ease', '0.006'))  # the waistband rows (an elastic band hugs)
HEM_EASE = float(flag('--hem-ease', '0.012'))  # the hem row: a little flare, so the opening never grips the thigh
MIN_EASE = float(flag('--min-ease', '0.004'))  # after smoothing, nothing nearer the skin than this (along its normal)
DROP = float(flag('--gusset-drop', '0.025'))   # the gusset hangs this far below the body's crotch (steps: 2-3 cm)
CUTS = int(flag('--gusset-cuts', '4'))         # interior points across the gusset (steps: 2 at today's 14-point rings)
HALF = int(flag('--half', '16'))               # points per half ring (front centre to back centre)
ROW = float(flag('--row', '0.015'))            # row spacing, metres
MERGE = 0.0005                                 # steps §2.3: 0.5 mm
START_IN = 0.01                                # before the fit, a leg's cut edge sits 1 cm inside its own half
MID_GAP = 0.0008                               # a leg's inner wall keeps this far off the middle line (the thighs nearly touch)

def log(*a): print('ONEPIECE', *a)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=KIT)
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] == 'Body')
src = bpy.data.objects.get(SRC)
if src is None: raise SystemExit(f'ONEPIECE {KIT}: no {SRC}')
material = src.data.materials[0] if src.data.materials else None

# ── the body, in world space (Blender: Z up, the body faces -Y, its left is +X) ─────────────────────────────────────
bb = bmesh.new(); bb.from_mesh(body.data); bb.transform(body.matrix_world); bb.normal_update()
BV = [v.co.copy() for v in bb.verts]
bvh_all = BVHTree.FromBMesh(bb)
def half_bvh(sign):   # the body's faces on one side of the middle (a thigh, below the crotch)
    hb = bb.copy()
    kill = [f for f in hb.faces if not all(sign * v.co.x > 0.0 for v in f.verts)]
    bmesh.ops.delete(hb, geom=kill, context='FACES')
    return BVHTree.FromBMesh(hb)
bvh_side = {1: half_bvh(1), -1: half_bvh(-1)}
# the crotch: scanning down from the hips, the first height where a front-to-back ray along the middle line finds no body
# (the thighs of the kit bodies nearly touch: 1-7 mm apart from the knee to the crotch, measured on fel-kit-male.glb)
def mid_hits(z):
    return bvh_all.ray_cast(Vector((0.0, -0.6, z)), Vector((0.0, 1.0, 0.0)), 1.2)[0] is not None
z_crotch = None
z = 1.0
while z > 0.45:
    if not mid_hits(z) and not mid_hits(z - 0.004): z_crotch = z + 0.001; break
    z -= 0.002
if z_crotch is None: raise SystemExit('ONEPIECE could not find the crotch')
log(f'body {len(BV)} verts; crotch z {z_crotch:.3f}')

# ── today's short: the band and the two tubes, as rows of ordered rings ─────────────────────────────────────────────
sb = bmesh.new(); sb.from_mesh(src.data); sb.transform(src.matrix_world); sb.verts.ensure_lookup_table()
seen, islands = set(), []
for v in sb.verts:
    if v.index in seen: continue
    st, comp = [v], []; seen.add(v.index)
    while st:
        a = st.pop(); comp.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in seen: seen.add(b.index); st.append(b)
    islands.append(sorted(comp, key=lambda x: x.index))
if len(islands) != 3: raise SystemExit(f'ONEPIECE {SRC} has {len(islands)} pieces; this script expects today\'s three (band + two legs)')
def ring_rows(comp):   # the piece's rows: consecutive runs of vertices (the generator's order) that each close a loop
    N = len(comp)
    for size in range(8, N // 2 + 1):
        if N % size: continue
        chunks = [comp[k:k + size] for k in range(0, N, size)]
        if all(all(sum(1 for e in v.link_edges if e.other_vert(v) in set(c)) >= 2 for v in c) for c in chunks):
            out = []
            for c in chunks:
                pts = [v.co.copy() for v in c]; m = sum(pts, Vector()) / len(pts)
                pts.sort(key=lambda p: math.atan2(p.y - m.y, p.x - m.x))
                out.append((m.z, pts))
            return sorted(out, key=lambda r: r[0])
    raise SystemExit('ONEPIECE could not read the rows of a piece of the short')
rows3 = sorted((ring_rows(c) for c in islands), key=lambda rr: -rr[-1][0])
band_rows = rows3[0]
lrows, rrows = sorted(rows3[1:], key=lambda rr: -sum(p.x for _, r in rr for p in r))
log(f'today: band {len(band_rows)} rows x {len(band_rows[0][1])}, legs {len(lrows)} rows x {len(lrows[0][1])}')

log('rows: band', [round(z, 3) for z, _ in band_rows], 'leg', [round(z, 3) for z, _ in lrows])

# §2.1 CUT THE OVERLAP: clip one closed ring at x = 0, keeping side `sign`; returns the arc front centre → back centre
def clip(ring, sign):
    n = len(ring); arc_runs = []
    inside = [sign * p.x >= 0 for p in ring]
    if all(inside) or not any(inside): raise SystemExit('ONEPIECE a leg row does not cross the middle (not today\'s short?)')
    start = next(i for i in range(n) if inside[i] and not inside[i - 1])
    pts, i = [], start
    a, b = ring[i - 1], ring[i]; t = a.x / (a.x - b.x); pts.append(a.lerp(b, t))
    while inside[i % n]: pts.append(ring[i % n]); i += 1
    a, b = ring[(i - 1) % n], ring[i % n]; t = a.x / (a.x - b.x); pts.append(a.lerp(b, t))
    if pts[0].y > pts[-1].y: pts.reverse()   # front (-Y) first
    for p in (pts[0], pts[-1]): p.x = 0.0
    return pts
def resample(pts, n):   # n points along the polyline by arc length, ends kept
    L = [0.0]
    for a, b in zip(pts, pts[1:]): L.append(L[-1] + (b - a).length)
    out, j = [], 0
    for k in range(n):
        s = L[-1] * k / (n - 1)
        while j < len(L) - 2 and L[j + 1] < s: j += 1
        t = 0 if L[j + 1] == L[j] else (s - L[j]) / (L[j + 1] - L[j])
        out.append(pts[j].lerp(pts[j + 1], t))
    return out
def ring_halves(ring):  # a whole ring (the band) → (left arc, right arc), each front centre → back centre
    return clip(ring, 1), clip([p.copy() for p in ring], -1)
def at_height(rows, z):  # rows of equal-length point lists → the row at height z (linear between the nearest two)
    zs = [r[0] for r in rows]
    if z <= zs[0]: return [p.copy() for p in rows[0][1]]
    if z >= zs[-1]: return [p.copy() for p in rows[-1][1]]
    k = next(i for i in range(len(zs) - 1) if zs[i] <= z <= zs[i + 1]); t = (z - zs[k]) / (zs[k + 1] - zs[k])
    return [a.lerp(b, t) for a, b in zip(rows[k][1], rows[k + 1][1])]

# every source row as (z, left arc, right arc), resampled to HALF + 1 points each
P = HALF + 1
src_rows = []
for (z, lr), (_, rr) in zip(lrows, rrows):
    src_rows.append((z, resample(clip(lr, 1), P), resample(clip(rr, -1), P)))
band_bottom = band_rows[0][0]
src_rows = [r for r in src_rows if r[0] < band_bottom - 0.005]
for z, br in band_rows:
    la, ra = ring_halves(br); src_rows.append((z, resample(la, P), resample(ra, P)))
src_rows.sort(key=lambda r: r[0])
L_rows = [(z, l) for z, l, _ in src_rows]; R_rows = [(z, r) for z, _, r in src_rows]

z_hem, z_waist = src_rows[0][0], src_rows[-1][0]
z_gusset = z_crotch - DROP
if not z_hem + 2 * ROW < z_gusset < band_bottom: raise SystemExit(f'ONEPIECE the gusset {z_gusset:.3f} is outside the short ({z_hem:.3f}..{band_bottom:.3f})')
def heights(lo, hi):
    n = max(1, round((hi - lo) / ROW)); return [lo + (hi - lo) * k / n for k in range(n + 1)]
seat_z = heights(z_gusset, band_bottom)[:-1] + [z for z, _ in band_rows]
leg_z = heights(z_hem, z_gusset)[:-1]   # the gusset row itself is the seat's lowest row
log(f'hem {z_hem:.3f}, gusset {z_gusset:.3f} ({DROP * 100:.1f} cm under the crotch), band {band_bottom:.3f}, waist {z_waist:.3f}; rows: seat {len(seat_z)}, legs {len(leg_z)}')

# ── §2.2 / §2.3 the one piece, as a loft ────────────────────────────────────────────────────────────────────────────
bm = bmesh.new()
def mk(p): return bm.verts.new(p)
seat = []   # each: list of 2*HALF verts: [F, left..., B, right... (B→F)]
for z in seat_z:
    l, r = at_height(L_rows, z), at_height(R_rows, z)
    F = (l[0] + r[0]) / 2; B = (l[-1] + r[-1]) / 2   # the centre seams: the two cut halves weld here
    F.x = B.x = 0.0; F.z = B.z = z
    ring = [F] + [p for p in l[1:-1]] + [B] + [p for p in reversed(r[1:-1])]
    for p in ring: p.z = z
    seat.append([mk(p) for p in ring])
g0 = seat[0]
F0, B0 = g0[0], g0[HALF]
gusset = [mk(B0.co.lerp(F0.co, (k + 1) / (CUTS + 1))) for k in range(CUTS)]   # B → F across the middle
def leg_rings(rows, sign):
    out = []
    for z in leg_z:
        a = at_height(rows, z)
        for p in a: p.z = z
        Fp, Bp = a[0], a[-1]
        inner = [Bp.lerp(Fp, (k + 1) / (CUTS + 1)) for k in range(CUTS)]   # the inseam wall: Bridge Edge Loops B → F
        ring = a + inner
        for p in ring:   # each leg's cut edge starts inside its own half, so the two legs never weld (the fit places it)
            if sign * p.x < START_IN: p.x = sign * START_IN
        out.append([mk(p) for p in ring])
    top = ([g0[0]] + g0[1:HALF] + [g0[HALF]]) if sign > 0 else ([g0[0]] + list(reversed(g0[HALF + 1:])) + [g0[HALF]])
    out.append(top + gusset)
    return out   # hem first
legs = {1: leg_rings(L_rows, 1), -1: leg_rings(R_rows, -1)}
VSIDE = {v: sign for sign, rows in legs.items() for row in rows[:-1] for v in row}   # a leg's own vertices (its top row is the seat's)
def loft(rows):
    for lo, hi in zip(rows, rows[1:]):
        n = len(lo)
        for k in range(n): bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))
loft(seat); loft(legs[1]); loft(legs[-1])
bm.normal_update(); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
n0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=MERGE)
log(f'one piece: {len(bm.verts)} verts, {len(bm.faces)} quads; merge by distance {MERGE * 1000:.1f} mm joined {n0 - len(bm.verts)}')

def openings():
    bm.edges.ensure_lookup_table()
    bnd = {e for e in bm.edges if e.is_boundary}; loops = []
    while bnd:
        e = bnd.pop(); loop = {e}; front = [e]
        while front:
            x = front.pop()
            for v in x.verts:
                for y in v.link_edges:
                    if y in bnd: bnd.discard(y); loop.add(y); front.append(y)
        loops.append(loop)
    bad = [e for e in bm.edges if not e.is_manifold and not e.is_boundary]
    return loops, bad
loops, bad = openings()
zs = sorted(round(sum(v.co.z for e in l for v in e.verts) / (2 * len(l)), 3) for l in loops)
log(f'non-manifold check: {len(loops)} openings at z {zs}, other non-manifold edges {len(bad)}')
if len(loops) != 3 or bad: raise SystemExit('ONEPIECE expected exactly three openings (the waist and two legs) and no other non-manifold edge')
opening = {v for l in loops for e in l for v in e.verts}

# ── the fit: each row onto the body, by rays from the row's centre ──────────────────────────────────────────────────
def slice_centre(z, sign=0):
    pts = [p for p in BV if abs(p.z - z) < 0.012 and abs(p.x) < 0.3 and (sign == 0 or sign * p.x > 0.0)]
    if not pts: return None
    return Vector((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), z))
def fit_row(verts, centre, bvh, ease, side=0):
    rs, hit = [], []
    for v in verts:
        d = Vector((v.co.x - centre.x, v.co.y - centre.y, 0.0))
        if d.length < 1e-6: rs.append(None); hit.append(False); continue
        d.normalize()
        loc, _, _, _ = bvh.ray_cast(centre + d * 0.6, -d, 0.6)
        if loc is None: rs.append(None); hit.append(False); continue
        rs.append((Vector((loc.x - centre.x, loc.y - centre.y, 0.0))).length + ease); hit.append(True)
    n = len(verts); ok = [i for i in range(n) if hit[i]]
    if not ok: return 0
    for i in range(n):   # a ray that finds no body (the gap between the legs) spans its neighbours, as cloth does
        if hit[i]: continue
        a = max((j for j in ok if j < i), default=ok[-1] - n); b = min((j for j in ok if j > i), default=ok[0] + n)
        t = (i - a) / (b - a); rs[i] = rs[a % n] * (1 - t) + rs[b % n] * t
    for v, r in zip(verts, rs):
        d = Vector((v.co.x - centre.x, v.co.y - centre.y, 0.0)); d.normalize()
        if side and side * d.x < 0: r = min(r, (side * centre.x - MID_GAP) / (-side * d.x))   # a leg's inner wall stops short of the middle
        v.co.x, v.co.y = centre.x + d.x * r, centre.y + d.y * r
    return len(ok)
band_z0 = band_rows[0][0]
for k, row in enumerate(seat):
    z = row[0].co.z
    c = slice_centre(z)
    fit_row(row, c, bvh_all, BAND_EASE if z >= band_z0 - 1e-6 else EASE)
for sign, rows in legs.items():
    for k, row in enumerate(rows[:-1]):   # the top row is the seat's
        z = row[0].co.z
        fit_row(row, slice_centre(z, sign), bvh_side[sign], side=sign, ease=HEM_EASE if k == 0 else EASE + (HEM_EASE - EASE) * max(0.0, 1 - k / 2))
for k, g in enumerate(gusset):   # the gusset: straight across between the fitted centre seams, at the gusset's height
    g.co = B0.co.lerp(F0.co, (k + 1) / (CUTS + 1)); g.co.z = z_gusset

# §2.4 SMOOTH: factor 0.3, 3 repeats, the opening loops left out
inner_v = [v for v in bm.verts if v not in opening]
for _ in range(3): bmesh.ops.smooth_vert(bm, verts=inner_v, factor=0.3, use_axis_x=True, use_axis_y=True, use_axis_z=True)
for v, sg in VSIDE.items():
    if sg * v.co.x < MID_GAP: v.co.x = sg * MID_GAP
def clear_skin(passes=6):
    """Nothing under MIN_EASE: a vertex, and the middle of every face and edge (a flat face across a curve cuts the corner
    a vertex test misses), goes back out along the skin's normal. Returns how many vertices moved."""
    moved = set()
    for _ in range(passes):
        push = {}
        def probe(p, verts):
            # a leg's vertex clears against ITS leg only: the thighs are 1-7 mm apart, and the other thigh's normal pushed an inner
            # wall across the middle, where the exporter gave it the other leg's weights (headless: 92 -> 808 torn edges)
            sides = {VSIDE.get(v, 0) for v in verts}
            side = sides.pop() if len(sides) == 1 else 0
            loc, n, _, d = (bvh_side[side] if side else bvh_all).find_nearest(p)
            if loc is None: return
            s = (p - loc).dot(n)
            if s < MIN_EASE:
                for v in verts:
                    acc = push.setdefault(v, [Vector(), 0.0])
                    if MIN_EASE - s > acc[1]: acc[0], acc[1] = n.copy(), MIN_EASE - s
        for v in bm.verts: probe(v.co, (v,))
        for e in bm.edges: probe((e.verts[0].co + e.verts[1].co) / 2, e.verts)
        for f in bm.faces: probe(f.calc_center_median(), f.verts)
        if not push: break
        for v, (n, d) in push.items():
            v.co += n * (d + 0.0005); moved.add(v)
            sg = VSIDE.get(v, 0)
            if sg and sg * v.co.x < MID_GAP: v.co.x = sg * MID_GAP   # never across the middle line
    return len(moved)
pushed = clear_skin()
bm.normal_update()
gap = []
for v in bm.verts:
    loc, n, _, d = bvh_all.find_nearest(v.co); gap.append(d if (v.co - loc).dot(n) >= 0 else -d)
gap.sort()
log(f'fit: ease {EASE * 1000:.0f} mm (band {BAND_EASE * 1000:.0f}, hem {HEM_EASE * 1000:.0f}); {pushed} verts pushed back to {MIN_EASE * 1000:.0f} mm (vertex, edge and face test); '
    f'gap p10 {gap[len(gap) // 10] * 1000:.1f} p50 {gap[len(gap) // 2] * 1000:.1f} p90 {gap[9 * len(gap) // 10] * 1000:.1f} mm')

# ── the object, §2.5 UVs, save ──────────────────────────────────────────────────────────────────────────────────────
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
me = bpy.data.meshes.new(SRC); bm.to_mesh(me); bm.free()
for poly in me.polygons: poly.use_smooth = True   # cloth: smooth normals (the exporter writes what Blender shades)
if material: me.materials.append(material)
ob = bpy.data.objects.new(SRC, me); bpy.context.scene.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')
tris = sum(len(p.vertices) - 2 for p in me.polygons)
log(f'{SRC}: {len(me.vertices)} verts, {tris} triangles, UV maps {[u.name for u in me.uv_layers]}')
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
log('saved', os.path.abspath(OUT))
