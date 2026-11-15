#!/usr/bin/env python3
"""Derive the web assets from the original logo (source image stays in the repo).

  assets/source/logo-original.png  ->  site/assets/logo.png     (trimmed, transparent)
                                       site/assets/favicon.png  (first glyph, 128px)
                                       site/assets/og.jpg       (1200x630 black plate)

Black in the original is treated as empty, so the wordmark drops cleanly onto the black page.
Run from the repo root:  python3 scripts/build-assets.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source", "logo-original.png")
OUT = os.path.join(ROOT, "site", "assets")
THRESHOLD = 25


def main():
    os.makedirs(OUT, exist_ok=True)
    src = Image.open(SRC).convert("RGB")

    ink = src.convert("L").point(lambda v: 255 if v > THRESHOLD else 0)
    box = ink.getbbox()
    if not box:
        raise SystemExit("no ink found in " + SRC)
    mark = src.crop(box)

    # wordmark: luminance becomes alpha -> white letterforms, no black plate
    logo = mark.convert("RGBA")
    logo.putalpha(mark.convert("L"))
    logo.thumbnail((1600, 1600), Image.LANCZOS)
    logo.save(os.path.join(OUT, "logo.png"), optimize=True)

    # favicon: first glyph column block ("B")
    w, h = ink.size
    cols = ink.crop(box).resize((mark.width, 1), Image.BOX).convert("L")
    runs, start = [], None
    for x in range(cols.width):
        on = cols.getpixel((x, 0)) > 90
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, cols.width))
    runs = [r for r in runs if r[1] - r[0] > mark.width * 0.02]
    glyph = mark.crop((runs[0][0], 0, runs[0][1], mark.height)) if runs else mark
    side = max(glyph.size)
    plate = Image.new("RGB", (side, side), (0, 0, 0))
    plate.paste(glyph, ((side - glyph.width) // 2, (side - glyph.height) // 2))
    plate.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, "favicon.png"), optimize=True)

    # og plate
    og = Image.new("RGB", (1200, 630), (0, 0, 0))
    copy = mark.copy()
    copy.thumbnail((980, 980), Image.LANCZOS)
    og.paste(copy, ((1200 - copy.width) // 2, (630 - copy.height) // 2))
    og.save(os.path.join(OUT, "og.jpg"), quality=88, optimize=True)

    print("logo.png", logo.size, "| favicon.png 128x128", "| og.jpg 1200x630")


if __name__ == "__main__":
    main()
