# Changelog

All notable changes to VGD Skills will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

## [1.10.0] - 2026-07-26

### Changed

- **unity-cli** — synced the `.claude` mirror up to the canonical `.agents` tree (skill internal version `1.1.0` → `1.7.0`); the `1.9.0` release had shipped the `.claude` copy stale at `1.1.0`. Adds field-lesson content accumulated across real driving sessions: **Workflow G** (agent scene composition — `-automated` Editor, place→measure→assert loop, composition/AABB/contact audits, unit forensics and surface-vs-bounding-box, layout reachability via ASCII walkability map) and **Workflow H** (shader/render look-dev — `ShaderUtil.GetShaderMessages` since shader errors are invisible to `get_console_logs`, `capture_game_view` project-root scoping, Play-Mode gating of scene vs asset edits, test-isolation gotchas), plus the matching anti-patterns and changelog entries `1.2.0`–`1.7.0` in `SKILL.md`, `references/agent-workflows.md`, and `references/pipeline-and-commands.md`. Both trees are now identical.

## [1.9.0] - 2026-07-23

### Added

- **unity-cli** — new skill for driving Unity from the terminal with the experimental `unity` CLI. Covers three layers over one observe → act → verify loop: **Manage** (install/manage Editors and modules, auth, open projects), **Drive** (control a live Editor/Player via `com.unity.pipeline` — `command`, `eval`/`eval_file`, custom `[CliCommand]`s, targeting with `--project-path`/`--runtime`), and **CI/Batchmode** (`unity test`/`build`/`run`, plus MCP wiring for agents). Includes a decision tree, JSON-for-machines guidance, an anti-patterns catalog (progress-scraping, stale command lists, GUID-vs-filename wiring, treating a clean console as full verification), and three references (`cli-reference.md`, `pipeline-and-commands.md`, `agent-workflows.md`). Field-tested against Unity CLI `1.0.0-beta.2`, `com.unity.pipeline` `0.3.1-exp.1`, and Unity Editor `6000.5.4f1`. Synced across the `.agents` and `.claude` trees.

## [1.8.5] - 2026-07-01

### Fixed

- **fal-ai-image** — reconciled `scripts/fal_queue_image_run.py`, which had diverged between the `.agents` and `.claude` trees with each side carrying only half the fixes. The merged script now has all three: (1) `SENSITIVE_KEYS` / `_redact_sensitive()` secret-redaction on `resolved_arguments` and `explicit_overrides` before the run manifest is written (the `.claude` copy had lost this, so a credential passed via `--extra-json`/overrides could be written in plaintext into a committed `*-run.json`); (2) the raw-queue fallback now derives `status_url`/`response_url` from fal's submission payload instead of reconstructing from `endpoint_id`, so `/edit` endpoints no longer 405 (the `.agents` copy had lacked this); (3) the `logs=1` 405 retry. Both trees are now identical.

## [1.8.4] - 2026-07-01

### Added

- **fal-ai-image** — new `nano-banana-2-lite-t2i` / `nano-banana-2-lite-edit` presets in `assets/model-presets.json` (endpoints `google/nano-banana-2-lite` and `google/nano-banana-2-lite/edit`, note the `google/` prefix), plus `SKILL.md` list entries and a `references/fal-image-models.md` section: Gemini 3.1 Flash Lite Image tier, fixed 1K (1024x1024) output with **no `resolution` control**, sub-2s latency for cheap iteration before promoting to Nano Banana 2/Pro

### Changed

- **fal-ai-image** — retired GPT Image 1.5 in favor of GPT Image 2.0: removed the `gpt-image-1.5-t2i` / `gpt-image-1.5-edit` presets, `SKILL.md` list entries, and the GPT Image 1.5 reference section; `SKILL.md` now lists `gpt-image-2-t2i` / `gpt-image-2-edit` and the transparency guidance no longer points at 1.5 (prefer chroma-key across all presets)

### Fixed

- **fal-ai-image** — corrected the `gpt-image-2` endpoint prefix to the verified `openai/gpt-image-2` (was mistakenly `fal-ai/gpt-image-2` in an in-progress edit, which 404s); fixed the `image_size` reference note to document named presets **and** custom `{width, height}` objects (multiples of 16, ≤3840px, ratio ≤3:1) instead of falsely claiming pixel dimensions are unsupported; generalized the `/edit` status-URL gotcha into its own reference section

## [1.8.3] - 2026-06-21

### Fixed

- **animated-spritesheets** — `scripts/build_contact_sheet.py` no longer crashes on systems without the macOS/Linux fonts (e.g. Windows). It now tries an explicit `--font-path`, then a cross-platform candidate list including Windows fonts (`verdanab.ttf`, `arialbd.ttf`, `segoeui.ttf`), and finally falls back to PIL's default bitmap font with a clear "no usable TrueType font found for this OS" message instead of raising `OSError: cannot open resource`

## [1.8.2] - 2026-05-29

### Added

- **phaser-capacitor-ios** — build and ship Phaser games to iOS with Capacitor and Vite: iOS landscape or portrait orientation, Swift Package Manager, shell-mode gating, WKWebView-safe HUDs, mobile touch controls, virtual joysticks, safe areas, simulator run loops, and browser/mobile parity; listed under **Game Engines & Frameworks** in the README

## [1.8.1] - 2026-05-18

### Added

- **fal-ai-video** — new image-to-video presets in `assets/model-presets.json`: `seedance-2.0-i2v` (`bytedance/seedance-2.0/image-to-video`, defaults `duration=4`, `resolution=720p`, `aspect_ratio=16:9`, `generate_audio=false`), `seedance-2.0-fast-i2v`, `wan-2.7` (`fal-ai/wan/v2.7/image-to-video`, `duration=2`, `resolution=1080p`, `aspect_ratio=1:1`, prompt expansion off, sprite-preservation negative prompt), `wan-2.5` (`fal-ai/wan-25-preview/image-to-video`), and `grok-imagine-video-i2v` (`xai/grok-imagine-video/image-to-video`, `duration=1`, `resolution=720p`, `aspect_ratio=1:1`)
- **fal-ai-video** — `SKILL.md` *Current Sprite-Relevant Presets* section and short-clip preference guidance for sprite motion tests; `references/fal-video-models.md` sections for WAN 2.7, WAN 2.5, and Grok Imagine with model pages, schema notes, and current sprite defaults
- **animated-spritesheets** — `SKILL.md` preserve-canvas video sprite workflow guidance and *foreground-fitting video frames by default* anti-pattern; clarifies when to run pixel snapping on video-derived frames vs. generated sheet crops

### Changed

- **fal-ai-video** — `scripts/fal_video_experiment_matrix.py` no longer injects a fallback `--duration=6`; it only forwards `--duration` when the matrix config explicitly sets it, so per-preset duration defaults in `model-presets.json` are preserved by default

### Fixed

- **pixel-snapper** — `scripts/pixel_snapper.py` now clamps quantized RGB centers to `[0, 255]` before the `uint8` cast, preventing palette clipping/wraparound on edge-case inputs where rounding could push channel values outside the valid range

## [1.8.0] - 2026-05-04

### Added

- **gemini-image** — Google Gemini image generation across `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, and `gemini-2.5-flash-image` (Nano Banana): model selection guide, `imageConfig` (aspect ratio, image size 0.5K/1K/2K/4K), thinking mode, multi-image reference composition with role labeling, multi-turn chat editing, Google Search grounding, batch API notes, and SynthID/limitations coverage; bundles `scripts/gemini_image_generate.py` and `scripts/gemini_image_edit.py` as stdlib `urllib` wrappers around `POST /v1beta/models/{model}:generateContent`; listed under **Image & Video Generation** in the README

## [1.7.0] - 2026-04-29

### Added

- **pixel-snapper** — recover the true low-resolution pixel grid from upscaled or AI-generated "fake pixel art" PNGs (e.g. 1024x1024 renders that conceptually have ~100x100 chunky pixels); bundles `scripts/pixel_snapper.py`, a self-contained `uv` Python port of Hugo Duprez's Rust [`spritefusion-pixel-snapper`](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) (MIT) that produces dimensionally identical output, plus `scripts/pixel_snapper_sheet.py` for known-layout spritesheets (crops, snaps, and reassembles per-frame); listed under **Assets & Pipeline** in the README

## [1.6.1] - 2026-04-28

### Added

- **animated-spritesheets** — `scripts/normalize_flat_bg_frames.py` for opaque flat-background sheets: corner flood-fill background detection, foreground crop, and re-anchor to a shared center/bottom origin so idle/walk frames stop drifting inside their nominal cells
- **animated-spritesheets** — `references/prompt-patterns.md` sections *Reference Inputs For Image-Generated Spritesheets* (image-role labeling for `gpt-image-2`) and *Background Constraints For Later Removal* (flat chroma rules, `#00FF00` default, palette-aware color choice)

### Changed

- **animated-spritesheets** — `SKILL.md` now routes opaque flat-background crops through `normalize_flat_bg_frames.py` before GIF/runtime export; existing single-frame and sheet prompt templates tightened to require one exact flat chroma background with no gradients, shadows, or faux-transparency artifacts

## [1.6.0] - 2026-04-27

### Added

- **animated-spritesheets** — turn a single character reference image into an animated spritesheet via prompting, full-sheet frame recovery, background cleanup, frame normalization, contact sheets, and GIF previews; includes guidance for using neutral plates (not checker/grid backgrounds) on image-to-video walk-cycle source motion
- **gamedev-assets** — `asset_sprite_baseline.py` script and `Sprite Baseline Audit/Fix` workflow for measuring visible alpha bounds and rebaselining feet, with foot-baseline diagnosis guidance for floating shadow / origin bugs
- **fal-ai-video** — `seedance-2.0-i2v` and `seedance-2.0-fast-i2v` presets in `assets/model-presets.json` for `bytedance/seedance-2.0/image-to-video`
- **fal-ai-video** — sprite walk-cycle start-image guidance and anti-pattern: prefer a neutral `1280x720` flat-background anchor plate over checkerboards or grid sheets for image-to-video walk cycles

### Changed

- Ignored external skill symlinks (`sound-effects`, `text-to-speech`, `music`, `capture`) so they no longer surface as untracked in this repo

## [1.5.1] - 2026-04-22

### Added

- **fal-ai-image** — `gpt-image-2-t2i` and `gpt-image-2-edit` presets in `assets/model-presets.json` for running OpenAI `gpt-image-2` via fal.ai (text-to-image and image edit endpoints)
- **fal-ai-image** — reference notes for the `gpt-image-2` generate and edit endpoints in `references/fal-image-models.md`, including fal-side control surface and comparison workflow guidance

### Fixed

- **fal-ai-image** — edit endpoints (paths ending in `/edit`) were hitting 405 because the status URL was reconstructed from `endpoint_id` instead of the submission response. The `fal_queue_image_run.py` script now uses the `status_url`/`response_url` from the queue submission payload, with a logs-off retry fallback
- **fal-ai-image** — resolved arguments and explicit overrides written to tracking artifacts are now redacted for sensitive keys (`openai_api_key`, `api_key`, `authorization`, `fal_key`, `fal_api_key`)

## [1.5.0] - 2026-04-22

### Added

- **gpt-image-2-0** — OpenAI `gpt-image-2` image generation and editing: arbitrary-size outputs (up to `3840x2160`), high-fidelity multi-image reference edits, prompt scaffolding, and runnable Images API scripts for `POST /v1/images/generations` and `POST /v1/images/edits`

## [1.4.0] - 2026-04-16

### Added

- **colyseus-multiplayer** — Colyseus multiplayer game development: authoritative Node.js server, state sync, room/schema design, reconnection, matchmaker, Colyseus Cloud deployment, and client wiring for Phaser, Three.js, and React
- **phaser4-gamedev** — Phaser 4 game development: WebGL-first rendering, filters, lighting, shaders, DynamicTexture/RenderTexture, SpriteGPULayer, TilemapGPULayer, and Phaser 3 to 4 migration work
- Added `retro-diffusion` skill entry under **Image & Video Generation** in the README (previously released in 1.3.0 but missing from the README listing)

### Changed

- Added a new **Networking & Multiplayer** category in the README to house multiplayer-focused skills

## [1.3.0] - 2026-04-02

### Added

- **retro-diffusion** — Retro Diffusion pixel-art image generation, img2img edits, spritesheets, and animation workflows (walk cycles, turnarounds, idles, attacks) via the Retro Diffusion API

### Changed

- Moved `elevenlabs-tts` into its own **Audio & Music** category in README, separating it from Assets & Pipeline

## [1.2.0] - 2026-03-26

### Added

- **fal-ai-image** — fal.ai text-to-image and image-edit generation with queue-based workflows, model presets (Grok, Nano Banana, GPT Image), and cost-aware experiment tracking
- **fal-ai-video** — fal.ai image-to-video generation with queue-based inference, model presets (Seedance, Kling, Hailuo, Veo), and multi-model experiment workflows

### Changed

- Grouped skills in README by category: Game Engines & Frameworks, Image & Video Generation, Assets & Pipeline, Testing & Tooling

## [1.1.1] - 2026-03-20

### Added

- Added the Codex-compatible `playwright-testing` skill files under `.agents/skills/playwright-testing/`.
- Added the Claude Code-compatible `elevenlabs-tts` skill files under `.claude/skills/elevenlabs-tts/`.

## [1.1.0] - 2026-03-20

### Changed

- Updated `README.md` to remove the Claude Code vs Codex comparison table and replace it with a simple list of all skills.

## [1.0.0] - 2026-03-19

### Added

- **aseprite-inference** — Parse and infer metadata from Aseprite (.ase/.aseprite) files
- **elevenlabs-tts** — ElevenLabs text-to-speech integration for Node/Python/web apps
- **gamedev-assets** — Asset pipeline utilities: manifest validation, sprite sheet probing, PNG dimension reporting, tilemap debugging
- **gpt-image-1-5** — OpenAI gpt-image-1.5 image generation, prompt design, and transparent-background assets
- **love2d-gamedev** — Complete Love2D game development from prototype to iOS deployment
- **phaser-gamedev** — Phaser 3 game development: scenes, sprites, physics, tilemaps, animations
- **playwright-testing** — Frontend testing across unit/integration/E2E/visual/a11y with Playwright MCP
- **skill-creator-plus** — Philosophy-first skill creation and improvement framework
- **sora-2** — OpenAI Sora 2 video generation, prompt design, and API job handling
- **threejs-builder** — Three.js web apps with modern ES module patterns and GLTF/GLB loading
- **threejs-capacitor-ios** — Three.js apps shipped to iOS via Capacitor with Vite and SPM
