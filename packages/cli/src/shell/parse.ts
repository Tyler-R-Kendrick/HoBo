import path from "node:path";

import { UsageError } from "./errors.js";
import { verbNames } from "./verbs.js";

export interface CliFlags {
	readonly json: boolean;
	readonly camp: string | null;
	readonly cwd: string;
	readonly verbose: boolean;
	readonly quiet: boolean;
	readonly help: boolean;
	readonly to: string | null;
	readonly rollback: boolean;
	readonly seed: boolean;
	readonly restore: string | null;
	readonly strategy: string | null;
	readonly target: string | null;
	readonly check: boolean;
	readonly last: boolean;
	readonly offline: boolean;
	readonly template: string | null;
	readonly force: boolean;
	readonly hold: boolean;
	readonly runtime: string | null;
}

export interface CliRequest {
	readonly verb: string | null;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly help: boolean;
	readonly flags: CliFlags;
}

export interface ParseArgvOptions {
	readonly cwd?: string;
}

export function parseArgv(
	argv: readonly string[],
	options: ParseArgvOptions = {},
): CliRequest {
	const flags = {
		json: false,
		camp: null as string | null,
		cwd: path.resolve(options.cwd ?? process.cwd()),
		verbose: false,
		quiet: false,
		help: false,
		to: null as string | null,
		rollback: false,
		seed: false,
		restore: null as string | null,
		strategy: null as string | null,
		target: null as string | null,
		check: false,
		last: false,
		offline: false,
		template: null as string | null,
		force: false,
		hold: false,
		runtime: null as string | null,
	};
	const args: string[] = [];
	let verb: string | null = null;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === undefined) {
			continue;
		}

		if (token === "--") {
			args.push(...argv.slice(index + 1));
			break;
		}

		if (token.startsWith("-")) {
			index = parseOption(argv, index, flags, verb);
			continue;
		}

		if (!verb) {
			verb = token;
			continue;
		}

		args.push(token);
	}

	if (flags.to && flags.rollback) {
		throw new UsageError(
			'--to cannot be combined with --rollback. Use one revision selector for "hobo up".',
			["Pass either `--to <revision>` or `--rollback`, not both."],
		);
	}

	return {
		verb,
		args,
		cwd: flags.cwd,
		help: flags.help,
		flags,
	};
}

function parseOption(
	argv: readonly string[],
	index: number,
	flags: {
		json: boolean;
		camp: string | null;
		cwd: string;
		verbose: boolean;
		quiet: boolean;
		help: boolean;
		to: string | null;
		rollback: boolean;
		seed: boolean;
		restore: string | null;
		strategy: string | null;
		target: string | null;
		check: boolean;
		last: boolean;
		offline: boolean;
		template: string | null;
		force: boolean;
		hold: boolean;
		runtime: string | null;
	},
	verb: string | null,
): number {
	const token = argv[index];
	if (token === undefined) {
		return index;
	}

	switch (token) {
		case "--json":
			flags.json = true;
			return index;
		case "--camp":
			flags.camp = takeValue(argv, index, token);
			return index + 1;
		case "--cwd":
			flags.cwd = path.resolve(takeValue(argv, index, token));
			return index + 1;
		case "--verbose":
			flags.verbose = true;
			return index;
		case "-q":
			flags.quiet = true;
			return index;
		case "--help":
		case "-h":
			flags.help = true;
			return index;
		case "--to":
			flags.to = takeValue(argv, index, token);
			return index + 1;
		case "--rollback":
			flags.rollback = true;
			return index;
		case "--seed":
			flags.seed = true;
			return index;
		case "--restore":
			flags.restore = takeValue(argv, index, token);
			return index + 1;
		case "--strategy":
			flags.strategy = takeValue(argv, index, token);
			return index + 1;
		case "--target":
			flags.target = takeValue(argv, index, token);
			return index + 1;
		case "--check":
			flags.check = true;
			return index;
		case "--last":
			flags.last = true;
			return index;
		case "-t":
		case "--template":
			flags.template = takeValue(argv, index, token);
			return index + 1;
		case "--force":
			flags.force = true;
			return index;
		case "--hold":
			flags.hold = true;
			return index;
		case "--runtime":
			flags.runtime = takeValue(argv, index, token);
			return index + 1;
		case "--offline":
			if (verb === "doctor") {
				flags.offline = true;
				return index;
			}
			throw unknownOption(token, verb);
		default:
			throw unknownOption(token, verb);
	}
}

function takeValue(
	argv: readonly string[],
	index: number,
	flag: string,
): string {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("-")) {
		throw new UsageError(`Option "${flag}" requires a value.`, [
			`Provide a value immediately after ${flag}.`,
		]);
	}
	return value;
}

function unknownOption(token: string, verb: string | null): UsageError {
	const helpTarget = verb ? `hobo ${verb} --help` : "hobo --help";
	return new UsageError(`Unknown option "${token}". Run "${helpTarget}".`, [
		`Run \`${helpTarget}\` to see supported flags.`,
	]);
}

export function unknownVerbMessage(input: string): string {
	const suggestion = nearestVerb(input);
	return `Unknown verb "${input}".${suggestion ? ` Did you mean "${suggestion}"?` : ""} Run "hobo --help".`;
}

export function assertKnownVerb(verb: string): void {
	if (!verbNames.has(verb)) {
		throw new UsageError(unknownVerbMessage(verb));
	}
}

function nearestVerb(input: string): string | null {
	let best: { candidate: string; distance: number } | null = null;
	for (const candidate of verbNames) {
		const distance = levenshtein(input, candidate);
		if (!best || distance < best.distance) {
			best = { candidate, distance };
		}
	}
	return best && best.distance <= Math.max(2, Math.floor(input.length / 2))
		? best.candidate
		: null;
}

function levenshtein(left: string, right: string): number {
	const distances = Array.from({ length: left.length + 1 }, () =>
		Array<number>(right.length + 1).fill(0),
	);
	for (let row = 0; row <= left.length; row += 1) {
		const rowValues = distances[row];
		if (rowValues) {
			rowValues[0] = row;
		}
	}
	for (let column = 0; column <= right.length; column += 1) {
		const firstRow = distances[0];
		if (firstRow) {
			firstRow[column] = column;
		}
	}

	for (let row = 1; row <= left.length; row += 1) {
		for (let column = 1; column <= right.length; column += 1) {
			const currentRow = distances[row];
			const previousRow = distances[row - 1];
			if (!currentRow || !previousRow) {
				continue;
			}
			const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
			currentRow[column] = Math.min(
				(currentRow[column - 1] ?? 0) + 1,
				(previousRow[column] ?? 0) + 1,
				(previousRow[column - 1] ?? 0) + substitutionCost,
			);
		}
	}

	return distances[left.length]?.[right.length] ?? Number.POSITIVE_INFINITY;
}
