#!/usr/bin/env python3
"""Genere les icones PNG de l'extension (liste de membres) sans dependance externe.

Usage: python3 icons/generate-icons.py
"""

import struct
import zlib
from pathlib import Path

SUPERSAMPLE = 4
SIZES = (16, 32, 48, 128)
FACE_COLOR = (36, 41, 47)
BORDER_COLOR = (31, 136, 61)
ROW_COLOR = (255, 255, 255)

# Trois lignes "avatar + nom", en fractions de la taille de l'icone.
ROW_CENTERS = (0.3, 0.5, 0.7)
AVATAR_X = 0.33
AVATAR_RADIUS = 0.075
BAR_LEFT = 0.46
BAR_RIGHT = 0.7
BAR_HALF_HEIGHT = 0.045


def rounded_square_contains(x, y, size, radius):
    low = radius
    high = size - radius

    dx = low - x if x < low else (x - high if x > high else 0.0)
    dy = low - y if y < low else (y - high if y > high else 0.0)

    return dx * dx + dy * dy <= radius * radius


def in_bar(x, y, size, center_y):
    if abs(y - center_y * size) > BAR_HALF_HEIGHT * size:
        return False

    return BAR_LEFT * size <= x <= BAR_RIGHT * size


def in_avatar(x, y, size, center_y):
    dx = x - AVATAR_X * size
    dy = y - center_y * size
    radius = AVATAR_RADIUS * size

    return dx * dx + dy * dy <= radius * radius


def sample_color(x, y, size, radius, border):
    if not rounded_square_contains(x, y, size, radius):
        return None

    if not rounded_square_contains(x - border, y - border, size - 2 * border, radius - border):
        return BORDER_COLOR

    for center_y in ROW_CENTERS:
        if in_avatar(x, y, size, center_y) or in_bar(x, y, size, center_y):
            return ROW_COLOR

    return FACE_COLOR


def render(size):
    hi = size * SUPERSAMPLE
    radius = hi * 0.22
    border = hi * 0.06
    samples = SUPERSAMPLE * SUPERSAMPLE
    rows = []

    for row in range(size):
        pixels = bytearray()

        for col in range(size):
            red = green = blue = covered = 0

            for sub_y in range(SUPERSAMPLE):
                y = row * SUPERSAMPLE + sub_y + 0.5

                for sub_x in range(SUPERSAMPLE):
                    x = col * SUPERSAMPLE + sub_x + 0.5
                    color = sample_color(x, y, hi, radius, border)

                    if color is None:
                        continue

                    red += color[0]
                    green += color[1]
                    blue += color[2]
                    covered += 1

            if covered == 0:
                pixels.extend((0, 0, 0, 0))
                continue

            pixels.extend(
                (
                    round(red / covered),
                    round(green / covered),
                    round(blue / covered),
                    round(255 * covered / samples),
                )
            )

        rows.append(bytes(pixels))

    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, payload):
        data = tag + payload
        return struct.pack(">I", len(payload)) + data + struct.pack(">I", zlib.crc32(data))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    path.write_bytes(png)


def main():
    target = Path(__file__).resolve().parent

    for size in SIZES:
        write_png(target / f"icon{size}.png", size, render(size))
        print(f"icon{size}.png genere")


if __name__ == "__main__":
    main()
