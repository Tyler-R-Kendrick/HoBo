import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { checkCompetitorDocs } from "../scripts/check-competitor-docs.js";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

type Overrides = Partial<Record<string, string>>;

function capture(overrides: Overrides = {}) {
	const fields: Record<string, string> = {
		slug: "acme",
		name: '"Acme"',
		primary_category: "infrastructure-from-code",
		categories: "[infrastructure-from-code]",
		directness: "direct",
		role: '"authoring analog"',
		posture: "[borrow]",
		hobo_surface: "[authoring]",
		evidence: "design-only",
		status: "active",
		research_date: "2026-01-01",
		...overrides,
	};
	const lines = ["---", "type: Competitive Reference", "competitor:"];
	for (const [key, value] of Object.entries(fields))
		if (value !== undefined) lines.push(`  ${key}: ${value}`);
	lines.push(
		"  sources:",
		"    - https://acme.example/docs",
		"---",
		"",
		"# Acme",
		"",
	);
	return lines.join("\n");
}

const CATEGORY_PAGE = [
	"# Infrastructure-from-Code",
	"",
	"| Competitor |",
	"| ---------- |",
	"| [Acme](../acme.md) |",
	"",
].join("\n");

const MATRIX = [
	"# Matrix",
	"",
	"<!-- BEGIN GENERATED: competitor-matrix -->",
	"<!-- END GENERATED: competitor-matrix -->",
	"",
].join("\n");

async function withCorpus(
	files: Record<string, string>,
	callback: (root: string) => Promise<void>,
) {
	const root = await mkdtemp(path.join(tmpdir(), "hobo-competitor-docs-"));
	try {
		await mkdir(path.join(root, "docs", "competitors", "categories"), {
			recursive: true,
		});
		const all = {
			"docs/competitors/index.md": "# Index\n",
			"docs/competitors/matrix.md": MATRIX,
			"docs/competitors/acme.md": capture(),
			"docs/competitors/categories/infrastructure-from-code.md": CATEGORY_PAGE,
			...files,
		};
		for (const [file, content] of Object.entries(all))
			await writeFile(path.join(root, file), content);
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function messages(files: Record<string, string> = {}) {
	let found: string[] = [];
	await withCorpus(files, async (root) => {
		const { problems } = await checkCompetitorDocs({ root, fix: true });
		found = problems.map((problem) => `${problem.file}: ${problem.message}`);
	});
	return found;
}

test("a conforming corpus passes", async () => {
	assert.deepEqual(await messages(), []);
});

test("the real corpus is valid", async () => {
	const { problems, competitors } = await checkCompetitorDocs({
		root: repoRoot,
	});
	assert.deepEqual(
		problems.map(
			(problem) => `${problem.file}:${problem.line} ${problem.message}`,
		),
		[],
	);
	assert.ok(competitors.length > 0, "expected canonical captures");
});

test("rejects a slug that does not match its filename", async () => {
	const found = await messages({
		"docs/competitors/acme.md": capture({ slug: "other" }),
	});
	assert.ok(
		found.some((message) => message.includes("must match the filename")),
	);
});

test("rejects unknown enum values", async () => {
	const found = await messages({
		"docs/competitors/acme.md": capture({ directness: "sort-of" }),
	});
	assert.ok(found.some((message) => message.includes("is not one of")));
});

test("requires primary_category to be a declared category", async () => {
	const found = await messages({
		"docs/competitors/acme.md": capture({
			primary_category: "runtime-substrates",
			categories: "[infrastructure-from-code, runtime-substrates]",
		}),
	});
	// It is a declared category here, so this variant must pass that particular rule.
	assert.ok(!found.some((message) => message.includes("must also appear")));

	const missing = await messages({
		"docs/competitors/acme.md": capture({
			primary_category: "runtime-substrates",
		}),
	});
	assert.ok(missing.some((message) => message.includes("must also appear")));
});

test("rejects a future research_date", async () => {
	const found = await messages({
		"docs/competitors/acme.md": capture({ research_date: "2099-01-01" }),
	});
	assert.ok(found.some((message) => message.includes("is in the future")));
});

test("rejects duplicate aliases across captures", async () => {
	const found = await messages({
		"docs/competitors/acme.md": capture({ aliases: "[acme-corp]" }),
		"docs/competitors/other.md": capture({
			slug: "other",
			name: '"Other"',
			aliases: "[acme-corp]",
		}),
		"docs/competitors/categories/infrastructure-from-code.md":
			CATEGORY_PAGE.replace(
				"| [Acme](../acme.md) |",
				"| [Acme](../acme.md) |\n| [Other](../other.md) |",
			),
		"docs/competitors/index.md": "# Index\n\nacme-corp\n",
	});
	assert.ok(found.some((message) => message.includes("is already claimed by")));
});

test("requires a category page row for every member", async () => {
	const found = await messages({
		"docs/competitors/categories/infrastructure-from-code.md":
			"# Infrastructure-from-Code\n",
	});
	assert.ok(found.some((message) => message.includes("missing row linking")));
});

test("rejects a category page row for a non-member", async () => {
	const found = await messages({
		"docs/competitors/categories/runtime-substrates.md": CATEGORY_PAGE,
	});
	assert.ok(
		found.some((message) =>
			message.includes('does not declare category "runtime-substrates"'),
		),
	);
});

test("requires aliases to be discoverable from the index", async () => {
	const found = await messages({
		"docs/competitors/acme.md": capture({ aliases: "[acme-corp]" }),
	});
	assert.ok(found.some((message) => message.includes("is not discoverable")));
});

test("reports broken relative links", async () => {
	const found = await messages({
		"docs/competitors/index.md": "# Index\n\n[gone](./nope.md)\n",
	});
	assert.ok(found.some((message) => message.includes("broken relative link")));
});

test("enforces the twelve-section contract only for contract: v1 captures", async () => {
	const pre = await messages();
	assert.ok(
		!pre.some((message) => message.includes("missing required section")),
	);

	const v1 = await messages({
		"docs/competitors/acme.md": capture({ contract: "v1" }),
	});
	assert.ok(v1.some((message) => message.includes("missing required section")));
});

test("--fix regenerates the matrix so a second pass is clean", async () => {
	await withCorpus({}, async (root) => {
		const first = await checkCompetitorDocs({ root, fix: true });
		assert.deepEqual(first.problems, []);
		const matrix = await readFile(
			path.join(root, "docs/competitors/matrix.md"),
			"utf8",
		);
		assert.match(matrix, /\*\*Acme\*\*/);
		const second = await checkCompetitorDocs({ root });
		assert.deepEqual(second.problems, []);
	});
});

test("detects matrix drift without --fix", async () => {
	await withCorpus({}, async (root) => {
		await checkCompetitorDocs({ root, fix: true });
		await writeFile(
			path.join(root, "docs/competitors/acme.md"),
			capture({ directness: "adjacent" }),
		);
		const { problems } = await checkCompetitorDocs({ root });
		assert.ok(
			problems.some((problem) =>
				problem.message.includes("generated matrix is out of date"),
			),
		);
	});
});
