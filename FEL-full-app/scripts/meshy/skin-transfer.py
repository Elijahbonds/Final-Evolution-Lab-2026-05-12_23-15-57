"""skin-transfer.py — give one of the owner's Meshy characters the app's skeleton, at the glTF level.

    blender -b --python scripts/meshy/skin-transfer.py -- <meshy.glb> <donor.glb> <out.glb> [height_m] [tex_px]

(Run through Blender only to borrow its bundled numpy — nothing here touches the Blender API.)

WHY NOT BLENDER'S EXPORTER. `rig-to-roster.py` does the same job with Blender's own tools and gets everything right up
to the last step: 22 vertex groups on the 22 deform bones, the mesh parented to the armature with an enabled ARMATURE
modifier. Blender 5.1.2 then writes JOINTS_0 and WEIGHTS_0 with NO `skins` array, which loads as an unrigged body.
A straight import-and-re-export of the same donor keeps its skin, so the exporter is not broken in general — it will
not emit a skin for a binding built this way. Rather than keep guessing at it, this writes the glTF itself.

HOW IT WORKS. `public/models/elijah-meshy.glb` is rigged to the app's 22 joints AND rests in a T-pose — the same pose
every Meshy character exports in — so weights can be carried across by proximity with no retargeting at all:

  1. read the donor's node tree, skin, inverse bind matrices, and its skinned vertices with their joints and weights
  2. read the target's geometry, its material and its texture
  3. scale the target to the donor's height, centre it and stand it on the same floor
  4. for every target vertex take the nearest donor vertices and blend their joint weights (k-nearest, distance
     weighted, so a seam between two body parts does not snap to one bone)
  5. write a new GLB: the donor's bones and skin, the target's geometry and skin, the target's material

The result has the same bone names in the same hierarchy, so every clip in the game plays on it unchanged.

WHAT IT DOES NOT DO: fingers, faces, or cloth. A loose jacket weighted this way will stretch at the shoulder under a
big swing. Judge it in the game.
"""
import sys, os, json, struct
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
src, donor_path, dst = argv[0], argv[1], argv[2]
height = float(argv[3]) if len(argv) > 3 else 0.0      # 0 = match the donor exactly
K = 4

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
NP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}


def load(path):
    with open(path, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, f'{path} is not a GLB'
        js = bin_ = None
        while f.tell() < total:
            ln, kind = struct.unpack('<II', f.read(8))
            data = f.read(ln)
            if kind == 0x4E4F534A:
                js = json.loads(data)
            elif kind == 0x004E4942:
                bin_ = data
    return js, (bin_ or b'')


def read_accessor(g, bin_, idx):
    a = g['accessors'][idx]
    n = NUM[a['type']]
    dtype = NP[a['componentType']]
    count = a['count']
    if 'bufferView' not in a:
        return np.zeros((count, n), dtype=dtype)
    bv = g['bufferViews'][a['bufferView']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or n * COMP[a['componentType']][1]
    packed = n * COMP[a['componentType']][1]
    if stride == packed:
        arr = np.frombuffer(bin_, dtype=dtype, count=count * n, offset=base).reshape(count, n)
    else:
        raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * count, offset=base).reshape(count, stride)
        arr = raw[:, :packed].copy().view(dtype).reshape(count, n)
    return arr.astype(np.float32) if a['componentType'] == 5126 else arr


def prim_of(g, mesh_i):
    return g['meshes'][mesh_i]['primitives'][0]


# ── the donor: bones, skin, and skinned vertices ──────────────────────────────
dg, dbin = load(donor_path)
skin = dg['skins'][0]
joints = skin['joints']
# the donor's skinned mesh is the one with JOINTS_0 and the most vertices (its scene may hold props too)
best = None
for i, m in enumerate(dg['meshes']):
    p = m['primitives'][0]
    if 'JOINTS_0' not in p['attributes']:
        continue
    c = dg['accessors'][p['attributes']['POSITION']]['count']
    if best is None or c > best[1]:
        best = (i, c)
assert best, 'the donor has no skinned mesh'
dp = prim_of(dg, best[0])
d_pos = read_accessor(dg, dbin, dp['attributes']['POSITION']).astype(np.float64)
d_joint = read_accessor(dg, dbin, dp['attributes']['JOINTS_0']).astype(np.int32)
d_weight = read_accessor(dg, dbin, dp['attributes']['WEIGHTS_0']).astype(np.float64)
if d_weight.dtype != np.float64 or d_weight.max() > 1.5:      # normalised integer weights
    d_weight = d_weight / float(np.iinfo(np.uint16).max if d_weight.max() > 255 else 255)
print(f'DONOR {os.path.basename(donor_path)}: {len(joints)} joints, {len(d_pos)} skinned verts')

# ── the target: geometry, material, texture ───────────────────────────────────
tg, tbin = load(src)
tp = prim_of(tg, 0)
t_pos = read_accessor(tg, tbin, tp['attributes']['POSITION']).astype(np.float64)
t_nrm = read_accessor(tg, tbin, tp['attributes']['NORMAL']).astype(np.float32) if 'NORMAL' in tp['attributes'] else None
t_uv = read_accessor(tg, tbin, tp['attributes']['TEXCOORD_0']).astype(np.float32) if 'TEXCOORD_0' in tp['attributes'] else None
t_idx = read_accessor(tg, tbin, tp['indices']).astype(np.uint32).reshape(-1) if 'indices' in tp else None
print(f'TARGET {os.path.basename(src)}: {len(t_pos)} verts, {0 if t_idx is None else len(t_idx)} indices')

# ── ONE BALL ON THE COURT ─────────────────────────────────────────────────────
# Owner, 2026-09-19: "make sure only one character has the ball". Meshy sculpts its athletes holding one — ember's
# floats beside her hip mid-dribble, titan palms his — and the export welds it into the SAME single mesh as the body,
# so every copy of that athlete walked on court with a second ball the game knew nothing about. The game owns exactly
# one ball (anim/ballRig), so the sculpted one comes off here, before the skin transfer.
#
# IT IS FOUND BY ITS NORMALS, NOT BY ITS EDGES. A first pass looked for a loose island and was wrong twice over: it
# missed titan's, whose surface is welded to his fingers, and it matched a crumpled shell inside his shirt, which is
# nothing and is invisible. Every vertex of a sphere, wherever its edges run, points at one centre: step back along
# the normal by the radius and a ball's thousands of vertices land on the same spot, while a head, a shoulder or a
# balled-up shirt scatter. So: vote for a centre, demand the winner be a true shell (every vertex at one radius, and
# covering the whole sphere, not a cap), then delete the vertices on it.
if t_idx is not None and t_nrm is not None:
    _span = t_pos[:, 1].max() - t_pos[:, 1].min()
    _unit = _span / (height if height > 0 else 1.8)          # source units per metre, so the sizes below are real
    _n = t_nrm[:, :3].astype(np.float64)
    _n /= np.maximum(1e-9, np.linalg.norm(_n, axis=1))[:, None]
    _best = None                                             # (tightness, shell mask, centre, radius)
    for _rm in (0.11, 0.12, 0.13, 0.14, 0.15, 0.16):         # a basketball is 0.12 m in radius; sculpts run large
        _R = _rm * _unit
        for _sgn in (-1.0, 1.0):                             # whichever way this export points its normals
            for _cm in (0.02, 0.03):
                _c = t_pos + _sgn * _n * _R
                _cell = _cm * _unit
                _uk, _inv2, _cnt = np.unique(np.floor(_c / _cell).astype(np.int64), axis=0,
                                             return_inverse=True, return_counts=True)
                _w = int(np.argmax(_cnt))
                if _cnt[_w] < 150: continue
                _ctr = _c[_inv2 == _w].mean(axis=0); _rad = _R
                for _ in range(2):                           # settle the centre and radius on what they caught
                    _d = np.linalg.norm(t_pos - _ctr, axis=1)
                    _on = np.abs(_d - _rad) < 0.08 * _rad
                    if _on.sum() < 200: break
                    _P = t_pos[_on]
                    _A = np.c_[_P, np.ones(len(_P))]
                    _sol = np.linalg.lstsq(_A, (_P ** 2).sum(axis=1), rcond=None)[0]
                    _ctr = _sol[:3] / 2.0
                    _rad = float(np.sqrt(max(1e-9, _sol[3] + _ctr.dot(_ctr))))
                _d = np.linalg.norm(t_pos - _ctr, axis=1)
                _on = np.abs(_d - _rad) < 0.08 * _rad
                if _on.sum() < 600: continue
                if not (0.10 * _unit < _rad < 0.17 * _unit): continue
                if _ctr[1] > t_pos[:, 1].min() + 0.82 * _span: continue   # up there it is a head, not a ball
                _rr = _d[_on]
                _tight = float(_rr.std() / _rr.mean())
                if _tight > 0.035: continue                  # ONE radius — a shoulder or a bun is looser than this
                _dir = (t_pos[_on] - _ctr) / np.maximum(1e-9, _rr)[:, None]
                if float(_dir.mean(axis=0).dot(_dir.mean(axis=0))) > 0.12: continue   # all the way round, not a cap
                if _best is None or _tight < _best[0]: _best = (_tight, _on, _ctr, _rad)
    if _best is not None:
        _tight, _on, _ctr, _rad = _best
        print(f'BALL OFF: {int(_on.sum())} verts on a {_rad / _unit * 2:.2f} m ball at '
              f'{np.round(_ctr / _unit, 3)} m (radius holds to {_tight * 100:.1f}%)')
        # AND THE CRUMBS. The shell test takes the sphere; a sculpted ball also has flattened bits — the squashed
        # contact patch, an inner lining — that sit off the radius and would be left hanging in the air where the
        # ball was (ember kept a 128-vertex disc). Anything small that lies wholly inside the ball's own volume is
        # part of it, so it goes too. The body is far too big to be caught by this.
        _kill = _on.copy()
        _, _iv = np.unique(np.round(t_pos, 5), axis=0, return_inverse=True)
        _par = np.arange(_iv.max() + 1)
        def _find(x):
            while _par[x] != x:
                _par[x] = _par[_par[x]]; x = _par[x]
            return x
        for _a, _b, _c2 in _iv[t_idx].reshape(-1, 3):
            _ra, _rb, _rc = _find(_a), _find(_b), _find(_c2)
            if _ra != _rb: _par[_rb] = _ra
            if _ra != _rc: _par[_rc] = _ra
        _isl = np.array([_find(i) for i in range(len(_par))])[_iv]
        _near = np.linalg.norm(t_pos - _ctr, axis=1) < 1.35 * _rad
        for _u in np.unique(_isl[_on]):
            _m = _isl == _u
            if _m.sum() < 4000 and _near[_m].all(): _kill |= _m
        if _kill.sum() > _on.sum():
            print(f'  + {int(_kill.sum() - _on.sum())} crumbs inside the ball')
        _on = _kill
        _keep = ~_on
        _remap = np.full(len(t_pos), -1, dtype=np.int64); _remap[_keep] = np.arange(int(_keep.sum()))
        _tri = t_idx.reshape(-1, 3); _tri = _tri[_keep[_tri].all(axis=1)]
        t_idx = _remap[_tri].reshape(-1).astype(np.uint32)
        t_pos = t_pos[_keep]; t_nrm = t_nrm[_keep]
        if t_uv is not None: t_uv = t_uv[_keep]
        print(f'TARGET now {len(t_pos)} verts, {len(t_idx)} indices')

# ── stand the target where the donor stands ───────────────────────────────────
d_lo, d_hi = d_pos.min(axis=0), d_pos.max(axis=0)
t_lo, t_hi = t_pos.min(axis=0), t_pos.max(axis=0)
want = height if height > 0 else (d_hi[1] - d_lo[1])
k = want / max(1e-6, (t_hi[1] - t_lo[1]))
t_pos *= k
t_lo, t_hi = t_pos.min(axis=0), t_pos.max(axis=0)
t_pos[:, 0] += (d_lo[0] + d_hi[0]) / 2 - (t_lo[0] + t_hi[0]) / 2
t_pos[:, 2] += (d_lo[2] + d_hi[2]) / 2 - (t_lo[2] + t_hi[2]) / 2
t_pos[:, 1] += d_lo[1] - t_lo[1]
print(f'FIT scaled x{k:.3f} to {want:.2f} m, feet on the donor floor')

# ── k-nearest weight transfer, on a grid so it is not 10^9 comparisons ────────
cell = max(0.02, (d_hi - d_lo).max() / 64)
keys = np.floor(d_pos / cell).astype(np.int64)
buckets = {}
for i, kx in enumerate(map(tuple, keys)):
    buckets.setdefault(kx, []).append(i)

out_j = np.zeros((len(t_pos), 4), dtype=np.uint16)
out_w = np.zeros((len(t_pos), 4), dtype=np.float32)
NEIGH = [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)]
far = 0
for i, p in enumerate(t_pos):
    home = tuple(np.floor(p / cell).astype(np.int64))
    cand = []
    r = 0
    while not cand and r < 6:
        if r == 0:
            cand = [j for d in NEIGH for j in buckets.get((home[0] + d[0], home[1] + d[1], home[2] + d[2]), ())]
        else:
            rng = range(-1 - r, 2 + r)
            cand = [j for a in rng for b in rng for c in rng
                    for j in buckets.get((home[0] + a, home[1] + b, home[2] + c), ())]
        r += 1
    if not cand:
        far += 1
        cand = list(range(0, len(d_pos), max(1, len(d_pos) // 2000)))
    cand = np.array(cand)
    d2 = ((d_pos[cand] - p) ** 2).sum(axis=1)
    near = cand[np.argsort(d2)[:K]]
    w = 1.0 / np.maximum(1e-6, np.sqrt(((d_pos[near] - p) ** 2).sum(axis=1)))
    acc = {}
    for src_i, sw in zip(near, w):
        for jj, jw in zip(d_joint[src_i], d_weight[src_i]):
            if jw > 0:
                acc[int(jj)] = acc.get(int(jj), 0.0) + float(jw) * float(sw)
    top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
    tot = sum(v for _, v in top) or 1.0
    for s, (jj, jw) in enumerate(top):
        out_j[i, s] = jj
        out_w[i, s] = jw / tot
print(f'TRANSFERRED weights for {len(t_pos)} verts ({far} needed a widened search)')

# ── write the GLB: donor bones + skin, target geometry + material ─────────────
buf = bytearray()
views, accs = [], []


def put(arr, target=None):
    global buf
    while len(buf) % 4:
        buf.append(0)
    off = len(buf)
    data = arr.tobytes()
    buf.extend(data)
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target:
        bv['target'] = target
    views.append(bv)
    return len(views) - 1


def accessor(arr, comp, kind, target=None, minmax=False):
    bv = put(arr, target)
    a = {'bufferView': bv, 'componentType': comp, 'count': int(arr.shape[0]), 'type': kind}
    if minmax:
        a['min'] = [float(v) for v in arr.min(axis=0)]
        a['max'] = [float(v) for v in arr.max(axis=0)]
    accs.append(a)
    return len(accs) - 1


a_pos = accessor(t_pos.astype(np.float32), 5126, 'VEC3', 34962, minmax=True)
a_nrm = accessor(t_nrm, 5126, 'VEC3', 34962) if t_nrm is not None else None
a_uv = accessor(t_uv, 5126, 'VEC2', 34962) if t_uv is not None else None
# THE SHIPPED-AVATAR SPEC (scripts/avatar-pipeline-tests.ts) takes skins in one of two forms. Without
# KHR_mesh_quantization it demands float32 joints — which the glTF spec itself forbids, and which exists here only
# because byte skins once failed to render. The quantized form is the one the hero already ships in and Babylon reads
# natively: integer joints and NORMALISED integer weights. That is what this writes.
a_j = accessor(out_j, 5123, 'VEC4', 34962)
w_q = np.clip(np.rint(out_w * 65535.0), 0, 65535).astype(np.uint16)
row = w_q.sum(axis=1, dtype=np.int64)                      # the spec also checks each vertex sums to 1
w_q[np.arange(len(w_q)), w_q.argmax(axis=1)] += (65535 - row).astype(np.uint16)
a_w = accessor(w_q, 5123, 'VEC4', 34962)
accs[a_w]['normalized'] = True
a_i = accessor(t_idx.astype(np.uint32).reshape(-1, 1), 5125, 'SCALAR', 34963) if t_idx is not None else None
ibm = read_accessor(dg, dbin, skin['inverseBindMatrices']).astype(np.float32)
a_ibm = accessor(ibm, 5126, 'MAT4')

# the donor's nodes, minus any mesh they carried; one new node holds our mesh
nodes = []
for n in dg['nodes']:
    m = {kk: vv for kk, vv in n.items() if kk not in ('mesh', 'skin')}
    nodes.append(m)
mesh_node = len(nodes)
nodes.append({'name': 'Body', 'mesh': 0, 'skin': 0})

roots = set(range(len(dg['nodes']))) - {c for n in dg['nodes'] for c in n.get('children', [])}
scene_nodes = sorted(roots) + [mesh_node]

attrs = {'POSITION': a_pos, 'JOINTS_0': a_j, 'WEIGHTS_0': a_w}
if a_nrm is not None:
    attrs['NORMAL'] = a_nrm
if a_uv is not None:
    attrs['TEXCOORD_0'] = a_uv
prim = {'attributes': attrs, 'mode': 4}
if a_i is not None:
    prim['indices'] = a_i

out = {
    'asset': {'version': '2.0', 'generator': 'FEL skin-transfer'},
    'extensionsUsed': ['KHR_mesh_quantization'],
    'extensionsRequired': ['KHR_mesh_quantization'],
    'scene': 0,
    'scenes': [{'nodes': scene_nodes}],
    'nodes': nodes,
    'meshes': [{'name': 'Body', 'primitives': [prim]}],
    'skins': [{'joints': joints, 'inverseBindMatrices': a_ibm, **({'skeleton': skin['skeleton']} if 'skeleton' in skin else {})}],
    'accessors': accs,
    'bufferViews': views,
}

# carry the target's material and its texture across
if 'material' in tp and tg.get('materials'):
    mat = json.loads(json.dumps(tg['materials'][tp['material']]))
    imgs, samplers, texes = [], tg.get('samplers', []), []
    for t in tg.get('textures', []):
        texes.append(dict(t))
    for im in tg.get('images', []):
        if 'bufferView' in im:
            bv = tg['bufferViews'][im['bufferView']]
            blob = tbin[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
            while len(buf) % 4:
                buf.append(0)
            off = len(buf)
            buf.extend(blob)
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)})
            imgs.append({'bufferView': len(views) - 1, 'mimeType': im.get('mimeType', 'image/png')})
        else:
            imgs.append(dict(im))
    if imgs:
        out['images'] = imgs
    if texes:
        out['textures'] = texes
    if samplers:
        out['samplers'] = samplers
    out['materials'] = [mat]
    prim['material'] = 0

out['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(out, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
while len(buf) % 4:
    buf.append(0)
with open(dst, 'wb') as f:
    total = 12 + 8 + len(js) + 8 + len(buf)
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A))
    f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942))
    f.write(bytes(buf))
print(f'WROTE {os.path.basename(dst)} verts={len(t_pos)} joints={len(joints)} bytes={os.path.getsize(dst)}')
