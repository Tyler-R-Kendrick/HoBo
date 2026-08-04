"""Sync Bo's latest approved assets into Spriterrific's viewer contract."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[2]
SOURCE_RUN = Path(__file__).resolve().parent
VIEWER_GROUP = PROJECT / "runs/bo-latest"
PUBLIC_ACTIONS = PROJECT / "site/public/parallax/bo-actions"
WEST_WALK = SOURCE_RUN / "walk-w-asymmetric"
RUNTIME = SOURCE_RUN / "runtime"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy(path: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)


def write_review(run_dir: Path, label: str, source: Path) -> None:
    review = run_dir / "review/index.md"
    review.parent.mkdir(parents=True, exist_ok=True)
    review.write_text(
        "\n".join(
            (
                f"# {label}",
                "",
                "Latest approved Bo runtime asset.",
                "",
                f"- Source: `{source.relative_to(PROJECT)}`",
                "- Viewer sheet: `../export/spritesheet.png`",
                "- Viewer GIF: `../export/preview.gif`",
                "- Viewer frames: `../normalized/`",
                "",
            )
        )
    )


def sync_action(action_dir: str, timing: str) -> dict:
    source = RUNTIME / action_dir
    manifest = json.loads((source / "manifest.json").read_text())
    run_dir = VIEWER_GROUP / action_dir
    export = run_dir / "export"
    normalized = run_dir / "normalized"
    export.mkdir(parents=True, exist_ok=True)
    normalized.mkdir(parents=True, exist_ok=True)

    for name in ("manifest.json", "spritesheet.png", "preview.gif", "finalize-runtime.json"):
        copy(source / name, export / name)
    frame_paths = sorted((source / "frames").glob("frame-*.png"))
    for frame in frame_paths:
        copy(frame, normalized / frame.name)
    copy(frame_paths[0], run_dir / "input/source.png")

    created_at = datetime.now(timezone.utc).isoformat()
    run_json = {
        "version": 1,
        "spriterrificVersion": "0.20.2",
        "runId": f"bo-latest-{action_dir}",
        "createdAt": created_at,
        "completedAt": created_at,
        "status": "completed",
        "action": manifest["action"],
        "direction": manifest["direction"],
        "mode": manifest["mode"],
        "animationTiming": timing,
        "loopable": False,
        "frameCount": manifest["frames"],
        "fps": manifest["fps"],
        "frameWidth": manifest["frameWidth"],
        "frameHeight": manifest["frameHeight"],
        "columns": manifest["columns"],
        "rows": manifest["rows"],
        "sourceRuntime": str(source.relative_to(PROJECT)),
        "publicAssetReady": manifest["publicAssetReady"],
    }
    write_json(run_dir / "run.json", run_json)
    write_review(run_dir, action_dir, source)
    return {
        "id": action_dir,
        "path": action_dir,
        "action": manifest["action"],
        "direction": manifest["direction"],
        "frames": manifest["frames"],
        "fps": manifest["fps"],
        "sheetSha256": digest(export / "spritesheet.png"),
        "publicSheetSha256": digest(PUBLIC_ACTIONS / action_dir / "spritesheet.png"),
    }


def sync_walk() -> dict:
    run_dir = VIEWER_GROUP / "walk-w"
    export = run_dir / "export"
    normalized = run_dir / "normalized"
    export.mkdir(parents=True, exist_ok=True)
    normalized.mkdir(parents=True, exist_ok=True)

    sheet = WEST_WALK / "bo-walk-left.png"
    preview = WEST_WALK / "review-export/review/preview-36f-160x157.gif"
    frames = sorted((WEST_WALK / "review-export/frames-160x157").glob("frame-*.png"))
    copy(sheet, export / "spritesheet.png")
    copy(preview, export / "preview.gif")
    copy(WEST_WALK / "size-contract-audit.json", export / "size-contract-audit.json")
    for frame in frames:
        copy(frame, normalized / frame.name)
    copy(frames[0], run_dir / "input/source.png")

    manifest = {
        "version": 1,
        "action": "walk",
        "direction": "w",
        "mode": "deterministic-mirror-with-asymmetric-occlusion",
        "spritesheet": "spritesheet.png",
        "previewGif": "preview.gif",
        "frameWidth": 160,
        "frameHeight": 157,
        "columns": 6,
        "rows": 6,
        "frames": 36,
        "fps": 20,
        "anchor": {"x": 80, "y": 153},
        "sourceRun": "bo-comprehensive-20260728/walk-w-asymmetric",
        "publicAssetReady": True,
        "sizeContractAudit": "size-contract-audit.json",
    }
    write_json(export / "manifest.json", manifest)
    created_at = datetime.now(timezone.utc).isoformat()
    write_json(
        run_dir / "run.json",
        {
            "version": 1,
            "spriterrificVersion": "0.20.2",
            "runId": "bo-latest-walk-w",
            "createdAt": created_at,
            "completedAt": created_at,
            "status": "completed",
            "action": "walk",
            "direction": "w",
            "mode": manifest["mode"],
            "animationTiming": "loop",
            "loopable": True,
            "frameCount": 36,
            "fps": 20,
            "frameWidth": 160,
            "frameHeight": 157,
            "columns": 6,
            "rows": 6,
            "sourceRuntime": str(WEST_WALK.relative_to(PROJECT)),
            "publicAssetReady": True,
        },
    )
    write_review(run_dir, "walk-w", WEST_WALK)
    return {
        "id": "walk-w",
        "path": "walk-w",
        "action": "walk",
        "direction": "w",
        "frames": 36,
        "fps": 20,
        "sheetSha256": digest(export / "spritesheet.png"),
        "publicSheetSha256": digest(PROJECT / "site/public/parallax/bo-walk-left.png"),
    }


def main() -> None:
    VIEWER_GROUP.mkdir(parents=True, exist_ok=True)
    assets = [
        sync_walk(),
        sync_action("jump-w", "transition"),
        sync_action("hurt-w", "one_shot"),
        sync_action("bindle-adjust-w", "one_shot"),
        sync_action("wave-w", "one_shot"),
        sync_action("sleep-wake-w", "transition"),
    ]
    created_at = datetime.now(timezone.utc).isoformat()
    write_json(
        VIEWER_GROUP / "animation-plan.json",
        {
            "version": 1,
            "groupId": "bo-latest",
            "characterId": "bo",
            "createdAt": created_at,
            "status": "completed",
            "assets": assets,
        },
    )
    write_json(
        VIEWER_GROUP / "manifest.json",
        {
            "version": 1,
            "type": "animation-group",
            "id": "bo-latest",
            "character": "bo",
            "status": "completed",
            "children": [asset["path"] for asset in assets],
        },
    )
    (VIEWER_GROUP / "README.md").write_text(
        "# Bo latest viewer group\n\n"
        "Canonical Spriterrific viewer handoff for latest approved assets only.\n\n"
        "Refresh with:\n\n"
        "```sh\n"
        "spriterrific viewer --run-dir runs/bo-latest/wave-w\n"
        "```\n"
    )

    mismatches = [
        asset["id"]
        for asset in assets
        if asset["sheetSha256"] != asset["publicSheetSha256"]
    ]
    if mismatches:
        raise SystemExit(f"viewer/public sheet mismatch: {', '.join(mismatches)}")


if __name__ == "__main__":
    main()
