/**
 * DESIGN.md color tokens for TUI chrome. Components must import these —
 * never invent SaaS blues, purple glow, or extra accents.
 */
export const TUI_TOKENS = {
	ink: "#101010",
	paper: "#ffffff",
	mute: "#4a4a46",
	cream: "#f2f1ec",
	spark: "#c5301c",
	go: "#14672c",
	soot: "#1a1512",
} as const;

export type TuiTokenName = keyof typeof TUI_TOKENS;

/** Hex values allowed in TUI component style props. */
export const TUI_TOKEN_VALUES: ReadonlySet<string> = new Set(
	Object.values(TUI_TOKENS),
);

/** Colours the design contract forbids on TUI chrome. */
export const TUI_FORBIDDEN_HEX = [
	"#0070f3",
	"#3b82f6",
	"#2563eb",
	"#6366f1",
	"#8b5cf6",
	"#a855f7",
	"#7c3aed",
	"#00d4ff",
	"#22d3ee",
] as const;
