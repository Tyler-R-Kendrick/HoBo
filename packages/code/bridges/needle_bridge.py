"""
Cactus Needle tool-call bridge.

Needle (https://github.com/cactus-compute/needle) is a 26M-parameter
encoder-decoder distilled specifically for function calling. It is not a chat
model: given a query and a tool schema it emits the tool calls and nothing
else. That makes it the right component for deciding *what to run*, leaving
prose to the chat model.

The model is loaded once and then served over newline-delimited JSON on
stdin/stdout, because loading JAX weights per turn would cost more than the
inference it enables.

Protocol (one JSON object per line):
  in : {"query": "...", "tools": [ {name, parameters}, ... ]}
  out: {"ok": true, "calls": [ {"name": "...", "arguments": {...}} ]}
       {"ok": false, "error": "..."}
Startup emits {"ok": true, "ready": true} once the weights are resident.
"""

import json
import os
import sys


def _fail(message: str) -> None:
    sys.stdout.write(json.dumps({"ok": False, "error": message}) + "\n")
    sys.stdout.flush()


def main() -> int:
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    needle_dir = os.environ.get("HOBO_CODE_NEEDLE_DIR", os.path.expanduser("~/.cactus/needle"))
    if needle_dir not in sys.path:
        sys.path.insert(0, needle_dir)
    try:
        from huggingface_hub import hf_hub_download
        from needle import (
            SimpleAttentionNetwork,
            generate,
            get_tokenizer,
            load_checkpoint,
        )
    except Exception as exc:  # noqa: BLE001 - report, never crash the shell
        _fail(f"needle unavailable: {exc}")
        return 1

    try:
        checkpoint = os.environ.get("HOBO_CODE_NEEDLE_CHECKPOINT") or hf_hub_download(
            "Cactus-Compute/needle", "needle.pkl"
        )
        params, config = load_checkpoint(checkpoint)
        model = SimpleAttentionNetwork(config)
        tokenizer = get_tokenizer()
    except Exception as exc:  # noqa: BLE001
        _fail(f"needle load failed: {exc}")
        return 1

    sys.stdout.write(json.dumps({"ok": True, "ready": True}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            raw = generate(
                model,
                params,
                tokenizer,
                query=request.get("query", ""),
                tools=json.dumps(request.get("tools", [])),
                stream=False,
            )
            calls = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(calls, dict):
                calls = [calls]
            if not isinstance(calls, list):
                calls = []
            sys.stdout.write(json.dumps({"ok": True, "calls": calls}) + "\n")
        except Exception as exc:  # noqa: BLE001 - one bad turn must not kill the bridge
            sys.stdout.write(json.dumps({"ok": False, "error": str(exc)}) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
