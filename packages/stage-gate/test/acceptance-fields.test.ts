/**
 * HoBo reads ai-bdd's report across a process boundary and imports no ai-bdd
 * code, so the only statement of the contract on this side is the schema file
 * copied into test/fixtures/ai-bdd/. These tests hold the parser to it: every
 * field RunReport v1 requires is read (its removal is refused) or deliberately
 * ignored (its removal changes nothing), and the ledger in
 * src/acceptance-fields.ts names exactly those fields.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseAiBddRunReport } from "../src/acceptance.js";
import { RUN_REPORT_FIELDS } from "../src/acceptance-fields.js";
import {
	isJsonArray,
	isJsonObject,
	isJsonString,
	type JsonObject,
	type JsonValue,
	parseJsonText,
} from "../src/json.js";
import {
	bytesOf,
	FIXTURE_DIR,
	fixtureBytes,
	fixtureDoc,
	removeAt,
} from "./helpers/ai-bdd-report.js";

/** sha256 of each copied file; README.md beside them records the same values and where they came from. */
const COPIED = {
	"report.v1.passed.json":
		"39b3124e109795fcb285de613fb0eee1bf60322a017c0d1b6c54639e7bdebbb1",
	"report.v1.failed.json":
		"b8924cf22dd6ad3b5a7c235b24943e69b698f5b2d865e5db6020da5959f7b76f",
	// ai-bdd pins this digest too: version 1 of the schema is closed and never edited.
	"run-report.v1.schema.json":
		"1efd7ec47083fc69fdb60b87e941778e5976810e4262acdd767231c9976e2d9a",
} as const;

const LEDGER = Object.entries(RUN_REPORT_FIELDS);
const VERDICTS = new Map(LEDGER);
const READ = LEDGER.filter(([, verdict]) => verdict === "read").map(([p]) => p);
const IGNORED = LEDGER.filter(([, verdict]) => verdict !== "read").map(
	([p]) => p,
);

function schema(): JsonObject {
	const document = parseJsonText(
		fixtureBytes("run-report.v1.schema.json").toString("utf8"),
	);
	if (!isJsonObject(document)) throw new Error("schema is not an object");
	return document;
}

function objectAt(node: JsonValue | undefined, what: string): JsonObject {
	if (!isJsonObject(node)) throw new Error(`schema: ${what} is not an object`);
	return node;
}

/** Follow `#/$defs/<name>` references; the schema uses no other kind. */
function resolve(root: JsonObject, node: JsonObject): JsonObject {
	const ref = node.$ref;
	if (!isJsonString(ref)) return node;
	const name = ref.replace("#/$defs/", "");
	return resolve(root, objectAt(objectAt(root.$defs, "$defs")[name], ref));
}

/** The object schema a required field opens into, through an array's items. */
function openedObject(root: JsonObject, node: JsonObject): JsonObject | null {
	const resolved = resolve(root, node);
	if (resolved.type === "array") {
		return openedObject(root, objectAt(resolved.items, "items"));
	}
	return resolved.type === "object" ? resolved : null;
}

function segmentOf(root: JsonObject, node: JsonObject, key: string): string {
	return resolve(root, node).type === "array" ? `${key}[]` : key;
}

/**
 * Required field paths, in ledger notation, descending only into fields the
 * ledger marks `read`: nothing under an ignored field is looked at.
 */
function requiredPaths(root: JsonObject): string[] {
	const found: string[] = [];
	const visit = (node: JsonObject, prefix: string) => {
		const required = isJsonArray(node.required) ? node.required : [];
		const properties = objectAt(node.properties, `${prefix} properties`);
		for (const key of required) {
			if (!isJsonString(key)) continue;
			const child = objectAt(properties[key], `${prefix}${key}`);
			const path = `${prefix}${key}`;
			found.push(path);
			const verdict = VERDICTS.get(path);
			const opened = openedObject(root, child);
			if (verdict === "read" && opened !== null) {
				visit(opened, `${prefix}${segmentOf(root, child, key)}.`);
			}
		}
	};
	visit(root, "");
	return found;
}

describe("the copied ai-bdd files", () => {
	it.each(Object.entries(COPIED))("%s is the recorded bytes", (name, sha) => {
		const digest = createHash("sha256")
			.update(fixtureBytes(name))
			.digest("hex");
		expect(digest).toBe(sha);
		const readme = readFileSync(join(FIXTURE_DIR, "README.md"), "utf8");
		expect(readme).toContain(`${sha}  ${name}`);
	});
});

describe("RunReport v1 fields against the parser", () => {
	it("every required field of RunReport v1 is read or deliberately ignored, and nothing else is listed", () => {
		const required = requiredPaths(schema());
		expect(
			required.filter((path) => !Object.hasOwn(RUN_REPORT_FIELDS, path)),
		).toEqual([]);
		expect(
			LEDGER.map(([path]) => path).filter((p) => !required.includes(p)),
		).toEqual([]);
	});

	it("every ignored field says why", () => {
		for (const [, verdict] of LEDGER) {
			expect(verdict).toMatch(/^(read|ignored: .{10,})$/u);
		}
	});

	it.each(READ)("a report without %s is refused", (path) => {
		const bytes = bytesOf(removeAt(fixtureDoc("passed"), path));
		expect(() => parseAiBddRunReport(bytes)).toThrow();
	});

	it.each(IGNORED)("a report without %s yields the same evidence", (path) => {
		const { reportDigest: _whole, ...expected } = parseAiBddRunReport(
			fixtureBytes("report.v1.passed.json"),
		);
		const { reportDigest, ...evidence } = parseAiBddRunReport(
			bytesOf(removeAt(fixtureDoc("passed"), path)),
		);
		expect(evidence).toEqual(expected);
		expect(reportDigest).not.toBe(_whole);
	});
});
