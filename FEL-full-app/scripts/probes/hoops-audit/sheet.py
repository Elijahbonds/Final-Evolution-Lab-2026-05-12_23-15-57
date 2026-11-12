#!/usr/bin/env python3
"""hoops-audit-play (2026-11-12): one JPG contact sheet of frame strips, a captioned row per moment (lane rule: JPG only).

  python3 scripts/probes/hoops-audit/sheet.py <out.jpg> "<caption>|<frame.jpg>,<frame.jpg>,..." ["<caption>|..." ...]

Each row is the caption over up to 8 frames, scaled to one height; frames are drawn in the order given (a strip's every k-th frame,
oldest first). Uses Pillow only (already on the box; no dependency added to the app).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

H = 150          # frame height in the sheet
PAD = 6
CAP = 22         # caption band
MAXN = 8


def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    out, specs = sys.argv[1], sys.argv[2:]
    rows = []
    for spec in specs:
        cap, _, paths = spec.partition('|')
        frames = []
        for p in [x for x in paths.split(',') if x][:MAXN]:
            try:
                im = Image.open(p).convert('RGB')
            except OSError:
                continue
            w = max(1, round(im.width * H / im.height))
            frames.append(im.resize((w, H)))
        rows.append((cap, frames))
    width = max([sum(f.width for f in fr) + PAD * (len(fr) + 1) for _, fr in rows] + [900])
    height = sum(CAP + H + PAD for _ in rows) + PAD
    sheet = Image.new('RGB', (width, height), (16, 18, 24))
    d = ImageDraw.Draw(sheet)
    f = font(14)
    y = PAD
    for cap, fr in rows:
        d.text((PAD, y + 3), cap, fill=(240, 240, 240), font=f)
        y += CAP
        x = PAD
        for im in fr:
            sheet.paste(im, (x, y))
            x += im.width + PAD
        if not fr:
            d.text((PAD, y + H // 2), '(no frames)', fill=(200, 80, 80), font=f)
        y += H + PAD
    sheet.save(out, 'JPEG', quality=82)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    main()
