# Bo west wave repair review

## Authority

`accepted-west-idle-base.png` is frame 0 of the shipped idle strip mirrored
west. It supplies the body, eyes, feet, far-side bindle grip, pole, knot, and
bundle. Those pixels remain static.

Only the near-side free-arm region changes. The free arm has a black core and
thin white ink edge. Frames 3–8 hold its upper arm and elbow fixed while the
forearm and hand sweep left-right-left-right.

## Review artifacts

- `source-contact-white.png` — all ten source frames on white.
- `source-contact-dark.png` — same frames on dark gray, proving the white edge
  remains visible without turning the arm white.
- `source-preview.gif` — source timing at 8 FPS.
- `body-lock-audit.json` — static-region hash and frame-edge audit.
- `../runtime/wave-w/` — cleaned, packed, finalized runtime handoff.

The earlier generated body remains preserved at
`../runtime/wave-w-rejected-v1/` and is not a promotion candidate.
