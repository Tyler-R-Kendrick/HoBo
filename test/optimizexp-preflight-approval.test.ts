import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

for (const mirror of [".agents", ".claude"]) {
	for (const file of [
		`${mirror}/skills/optimizexp/SKILL.md`,
		`${mirror}/skills/optimizexp/references/doctor.md`,
	]) {
		test(`${file} grants standing approval only for safe in-scope preflight repair`, () => {
			const text = readFileSync(file, "utf8");
			assert.match(text, /standing approval|always approved/i);
			assert.match(text, /safe[^\n]*in-scope|in-scope[^\n]*safe/i);
			for (const exclusion of [
				"destructive",
				"network",
				"secret",
				"unrelated",
			]) {
				assert.match(text, new RegExp(exclusion, "i"), exclusion);
			}
		});
	}
}
