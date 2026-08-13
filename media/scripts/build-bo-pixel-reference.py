# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10", "numpy>=1.26"]
# ///
"""Build Bo's pixel reference sheet from the shipped rubberhose sprite sheets.

No generation model is involved: every sprite here is a deterministic
downscale-and-quantize of the approved art in `site/public/parallax/`, so the
identity — bindle arm, eye spacing, fur silhouette — is inherited rather than
re-drawn. The one derived view (NORTH) is the front stand mirrored with its
interior whites removed; mirroring front-to-back keeps the bindle on the same
anatomical shoulder, unlike the forbidden east-west mirror (see
`site/public/parallax/README.md`).

Outputs (both committed, both reproducible from this script alone):
  media/public/reference/bo-pixel-reference.png  - labeled presentation sheet, 4x
  media/public/reference/bo-pixel-sprites.png    - native 1x sprites, 56x56 cells

Run from the repo root:  uv run media/scripts/build-bo-pixel-reference.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PARALLAX = ROOT / "site" / "public" / "parallax"
OUT_DIR = ROOT / "media" / "public" / "reference"
FONT_PATH = (
    ROOT / "packages" / "pixel-village" / "assets" / "fonts" / "kenney" / "KenneyPixel.ttf"
)

# Pixel grid: sprites are 48px tall, flat black/white/transparent.
TARGET_H = 48
ALPHA_THR = 0.30  # box-averaged coverage below this drops the pixel (keeps 1px limbs)
GREY_THR = 128  # ink vs paper split on alpha-weighted mean grey

# HoBo Pixel palette (packages/pixel-village/DESIGN.md) for the sheet chrome only;
# the sprites themselves stay flat black and white, per the character lock.
PAPER = (244, 241, 232)
OUTLINE = (63, 38, 49)
CELL_BG = (139, 155, 180)
MUTE = (82, 96, 124)

SCALE = 4  # presentation upscale, nearest-neighbour


def load_frames(path: Path, cols: int, rows: int, fw: int, fh: int) -> list[np.ndarray]:
    arr = np.asarray(Image.open(path).convert("LA"))
    return [
        arr[r * fh : (r + 1) * fh, c * fw : (c + 1) * fw].copy()
        for r in range(rows)
        for c in range(cols)
    ]


def strip_ground_shadow(frame: np.ndarray) -> np.ndarray:
    """The east walk sheet carries a pale ground ellipse under the feet; reference
    frame hygiene says no ground shadow, so drop light pixels in the feet band."""
    f = frame.copy()
    band = int(f.shape[0] * 0.90)
    light = f[band:, :, 0] > 140
    f[band:, :, 1][light] = 0
    return f


def pixelize(frame: np.ndarray, target_h: int = TARGET_H) -> np.ndarray:
    """Downscale onto the pixel grid and quantize to black/white/transparent."""
    grey = frame[:, :, 0].astype(np.float64)
    alpha = frame[:, :, 1].astype(np.float64) / 255.0
    h, w = alpha.shape
    tw = max(1, round(w * target_h / h))
    a_ds = (
        np.asarray(
            Image.fromarray((alpha * 255).astype(np.uint8)).resize((tw, target_h), Image.BOX)
        ).astype(np.float64)
        / 255.0
    )
    g_ds = np.asarray(Image.fromarray(grey * alpha).resize((tw, target_h), Image.BOX))
    g_mean = np.where(a_ds > 0.01, g_ds / np.maximum(a_ds, 1e-6), 255.0)
    opaque = a_ds >= ALPHA_THR
    white = g_mean >= GREY_THR
    out = np.zeros((target_h, tw, 4), np.uint8)
    out[opaque & ~white] = (0, 0, 0, 255)
    out[opaque & white] = (255, 255, 255, 255)
    return despeckle(out)


def despeckle(px: np.ndarray) -> np.ndarray:
    """Remove opaque pixels with no 4-connected opaque neighbour (dust, not tufts)."""
    a = px[:, :, 3] > 0
    padded = np.pad(a, 1)
    neighbours = (
        padded[:-2, 1:-1].astype(int)
        + padded[2:, 1:-1]
        + padded[1:-1, :-2]
        + padded[1:-1, 2:]
    )
    px[a & (neighbours == 0)] = 0
    return px


def components(mask: np.ndarray) -> np.ndarray:
    """4-connected component labels for a boolean mask (tiny BFS, no scipy)."""
    labels = np.zeros(mask.shape, np.int32)
    nxt = 0
    for sy, sx in zip(*np.nonzero(mask & (labels == 0))):
        if labels[sy, sx]:
            continue
        nxt += 1
        stack = [(int(sy), int(sx))]
        labels[sy, sx] = nxt
        while stack:
            y, x = stack.pop()
            for ny, nx_ in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if (
                    0 <= ny < mask.shape[0]
                    and 0 <= nx_ < mask.shape[1]
                    and mask[ny, nx_]
                    and not labels[ny, nx_]
                ):
                    labels[ny, nx_] = nxt
                    stack.append((ny, nx_))
    return labels


def derive_north(front: np.ndarray) -> np.ndarray:
    """Rear view: mirror the front stand (front-to-back keeps the bindle on the
    same anatomical shoulder), then hide everything a back view cannot see —
    white regions fully enclosed by ink (eyes, and the pole where it crosses in
    front of the body). White that touches the silhouette edge (bundle, pole
    above the shoulder) stays."""
    px = front[:, ::-1].copy()
    white = (px[:, :, 3] > 0) & (px[:, :, 0] > 128)
    transparent = px[:, :, 3] == 0
    labels = components(white)
    pad_t = np.pad(transparent, 1)
    near_edge = (
        pad_t[:-2, 1:-1] | pad_t[2:, 1:-1] | pad_t[1:-1, :-2] | pad_t[1:-1, 2:]
    )
    for lab in range(1, labels.max() + 1):
        comp = labels == lab
        if not (comp & near_edge).any():  # fully enclosed by ink -> occluded from behind
            px[comp] = (0, 0, 0, 255)
    # pupils were black-on-white; with the whites inked there is nothing to clear
    return px


def narrowest_stance(frames: list[np.ndarray], indices: range) -> int:
    """Pick the neutral standing frame the way the site README did: measure the
    opaque column spread of the feet band and take the minimum."""
    best, best_w = indices[0], 10**9
    for i in indices:
        f = frames[i]
        band = f[int(f.shape[0] * 0.85) :, :, 1] > 100
        cols = np.nonzero(band.any(axis=0))[0]
        w = int(cols[-1] - cols[0]) if cols.size else 10**9
        if w < best_w:
            best, best_w = i, w
    return best


def baseline(px: np.ndarray) -> int:
    rows = np.nonzero(px[:, :, 3].any(axis=1))[0]
    return int(rows[-1]) if rows.size else px.shape[0] - 1


def main() -> None:
    walk_e = load_frames(PARALLAX / "bo-walk.png", 6, 6, 160, 157)
    walk_w = load_frames(PARALLAX / "bo-walk-left.png", 6, 6, 160, 157)
    idle = load_frames(PARALLAX / "bo-idle.png", 12, 1, 207, 230)
    stand = load_frames(PARALLAX / "bo-stand.png", 12, 1, 207, 230)

    walk_e = [strip_ground_shadow(f) for f in walk_e]
    walk_w = [strip_ground_shadow(f) for f in walk_w]

    px_stand = {i: pixelize(stand[i]) for i in (0, 5, 11)}
    px_idle = {i: pixelize(idle[i]) for i in (0, 2, 4, 6, 8, 11)}
    stride = [0, 3, 6, 9, 12, 15]  # one 18-frame stride at even phase steps
    px_walk_e = {i: pixelize(walk_e[i]) for i in stride}
    px_walk_w = {i: pixelize(walk_w[i]) for i in stride}

    east_stand = pixelize(walk_e[narrowest_stance(walk_e, range(36))])
    west_stand = pixelize(walk_w[narrowest_stance(walk_w, range(36))])
    north = derive_north(px_stand[0])

    sections = [
        (
            "DIRECTIONS",
            "stand, four facings - the bindle arm is anatomical: E and W are drawn, never mirrored",
            [
                ("N*", north),
                ("E", east_stand),
                ("S", px_stand[0]),
                ("W", west_stand),
            ],
        ),
        (
            "WALK EAST",
            "one stride of the 18-frame cycle, 50ms cadence, frames 0/3/6/9/12/15",
            [(f"f{i}", px_walk_e[i]) for i in stride],
        ),
        (
            "WALK WEST",
            "drawn art, not a mirror - pole behind the body, bundle trailing screen-right",
            [(f"f{i}", px_walk_w[i]) for i in stride],
        ),
        (
            "IDLE (HOP)",
            "rest / cycle / blink, from the 12-frame strip",
            [(f"f{i}" if i != 11 else "blink", px_idle[i]) for i in (0, 2, 4, 6, 8, 11)],
        ),
        (
            "STAND (BREATH)",
            "rest / breath / blink - alpha identical across the strip",
            [("rest", px_stand[0]), ("breath", px_stand[5]), ("blink", px_stand[11])],
        ),
    ]

    write_native_sheet(sections)
    write_presentation_sheet(sections, px_stand[0])


CELL = 56  # native cell for the 1x sprite sheet


def write_native_sheet(sections) -> None:
    cols = max(len(cells) for _, _, cells in sections)
    sheet = np.zeros((len(sections) * CELL, cols * CELL, 4), np.uint8)
    for r, (_, _, cells) in enumerate(sections):
        for c, (_, px) in enumerate(cells):
            h, w = px.shape[:2]
            y = r * CELL + (CELL - 4 - baseline(px) - 1)  # common baseline 4px up
            x = c * CELL + (CELL - w) // 2
            region = sheet[y : y + h, x : x + w]
            region[px[:, :, 3] > 0] = px[px[:, :, 3] > 0]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet).save(OUT_DIR / "bo-pixel-sprites.png")
    print("wrote", OUT_DIR / "bo-pixel-sprites.png", sheet.shape[1], "x", sheet.shape[0])


def write_presentation_sheet(sections, scale_sprite: np.ndarray) -> None:
    h1 = ImageFont.truetype(str(FONT_PATH), 48)
    h2 = ImageFont.truetype(str(FONT_PATH), 28)
    small = ImageFont.truetype(str(FONT_PATH), 22)

    cell = CELL * SCALE
    pad = 24
    label_h = 30
    section_head = 46
    cols = max(len(cells) for _, _, cells in sections)
    width = pad * 2 + cols * (cell + 8) - 8

    scale_row_h = TARGET_H * 4 + 70  # tallest (4x) sample plus label room
    height = (
        pad
        + 78  # header
        + sum(section_head + cell + label_h + 14 for _ in sections)
        + section_head
        + scale_row_h
        + 56  # footer
    )

    img = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(img)

    draw.text((pad, pad - 6), "BO - PIXEL REFERENCE", font=h1, fill=OUTLINE)
    draw.text(
        (pad, pad + 44),
        f"{TARGET_H}px grid - flat black + white on transparency - "
        "derived from site/public/parallax (identity: HoBo Rubberhose lock)",
        font=small,
        fill=MUTE,
    )
    y = pad + 78

    def blit_sprite(px: np.ndarray, x0: int, y0: int, scale: int) -> None:
        im = Image.fromarray(px).resize(
            (px.shape[1] * scale, px.shape[0] * scale), Image.NEAREST
        )
        img.paste(im, (x0, y0), im)

    for title, note, cells in sections:
        draw.text((pad, y), title, font=h2, fill=OUTLINE)
        tw = draw.textlength(title, font=h2)
        draw.text((pad + tw + 16, y + 7), note, font=small, fill=MUTE)
        y += section_head
        for c, (label, px) in enumerate(cells):
            x = pad + c * (cell + 8)
            draw.rectangle([x, y, x + cell - 1, y + cell - 1], fill=CELL_BG, outline=OUTLINE, width=2)
            w, h = px.shape[1] * SCALE, px.shape[0] * SCALE
            bx = x + (cell - w) // 2
            by = y + cell - 4 * SCALE - (baseline(px) + 1) * SCALE
            blit_sprite(px, bx, by, SCALE)
            lw = draw.textlength(label, font=small)
            draw.text((x + (cell - lw) // 2, y + cell + 4), label, font=small, fill=OUTLINE)
        y += cell + label_h + 14

    draw.text((pad, y), "SCALE", font=h2, fill=OUTLINE)
    draw.text(
        (pad + draw.textlength("SCALE", font=h2) + 16, y + 7),
        "integer scaling only, nearest-neighbour - palette: #000000 ink, #ffffff paper, transparent ground",
        font=small,
        fill=MUTE,
    )
    y += section_head
    x = pad
    base_y = y + TARGET_H * 4  # shared baseline for the ramp
    for s in (1, 2, 3, 4):
        w, h = scale_sprite.shape[1] * s, scale_sprite.shape[0] * s
        blit_sprite(scale_sprite, x, base_y - h, s)
        draw.text((x + (w - draw.textlength(f"{s}x", font=small)) // 2, base_y + 6), f"{s}x", font=small, fill=OUTLINE)
        x += w + 28
    for i, (name, col) in enumerate([("ink", (0, 0, 0)), ("paper", (255, 255, 255))]):
        sx = x + 40 + i * 120
        draw.rectangle([sx, base_y - 40, sx + 40, base_y], fill=col, outline=OUTLINE, width=2)
        draw.text((sx + 48, base_y - 34), name, font=small, fill=OUTLINE)

    draw.text(
        (pad, height - 44),
        "N* is derived: front stand mirrored, enclosed whites inked out - "
        "never mirror EAST<->WEST, the bindle would swap arms.",
        font=small,
        fill=MUTE,
    )

    out = OUT_DIR / "bo-pixel-reference.png"
    img.save(out)
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
