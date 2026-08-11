---
type: Agent Plan
title: "hobo-code visible tmux panes"
description: "Durable SDLC state for exact tmux browser tiling and remote credential redemption."
tags: [hobo-code, tmux, sessions, sdlc]
timestamp: 2026-08-11T00:00:00Z
---

# SDLC state — hobo-code visible tmux panes

Phase: **implementation**

## Problem and acceptance

The resident browser exposes pane actions but stacks output as cards. It must
render tmux's live pane geometry, keep focused-pane semantics visible, and
remain usable at narrow widths. Remote SSH must resolve a Station-authorized
credential reference to a live local agent socket and durably drain redemption
and terminal session facts without exposing token material.

## Hardened decision

- Tmux remains the only layout authority; snapshots expose its cell geometry.
- The browser projects that geometry with CSS and falls back to an even grid
  only while geometry is unavailable.
- Remote SSH reuses the installed SSH agent through a lease-bound local proxy;
  no private key or session token is copied into argv, files, panes, or logs.
- Killed: a second browser-only split tree, draggable fake geometry, and a new
  UI dependency.

## Stack

1. `sdlc/hobo-code-panes-01-layout` — pane geometry contract, runtime, browser,
   tests, and current visual evidence.
2. `sdlc/hobo-code-panes-02-remote-audit` — tokenref redemption proxy, Yard
   audit drain, expiry, tests, and docs.

OptimizeXP run: `20260811-hobo-code-panes`.
Designer consensus policy: `required-when-design-relevant`.
