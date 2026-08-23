/**
 * Where `hobo-code` lives on the dev tailnet, and how you get back to it.
 *
 * A remote coding session has one property that matters more than any other:
 * **you must be able to leave and come back.** A dropped SSH connection on a
 * train, a closed laptop lid, a phone that switched networks — none of these
 * should cost the work in progress. So the surface is built around a detachable
 * session at a *deterministic* address rather than a connection someone has to
 * hold open.
 *
 * Deterministic is the load-bearing word. The endpoint is derived from what the
 * session is — tenant, project, branch, environment — not assigned when it
 * starts. That means reattaching does not require remembering a port, looking
 * up an IP, or having been told anything by whoever started it: the same inputs
 * always name the same host, so the address can be *computed* rather than
 * discovered (ADR-0130).
 *
 * Two consequences the tests pin:
 *
 * **Different sessions get different addresses.** Two branches of one project
 * are different working sessions, and an address that collapsed them would let
 * an attach land in the wrong one — the failure mode where you type into
 * somebody else's editor.
 *
 * **mosh is offered, not required.** It is UDP roaming for lossy mobile links,
 * layered on top of the named endpoint. Presenting it as the primary path would
 * make a dependency out of something most sessions do not need; omitting it
 * would leave the phone case unanswered.
 *
 * `attach` is deliberately a discoverable verb rather than an admin command:
 * the reattach story is the product, so it has to be the thing a user finds
 * first.
 */
import { describe, expect, it } from "vitest";

import {
	describeDevTerminalAttach,
	registerCodeNamedEndpoint,
	shortNamedHost,
} from "../src/remote.js";

const register = (
	options: Parameters<typeof registerCodeNamedEndpoint>[0] = {},
) => registerCodeNamedEndpoint(options);

const attach = (
	options: Parameters<typeof describeDevTerminalAttach>[0] = {},
) => describeDevTerminalAttach(options);

describe("the named endpoint", () => {
	it("names the code resource and its mux app", () => {
		// The pair is what the tailnet resolves; either one alone would address
		// a different service.
		expect(register()).toMatchObject({ resource: "code", app: "mux" });
	});

	it("is deterministic — the same inputs give the same host", () => {
		// The whole reattach story rests on this. If the address were assigned
		// rather than derived, coming back would need something to have been
		// written down.
		const first = register({ tenant: "acme", project: "web", branch: "main" });
		const second = register({ tenant: "acme", project: "web", branch: "main" });
		expect(second.host).toBe(first.host);
	});

	it("gives two branches of one project different addresses", () => {
		// They are different working sessions. An address that collapsed them
		// would let an attach land in the wrong one.
		const main = register({ tenant: "acme", project: "web", branch: "main" });
		const feature = register({
			tenant: "acme",
			project: "web",
			branch: "feature",
		});
		expect(feature.host).not.toBe(main.host);
	});

	it("gives two projects different addresses", () => {
		const web = register({ tenant: "acme", project: "web" });
		const api = register({ tenant: "acme", project: "api" });
		expect(api.host).not.toBe(web.host);
	});

	it("gives two tenants different addresses", () => {
		// Tenancy is a boundary, not a label. Two tenants sharing a host would
		// be a cross-tenant attach.
		const acme = register({ tenant: "acme", project: "web" });
		const other = register({ tenant: "other", project: "web" });
		expect(other.host).not.toBe(acme.host);
	});

	it("gives two environments different addresses", () => {
		const dev = register({ tenant: "acme", env: "dev" });
		const staging = register({ tenant: "acme", env: "staging" });
		expect(staging.host).not.toBe(dev.host);
	});

	it("defaults to local mode", () => {
		// Local is the safe default: overlay implies a tailnet the developer
		// may not have joined, and defaulting to it would fail on a laptop.
		expect(register().mode).toBe("local");
	});

	it("keeps an explicit overlay mode", () => {
		expect(register({ mode: "overlay" }).mode).toBe("overlay");
	});

	it("addresses local and overlay differently", () => {
		// The two modes resolve through different DNS; one host for both would
		// send an overlay attach to a local-only name.
		expect(register({ mode: "overlay" }).host).not.toBe(
			register({ mode: "local" }).host,
		);
	});

	it("produces a URL that contains its host", () => {
		// The URL is what a browser or client opens; a mismatch between the two
		// would make the reported host untrustworthy.
		const registration = register({ tenant: "acme", project: "web" });
		expect(registration.url).toContain(registration.host);
	});

	it("registers with no options at all", () => {
		// The zero-config case: a developer running `hobo-code` in a directory
		// with nothing configured still gets an address.
		expect(register().host.length).toBeGreaterThan(0);
	});
});

describe("mosh", () => {
	it("is offered as explored rather than required", () => {
		// Presenting it as primary would make a dependency of something most
		// sessions do not need.
		expect(register().mosh.explored).toBe(true);
	});

	it("says when it is worth reaching for", () => {
		// "optional" with no criterion is advice nobody can act on; the answer
		// is lossy mobile links that need UDP roaming.
		expect(register().mosh.recommendedWhen).toMatch(/lossy|mobile|roam/i);
	});

	it("says the primary path is the named endpoint", () => {
		// The note is what stops mosh being treated as the remote story rather
		// than a resilience layer on top of it.
		expect(register().mosh.notes).toMatch(/named endpoint|tailnet/i);
	});
});

describe("the attach surface", () => {
	it("is the `attach` verb", () => {
		// Discoverable, not an admin command — the reattach story is the
		// product, so it has to be what a user finds first.
		expect(attach().attach.verb).toBe("attach");
	});

	it("says the session is detachable", () => {
		// The claim the whole surface exists to make: leaving does not cost the
		// work.
		expect(attach().attach.detachable).toBe(true);
	});

	it("gives a command to reattach with", () => {
		// A detachable session with no documented way back is a lost session.
		expect(attach().attach.reattach.length).toBeGreaterThan(0);
	});

	it("lists steps to get connected", () => {
		expect(attach().attach.steps.length).toBeGreaterThan(0);
	});

	it("offers an ssh hint", () => {
		// TCP SSH is the path that works everywhere; it is named first so the
		// common case needs no extra software.
		expect(attach().attach.sshHint.length).toBeGreaterThan(0);
	});

	it("offers a mosh hint for the mobile case", () => {
		expect(attach().attach.moshHint.length).toBeGreaterThan(0);
	});

	it("carries the registration the session is reachable at", () => {
		// The attach surface embeds the registration rather than restating its
		// address, so the two cannot drift into pointing at different hosts.
		const options = { tenant: "acme", project: "web", branch: "main" };
		expect(attach(options).registration.host).toBe(register(options).host);
	});

	it("carries a legend that names the mode", () => {
		// The panel line is read before anything else; a legend that did not
		// distinguish local from overlay would hide which network the session
		// is actually on.
		expect(attach({ mode: "overlay" }).legend).not.toBe(
			attach({ mode: "local" }).legend,
		);
	});

	it("reflects the mode it was given", () => {
		const overlay = attach({ tenant: "acme", mode: "overlay" });
		const local = attach({ tenant: "acme", mode: "local" });
		expect(JSON.stringify(overlay)).not.toBe(JSON.stringify(local));
	});

	it("compares against the tools a power user already runs", () => {
		// tmux, cmux, mosh and Tailscale are the mental models people arrive
		// with; explaining the surface in their terms is faster than teaching a
		// new one.
		const compare = attach().compare;
		expect(compare.tmux.length).toBeGreaterThan(0);
		expect(compare.cmux.length).toBeGreaterThan(0);
		expect(compare.mosh.length).toBeGreaterThan(0);
		expect(compare.tailscale.length).toBeGreaterThan(0);
	});

	it("describes an attach with no options at all", () => {
		expect(attach().attach.steps.length).toBeGreaterThan(0);
	});
});

describe("shortening a host for display", () => {
	it("drops the localhost product suffix", () => {
		// Scan lines are read at a glance; the suffix is the same on every row
		// and carries no information.
		expect(shortNamedHost("code-mux-acme.hobo.localhost")).toBe(
			"code-mux-acme",
		);
	});

	it("drops the test product suffix", () => {
		expect(shortNamedHost("code-mux-acme.hobo.test")).toBe("code-mux-acme");
	});

	it("leaves a host with neither suffix alone", () => {
		// A real tailnet name is not a product-local one; truncating it would
		// produce an address that does not resolve.
		expect(shortNamedHost("code-mux.acme.ts.net")).toBe("code-mux.acme.ts.net");
	});

	it("only strips the suffix at the end", () => {
		// A host that merely contains the string is a different host; a global
		// replace would corrupt it.
		expect(shortNamedHost("hobo.localhost.example.com")).toBe(
			"hobo.localhost.example.com",
		);
	});

	it("leaves an empty host alone", () => {
		expect(shortNamedHost("")).toBe("");
	});

	it("shortens the host a registration actually produces", () => {
		// The two functions are used together, so the pairing is what matters
		// rather than either in isolation.
		const registration = register({ tenant: "acme", project: "web" });
		expect(shortNamedHost(registration.host).length).toBeGreaterThan(0);
		expect(shortNamedHost(registration.host).length).toBeLessThanOrEqual(
			registration.host.length,
		);
	});
});
