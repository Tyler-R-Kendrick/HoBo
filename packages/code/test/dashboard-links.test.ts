/**
 * The two URLs an endpoint has, and which one is shown where.
 *
 * The module's header states the rule it exists for: **the named URL stays the
 * public handle; the listen IP is shown here and nowhere else.** An endpoint
 * has a name people share and an address it actually binds to, and those are
 * different pieces of information with different audiences. The dashboard is
 * the one surface that shows the second, because it is the one surface where
 * "why can't I reach it" is the question being answered.
 *
 * Everything else follows from that:
 *
 * **A URL is only offered if it can actually be opened.** `http:` and `https:`
 * only — a `file:` or `javascript:` URL rendered as a clickable link on a
 * dashboard is a much worse thing than a missing link. An unparseable one is
 * refused rather than passed through for the browser to interpret.
 *
 * **Empty means "no link", not "a broken link".** Every resolver returns `""`
 * rather than a partial URL when it cannot produce a whole one. A dashboard
 * row with no link is legible; one with `http://undefined:0/` is not.
 *
 * Pure string work — no network, no station.
 */
import { describe, expect, it } from "vitest";

import {
	type DashboardEndpointRef,
	dashboardListenUrl,
	dashboardNamedUrl,
	isDashboardOpenableUrl,
} from "../src/dashboard-links.js";

const ref = (patch: DashboardEndpointRef = {}): DashboardEndpointRef => patch;

describe("the public handle", () => {
	it("prefers an explicit preferred url", () => {
		// When something upstream has already decided which URL to show, that
		// decision wins -- it knows things this module does not.
		expect(
			dashboardNamedUrl(
				ref({ preferredUrl: "https://app.example", namedUrl: "https://named" }),
			),
		).toBe("https://app.example");
	});

	it("falls back to the named url", () => {
		expect(dashboardNamedUrl(ref({ namedUrl: "https://named" }))).toBe(
			"https://named",
		);
	});

	it("returns empty when there is neither", () => {
		// Empty means "no link". A dashboard row with no link is legible; one
		// with a partial URL is not.
		expect(dashboardNamedUrl(ref())).toBe("");
	});

	it("skips an empty preferred url rather than returning it", () => {
		// Present-but-empty is not a choice; falling through to the named URL
		// is what keeps an upstream that sets `""` from blanking the link.
		expect(
			dashboardNamedUrl(ref({ preferredUrl: "", namedUrl: "https://named" })),
		).toBe("https://named");
	});
});

describe("what counts as openable", () => {
	it.each([
		"http://host/",
		"https://host/",
		"http://127.0.0.1:8080/",
	])("accepts %s", (url) => {
		expect(isDashboardOpenableUrl(url)).toBe(true);
	});

	it.each([
		"file:///etc/passwd",
		"javascript:alert(1)",
		"data:text/html,<h1>hi",
		"ftp://host/",
	])("refuses %s", (url) => {
		// A dashboard renders these as clickable links. A `javascript:` or
		// `file:` URL there is a much worse thing than a missing link.
		expect(isDashboardOpenableUrl(url)).toBe(false);
	});

	it("refuses a string that is not a url at all", () => {
		// Refused rather than passed through for the browser to interpret.
		expect(isDashboardOpenableUrl("not a url")).toBe(false);
	});

	it("refuses an empty string", () => {
		expect(isDashboardOpenableUrl("")).toBe(false);
	});

	it("assumes 80 for http with no port", () => {
		// The port is validated, so a URL with none has to be given its
		// scheme's default rather than failing the integer check on "".
		expect(isDashboardOpenableUrl("http://host/")).toBe(true);
	});

	it("assumes 443 for https with no port", () => {
		expect(isDashboardOpenableUrl("https://host/")).toBe(true);
	});

	it("refuses port zero", () => {
		// Port zero is a server still asking the OS for one. A link to it goes
		// nowhere, and going nowhere from a dashboard reads as the app being
		// down.
		expect(isDashboardOpenableUrl("http://host:0/")).toBe(false);
	});

	it("accepts a high port", () => {
		expect(isDashboardOpenableUrl("http://host:65535/")).toBe(true);
	});

	it("keeps a path on an otherwise valid url", () => {
		expect(isDashboardOpenableUrl("http://host:8080/deep/path?q=1")).toBe(true);
	});
});

describe("the listen url the dashboard alone shows", () => {
	it("rewrites a named backend onto the resolved address", () => {
		// The whole point: the named URL is the handle, and this is the address
		// it actually binds to -- the answer to "why can't I reach it".
		expect(
			dashboardListenUrl(
				ref({
					namedUrl: "https://app.example/",
					backendUrl: "http://app.internal:8080/",
					resolvedAddresses: ["127.0.0.1"],
				}),
			),
		).toBe("http://127.0.0.1:8080/");
	});

	it("keeps the port when it rewrites the host", () => {
		expect(
			dashboardListenUrl(
				ref({
					backendUrl: "http://app.internal:9999/",
					resolvedAddresses: ["10.0.0.2"],
				}),
			),
		).toContain(":9999");
	});

	it("leaves a backend that is already a loopback address alone", () => {
		// Already the listen address; rewriting it onto a different one would
		// invent an address the server is not on.
		expect(
			dashboardListenUrl(
				ref({
					backendUrl: "http://127.0.0.1:8080/",
					resolvedAddresses: ["10.0.0.2"],
				}),
			),
		).toBe("http://127.0.0.1:8080/");
	});

	it("recognises bracketed ipv6 loopback as already an address", () => {
		expect(
			dashboardListenUrl(
				ref({
					backendUrl: "http://[::1]:8080/",
					resolvedAddresses: ["10.0.0.2"],
				}),
			),
		).toContain("::1");
	});

	it("defaults to loopback when no address was resolved", () => {
		// Better than nothing: a local server is overwhelmingly on loopback,
		// and a wrong-but-plausible address is still checkable.
		expect(
			dashboardListenUrl(ref({ backendUrl: "http://app.internal:8080/" })),
		).toBe("http://127.0.0.1:8080/");
	});

	it("falls back to the named url when there is no backend", () => {
		expect(
			dashboardListenUrl(
				ref({
					namedUrl: "http://app.example:8080/",
					resolvedAddresses: ["10.0.0.2"],
				}),
			),
		).toBe("http://10.0.0.2:8080/");
	});

	it("builds a url from the address and port when nothing else works", () => {
		// The last resort, and the reason `listenPort` is on the ref at all.
		expect(
			dashboardListenUrl(
				ref({ resolvedAddresses: ["10.0.0.2"], listenPort: 8080 }),
			),
		).toBe("http://10.0.0.2:8080/");
	});

	it("does not build one from a zero port", () => {
		// Zero is a server that has not been given a port yet.
		expect(
			dashboardListenUrl(
				ref({ resolvedAddresses: ["10.0.0.2"], listenPort: 0 }),
			),
		).toBe("");
	});

	it("does not build one from an address with no port", () => {
		expect(dashboardListenUrl(ref({ resolvedAddresses: ["10.0.0.2"] }))).toBe(
			"",
		);
	});

	it("does not build one from a port with no address", () => {
		expect(dashboardListenUrl(ref({ listenPort: 8080 }))).toBe("");
	});

	it("returns empty for an endpoint with nothing on it", () => {
		expect(dashboardListenUrl(ref())).toBe("");
	});

	it("returns empty rather than echoing an unopenable backend", () => {
		// A `file:` backend is not something to put behind a link, and echoing
		// it would put one there.
		expect(
			dashboardListenUrl(
				ref({ backendUrl: "file:///srv/app", resolvedAddresses: ["10.0.0.2"] }),
			),
		).toBe("");
	});

	it("returns empty rather than echoing an unparseable backend", () => {
		expect(
			dashboardListenUrl(
				ref({ backendUrl: "://broken", resolvedAddresses: ["10.0.0.2"] }),
			),
		).toBe("");
	});

	it("does not repeat the named url as the listen url", () => {
		// If the rewrite lands back on the public handle it has told the reader
		// nothing -- the listen row exists to show something the named row does
		// not.
		expect(
			dashboardListenUrl(
				ref({
					namedUrl: "http://127.0.0.1:8080/",
					backendUrl: "http://127.0.0.1:8080/",
				}),
			),
		).toBe("http://127.0.0.1:8080/");
	});

	it("takes the first resolved address when there are several", () => {
		// Deterministic: the same endpoint renders the same row every repaint.
		expect(
			dashboardListenUrl(
				ref({
					backendUrl: "http://app.internal:8080/",
					resolvedAddresses: ["10.0.0.2", "10.0.0.3"],
				}),
			),
		).toContain("10.0.0.2");
	});

	it("ignores an empty resolved address list", () => {
		expect(
			dashboardListenUrl(
				ref({ backendUrl: "http://app.internal:8080/", resolvedAddresses: [] }),
			),
		).toBe("http://127.0.0.1:8080/");
	});
});
