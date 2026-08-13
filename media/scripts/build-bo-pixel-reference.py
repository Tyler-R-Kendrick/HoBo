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

# Pixel grid: sprites are 48px tall, flat black/white/transparent, plus a 1px rim.
TARGET_H = 48
ALPHA_THR = 0.30  # box-averaged coverage below this drops the pixel (keeps 1px limbs)
# Source grey is trimodal: ink 0-64, the pole's light greys 96-160, paper 192-255.
# A pixel is white by *coverage* of light source pixels, not by cell mean — the
# mean dilutes a thin white pole with its own black outline and shreds it.
WHITE_SRC_THR = 96  # source grey at or above this counts as light
WHITE_COV_THR = 0.35  # fraction of the cell that must be light to quantize white

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

    def box(mask: np.ndarray) -> np.ndarray:
        img = Image.fromarray((mask * 255).astype(np.uint8)).resize((tw, target_h), Image.BOX)
        return np.asarray(img).astype(np.float64) / 255.0

    a_ds = box(alpha)
    w_cov = box((grey >= WHITE_SRC_THR) & (alpha > 0.5))
    opaque = a_ds >= ALPHA_THR
    white = opaque & (w_cov >= WHITE_COV_THR)
    out = np.zeros((target_h, tw, 4), np.uint8)
    out[opaque & ~white] = (0, 0, 0, 255)
    out[white] = (255, 255, 255, 255)
    return clean(despeckle(out))


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


def clean(px: np.ndarray) -> np.ndarray:
    """Two targeted repairs, both conservative by design.

    - Drop white fuzz: white components under 4px that touch transparency are
      quantization noise off the silhouette edge, never drawn detail. Interior
      white stays untouched however small — the free arm ends in a deliberate
      one-dot hand, and the stand blink's inner sliver is 1-2px.
    - Fill sack pinholes: black components up to 3px enclosed entirely by
      *exterior* white (white that reaches the silhouette edge — the bundle and
      pole, never the eyes) are the sack's own outline averaging through; ink
      them white. Pupils live inside enclosed white, so they cannot match.
    """
    opaque = px[:, :, 3] > 0
    white = opaque & (px[:, :, 0] > 128)
    transparent = ~opaque
    pad_t = np.pad(transparent, 1)
    near_edge = pad_t[:-2, 1:-1] | pad_t[2:, 1:-1] | pad_t[1:-1, :-2] | pad_t[1:-1, 2:]

    w_labels = components(white)
    exterior = {
        lab
        for lab in range(1, w_labels.max() + 1)
        if ((w_labels == lab) & near_edge).any()
    }
    for lab in range(1, w_labels.max() + 1):
        comp = w_labels == lab
        if lab in exterior and comp.sum() < 4:
            px[comp] = 0  # edge fuzz off the silhouette

    white = (px[:, :, 3] > 0) & (px[:, :, 0] > 128)
    w_labels = components(white)
    black = (px[:, :, 3] > 0) & ~white
    b_labels = components(black)
    for lab in range(1, b_labels.max() + 1):
        comp = b_labels == lab
        if comp.sum() > 3:
            continue
        ys, xs = np.nonzero(comp)
        ring_labels = set()
        enclosed = True
        for y, x in zip(ys, xs):
            for ny, nx_ in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if not (0 <= ny < comp.shape[0] and 0 <= nx_ < comp.shape[1]):
                    enclosed = False
                    break
                if comp[ny, nx_]:
                    continue
                if not white[ny, nx_]:
                    enclosed = False
                    break
                ring_labels.add(int(w_labels[ny, nx_]))
            if not enclosed:
                break
        if enclosed and ring_labels and ring_labels <= exterior:
            px[comp] = (255, 255, 255, 255)
    return px


def add_rim(px: np.ndarray) -> np.ndarray:
    """1px dual rim so the sprite reads on any ground: white against the black
    fur (he is solid ink and vanishes on dark otherwise), black against exposed
    white (so the bundle keeps an outline on paper). 8-neighbour: a 4-neighbour
    rim breaks into dashes along the diagonal fur edges, which reads as noise
    on a dark ground rather than a contour."""
    h, w = px.shape[:2]
    out = np.zeros((h + 2, w + 2, 4), np.uint8)
    out[1:-1, 1:-1] = px
    opaque = out[:, :, 3] > 0
    black = opaque & (out[:, :, 0] < 128)
    white = opaque & ~black

    def spread(mask: np.ndarray) -> np.ndarray:
        p = np.pad(mask, 1)
        return (
            p[:-2, :-2] | p[:-2, 1:-1] | p[:-2, 2:]
            | p[1:-1, :-2] | p[1:-1, 2:]
            | p[2:, :-2] | p[2:, 1:-1] | p[2:, 2:]
        )

    rim_white = ~opaque & spread(black)
    rim_black = ~opaque & spread(white) & ~rim_white
    out[rim_white] = (255, 255, 255, 255)
    out[rim_black] = (0, 0, 0, 255)
    return out


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

    # Rim last: the north derivation needs the raw sprite (a rim would read as
    # an exterior-touching white component and confuse the enclosure test).
    px_stand = {k: add_rim(v) for k, v in px_stand.items()}
    px_idle = {k: add_rim(v) for k, v in px_idle.items()}
    px_walk_e = {k: add_rim(v) for k, v in px_walk_e.items()}
    px_walk_w = {k: add_rim(v) for k, v in px_walk_w.items()}
    east_stand, west_stand, north = add_rim(east_stand), add_rim(west_stand), add_rim(north)

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
        f"{TARGET_H}px grid + 1px rim - flat black + white on transparency - "
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

    draw.text((pad, y), "SCALE + GROUNDS", font=h2, fill=OUTLINE)
    draw.text(
        (pad + draw.textlength("SCALE + GROUNDS", font=h2) + 16, y + 7),
        "integer scaling only, nearest-neighbour - the 1px rim keeps him readable on any ground",
        font=small,
        fill=MUTE,
    )
    y += section_head
    x = pad
    base_y = y + (TARGET_H + 2) * 4  # shared baseline for the ramp (rim included)
    for s in (1, 2, 3, 4):
        w, h = scale_sprite.shape[1] * s, scale_sprite.shape[0] * s
        blit_sprite(scale_sprite, x, base_y - h, s)
        draw.text((x + (w - draw.textlength(f"{s}x", font=small)) // 2, base_y + 6), f"{s}x", font=small, fill=OUTLINE)
        x += w + 28
    # ground swatches: the same 2x sprite on paper, slate and night
    for name, col in (("paper", (255, 255, 255)), ("slate", CELL_BG), ("night", (26, 20, 32))):
        w, h = scale_sprite.shape[1] * 2, scale_sprite.shape[0] * 2
        bw = w + 24
        draw.rectangle([x, base_y - h - 24, x + bw, base_y], fill=col, outline=OUTLINE, width=2)
        blit_sprite(scale_sprite, x + 12, base_y - h - 6, 2)
        draw.text((x + (bw - draw.textlength(name, font=small)) // 2, base_y + 6), name, font=small, fill=OUTLINE)
        x += bw + 20

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
