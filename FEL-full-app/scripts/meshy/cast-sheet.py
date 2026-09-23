"""cast-sheet.py — stamp the cast onto the contact sheet (models pass phase 7, 2026-09-22).

    /opt/homebrew/bin/python3.12 scripts/meshy/cast-sheet.py <sheet-dir>

Reads MODE_CAST from lib/babylon/core/athleteRoster.ts and the look table from docs/CAST-MESHY-2026-09-22.md, and rewrites
<sheet-dir>/index.html so every body's card says its look and the modes it plays — the sheet the owner re-casts from.
"""
import re, sys, os, json
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sheet = sys.argv[1]
ts = open(os.path.join(root, 'lib/babylon/core/athleteRoster.ts')).read()
cast_block = ts[ts.index('export const MODE_CAST'):]
cast_block = cast_block[:cast_block.index('};') + 2]
by_body = {}
for mode, keys in re.findall(r"^\s+([a-z_]+): \[([^\]]*)\]", cast_block, re.M):
    for k in re.findall(r"'([^']+)'", keys): by_body.setdefault(k, []).append(mode)
looks = {}
for line in open(os.path.join(root, 'docs/CAST-MESHY-2026-09-22.md')):
    m = re.match(r"\| (m22-[0-9a-f]+) \| ([^|]+) \|", line)
    if m: looks[m.group(1)] = m.group(2).strip()
rows = json.load(open(os.path.join(sheet, 'sheet.json')))
def tile(r):
    n = r['name']; rep = r.get('report') or {}
    return (f'<div class="c"><h3>{n}</h3><div class="row"><img src="{n}-front.png"><img src="{n}-turn.png"><img src="{n}-run.png"><img src="{n}-sport.png"></div>'
            f'<p>{looks.get(n, "")}</p><p>{rep.get("joints")} joints · {rep.get("height")} m · {rep.get("verts")} verts · idle T {r.get("idleTee")} · run T {r.get("runTee")}</p>'
            f'<p class="cast">plays in: {", ".join(by_body.get(n, [])) or "— (not cast)"}</p></div>')
html = ('<!doctype html><meta charset="utf-8"><title>Meshy 22 — cast</title><style>body{background:#0b0d12;color:#ddd;font:13px ui-monospace,monospace;margin:16px}'
        '.c{margin:0 0 22px;padding:10px;border:1px solid #222;border-radius:8px}.row img{width:200px;height:257px;object-fit:cover;margin-right:6px;border-radius:4px;background:#111}'
        'h3{margin:0 0 6px;color:#0ef}.cast{color:#fc6}</style><h1>The Meshy 22 — cast by look (rivals + crowd)</h1>'
        '<p>front · three-quarter · running · jumpshot. Swap a line in docs/CAST-MESHY-2026-09-22.md and lib/babylon/core/athleteRoster.ts MODE_CAST; rerun this script.</p>'
        + ''.join(tile(r) for r in rows))
open(os.path.join(sheet, 'index.html'), 'w').write(html)
print(f'sheet: {sheet}/index.html — {len(rows)} bodies, {sum(1 for r in rows if by_body.get(r["name"]))} cast')
