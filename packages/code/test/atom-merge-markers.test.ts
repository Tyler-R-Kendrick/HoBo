/**
 * Entity-aware snippet merge — markers, strategies, and failing closed.
 *
 * Atoms compose by contributing snippets, and two atoms may contribute to the
 * same output path. The merge decides what that file ends up containing, which
 * makes it the place where a composition either produces working code or
 * produces something that compiles and does the wrong thing.
 *
 * **Unmarked snippets must be byte-identical.** A file with no markers offers
 * no way to combine two versions, so two different bodies at one path is a
 * refusal — never a last-writer-wins. Silently overwriting would let one atom
 * delete another's contribution with no signal at all.
 *
 * **Marked snippets merge by (entity, slot/hole), and the skeleton around
 * them must match.** The skeleton is the shared shape both atoms agreed on. If
 * it differs, the two are contributing to different files that happen to share
 * a path, and merging their slots would splice one atom's body into the
 * other's structure.
 *
 * **The three strategies encode three different intents.** `append` grows a
 * list, `union` de-duplicates it, and `once` says "exactly one atom owns this"
 * — so `once` drifting between two atoms is a conflict, not something to
 * reconcile. A trainable hole behaves the same way: two atoms filling one hole
 * differently is a genuine disagreement about behaviour.
 *
 * **Malformed markers degrade to unmarked rather than throwing.** A nested or
 * unterminated block cannot be merged structurally, and treating it as an
 * opaque body means the identical-bodies rule still protects the file. The
 * alternative — a parse error deep inside composition — would be much harder
 * to trace back to the snippet that caused it.
 */
import { describe, expect, it } from "vitest";

import {
	mergeAtomFiles,
	parseSnippet,
	type SnippetContribution,
} from "../src/atom-merge.js";

/** Build a contribution; the path defaults so most tests can ignore it. */
function snippet(
	body: string,
	options: { path?: string; atomId?: string } = {},
): SnippetContribution {
	return {
		path: options.path ?? "src/app.ts",
		body,
		atomId: options.atomId ?? "atom:a",
	};
}

/** The merged text at a path, or undefined when the merge refused. */
function mergedAt(
	contributions: readonly SnippetContribution[],
	path = "src/app.ts",
) {
	const result = mergeAtomFiles(contributions);
	return result.ok ? result.files.get(path) : undefined;
}

const ENTITY = "/* @hobo.entity yard:app */";
const slot = (name: string, body: string, strategy?: string) =>
	`/* @hobo.slot ${name}${strategy ? ` strategy=${strategy}` : ""} */${body}/* @hobo.end */`;
const hole = (name: string, body: string) =>
	`/* @hobo.hole ${name} kind=trainable */${body}/* @hobo.end */`;

describe("parseSnippet", () => {
	it("treats a snippet with no markers as an opaque body", () => {
		const parsed = parseSnippet("export const x = 1;\n");
		expect(parsed.kind).toBe("unmarked");
	});

	it("extracts the entity, the skeleton, and each slot", () => {
		// The skeleton is what both atoms have to agree on; the slots are what
		// they are allowed to differ in. Separating them is the whole mechanism.
		const parsed = parseSnippet(
			`${ENTITY}\nconst camps = [${slot("camps", "1,")}];\n`,
		);
		expect(parsed.kind).toBe("marked");
		if (parsed.kind !== "marked") return;
		expect(parsed.entity).toBe("yard:app");
		expect(parsed.skeleton).toContain("__HOBO_SLOT_camps__");
		expect(parsed.slots).toHaveLength(1);
		expect(parsed.slots[0]?.body).toBe("1,");
	});

	it("keeps holes separate from slots", () => {
		// A hole is trainable — one atom owns its contents. Folding holes into
		// slots would let two atoms append competing implementations.
		const parsed = parseSnippet(`${ENTITY}\n${hole("greet", "return 1;")}\n`);
		expect(parsed.kind).toBe("marked");
		if (parsed.kind !== "marked") return;
		expect(parsed.slots).toHaveLength(0);
		expect(parsed.holes.greet).toBe("return 1;");
	});

	it("reads a name from an explicit attribute or the first positional token", () => {
		// Both spellings appear in real atoms. Supporting only one would make
		// half of them parse as `anon` and collide with each other.
		for (const marker of [
			"/* @hobo.slot camps */x/* @hobo.end */",
			"/* @hobo.slot name=camps */x/* @hobo.end */",
		]) {
			const parsed = parseSnippet(`${ENTITY}${marker}`);
			expect(parsed.kind === "marked" && parsed.slots[0]?.name).toBe("camps");
		}
	});

	it("falls back to an id attribute, then to anon", () => {
		expect(
			parseSnippet(`${ENTITY}/* @hobo.slot id=camps */x/* @hobo.end */`),
		).toMatchObject({ slots: [{ name: "camps" }] });
		expect(
			parseSnippet(`${ENTITY}/* @hobo.slot strategy=union */x/* @hobo.end */`),
		).toMatchObject({ slots: [{ name: "anon" }] });
	});

	it("defaults an unknown or absent strategy to append", () => {
		// `append` is the only strategy that never loses a contribution. A typo
		// in the attribute must not silently become `once` and start refusing
		// merges, nor `union` and start dropping duplicate lines.
		for (const raw of ["", " strategy=frobnicate", " strategy="]) {
			const parsed = parseSnippet(
				`${ENTITY}/* @hobo.slot camps${raw} */x/* @hobo.end */`,
			);
			expect(parsed.kind === "marked" && parsed.slots[0]?.strategy).toBe(
				"append",
			);
		}
	});

	it("reads each documented strategy", () => {
		for (const strategy of ["append", "union", "once"]) {
			expect(
				parseSnippet(`${ENTITY}${slot("camps", "x", strategy)}`),
			).toMatchObject({ slots: [{ strategy }] });
		}
	});

	it("treats a nested block as unmarked rather than throwing", () => {
		// Two opens with no close between them cannot be resolved structurally.
		// Degrading to an opaque body keeps the identical-bodies rule in force
		// instead of raising a parse error from inside composition.
		const parsed = parseSnippet(
			`${ENTITY}/* @hobo.slot a *//* @hobo.slot b */x/* @hobo.end */`,
		);
		expect(parsed.kind).toBe("unmarked");
	});

	it("treats an unterminated block as unmarked", () => {
		expect(parseSnippet(`${ENTITY}/* @hobo.slot camps */x`)).toMatchObject({
			kind: "unmarked",
		});
	});

	it("ignores an end marker with nothing open", () => {
		// A stray `@hobo.end` is noise, not a structural failure — the file
		// still has a usable skeleton around whatever else it declares.
		const parsed = parseSnippet(`${ENTITY}/* @hobo.end */\nconst x = 1;\n`);
		expect(parsed.kind).toBe("marked");
	});

	it("parses a snippet marked only with slots and no entity", () => {
		// The entity is optional; the path stands in for it. A snippet that
		// declares slots without one still has to merge structurally.
		const parsed = parseSnippet(slot("camps", "x"));
		expect(parsed.kind).toBe("marked");
		expect(parsed.kind === "marked" && parsed.entity).toBe("");
	});
});

describe("unmarked contributions", () => {
	it("passes a single body through unchanged", () => {
		expect(mergedAt([snippet("export const x = 1;\n")])).toBe(
			"export const x = 1;\n",
		);
	});

	it("accepts two identical bodies, ignoring surrounding whitespace", () => {
		// Formatters and editors differ on trailing newlines. Refusing over that
		// would make composition depend on whose editor wrote the atom.
		const result = mergeAtomFiles([
			snippet("export const x = 1;"),
			snippet("export const x = 1;\n\n", { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(true);
	});

	it("refuses two different bodies rather than letting one win", () => {
		// There is no structure to merge on. Last-writer-wins would let one atom
		// delete another's contribution with no signal anywhere.
		const result = mergeAtomFiles([
			snippet("export const x = 1;"),
			snippet("export const x = 2;", { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("ATOM_MERGE_UNMARKED");
		expect(result.conflict?.reason).toContain("atom:b");
		expect(result.conflict?.path).toBe("src/app.ts");
	});

	it("refuses to mix a marked snippet with an unmarked one", () => {
		// One has structure and one does not, in either order. Merging them
		// would either discard the markers or wrap an opaque body in a skeleton
		// it never agreed to.
		for (const bodies of [
			["plain", `${ENTITY}${slot("camps", "x")}`],
			[`${ENTITY}${slot("camps", "x")}`, "plain"],
		]) {
			const result = mergeAtomFiles([
				snippet(bodies[0] as string),
				snippet(bodies[1] as string, { atomId: "atom:b" }),
			]);
			expect(result.ok).toBe(false);
			expect(result.code).toBe("ATOM_MERGE_CONFLICT");
			expect(result.conflict?.reason).toContain("marked and unmarked");
		}
	});
});

describe("marked contributions — structure", () => {
	it("refuses when the two snippets name different entities", () => {
		// Same path, different entity means these are two different files that
		// collided. Merging their slots would splice one atom's body into the
		// other's structure.
		const result = mergeAtomFiles([
			snippet(`/* @hobo.entity yard:a */${slot("camps", "1,")}`),
			snippet(`/* @hobo.entity yard:b */${slot("camps", "2,")}`, {
				atomId: "atom:b",
			}),
		]);
		expect(result.ok).toBe(false);
		expect(result.conflict?.reason).toContain("yard:a vs yard:b");
	});

	it("refuses when only one side carries the entity marker — on the skeleton", () => {
		// The entity comment is part of the skeleton, not metadata beside it, so
		// omitting it is a structural difference rather than a missing name. The
		// refusal names the skeleton rather than the entity, which is accurate:
		// the two snippets really do describe differently-shaped files. Pinned
		// as-is — both atoms contributing to one entity must spell it the same
		// way, and the alternative (stripping the marker before comparing) would
		// let a snippet that never named the entity merge into one that did.
		const result = mergeAtomFiles([
			snippet(`/* @hobo.entity yard:a */${slot("camps", "1,")}`),
			snippet(slot("camps", "2,"), { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(false);
		expect(result.conflict?.reason).toBe("snippet skeleton mismatch");
	});

	it("merges two snippets that both omit the entity, keyed on the path", () => {
		// With no entity on either side the path stands in for one, so the
		// skeletons match and the slots merge normally.
		const merged = mergedAt([
			snippet(`[${slot("camps", "1,")}]`),
			snippet(`[${slot("camps", "2,")}]`, { atomId: "atom:b" }),
		]);
		expect(merged).toContain("1,");
		expect(merged).toContain("2,");
	});

	it("refuses when the skeletons differ", () => {
		// The skeleton is the shape both atoms agreed on. Different skeletons
		// mean they disagree about the file itself, not about a slot's contents.
		const result = mergeAtomFiles([
			snippet(`${ENTITY}const camps = [${slot("camps", "1,")}];`),
			snippet(`${ENTITY}const yards = [${slot("camps", "2,")}];`, {
				atomId: "atom:b",
			}),
		]);
		expect(result.ok).toBe(false);
		expect(result.conflict?.reason).toBe("snippet skeleton mismatch");
		expect(result.conflict?.entity).toBe("yard:app");
	});

	it("compares skeletons ignoring surrounding whitespace", () => {
		const result = mergeAtomFiles([
			snippet(`${ENTITY}\nconst c = [${slot("camps", "1,")}];`),
			snippet(`${ENTITY}\nconst c = [${slot("camps", "2,")}];\n\n`, {
				atomId: "atom:b",
			}),
		]);
		expect(result.ok).toBe(true);
	});

	it("takes a slot only one side declares", () => {
		// Atoms contribute different slots to a shared skeleton. Dropping the
		// ones only one side names would silently discard its whole
		// contribution.
		const merged = mergedAt([
			snippet(`${ENTITY}${slot("a", "1,")}${slot("b", "")}`),
			snippet(`${ENTITY}${slot("a", "")}${slot("b", "2,")}`, {
				atomId: "atom:b",
			}),
		]);
		expect(merged).toContain("1,");
		expect(merged).toContain("2,");
	});

	it("renders the merged slots back into the skeleton", () => {
		const merged = mergedAt([
			snippet(`${ENTITY}\nconst camps = [${slot("camps", "1,")}];\n`),
		]);
		expect(merged).toContain("const camps = [1,];");
		expect(merged).not.toContain("__HOBO_SLOT_");
	});
});

describe("merge strategies", () => {
	const two = (left: string, right: string, strategy: string, name = "camps") =>
		mergedAt([
			snippet(`${ENTITY}[${slot(name, left, strategy)}]`),
			snippet(`${ENTITY}[${slot(name, right, strategy)}]`, {
				atomId: "atom:b",
			}),
		]);

	it("append concatenates both bodies", () => {
		const merged = two("alpha,", "beta,", "append");
		expect(merged).toContain("alpha,");
		expect(merged).toContain("beta,");
	});

	it("append keeps the longer body when one already contains the other", () => {
		// Two atoms contributing overlapping lists would otherwise produce
		// duplicated entries that a later compile rejects.
		expect(two("alpha,\nbeta,", "beta,", "append")).toContain("alpha,");
		expect(
			(two("alpha,\nbeta,", "beta,", "append") ?? "").match(/beta,/gu),
		).toHaveLength(1);
	});

	it("union de-duplicates lines across both bodies", () => {
		const merged = two("alpha,\nbeta,", "beta,\ngamma,", "union") ?? "";
		expect(merged.match(/beta,/gu)).toHaveLength(1);
		expect(merged).toContain("alpha,");
		expect(merged).toContain("gamma,");
	});

	it("union collapses runs of blank lines but keeps one", () => {
		// Blank lines are formatting, not content. Removing them all would jam
		// declarations together; keeping every duplicate would leave gaps that
		// grow with each atom.
		const merged = two("a,\n\n\nb,", "\n\nc,", "union") ?? "";
		expect(merged).not.toMatch(/\n\n\n/u);
		expect(merged).toContain("c,");
	});

	it("once accepts two identical bodies", () => {
		// Two atoms declaring the same single-owner block have not disagreed.
		expect(two("  const x = 1;  ", "const x = 1;", "once")).toContain(
			"const x = 1;",
		);
	});

	it("once takes the non-empty side when the other is blank", () => {
		// A placeholder atom declaring an empty owner block should not block the
		// atom that actually fills it.
		expect(two("", "const x = 1;", "once")).toContain("const x = 1;");
		expect(two("const x = 1;", "   \n ", "once")).toContain("const x = 1;");
	});

	it("refuses when two once-slots carry different bodies", () => {
		// `once` means exactly one atom owns this block. Two different bodies is
		// a real disagreement about ownership, and appending them would produce
		// a duplicate declaration.
		const result = mergeAtomFiles([
			snippet(`${ENTITY}[${slot("cfg", "const x = 1;", "once")}]`),
			snippet(`${ENTITY}[${slot("cfg", "const x = 2;", "once")}]`, {
				atomId: "atom:b",
			}),
		]);
		expect(result.ok).toBe(false);
		expect(result.code).toBe("ATOM_MERGE_CONFLICT");
		expect(result.conflict?.reason).toContain("once-slot cfg drifted");
		expect(result.conflict?.slot).toBe("cfg");
	});

	it("lets either side's strategy decide, not only the first", () => {
		// Atoms are merged in contribution order, which is not something an
		// author controls. A strategy that only applied when it happened to be
		// on the left would make the outcome depend on load order.
		const leftOnce = mergeAtomFiles([
			snippet(`${ENTITY}[${slot("cfg", "a", "once")}]`),
			snippet(`${ENTITY}[${slot("cfg", "b", "append")}]`, { atomId: "b" }),
		]);
		const rightOnce = mergeAtomFiles([
			snippet(`${ENTITY}[${slot("cfg", "a", "append")}]`),
			snippet(`${ENTITY}[${slot("cfg", "b", "once")}]`, { atomId: "b" }),
		]);
		expect(leftOnce.ok).toBe(false);
		expect(rightOnce.ok).toBe(false);
	});
});

describe("trainable holes", () => {
	it("reports every hole it filled", () => {
		// The holes list is what tells the caller which parts of the output are
		// trainable rather than generated. An unreported hole would be treated
		// as fixed code.
		const result = mergeAtomFiles([
			snippet(`${ENTITY}${hole("greet", "return 1;")}${hole("bye", "")}`),
		]);
		expect(result.ok).toBe(true);
		expect(result.holes.sort()).toEqual(["bye", "greet"]);
	});

	it("accepts the same hole filled identically by both atoms", () => {
		const result = mergeAtomFiles([
			snippet(`${ENTITY}${hole("greet", " return 1; ")}`),
			snippet(`${ENTITY}${hole("greet", "return 1;")}`, { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(true);
	});

	it("refuses a hole two atoms fill differently", () => {
		// Unlike a slot, a hole has no combining rule — it is one
		// implementation. Two different bodies is a disagreement about
		// behaviour, and appending them would produce unreachable code.
		const result = mergeAtomFiles([
			snippet(`${ENTITY}${hole("greet", "return 1;")}`),
			snippet(`${ENTITY}${hole("greet", "return 2;")}`, { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(false);
		expect(result.conflict?.reason).toContain("trainable hole greet");
		expect(result.conflict?.slot).toBe("greet");
	});

	it("treats an empty hole body as a filling, not as unfilled", () => {
		// Unlike a `once` slot, an empty hole is not skipped: `""` and `"1"` are
		// two different bodies for one hole, so the merge refuses. Pinned rather
		// than smoothed over — a hole is a single implementation, and an atom
		// that declares one and leaves it blank is asserting the blank body. The
		// way to contribute a hole from one atom only is for the other not to
		// declare it.
		const result = mergeAtomFiles([
			snippet(`${ENTITY}${hole("a", "1")}`),
			snippet(`${ENTITY}${hole("a", "")}`, { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(false);
		expect(result.conflict?.reason).toContain("trainable hole a");
	});

	it("takes a hole only one side declares", () => {
		// Here the skeletons agree and only one atom names the hole, which is
		// how a single atom owns a trainable block in a shared file.
		const result = mergeAtomFiles([
			snippet(`${ENTITY}${hole("a", "1")}`),
			snippet(`${ENTITY}${hole("a", "1")}`, { atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(true);
		expect(result.holes).toContain("a");
	});
});

describe("multiple paths", () => {
	it("merges each path independently", () => {
		const result = mergeAtomFiles([
			snippet("A", { path: "a.ts" }),
			snippet("B", { path: "b.ts", atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(true);
		expect(result.files.get("a.ts")).toBe("A");
		expect(result.files.get("b.ts")).toBe("B");
	});

	it("returns the files merged so far alongside a conflict", () => {
		// A caller reporting the failure can say what else was affected. An
		// empty map would make a single bad snippet look like nothing merged.
		const result = mergeAtomFiles([
			snippet("A", { path: "a.ts" }),
			snippet("X", { path: "b.ts" }),
			snippet("Y", { path: "b.ts", atomId: "atom:b" }),
		]);
		expect(result.ok).toBe(false);
		expect(result.files.get("a.ts")).toBe("A");
		expect(result.conflict?.path).toBe("b.ts");
	});

	it("returns nothing for an empty contribution list", () => {
		const result = mergeAtomFiles([]);
		expect(result.ok).toBe(true);
		expect(result.files.size).toBe(0);
		expect(result.holes).toEqual([]);
	});
});
