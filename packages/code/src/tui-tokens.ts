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

/** DESIGN.md web palette — Evidence SPA + any HTML chrome. */
export const DESIGN_COLOR_TOKENS = {
	...TUI_TOKENS,
	faint: "#6e6d68",
	border: "#e3e2de",
	borderStrong: "#c9c8c2",
	inset: "#f4f4f2",
	codeBg: "#f7f7f5",
	nightBg: "#0a0a0a",
	nightRaised: "#111111",
} as const;

export const DESIGN_COLOR_VALUES: ReadonlySet<string> = new Set(
	Object.values(DESIGN_COLOR_TOKENS).map((hex) => hex.toLowerCase()),
);

/** Colours the design contract forbids on TUI / Evidence chrome. */
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
	"#9bc7ff",
	"#8bd5ca",
	"#171512",
	"#756954",
	"#d7a84b",
	"#7ecb79",
	"#df6b57",
	"#f5a97f",
	"#ed8796",
	"#a6da95",
] as const;
