#!/usr/bin/env python3
"""Genere les icones PNG de l'extension (de a 5 faces) sans dependance externe.

Usage: python3 icons/generate-icons.py
"""

import struct
import zlib
from pathlib import Path

SUPERSAMPLE = 4
SIZES = (16, 32, 48, 128)
FACE_COLOR = (36, 41, 47)
BORDER_COLOR = (31, 136, 61)
PIP_COLOR = (255, 255, 255)
PIP_POSITIONS = ((0.28, 0.28), (0.72, 0.28), (0.5, 0.5), (0.28, 0.72), (0.72, 0.72))


def rounded_square_contains(x, y, size, radius):
    low = radius
    high = size - radius

    dx = low - x if x < low else (x - high if x > high else 0.0)
    dy = low - y if y < low else (y - high if y > high else 0.0)

    return dx * dx + dy * dy <= radius * radius


def sample_color(x, y, size, radius, border, pip_radius, pips):
    if not rounded_square_contains(x, y, size, radius):
        return None

    if not rounded_square_contains(x - border, y - border, size - 2 * border, radius - border):
        return BORDER_COLOR

    for pip_x, pip_y in pips:
        dx = x - pip_x
        dy = y - pip_y

        if dx * dx + dy * dy <= pip_radius * pip_radius:
            return PIP_COLOR

    return FACE_COLOR


def render(size):
    hi = size * SUPERSAMPLE
    radius = hi * 0.22
    border = hi * 0.06
    pip_radius = hi * 0.085
    pips = [(px * hi, py * hi) for px, py in PIP_POSITIONS]
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
                    color = sample_color(x, y, hi, radius, border, pip_radius, pips)

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
