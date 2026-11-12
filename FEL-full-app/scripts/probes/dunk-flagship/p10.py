# python3 p10.py <R> : the Phase 10 re-measure — the earlier gates read off the final build's records (f10a / f10s / f10l / f10t)
import json, sys, glob, math
R = sys.argv[1]
def summ(tag, scen):
    out = []
    for f in sorted(glob.glob(f'{R}/{tag}/{scen}-r*/summary-{scen}.json')): out += json.load(open(f))[scen]
    return out
def recs(tag, scen):
    out = []
    for f in sorted(glob.glob(f'{R}/{tag}/{scen}-r*/rec-{scen}.json')): out += json.load(open(f))
    return out
def speed_steps(r):
    F = r['frames']; L = next((i for i, f in enumerate(F) if any('[DUNK-LAUNCH]' in m['msg'] and abs(m['t'] - f['t']) < 9 for m in r['marks'])), len(F))
    sp = [math.hypot(b['rp'][0] - a['rp'][0], b['rp'][2] - a['rp'][2]) / max(1e-6, (b['t'] - a['t']) / 1000) for a, b in zip(F[:L], F[1:L])]
    d = [abs(y - x) for x, y in zip(sp, sp[1:])]
    return (round(max(d), 2) if d else 0, sum(1 for x in d if x > 0.6))
P = {}
P['P1'] = [{'rep': s['rep'], 'speedStepMax': speed_steps(r)[0], 'steps>0.6': speed_steps(r)[1], 'bonePops': s['approach']['bonePops'],
            'skateRun': s['approach']['skate'].get('run', {}).get('mps'), 'jerkRms': s['approach']['jerkRms']}
           for s, r in zip(summ('f10a', 'approach'), recs('f10a', 'approach')) if s.get('approach')]
P['P2'] = [{'scen': s['scen'], 'pressToFeetOffMs': s['flight']['pressToFeetOffMs'], 'takeoffRootStepCm': s['flight']['takeoffRootStepCm'],
            'landHardCuts': s['flight']['land']['hardCuts'], 'landHipPops': s['flight']['land']['hipPops']}
           for t in ('press', 'release', 'approach') for s in summ('f10a', t) if s.get('flight')]
imp = lambda tag: [next((m['msg'][16:80] for m in r['marks'] if '[DUNK-IMPACT]' in m['msg']), None) for r in recs(tag, 'approach')]
P['P5_slam'] = {'beat': imp('f10a'), 'late': imp('f10s')}
lob = {}
for scen in ('oop', 'oopglass', 'oopbounce', 'glass', 'bounce', 'selflobrun'):
    lob[scen] = [{k: (s.get('lob') or {}).get(k) for k in ('caught', 'flightMs', 'apexOverCatchM', 'inFrameShare')} for s in summ('f10l', scen)]
P['P3P4_lobs'] = lob
fired = {r['scen'][6:]: bool(r.get('frames')) and any('[DUNK-TRICK] air' in m['msg'] for m in r['marks']) for r in recs('f10t', 'tricks')}
P['P6_fired'] = f"{sum(fired.values())} of {len(fired)}" + ('' if all(fired.values()) else f" (not: {[k for k, v in fired.items() if not v]})")
json.dump(P, open(f'{R}/p10.json', 'w'), indent=1)
print(json.dumps(P, indent=1))
