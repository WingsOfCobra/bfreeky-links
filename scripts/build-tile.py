#!/usr/bin/env python3
"""Draw the tiled page background: a faint 1-bit grid, Y2K-style map texture.

Writes site/assets/tile.png (240x240, tiled by the CSS). Run from the repo root.
"""
import os
import struct
import zlib

SIZE = 240
BG = (0, 0, 0)
LINE = (18, 18, 18)      # the grid
MAJOR = (30, 30, 30)     # every 5th line
CELL = 12


def main():
    rows = []
    for y in range(SIZE):
        row = bytearray([0])
        for x in range(SIZE):
            c = BG
            if x % CELL == 0 or y % CELL == 0:
                c = MAJOR if (x % (CELL * 5) == 0 or y % (CELL * 5) == 0) else LINE
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
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "site", "assets", "tile.png")
    with open(out, "wb") as fh:
        fh.write(png)
    print("tile.png", SIZE, "x", SIZE, len(png), "bytes")


if __name__ == "__main__":
    main()
