# openui-astryx-bindle

High-value **`hobo-code`** template — first paint under `public/`.

```text
  1·generate → 2·edit → 3·lock → evidence
  ● done · ▸ current · ○ todo
```

| Layer | What you get |
|---|---|
| Visual | Dark shell + step rail (`public/index.html` + `styles.css`) |
| Flags | Gherkin linked to OpenFeature `app.visual.primary` |
| Evidence | Playwright + recording + screenshots on pass |
| Platform | FinOps / Harness / Station — no parallel control plane |

## Quick start

```bash
# scaffold (from project root)
hobo-code scaffold --name my-app

# default verb is dispatch — bare prompt is work
hobo-code "refine the openui first paint"
```

1. Open `public/index.html` — first-paint frame (dark shell, step rail, responsive grid, reduced-motion safe).
2. Edit in context, then **lock** an OpenUI intermediary artifact.
3. Treat locked HTML as truth · codegen.

## Tokens

Palette lives in `public/styles.css` so OpenUI lock-ins match the scaffold:

- `--bg` / `--panel` / `--line`
- `--text` / `--muted`
- `--accent` / `--ok`

## Product shape

- Binary: **`hobo-code`** (not a `hobo` verb)
- Default verb: **`dispatch`**
- Flat verbs only (no nested hive subcommand)
