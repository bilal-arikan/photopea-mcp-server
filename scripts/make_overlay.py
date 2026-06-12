#!/usr/bin/env python3
"""Render a transparent PNG overlay from a multi-primitive JSON spec.

Usage: python make_overlay.py <spec.json> <output.png>

spec = { "width": W, "height": H, "items": [ {type:...}, ... ] }

Supported item types:
  text       : x,y,size,color,anchor,bold,opacity,stroke_width,stroke_color
  ring       : cx,cy,r,width,color,opacity
  roundrect  : x,y,w,h,radius,color,opacity
  line       : x0,y0,x1,y1,width,color,opacity
  vgradient  : color,a0,a1,y0,y1            (vertical alpha ramp band)
  tiled_text : text,size,color,opacity,angle,stepx,stepy
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_REGULAR = "C:/Windows/Fonts/arial.ttf"
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def font(size, bold):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, int(size))
    except Exception:
        return ImageFont.load_default()


def draw_text(draw, it):
    r, g, b = rgb(it.get("color", "#ffffff"))
    a = int(it.get("opacity", 255))
    kw = {}
    if it.get("stroke_width"):
        sr, sg, sb = rgb(it.get("stroke_color", "#000000"))
        kw["stroke_width"] = int(it["stroke_width"])
        kw["stroke_fill"] = (sr, sg, sb, a)
    draw.text((int(it["x"]), int(it["y"])), it["text"], font=font(it.get("size", 48), it.get("bold", False)),
              fill=(r, g, b, a), anchor=it.get("anchor", "la"), **kw)


def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    W, H = int(spec["width"]), int(spec["height"])
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for it in spec["items"]:
        t = it["type"]
        if t == "text":
            draw_text(draw, it)
        elif t == "ring":
            r, g, b = rgb(it.get("color", "#ffffff"))
            a = int(it.get("opacity", 255))
            cx, cy, rad, w = it["cx"], it["cy"], it["r"], it.get("width", 8)
            draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=(r, g, b, a), width=int(w))
        elif t == "roundrect":
            r, g, b = rgb(it.get("color", "#000000"))
            a = int(it.get("opacity", 255))
            draw.rounded_rectangle([it["x"], it["y"], it["x"] + it["w"], it["y"] + it["h"]],
                                   radius=int(it.get("radius", 16)), fill=(r, g, b, a))
        elif t == "line":
            r, g, b = rgb(it.get("color", "#ffffff"))
            a = int(it.get("opacity", 255))
            draw.line([it["x0"], it["y0"], it["x1"], it["y1"]], fill=(r, g, b, a), width=int(it.get("width", 4)))
        elif t == "vgradient":
            r, g, b = rgb(it.get("color", "#000000"))
            y0, y1 = int(it["y0"]), int(it["y1"])
            a0, a1 = int(it.get("a0", 0)), int(it.get("a1", 255))
            band = Image.new("RGBA", (W, max(1, y1 - y0)), (0, 0, 0, 0))
            bd = ImageDraw.Draw(band)
            span = max(1, y1 - y0)
            for yy in range(span):
                a = int(a0 + (a1 - a0) * yy / span)
                bd.line([(0, yy), (W, yy)], fill=(r, g, b, a))
            img.alpha_composite(band, (0, y0))
        elif t == "tiled_text":
            r, g, b = rgb(it.get("color", "#ffffff"))
            a = int(it.get("opacity", 60))
            f = font(it.get("size", 40), it.get("bold", True))
            tile = Image.new("RGBA", (max(W, H) * 2, max(W, H) * 2), (0, 0, 0, 0))
            td = ImageDraw.Draw(tile)
            stepx, stepy = int(it.get("stepx", 320)), int(it.get("stepy", 200))
            for yy in range(0, tile.height, stepy):
                for xx in range(0, tile.width, stepx):
                    td.text((xx, yy), it["text"], font=f, fill=(r, g, b, a))
            tile = tile.rotate(it.get("angle", -30), expand=False, center=(tile.width / 2, tile.height / 2))
            ox = (tile.width - W) // 2
            oy = (tile.height - H) // 2
            img.alpha_composite(tile.crop((ox, oy, ox + W, oy + H)))

    img.save(out)
    print(f"OK {W}x{H} -> {out}")


if __name__ == "__main__":
    main()
