import { describe, expect, it } from "vitest";

import {
	dashboardListenUrl,
	dashboardNamedUrl,
	isDashboardOpenableUrl,
} from "../src/dashboard-links.js";

describe("dashboard endpoint links", () => {
	it("keeps the named handle and exposes the loopback listen URL", () => {
		const endpoint = {
			preferredUrl: "http://dashboard.code.local.hobo.localhost:8787/",
			namedUrl: "http://dashboard.code.local.hobo.localhost:8787/",
			backendUrl: "http://127.0.0.1:8787/",
			resolvedAddresses: ["127.0.0.1"],
			listenPort: 8787,
		};
		expect(dashboardNamedUrl(endpoint)).toBe(
			"http://dashboard.code.local.hobo.localhost:8787/",
		);
		expect(dashboardListenUrl(endpoint)).toBe("http://127.0.0.1:8787/");
		expect(isDashboardOpenableUrl(dashboardNamedUrl(endpoint))).toBe(true);
		expect(isDashboardOpenableUrl(dashboardListenUrl(endpoint))).toBe(true);
	});

	it("rewrites a named backend onto the resolved IP", () => {
		expect(
			dashboardListenUrl({
				preferredUrl: "http://web.hello.local.hobo.localhost:4173/",
				backendUrl: "http://web.hello.local.hobo.localhost:4173/",
				resolvedAddresses: ["127.0.0.1"],
				listenPort: 4173,
			}),
		).toBe("http://127.0.0.1:4173/");
	});

	it("does not invent an openable listen URL for port 0", () => {
		expect(
			dashboardListenUrl({
				preferredUrl: "http://kv.hello.local.hobo.localhost:0/",
				backendUrl: "http://kv.hello.local.hobo.localhost:0/",
				resolvedAddresses: ["127.0.0.1"],
				listenPort: 0,
			}),
		).toBe("");
		expect(
			isDashboardOpenableUrl("http://kv.hello.local.hobo.localhost:0/"),
		).toBe(false);
	});
});
