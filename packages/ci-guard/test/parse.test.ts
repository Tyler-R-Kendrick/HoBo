/**
 * Tests for the CI fabric contract parser.
 *
 * The module was 0% covered. It is a parse-don't-validate boundary: it takes
 * `unknown` and returns a `CiFabricContract` that the rest of the guard trusts
 * completely, and every rule it enforces is a CI safety property somebody chose
 * deliberately — the PR gate blocks, E2E auth is OIDC federation with no stored
 * secrets, teardown always runs, quarantine never blocks.
 *
 * A parser like this fails in one direction that matters: accepting something
 * it should have rejected. So each rule gets its own case built by breaking
 * exactly one field of an otherwise-valid contract, which is the only way to
 * know which rule actually fired.
 */
import { describe, expect, it } from "vitest";

import { CI_FABRIC_SCHEMA, CiFabricContractError } from "../src/contract.js";
import { parseCiFabricContract } from "../src/parse.js";

/** A contract that satisfies every rule; each test breaks one field of it. */
function validContract(): Record<string, unknown> {
	return {
		schema: CI_FABRIC_SCHEMA,
		workflow: {
			pullRequestGate: {
				blocksPullRequest: true,
				requiredChecks: ["build", "typecheck", "lint", "unit", "conformance"],
			},
		},
		e2e: {
			auth: { mode: "oidc-federation", forbidsStoredSecrets: true },
			teardown: { always: true, orphanSweeper: { enabled: true } },
			quarantine: { continueOnError: true, blocksPullRequest: false },
			gatedBy: ["unit"],
		},
	};
}

/** Apply a mutation to a deep copy, so cases cannot leak into each other. */
function broken(mutate: (c: Record<string, unknown>) => void) {
	const contract = structuredClone(validContract());
	mutate(contract);
	return contract;
}

function codeOf(input: unknown): string {
	try {
		parseCiFabricContract(input);
	} catch (error) {
		if (error instanceof CiFabricContractError)
			return (error as unknown as { code: string }).code;
		throw error;
	}
	throw new Error("expected parseCiFabricContract to throw");
}

describe("accepting a valid contract", () => {
	it("returns the contract when every rule holds", () => {
		const input = validContract();
		expect(parseCiFabricContract(input)).toBe(input);
	});

	it("accepts a subset of the required checks", () => {
		const input = broken((c) => {
			(
				c.workflow as { pullRequestGate: { requiredChecks: string[] } }
			).pullRequestGate.requiredChecks = ["build"];
		});
		expect(() => parseCiFabricContract(input)).not.toThrow();
	});

	it("accepts an empty required-checks array", () => {
		const input = broken((c) => {
			(
				c.workflow as { pullRequestGate: { requiredChecks: string[] } }
			).pullRequestGate.requiredChecks = [];
		});
		expect(() => parseCiFabricContract(input)).not.toThrow();
	});
});

describe("root and schema", () => {
	it.each([
		null,
		undefined,
		42,
		"contract",
		true,
		[],
	])("rejects a non-record root (%p)", (input) => {
		expect(codeOf(input)).toBe("parse.root");
	});

	it.each([
		"hobo.ciFabric/v2",
		"",
		null,
		undefined,
		1,
	])("rejects the wrong schema (%p)", (schema) => {
		expect(codeOf(broken((c) => void (c.schema = schema)))).toBe(
			"parse.schema",
		);
	});
});

describe("pull request gate", () => {
	it("requires workflow to be an object", () => {
		expect(codeOf(broken((c) => void (c.workflow = "nope")))).toBe(
			"parse.workflow",
		);
	});

	it("requires pullRequestGate to be an object", () => {
		expect(
			codeOf(
				broken(
					(c) =>
						void ((c.workflow as Record<string, unknown>).pullRequestGate = []),
				),
			),
		).toBe("parse.pull-request-gate");
	});

	it("requires the gate to actually block, not merely exist", () => {
		for (const value of [false, "true", 1, undefined])
			expect(
				codeOf(
					broken(
						(c) =>
							void ((
								c.workflow as { pullRequestGate: Record<string, unknown> }
							).pullRequestGate.blocksPullRequest = value),
					),
				),
			).toBe("parse.pull-request-gate");
	});

	it("requires requiredChecks to be an array", () => {
		expect(
			codeOf(
				broken(
					(c) =>
						void ((
							c.workflow as { pullRequestGate: Record<string, unknown> }
						).pullRequestGate.requiredChecks = "build"),
				),
			),
		).toBe("parse.required-checks");
	});

	it("rejects a check outside the known set", () => {
		for (const check of ["deploy", "Build", "", 7, null])
			expect(
				codeOf(
					broken(
						(c) =>
							void ((
								c.workflow as { pullRequestGate: Record<string, unknown> }
							).pullRequestGate.requiredChecks = [check]),
					),
				),
			).toBe("parse.required-checks");
	});
});

describe("e2e auth", () => {
	it("requires e2e to be an object", () => {
		expect(codeOf(broken((c) => void (c.e2e = null)))).toBe("parse.e2e");
	});

	it("requires auth to be an object", () => {
		expect(
			codeOf(broken((c) => void ((c.e2e as Record<string, unknown>).auth = 1))),
		).toBe("parse.e2e.auth");
	});

	it("requires OIDC federation specifically", () => {
		for (const mode of ["oidc", "static-secret", "", undefined])
			expect(
				codeOf(
					broken(
						(c) =>
							void ((c.e2e as { auth: Record<string, unknown> }).auth.mode =
								mode),
					),
				),
			).toBe("parse.e2e.auth.mode");
	});

	it("requires stored secrets to be forbidden explicitly", () => {
		for (const value of [false, undefined, "true"])
			expect(
				codeOf(
					broken(
						(c) =>
							void ((
								c.e2e as { auth: Record<string, unknown> }
							).auth.forbidsStoredSecrets = value),
					),
				),
			).toBe("parse.e2e.auth.forbids-stored-secrets");
	});
});

describe("e2e teardown", () => {
	it("requires teardown to be an object", () => {
		expect(
			codeOf(
				broken((c) => void ((c.e2e as Record<string, unknown>).teardown = [])),
			),
		).toBe("parse.e2e.teardown");
	});

	it("requires teardown to always run", () => {
		expect(
			codeOf(
				broken(
					(c) =>
						void ((
							c.e2e as { teardown: Record<string, unknown> }
						).teardown.always = false),
				),
			),
		).toBe("parse.e2e.teardown.always");
	});

	it("requires an enabled orphan sweeper", () => {
		for (const sweeper of [undefined, {}, { enabled: false }, "yes"])
			expect(
				codeOf(
					broken(
						(c) =>
							void ((
								c.e2e as { teardown: Record<string, unknown> }
							).teardown.orphanSweeper = sweeper),
					),
				),
			).toBe("parse.e2e.teardown.orphan-sweeper");
	});
});

describe("e2e quarantine", () => {
	it("requires quarantine to be an object", () => {
		expect(
			codeOf(
				broken((c) => void ((c.e2e as Record<string, unknown>).quarantine = 0)),
			),
		).toBe("parse.e2e.quarantine");
	});

	it("requires quarantine to be non-blocking on both axes", () => {
		const cases = [
			{ continueOnError: false, blocksPullRequest: false },
			{ continueOnError: true, blocksPullRequest: true },
			{ continueOnError: true },
			{ blocksPullRequest: false },
		];
		for (const quarantine of cases)
			expect(
				codeOf(
					broken(
						(c) =>
							void ((c.e2e as Record<string, unknown>).quarantine = quarantine),
					),
				),
			).toBe("parse.e2e.quarantine");
	});
});

describe("e2e gatedBy", () => {
	it("requires a non-empty array", () => {
		for (const gatedBy of [[], undefined, "unit", {}])
			expect(
				codeOf(
					broken(
						(c) => void ((c.e2e as Record<string, unknown>).gatedBy = gatedBy),
					),
				),
			).toBe("parse.e2e.gated-by");
	});
});

describe("error shape", () => {
	it("throws CiFabricContractError, not a bare Error", () => {
		expect(() => parseCiFabricContract(null)).toThrow(CiFabricContractError);
	});

	it("carries context on the schema mismatch", () => {
		try {
			parseCiFabricContract(broken((c) => void (c.schema = "wrong")));
			throw new Error("expected a throw");
		} catch (error) {
			expect(error).toBeInstanceOf(CiFabricContractError);
			expect(String((error as Error).message)).toContain(CI_FABRIC_SCHEMA);
		}
	});
});
