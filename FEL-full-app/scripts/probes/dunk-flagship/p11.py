# python3 p11.py <dir-with-rec-finishes.json | rec-tricks.json>... [--trace]
# The finish at the iron, per attempt (dunk-flagship P11, `dunk.finishOverRing`): made / missed; the contact's `flat` (the ball's
# horizontal distance from the ring centre where it was let go — the mode's own [HANDS] iron contact line) against the ring's
# radius; the press -> contact time; and the ball's path through the jam: its height over the ring's plane on the frame it
# crossed the ring's radius coming in (over the iron, or into its front), and its lowest height while still outside the ring.
# --trace prints every frame from 6 before the press to the contact (r = flat distance, dy = height over the ring's plane).
import json, sys, glob, os, re, math

RIM_Y_RE = re.compile(r'\(([-\d.]+) m\)')
FLAT_RE = re.compile(r"flat ([\d.]+) m of the ring's ([\d.]+)")
args = [a for a in sys.argv[1:] if not a.startswith('--')]
TRACE = '--trace' in sys.argv

def rim_of(recs):
    # the ring centre from the contact lines themselves: 'ball D m from the rim centre (Y m)' gives no centre, so read the rig's
    # constant the recorder projects (modeConfigs rimZ, the courtDims height); a rec may carry it as r['rim']
    for r in recs:
        if r.get('rim'): return r['rim']
    return [0.0, float(os.environ.get('RIM_Y', '3.05')), float(os.environ.get('RIM_Z', '-10.28'))]

rows = []
for d in args:
    for f in sorted(glob.glob(os.path.join(d, 'rec-*.json'))):
        recs = json.load(open(f)); rim = rim_of(recs)
        for r in recs:
            if not r.get('frames'):
                rows.append({'scen': r['scen'], 'err': r.get('err')}); continue
            F, M = r['frames'], r['marks']
            mt = lambda s: next((m for m in M if s in m['msg']), None)
            press = mt('[DUNK-SLAM] pressed') or mt('[DUNK-SLAM]'); con = mt('[HANDS] iron contact'); short = mt('short of the iron')
            flat = ringR = None
            if con:
                g = FLAT_RE.search(con['msg'])
                if g: flat, ringR = float(g.group(1)), float(g.group(2))
            R = ringR or 0.225
            row = {'scen': r['scen'], 'made': bool(con) and not short, 'flat': flat, 'inside': flat is not None and flat <= R + 1e-9,
                   'trick': next((m['msg'].split()[2] for m in M if m['msg'].startswith('[DUNK-TRICK] air ')), None),
                   'variant': next((m['msg'][20:44] for m in M if '[DUNK-SLAM] variant' in m['msg']), None)}
            res = mt('[DUNK-PHASE] resolve')
            t_res = res['t'] if res else None
            if con and t_res is not None: row['resolveToContactMs'] = round(con['t'] - t_res)
            if con:
                g2 = re.search(r'iron contact (\d+) ms into the jam', con['msg'])
                if g2: row['jamMs'] = int(g2.group(1))
            # the path: frames from the resolve (the jam's start) to the contact
            if t_res is not None:
                t_end = (con or short or {'t': t_res + 700})['t']
                seg = [f for f in F if f.get('ball') and t_res - 110 <= f['t'] <= t_end + 1]
                J = lambda f, i, k: (f['j'][i][k] - rim[k]) if len(f['j']) > i and f['j'][i] else float('nan')
                pts = [(f['t'] - t_res, math.hypot(f['ball'][0] - rim[0], f['ball'][2] - rim[2]), f['ball'][1] - rim[1], f['rp'][1], f['rp'][2] - rim[2],
                        J(f, 7, 1), J(f, 7, 2), J(f, 8, 1), J(f, 8, 2), J(f, 6, 1), J(f, 6, 2), f['ball'][2] - rim[2]) for f in seg]
                heads = [p for p in pts if p[0] >= 0 and p[5] == p[5]]
                row['headTopOverRingM'] = round(max(p[5] for p in heads) + 0.11, 3) if heads else None   # the head joint + ~0.11 m to the crown
                row['headNearestRingZ'] = round(min(p[6] for p in heads), 3) if heads else None
                out = [p for p in pts if p[1] > R and p[0] >= 0]
                row['lowestOutsideDy'] = round(min(p[2] for p in out), 3) if out else None
                cross = next((b for a, b in zip(pts, pts[1:]) if a[1] > R >= b[1]), None)
                row['dyAtCrossing'] = round(cross[2], 3) if cross else None
                if TRACE:
                    print(f"-- {r['scen']} made={row['made']} flat={flat}")
                    for p in pts: print(f"   t {p[0]:6.0f} ms  ball r {p[1]:.3f} dy {p[2]:+.3f} z {p[11]:+.3f} | root y {p[3]:.3f} z {p[4]:+.3f} | head dy {p[5]:+.3f} z {p[6]:+.3f} | R shoulder dy {p[7]:+.3f} z {p[8]:+.3f} | R hand dy {p[9]:+.3f} z {p[10]:+.3f}")
            rows.append(row)

by = {}
for w in rows: by.setdefault(w['scen'], []).append(w)
for k, v in by.items():
    ok = [w for w in v if 'made' in w]
    print(f"{k:22s} made {sum(w['made'] for w in ok)}/{len(v)}  inside the ring {sum(1 for w in ok if w['inside'])}/{len(v)}  flat {[w['flat'] for w in ok]}"
          f"  jam ms {[w.get('jamMs') for w in ok]}  dy at the crossing {[w.get('dyAtCrossing') for w in ok]}  lowest outside {[w.get('lowestOutsideDy') for w in ok]}  head top over the ring {[w.get('headTopOverRingM') for w in ok]} nearest z {[w.get('headNearestRingZ') for w in ok]}"
          + (f"  errors {[w['err'] for w in v if 'err' in w]}" if any('err' in w for w in v) else ''))
if os.environ.get('JSON'): json.dump(rows, open(os.environ['JSON'], 'w'), indent=1)
