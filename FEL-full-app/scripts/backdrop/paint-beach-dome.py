"""Paint the Venice 'beach' sky dome (owner 2026-09-05: "not hell") — a dusk gradient, no photo.

python3 scripts/backdrop/paint-beach-dome.py   → public/backdrops/baked/beach.jpg (1024×512, horizon at v=0.6, seamless wrap)

Zenith deep blue → violet → a golden band at the horizon, a soft sun glow on the north-west (where veniceBoardwalk.ts puts
the sun over the water), a few soft clouds lit from below, and the dusk-water tone under the horizon.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, random
W, H = 1024, 512; HZ = int(H * 0.6)
img = Image.new("RGB", (W, H))
px = img.load()
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
zenith, upper, mid, band, horizon = (22, 34, 98), (58, 56, 128), (168, 104, 138), (238, 158, 108), (255, 205, 140)
water_top, water_bot = (92, 82, 140), (58, 56, 100)
for y in range(H):
    if y < HZ:
        t = y / HZ
        if t < 0.45: c = lerp(zenith, upper, t / 0.45)
        elif t < 0.75: c = lerp(upper, mid, (t - 0.45) / 0.30)
        elif t < 0.93: c = lerp(mid, band, (t - 0.75) / 0.18)
        else: c = lerp(band, horizon, (t - 0.93) / 0.07)
    else:
        t = (y - HZ) / (H - HZ); c = lerp(water_top, water_bot, min(1, t * 1.6))
    for x in range(W): px[x, y] = c
# sun glow: centred on the horizon, around u=0.33 (the dome's north-west from the court), wide and soft
glow = Image.new("RGB", (W, H), (0, 0, 0)); gd = ImageDraw.Draw(glow)
cx, cy = int(W * 0.33), HZ - 6
for r, col in ((260, (40, 22, 8)), (170, (70, 40, 12)), (100, (110, 70, 20)), (50, (170, 120, 50)), (18, (255, 235, 200))):
    gd.ellipse([cx - r, cy - r * 0.55, cx + r, cy + r * 0.55], fill=col)
glow = glow.filter(ImageFilter.GaussianBlur(28))
img = Image.blend(img, Image.eval(img, lambda v: v), 0)  # no-op keeps type
from PIL import ImageChops
img = ImageChops.add(img, glow)
# clouds: soft ellipses in the upper sky, warm undersides
random.seed(7); cl = Image.new("RGB", (W, H), (0, 0, 0)); cd = ImageDraw.Draw(cl)
for _ in range(14):
    x = random.randint(0, W); y = random.randint(int(H * 0.12), int(H * 0.42)); w = random.randint(60, 180); h = random.randint(10, 26)
    cd.ellipse([x - w, y - h, x + w, y + h], fill=(26, 18, 22)); cd.ellipse([x - w * 0.7, y + h * 0.3, x + w * 0.7, y + h * 0.9], fill=(46, 28, 18))
cl = cl.filter(ImageFilter.GaussianBlur(9)); img = ImageChops.add(img, cl)
# seamless wrap: blend the right edge into the left
img = img.convert("RGB"); p2 = img.load()
for x in range(40):
    t = x / 40
    for y in range(H):
        a = p2[x, y]; b = p2[W - 40 + x, y]
        p2[x, y] = lerp(b, a, t) if x < 20 else a
img.save("public/backdrops/baked/beach.jpg", quality=90); print("painted beach dome →", img.size)
