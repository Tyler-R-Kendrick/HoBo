#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Synthesize the HIGHBALL audio palette (stdlib only, fully deterministic).

DESIGN.md "Game Surface" pins the audio style: mono, lo-fi, 1930s reel —
a brass whistle, a stamp thunk, telegraph clicks, a steam hiss, a spike
chink. These are generated rather than sourced so provenance is trivially
clean (original in-repo works, no third-party licence) and so the palette
stays era-consistent instead of stitched from mismatched sample packs.

Run:  uv run python scripts/synth-audio.py
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050  # deliberately lo-fi; an old-reel band, not hi-fi product chrome
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"
PEAK = 0.72  # leave headroom; these layer under a UI, never dominate it


def _noise(seed: int):
    rng = random.Random(seed)
    return lambda: rng.uniform(-1.0, 1.0)


def _lowpass(samples: list[float], alpha: float) -> list[float]:
    out, prev = [], 0.0
    for s in samples:
        prev += alpha * (s - prev)
        out.append(prev)
    return out


def _highpass(samples: list[float], alpha: float) -> list[float]:
    out, prev_in, prev_out = [], 0.0, 0.0
    for s in samples:
        prev_out = alpha * (prev_out + s - prev_in)
        prev_in = s
        out.append(prev_out)
    return out


def _normalize(samples: list[float]) -> list[float]:
    peak = max((abs(s) for s in samples), default=0.0)
    if peak < 1e-9:
        return samples
    scale = PEAK / peak
    return [s * scale for s in samples]


def _write(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    samples = _normalize(samples)
    frames = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples
    )
    path = OUT / name
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)
    print(f"{name}: {len(samples)} samples, {len(samples) / RATE:.2f}s, {path.stat().st_size} bytes")


def whistle() -> list[float]:
    """Brass steam whistle — the Highball. Two-tone chord, breathy, vibrato."""
    dur = 1.30
    n = int(RATE * dur)
    nz = _noise(101)
    out = []
    for i in range(n):
        t = i / RATE
        # slow swell in, long tail out (a whistle is pulled, not struck)
        env = min(1.0, t / 0.14) * math.exp(-2.0 * max(0.0, t - 0.55))
        vib = 1.0 + 0.006 * math.sin(2 * math.pi * 5.5 * t)
        # minor-third chord reads as a period locomotive whistle
        tone = (
            0.55 * math.sin(2 * math.pi * 466.0 * vib * t)
            + 0.40 * math.sin(2 * math.pi * 554.0 * vib * t)
            + 0.22 * math.sin(2 * math.pi * 698.0 * vib * t)
            + 0.10 * math.sin(2 * math.pi * 932.0 * vib * t)
        )
        out.append(env * (tone + 0.22 * nz()))
    return _lowpass(out, 0.55)


def stamp() -> list[float]:
    """The waybill stamp — wooden slam plus paper crush. Short, weighty."""
    dur = 0.20
    n = int(RATE * dur)
    nz = _noise(202)
    out = []
    for i in range(n):
        t = i / RATE
        thump = math.exp(-46.0 * t) * math.sin(2 * math.pi * 118.0 * t)
        body = math.exp(-30.0 * t) * math.sin(2 * math.pi * 232.0 * t) * 0.45
        crush = math.exp(-70.0 * t) * nz() * 0.55
        out.append(thump + body + crush)
    return _lowpass(out, 0.72)


def telegraph() -> list[float]:
    """A single sounder click — the SSE liveness tick. Very short, dry."""
    dur = 0.045
    n = int(RATE * dur)
    nz = _noise(303)
    out = []
    for i in range(n):
        t = i / RATE
        click = math.exp(-320.0 * t) * nz()
        ping = math.exp(-150.0 * t) * math.sin(2 * math.pi * 1850.0 * t) * 0.55
        out.append(click + ping)
    return _highpass(out, 0.82)


def steam() -> list[float]:
    """Steam hiss — a car needing reauth. Filtered noise with a slow swell."""
    dur = 0.85
    n = int(RATE * dur)
    nz = _noise(404)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.10) * math.exp(-2.6 * max(0.0, t - 0.25))
        out.append(env * nz())
    # band-limit so it hisses rather than rasps
    return _lowpass(_highpass(out, 0.90), 0.40)


def spike() -> list[float]:
    """Bill-spike deny — a metal chink. Denial is crisp, never punitive."""
    dur = 0.26
    n = int(RATE * dur)
    nz = _noise(505)
    out = []
    for i in range(n):
        t = i / RATE
        chink = math.exp(-26.0 * t) * (
            0.60 * math.sin(2 * math.pi * 2450.0 * t)
            + 0.30 * math.sin(2 * math.pi * 3180.0 * t)
        )
        tick = math.exp(-260.0 * t) * nz() * 0.42
        out.append(chink + tick)
    return _highpass(out, 0.60)


def derail() -> list[float]:
    """Derail — the loudest event. Low crunch plus scattering debris."""
    dur = 0.55
    n = int(RATE * dur)
    nz = _noise(606)
    out = []
    for i in range(n):
        t = i / RATE
        crunch = math.exp(-9.0 * t) * nz() * 0.85
        groan = math.exp(-7.0 * t) * math.sin(2 * math.pi * 92.0 * t) * 0.65
        scrape = math.exp(-4.0 * t) * math.sin(2 * math.pi * 61.0 * t) * 0.30
        out.append(crunch + groan + scrape)
    return _lowpass(out, 0.50)


CLIPS = {
    "whistle.wav": whistle,
    "stamp.wav": stamp,
    "telegraph.wav": telegraph,
    "steam.wav": steam,
    "spike.wav": spike,
    "derail.wav": derail,
}


def main() -> None:
    for name, fn in CLIPS.items():
        _write(name, fn())


if __name__ == "__main__":
    main()
