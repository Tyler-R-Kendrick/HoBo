/**
 * Classify and redact command / output text before persist or model.
 */

export type CommandSensitivity = "public" | "internal" | "secret-suspected";

const SECRET =
	/(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/u;
const FLAGGED =
	/(?:--|\/)(?:password|token|secret|apikey|api-key)(?:=|\s+)\S+|authorization:\s*bearer\s+\S+|token=|password=/iu;

export function classifyCommand(command: string): CommandSensitivity {
	if (SECRET.test(command) || FLAGGED.test(command)) return "secret-suspected";
	return "public";
}

export function redactCommand(command: string): string {
	return command
		.replace(SECRET, "***")
		.replace(
			/((?:--|\/)(?:password|token|secret|apikey|api-key)(?:=|\s+))\S+/giu,
			"$1***",
		)
		.replace(/(authorization:\s*bearer\s+)\S+/giu, "$1***")
		.replace(/((?:token|password)=)\S+/giu, "$1***");
}

export function redactOutput(
	text: string,
	maxBytes = 8192,
): {
	readonly text: string;
	readonly truncated: boolean;
	readonly sensitivity: CommandSensitivity;
} {
	const redacted = redactCommand(text);
	const sensitivity = classifyCommand(text);
	if (redacted.length <= maxBytes) {
		return { text: redacted, truncated: false, sensitivity };
	}
	return {
		text: redacted.slice(0, maxBytes),
		truncated: true,
		sensitivity,
	};
}
