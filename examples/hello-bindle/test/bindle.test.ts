import { afterEach, describe, expect, it } from "vitest";

import { app as helloApi, buildGreeting } from "../src/api.js";
import definition from "../src/bindle.js";
import {
	API_GREETING_PREFIX_KEY,
	resolveBindleConfig,
	WEB_APP_TITLE_KEY,
} from "../src/config.js";
import {
	resolveServiceEndpoint,
	serviceEndpointKey,
} from "../src/endpoints.js";
import { app as helloWeb, fetchGreetingFromApi } from "../src/webapp.js";

const API_ENDPOINT_KEY = serviceEndpointKey("api"); // services__api__http__0

const BINDLE_ENV_KEYS = [API_GREETING_PREFIX_KEY, WEB_APP_TITLE_KEY] as const;

/**
 * Camp-style fetch that routes http(s) calls to the in-process Hono API.
 */
function apiFetchAt(baseUrl: string): typeof fetch {
	return async (input, init) => {
		const url = new URL(String(input));
		const expected = new URL(baseUrl);
		if (url.origin !== expected.origin) {
			throw new Error(
				`fetch targeted unexpected origin ${url.origin} (expected ${expected.origin})`,
			);
		}
		return helloApi.request(`${url.pathname}${url.search}`, init);
	};
}

/** Simulate camp injection of bindle `.with({ option: "env" })` annotations. */
function injectBindleEnvFromDefinition(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const record of Object.values(definition.resources)) {
		for (const annotation of record.annotations) {
			if (annotation.option !== "env") continue;
			for (const [key, value] of Object.entries(annotation.config)) {
				if (typeof value === "string") {
					env[key] = value;
					process.env[key] = value;
				}
			}
		}
	}
	return env;
}

describe("hello-bindle", () => {
	const previous: Record<string, string | undefined> = {
		[API_ENDPOINT_KEY]: process.env[API_ENDPOINT_KEY],
		[API_GREETING_PREFIX_KEY]: process.env[API_GREETING_PREFIX_KEY],
		[WEB_APP_TITLE_KEY]: process.env[WEB_APP_TITLE_KEY],
	};

	afterEach(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it("wires a web app that depends on the api", () => {
		expect(Object.keys(definition.resources)).toEqual(["api", "web"]);
		expect(definition.edges).toEqual([{ from: "web", to: "api" }]);
	});

	it("declares bindle env config on api and web resources", () => {
		const apiAnn = definition.resources.api?.annotations.find(
			(a) => a.option === "env",
		);
		const webAnn = definition.resources.web?.annotations.find(
			(a) => a.option === "env",
		);
		expect(apiAnn?.config[API_GREETING_PREFIX_KEY]).toBe("from-bindle-api");
		expect(webAnn?.config[WEB_APP_TITLE_KEY]).toBe("from-bindle-web");
	});

	it("fails closed when bindle env is not injected by the camp", () => {
		delete process.env[API_GREETING_PREFIX_KEY];
		expect(() => resolveBindleConfig(API_GREETING_PREFIX_KEY, {})).toThrow(
			/unresolved bindle config GREETING_PREFIX/,
		);
	});

	it("binds the Hono api handler and renders the bindle-injected prefix", async () => {
		injectBindleEnvFromDefinition();
		const boundApi = definition.entrypoint("api");
		expect(boundApi).toBeTypeOf("function");

		const fetchHandler = boundApi?.() as typeof helloApi.fetch;
		const response = await fetchHandler(
			new Request("http://hello-bindle.test/hello"),
		);

		expect(await response.json()).toEqual({
			message: "from-bindle-api, world",
			greetingPrefix: "from-bindle-api",
			via: "bindle-env",
		});
	});

	it("serves a greeting from the api using bindle env", async () => {
		injectBindleEnvFromDefinition();
		const response = await helloApi.request("/hello?name=HoBo");
		expect(await response.json()).toEqual({
			message: "from-bindle-api, HoBo",
			greetingPrefix: "from-bindle-api",
			via: "bindle-env",
		});
		expect(buildGreeting("x").greetingPrefix).toBe("from-bindle-api");
	});

	it("resolves the Aspire services__api__http__0 key from the bindle resource name", () => {
		expect(API_ENDPOINT_KEY).toBe("services__api__http__0");
		expect(
			resolveServiceEndpoint("api", {
				env: { [API_ENDPOINT_KEY]: "http://api.local:8080/" },
			}),
		).toBe("http://api.local:8080");
	});

	it("fails closed when the bindle-resolved api endpoint is missing", () => {
		expect(() => resolveServiceEndpoint("api", { env: {} })).toThrow(
			/unresolved service endpoint services__api__http__0/,
		);
	});

	it("webapp renders bindle APP_TITLE and API GREETING_PREFIX via the camp", async () => {
		const injected = injectBindleEnvFromDefinition();
		expect(injected[API_GREETING_PREFIX_KEY]).toBe("from-bindle-api");
		expect(injected[WEB_APP_TITLE_KEY]).toBe("from-bindle-web");

		const apiBase = "http://api.hello-bindle.test";
		process.env[API_ENDPOINT_KEY] = apiBase;

		const greeting = await fetchGreetingFromApi({
			name: "bindle",
			fetchImpl: apiFetchAt(apiBase),
		});
		expect(greeting).toEqual({
			message: "from-bindle-api, bindle",
			greetingPrefix: "from-bindle-api",
			via: "bindle-env",
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = apiFetchAt(apiBase) as typeof fetch;
		try {
			const live = await helloWeb.request("/?name=bindle");
			expect(live.status).toBe(200);
			const html = await live.text();
			expect(html).toContain('data-testid="app-title">from-bindle-web</h1>');
			expect(html).toContain(
				'data-testid="greeting">from-bindle-api, bindle</p>',
			);
			expect(html).toContain(
				'data-testid="greeting-prefix">from-bindle-api</p>',
			);
			expect(html).toContain('data-testid="via">bindle-env</p>');
			expect(html).toContain("<title>from-bindle-web</title>");
		} finally {
			globalThis.fetch = originalFetch;
		}

		void BINDLE_ENV_KEYS;
	});

	it("webapp does not hardcode a host — swapping the resolved endpoint retargets the call", async () => {
		injectBindleEnvFromDefinition();
		const calls: string[] = [];
		const tracking =
			(baseUrl: string): typeof fetch =>
			async (input, init) => {
				calls.push(String(input));
				return apiFetchAt(baseUrl)(input, init);
			};

		const apiA = "http://api-a.hello-bindle.test";
		const apiB = "http://api-b.hello-bindle.test";

		process.env[API_ENDPOINT_KEY] = apiA;
		await fetchGreetingFromApi({ name: "A", fetchImpl: tracking(apiA) });
		process.env[API_ENDPOINT_KEY] = apiB;
		await fetchGreetingFromApi({ name: "B", fetchImpl: tracking(apiB) });

		expect(calls[0]).toBe(`${apiA}/hello?name=A`);
		expect(calls[1]).toBe(`${apiB}/hello?name=B`);
	});
});
