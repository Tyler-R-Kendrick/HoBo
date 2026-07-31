---
type: Agent Skill Reference
title: "OptimizeXP config.json"
description: "Formal global and project config for OptimizeXP-owned folders — defaults, surfaces, safety, persona/feature prefer lists."
tags: [hobo, optimizexp, config, monorepo, projects]
timestamp: 2026-07-31T00:00:00Z
---

# Config (global + project)

OptimizeXP owns **two tiers** of config next to its data trees:

| File | Scope |
|---|---|
| **`.optimizexp/config.json`** | **Global** — monorepo defaults, product identity, safety, discovery filters |
| **`<project>/.optimizexp/config.json`** | **Project** — surface-specific defaults (e.g. site → UX + web driver) |

**Optional.** Zero config files → skill built-in defaults. **CLI flags and env always win** over config.

## Rubber-duck: what belongs here?

### High value (in)

| Concern | Why config (not only flags) |
|---|---|
| **Default experiences / projects / passes** | Bare `/optimizexp` should match how *this* repo works without retyping flags every session |
| **Init caps** (`maxPersonas`, `maxFeatures`) | Monorepos vs tiny packages need different bootstrap volume |
| **Project surface identity** | Site is URL + web; CLI is doctor/commands — init and capture should know |
| **Persona/feature prefer & exclude** | Quiet noisy role-* personas; pin a cover set for a project |
| **Evidence policy** | preferVideo, baseUrl, native capture env name |
| **Safety** | Offline-first / allow local install — monorepo policy, not a one-off flag |
| **Product name/summary** | Override noisy README for init seeds |

### Low value / forbidden (out)

| Temptation | Why not |
|---|---|
| Secrets / API keys | Never in `.optimizexp/` |
| Full CLI grammar | Flags remain the invocation surface |
| Bus/runs relocation | Orchestration stays **global only** |
| Duplicating persona bodies | Personas stay markdown files |
| Mandatory config | Friction on first use |
| Deep plugin systems | YAGNI — skill is the engine |

## Merge order

```text
skill built-in defaults
  < global .optimizexp/config.json
  < project <id>/.optimizexp/config.json   # when focus is a single non-root project
  < CLI flags / OPTIMIZEXP_* env           # always win
```

Multi-project / all-projects reviews use **global** config for defaults; each project's config applies when that project is the **write focus** (single `--project site`).

## Schema (`schemaVersion: 1`)

### Global example

```json
{
  "schemaVersion": 1,
  "kind": "global",
  "label": "Repository-wide OptimizeXP",
  "product": {
    "name": "HoBo",
    "summary": "Optional short product blurb for init seeds"
  },
  "defaults": {
    "experiences": ["ux", "dx", "ax"],
    "projects": "all",
    "passes": "infinite",
    "delight": true,
    "survey": true,
    "reportOnly": false,
    "maxPersonas": 12,
    "maxFeatures": 12,
    "driver": "cli"
  },
  "personas": {
    "requireSchemaVersion": 2,
    "defaultPriority": 50,
    "prefer": ["product-app-developer", "product-end-user"],
    "exclude": []
  },
  "features": {
    "defaultDriver": "cli",
    "includeProjectFeatureGlobs": true,
    "prefer": [],
    "exclude": []
  },
  "evidence": {
    "preferVideo": true,
    "overwritePrimary": true,
    "nativeCaptureEnv": "OPTIMIZEXP_NATIVE_CAPTURE"
  },
  "safety": {
    "forbidLiveNetworkByDefault": true,
    "allowLocalInstall": true
  },
  "projects": {
    "include": [],
    "exclude": []
  },
  "notes": [
    "CLI flags win. Bus/runs stay under this global tree."
  ]
}
```

### Project example (`site/.optimizexp/config.json`)

```json
{
  "schemaVersion": 1,
  "kind": "project",
  "projectId": "site",
  "label": "Public site",
  "defaults": {
    "experiences": ["ux"],
    "driver": "web"
  },
  "features": {
    "defaultDriver": "web",
    "includeProjectFeatureGlobs": true
  },
  "evidence": {
    "preferVideo": true,
    "overwritePrimary": true,
    "baseUrl": "http://localhost:4321",
    "nativeCaptureEnv": "OPTIMIZEXP_NATIVE_CAPTURE"
  },
  "surfaces": {
    "primaryUrl": "http://localhost:4321",
    "commands": {
      "dev": "pnpm --filter site dev",
      "build": "pnpm --filter site build"
    }
  },
  "personas": {
    "requireSchemaVersion": 2,
    "defaultPriority": 40,
    "prefer": ["product-end-user", "product-designer"]
  },
  "notes": [
    "Personas/features for the site live under site/.optimizexp/."
  ]
}
```

### Field notes

| Block | Global | Project |
|---|---|---|
| `kind` | `"global"` | `"project"` + **`projectId`** matching folder id |
| `defaults.experiences` | Bare-run tracks | When focusing this project alone |
| `defaults.projects` | `"all"` or id list | Usually omit |
| `personas.prefer/exclude` | Cover set / noise control | Product-specific judges |
| `surfaces.commands` | Shared scripts | Project entrypoints |
| `evidence.baseUrl` | Rare | Web capture base |
| `safety.*` | Repo policy | Usually inherit |
| `projects.include/exclude` | Discovery filter | Omit |

## Harness

```bash
# write missing templates (never overwrites unless --force)
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode ensure-config
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode ensure-config --projects site

# validate JSON + merge
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode validate-config

# init also ensures global + selected project configs
node --import tsx .agents/skills/optimizexp/harness/init.mts --projects site
```

Implementation: `harness/lib/config.mts` (`resolveConfig`, `ensureGlobalConfig`, `ensureProjectConfig`).

## Layout reminder

```text
.optimizexp/
  config.json                 # NEW formal global config
  personas/ features/ bus/ runs/ backlog/

site/.optimizexp/
  config.json                 # NEW formal project config
  personas/ features/
```

## gitignore (managed)

Each scope may own a **`.gitignore`** next to `config.json`. The harness writes a **managed block** between markers:

```gitignore
# BEGIN optimizexp-managed
…
# END optimizexp-managed
```

Lines **outside** that block are preserved (user rules). Regenerating (`ensure-config` / init) rewrites only the managed block from config.

### Defaults (high value)

| Category | Global default | Project default | Why |
|---|---|---|---|
| `runs` | ignore `runs/**` (keep `.gitkeep`) | n/a | Session artifacts regenerate every run |
| `busEntries` | ignore `bus/entries/**` (keep `.gitkeep`) | n/a | Local write-ahead agent state; noisy |
| `evidenceMedia` | ignore mp4/webm/gif/cast/frames | same | Large media; keep `primary.txt` + manifest/meta |
| `evidenceAll` | off | off | Opt-in aggressive: ignore all evidence blobs |
| `initReport` | off | n/a | Often useful to commit once; set true if noisy |
| `osJunk` | on | on | `.DS_Store`, etc. |

**Usually committed:** `config.json`, personas, feature Gherkin/steps/tests, small evidence transcripts + manifests, backlog.

### Config

```json
"gitignore": {
  "enabled": true,
  "managed": true,
  "ignore": {
    "runs": true,
    "busEntries": true,
    "evidenceMedia": true,
    "evidenceAll": false,
    "initReport": false,
    "osJunk": true
  },
  "extra": ["local/", "*.scratch.json"],
  "negate": ["features/golden-demo/evidence/hero/primary.mp4"]
}
```

| Field | Meaning |
|---|---|
| `enabled` | Maintain `.gitignore` at all (false = leave alone) |
| `managed` | Rewrite managed block on ensure (false + existing file = no touch) |
| `ignore.*` | Category toggles |
| `extra` | Extra patterns inside managed block |
| `negate` | Force-track paths (`!pattern`) after ignores |

```bash
node --import tsx .agents/skills/optimizexp/harness/init.mts --mode ensure-config
# refreshes .optimizexp/.gitignore and <project>/.optimizexp/.gitignore
```

Implementation: `harness/lib/gitignore.mts`.

## Related

- [flags.md](flags.md) — CLI still wins  
- [personas.md](personas.md) — `experiences:` binding  
- [init.md](init.md) — bootstrap  
- [evidence.md](evidence.md) — what stays under evidence/  
- [paths / projects](../harness/lib/paths.mts) — scope trees  
