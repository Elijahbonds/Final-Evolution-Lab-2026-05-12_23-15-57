# python3 p8an.py <dir-with-show-r0> : the show — the subject and the iron in frame through the replay, every camera cut authored,
# the sound and the crowd on the iron's frame, the reveal's dead time
import json, sys, math, os
d = sys.argv[1]; recs = json.load(open(os.path.join(d, 'show-r0', 'rec-show.json')))
FR = 1000 / 60
for r in recs:
    F = r.get('frames') or []
    if not F: print({'rep': r.get('rep'), 'err': r.get('err')}); continue
    M = r['marks']; Q = r.get('qa', [])
    mt = lambda s: next((m['t'] for m in M if s in m['msg']), None)
    tc = mt('[DUNK-WIN] contact'); row = {'rep': r['rep'], 'made': tc is not None}
    if tc:
        snd = [q for q in Q if q['kind'] in ('sfx', 'crowd', 'mic', 'voice') and abs(q['t'] - tc) <= 250]
        row['on_the_iron'] = sorted({(q['kind'], q['name'], round((q['t'] - tc) / FR, 1)) for q in snd}, key=lambda x: x[2])
    cuts = [q['t'] for q in Q if q['kind'] == 'hud' and q['name'] == 'cut' and tc and q['t'] > tc]
    t_end = mt('[HANDS] triple cut end')
    if cuts and t_end:
        seg = [f for f in F if cuts[0] <= f['t'] <= t_end]
        row['replay'] = {'frames': len(seg), 'dunker_out': sum(1 for f in seg if not ((f.get('sin') or 0) & 3)), 'iron_out': sum(1 for f in seg if not ((f.get('sin') or 0) & 4))}
    authored = [(m['t'], m['msg'][:40]) for m in M if any(k in m['msg'] for k in ('[DUNK-CAM]', 'triple cut end', '[DUNK-PHASE] approach', '[DUNK-PHASE] resolve', '[DUNK-PHASE] judging', '[DUNK-PHASE] rivalTurn', '[DUNK-PHASE] cinematic'))]
    authored += [(q['t'], 'replay cut') for q in Q if q['kind'] == 'hud' and q['name'] == 'cut']
    jumps = []
    for a, b in zip(F, F[1:]):
        dj = math.dist(a['cam'], b['cam'])
        if dj > 0.75:
            who = min(authored, key=lambda x: abs(x[0] - b['t'])) if authored else (0, '')
            jumps.append({'m': round(dj, 2), 'authored': who[1] if abs(who[0] - b['t']) <= 2 * FR + 1 else None})
    row['cuts'] = len(jumps); row['unauthored'] = [j for j in jumps if not j['authored']]; row['endJumps'] = sum(1 for j in jumps if j['authored'] and 'triple' in j['authored'])
    tj = mt('[DUNK-PHASE] judging')
    nxt = next((m['t'] for m in M if tj and m['t'] > tj and ('[DUNK-PHASE] approach' in m['msg'] or '[DUNK-PHASE] rivalTurn' in m['msg'])), None)
    row['judging_to_next_sec'] = round((nxt - tj) / 1000, 2) if tj and nxt else None
    print(json.dumps(row))
