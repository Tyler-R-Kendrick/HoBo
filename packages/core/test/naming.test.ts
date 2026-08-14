import { describe, expect, it } from "vitest";

import {
	getNamedEndpoint,
	getNamedEndpointHost,
	isHoboHierarchicalName,
	sanitizeDnsLabel,
} from "../src/naming.js";
import { parseTenantId } from "../src/ports/tenant.js";

describe("sanitizeDnsLabel", () => {
	it("lowercases and replaces non-alphanumerics", () => {
		expect(sanitizeDnsLabel("Feature/Auth_Flow")).toBe("feature-auth-flow");
	});

	it("collapses dashes and trims edges", () => {
		expect(sanitizeDnsLabel("--Hello--World--")).toBe("hello-world");
	});

	it("respects max length without trailing dash", () => {
		const label = sanitizeDnsLabel("a".repeat(80) + "-x", 10);
		expect(label.length).toBeLessThanOrEqual(10);
		expect(label.endsWith("-")).toBe(false);
	});
});

describe("getNamedEndpoint", () => {
	it("builds local hierarchical names ending in .hobo.localhost", () => {
		expect(
			getNamedEndpoint({
				resource: "web",
				app: "myapp",
				env: "local",
				mode: "local",
			}),
		).toBe("https://web.myapp.local.hobo.localhost");
	});

	it("includes a non-default listen port on the named URL", () => {
		expect(
			getNamedEndpoint({
				resource: "web",
				app: "hello-world",
				env: "local",
				mode: "local",
				scheme: "http",
				port: 48211,
			}),
		).toBe("http://web.hello-world.local.hobo.localhost:48211");
	});

	it("omits prod env on overlay", () => {
		expect(
			getNamedEndpoint({
				resource: "web",
				app: "myapp",
				env: "prod",
				mode: "overlay",
			}),
		).toBe("https://web.myapp.hobo.test");
	});

	it("keeps non-prod env and tenant", () => {
		expect(
			getNamedEndpoint({
				resource: "api",
				app: "payments",
				env: "staging",
				tenant: "acme",
				mode: "overlay",
			}),
		).toBe("https://api.payments.staging.acme.hobo.test");
	});

	it("supports branch / preview segments", () => {
		expect(
			getNamedEndpointHost({
				resource: "web",
				app: "myapp",
				branch: "feature/auth-flow",
				mode: "overlay",
			}),
		).toBe("web.myapp.feature-auth-flow.hobo.test");
	});

	it("never emits bare .hobo", () => {
		const host = getNamedEndpointHost({
			resource: "web",
			app: "myapp",
			mode: "local",
		});
		expect(host.endsWith(".hobo")).toBe(false);
		expect(isHoboHierarchicalName(host)).toBe(true);
	});

	it("requires tenant when requireTenant is set", () => {
		expect(() =>
			getNamedEndpointHost({
				resource: "web",
				app: "myapp",
				mode: "overlay",
				requireTenant: true,
			}),
		).toThrow(/tenant/);
	});

	it("accepts tenant brands from parseTenantId", () => {
		const tenant = parseTenantId("Acme Corp");
		expect(
			getNamedEndpointHost({
				resource: "web",
				app: "myapp",
				env: "dev",
				tenant,
				mode: "overlay",
			}),
		).toBe("web.myapp.dev.acme-corp.hobo.test");
	});
});
