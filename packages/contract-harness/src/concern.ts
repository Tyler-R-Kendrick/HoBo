/**
 * One test per member under test; the cases are data in a `.cases.jsonl`.
 *
 * Replaces the `describe`-per-function / `it`-per-case shape, where the same
 * arrange-act-assert lines are copied into every case and the boilerplate is
 * where the interesting detail hides. A case is a line here, so adding one is a
 * one-line diff and the assertion logic exists once.
 *
 * It also closes a gap a hand-written suite cannot: the subject's callable
 * surface is read at runtime and a member with no cases **fails the suite**, so
 * a new method is red rather than a silent hole. Deliberate exemptions must be
 * named with a reason, and an exemption that no longer applies also fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

export interface ConcernCase {
	readonly method: string;
	readonly name?: string;
	readonly input?: readonly unknown[];
	readonly expect?: unknown;
	readonly match?: string;
	readonly throws?: string;
}

const KEYS = new Set(["method", "name", "input", "expect", "match", "throws"]);

export function parseConcernCases(
	text: string,
	source = "cases",
): readonly ConcernCase[] {
	const cases = text.split("\n").flatMap((line, index) => {
		const at = `${source}:${index + 1}`;
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) return [];
		let row: Record<string, unknown>;
		try {
			row = JSON.parse(trimmed) as Record<string, unknown>;
		} catch (error) {
			throw new Error(`${at} is not JSON — ${(error as Error).message}`);
		}
		// A typo'd key would silently disable an assertion, which is the one
		// failure mode a data-driven suite must not have.
		const unknownKey = Object.keys(row).find((key) => !KEYS.has(key));
		if (unknownKey) throw new Error(`${at} has unknown key "${unknownKey}"`);
		if (typeof row.method !== "string" || !row.method)
			throw new Error(`${at} needs a non-empty "method"`);
		if (row.throws !== undefined && (row.expect ?? row.match) !== undefined)
			throw new Error(`${at} cannot assert both a throw and a value`);
		if (row.throws === undefined && (row.expect ?? row.match) === undefined)
			throw new Error(`${at} asserts nothing`);
		return [row as unknown as ConcernCase];
	});
	if (!cases.length) throw new Error(`${source} declares no cases`);
	return cases;
}

/**
 * The surface worth covering: behaviour, not data.
 *
 * For a class or object, a getter counts — a computed property is behaviour,
 * and it is read through the descriptor so listing it never invokes it. For an
 * **ES module namespace** every export is a getter, including plain constants,
 * so getters are resolved to values there and only functions count. A constant
 * is pinned by the cases that use it, not by a case of its own.
 */
export function callableMembers(subject: object): readonly string[] {
	const isModule =
		(subject as { [Symbol.toStringTag]?: string })[Symbol.toStringTag] ===
		"Module";
	const names = new Set<string>();
	for (
		let node: object | null = subject;
		node && node !== Object.prototype;
		node = Object.getPrototypeOf(node) as object | null
	) {
		for (const key of Object.getOwnPropertyNames(node)) {
			if (key === "constructor") continue;
			// Descriptors decide, so listing a getter never invokes it.
			if (!isModule && Object.getOwnPropertyDescriptor(node, key)?.get)
				names.add(key);
			else if (typeof (subject as Record<string, unknown>)[key] === "function")
				names.add(key);
		}
	}
	return [...names].sort();
}

export interface ConcernOptions<T extends object> {
	/** Built per case: the setup, declared once. */
	readonly subject: () => T | Promise<T>;
	readonly cases: string;
	/** Run after each case: the teardown, declared once. */
	readonly teardown?: (subject: T) => unknown;
	/** Members intentionally without cases, each with a reason. */
	readonly uncovered?: Readonly<Record<string, string>>;
}

export function describeConcern<T extends object>(
	name: string,
	options: ConcernOptions<T>,
): void {
	const cases = parseConcernCases(
		readFileSync(options.cases, "utf8"),
		options.cases,
	);
	const byMethod = new Map<string, ConcernCase[]>();
	for (const row of cases)
		byMethod.set(row.method, [...(byMethod.get(row.method) ?? []), row]);

	describe(name, () => {
		it("covers every member", async () => {
			const members = callableMembers(await options.subject());
			// Named, not counted: a count tells whoever added the method nothing.
			expect(
				members.filter(
					(m) => !byMethod.has(m) && options.uncovered?.[m] === undefined,
				),
			).toEqual([]);
			expect(
				Object.keys(options.uncovered ?? {}).filter(
					(m) => !members.includes(m) || byMethod.has(m),
				),
				"exemptions that no longer apply",
			).toEqual([]);
		});

		for (const [method, rows] of [...byMethod].sort())
			it.each(
				rows.map((r) => [r.name ?? JSON.stringify(r.input ?? []), r]),
			)(`${method} %s`, async (_label, row) => {
				const subject = await options.subject();
				try {
					const member = (subject as Record<string, unknown>)[method];
					const actual =
						typeof member === "function"
							? await (member as (...a: unknown[]) => unknown).apply(subject, [
									...(row.input ?? []),
								])
							: member;
					if (row.throws !== undefined)
						expect.unreachable(`expected a throw matching ${row.throws}`);
					if (row.match !== undefined)
						// Objects are stringified so a case can match into a returned
						// errors array without needing a path expression.
						expect(
							typeof actual === "string" ? actual : JSON.stringify(actual),
						).toMatch(new RegExp(row.match, "u"));
					if (row.expect !== undefined) expect(actual).toEqual(row.expect);
				} catch (error) {
					if (row.throws === undefined) throw error;
					expect((error as Error).message).toMatch(new RegExp(row.throws, "u"));
				} finally {
					await options.teardown?.(subject);
				}
			});
	});
}
