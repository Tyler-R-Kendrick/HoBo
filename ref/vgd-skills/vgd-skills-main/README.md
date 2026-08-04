# VGD Skills

Agent skills for [Claude Code](https://claude.ai/code), [OpenAI Codex](https://openai.com/codex), [Cursor](https://cursor.com), and other agents that support the [agent skills standard](https://agentskills.io) — built for game developers and creators who are members of [vibegamedev.com](https://vibegamedev.com).

## What's Inside

Skills are stored in dot-prefixed (hidden) folders:

```
vgd-skills/
├── .claude/skills/    ← Claude Code
└── .agents/skills/    ← Codex, Cursor, and other compatible agents
```

### Game Engines & Frameworks

- `love2d-gamedev` - Build Love2D games from prototype to release, including core architecture, graphics, animation, tiles, collision, audio, and iOS deployment.
- `phaser-gamedev` - Build 2D browser games with Phaser 3: scene lifecycle, sprites, Arcade and Matter physics, tilemaps, animations, input handling, and game architecture.
- `phaser4-gamedev` - Build 2D browser games with Phaser 4: WebGL-first rendering, filters, lighting, shaders, DynamicTexture/RenderTexture, SpriteGPULayer, TilemapGPULayer, and Phaser 3 to 4 migration work.
- `phaser-capacitor-ios` - Build and ship Phaser games to iOS with Capacitor and Vite: iOS landscape or portrait orientation, Swift Package Manager, shell-mode gating, WKWebView-safe HUDs, mobile touch controls, virtual joysticks, safe areas, simulator run loops, and browser/mobile parity.
- `threejs-builder` - Build simple Three.js web apps with scene setup, lighting, geometries, materials, animation loops, GLTF/GLB loading, and responsive rendering.
- `threejs-capacitor-ios` - Build and ship Three.js apps on Capacitor iOS with Vite and Swift Package Manager, including GLTF loading, OrbitControls, and iOS sync/run troubleshooting.
- `unity-cli` - Drive Unity from the terminal with the `unity` CLI: install and manage Editors and modules, auth, CI batchmode builds and tests, `com.unity.pipeline` automation, `unity command`/`eval` against a live Editor or Player, MCP setup, and structured JSON automation.

### Networking & Multiplayer

- `colyseus-multiplayer` - Design and implement multiplayer games with Colyseus (authoritative Node.js server and state sync): rooms, schemas, reconnection, matchmaker, Colyseus Cloud deployment, and client wiring for Phaser, Three.js, and React.

### Image & Video Generation

- `fal-ai-image` - Use fal.ai for text-to-image and image-edit generation, model comparison, queue-based workflows, and cost-aware experiment tracking with Nano Banana, Grok, and GPT Image endpoints.
- `fal-ai-video` - Use fal.ai for image-to-video generation, model comparison, queue-based inference, and portable multi-model experiment workflows with local prompt and cost logs.
- `gemini-image` - Use Google Gemini image models (Gemini 3 Pro Image, Gemini 3.1 Flash Image, Gemini 2.5 Flash Image / Nano Banana) for image generation, multi-turn editing, multi-image reference composition, character consistency, thinking-mode planning, and Google Search-grounded visuals.
- `gpt-image-1-5` - Use OpenAI `gpt-image-1.5` for image generation, prompt design, transparent-background assets, style-controlled illustrations, concept art, and icons.
- `gpt-image-2-0` - Use OpenAI `gpt-image-2` for image generation and editing, arbitrary-size outputs up to `3840x2160`, multi-image reference prompting, product renders, concept art, and icons.
- `retro-diffusion` - Use Retro Diffusion for pixel-art image generation, img2img edits, spritesheets, and animation workflows such as platformer walk cycles, turnarounds, idle loops, and attack sheets from reference images.
- `sora-2` - Use OpenAI Sora 2 for prompt design, text-to-video generation, image-guided video generation, and API-backed video job handling.

### Assets & Pipeline

- `animated-spritesheets` - Turn a single character reference image into an animated spritesheet via model prompting, full-sheet frame recovery, background cleanup, normalization, contact sheets, and GIF previews.
- `aseprite-inference` - Infer structure and metadata from Aseprite files (`.ase`/`.aseprite`): parse headers, frames, and chunks; compute durations and bounds; and generate JSON for engines and tools.
- `gamedev-assets` - Asset pipeline utilities for 2D game projects: validate asset manifests, probe sprite sheets and tilesets, report PNG dimensions, audit sprite foot baselines, and debug tilemap reconstruction workflows.
- `pixel-snapper` - Recover the true low-resolution pixel grid from upscaled or AI-generated "fake pixel art" PNGs: snap-to-grid cleanup, palette-quantized native-resolution sprites, and known-layout spritesheets via a Python port of Hugo Duprez's `spritefusion-pixel-snapper`.

### Audio & Music

- `elevenlabs-tts` - Build and troubleshoot ElevenLabs text-to-speech integrations in Node, Python, and web apps, including auth, voice and model selection, streaming vs. batch generation, and latency handling.

### Testing & Tooling

- `playwright-testing` - Plan, implement, and debug frontend tests across unit, integration, E2E, visual, and accessibility coverage, including Playwright MCP automation and canvas/WebGL game testing.
- `skill-creator-plus` - Create and improve agent skills with philosophy-first design, anti-pattern prevention, and variation encouragement.

## Showing Hidden Folders

These skills live in dot-prefixed folders (`.claude/` and `.agents/`), which are hidden by default on most operating systems. You'll need to reveal them to browse or manage the files.

### macOS (Finder)

Press **Cmd + Shift + .** (period) in any Finder window to toggle hidden files on and off.

### Windows (File Explorer)

1. Open **File Explorer**
2. Click **View** in the toolbar
3. Check **Hidden items** (Windows 10) or click **Show > Hidden items** (Windows 11)

### Linux (File Manager)

Press **Ctrl + H** in most file managers (Nautilus, Thunar, Dolphin) to toggle hidden files.

### Terminal / Command Line

Hidden files are always visible with the right flag:

```bash
# macOS / Linux
ls -la

# Windows (PowerShell)
Get-ChildItem -Force
```

### VS Code / Cursor

By default, VS Code and Cursor hide dot-folders. To reveal them:

1. Open **Settings** (Cmd/Ctrl + ,)
2. Search for `files.exclude`
3. Remove or disable any entries for `**/.claude` and `**/.agents`

## Installation

Copy the skill folders into your project to make them available to your AI coding agent.

### Claude Code

Copy the `.claude/skills/` folder into your project root. Claude Code automatically discovers skills inside `.claude/skills/` in your working directory.

```bash
# From inside your project directory:
cp -r /path/to/vgd-skills/.claude/skills/ .claude/skills/
```

If you already have a `.claude/` folder in your project, just merge the `skills/` subdirectory into it — your existing settings and configuration won't be affected.

You can also install skills globally so they're available in every project:

```bash
# Global install (available everywhere):
cp -r /path/to/vgd-skills/.claude/skills/ ~/.claude/skills/
```

After copying, Claude Code will detect the skills automatically. If they don't appear, restart Claude Code. You can verify by typing `/skills` or `$` to browse available skills.

### OpenAI Codex

Copy the `.agents/skills/` folder into your project root. Codex reads skills from `.agents/skills/` in your working directory.

```bash
# From inside your project directory:
cp -r /path/to/vgd-skills/.agents/skills/ .agents/skills/
```

You can also install skills globally:

```bash
# Global install (available everywhere):
cp -r /path/to/vgd-skills/.agents/skills/ ~/.agents/skills/
```

After copying, Codex detects new skills automatically. If they don't appear, restart Codex. Use `/skills` or type `$` to browse and invoke a skill.

### Cursor

Cursor automatically discovers skills from `.agents/skills/` and `.cursor/skills/` in your project, as well as `.claude/skills/` for compatibility. Copying both folders gives you full coverage:

```bash
# From inside your project directory:
cp -r /path/to/vgd-skills/.claude/skills/ .claude/skills/
cp -r /path/to/vgd-skills/.agents/skills/ .agents/skills/
```

You can also install skills globally:

```bash
# Global install (available everywhere):
cp -r /path/to/vgd-skills/.agents/skills/ ~/.cursor/skills/
```

After copying, Cursor detects new skills automatically. Type `/` in Agent chat to search and select skills.

### Cherry-Picking Individual Skills

You don't have to install everything. Copy only the skills you need:

```bash
# Example: install just the love2d-gamedev skill for Claude Code
mkdir -p .claude/skills
cp -r /path/to/vgd-skills/.claude/skills/love2d-gamedev .claude/skills/

# Example: install just the phaser-gamedev skill for Codex / Cursor
mkdir -p .agents/skills
cp -r /path/to/vgd-skills/.agents/skills/phaser-gamedev .agents/skills/
```

## Learn More

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [OpenAI Codex Skills Documentation](https://developers.openai.com/codex/skills)
- [Cursor Skills Documentation](https://cursor.com/docs/skills)
- [Vibe Game Dev](https://vibegamedev.com)
