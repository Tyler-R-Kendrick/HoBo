export class CliError extends Error {
	readonly exitCode: number;
	readonly code: string;
	readonly remediation: readonly string[];

	constructor(
		message: string,
		exitCode: number,
		code: string,
		remediation: readonly string[] = [],
	) {
		super(message);
		this.name = "CliError";
		this.exitCode = exitCode;
		this.code = code;
		this.remediation = remediation;
	}
}

export class UsageError extends CliError {
	constructor(message: string, remediation: readonly string[] = defaultUsageRemediation()) {
		super(message, 2, "HOBO_CLI_USAGE", remediation);
		this.name = "UsageError";
	}
}

export class NoBindleError extends CliError {
	constructor(cwd: string) {
		super(
			`No Bindle here: ${cwd}\nRun from a HoBo project or pass --cwd <path> to one.`,
			1,
			"HOBO_NO_BINDLE",
			[
				"Run `hobo new <name>` to scaffold a project, or `cd` into an existing HoBo project.",
				"Pass `--cwd <path>` to point at a directory containing hobo.bindle.json.",
			],
		);
		this.name = "NoBindleError";
	}
}

function defaultUsageRemediation(): readonly string[] {
	return ["Run `hobo --help` for the canonical verb list and global flags."];
}
