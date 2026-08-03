# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Derive the bindlebug NPC sprite family from Bo's idle sheet.

Pure image processing (no image-generation APIs):
  1. Slice assets/bo/bo-idle.png per the manifest grid (12x1, 207x230,
     margin 0, spacing 0).
  2. Lanczos-downscale every frame to 50% (premultiplied alpha, so the
     antialiased ink edges stay halo-free over transparency).
  3. Re-pack three 12x1 variant sheets, differentiated by small
     deterministic ink-only accessory marks (pure #101010 / #ffffff),
     anchored per frame to the opaque silhouette so they track the
     idle bounce:
       a. tiny flat cap (crown + brim) on the head tufts
       b. round patch (ink disc + 2px white inner ring) body lower-left
       c. tiny neckerchief triangle below the eyes
     Every mark is verified to sit fully INSIDE the body silhouette.

Run:  uv run --with pillow python scripts/derive-bindlebugs.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "bo" / "bo-idle.png"
OUT_DIR = ROOT / "assets" / "bindlebugs"

# Manifest grid for bo-idle (assets/assets_index.json: 12x1, no margin/spacing).
COLUMNS, ROWS = 12, 1
SRC_FRAME_W, SRC_FRAME_H = 207, 230

INK = (16, 16, 16, 255)  # #101010 per DESIGN.md
PAPER = (255, 255, 255, 255)  # #ffffff
ALPHA_OPAQUE = 128  # alpha >= this counts as "inside the silhouette"


def lanczos_half(frame: Image.Image, w: int, h: int) -> Image.Image:
    """Resize RGBA with premultiplied alpha to avoid edge halos."""
    # Premultiply RGB by alpha.
    px = frame.load()
    pm = Image.new("RGBA", frame.size)
    pm_px = pm.load()
    for y in range(frame.height):
        for x in range(frame.width):
            pr, pg, pb, pa = px[x, y]
            pm_px[x, y] = (pr * pa // 255, pg * pa // 255, pb * pa // 255, pa)
    small = pm.resize((w, h), Image.LANCZOS)
    # Unpremultiply.
    sp = small.load()
    for y in range(h):
        for x in range(w):
            pr, pg, pb, pa = sp[x, y]
            if pa:
                sp[x, y] = (
                    min(255, pr * 255 // pa),
                    min(255, pg * 255 // pa),
                    min(255, pb * 255 // pa),
                    pa,
                )
            else:
                sp[x, y] = (0, 0, 0, 0)
    return small


def opaque_mask(frame: Image.Image) -> list[list[bool]]:
    px = frame.load()
    return [
        [px[x, y][3] >= ALPHA_OPAQUE for x in range(frame.width)]
        for y in range(frame.height)
    ]


def mask_bbox(mask: list[list[bool]]) -> tuple[int, int, int, int]:
    xs = [x for row in mask for x, on in enumerate(row) if on]
    ys = [y for y, row in enumerate(mask) if any(row)]
    return min(xs), min(ys), max(xs), max(ys)


def rect_inside(mask, x0: int, y0: int, x1: int, y1: int) -> bool:
    h, w = len(mask), len(mask[0])
    if x0 < 0 or y0 < 0 or x1 >= w or y1 >= h:
        return False
    return all(mask[y][x] for y in range(y0, y1 + 1) for x in range(x0, x1 + 1))


def find_inside(mask, cx: int, cy: int, mw: int, mh: int) -> tuple[int, int]:
    """Deterministically nudge center (cx, cy) until the mw x mh mark box is
    fully inside the opaque silhouette. Scans down then sideways."""
    for dy in range(0, 40):
        for dx in [0] + [s * d for d in range(1, 16) for s in (-1, 1)]:
            x, y = cx + dx, cy + dy
            x0, y0 = x - mw // 2, y - mh // 2
            if rect_inside(mask, x0, y0, x0 + mw - 1, y0 + mh - 1):
                return x, y
    raise SystemExit(f"no interior anchor for {mw}x{mh} mark near ({cx},{cy})")


def eye_pixels(frame: Image.Image, bbox) -> list[tuple[int, int]]:
    """White eye pixels in the upper-central silhouette bbox.

    The x window skips the left third so the white bindle bundle (which
    hangs at the frame's left edge) is never mistaken for an eye.
    """
    x0, y0, x1, y1 = bbox
    mid = y0 + (y1 - y0) // 2
    ex0 = x0 + (x1 - x0) * 35 // 100
    ex1 = x0 + (x1 - x0) * 85 // 100
    px = frame.load()
    pts = []
    for y in range(y0, mid):
        for x in range(ex0, ex1 + 1):
            r, g, b, a = px[x, y]
            if a >= 200 and r >= 200 and g >= 200 and b >= 200:
                pts.append((x, y))
    return pts


def head_center_x(mask, bbox) -> int:
    """Mean x of opaque pixels in the top 12% of the silhouette bbox."""
    x0, y0, x1, y1 = bbox
    depth = max(2, (y1 - y0) * 12 // 100)
    xs = [
        x
        for y in range(y0, y0 + depth)
        for x in range(x0, x1 + 1)
        if mask[y][x]
    ]
    return sum(xs) // len(xs)


def mark_cap(frame: Image.Image, mask, bbox, ctx: dict) -> None:
    """Variant a: tiny flat cap (crown + brim) on the head tufts."""
    hx = head_center_x(mask, bbox)
    top = bbox[1]
    # Full mark is 14 wide x 7 tall (brim widest). Anchor just under tuft tips.
    cx, cy = find_inside(mask, hx, top + 10, 14, 7)
    d = ImageDraw.Draw(frame)
    # Crown: 10x4 ink rect, 1px white outline.
    d.rectangle([cx - 5, cy - 3, cx + 4, cy + 1], fill=INK, outline=PAPER)
    # Brim: 14x2 ink rect under the crown, 1px white outline.
    d.rectangle([cx - 7, cy + 1, cx + 6, cy + 3], fill=INK, outline=PAPER)


def mark_patch(frame: Image.Image, mask, bbox, ctx: dict) -> None:
    """Variant b: round patch (ink disc + 2px white inner ring), body lower-left."""
    x0, y0, x1, y1 = bbox
    tx = x0 + (x1 - x0) * 30 // 100
    ty = y0 + (y1 - y0) * 68 // 100
    cx, cy = find_inside(mask, tx, ty, 12, 12)
    d = ImageDraw.Draw(frame)
    d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=INK)  # 11px ink disc
    d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], outline=PAPER, width=2)


def mark_neckerchief(frame: Image.Image, mask, bbox, ctx: dict) -> None:
    """Variant c: tiny neckerchief triangle below the eyes.

    On blink frames the white eye ovals vanish, so the anchor reuses the
    eye offset (relative to the silhouette bbox) from the last open-eye
    frame — the mark keeps tracking the bounce instead of jumping.
    """
    eyes = eye_pixels(frame, bbox)
    if len(eyes) >= 30:  # eyes open — anchor on them, remember the offset
        ex = sum(p[0] for p in eyes) // len(eyes)
        ey = max(p[1] for p in eyes)
        ctx["eye_offset"] = (ex - bbox[0], ey - bbox[1])
    elif "eye_offset" in ctx:  # blink — reuse last good offset
        dx, dy = ctx["eye_offset"]
        ex, ey = bbox[0] + dx, bbox[1] + dy
    else:  # fallback: below upper third of bbox
        ex = (bbox[0] + bbox[2]) // 2
        ey = bbox[1] + (bbox[3] - bbox[1]) // 3
    cx, cy = find_inside(mask, ex, ey + 7, 13, 8)
    d = ImageDraw.Draw(frame)
    # Down-pointing kerchief: 13 wide, 8 tall, ink fill + 1px white outline.
    d.polygon(
        [(cx - 6, cy - 4), (cx + 6, cy - 4), (cx, cy + 3)],
        fill=INK,
        outline=PAPER,
    )


VARIANTS = {
    "a": mark_cap,
    "b": mark_patch,
    "c": mark_neckerchief,
}


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    expected = (COLUMNS * SRC_FRAME_W, ROWS * SRC_FRAME_H)
    if sheet.size != expected:
        raise SystemExit(f"bo-idle.png is {sheet.size}, expected {expected}")

    out_w = round(SRC_FRAME_W / 2)  # 104
    out_h = round(SRC_FRAME_H / 2)  # 115

    frames = []
    for i in range(COLUMNS * ROWS):
        col, row = i % COLUMNS, i // COLUMNS
        box = (
            col * SRC_FRAME_W,
            row * SRC_FRAME_H,
            (col + 1) * SRC_FRAME_W,
            (row + 1) * SRC_FRAME_H,
        )
        frames.append(lanczos_half(sheet.crop(box), out_w, out_h))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    variant_frame0 = {}
    for name, mark in VARIANTS.items():
        packed = Image.new("RGBA", (out_w * len(frames), out_h), (0, 0, 0, 0))
        ctx: dict = {}
        for i, base in enumerate(frames):
            frame = base.copy()
            mask = opaque_mask(frame)
            mark(frame, mask, mask_bbox(mask), ctx)
            packed.paste(frame, (i * out_w, 0))
            if i == 0:
                variant_frame0[name] = frame
        out = OUT_DIR / f"bindlebug-{name}.png"
        packed.save(out)
        print(
            f"bindlebug-{name}.png: sheet {packed.width}x{packed.height} "
            f"= {len(frames)}x1 grid @ frame {out_w}x{out_h}"
        )

    # Preview strip: frame 0 of a/b/c on paper, 3x nearest for inspection.
    zoom = 3
    strip = Image.new(
        "RGB", (out_w * 3 * zoom, out_h * zoom), (255, 255, 255)
    )
    for i, name in enumerate(VARIANTS):
        f = variant_frame0[name].resize(
            (out_w * zoom, out_h * zoom), Image.NEAREST
        )
        strip.paste(f, (i * out_w * zoom, 0), f)
    preview = OUT_DIR / "preview.png"
    strip.save(preview)
    print(f"preview.png: {strip.width}x{strip.height} (a|b|c frame 0 at {zoom}x)")


if __name__ == "__main__":
    main()
