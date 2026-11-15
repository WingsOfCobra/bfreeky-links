#!/usr/bin/env python3
"""Draw the tiled page background: a faint 1-bit grid, Y2K-style map texture.

Writes site/assets/tile.png (240x240, tiled by the CSS). Run from the repo root.
"""
import os
import struct
import zlib

SIZE = 240
BG = (0, 0, 0)
CELL = 12

# (filename, grid line colour, every-5th-line colour)
VARIANTS = [
    ("tile.png", (18, 18, 18), (30, 30, 30)),
    ("tile-red.png", (58, 12, 12), (92, 18, 18)),
]


def make(out_dir, name, line, major):
    rows = []
    for y in range(SIZE):
        row = bytearray([0])
        for x in range(SIZE):
            c = BG
            if x % CELL == 0 or y % CELL == 0:
                c = major if (x % (CELL * 5) == 0 or y % (CELL * 5) == 0) else line
            row += bytes(c)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(os.path.join(out_dir, name), "wb") as fh:
        fh.write(png)
    return len(png)


def main():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "site", "assets")
    for name, line, major in VARIANTS:
        size = make(out, name, line, major)
        print(f"{name} {SIZE}x{SIZE} {size} bytes")


if __name__ == "__main__":
    main()
