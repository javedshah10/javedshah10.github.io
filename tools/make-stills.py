"""Crop Sol's full-size stills into sharp WebP layers and print their CSS positions.
A and B sit in the stage exactly where the pad65 video draws them (0.65 scale about 835,435 of 1672x941).
Run from the project root: python site/tools/make-stills.py"""
import numpy as np
from PIL import Image
from scipy import ndimage as nd
SRC = "Codex/Reference-Stills/A-B-C-Keyframes/"
OUT = "site/media/"
W, H, S, AX, AY = 1672, 941, 0.65, 835, 435
NAVY = np.array([8, 12, 20])

def crop(name, pad=10):
    im = Image.open(SRC + name + ".png").convert("RGB")
    a = np.asarray(im).astype(int)
    ys, xs = np.where(np.abs(a - NAVY).max(2) > 2)  # object + glow + shadow
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, W), min(ys.max() + pad + 1, H))
    return im, a, box

for name, out in [("A-rest", "a-rest"), ("B-menu", "b-menu")]:
    im, a, (x0, y0, x1, y1) = crop(name)
    im.crop((x0, y0, x1, y1)).save(OUT + out + ".webp", quality=90, method=6)
    l, t = AX + (x0 - AX) * S, AY + (y0 - AY) * S
    print(f"{out}: left {l/W*100:.3f}% top {t/H*100:.3f}% width {(x1-x0)*S/W*100:.3f}% height {(y1-y0)*S/H*100:.3f}%  ({x1-x0}x{y1-y0})")

im, a, (x0, y0, x1, y1) = crop("C-panel")
im.crop((x0, y0, x1, y1)).save(OUT + "c-panel.webp", quality=90, method=6)
obj = a.mean(2) > 45
lab, _ = nd.label(nd.binary_fill_holes(obj) & ~obj)
g = max(nd.find_objects(lab), key=lambda s: (s[0].stop - s[0].start) * (s[1].stop - s[1].start))
cw, ch = x1 - x0, y1 - y0
print(f"c-panel: {cw}x{ch}, aspect {cw/ch:.4f}; glass x {(g[1].start-x0)/cw*100:.2f}-{(g[1].stop-x0)/cw*100:.2f}% y {(g[0].start-y0)/ch*100:.2f}-{(g[0].stop-y0)/ch*100:.2f}%")

# Stage C frame (2026-11-01): Sol's C-frame-2x.png (3344x1882 RGBA, aligned to C-panel.png within 0.16) cropped to
# the same box as c-panel.webp at 2x. The page lays ONE symmetric glass overlay on top of the frame, sitting just
# inside the rim's bright inner edge, so all four corners match (Javed: "top and below the same shape").
fr = Image.open(SRC + "C-frame-2x.png").convert("RGBA")
_, _, (cx0, cy0, cx1, cy1) = crop("C-panel")
box = (cx0 * 2, cy0 * 2, cx1 * 2, cy1 * 2)
f2 = fr.crop(box)
f2.save(OUT + "c-frame.webp", quality=90, method=6)
a2 = np.asarray(fr).astype(int)
L2 = a2[..., :3].mean(2)
bright, _ = nd.label((L2 > 70) & (a2[..., 3] > 200))
rim = bright == (np.bincount(bright.ravel())[1:].argmax() + 1)
inside = nd.binary_fill_holes(rim) & ~rim
lab, _ = nd.label(inside)
inside = lab == (np.bincount(lab.ravel())[1:].argmax() + 1)
ys, xs = np.where(inside)
INSET = 3  # px at 2x: keep the rim's bright edge line visible
l, r, t, b = xs.min() + INSET, xs.max() - INSET, ys.min() + INSET, ys.max() - INSET
radii = []
for cx, cy, dx, dy in [(xs.min(), ys.min(), 1, 1), (xs.max(), ys.min(), -1, 1), (xs.min(), ys.max(), 1, -1), (xs.max(), ys.max(), -1, -1)]:
    d = 0
    while not inside[cy + dy * d, cx + dx * d]: d += 1
    radii.append(d / (1 - 1 / np.sqrt(2)))
R = max(radii) - INSET  # one radius for all four corners; the roundest keeps every corner inside the rim
Wc, Hc = box[2] - box[0], box[3] - box[1]
print(f"c-frame.webp {Wc}x{Hc}; corner radii {[round(v) for v in radii]} -> {R:.0f}px")
print(f".glass left {(l - box[0]) / Wc * 100:.3f}% right {(box[2] - 1 - r) / Wc * 100:.3f}% "
      f"top {(t - box[1]) / Hc * 100:.3f}% bottom {(box[3] - 1 - b) / Hc * 100:.3f}% radius {R / Wc * 100:.3f}cqw")
