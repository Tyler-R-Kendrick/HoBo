---
name: compact
description: Shrink a long hobo-code working context without destroying the durable journal. Use when the user says compact, /compact, context is too long, or a session is approaching the model window.
---

# Compact

Use this skill to compress **working** context for the next turn. Do **not** delete the durable chat journal.

## When to use

- User types `/compact` or `hobo-code compact`
- A long session is drowning the next engine turn
- You need a handoff briefing without starting a new chat

## Do this

1. Prefer the product path: `/compact [focus]` in the TUI or `hobo-code compact [session_id] [focus…]`.
2. Keep the last user-turn boundary intact (default: last two user turns).
3. Build a **deterministic** briefing from the journal: original goal, files, errors, station/env, optional focus words.
4. Leave `$HOBO_HOME/durable/code/chats/<id>.json` `messages` as the full journal. Only `workingMessages` shrinks.
5. Tell the user the journal is intact and how to resume (`hobo-code resume <id>`).

## Do not

- Call an LLM just to summarize (Pi's default). That is lossy, model-gated, and breaks the prompt cache.
- Auto-compact mid-turn. Pi does this on overflow and can stall; we wait for an explicit compact.
- Cut between a tool call and its result. Cut only on user-turn starts.
- Overwrite or delete the journal so resume/history still works.

## Why not Pi's compact

Pi (Earendil, 2026-08-13) sends a standalone "you are a context summarization assistant" request, keeps ~20k recent tokens, and auto-compacts at `contextWindow - 16k`. That is a reasonable briefing — and it throws away operational state, requires a model, and invalidates the cached prefix. HoBo extracts facts without a model, keeps last turns verbatim, and treats the journal as never-compact (same rule as credential audit).

## Commands

```text
/compact
/compact keep the named URL
hobo-code compact
hobo-code compact chat-abc keep bindle.ts
```
