export interface Verb {
	readonly name: string;
	readonly role: string;
	readonly summary: string;
}

export const CANONICAL_VERBS: readonly Verb[] = [
	{
		name: "up",
		role: "lifecycle",
		summary: "Realize the current object graph",
	},
	{ name: "down", role: "lifecycle", summary: "Tear down what up realized" },
	{ name: "dev", role: "local loop", summary: "Run against runtime-local" },
	{
		name: "new",
		role: "local loop",
		summary: "Scaffold a runnable SDK program",
	},
	{
		name: "login",
		role: "identity",
		summary: "Obtain a dev SVID through OIDC",
	},
	{
		name: "claim",
		role: "identity",
		summary: "Bind an anonymous deployment to an account",
	},
	{ name: "plan", role: "read-only", summary: "Dry-run the up decision" },
	{
		name: "verify",
		role: "read-only",
		summary: "Run the unified Gatekeeper preflight",
	},
	{
		name: "can-deploy",
		role: "read-only",
		summary: "Diagnose producer/consumer compatibility",
	},
	{
		name: "inspect",
		role: "read-only",
		summary: "Render projections and time-travel views",
	},
	{
		name: "logs",
		role: "read-only",
		summary: "Live-tail Camp runtime streams",
	},
	{
		name: "doctor",
		role: "diagnostics",
		summary: "Report environment and portability hazards",
	},
	{
		name: "codegen",
		role: "authoring",
		summary: "Regenerate checked-in generated clients",
	},
	{
		name: "build",
		role: "authoring",
		summary: "Compile services to wasm components",
	},
	{
		name: "collect",
		role: "authoring",
		summary: "Run resource collection and print manifest IR",
	},
	{
		name: "stub",
		role: "authoring",
		summary: "Run with a contract-backed stub",
	},
	{
		name: "drift",
		role: "diagnostics",
		summary: "Report drift and governed remediation paths",
	},
	{
		name: "add",
		role: "distribution",
		summary: "Install a provider or listing",
	},
	{
		name: "registry",
		role: "distribution",
		summary: "Administer registry artifacts",
	},
	{
		name: "import",
		role: "migration",
		summary: "Adopt existing estate in place",
	},
	{
		name: "generate",
		role: "generation",
		summary: "Request provider generation",
	},
	{
		name: "sandbox",
		role: "test loop",
		summary: "Run a contract-backed isolated lane",
	},
	{
		name: "test",
		role: "test loop",
		summary: "Alias for the sandbox test lane",
	},
	{
		name: "attest",
		role: "governance",
		summary: "Produce signed external evidence exports",
	},
	{
		name: "erase",
		role: "governance",
		summary: "Request crypto-shred erasure",
	},
	{
		name: "derivative",
		role: "extensibility",
		summary: "Manage derived HoBo implementations",
	},
	{
		name: "runbook",
		role: "SRE",
		summary: "Execute or replay incident runbooks",
	},
] as const;

export const GLOBAL_FLAGS = [
	"--json",
	"--camp <camp>",
	"--cwd <path>",
	"--verbose",
	"-q",
	"--help",
] as const;

export const verbNames = new Set(CANONICAL_VERBS.map((verb) => verb.name));

export const projectScopedVerbs = new Set(
	CANONICAL_VERBS.map((verb) => verb.name).filter(
		(verb) =>
			![
				"new",
				"login",
				"claim",
				"add",
				"registry",
				"generate",
				"derivative",
			].includes(verb),
	),
);

export function helpText(): string {
	const verbRows = CANONICAL_VERBS.map(
		(verb) => `  ${verb.name.padEnd(12)}${verb.role.padEnd(14)}${verb.summary}`,
	).join("\n");

	return `HoBo CLI

Usage:
  hobo [global flags] <verb> [args]
  hobo --help
  hobo <verb> --help

Global flags:
  --json          Emit a machine-readable JSON envelope on stdout
  --camp <camp>   Select the target Camp
  --cwd <path>    Resolve the HoBo project from this directory
  --verbose       Print detailed diagnostics on stderr
  -q              Suppress non-error human output
  --help          Show help

Canonical verbs:
${verbRows}
`;
}

export function verbHelpText(verbName: string): string {
	const verb = CANONICAL_VERBS.find((candidate) => candidate.name === verbName);
	if (!verb) {
		throw new Error(`verbHelpText called with unknown verb: ${verbName}`);
	}

	if (verb.name === "new") {
		return `HoBo new

Usage:
  hobo new <name> [global flags] [-t todo|api|agent|fullstack] [--force]

Role: ${verb.role}

Scaffold an offline SDK program with checked-in generated bindings.
`;
	}

	if (verb.name === "stub") {
		return `HoBo stub

Usage:
  hobo stub [global flags] [--check]

Role: ${verb.role}

Materialize the contract-backed trainable stubs codegen emits for the
project's bindle steps (src/_generated/trainables.ts) — one training.define()
per step, served from its contract example until a training artifact is
promoted. Pass --check to validate the generated tree without writing.
`;
	}

	if (verb.name === "codegen") {
		return `HoBo codegen

Usage:
  hobo codegen [global flags] [--check]

Role: ${verb.role}

Regenerate the project's checked-in src/_generated/ tree from its
WIT/Zod/allow/bindle sources. Pass --check to report drift without writing
(exits non-zero when the tree is stale) — the same generator hobo build
asserts freshness against.
`;
	}

	return `HoBo ${verb.name}

Usage:
  hobo ${verb.name} [global flags] [args]

Role: ${verb.role}
Status: not yet implemented

This shell dispatches ${verb.name} through the shared command registry. The verb behavior is intentionally stubbed until its owning slice lands.
`;
}
