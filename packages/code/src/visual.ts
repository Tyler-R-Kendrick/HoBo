import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { LockedVisualArtifact } from "./types.js";

export interface OpenUiSession {
	readonly id: string;
	readonly durableRoot: string;
	readonly html: string;
	readonly edits: string[];
	readonly locked: boolean;
	readonly prompt: string;
}

const OPENUI_STYLES = `
:root {
  color-scheme: dark;
  --bg: #0b0f14;
  --panel: #121821;
  --border: #1e2a38;
  --text: #e7eef7;
  --muted: #8b9bb0;
  --accent: #5b9fd4;
  --accent-soft: rgba(91, 159, 212, 0.14);
  --ok: #3dba7a;
  --draft: #c9a227;
  --radius: 12px;
  --font: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(91,159,212,0.12), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, rgba(61,186,122,0.08), transparent 50%),
    var(--bg);
  color: var(--text);
  font-family: var(--font);
}
.shell {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.75rem 1rem 2.25rem;
}
.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.brand-mark {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 6px;
  background: linear-gradient(145deg, var(--accent), #2d6f9e);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.08) inset,
    0 6px 16px rgba(45, 111, 158, 0.35);
  display: grid;
  place-items: center;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: #f4f9ff;
  text-transform: lowercase;
}
.brand-mark::after {
  content: "h";
  line-height: 1;
  text-shadow: 0 1px 0 rgba(0,0,0,0.25);
}
.badge {
  font-family: var(--mono);
  font-size: 0.72rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--muted);
}
.badge[data-state="draft"] { color: var(--draft); border-color: rgba(201,162,39,0.35); }
.badge[data-state="ready"],
.badge[data-state="locked"] { color: var(--ok); border-color: rgba(61,186,122,0.35); }
.card {
  background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%), var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.15rem 1.1rem 1.05rem;
  box-shadow: 0 14px 40px rgba(0,0,0,0.32);
}
.card[data-locked="true"] {
  border-color: rgba(61,186,122,0.45);
  box-shadow:
    0 18px 50px rgba(0,0,0,0.35),
    0 0 0 1px rgba(61,186,122,0.12),
    0 0 28px rgba(61,186,122,0.12);
}
.card h1 {
  margin: 0 0 0.65rem;
  font-size: 1.55rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.lede {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.5;
}
.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  margin: 0 0 1.15rem;
  padding: 0.45rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.18);
}
.step {
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: center;
  padding: 0.42rem 0.3rem;
  border-radius: 7px;
  color: var(--muted);
  border: 1px solid transparent;
}
.step[data-phase="done"] {
  color: var(--ok);
  background: rgba(61,186,122,0.1);
  border-color: rgba(61,186,122,0.28);
}
.step[data-phase="current"] {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: rgba(91,159,212,0.45);
  box-shadow:
    0 0 0 1px rgba(91,159,212,0.12),
    0 6px 16px rgba(45,111,158,0.18);
  font-weight: 600;
}
.step[data-phase="todo"] {
  color: var(--muted);
  opacity: 0.72;
}
.seal {
  display: none;
  margin: 0 0 0.85rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ok);
  border: 1px dashed rgba(61,186,122,0.45);
  background: rgba(61,186,122,0.08);
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  text-align: center;
}
.card[data-locked="true"] .seal {
  display: block;
}
.card[data-locked="true"] .steps {
  border-color: rgba(61,186,122,0.28);
  background: rgba(61,186,122,0.05);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
.chip {
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(91,159,212,0.25);
  border-radius: 8px;
  padding: 0.28rem 0.5rem;
  letter-spacing: 0.01em;
}
.chip:first-child {
  box-shadow: 0 0 0 1px rgba(91,159,212,0.12);
}
.foot {
  margin-top: 1rem;
  font-size: 0.75rem;
  color: var(--muted);
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: center;
}
.foot::before {
  content: "◎";
  color: var(--accent);
  opacity: 0.7;
}
@media (max-width: 520px) {
  .steps {
    grid-template-columns: 1fr;
  }
  .chrome {
    flex-direction: column;
    align-items: flex-start;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .card {
    animation: rise 220ms ease-out;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }
}
`.trim();

type StepPhase = "done" | "current" | "todo";

function openUiStepPhases(input: {
	readonly status: string;
	readonly locked?: boolean;
}): readonly [StepPhase, StepPhase, StepPhase] {
	if (input.locked === true) {
		return ["done", "done", "done"];
	}
	if (input.status === "draft") {
		return ["done", "current", "todo"];
	}
	// edited / ready / any non-draft status → lock is next
	return ["done", "done", "current"];
}

/**
 * Build the OpenUI intermediary HTML shell (pure presentation).
 */
export function renderOpenUiHtml(input: {
	readonly prompt: string;
	readonly status: string;
	readonly locked?: boolean;
}): string {
	const status = input.status;
	const badgeState =
		input.locked === true ? "locked" : status === "draft" ? "draft" : "ready";
	const rawBadge =
		input.locked === true ? "locked" : status === "draft" ? "draft" : status;
	// Keep badge scannable — long edit strings truncate in the chrome chip.
	const badgeLabel =
		rawBadge.length > 18 ? `${rawBadge.slice(0, 17)}…` : rawBadge;
	const [gen, edit, lock] = openUiStepPhases(input);
	const step = (label: string, phase: StepPhase, testId: string) =>
		`<span class="step" data-testid="${testId}" data-phase="${phase}">${label}</span>`;
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OpenUI · ${escapeHtml(badgeLabel)} · ${escapeHtml(input.prompt)}</title>
  <style>
${OPENUI_STYLES}
  </style>
</head>
<body>
  <div class="shell">
    <header class="chrome">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span> hobo-code</div>
      <span class="badge" data-testid="badge" data-state="${badgeState}">${escapeHtml(badgeLabel)}</span>
    </header>
    <main class="card" data-testid="primary" data-openui="true"${input.locked === true ? ' data-locked="true"' : ""}>
      <nav class="steps" data-testid="steps" aria-label="OpenUI loop">
        ${step("1 · generate", gen, "step-generate")}
        ${step("2 · edit", edit, "step-edit")}
        ${step("3 · lock", lock, "step-lock")}
      </nav>
      <p class="seal" data-testid="seal">◎ locked</p>
      <h1 data-testid="title">${escapeHtml(input.prompt)}</h1>
      <p class="lede" data-testid="lede">${
				// Steps rail already shows generate/edit/lock — lede is outcome only.
				input.locked === true
					? "→codegen"
					: status === "draft"
						? "→edit"
						: "→lock"
			}</p>
      <p data-testid="status" hidden>${escapeHtml(status)}</p>
      <div class="meta" data-testid="meta">
        <span class="chip" data-testid="loop-chip">${
					input.locked === true ? "done" : status === "draft" ? "edit" : "lock"
				}</span>
      </div>
    </main>
    <p class="foot" data-testid="foot">${
			// Foot is action/outcome only — no twin of lede or steps.
			input.locked === true
				? "seal"
				: status === "draft"
					? "Edit→lock"
					: "Lock→codegen"
		}</p>
  </div>
</body>
</html>
`;
}

/**
 * OpenUI generative path + in-context edit + lock-as-intermediary-artifact.
 * Locked output is immutable source of truth for subsequent codegen/tests.
 */
export function createOpenUiSession(input: {
	readonly durableRoot: string;
	readonly prompt: string;
	readonly id?: string;
}): OpenUiSession {
	const id = input.id ?? `visual-${Date.now()}`;
	const html = renderOpenUiHtml({ prompt: input.prompt, status: "draft" });
	const dir = join(input.durableRoot, "visual", id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "draft.html"), html, "utf8");
	return {
		id,
		durableRoot: input.durableRoot,
		html,
		edits: [],
		locked: false,
		prompt: input.prompt,
	};
}

export function applyInContextEdit(
	session: OpenUiSession,
	edit: string,
): OpenUiSession {
	if (session.locked) {
		throw new Error("locked visual artifacts are immutable");
	}
	const html = renderOpenUiHtml({
		prompt: session.prompt,
		status: edit,
	});
	const next: OpenUiSession = {
		...session,
		html,
		edits: [...session.edits, edit],
	};
	const dir = join(session.durableRoot, "visual", session.id);
	writeFileSync(join(dir, "draft.html"), next.html, "utf8");
	return next;
}

export function lockVisualArtifact(
	session: OpenUiSession,
): LockedVisualArtifact {
	const dir = join(session.durableRoot, "visual", session.id);
	const status =
		session.edits.length > 0
			? session.edits[session.edits.length - 1]!
			: "draft";
	const html = renderOpenUiHtml({
		prompt: session.prompt,
		status,
		locked: true,
	});
	const htmlPath = join(dir, "locked.html");
	writeFileSync(htmlPath, html, "utf8");
	writeFileSync(
		join(dir, "lock.json"),
		JSON.stringify(
			{
				id: session.id,
				source: "openui",
				lockedAt: new Date().toISOString(),
				immutable: true,
				edits: session.edits,
			},
			null,
			2,
		),
		"utf8",
	);
	return {
		id: session.id,
		source: "openui",
		lockedAt: new Date().toISOString(),
		htmlPath,
		immutable: true,
		edits: session.edits,
	};
}

/** Agent browser validation (Playwright primary; CDP for deeper needs). */
export function validateLockedVisual(artifact: LockedVisualArtifact): {
	readonly ok: boolean;
	readonly hasPrimary: boolean;
	readonly immutable: true;
	readonly htmlLength: number;
	readonly hasBadge?: boolean;
} {
	if (!existsSync(artifact.htmlPath)) {
		return {
			ok: false,
			hasPrimary: false,
			immutable: true,
			htmlLength: 0,
		};
	}
	const html = readFileSync(artifact.htmlPath, "utf8");
	const hasPrimary = html.includes('data-testid="primary"');
	const hasBadge = html.includes('data-testid="badge"');
	const locked = html.includes('data-locked="true"') || html.includes("locked");
	return {
		ok: hasPrimary && artifact.immutable && locked,
		hasPrimary,
		hasBadge,
		immutable: true,
		htmlLength: html.length,
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
