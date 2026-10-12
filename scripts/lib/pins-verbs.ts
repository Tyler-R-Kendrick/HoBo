/**
 * The verbs of `bootstrap-siblings.mts` over git pins: initialise, report,
 * fetch, move. Each prints what it did and returns the
 * process exit code; a refusal is a thrown `PinsError`.
 *
 * Erasable TypeScript with node builtins only.
 */
import { bumpPin, initPin, short, statusPin } from "./pins-git.ts";
import { type GitPin, type Pins, PinsError } from "./pins.ts";

export const PINS_FILE = "tools/pins/siblings.json";

export interface Request {
	readonly verb: "init" | "status" | "fetch" | "bump";
	readonly root: string;
	readonly reference: string | undefined;
	readonly online: boolean;
	readonly names: readonly string[];
	readonly allowLocal: boolean;
}

// A pin name comes from the command line: only the manifest's own keys count,
// never `toString` or `__proto__` from the prototype chain.
function gitPinOf(pins: Pins, name: string): GitPin | undefined {
	return Object.hasOwn(pins.git, name) ? pins.git[name] : undefined;
}

function unknownPin(pins: Pins, name: string): never {
	throw new PinsError(
		"USAGE",
		`no pin named ${name}; pins: ${Object.keys(pins.git).join(", ")}`,
	);
}

function initGit(request: Request, pins: Pins, name: string): void {
	const pin = gitPinOf(pins, name);
	if (pin === undefined) return unknownPin(pins, name);
	const result = initPin(request.root, pin, request.reference);
	const sparse = pin.sparse === null ? "" : `; sparse: ${pin.sparse.join(" ")}`;
	if (result.kind === "already pinned") {
		const note = result.sparseChanged ? `  (sparse set updated${sparse})` : "";
		console.log(`${name}  already pinned at ${short(result.head)}${note}`);
		return;
	}
	const borrowed =
		request.reference === undefined
			? ""
			: `, objects borrowed from ${request.reference}`;
	const how = `${result.shallow ? "shallow" : "full"}${borrowed}`;
	console.log(
		`${name}  ${result.kind} at ${short(result.head)}  (${how}${sparse})`,
	);
}

/** No verb: every git pin, nothing downloaded. */
export function runInit(request: Request, pins: Pins): number {
	for (const name of Object.keys(pins.git)) initGit(request, pins, name);
	return 0;
}

/** Named git pins, or all of them. */
export function runFetch(request: Request, pins: Pins): number {
	const names =
		request.names.length > 0 ? request.names : Object.keys(pins.git);
	for (const name of names) initGit(request, pins, name);
	return 0;
}

function printProblems(
	problems: readonly string[],
	fixes: readonly string[],
): void {
	for (const problem of problems) console.log(`  ${problem}`);
	fixes.forEach((fix, index) =>
		console.log(`  ${index === 0 ? "fix:" : "    "} ${fix}`),
	);
}

export function runStatus(request: Request, pins: Pins): number {
	let failed = 0;
	for (const [name, pin] of Object.entries(pins.git)) {
		const status = statusPin(request.root, name, pin, request.online);
		if (status.problems.length === 0) {
			const tip =
				status.tip === null
					? ""
					: status.tip === status.commit
						? `  (the tip of ${pin.branch})`
						: `  (${pin.branch} is at ${short(status.tip)})`;
			console.log(`${name}  ${short(status.commit)}  ok${tip}`);
			continue;
		}
		failed += 1;
		console.log(`${name}  ${short(status.commit)}  FAIL`);
		printProblems(status.problems, status.fixes);
	}
	if (failed > 0) console.error(`ERR ${failed} pin(s) out of date`);
	return failed === 0 ? 0 : 1;
}

export function runBump(request: Request, pins: Pins): number {
	const [name = "", ref = ""] = request.names;
	const pin = gitPinOf(pins, name);
	if (pin === undefined) return unknownPin(pins, name);
	const { from, to } = bumpPin(request.root, name, pin, ref, request.reference);
	console.log(
		`${name}  ${short(from)} -> ${short(to)}  (gitlink staged; commit it)`,
	);
	return 0;
}
