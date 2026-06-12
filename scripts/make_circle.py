#!/usr/bin/env python3
"""Crop a square image into a circle with an optional colored ring.

Usage: python make_circle.py <input.png> <output.png> <ring_hex> <ring_width>
"""
import sys
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
ring_hex = sys.argv[3] if len(sys.argv) > 3 else "ffffff"
ring_w = int(sys.argv[4]) if len(sys.argv) > 4 else 18


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


im = Image.open(src).convert("RGBA")
s = min(im.size)
im = im.crop(((im.width - s) // 2, (im.height - s) // 2,
             (im.width - s) // 2 + s, (im.height - s) // 2 + s))

# Supersample mask for smooth edges.
ss = 4
mask = Image.new("L", (s * ss, s * ss), 0)
ImageDraw.Draw(mask).ellipse([0, 0, s * ss, s * ss], fill=255)
mask = mask.resize((s, s), Image.LANCZOS)

out_img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
out_img.paste(im, (0, 0), mask)

if ring_w > 0:
    draw = ImageDraw.Draw(out_img)
    r, g, b = rgb(ring_hex)
    inset = ring_w // 2
    draw.ellipse([inset, inset, s - inset, s - inset], outline=(r, g, b, 255), width=ring_w)

out_img.save(out)
print(f"OK circle {s}x{s} -> {out}")
