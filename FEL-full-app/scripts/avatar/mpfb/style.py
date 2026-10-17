# style.py — the casual wardrobe's Blender side (owner 2026-10-16: "There needs to be a clothing/ style pass. More casual, like
# the meshy models"; decisions S1-S4 in ~/Claude/outbox/hoops-gameplay/style-pass/DECISIONS-STYLE-2026-10-16.md).
#
# Imported by rival.py after the garments are fitted. Two jobs:
#
#   SHAPE — garments the MakeHuman library does not have, made from the ones it does (S4: modelled here, nothing downloaded).
#     The baggy knee-length short is the fitted cargo pant (cortu_cargo_pants, CC0): its proxy densified, cut just below the
#     knee, and pushed out from each leg's bone axis — nothing at the waistband, the most at the hem — so it hangs wide the
#     way a streetball short does. It keeps the cargo pant's fitted weights, so it bends with the leg like the pant did.
#
#   PRINT — the tees and jerseys get graphics (S2: our own generic designs, no real brands). The garment's own colour map is
#     turned TONAL (its luminance, stretched into the light end) and the print is projected onto it in 3D: a front graphic on
#     the faces that look forward, a number on the ones that look back, bands at a hem or a sleeve, a stripe down the side of a
#     short. Everything is grey on white, because the colour is the material's base colour times this map: a rival's
#     colourway, a dealt fit, or the 3v3 team colour on the top (S3) all tint it, and the print reads through each of them.
#
# Blender is Z-up and the body faces -Y: a front viewer's right is +X, a back viewer's right is -X.
import bpy, bmesh
import numpy as np

def _bone(arm, name):
    b = arm.data.bones.get('mixamorig:' + name) or arm.data.bones.get(name)
    if b is None: raise RuntimeError(f'style: no bone {name}')
    return np.array(arm.matrix_world @ b.head_local), np.array(arm.matrix_world @ b.tail_local)

def _apply_modifier(obj, mtype):
    for m in list(obj.modifiers):
        if m.type == mtype:
            bpy.context.view_layer.objects.active = obj
            try: bpy.ops.object.modifier_apply(modifier=m.name)
            except Exception as e: print('STYLE apply', mtype, 'FAILED', repr(e)[:160])

def densify(obj, levels=1):
    """Apply the proxy's own subdivision (the exporter does not), so a shaped garment has the vertices to hold its shape."""
    sub = [m for m in obj.modifiers if m.type == 'SUBSURF']
    if sub: sub[0].levels = levels; sub[0].render_levels = levels
    else:
        m = obj.modifiers.new('fel_sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    # apply it on the rest shape: the armature modifier stays (it is the skinning)
    arm_mods = [m for m in obj.modifiers if m.type == 'ARMATURE']
    for m in arm_mods: m.show_viewport = False
    _apply_modifier(obj, 'SUBSURF')
    for m in arm_mods: m.show_viewport = True

def cut_below(obj, z):
    """Cut the garment level at height z and drop what is under it (the garment's local space is the body's metres). A plane
    bisect, so the hem is a clean ring; the cut's new vertices take their edge's interpolated weights."""
    bm = bmesh.new(); bm.from_mesh(obj.data)
    n0 = len(bm.verts)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True)
    n1 = len(bm.verts)
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    return n0 - n1

ARM_GROUPS = ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm')

def cut_sleeves(obj, threshold=0.5):
    """The sleeveless jersey: the tee without its sleeves, where a sleeve is what the tee's OWN skinning hangs on the arm bones
    (a vertex more than `threshold` weighted to the upper arms and forearms). The armhole lands on the shoulder joint on any
    body — the armature's rest bones are not this body's, and at A-pose the arm lies against the torso, so no plane or gap finds
    it. It keeps the tee's clean front / back UVs, which the library's only tank (the keyhole tank, a tiled leopard map) lacks."""
    idx = {g.index for g in obj.vertex_groups if g.name.replace('mixamorig:', '') in ARM_GROUPS}
    if not idx: raise RuntimeError('style: the tee carries no arm weights')
    bm = bmesh.new(); bm.from_mesh(obj.data)
    dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if dl is not None and sum(w for g, w in v[dl].items() if g in idx) > threshold]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    return len(kill)

def leg_axes(body, z_hi, z_knee, z_lo):
    """Each leg's centre line, read off the BODY's own surface — the armature's rest bones are the default build's (a woman's
    Spine2 read 1.298 m, the man's, while her tee topped out at 1.351 m), so nothing here trusts them. Per side: (thigh: hi→knee,
    shin: knee→lo), each point the centroid of the skin at that height on that side (the hands, out past 0.25 m, excluded)."""
    co = np.array([v.co for v in body.data.vertices], np.float32)
    def at(sgn, z):
        m = (np.abs(co[:, 2] - z) < 0.02) & (co[:, 0] * sgn > 0.015) & (np.abs(co[:, 0]) < 0.25)
        if not m.any(): raise RuntimeError(f'style: no leg skin at z {z:.3f}')
        return co[m].mean(0)
    return {s: ((at(g, z_hi), at(g, z_knee)), (at(g, z_knee), at(g, z_lo))) for s, g in (('Left', 1.0), ('Right', -1.0))}

def loosen_legs(obj, axes, z_top, z_hem, amount, inner=0.35):
    """Push each vertex out from its leg's centre line (leg_axes): 0 at z_top (the crotch), `amount` metres at z_hem. The side
    between the legs moves only `inner` as far, so the two legs do not cross."""
    thighs = {s: axes[s][0] for s in ('Left', 'Right')}
    shins = {s: axes[s][1] for s in ('Left', 'Right')}
    me = obj.data; moved = 0
    for v in me.vertices:
        p = np.array(v.co)
        if p[2] >= z_top: continue
        side = 'Left' if p[0] >= 0 else 'Right'
        a, b = thighs[side] if p[2] >= thighs[side][1][2] else shins[side]
        d = b - a; t = np.clip(np.dot(p - a, d) / np.dot(d, d), 0, 1)
        axis = a + d * t
        r = p - axis; r[2] = 0.0
        n = np.linalg.norm(r)
        if n < 1e-5: continue
        r /= n
        k = np.clip((z_top - p[2]) / max(1e-4, z_top - z_hem), 0, 1)
        k = k * k * (3 - 2 * k)                      # eased: the hip barely moves, the hem flares
        toward_mid = (r[0] < 0) if side == 'Left' else (r[0] > 0)
        push = amount * k * (inner if toward_mid else 1.0)
        v.co = (p + r * push).tolist(); moved += 1
    me.update()
    return moved

# ── the print ───────────────────────────────────────────────────────────────────────────────────────────────────────────

def _image_np(img):
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    return a

def tonal_from(img, size, lo=0.62):
    """The garment's own map as a light grey: luminance stretched between its 5th and 95th percentiles into [lo, 1]."""
    if img is None: return np.ones((size, size), np.float32)
    src = img.copy(); src.scale(size, size)
    a = _image_np(src)[::-1]; bpy.data.images.remove(src)    # top row first, like the print
    lum =0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    p5, p95 = np.percentile(lum, 5), np.percentile(lum, 95)
    if p95 - p5 < 1e-3: return np.ones((size, size), np.float32)
    s = np.clip((lum - p5) / (p95 - p5), 0, 1)
    return (lo + (1 - lo) * s).astype(np.float32)

def load_decal(path):
    """A print as (grey, alpha) arrays, top row first."""
    img = bpy.data.images.load(path, check_existing=False)
    a = _image_np(img); bpy.data.images.remove(img)
    a = a[::-1]                                   # Blender's pixels run bottom-up
    grey = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return grey.astype(np.float32), a[..., 3].astype(np.float32)

def _sample(decal, u, v):
    g, al = decal; h, w = g.shape
    x = np.clip((u * (w - 1)).astype(int), 0, w - 1); y = np.clip((v * (h - 1)).astype(int), 0, h - 1)
    return g[y, x], al[y, x]

def paint(obj, size, base, layers):
    """Rasterise the garment's triangles in UV space; every texel takes its 3D point and face normal, and each layer darkens
    it where it applies. `base`: the tonal map (size×size, top row = v 1). Returns the image (size×size, top row first)."""
    out = base.copy()
    dg = bpy.context.evaluated_depsgraph_get()
    me = obj.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    co = np.array([v.co for v in me.vertices], np.float32)
    zs = co[:, 2]; xs = co[:, 0]
    ext = {'zmin': float(zs.min()), 'zmax': float(zs.max()), 'xmax': float(np.abs(xs).max())}
    for tri in me.loop_triangles:
        uv = np.array([uvl[l].uv for l in tri.loops], np.float32)
        P = co[list(tri.vertices)]
        n = np.array(tri.normal, np.float32)
        px = uv * size
        x0, y0 = np.floor(px.min(0)).astype(int); x1, y1 = np.ceil(px.max(0)).astype(int)
        x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, size - 1); y1 = min(y1, size - 1)
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = px
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9: continue
        w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
        if not inside.any(): continue
        W = np.stack([w0[inside], w1[inside], w2[inside]], -1)
        pts = W @ P                                   # the texel's 3D point
        tx = gx[inside].astype(int); ty = gy[inside].astype(int)
        row = size - 1 - ty                           # top row first
        val = out[row, tx]
        for L in layers:
            val = _layer(L, pts, n, ext, val)
        out[row, tx] = val
    return out

def _layer(L, pts, n, ext, val):
    k = L['kind']
    if k in ('front', 'back'):
        # which side of the body the point is on, by its depth against the spine (`cy`), not the face normal: MakeHuman garments
        # do not agree on which way their normals face (the toigo tee's point in)
        facing = (pts[:, 1] < L['cy']) if k == 'front' else (pts[:, 1] > L['cy'])
        x0, x1, z0, z1 = L['box']
        u = (pts[:, 0] - x0) / (x1 - x0) if k == 'front' else (x1 - pts[:, 0]) / (x1 - x0)
        if L.get('mirror'): u = 1 - u
        v = (z1 - pts[:, 2]) / (z1 - z0)
        ok = facing & (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
        if not ok.any(): return val
        g, a = _sample(L['decal'], u[ok], v[ok])
        val = val.copy(); val[ok] = val[ok] * (1 - a + a * g)
        return val
    if k == 'hem':                                   # a band just above the garment's lowest edge (a short's leg hem: per leg)
        lo, w, ink = L.get('from', 0.0), L['width'], L['ink']
        m = (pts[:, 2] >= ext['zmin'] + lo) & (pts[:, 2] < ext['zmin'] + lo + w)
        val = val.copy(); val[m] *= ink; return val
    if k == 'waist':                                  # a band under the top edge
        m = pts[:, 2] > ext['zmax'] - L['width']
        val = val.copy(); val[m] *= L['ink']; return val
    if k == 'sleeve':                                 # bands at the sleeve ends (the outermost |x|)
        lo, w = L.get('from', 0.0), L['width']
        ax = np.abs(pts[:, 0])
        m = (ax <= ext['xmax'] - lo) & (ax > ext['xmax'] - lo - w)
        val = val.copy(); val[m] *= L['ink']; return val
    if k == 'side':                                   # a stripe down the outer side (a short, a pant, a jersey's flank)
        outward = np.sign(pts[:, 0]) * n[0]
        m = (outward > L.get('min', 0.55)) & (pts[:, 2] < L.get('zmax', 9)) & (pts[:, 2] > L.get('zmin', -9))
        val = val.copy(); val[m] *= L['ink']; return val
    if k == 'stripe':                                 # a stripe down the outer side of each leg, by its angle round the leg's bone axis
        out = np.zeros(len(pts), bool)
        for side, sgn in (('Left', 1.0), ('Right', -1.0)):
            sel = (pts[:, 0] * sgn) >= 0
            if not sel.any(): continue
            P = pts[sel]
            (a, b), (c, d) = L['axes'][side]          # the thigh, then the shin
            def along(p0, p1, z):
                t = np.clip((z - p0[2]) / (p1[2] - p0[2]), 0, 1)[:, None]
                return p0 + (p1 - p0) * t
            axis = np.where((P[:, 2] >= b[2])[:, None], along(a, b, P[:, 2]), along(c, d, P[:, 2]))
            rx = (P[:, 0] - axis[:, 0]) * sgn; ry = P[:, 1] - axis[:, 1]
            ang = np.abs(np.arctan2(ry, rx))
            hit = (P[:, 2] < L.get('zmax', 9))
            gap = L.get('gap', 0.0)
            hit &= (ang < L['half']) & (ang >= gap)
            out[np.where(sel)[0][hit]] = True
        val = val.copy(); val[out] *= L['ink']; return val
    if k == 'yoke':                                   # a panel across the shoulders, front and back
        m = pts[:, 2] > L['z']
        val = val.copy(); val[m] *= L['ink']; return val
    return val

def set_print(obj, arr, name):
    """Make `arr` (top row first, grey) the garment's colour map: one packed image, wired to every image node that fed the
    base colour (the normal map's node keeps its own)."""
    size = arr.shape[0]
    img = bpy.data.images.new(name, size, size, alpha=False)
    rgba = np.ones((size, size, 4), np.float32)
    g = np.clip(arr[::-1], 0, 1)                      # back to bottom-up
    rgba[..., 0] = g; rgba[..., 1] = g; rgba[..., 2] = g
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    for m in obj.data.materials:
        if not m or not m.use_nodes: continue
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and 'normal' not in (nd.label + nd.name).lower() and 'bump' not in (nd.label + nd.name).lower():
                nd.image = img
    return img
