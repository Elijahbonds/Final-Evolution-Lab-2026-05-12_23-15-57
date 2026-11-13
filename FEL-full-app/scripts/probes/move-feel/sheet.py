# move-feel / sheet — the one JPG (lane/move-feel, 2026-11-12): simple charts from analyze.mjs --series, and the frame strips feel-ext.mjs
# saved (STRIPS=1), the worst moments in rows. Pillow only (the system python's; no project dependency).
#   python3 scripts/probes/move-feel/sheet.py <series.json> <shotsDir> <out.jpg> [rel-tag] [main-tag] [try-tag]
# The tags are the series keys analyze.mjs printed ("onevone:ext-onevone-pro-s7-rel-dummy" ...); missing ones are skipped.
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

series_f, shots, out = sys.argv[1], sys.argv[2], sys.argv[3]
tags = sys.argv[4:]
S = json.load(open(series_f))
def font(sz):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
F, FB, FS = font(18), font(24), font(14)
INK, GRID, BAR = (30, 30, 34), (225, 225, 230), (200, 40, 40)
COL = [(38, 98, 200), (230, 120, 20), (40, 150, 70), (140, 60, 170), (110, 110, 110)]

def test(tag, name):
    for t in S.get(tag, []):
        if t['name'] == name: return t
    return None

def chart(d, box, title, lines, ymax, ylabel, bars=(), xmax=None, marks=()):
    x0, y0, w, h = box
    d.rectangle([x0, y0, x0 + w, y0 + h], fill=(255, 255, 255), outline=(200, 200, 205))
    d.text((x0 + 10, y0 + 6), title, font=F, fill=INK)
    px0, py0, pw, ph = x0 + 56, y0 + 36, w - 72, h - 70
    n = xmax or max([len(v) for _, v, _ in lines] + [1])
    for k in range(0, 6):
        yy = py0 + ph - ph * k / 5
        d.line([px0, yy, px0 + pw, yy], fill=GRID)
        d.text((x0 + 6, yy - 8), f'{ymax * k / 5:.1f}', font=FS, fill=INK)
    for k in range(0, int(n / 30) + 1):
        xx = px0 + pw * (k * 30) / n
        d.line([xx, py0, xx, py0 + ph], fill=GRID)
        d.text((xx - 8, py0 + ph + 4), f'{k * 0.5:.1f}', font=FS, fill=INK)
    d.text((px0 + pw - 60, py0 + ph + 20), 'seconds', font=FS, fill=INK)
    d.text((px0, py0 - 2), ylabel, font=FS, fill=(90, 90, 95))
    for (v, lab) in bars:
        yy = py0 + ph - ph * min(v, ymax) / ymax
        d.line([px0, yy, px0 + pw, yy], fill=BAR, width=2); d.text((px0 + pw - 220, yy - 18), lab, font=FS, fill=BAR)
    for (i, lab) in marks:
        xx = px0 + pw * i / n; d.line([xx, py0, xx, py0 + ph], fill=(160, 160, 160), width=1); d.text((xx + 3, py0 + 2), lab, font=FS, fill=(120, 120, 120))
    ly = y0 + 8
    for ci, (lab, v, col) in enumerate(lines):
        pts = [(px0 + pw * i / n, py0 + ph - ph * min(max(y, 0), ymax) / ymax) for i, y in enumerate(v[:n]) if y is not None]
        if len(pts) > 1: d.line(pts, fill=col, width=3)
        elif pts:
            for p in pts: d.ellipse([p[0] - 2, p[1] - 2, p[0] + 2, p[1] + 2], fill=col)
        d.text((x0 + w - 330, ly), '— ' + lab, font=FS, fill=col); ly += 17

def dots(d, box, title, lines, ymax, ylabel, bars=(), xmax=None, marks=()):
    x0, y0, w, h = box
    chart(d, box, title, [(lab, [], col) for lab, _, col in lines], ymax, ylabel, bars, xmax or max(len(v) for _, v, _ in lines), marks)
    px0, py0, pw, ph = x0 + 56, y0 + 36, w - 72, h - 70
    n = xmax or max(len(v) for _, v, _ in lines)
    for lab, v, col in lines:
        for i, y in enumerate(v[:n]):
            if y is None: continue
            p = (px0 + pw * i / n, py0 + ph - ph * min(max(y, 0), ymax) / ymax); d.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=col)

W = 1800
charts_h = 2 * 360 + 30
strips = []
for name, cap in [('jog', 'Let go of the stick at a jog (every 2nd frame from the release): the body glides to a stop on a loop, no plant'),
                  ('cut', 'A 90° cut at a jog: the run turns on the lerp, the legs keep their loop through the turn'),
                  ('reverse', 'Stick thrown back at a jog: the reversal'),
                  ('walk', 'A thumb barely pushed (0.12 of the stick): the body creeps at 0.8 m/s on the idle dribble, its feet planted'),
                  ('slide', 'Defence: the slide left out of a slide right (the planted foot slides)')]:
    dd = None
    for tag in tags:
        p = os.path.join(shots, f'strip-onevone-mf-{name}')
        if os.path.isdir(p): dd = p; break
    if dd:
        fr = sorted(f for f in os.listdir(dd) if f.endswith('.jpg'))[:6]
        if fr: strips.append((cap, [os.path.join(dd, f) for f in fr]))
tw = (W - 40) // 6; th = int(tw * 270 / 480)
H = 70 + charts_h + len(strips) * (th + 40) + 20
img = Image.new('RGB', (W, H), (245, 245, 247)); d = ImageDraw.Draw(img)
d.text((20, 18), 'Why the movement feels off — measured on the real 1v1 (lane/move-feel). Red lines are the bars.', font=FB, fill=INK)

rel = tags[0] if tags else None; main = tags[1] if len(tags) > 1 else None; tr = tags[2] if len(tags) > 2 else None
cw, chh = (W - 60) // 2, 360
# 1. speed on start / stop
jog, spr = test(rel, 'jog'), test(rel, 'sprint')
lines = []
if jog: lines.append(('jog: push, hold 1.1 s, let go', jog['series']['sp'], COL[0]))
if spr: lines.append(('turbo: push, hold 1.0 s, let go', spr['series']['sp'], COL[1]))
if lines: chart(d, (20, 70, cw, chh), '1. Speed on a start and a stop (root m/s, release)', lines, 7, 'm/s', bars=[(4.35 * 0.9, '90 % of the jog (bar: by 0.25 s)')], xmax=120, marks=[(m[0], m[1]) for m in (jog or spr)['series']['marks']])
# 2. speed on cuts
cut, cs = test(rel, 'cut'), test(rel, 'cutSprint')
lines = []
if cs: lines.append(('turbo 90° cut, shipped', cs['series']['sp'], COL[1]))
tcs = test(tr, 'cutSprint') if tr else None
if tcs: lines.append(('turbo 90° cut, try values', tcs['series']['sp'], COL[2]))
if cut: lines.append(('jog 90° cut, shipped', cut['series']['sp'], COL[0]))
if lines: chart(d, (40 + cw, 70, cw, chh), '2. Speed through a 90° cut (the cost lands in one frame)', lines, 7, 'm/s', xmax=120, marks=[(m[0], m[1]) for m in (cs or cut)['series']['marks']])
# 3. foot slide per frame
sl, slm, wk = test(rel, 'slide'), test(main, 'slide') if main else None, test(rel, 'walk')
lines = []
if slm: lines.append(('defence slide, live (main)', slm['series']['slide'], COL[4]))
if sl: lines.append(('defence slide, release', sl['series']['slide'], COL[3]))
if wk: lines.append(('walk then creep, release', wk['series']['slide'], COL[0]))
if lines: dots(d, (20, 100 + chh, cw, chh), '3. Planted-foot slide per frame (cm; 1v1)', lines, 15, 'cm', bars=[(3, 'bar: 3 cm a frame')], xmax=170)
# 4. the camera turning the stick
lines = []
for nm, col in [('jog', COL[0]), ('weave', COL[2]), ('cut', COL[1])]:
    t = test(rel, nm)
    if t: lines.append((f'camera yaw rate, {nm}', t['series']['camYawRate'], col))
if lines: chart(d, (40 + cw, 100 + chh, cw, chh), '4. Camera yaw rate (°/s): a held stick turns with it', lines, 160, '°/s', bars=[(120, 'bar: p99 ≤ 120 °/s')], xmax=170)

y = 70 + charts_h + 10
for cap, files in strips:
    d.text((20, y), cap, font=F, fill=INK); y += 26
    for i, f in enumerate(files):
        try:
            im = Image.open(f).convert('RGB').resize((tw - 6, th)); img.paste(im, (20 + i * tw, y))
        except Exception: pass
    y += th + 14
img.save(out, 'JPEG', quality=82)
print('wrote', out, img.size)
