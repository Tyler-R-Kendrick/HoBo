/**
 * Agent-native readiness: can this run proceed with no human present?
 *
 * `hobo-code agent` exists to answer that one question, and every field on it
 * feeds the answer. An unattended coding agent that hits a TTY prompt does not
 * fail — it *hangs*, holding a CI job or a sandbox open until something kills
 * it, with no error to read afterwards. So the inventory has to be honest about
 * two things a naive one would blur:
 *
 * **Which auth modes need a human, and which do not.** Device-code and CIBA
 * both work, and both require someone at a browser. Listing them alongside the
 * local-Station path without the `humanInLoop` flag would let an operator wire
 * an unattended pipeline to a mode that cannot possibly run unattended.
 *
 * **Which protocols are actually wired, and which are aspirational.** `residual`
 * is a real status here, and it means "not built". Reporting it as available
 * would send someone to configure something that does not exist.
 *
 * Agent mode itself is entered from any of three signals, and `CI` is one of
 * them: a run in CI is unattended whether or not anyone remembered to set the
 * HoBo-specific flag, and defaulting to interactive there is exactly how a
 * pipeline ends up hanging on a prompt.
 *
 * Secrets keep the same rule as the config inventory — presence only, never the
 * value — because this output is pasted into the same bug reports.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	agentHumanSummary,
	CODE_AGENT_SCHEMA,
	inspectAgentSurface,
} from "../src/agent-surface.js";
import { authSessionPath } from "../src/auth.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function hoboHome(): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-agent-"));
	dirs.push(dir);
	return dir;
}

/** A HOBO_HOME whose session.json holds exactly `session`. */
function homeWithSession(session: unknown): string {
	const home = hoboHome();
	const path = authSessionPath(home);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		typeof session === "string" ? session : JSON.stringify(session),
	);
	return home;
}

const inspect = (env: NodeJS.ProcessEnv = {}, home = hoboHome()) =>
	inspectAgentSurface({ hoboHome: home, cwd: home, env });

const modeNamed = (status: ReturnType<typeof inspect>, id: string) =>
	status.humanFreeAuth.modes.find((mode) => mode.id === id);

describe("entering agent mode", () => {
	for (const truthy of ["1", "true", "yes"]) {
		it(`treats HOBO_CODE_AGENT=${truthy} as agent mode`, () => {
			// Three spellings because three different tools set it — a check for
			// one would leave the others silently interactive.
			expect(inspect({ HOBO_CODE_AGENT: truthy }).agentMode).toBe(true);
		});
	}

	for (const falsy of ["0", "false", "", "no"]) {
		it(`does not treat HOBO_CODE_AGENT=${JSON.stringify(falsy)} as agent mode`, () => {
			// `HOBO_CODE_AGENT=0` is someone explicitly turning it off; reading it
			// as truthy because it is a non-empty string would make the flag
			// impossible to unset.
			expect(inspect({ HOBO_CODE_AGENT: falsy }).agentMode).toBe(false);
		});
	}

	it("enters agent mode from the no-elicitation flag", () => {
		expect(inspect({ HOBO_CODE_NO_ELICITATION: "1" }).agentMode).toBe(true);
	});

	it("enters agent mode in CI", () => {
		// A run in CI is unattended whether or not anyone set the HoBo-specific
		// flag. Defaulting to interactive there is exactly how a pipeline ends
		// up hanging on a prompt nobody sees.
		expect(inspect({ CI: "true" }).agentMode).toBe(true);
	});

	it("is not in agent mode with an empty environment", () => {
		// Interactive is the right default for a developer at a terminal.
		expect(inspect({}).agentMode).toBe(false);
	});
});

describe("a session the agent can use", () => {
	it("counts a pre-bound session ref from the environment", () => {
		// The stdio-MCP credential pattern: the spawner puts the ref in the
		// environment, and the agent never touches a browser.
		expect(
			inspect({ HOBO_CODE_SESSION_REF: "ref-123" }).humanFreeAuth
				.sessionRefPresent,
		).toBe(true);
	});

	it("counts an agent token from the environment", () => {
		expect(
			inspect({ HOBO_CODE_AGENT_TOKEN: "tok-123" }).humanFreeAuth
				.sessionRefPresent,
		).toBe(true);
	});

	it("ignores an empty session ref", () => {
		expect(
			inspect({ HOBO_CODE_SESSION_REF: "" }).humanFreeAuth.sessionRefPresent,
		).toBe(false);
	});

	it("counts a durable session on disk", () => {
		const home = homeWithSession({
			sessionRef: "ref-123",
			stationId: "station-1",
			mode: "local",
		});
		expect(inspect({}, home).humanFreeAuth.sessionRefPresent).toBe(true);
	});

	it("refuses a session missing its station id", () => {
		// A ref without a station cannot be resolved to anything; reporting it
		// as usable would promise an auth path that fails at first use.
		const home = homeWithSession({ sessionRef: "ref-123" });
		expect(inspect({}, home).humanFreeAuth.sessionRefPresent).toBe(false);
	});

	it("refuses a session missing its ref", () => {
		const home = homeWithSession({ stationId: "station-1" });
		expect(inspect({}, home).humanFreeAuth.sessionRefPresent).toBe(false);
	});

	it("survives a corrupt session file rather than throwing", () => {
		// A truncated write or a half-synced file. The inventory is a
		// diagnostic; throwing here makes it unavailable exactly when something
		// is already wrong.
		const home = homeWithSession("{ not json");
		expect(() => inspect({}, home)).not.toThrow();
		expect(inspect({}, home).humanFreeAuth.sessionRefPresent).toBe(false);
	});

	it("reports no session when there is no file at all", () => {
		expect(inspect({}).humanFreeAuth.sessionPresent).toBe(false);
	});

	it("reports a session that is present", () => {
		const home = homeWithSession({
			sessionRef: "ref-123",
			stationId: "station-1",
			mode: "local",
		});
		expect(inspect({}, home).humanFreeAuth.sessionPresent).toBe(true);
	});
});

describe("auth modes", () => {
	it("marks the local Station path as needing no human", () => {
		// The preferred agent steady-state, and the reason the whole surface
		// exists.
		expect(modeNamed(inspect({}), "local-station-auto")?.humanInLoop).toBe(
			false,
		);
	});

	it("reports local auto-resolve as wired when there is no session yet", () => {
		// `auth login --agent` can still create one, so "no session" is ready
		// rather than blocked — treating it as blocked would tell an operator
		// to do something manual that is not needed.
		expect(modeNamed(inspect({}), "local-station-auto")?.status).toBe("wired");
	});

	it("reports it as wired on an existing local session", () => {
		const home = homeWithSession({
			sessionRef: "ref-123",
			stationId: "station-1",
			mode: "local",
		});
		expect(modeNamed(inspect({}, home), "local-station-auto")?.status).toBe(
			"wired",
		);
	});

	it("downgrades it on a session bound to something else", () => {
		// A remote-bound session cannot be auto-resolved locally; saying `wired`
		// would promise an unattended path that needs a browser.
		const home = homeWithSession({
			sessionRef: "ref-123",
			stationId: "station-1",
			mode: "remote",
		});
		expect(modeNamed(inspect({}, home), "local-station-auto")?.status).toBe(
			"env-only",
		);
	});

	it("marks the session-ref mode wired only once a ref exists", () => {
		expect(modeNamed(inspect({}), "session-ref-env")?.status).toBe("env-only");
		expect(
			modeNamed(inspect({ HOBO_CODE_SESSION_REF: "ref" }), "session-ref-env")
				?.status,
		).toBe("wired");
	});

	it("marks device-code as needing a human", () => {
		// It works, and it needs someone at a browser. Listing it without the
		// flag would let an operator wire an unattended pipeline to a mode that
		// cannot run unattended.
		expect(
			modeNamed(inspect({}), "device-code-human-bootstrap")?.humanInLoop,
		).toBe(true);
	});

	it("offers at least one human-free mode in every environment", () => {
		// If the answer were ever "none", the product's central claim would be
		// false — so it is asserted rather than assumed.
		expect(
			inspect({}).humanFreeAuth.modes.some((mode) => !mode.humanInLoop),
		).toBe(true);
	});

	it("gives every mode something to run", () => {
		for (const mode of inspect({}).humanFreeAuth.modes) {
			expect(mode.try.length).toBeGreaterThan(0);
		}
	});

	it("cites a standard for every mode", () => {
		// These are interop claims; an unsourced one cannot be checked against
		// the spec it claims to follow.
		for (const mode of inspect({}).humanFreeAuth.modes) {
			expect(mode.standards.length).toBeGreaterThan(0);
		}
	});
});

describe("protocols", () => {
	it("reports MCP as wired", () => {
		const mcp = inspect({}).protocols.find((entry) => entry.id === "mcp");
		expect(mcp?.status).toBe("wired");
	});

	it("keeps a residual protocol marked residual", () => {
		// `residual` means not built. Reporting it as available would send
		// someone to configure something that does not exist.
		const a2a = inspect({}).protocols.find((entry) => entry.id === "a2a");
		expect(a2a?.status).toBe("residual");
	});

	it("names a transport for every protocol", () => {
		// The transport is what decides whether a protocol can be spoken at all
		// from where the caller is standing.
		for (const protocol of inspect({}).protocols) {
			expect(protocol.transport.length).toBeGreaterThan(0);
		}
	});

	it("lists the MCP tools it exposes", () => {
		expect(inspect({}).mcpTools.length).toBeGreaterThan(0);
	});
});

describe("the unattended contract", () => {
	it("promises no TTY prompts", () => {
		// The contract an unattended runner depends on, stated in the output so
		// it can be relied on without reading the source.
		expect(inspect({}).unattended.noElicitation).toBe(true);
	});

	it("promises a non-zero exit with remediation rather than a prompt", () => {
		// The alternative to elicitation has to be *something*; an agent that
		// merely refused to prompt and then hung would be no better.
		expect(inspect({}).unattended.contract.join(" ")).toMatch(
			/non-zero.*remediation/,
		);
	});

	it("states that secrets are presence-only", () => {
		expect(inspect({}).unattended.contract.join(" ")).toMatch(
			/[Ss]ecrets: presence-only/,
		);
	});

	it("names promote as the sole merge gate", () => {
		// Side effects go through isolate; promote is the one place a change
		// becomes real. An unattended agent needs that boundary stated.
		expect(inspect({}).unattended.contract.join(" ")).toMatch(/promote/);
	});

	it("gives a safe-iterate sequence that is all --json", () => {
		// An unattended runner parses output; a step that only prints a human
		// panel would break the loop at that point.
		for (const step of inspect({}).unattended.safeIterate) {
			expect(step).toContain("--json");
		}
	});
});

describe("secrets", () => {
	it("never prints a session ref value", () => {
		// Same rule as the config inventory, and the same reason: this output
		// is pasted into bug reports.
		const secret = "ref-0123456789abcdefghijklmnop";
		const status = inspect({ HOBO_CODE_SESSION_REF: secret });
		expect(JSON.stringify(status)).not.toContain(secret);
	});

	it("never prints an agent token value", () => {
		const secret = "tok-0123456789abcdefghijklmnop";
		const status = inspect({ HOBO_CODE_AGENT_TOKEN: secret });
		expect(JSON.stringify(status)).not.toContain(secret);
	});

	it("keeps the session ref out of the human summary", () => {
		const secret = "ref-0123456789abcdefghijklmnop";
		expect(
			agentHumanSummary(inspect({ HOBO_CODE_SESSION_REF: secret })),
		).not.toContain(secret);
	});
});

describe("the inventory as a whole", () => {
	it("stamps its schema", () => {
		expect(inspect({}).schema).toBe(CODE_AGENT_SCHEMA);
	});

	it("points at where durable lessons land", () => {
		// Self-improvement is a claim; the path is what makes it checkable.
		const home = hoboHome();
		expect(inspect({}, home).selfImprove.lessonsPathHint).toBe(
			join(home, "durable", "code"),
		);
	});

	it("produces an inventory with nothing configured at all", () => {
		const status = inspect({});
		expect(status.setupChecklist.length).toBeGreaterThan(0);
		expect(status.protocols.length).toBeGreaterThan(0);
	});

	it("renders a human summary in every state", () => {
		expect(agentHumanSummary(inspect({})).length).toBeGreaterThan(0);
		expect(
			agentHumanSummary(inspect({ HOBO_CODE_AGENT: "1" })).length,
		).toBeGreaterThan(0);
	});

	it("shows the unattended flags in the summary", () => {
		// The two facts an unattended runner most needs are the two the summary
		// leads with.
		expect(agentHumanSummary(inspect({}))).toMatch(/no-elicit/);
	});
});
