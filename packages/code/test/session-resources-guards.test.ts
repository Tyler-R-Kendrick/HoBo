/**
 * The guards and pure helpers behind the session resource inventory.
 *
 * `session-resources.test.ts` drives `assembleSessionResources` end to end and
 * touches these incidentally — one secret-redaction case, one local-mode
 * refusal. That is enough to know they are wired up and not enough to know they
 * are right, which for two of them is a security question rather than a
 * cosmetic one:
 *
 * - **`looksLikeSecretMaterial`** decides what gets written to a snapshot file
 *   on disk. A false negative persists somebody's database password. A false
 *   positive refuses to record a legitimate endpoint and the surface silently
 *   loses a resource — so both directions need pinning, not just the scary one.
 * - **`assertLocalBackend`** is the air-gap. In local mode it must refuse
 *   anything that could reach off the machine. The interesting cases are not
 *   `https://prod.example.com` — they are the near-misses: an unparseable URL,
 *   a host that merely *contains* "localhost", an IPv6 literal in brackets.
 *
 * The rest (`listenPortOf`, `defaultLookupHost`, `filterSessionResources`) are
 * ordinary, but each one silently produces a plausible wrong answer rather than
 * failing, which is the case for testing them rather than reading them.
 */
import { describe, expect, it } from "vitest";

import {
	assertLocalBackend,
	defaultLookupHost,
	filterSessionResources,
	formatSessionResources,
	listenPortOf,
	looksLikeSecretMaterial,
	type ResourceKind,
	type SessionResourceInventory,
} from "../src/session-resources.js";

describe("recognising secret material", () => {
	it("catches a password embedded in a URL's userinfo", () => {
		// This is the shape a connection string arrives in, and the one that most
		// often gets pasted into a config and then recorded verbatim.
		expect(
			looksLikeSecretMaterial("postgres://user:hunter2@db.internal:5432/app"),
		).toBe(true);
	});

	it("catches userinfo even when the rest is not a parseable URL", () => {
		// The regex runs before the URL parse for exactly this reason: a
		// malformed connection string is still a leaked credential.
		expect(looksLikeSecretMaterial("weird://a:b@ not a url")).toBe(true);
	});

	it("catches a password on a URL that parses", () => {
		expect(looksLikeSecretMaterial("https://user:pw@example.com/")).toBe(true);
	});

	for (const word of [
		"password",
		"passwd",
		"secret",
		"apikey",
		"api_key",
		"api-key",
		"credential",
	]) {
		it(`catches a bare ${word} in a non-URL value`, () => {
			expect(looksLikeSecretMaterial(`my ${word} is here`)).toBe(true);
		});
	}

	it("is case-insensitive about the bare words", () => {
		expect(looksLikeSecretMaterial("SECRET value")).toBe(true);
	});

	it("does not claim a word that merely contains one of them", () => {
		// "passwordless" is an ordinary word in auth configuration. Refusing it
		// would drop a real endpoint from the inventory with no explanation.
		expect(looksLikeSecretMaterial("passwordless-login")).toBe(false);
	});

	it("does not claim a plain loopback URL", () => {
		expect(looksLikeSecretMaterial("http://127.0.0.1:8080/health")).toBe(false);
	});

	it("does not claim a URL with a username but no password", () => {
		// A username alone is not a credential, and refusing it would block the
		// ordinary `ssh://git@host` shape.
		expect(looksLikeSecretMaterial("ssh://git@example.com/repo")).toBe(false);
	});

	it("does not claim a parseable URL whose path mentions a secret", () => {
		// A URL that parses skips the bare-word check entirely: a path segment
		// called /secrets is a route, not a leaked value. Pinning this so the
		// asymmetry between the parseable and unparseable branches is deliberate
		// and visible rather than incidental.
		expect(looksLikeSecretMaterial("http://127.0.0.1/api/secret")).toBe(false);
	});

	it("does claim an unparseable value mentioning a secret", () => {
		// The mirror of the case above — with no URL to parse, the bare-word check
		// is the only defence left.
		expect(looksLikeSecretMaterial("the secret is hunter2")).toBe(true);
	});

	it("does not claim an empty value", () => {
		expect(looksLikeSecretMaterial("")).toBe(false);
	});
});

describe("the local-mode air gap", () => {
	it("permits anything in overlay mode", () => {
		// Overlay mode is the one that is *meant* to reach off the machine.
		// Applying the gap there would break the feature it exists beside.
		expect(
			assertLocalBackend("https://prod.example.com", "dev", "overlay").ok,
		).toBe(true);
	});

	for (const hint of [
		".ts.net",
		"tailscale",
		"netbird",
		"prod.",
		"production.",
		".amazonaws.com",
		".azure.com",
		".googleapis.com",
	]) {
		it(`refuses a backend containing ${hint}`, () => {
			const result = assertLocalBackend(
				`https://host${hint}example/`,
				"dev",
				"local",
			);
			expect(result.ok).toBe(false);
			expect(result.ok === false && result.code).toBe(
				"local-airgap-remote-backend",
			);
		});
	}

	it("matches a hint regardless of case", () => {
		// Hostnames are case-insensitive, so an uppercase host would otherwise
		// walk straight through the substring check.
		const result = assertLocalBackend(
			"https://api.AMAZONAWS.com/",
			"dev",
			"local",
		);
		expect(result.ok).toBe(false);
	});

	it("names the hint that caused the refusal", () => {
		// Without it the operator sees "refused" and has to guess which part of
		// their URL tripped the check.
		const result = assertLocalBackend("https://x.ts.net/", "dev", "local");
		expect(result.ok === false && result.reason).toContain(".ts.net");
	});

	for (const host of [
		"localhost",
		"127.0.0.1",
		"0.0.0.0",
		"app.localhost",
		"app.hobo.localhost",
		"hobo.internal",
		"svc.hobo.internal",
	]) {
		it(`permits the loopback-equivalent host ${host}`, () => {
			expect(
				assertLocalBackend(`http://${host}:8080/`, "dev", "local").ok,
			).toBe(true);
		});
	}

	it("permits a bracketed IPv6 loopback", () => {
		expect(assertLocalBackend("http://[::1]:8080/", "dev", "local").ok).toBe(
			true,
		);
	});

	it("refuses a non-loopback host that trips no hint", () => {
		// The hint list is a fast path, not the whole check. A plain remote host
		// nobody thought to list must still be refused.
		const result = assertLocalBackend("https://example.com/", "dev", "local");
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.code).toBe(
			"local-airgap-non-loopback",
		);
	});

	it("refuses a host that merely ends in a loopback-looking word", () => {
		// "notlocalhost" ends in "localhost" as a substring but is a different
		// host entirely. The check compares against ".localhost" with the dot for
		// exactly this reason.
		expect(assertLocalBackend("http://notlocalhost/", "dev", "local").ok).toBe(
			false,
		);
	});

	it("refuses a host that merely ends in the mesh zone as a substring", () => {
		expect(
			assertLocalBackend("http://nothobo.internal.example.com/", "dev", "local")
				.ok,
		).toBe(false);
	});

	it("names the offending host in the refusal", () => {
		const result = assertLocalBackend("https://example.com/", "dev", "local");
		expect(result.ok === false && result.reason).toContain("example.com");
	});

	it("permits a backend that is not a URL at all", () => {
		// A unix socket path or a bare service name carries no host to reach, so
		// there is nothing for the air gap to refuse. Failing closed here would
		// block socket-based backends that cannot leave the machine by
		// construction.
		expect(assertLocalBackend("/var/run/app.sock", "dev", "local").ok).toBe(
			true,
		);
	});
});

describe("reading a listen port", () => {
	it("takes an explicit port", () => {
		expect(listenPortOf("http://127.0.0.1:8080/")).toBe(8080);
	});

	it("infers 80 for http", () => {
		// The port is what a liveness probe connects to. Undefined here reads as
		// "not listening", so an endpoint on a default port would render dead.
		expect(listenPortOf("http://example.com/")).toBe(80);
	});

	it("infers 443 for https", () => {
		expect(listenPortOf("https://example.com/")).toBe(443);
	});

	it("prefers an explicit port over the scheme default", () => {
		expect(listenPortOf("https://example.com:8443/")).toBe(8443);
	});

	it("returns nothing for a scheme with no known default", () => {
		// Guessing a port for an unknown scheme would have the probe connect
		// somewhere arbitrary and report whatever answered.
		expect(listenPortOf("ftp://example.com/")).toBeUndefined();
	});

	it("returns nothing for a value that is not a URL", () => {
		expect(listenPortOf("not a url")).toBeUndefined();
	});
});

describe("resolving a host to addresses", () => {
	it("passes an IPv4 literal through unchanged", () => {
		expect(defaultLookupHost("10.0.0.1")).toEqual(["10.0.0.1"]);
	});

	it("strips the brackets from an IPv6 literal", () => {
		// The brackets are URL syntax, not part of the address. Left on, the
		// address never matches anything a socket reports.
		expect(defaultLookupHost("[::1]")).toEqual(["::1"]);
	});

	it("maps loopback names onto the loopback address", () => {
		expect(defaultLookupHost("localhost")).toEqual(["127.0.0.1"]);
	});

	it("maps a .localhost subdomain onto loopback too", () => {
		// Per RFC 6761 every name under .localhost resolves to loopback, and the
		// product leans on that for its per-app hostnames.
		expect(defaultLookupHost("app.hobo.localhost")).toEqual(["127.0.0.1"]);
	});

	it("resolves nothing for a real hostname", () => {
		// This helper is the *default*, used where no resolver is wired. Returning
		// a guess for a real name would invent an address and probe it.
		expect(defaultLookupHost("example.com")).toEqual([]);
	});

	it("is case-insensitive about loopback names", () => {
		expect(defaultLookupHost("LOCALHOST")).toEqual(["127.0.0.1"]);
	});
});

describe("filtering an inventory to one kind", () => {
	function inventory(): SessionResourceInventory {
		return {
			ok: true,
			code: "ok",
			message: "resources",
			schema: "hobo.code.session-resources/v1",
			scope: {
				stationId: "station:local",
				environment: "dev",
				tenant: "local",
				scope: "local",
				endpointMode: "local",
			},
			station: { id: "station:local", kind: "station", label: "local" },
			peers: [{ id: "station:peer", kind: "station", label: "peer" }],
			junctions: [{ id: "junction:a", kind: "junction", label: "a" }],
			yards: [{ id: "yard:local", kind: "yard", label: "local" }],
			camps: [{ id: "camp:code", kind: "camp", label: "code" }],
			bindles: [{ id: "bindle:code", kind: "bindle", label: "code" }],
			endpoints: [
				{
					resourceName: "api",
					kind: "http",
					backendUrl: "http://127.0.0.1:8080/",
					namedUrl: "http://app.hobo.internal/api",
					status: "serving",
				},
			],
			capabilities: ["deploy"],
			managed: [
				{ id: "m-station", kind: "kv", ownerKind: "station", label: "s" },
				{ id: "m-camp", kind: "kv", ownerKind: "camp", label: "c" },
			],
			missing: [
				{ kind: "yard", reason: "no yard", remediation: "hobo yard init" },
				{ kind: "camp", reason: "no camp", remediation: "hobo camp init" },
			],
		} as unknown as SessionResourceInventory;
	}

	it("keeps the station only for the station view", () => {
		expect(
			filterSessionResources(inventory(), "station").station,
		).toBeDefined();
		expect(filterSessionResources(inventory(), "camp").station).toBeUndefined();
	});

	it("keeps peers only for the station view", () => {
		// Peers are other stations. Showing them under a camp filter would put
		// unrelated machines in a list the user asked to be about one camp.
		expect(filterSessionResources(inventory(), "station").peers).toHaveLength(
			1,
		);
		expect(filterSessionResources(inventory(), "yard").peers).toEqual([]);
	});

	for (const kind of [
		"junction",
		"yard",
		"camp",
		"bindle",
	] as const satisfies readonly ResourceKind[]) {
		it(`keeps only ${kind}s for the ${kind} view`, () => {
			const filtered = filterSessionResources(inventory(), kind);
			const lists = {
				junction: filtered.junctions,
				yard: filtered.yards,
				camp: filtered.camps,
				bindle: filtered.bindles,
			};
			expect(lists[kind]).toHaveLength(1);
			for (const [other, list] of Object.entries(lists)) {
				if (other !== kind) expect(list).toEqual([]);
			}
		});
	}

	it("keeps endpoints only for the bindle view", () => {
		// Endpoints belong to a bindle's resources. Under any other filter they
		// are noise attached to nothing on screen.
		expect(
			filterSessionResources(inventory(), "bindle").endpoints,
		).toHaveLength(1);
		expect(filterSessionResources(inventory(), "yard").endpoints).toEqual([]);
	});

	it("filters managed resources by their owner rather than their own kind", () => {
		// A managed KV owned by a station is a station-view row even though its
		// own kind is "kv". Filtering on the wrong field empties every view.
		const filtered = filterSessionResources(inventory(), "station");
		expect(filtered.managed.map((row) => row.id)).toEqual(["m-station"]);
	});

	it("filters missing layers to the kind being viewed", () => {
		const filtered = filterSessionResources(inventory(), "camp");
		expect(filtered.missing.map((row) => row.kind)).toEqual(["camp"]);
	});

	it("keeps scope and capabilities in every view", () => {
		// These describe the session itself, not one layer of it. Dropping them
		// under a filter would make the header change as the user tabs across
		// views that are all the same session.
		const filtered = filterSessionResources(inventory(), "bindle");
		expect(filtered.scope.environment).toBe("dev");
		expect(filtered.capabilities).toEqual(["deploy"]);
	});

	it("carries the failure state through unchanged", () => {
		const failed = {
			...inventory(),
			ok: false,
			code: "auth-out",
			message: "run hobo login",
		} as SessionResourceInventory;
		const filtered = filterSessionResources(failed, "camp");
		expect(filtered.ok).toBe(false);
		expect(filtered.message).toBe("run hobo login");
	});
});

describe("formatting for the terminal", () => {
	it("leads with the remediation when the inventory could not be read", () => {
		// A user who is logged out needs the next command, not an empty resource
		// list that implies they have nothing deployed.
		const text = formatSessionResources({
			ok: false,
			code: "auth-out",
			message: "run hobo login",
		} as SessionResourceInventory);
		expect(text).toContain("auth:out");
		expect(text).toContain("run hobo login");
	});
});
