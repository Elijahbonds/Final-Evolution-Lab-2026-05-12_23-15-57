"""skin-float32.py — make a packed body's skin attributes float32 (models pass, 2026-09-22).

    /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/meshy/skin-float32.py -- <in.glb> [<in2.glb> ...]   (in place;
    Blender only for its bundled numpy — nothing here touches the Blender API)

Blender's exporter writes JOINTS_0 as uint8 with float32 weights and no KHR_mesh_quantization; the shipped-avatar gate
(scripts/avatar-pipeline-tests.ts) takes either all-float32 skins or the spec's quantized form, because byte skins once
shipped that never rendered. This upcasts JOINTS_0 (and WEIGHTS_0 if not already float32) to float32 by appending new
buffer views to the BIN chunk — geometry, materials and textures untouched.
"""
import json, struct, sys
import numpy as np
COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read(p):
    b = open(p, 'rb').read(); magic, ver, length = struct.unpack_from('<III', b, 0)
    off = 12; chunks = []
    while off < length:
        clen, ctype = struct.unpack_from('<II', b, off); chunks.append((ctype, b[off + 8: off + 8 + clen])); off += 8 + clen
    j = json.loads(chunks[0][1]); bin_ = bytearray(chunks[1][1]) if len(chunks) > 1 else bytearray()
    return j, bin_
def write(p, j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    while len(bin_) % 4: bin_ += b'\0'
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    open(p, 'wb').write(out)
def accessor_array(j, bin_, ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]; n = NUM[a['type']]; dt = COMP[a['componentType']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0)
    if stride and stride != n * np.dtype(dt).itemsize:
        rows = [np.frombuffer(bin_, dtype=dt, count=n, offset=start + i * stride) for i in range(a['count'])]
        return np.stack(rows)
    return np.frombuffer(bin_, dtype=dt, count=a['count'] * n, offset=start).reshape(a['count'], n)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
for path in argv:
    j, bin_ = read(path); changed = 0
    for m in j['meshes']:
        for pr in m['primitives']:
            for attr in ('JOINTS_0', 'WEIGHTS_0'):
                ai = pr['attributes'].get(attr)
                if ai is None: continue
                a = j['accessors'][ai]
                if a['componentType'] == 5126 and not a.get('normalized'): continue
                arr = accessor_array(j, bin_, ai).astype(np.float32)
                if a.get('normalized'): arr = arr / np.iinfo(COMP[a['componentType']]).max
                while len(bin_) % 4: bin_ += b'\0'
                off = len(bin_); data = arr.tobytes(); bin_ += data
                j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
                j['accessors'][ai] = {'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': a['count'], 'type': a['type']}
                changed += 1
    j['buffers'][0]['byteLength'] = len(bin_)
    write(path, j, bin_); print(f'{path.split("/")[-1]}: {changed} skin attributes -> float32, {len(bin_)/1e6:.2f} MB')
