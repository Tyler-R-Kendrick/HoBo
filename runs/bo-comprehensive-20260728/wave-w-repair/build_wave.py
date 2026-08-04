"""Build Bo's west-facing wave from accepted shipped art.

The accepted mirrored idle frame is immutable outside the free-arm repair ROI.
Only the near-side free arm changes. The far-side hand, pole, bindle, body,
eyes, feet, and silhouette remain pixel-identical between frames.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "site/public/parallax/bo-idle.png"
OUT = Path(__file__).resolve().parent
FRAMES = OUT / "source-frames"
SCALE = 4
CELL = 256
BASE_X = 24
BASE_Y = 28


def cubic(
    start: tuple[float, float],
    control_1: tuple[float, float],
    control_2: tuple[float, float],
    end: tuple[float, float],
    steps: int = 32,
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for index in range(steps + 1):
        t = index / steps
        u = 1.0 - t
        x = (
            u**3 * start[0]
            + 3 * u**2 * t * control_1[0]
            + 3 * u * t**2 * control_2[0]
            + t**3 * end[0]
        )
        y = (
            u**3 * start[1]
            + 3 * u**2 * t * control_1[1]
            + 3 * u * t**2 * control_2[1]
            + t**3 * end[1]
        )
        points.append((round(x * SCALE), round(y * SCALE)))
    return points


def clean_free_arm(base: Image.Image) -> Image.Image:
    high = base.resize((base.width * SCALE, base.height * SCALE), Image.Resampling.NEAREST)
    alpha = high.getchannel("A")
    erase = Image.new("L", high.size, 0)
    draw = ImageDraw.Draw(erase)
    polygon = [
        (9 * SCALE, 151 * SCALE),
        (23 * SCALE, 151 * SCALE),
        (25 * SCALE, 157 * SCALE),
        (24 * SCALE, 181 * SCALE),
        (10 * SCALE, 184 * SCALE),
        (8 * SCALE, 169 * SCALE),
    ]
    draw.polygon(polygon, fill=255)
    alpha.paste(0, mask=erase)
    high.putalpha(alpha)
    return high


def draw_arm(
    base: Image.Image,
    elbow: tuple[float, float],
    hand: tuple[float, float],
) -> Image.Image:
    arm = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(arm)
    upper = cubic(
        (27, 155),
        (22, 151),
        ((elbow[0] + 27) / 2, (elbow[1] + 155) / 2),
        elbow,
        steps=16,
    )
    dx = hand[0] - elbow[0]
    dy = hand[1] - elbow[1]
    forearm = cubic(
        elbow,
        (elbow[0] + 0.35 * dx, elbow[1] + 0.35 * dy),
        (hand[0] - 0.2 * dx, hand[1] - 0.2 * dy),
        hand,
        steps=16,
    )
    points = upper + forearm[1:]

    # White ink edge around a solid-black rubber-hose arm.
    draw.line(points, fill=(245, 245, 245, 255), width=6 * SCALE, joint="curve")
    draw.line(points, fill=(0, 0, 0, 255), width=4 * SCALE, joint="curve")

    hx, hy = (round(hand[0] * SCALE), round(hand[1] * SCALE))
    outer = 5 * SCALE
    inner = 4 * SCALE
    draw.ellipse(
        (hx - outer, hy - outer, hx + outer, hy + outer),
        fill=(245, 245, 245, 255),
    )
    draw.ellipse(
        (hx - inner, hy - inner, hx + inner, hy + inner),
        fill=(0, 0, 0, 255),
    )

    # Free arm is the near-side limb. Its black core and white ink edge render
    # in front of the fur; the separate bindle-gripping arm stays in the
    # accepted base and never changes.
    composed = Image.alpha_composite(base, arm)
    return composed.resize((207, 230), Image.Resampling.LANCZOS)


def sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.tobytes()).hexdigest()


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)

    strip = Image.open(SOURCE).convert("RGBA")
    accepted = ImageOps.mirror(strip.crop((0, 0, 207, 230)))
    accepted.save(OUT / "accepted-west-idle-base.png")
    cleaned = clean_free_arm(accepted)

    # Lift, wave side-to-side around a fixed shoulder/elbow, then lower.
    # Frames 3-8 keep the elbow at the same height; only the forearm/hand arcs.
    poses = [
        ((19, 165), (16, 176)),
        ((15, 148), (6, 137)),
        ((12, 130), (15, 108)),
        ((12, 130), (3, 106)),
        ((12, 130), (28, 105)),
        ((12, 130), (3, 106)),
        ((12, 130), (28, 105)),
        ((12, 130), (15, 108)),
        ((15, 148), (6, 137)),
        ((19, 165), (16, 176)),
    ]

    frames: list[Image.Image] = []
    for index, pose in enumerate(poses, start=1):
        sprite = draw_arm(cleaned, *pose)
        frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        frame.alpha_composite(sprite, (BASE_X, BASE_Y))
        frame.save(FRAMES / f"frame-{index:02d}.png")
        frames.append(frame)

    # All pixels outside the free-arm ROI must remain identical. This proves
    # body, bindle grip, pole, bundle, eyes, feet, and anchor do not jitter.
    roi = (BASE_X, BASE_Y + 70, BASE_X + 76, BASE_Y + 202)
    lock_mask = Image.new("L", (CELL, CELL), 255)
    ImageDraw.Draw(lock_mask).rectangle(roi, fill=0)
    reference_locked = Image.composite(frames[0], Image.new("RGBA", (CELL, CELL)), lock_mask)
    locked_hash = sha256(reference_locked)
    locked_mismatches: list[int] = []
    edge_alpha: list[int] = []
    grounded_alpha: list[int] = []
    for frame in frames:
        locked = Image.composite(frame, Image.new("RGBA", (CELL, CELL)), lock_mask)
        locked_mismatches.append(0 if sha256(locked) == locked_hash else 1)
        alpha = frame.getchannel("A")
        edge_alpha.append(
            sum(alpha.crop((0, 0, CELL, 1)).get_flattened_data())
            + sum(alpha.crop((0, 0, 1, CELL)).get_flattened_data())
            + sum(alpha.crop((CELL - 1, 0, CELL, CELL)).get_flattened_data())
        )
        grounded_alpha.append(
            sum(alpha.crop((0, CELL - 1, CELL, CELL)).get_flattened_data())
        )

    audit = {
        "version": 1,
        "kind": "bo-wave-body-lock-audit",
        "source": str(SOURCE.relative_to(ROOT)),
        "acceptedBase": "accepted-west-idle-base.png",
        "frames": len(frames),
        "cell": [CELL, CELL],
        "freeArmRoi": list(roi),
        "lockedRegionHash": locked_hash,
        "lockedPixelMismatchFrames": sum(locked_mismatches),
        "topLeftRightEdgeAlphaByFrame": edge_alpha,
        "groundContactAlphaByFrame": grounded_alpha,
        "bodyBindleFeetEyesStatic": sum(locked_mismatches) == 0,
        "frameBleedDetected": any(edge_alpha),
        "passed": sum(locked_mismatches) == 0 and not any(edge_alpha),
    }
    (OUT / "body-lock-audit.json").write_text(json.dumps(audit, indent=2) + "\n")


if __name__ == "__main__":
    main()
