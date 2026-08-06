/** Anonymous Railway Environment Station placeholder (operator bootstrap). */
export const station = {
	providerId: "railway",
	kind: "anonymous-remote",
	capabilities: ["http", "kv", "queue", "container"],
} as const;
