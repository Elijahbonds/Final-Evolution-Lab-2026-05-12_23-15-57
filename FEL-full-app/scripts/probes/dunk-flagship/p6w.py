# python3 p6w.py <dir>...  each trick's OWN window: from the frame it fires ([DUNK-TRICK] air <id>) for 0.75 s (45 frames, 18 samples),
# hands/feet/head relative to the hips in the body's facing; the RMS distance to every other trick; nearest neighbours.
import json, sys, glob, math, os
recs = {}
for d in sys.argv[1:]:
    for f in glob.glob(os.path.join(d, '*', 'rec-tricks.json')):
        for r in json.load(open(f)):
            if r.get('frames'): recs[r['scen'][6:]] = r
def path(r, k):
    F = r['frames']; m = next((m for m in r['marks'] if m['msg'].startswith(f'[DUNK-TRICK] air {k} ')), None)
    if not m: return None
    i0 = next((i for i, f in enumerate(F) if f['t'] >= m['t'] - 1e-6), None); fr = F[i0:i0 + 45]
    if len(fr) < 40: return None
    out = []
    for s in range(18):
        f = fr[round(s * (len(fr) - 1) / 17)]; hp = f['j'][0]; c, sn = math.cos(-f['yaw']), math.sin(-f['yaw'])
        for ji in (5, 6, 1, 2, 7):
            p = f['j'][ji]; dx, dz = p[0] - hp[0], p[2] - hp[2]; out += [dx * c - dz * sn, p[1] - hp[1], dx * sn + dz * c]
    return out
P = {k: path(r, k) for k, r in recs.items()}; ok = {k: v for k, v in P.items() if v}
nn = {k: min((math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / (len(a) / 3)), o) for o, b in ok.items() if o != k) for k, a in ok.items()}
D = sorted(math.sqrt(sum((x - y) ** 2 for x, y in zip(ok[a], ok[b])) / (len(ok[a]) / 3)) for i, a in enumerate(sorted(ok)) for b in sorted(ok)[i + 1:])
med = sorted(v[0] for v in nn.values())[len(nn) // 2]
print(f'trick windows: {len(ok)} of {len(recs)}; nearest-neighbour median {med:.3f} m; all-pairs median {D[len(D)//2]:.3f} m; min {D[0]:.3f}')
for k in sorted(nn, key=lambda x: nn[x][0]): print(f'  {k:14s} nearest {nn[k][1]:14s} {nn[k][0]:.3f} m')
