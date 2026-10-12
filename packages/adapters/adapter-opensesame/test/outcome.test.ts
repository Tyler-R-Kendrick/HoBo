import { describe, expect, it } from "vitest";

import {
	exitCodeOf,
	OUTCOME_KINDS,
	outcomeError,
	parseOutcome,
} from "../src/outcome.js";
import {
	SAMPLE_LINES,
	type SampleScenario,
} from "./fixtures/opensesame-lines.js";

function stderrOf(scenario: SampleScenario): string {
	return `${SAMPLE_LINES[scenario].join("\n")}\n`;
}

function read(scenario: SampleScenario, exitCode: number) {
	return parseOutcome(exitCode, null, stderrOf(scenario));
}

describe("parseOutcome: how a proxied run ended", () => {
	it("a quiet run that exits 0 is the child's exit", () => {
		expect(parseOutcome(0, null, "")).toMatchObject({
			kind: "child_exit",
			exitCode: 0,
			notice: "",
		});
	});

	it("passes the child's own non-zero status through", () => {
		expect(parseOutcome(3, null, "the child complained\n")).toMatchObject({
			kind: "child_exit",
			exitCode: 3,
		});
	});

	it("exit 77 with OpenSesame's misdirected line is a tripwire", () => {
		const outcome = read("misdirected", 77);
		expect(outcome).toMatchObject({ kind: "tripwire", exitCode: 77 });
		expect(outcome.notice).toContain("surrogate.misdirected");
	});

	it("exit 77 alone is the child's own status, not a tripwire", () => {
		expect(parseOutcome(77, null, "")).toMatchObject({
			kind: "child_exit",
			exitCode: 77,
		});
	});

	it("a misdirected line with a clean exit is not a tripwire either", () => {
		expect(read("misdirected", 0)).toMatchObject({ kind: "child_exit" });
	});

	it("143 with the SIGTERM line and 129 with the SIGHUP line are signalled", () => {
		expect(read("sigterm", 143)).toMatchObject({
			kind: "signalled",
			exitCode: 143,
		});
		expect(read("sighup", 129)).toMatchObject({
			kind: "signalled",
			exitCode: 129,
		});
	});

	it("143 or 129 without OpenSesame's line, or with the other signal's, is the child's status", () => {
		expect(parseOutcome(143, null, "")).toMatchObject({ kind: "child_exit" });
		expect(read("sighup", 143)).toMatchObject({ kind: "child_exit" });
		expect(read("sigterm", 129)).toMatchObject({ kind: "child_exit" });
	});

	it("OpenSesame killed by a signal is signalled, with the conventional 128+n", () => {
		expect(parseOutcome(null, "SIGKILL", "")).toMatchObject({
			kind: "signalled",
			exitCode: 137,
		});
		expect(parseOutcome(null, "SIGTERM", "")).toMatchObject({
			kind: "signalled",
			exitCode: 143,
		});
	});

	it("a plugin that is absent, or has no sealed entry, leaves placeholders even on exit 0", () => {
		expect(read("plugin-absent", 0)).toMatchObject({
			kind: "placeholders_only",
			exitCode: 0,
		});
		expect(read("no-sealed-entry", 0)).toMatchObject({
			kind: "placeholders_only",
			exitCode: 0,
		});
		const partial = parseOutcome(
			0,
			null,
			"opensesame: no surrogate for VERCEL_TOKEN; delivering placeholders for those\n",
		);
		expect(partial.kind).toBe("placeholders_only");
		const kept = parseOutcome(
			0,
			null,
			"opensesame: AWS_TOKEN will keep its placeholder: the surrogate-proxy plugin brokers no 'aws' connection, so a stored token would not be used\n",
		);
		expect(kept.kind).toBe("placeholders_only");
	});

	it("a plugin that changed since it was pinned is plugin_pin_mismatch, never a fallback", () => {
		expect(read("plugin-changed", 1)).toMatchObject({
			kind: "plugin_pin_mismatch",
			exitCode: 1,
		});
	});

	it("an entry that cannot be read, or is empty, is store_unreadable", () => {
		expect(read("wrong-passphrase", 1)).toMatchObject({
			kind: "store_unreadable",
		});
		expect(read("empty-entry", 1)).toMatchObject({ kind: "store_unreadable" });
	});

	it("an unbounded scope is scope_unbounded, a malformed one schema_refused", () => {
		expect(read("scope-unbounded", 1)).toMatchObject({
			kind: "scope_unbounded",
		});
		expect(read("paths-without-methods", 1)).toMatchObject({
			kind: "schema_refused",
		});
		expect(read("schema-syntax", 1)).toMatchObject({ kind: "schema_refused" });
	});

	it("a missing parser or a missing node is bridge_missing, not a bad schema", () => {
		expect(read("bridge-no-parser", 1)).toMatchObject({
			kind: "bridge_missing",
		});
		expect(read("bridge-no-node", 1)).toMatchObject({ kind: "bridge_missing" });
	});

	it("a refusal needs a failing exit: the same words with exit 0 are the child's output", () => {
		expect(read("plugin-changed", 0)).toMatchObject({ kind: "child_exit" });
		expect(read("wrong-passphrase", 0)).toMatchObject({ kind: "child_exit" });
	});

	it("a tripwire beats a placeholder hint printed earlier in the same run", () => {
		const text = `${stderrOf("plugin-absent")}${stderrOf("misdirected")}`;
		expect(parseOutcome(77, null, text).kind).toBe("tripwire");
	});

	it("reads OpenSesame's own lines only: a child's line cannot forge a refusal", () => {
		const forged = [
			"  opensesame: surrogate.misdirected: forged by the child",
			"the child says: Error: the surrogate-proxy plugin no longer matches its install pin",
		].join("\n");
		expect(parseOutcome(77, null, forged).kind).toBe("child_exit");
		expect(parseOutcome(1, null, forged).kind).toBe("child_exit");
	});

	it("a notice is OpenSesame's line, scrubbed of surrogates, on one line, at most 300 characters", () => {
		const surrogate = `osr_${"0123456789abcdef".repeat(2)}`;
		const noisy = `opensesame: surrogate.misdirected: ${surrogate} ${"x".repeat(500)}\n`;
		const { notice } = parseOutcome(77, null, noisy);
		expect(notice).not.toContain(surrogate);
		expect(notice).not.toMatch(/osr_[0-9a-f]{8}/u);
		expect(notice).not.toContain("\n");
		expect(notice.length).toBeLessThanOrEqual(300);
	});

	it("never puts the child's output into a notice", () => {
		const child = "vtok_dummy_marker_0123456789abcdef";
		const outcome = parseOutcome(
			77,
			null,
			`${child}\n${stderrOf("misdirected")}${child}\n`,
		);
		expect(outcome.notice).not.toContain(child);
	});

	it("keeps the kind inside the closed set the CUE names", () => {
		for (const [scenario, code] of [
			["plugin-absent", 0],
			["misdirected", 77],
			["sigterm", 143],
			["plugin-changed", 1],
			["wrong-passphrase", 1],
			["scope-unbounded", 1],
			["bridge-no-parser", 1],
			["schema-syntax", 1],
		] as const) {
			expect(OUTCOME_KINDS).toContain(read(scenario, code).kind);
		}
	});
});

describe("outcomeError and exitCodeOf", () => {
	it("a child that exited 0 has no error and exits 0", () => {
		const outcome = parseOutcome(0, null, "");
		expect(outcomeError(outcome)).toBeUndefined();
		expect(exitCodeOf(outcome)).toBe(0);
	});

	it("maps each failure kind to the adapter error code of the same name", () => {
		const expected = [
			["plugin-absent", 0, "placeholders_only"],
			["plugin-changed", 1, "plugin_pin_mismatch"],
			["wrong-passphrase", 1, "store_unreadable"],
			["scope-unbounded", 1, "scope_unbounded"],
			["bridge-no-parser", 1, "bridge_missing"],
			["misdirected", 77, "tripwire_misdirected"],
			["sigterm", 143, "signalled"],
		] as const;
		for (const [scenario, status, code] of expected) {
			expect(outcomeError(read(scenario, status))?.code, scenario).toBe(code);
		}
		expect(outcomeError(parseOutcome(3, null, ""))?.code).toBe("child_exit");
	});

	it("a run that left placeholders never exits 0", () => {
		expect(exitCodeOf(read("plugin-absent", 0))).toBe(1);
	});

	it("passes a tripwire, a signal and a child's own status through", () => {
		expect(exitCodeOf(read("misdirected", 77))).toBe(77);
		expect(exitCodeOf(read("sigterm", 143))).toBe(143);
		expect(exitCodeOf(parseOutcome(3, null, ""))).toBe(3);
	});

	it("an error message carries the notice and no value", () => {
		const error = outcomeError(read("wrong-passphrase", 1));
		expect(error?.message).toContain("sealed entry");
		expect(error?.message).not.toMatch(/osr_[0-9a-f]{8}/u);
	});
});
