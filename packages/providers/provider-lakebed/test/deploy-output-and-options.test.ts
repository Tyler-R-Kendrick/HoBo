/**
 * Parsing anonymous-deploy output, the equivalence classes, and the typed
 * option blocks (ADR-0127 / ADR-0156).
 *
 * `parseLakebedDeployOutput` reads the stdout of a CLI this package does not
 * control and turns it into two URLs a user will be sent to: the station they
 * were just given, and the claim link that transfers ownership of it. That
 * makes the host checks the important part. If an attacker could get an
 * arbitrary URL into that output — a poisoned npx package, a compromised
 * registry mirror, a proxy injecting a line — the claim link is a credential
 * hand-off, and pointing it at an attacker's host is the whole attack. So both
 * URLs are re-checked for `https:` and for a specific host, and the parser
 * fails closed when neither shape is present.
 *
 * The equivalence classes are the other half of this package's honesty claim:
 * feature lists are deliberately narrow so a `require` miss surfaces as a
 * partial verdict with remediation rather than as fabricated parity with a
 * closed PaaS that cannot actually offer container or postgres semantics.
 */
import { describe, expect, it } from "vitest";

import {
	EQUIVALENCE_CLASSES,
	equivalenceForPort,
	INITIAL_CAPABILITY_PORTS,
	lakebedNativeFeaturesForPort,
	lakebedNativePorts,
} from "../src/equivalence.js";
import { LAKEBED_PROVIDER_TARGET, lakebed } from "../src/options.js";
import { parseLakebedDeployOutput } from "../src/temporary-station.js";

const STATION = "https://abc123.lakebed.app";
const CLAIM = "https://lakebed.dev/claim/abc123";

describe("parseLakebedDeployOutput — JSON lines", () => {
	it("reads a JSON object anywhere in the output", () => {
		// Not only the first or last line. A CLI interleaves progress text with
		// its machine-readable line, and requiring a position would make the
		// parser brittle against a harmless formatting change.
		const result = parseLakebedDeployOutput(
			`installing…\nbuilding…\n{"url":"${STATION}","deployId":"abc123"}\ndone\n`,
		);
		expect(result.stationUrl).toBe(STATION);
		expect(result.deployId).toBe("abc123");
		expect(result.claimUrl).toBe(CLAIM);
	});

	it("accepts each spelling of the station URL field", () => {
		// Three spellings because the upstream CLI has used all of them.
		// Supporting one would make an upgrade silently fall through to the
		// looser regex path below.
		for (const field of ["url", "deployUrl", "primaryUrl"]) {
			const result = parseLakebedDeployOutput(
				`{"${field}":"${STATION}","deployId":"abc123"}`,
			);
			expect(result.stationUrl).toBe(STATION);
		}
	});

	it("accepts each spelling of the deploy id", () => {
		for (const field of ["deployId", "id"]) {
			const result = parseLakebedDeployOutput(
				`{"url":"${STATION}","${field}":"abc123"}`,
			);
			expect(result.deployId).toBe("abc123");
		}
	});

	it("prefers an explicit claim URL over the derived one", () => {
		// If the CLI states where to claim, that is authoritative — deriving one
		// would send the user to a URL the service never issued.
		const result = parseLakebedDeployOutput(
			`{"url":"${STATION}","deployId":"abc123","claimUrl":"https://lakebed.dev/claim/other"}`,
		);
		expect(result.claimUrl).toBe("https://lakebed.dev/claim/other");
	});

	it("derives the claim URL from the deploy id when none is stated", () => {
		expect(
			parseLakebedDeployOutput(`{"url":"${STATION}","deployId":"abc123"}`)
				.claimUrl,
		).toBe(CLAIM);
	});

	it("falls back to the station hostname for a missing deploy id", () => {
		// A JSON line with a URL and a claim link but no id still yields a usable
		// result rather than an empty `deployId` nothing can correlate on.
		const result = parseLakebedDeployOutput(
			`{"url":"${STATION}","claimUrl":"${CLAIM}"}`,
		);
		expect(result.deployId).toBe("abc123.lakebed.app");
	});

	it("keeps scanning past a malformed JSON line", () => {
		// The `catch` continues rather than aborting. A truncated line from an
		// interleaved write must not make a later, complete line unreachable.
		const result = parseLakebedDeployOutput(
			`{"url":"broken\n{"url":"${STATION}","deployId":"abc123"}`,
		);
		expect(result.stationUrl).toBe(STATION);
	});

	it("keeps scanning past a JSON line missing the fields it needs", () => {
		// `if (stationUrl && claimUrl)` — a well-formed but irrelevant JSON line
		// (a progress record, say) is skipped rather than accepted as a result.
		const result = parseLakebedDeployOutput(
			`{"phase":"build","pct":50}\n{"url":"${STATION}","deployId":"abc123"}`,
		);
		expect(result.stationUrl).toBe(STATION);
	});

	it("ignores a non-string value in a URL field", () => {
		// Each field is guarded by `typeof === "string"`, so a number or object
		// falls through to the next spelling rather than becoming a URL.
		const result = parseLakebedDeployOutput(
			`{"url":7,"deployUrl":"${STATION}","deployId":"abc123"}`,
		);
		expect(result.stationUrl).toBe(STATION);
	});
});

describe("parseLakebedDeployOutput — URL fallback", () => {
	it("finds a bare URL when there is no JSON at all", () => {
		const result = parseLakebedDeployOutput(
			`Deployed! Visit ${STATION} to see it.`,
		);
		expect(result.stationUrl).toBe(STATION);
		expect(result.deployId).toBe("abc123");
		expect(result.claimUrl).toBe(CLAIM);
	});

	it("strips trailing punctuation from a prose-embedded URL", () => {
		// `Visit https://abc.lakebed.app.` — the sentence's full stop is not part
		// of the host, and leaving it on would make every derived claim link and
		// hostname wrong.
		for (const suffix of [".", ",", ")", ".)", ",,"]) {
			const result = parseLakebedDeployOutput(
				`Deployed to ${STATION}${suffix}`,
			);
			expect(result.stationUrl).toBe(STATION);
		}
	});

	it("derives the deploy id from the first hostname label", () => {
		expect(
			parseLakebedDeployOutput(`see https://my-app.lakebed.app now`).deployId,
		).toBe("my-app");
	});
});

describe("parseLakebedDeployOutput — refusals", () => {
	it("refuses empty or whitespace-only output", () => {
		// Fail closed. An empty result would be reported as a successful deploy
		// with no station, and the user would be told to visit nothing.
		for (const stdout of ["", "   ", "\n\n"]) {
			expect(() => parseLakebedDeployOutput(stdout)).toThrow(
				/produced empty output/u,
			);
		}
	});

	it("refuses output with no URL in it at all", () => {
		expect(() =>
			parseLakebedDeployOutput("error: something went wrong\nretrying…"),
		).toThrow(/missing deploy URL/u);
	});

	it("refuses a station URL on a foreign host", () => {
		// The attack this guards. The output comes from a CLI fetched at run
		// time; a poisoned package or an injected line could name any host, and
		// the user would be sent there believing it was their station.
		for (const bad of [
			"https://evil.com",
			"https://lakebed.app.evil.com",
			"https://notlakebed.app",
		]) {
			expect(() => parseLakebedDeployOutput(`Deployed to ${bad}`)).toThrow(
				/unexpected host/u,
			);
		}
	});

	it("accepts the apex host and any subdomain of it", () => {
		// The anchored `(?:^|\\.)lakebed\\.app$` allows both, which is what real
		// deploy URLs look like, while still refusing a host that merely ends in
		// those characters.
		expect(
			parseLakebedDeployOutput("Deployed to https://lakebed.app").stationUrl,
		).toBe("https://lakebed.app");
		expect(
			parseLakebedDeployOutput("Deployed to https://a.b.lakebed.app")
				.stationUrl,
		).toBe("https://a.b.lakebed.app");
	});

	it("refuses a plaintext station URL", () => {
		// The station is where a user's deployed app lives; handing them an
		// http:// link would downgrade every subsequent interaction with it.
		expect(() =>
			parseLakebedDeployOutput("Deployed to http://abc123.lakebed.app"),
		).toThrow(/must use https/u);
	});

	it("silently substitutes a safe claim URL rather than refusing a hostile one", () => {
		// A finding, pinned rather than changed.
		//
		// `requireLakebedUrl` is called *inside* the `try` whose `catch` exists
		// to skip malformed JSON lines. So when the CLI states a claim URL on a
		// foreign host, the host check does throw — and the catch swallows it as
		// though the line had merely failed to parse. The scan continues, the
		// regex fallback finds the station URL in the same text, and a claim URL
		// is derived from the deploy id instead.
		//
		// The security outcome is fail-safe: the caller ends up on
		// `https://lakebed.dev/claim/<id>`, never on the attacker's host, which
		// is why this is a wart and not a hole. But it is silent. A user is sent
		// to a different claim URL than the CLI reported, with nothing said, and
		// the "unexpected host" refusal an author would expect to see never
		// surfaces. Narrowing the catch to `SyntaxError` — or hoisting the two
		// `requireLakebedUrl` calls out of the try — would make the refusal real.
		// That is a call for whoever owns this adapter's failure posture.
		const result = parseLakebedDeployOutput(
			`{"url":"${STATION}","deployId":"abc123","claimUrl":"https://evil.com/claim/abc"}`,
		);
		expect(result.claimUrl).toBe(CLAIM);
		expect(result.claimUrl).not.toContain("evil.com");
	});

	it("does the same for a plaintext claim URL", () => {
		const result = parseLakebedDeployOutput(
			`{"url":"${STATION}","deployId":"abc123","claimUrl":"http://lakebed.dev/claim/abc"}`,
		);
		expect(result.claimUrl).toBe(CLAIM);
		expect(result.claimUrl.startsWith("https:")).toBe(true);
	});

	it("still refuses a hostile station URL, because the fallback re-checks it", () => {
		// The compensating path. A hostile `url` in the JSON is swallowed the
		// same way, but the regex fallback then finds that same URL in the raw
		// text and validates it *outside* the try — so there is no route by
		// which a foreign station host reaches the caller.
		expect(() =>
			parseLakebedDeployOutput(
				`{"url":"https://evil.com","deployId":"abc123","claimUrl":"${CLAIM}"}`,
			),
		).toThrow(/unexpected host/u);
	});

	it("refuses an unparseable URL rather than passing it through", () => {
		expect(() =>
			parseLakebedDeployOutput(
				`{"url":"https://","claimUrl":"${CLAIM}"}\nno url here`,
			),
		).toThrow();
	});
});

describe("equivalence classes", () => {
	it("declares one class per initial capability port", () => {
		expect([...INITIAL_CAPABILITY_PORTS].sort()).toEqual(
			Object.keys(EQUIVALENCE_CLASSES).sort(),
		);
	});

	it("maps each class to a port, a resource class and a provider service", () => {
		// The provider service name is what a portability report cites. A class
		// without one would report a match against an unnamed thing.
		for (const key of INITIAL_CAPABILITY_PORTS) {
			const entry = equivalenceForPort(key);
			expect(entry.port.length).toBeGreaterThan(0);
			expect(entry.resourceClass.startsWith("lakebed:")).toBe(true);
			expect(entry.providerService.length).toBeGreaterThan(0);
			expect(entry.features.length).toBeGreaterThan(0);
		}
	});

	it("keeps the compute feature list narrow and honest", () => {
		// Deliberately narrow: a closed Capsule runtime cannot claim container
		// semantics, so a `require: ["container"]` must surface as a partial
		// verdict with remediation rather than as fabricated parity.
		const compute = equivalenceForPort("web/service");
		expect(compute.features).toContain("capsule");
		expect(compute.features).not.toContain("container");
		expect(compute.features).not.toContain("vm");
	});

	it("keeps the database feature list off relational semantics", () => {
		const database = equivalenceForPort("database/reactive");
		expect(database.features).toContain("reactive");
		expect(database.features).not.toContain("postgres");
		expect(database.features).not.toContain("sql");
	});

	it("deduplicates the native port list", () => {
		// Two classes can share a port; a duplicated entry would make Matching
		// consider the same provider twice for one request.
		const ports = lakebedNativePorts();
		expect(new Set(ports).size).toBe(ports.length);
		expect([...ports].sort()).toEqual([
			"compute",
			"database",
			"kv",
			"objectStore",
		]);
	});

	it("returns the features for a known port", () => {
		expect(lakebedNativeFeaturesForPort("kv")).toContain("key-value");
		expect(lakebedNativeFeaturesForPort("compute")).toContain("http");
	});

	it("returns an empty list for a port it does not host", () => {
		// Empty, not undefined: a caller intersecting feature lists must not have
		// to special-case an unknown port, and an unhosted port genuinely offers
		// nothing rather than offering an unknown amount.
		expect(lakebedNativeFeaturesForPort("queue")).toEqual([]);
		expect(lakebedNativeFeaturesForPort("")).toEqual([]);
	});

	it("freezes the class table and the port list", () => {
		// These are read on every Matching pass. A caller that could add a class
		// at runtime would widen what this provider claims for the whole process.
		expect(Object.isFrozen(EQUIVALENCE_CLASSES)).toBe(true);
		expect(Object.isFrozen(INITIAL_CAPABILITY_PORTS)).toBe(true);
	});
});

describe("typed option blocks", () => {
	it("tags every block with the provider target and its port", () => {
		// The target is what makes a block inert for other providers — the core
		// promise that one Bindle targets many clouds unedited. A block missing
		// it would be applied everywhere.
		for (const [name, block] of [
			["capsule", lakebed.with.capsule()],
			["reactiveDb", lakebed.with.reactiveDb()],
			["files", lakebed.with.files()],
		] as const) {
			expect(block.providerId).toBe(LAKEBED_PROVIDER_TARGET);
			expect(block.optionName).toBe(name);
			expect(block.port.length).toBeGreaterThan(0);
		}
	});

	it("negotiates as prefer, never require", () => {
		// `prefer` is what keeps a provider-specific annotation additive: on a
		// provider that cannot honour it the deploy degrades rather than failing,
		// which is the whole point of an inert annotation.
		expect(lakebed.with.capsule().negotiation).toBe("prefer");
		expect(lakebed.with.reactiveDb().negotiation).toBe("prefer");
		expect(lakebed.with.files().negotiation).toBe("prefer");
	});

	it("applies each block's defaults", () => {
		expect(lakebed.with.capsule().options).toMatchObject({
			syncRpc: true,
			coldStart: "instant",
		});
		expect(lakebed.with.reactiveDb().options).toMatchObject({
			consistency: "reactive",
			schema: "document",
		});
		expect(lakebed.with.files().options).toMatchObject({
			publicAccess: false,
		});
	});

	it("lets a caller override a default", () => {
		// `{ ...defaults, ...options }` — the caller wins. Defaults that could
		// not be overridden would make the option block decorative.
		expect(lakebed.with.capsule({ coldStart: "warm" }).options.coldStart).toBe(
			"warm",
		);
		expect(
			lakebed.with.files({ publicAccess: true }).options.publicAccess,
		).toBe(true);
	});

	it("lets a caller add a key the defaults do not name", () => {
		expect(lakebed.with.capsule({ memoryMb: 512 }).options.memoryMb).toBe(512);
	});

	it("gives each call its own options object", () => {
		// Fresh spread per call, so a caller mutating one block's options cannot
		// change what a later call defaults to.
		const first = lakebed.with.capsule();
		first.options.coldStart = "mutated";
		expect(lakebed.with.capsule().options.coldStart).toBe("instant");
	});

	it("routes each block to the port it configures", () => {
		expect(lakebed.with.capsule().port).toBe("compute");
		expect(lakebed.with.reactiveDb().port).toBe("database");
		expect(lakebed.with.files().port).toBe("objectStore");
	});
});
