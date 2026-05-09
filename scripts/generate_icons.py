from __future__ import annotations

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "public" / "icons"

BG_TOP = (15, 91, 216, 255)
BG_BOTTOM = (31, 139, 255, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def lerp(a: int, b: int, t: float) -> int:
    return int(round(a + (b - a) * t))


def blend(c1: tuple[int, int, int, int], c2: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(lerp(c1[i], c2[i], t) for i in range(4))


def new_canvas(size: int) -> list[list[tuple[int, int, int, int]]]:
    return [[TRANSPARENT for _ in range(size)] for _ in range(size)]


def fill_rounded_rect(
    canvas: list[list[tuple[int, int, int, int]]],
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    radius: float,
) -> None:
    size = len(canvas)
    for y in range(size):
        for x in range(size):
            px = x + 0.5
            py = y + 0.5
            cx = min(max(px, x0 + radius), x1 - radius)
            cy = min(max(py, y0 + radius), y1 - radius)
            dx = px - cx
            dy = py - cy
            if dx * dx + dy * dy <= radius * radius:
                t = y / max(size - 1, 1)
                canvas[y][x] = blend(BG_TOP, BG_BOTTOM, t)


def fill_rounded_rect_color(
    canvas: list[list[tuple[int, int, int, int]]],
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    radius: float,
    color: tuple[int, int, int, int],
) -> None:
    size = len(canvas)
    for y in range(size):
        for x in range(size):
            px = x + 0.5
            py = y + 0.5
            cx = min(max(px, x0 + radius), x1 - radius)
            cy = min(max(py, y0 + radius), y1 - radius)
            dx = px - cx
            dy = py - cy
            if dx * dx + dy * dy <= radius * radius:
                canvas[y][x] = color


def fill_rect(
    canvas: list[list[tuple[int, int, int, int]]],
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    color: tuple[int, int, int, int],
) -> None:
    size = len(canvas)
    ix0 = max(0, int(x0))
    iy0 = max(0, int(y0))
    ix1 = min(size, int(x1))
    iy1 = min(size, int(y1))
    for y in range(iy0, iy1):
        for x in range(ix0, ix1):
            canvas[y][x] = color


def fill_triangle(
    canvas: list[list[tuple[int, int, int, int]]],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    color: tuple[int, int, int, int],
) -> None:
    size = len(canvas)
    min_x = max(0, int(min(p1[0], p2[0], p3[0])))
    max_x = min(size, int(max(p1[0], p2[0], p3[0]) + 1))
    min_y = max(0, int(min(p1[1], p2[1], p3[1])))
    max_y = min(size, int(max(p1[1], p2[1], p3[1]) + 1))

    def sign(pa: tuple[float, float], pb: tuple[float, float], pc: tuple[float, float]) -> float:
        return (pa[0] - pc[0]) * (pb[1] - pc[1]) - (pb[0] - pc[0]) * (pa[1] - pc[1])

    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            pt = (x + 0.5, y + 0.5)
            b1 = sign(pt, p1, p2) < 0.0
            b2 = sign(pt, p2, p3) < 0.0
            b3 = sign(pt, p3, p1) < 0.0
            if b1 == b2 == b3:
                canvas[y][x] = color


def fill_circle(
    canvas: list[list[tuple[int, int, int, int]]],
    cx: float,
    cy: float,
    radius: float,
    color: tuple[int, int, int, int],
) -> None:
    size = len(canvas)
    min_x = max(0, int(cx - radius - 1))
    max_x = min(size, int(cx + radius + 1))
    min_y = max(0, int(cy - radius - 1))
    max_y = min(size, int(cy + radius + 1))
    radius_sq = radius * radius

    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            dx = (x + 0.5) - cx
            dy = (y + 0.5) - cy
            if dx * dx + dy * dy <= radius_sq:
                canvas[y][x] = color


def draw_line(
    canvas: list[list[tuple[int, int, int, int]]],
    start: tuple[float, float],
    end: tuple[float, float],
    thickness: float,
    color: tuple[int, int, int, int],
) -> None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    steps = max(1, int(max(abs(dx), abs(dy)) * 2))
    radius = thickness / 2

    for step in range(steps + 1):
        t = step / steps
        x = start[0] + dx * t
        y = start[1] + dy * t
        fill_circle(canvas, x, y, radius, color)


def draw_icon(size: int) -> list[list[tuple[int, int, int, int]]]:
    s = size / 128
    canvas = new_canvas(size)
    fill_rounded_rect(canvas, 8 * s, 8 * s, 120 * s, 120 * s, 24 * s)

    thickness = 8 * s
    draw_line(canvas, (40 * s, 34 * s), (88 * s, 34 * s), thickness, WHITE)
    draw_line(canvas, (88 * s, 34 * s), (88 * s, 54 * s), thickness, WHITE)
    draw_line(canvas, (78 * s, 46 * s), (88 * s, 56 * s), thickness, WHITE)
    draw_line(canvas, (88 * s, 56 * s), (98 * s, 46 * s), thickness, WHITE)

    draw_line(canvas, (88 * s, 94 * s), (40 * s, 94 * s), thickness, WHITE)
    draw_line(canvas, (40 * s, 94 * s), (40 * s, 74 * s), thickness, WHITE)
    draw_line(canvas, (50 * s, 82 * s), (40 * s, 72 * s), thickness, WHITE)
    draw_line(canvas, (40 * s, 72 * s), (30 * s, 82 * s), thickness, WHITE)

    fill_rounded_rect_color(canvas, 34 * s, 42 * s, 54 * s, 58 * s, 4 * s, WHITE)
    fill_rounded_rect_color(canvas, 74 * s, 70 * s, 94 * s, 86 * s, 4 * s, WHITE)
    return canvas


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, canvas: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(canvas)
    width = len(canvas[0])
    raw = bytearray()
    for row in canvas:
        raw.append(0)
        for r, g, b, a in row:
            raw.extend((r, g, b, a))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=9)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(ICON_DIR / f"icon-{size}.png", draw_icon(size))


if __name__ == "__main__":
    main()
