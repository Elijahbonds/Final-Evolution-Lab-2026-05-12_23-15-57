# jersey.py — job 2 of docs/JERSEY-BUILD-STEPS.md (the basketball and football jerseys), scripted (lane/kit-mac-jobs, 2026-11-18).
#
# The owner (2026-11-13): the new jerseys are made in-house and free, from the MakeHuman garments (CC0), in Blender with MPFB.
# The owner (2026-11-18): "skin tight and not baggy, or more natural, right now it looks poofy." This script does the steps'
# §2-§4 headless and saves a .blend that §5's exporter (fit-outfit.py) turns into the game's GLB:
#
#   §2 the body and the garment . MPFB's human with the kit's macros (dress-kit.py's: age 0.5, muscle 0.6, weight 0.5,
#                                 proportions 0.7, gender 0.9 / 0.1) and its mixamo rig, the garment from the clothes library
#   §3 the cut (basketball) ..... sleeves off with style.cut_sleeves (what the tee's own skin hangs on the arms); each armhole
#                                 loop scaled 1.15 and moved 3 cm down; the neck loop scaled 1.1 and 2 cm down
#      (football) ............... sleeves kept; the body 8 % wider in X and Y; the shoulders 3 cm higher; the hem as above
#      both ..................... Merge by Distance 0.1 mm, Smooth Vertices 0.3 x2
#   §4 the number and name slots  a second UV map `decal`: the chest (20 x 20 cm) projected from the front into the left half,
#                                 the back (25 x 35 cm between the shoulder blades) from the back into the right half, every
#                                 other face scaled to nothing at (0, 0). The FIRST UV map is MPFB's, untouched.
#   (fit) ....................... NEW, the owner's brief: the garment is taken onto the GAME's kit body (the kit GLB) and its
#                                 gap to the skin is compressed: a vertex further than --ease keeps --drape of the extra
#                                 (natural folds, no balloon), nearer than --ease goes out to it; then a light smooth and
#                                 nothing under --min-ease (vertex, edge middle and face centre tested)
#
#   python -I jersey.py -- --sex male --kind basketball --out ~/jerseys/basketball-male.blend
# then (JERSEY-BUILD-STEPS §5):
#   python -I fit-outfit.py -- --sex male --slot tops --item top_basketball --mesh ~/jerseys/basketball-male.blend \
#     --object Kit_tops_top_basketball --no-align --tris 3000 --ease 0.006 --smooth 0 --out ~/jerseys/top_basketball-male.glb
# Runs in Blender 4.2+ with MPFB2 (`blender -b --python ... --`) or the `bpy` module (tested on bpy 5.0.1 + MPFB 2.0.18,
# Linux, headless; the asset packs shirts01 (CC0) from the MakeHuman community site). Output lines start JERSEY.
import bpy, bmesh, importlib, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def flag(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default
SEX = flag('--sex', 'male'); KIND = flag('--kind', 'basketball')
if KIND not in ('basketball', 'football'): raise SystemExit('JERSEY --kind basketball|football')
GARMENT = flag('--garment', {'basketball': 'elvs_crude_t-shirt_male' if SEX == 'male' else 'toigo_basic_tucked_t-shirt', 'football': 'namuhekam_male_polo_shirt'}[KIND])
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
APP = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
KIT = flag('--kit', os.path.join(APP, 'public', 'models', 'candidates', f'fel-kit-{SEX}.glb'))
OUT = flag('--out', f'/tmp/{KIND}-{SEX}.blend')
ITEM = f'top_{KIND}'; NAME = f'Kit_tops_{ITEM}'
EASE = float(flag('--ease', '0.010' if KIND == 'basketball' else '0.014'))   # football: room for the pads read
DRAPE = float(flag('--drape', '0.25'))      # of the gap beyond EASE, how much stays (0 = painted on, 1 = MPFB's own fit)
MIN_EASE = float(flag('--min-ease', '0.005'))
OVER_EASE = float(flag('--over-ease', '0.016'))   # over the short's waistband (its band sits 6-10 mm off the skin)
def log(*a): print('JERSEY', *a)

# ── §2: MPFB's body with the kit's macros, its rig, the garment ─────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
mod = 'bl_ext.user_default.mpfb'
try: importlib.import_module(mod + '.services.humanservice')
except Exception: bpy.ops.preferences.addon_enable(module=mod)   # the bpy module starts with no extensions enabled
HumanService = importlib.import_module(mod + '.services.humanservice').HumanService
TargetService = importlib.import_module(mod + '.services.targetservice').TargetService
LocationService = importlib.import_module(mod + '.services.locationservice').LocationService
DATA = flag('--data', LocationService.get_user_data())
mhclo = os.path.join(DATA, 'clothes', GARMENT, f'{GARMENT}.mhclo')
if not os.path.exists(mhclo): raise SystemExit(f'JERSEY {mhclo} is missing: install the MakeHuman asset pack shirts01 (CC0) into MPFB\'s data')
macro = TargetService.get_default_macro_info_dict()
macro['gender'] = 0.9 if SEX == 'male' else 0.1
macro['age'] = 0.5; macro['muscle'] = 0.6; macro['weight'] = 0.5; macro['proportions'] = 0.7
human = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
rig = HumanService.add_builtin_rig(human, 'mixamo', import_weights=True)
g = HumanService.add_mhclo_asset(mhclo, human, asset_type='Clothes', material_type='MAKESKIN')
if g is None: raise SystemExit(f'JERSEY MPFB could not fit {GARMENT}')
for m in human.modifiers:   # MPFB hides the skin under a garment ('Delete.<garment>' MASK): every measure here wants the whole body (helpers stay hidden)
    if m.type == 'MASK' and m.name.startswith('Delete.'): m.show_viewport = False; m.show_render = False
# the kit body stands in a T-pose (hands at x +-0.90 m) and MPFB's human in its A-pose (+-0.57). MPFB's rest bones already
# point sideways (its t-pose.json, applied as angles, LOWERED the arms), so the pose is read off the SKIN: each arm segment's
# direction is the line between the centroids of the skin weighted to it and to the next bone, on both bodies, and each MPFB
# bone (parent first) turns until its segment points like the kit's. The garment is baked in that pose, so a sleeve meets
# the kit's arm.
from mathutils import Matrix
CHAIN = ('Shoulder', 'Arm', 'ForeArm', 'Hand')
def centroids(obj, names, evaluated):
    me = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh() if evaluated else obj.data
    gi = {vg.index: vg.name.replace('mixamorig:', '') for vg in obj.vertex_groups if vg.name.replace('mixamorig:', '') in names}
    acc = {n: [Vector(), 0.0] for n in names}
    for v in me.vertices:
        for gr in v.groups:
            n = gi.get(gr.group)
            if n and gr.weight > 0.5: acc[n][0] += obj.matrix_world @ v.co; acc[n][1] += 1
    if evaluated: obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return {n: (a / c if c else None) for n, (a, c) in acc.items()}
def seg(C, side, k):   # segment k of an arm: this bone's skin centroid to the next one's (the hand: the forearm to the hand)
    a, b = (CHAIN[k], CHAIN[k + 1]) if k + 1 < len(CHAIN) else (CHAIN[k - 1], CHAIN[k])
    pa, pb_ = C.get(side + a), C.get(side + b)
    return (pb_ - pa).normalized() if pa is not None and pb_ is not None else None
_names = {s_ + b for s_ in ('Left', 'Right') for b in CHAIN}
_before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=KIT)
_kbody = next(o for o in bpy.data.objects if o not in _before and o.type == 'MESH' and o.name.split('.')[0] == 'Body')
KC = centroids(_kbody, _names, False)
for o in [o for o in bpy.data.objects if o not in _before]: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()
_inv = rig.matrix_world.inverted().to_3x3()
for side in ('Left', 'Right'):
    for k, b in enumerate(CHAIN):
        pb = rig.pose.bones.get(f'mixamorig:{side}{b}')
        if pb is None: continue
        HC = centroids(human, _names, True)
        cur, tgt = seg(HC, side, k), seg(KC, side, k)
        if cur is None or tgt is None: continue
        q = (_inv @ cur).normalized().rotation_difference((_inv @ tgt).normalized())
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
        bpy.context.view_layer.update()
bpy.context.view_layer.objects.active = g; g.select_set(True)
for m in list(g.modifiers):   # MPFB's fit as plain geometry, in the T-pose (the armature modifier applies the pose)
    try: bpy.ops.object.modifier_apply(modifier=m.name)
    except Exception as e: log('modifier', m.name, 'not applied', repr(e)[:100]); g.modifiers.remove(m)
g.parent = None; g.matrix_world = g.matrix_world.copy()
uv0 = g.data.uv_layers[0].name if g.data.uv_layers else None
log(f'{GARMENT} on the MPFB {SEX} body: {len(g.data.vertices)} verts, groups {len(g.vertex_groups)}, first UV map {uv0}')

# ── §3: the cut ─────────────────────────────────────────────────────────────────────────────────────────────────────
import style
if KIND == 'basketball':
    log('sleeves off:', style.cut_sleeves(g), 'verts')
bm = bmesh.new(); bm.from_mesh(g.data); bm.transform(g.matrix_world)
def loops():
    bm.edges.ensure_lookup_table(); bnd = {e for e in bm.edges if e.is_boundary}; out = []
    while bnd:
        e = bnd.pop(); loop = {e}; front = [e]
        while front:
            x = front.pop()
            for v in x.verts:
                for y in v.link_edges:
                    if y in bnd: bnd.discard(y); loop.add(y); front.append(y)
        vs = list({v for e in loop for v in e.verts}); c = sum((v.co for v in vs), Vector()) / len(vs)
        out.append((c, vs))
    return out
def classify():
    L = loops(); L.sort(key=lambda t: t[0].z)
    hems = [t for t in L if t[0].z < L[0][0].z + 0.03]   # a polo's hem is split (front and back): every low opening
    rest = [t for t in L if not any(t is h for h in hems)]
    neck = min(rest, key=lambda t: abs(t[0].x) - t[0].z)   # high and in the middle
    arms = [t for t in rest if abs(t[0].x) > 0.08]          # a collar flap or placket is not an armhole
    return (hems[0][0], [v for h in hems for v in h[1]]), neck, arms
hem, neck, arms = classify()
log(f'openings: hem z {hem[0].z:.3f}, neck z {neck[0].z:.3f}, armholes/sleeves {[(round(c.x, 3), round(c.z, 3)) for c, _ in arms]}')
if KIND == 'basketball':
    for c, vs in arms:   # wide armholes: scale 1.15, 3 cm down
        for v in vs: v.co = c + (v.co - c) * 1.15; v.co.z -= 0.03
    c, vs = neck   # the scoop: scale 1.1, 2 cm down
    for v in vs: v.co = c + (v.co - c) * 1.1; v.co.z -= 0.02
else:
    cz = sum(v.co.z for v in bm.verts) / len(bm.verts)
    for v in bm.verts: v.co.x *= 1.08; v.co.y = cz * 0 + v.co.y * 1.08   # 8 % wider (X, Y)
    top = max(v.co.z for v in bm.verts)
    for v in bm.verts:   # the shoulders 3 cm higher, fading out over the top 15 cm (the pads)
        t = max(0.0, 1 - (top - v.co.z) / 0.15); v.co.z += 0.03 * t
# the long hem: 10 cm more. The garment's lowest 30 cm is stretched to 40 cm (a vertex there moves down in proportion to how
# far below the stretch's top it is), so the hem keeps its own edge and fold: extruding the open edge instead hung the polo's
# extension from its folded-up INNER hem layer, inside the shirt, with a crack all round (measured on the female render)
# The stretch runs on the MAIN piece's bottom: the polo's hem band is its own piece overlapping the body's last 3 cm, and anything
# below the main piece's bottom (the band) moves the full 10 cm, so the two stay overlapped
def pieces():
    seen, out = set(), []
    for v in bm.verts:
        if v in seen: continue
        st, comp = [v], []; seen.add(v)
        while st:
            a = st.pop(); comp.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b not in seen: seen.add(b); st.append(b)
        out.append(comp)
    return out
main = max(pieces(), key=len)
z_bottom = min(v.co.z for v in main)
# a separate piece at the very bottom (the polo's hem band, 256 verts overlapping the body's last 3 cm) is dropped: the fit left a
# gap between the two layers that showed the short through it, and a football jersey has no polo band. The main piece's edge is the hem.
band = [p for p in pieces() if p is not main and max(v.co.z for v in p) < z_bottom + 0.06]
for p in band: bmesh.ops.delete(bm, geom=p, context='VERTS')
if band: log(f'hem band dropped: {sum(len(p) for p in band)} verts')
z_top = z_bottom + 0.30
for v in bm.verts:
    if v.co.z < z_top: v.co.z -= 0.10 * min(1.0, (z_top - v.co.z) / 0.30)
n0 = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
for _ in range(2): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.3, use_axis_x=True, use_axis_y=True, use_axis_z=True)
log(f'cut: merge 0.1 mm joined {n0 - len(bm.verts)}; now {len(bm.verts)} verts, hem z {min(v.co.z for v in bm.verts):.3f}')

# ── (fit) onto the GAME's kit body ──────────────────────────────────────────────────────────────────────────────────
# the MPFB body's box as SHAPED (its sex and build are shape keys; the raw vertices are the androgynous base mesh, 1.695 m
# for both sexes) and with its helper geometry masked off: the evaluated mesh
_dg = bpy.context.evaluated_depsgraph_get(); _ev = human.evaluated_get(_dg); _me = _ev.to_mesh()
_pts = [human.matrix_world @ v.co for v in _me.vertices]
_ev.to_mesh_clear()
def core(pts):   # height from the whole body; the centre from the torso only (arms differ by pose, hands by grip)
    lo_z, hi_z = min(p.z for p in pts), max(p.z for p in pts); h = hi_z - lo_z
    t = [p for p in pts if abs(p.x) < 0.15 and lo_z + 0.5 * h < p.z < lo_z + 0.75 * h]
    return lo_z, hi_z, sum(p.x for p in t) / len(t), sum(p.y for p in t) / len(t)
hz0, hz1, hx, hy = core(_pts)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=KIT)
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] == 'Body')
bb = bmesh.new(); bb.from_mesh(body.data); bb.transform(body.matrix_world); bb.normal_update()
kz0, kz1, kx, ky = core([v.co for v in bb.verts])
klo = Vector((0, 0, kz0)); khi = Vector((0, 0, kz1))
human_xspan = max(abs(p.x) for p in _pts)
off = max(abs(kz0 - hz0), abs(kz1 - hz1), abs(kx - hx), abs(ky - hy))
log(f'MPFB body vs the kit body: {off * 100:.1f} cm apart (heights {hz1 - hz0:.3f} / {kz1 - kz0:.3f}, torso centre y {hy:.3f} / {ky:.3f}; MPFB hands at x +-{human_xspan:.2f})')
human_lo = Vector((hx, hy, hz0)); human_hi = Vector((hx, hy, hz1)); klo = Vector((kx, ky, kz0)); khi = Vector((kx, ky, kz1))
if off > 0.01:   # fit-outfit.py's mapping: height to height, centred
    k = (khi.z - klo.z) / (human_hi.z - human_lo.z)
    for v in bm.verts:
        w = v.co; v.co = Vector(((w.x - (human_lo.x + human_hi.x) / 2) * k + (klo.x + khi.x) / 2, (w.y - (human_lo.y + human_hi.y) / 2) * k + (klo.y + khi.y) / 2, (w.z - human_lo.z) * k + klo.z))
bvh = BVHTree.FromBMesh(bb)
# the short's waist on this kit body: below it (and 3 cm above), the jersey stays OVER the short's band (OVER_EASE)
shorts = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] == 'Kit_shorts_shorts_court'), None)
waist_z = max((shorts.matrix_world @ v.co).z for v in shorts.data.vertices) if shorts else klo.z + 0.6 * (khi.z - klo.z)
def ease_at(z):
    t = min(1.0, max(0.0, (waist_z + 0.06 - z) / 0.03))   # full OVER_EASE below waist + 3 cm, blended over the 3 cm above
    return EASE + (max(EASE, OVER_EASE) - EASE) * t
opening = {v for e in bm.edges if e.is_boundary for v in e.verts}
for v in bm.verts:
    loc, n, _, d = bvh.find_nearest(v.co)
    if loc is None: continue
    out = v.co - loc; s = out.dot(n); e = ease_at(v.co.z)
    if s < 0 or out.length < 1e-6: v.co = loc + n * e; continue
    want = e + max(0.0, out.length - e) * DRAPE if out.length > e else e
    v.co = loc + out.normalized() * want
for _ in range(2): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v not in opening], factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
def clear_skin(passes=6):
    moved = set()
    for _ in range(passes):
        push = {}
        def probe(p, verts):
            loc, n, _, d = bvh.find_nearest(p)
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
        for v, (n, d) in push.items(): v.co += n * (d + 0.0005); moved.add(v)
    return len(moved)
pushed = clear_skin()
gap = sorted((lambda loc, n, d: d if (v.co - loc).dot(n) >= 0 else -d)(*bvh.find_nearest(v.co)[:2], bvh.find_nearest(v.co)[3]) for v in bm.verts)
log(f'fit: ease {EASE * 1000:.0f} mm ({OVER_EASE * 1000:.0f} over the short below z {waist_z + 0.03:.3f}), drape {DRAPE}; {pushed} verts pushed to {MIN_EASE * 1000:.0f} mm; gap p10 {gap[len(gap) // 10] * 1000:.1f} p50 {gap[len(gap) // 2] * 1000:.1f} p90 {gap[9 * len(gap) // 10] * 1000:.1f} mm')

# ── §4: the decal UV map ────────────────────────────────────────────────────────────────────────────────────────────
neck_z = min(v.co.z for v in neck[1]) if all(v.is_valid for v in neck[1]) else max(v.co.z for v in bm.verts) - 0.08
dl = bm.loops.layers.uv.new('decal')
chest = (neck_z - 0.25, neck_z - 0.05, 0.10)    # z lo, z hi, half width (20 x 20 cm)
back = (neck_z - 0.40, neck_z - 0.05, 0.125)    # 25 x 35 cm
bm.normal_update(); nchest = nback = 0
for f in bm.faces:
    c = f.calc_center_median(); n = f.normal
    if n.y < -0.3 and chest[0] <= c.z <= chest[1] and abs(c.x) <= chest[2]: box, side = chest, 0   # front is -Y
    elif n.y > 0.3 and back[0] <= c.z <= back[1] and abs(c.x) <= back[2]: box, side = back, 1
    else: box = None
    for l in f.loops:
        if box is None: l[dl].uv = (0.0, 0.0); continue
        u = (l.vert.co.x + box[2]) / (2 * box[2]); u = u if side == 0 else 1 - u   # the back seen from behind
        v_ = (l.vert.co.z - box[0]) / (box[1] - box[0])
        l[dl].uv = (side * 0.5 + 0.5 * min(1, max(0, u)), min(1, max(0, v_)))
    if box is chest: nchest += 1
    elif box is back: nback += 1
log(f'decal map: chest {nchest} faces -> left half, back {nback} faces -> right half (neck at z {neck_z:.3f})')

# ── the object, save ────────────────────────────────────────────────────────────────────────────────────────────────
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
me = bpy.data.meshes.new(NAME); bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
mat = bpy.data.materials.new(f'jersey.{ITEM}'); me.materials.clear(); me.materials.append(mat)
for p in me.polygons: p.material_index = 0
ob = bpy.data.objects.new(NAME, me); bpy.context.scene.collection.objects.link(ob)
if uv0 and me.uv_layers.get(uv0): me.uv_layers.active = me.uv_layers[uv0]; me.uv_layers[uv0].active_render = True
tris = sum(len(p.vertices) - 2 for p in me.polygons)
log(f'{NAME}: {len(me.vertices)} verts, {tris} triangles, UV maps {[u.name for u in me.uv_layers]} (from {GARMENT}, CC0)')
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
log('saved', os.path.abspath(OUT))
