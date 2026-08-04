"""Audit finalized Bo runtime sheets for packing, edge, and color bleed."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RUN_ROOT = Path(__file__).resolve().parent
PUBLIC_ROOT = ROOT / "site/public/parallax/bo-actions"
ACTIONS = ("jump-w", "hurt-w", "bindle-adjust-w", "wave-w", "sleep-wake-w")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def edge_alpha(image: Image.Image) -> dict[str, int]:
    alpha = image.getchannel("A")
    width, height = image.size
    return {
        "top": sum(alpha.crop((0, 0, width, 1)).get_flattened_data()),
        "left": sum(alpha.crop((0, 0, 1, height)).get_flattened_data()),
        "right": sum(alpha.crop((width - 1, 0, width, height)).get_flattened_data()),
        "bottom": sum(
            alpha.crop((0, height - 1, width, height)).get_flattened_data()
        ),
    }


def colored_foreground_pixels(image: Image.Image) -> int:
    count = 0
    for red, green, blue, alpha in image.get_flattened_data():
        if alpha and max(red, green, blue) - min(red, green, blue) > 2:
            count += 1
    return count


def main() -> None:
    records = []
    for action in ACTIONS:
        runtime = RUN_ROOT / "runtime" / action
        public = PUBLIC_ROOT / action
        manifest = json.loads((runtime / "manifest.json").read_text())
        frame_paths = sorted((runtime / "frames").glob("frame-*.png"))
        frames = [Image.open(path).convert("RGBA") for path in frame_paths]
        columns = manifest["columns"]
        rows = manifest["rows"]
        width = manifest["frameWidth"]
        height = manifest["frameHeight"]

        packed = Image.new("RGBA", (columns * width, rows * height), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            packed.alpha_composite(
                frame,
                ((index % columns) * width, (index // columns) * height),
            )

        runtime_sheet = Image.open(runtime / "spritesheet.png").convert("RGBA")
        edge_records = [edge_alpha(frame) for frame in frames]
        colored = [colored_foreground_pixels(frame) for frame in frames]
        edge_bleed = any(
            edge[side] for edge in edge_records for side in ("top", "left", "right")
        )

        checks = {
            "manifestPublicReady": manifest.get("publicAssetReady") is True,
            "frameCountMatches": len(frames) == manifest["frames"],
            "frameSizesMatch": all(frame.size == (width, height) for frame in frames),
            "packedPixelsMatch": packed.tobytes() == runtime_sheet.tobytes(),
            "publicSheetMatches": digest(runtime / "spritesheet.png")
            == digest(public / "spritesheet.png"),
            "publicManifestMatches": digest(runtime / "manifest.json")
            == digest(public / "manifest.json"),
            "topLeftRightEdgeBleed": edge_bleed,
            "coloredForegroundPixels": sum(colored),
        }
        passed = (
            checks["manifestPublicReady"]
            and checks["frameCountMatches"]
            and checks["frameSizesMatch"]
            and checks["packedPixelsMatch"]
            and checks["publicSheetMatches"]
            and checks["publicManifestMatches"]
            and not checks["topLeftRightEdgeBleed"]
            and checks["coloredForegroundPixels"] == 0
        )
        records.append(
            {
                "action": action,
                "frames": len(frames),
                "cell": [width, height],
                "grid": [columns, rows],
                "checks": checks,
                "edgeAlphaByFrame": edge_records,
                "coloredForegroundPixelsByFrame": colored,
                "passed": passed,
            }
        )

    report = {
        "version": 1,
        "kind": "bo-runtime-sheet-hygiene-audit",
        "actions": records,
        "passed": all(record["passed"] for record in records),
    }
    (RUN_ROOT / "runtime-sheet-hygiene-audit.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
