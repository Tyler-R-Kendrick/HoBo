"""Remove provider/chroma color from finalized Bo frames without changing alpha."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps


RUN_ROOT = Path(__file__).resolve().parent
ACTIONS = ("jump-w", "hurt-w", "bindle-adjust-w", "sleep-wake-w")


def main() -> None:
    records = []
    for action in ACTIONS:
        frame_paths = sorted((RUN_ROOT / "runtime" / action / "frames").glob("frame-*.png"))
        action_record = {"action": action, "frames": []}
        for path in frame_paths:
            image = Image.open(path).convert("RGBA")
            alpha = image.getchannel("A")
            gray = ImageOps.grayscale(image)
            neutral = Image.merge("RGBA", (gray, gray, gray, alpha))
            changed = sum(
                1
                for before, after in zip(
                    image.get_flattened_data(),
                    neutral.get_flattened_data(),
                    strict=True,
                )
                if before != after
            )
            neutral.save(path)
            action_record["frames"].append(
                {"frame": path.name, "changedPixels": changed}
            )
        records.append(action_record)

    report = {
        "version": 1,
        "kind": "bo-runtime-neutral-ink-cleanup",
        "method": "luminance-to-rgb; alpha unchanged",
        "actions": records,
    }
    (RUN_ROOT / "runtime-neutral-ink-cleanup.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
