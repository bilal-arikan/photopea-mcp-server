#!/usr/bin/env python3
"""Render a transparent PNG text overlay from a JSON spec.

Usage: python make_text_overlay.py <spec.json> <output.png>

spec.json:
{
  "width": 1200, "height": 628,
  "items": [
    {"text": "NEW SEASON", "x": 600, "y": 314, "size": 80,
     "color": "#0a2540", "anchor": "mm", "bold": true, "opacity": 255}
  ]
}

This bypasses Photopea's text engine (which does not lay out text in headless
Chromium). The overlay is composited onto the base image inside Photopea.
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_REGULAR = "C:/Windows/Fonts/arial.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    w, h = int(spec["width"]), int(spec["height"])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for it in spec["items"]:
        size = int(it.get("size", 48))
        bold = bool(it.get("bold", False))
        try:
            font = ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)
        except Exception:
            font = ImageFont.load_default()
        r, g, b = hex_to_rgb(it.get("color", "#ffffff"))
        a = int(it.get("opacity", 255))
        kw = {}
        if it.get("stroke_width"):
            sr, sg, sb = hex_to_rgb(it.get("stroke_color", "#000000"))
            kw["stroke_width"] = int(it["stroke_width"])
            kw["stroke_fill"] = (sr, sg, sb, a)
        draw.text(
            (int(it["x"]), int(it["y"])),
            it["text"],
            font=font,
            fill=(r, g, b, a),
            anchor=it.get("anchor", "la"),
            **kw,
        )

    img.save(out)
    print(f"OK {w}x{h} -> {out}")


if __name__ == "__main__":
    main()
