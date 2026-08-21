/**
 * `inspectBindleSource` reads a project's Bindle declaration *without executing
 * it* — which is the whole point, and also the constraint that makes it worth
 * testing carefully. It cannot ask the module what it declares; it has to infer
 * that from source text with regexes, so every shape a developer might plausibly
 * write is a separate case, and getting one wrong means a resource silently
 * missing from the Station's occupancy board.
 *
 * Two failure directions matter and neither shows on a tidy example. Missing a
 * resource means the Station never provisions it and the app fails at runtime
 * against a dependency nobody knew it had. Inventing one — matching a method
 * call that happens to share a name with a resource kind — means the board shows
 * occupancy for something that does not exist.
 *
 * So the tests below drive each recognised declaration shape (inline, aliased,
 * shorthand, factory-call fallback), the JSON path and its precedence over
 * source, and the requirement inference that turns declared resources into the
 * capabilities a Yard must satisfy.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	BINDLE_RESOURCE_KINDS,
	inspectBindleProject,
	inspectBindleSource,
	localBindleCapabilities,
} from "../src/bindle-inspect.js";

/** A scratch project directory. Never writes outside the OS temp dir. */
function projectDir(files: Record<string, string> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), "hobo-bindle-inspect-"));
	for (const [rel, content] of Object.entries(files)) {
		const path = join(dir, rel);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, content, "utf8");
	}
	return dir;
}

function kinds(source: string): string[] {
	return inspectBindleSource(source).resources.map((r) => r.kind);
}

function names(source: string): string[] {
	return inspectBindleSource(source).resources.map((r) => r.name);
}

describe("the resource-kind vocabulary", () => {
	test("every declared kind is unique", () => {
		// A duplicate would make the capability record silently drop one.
		expect(new Set(BINDLE_RESOURCE_KINDS).size).toBe(
			BINDLE_RESOURCE_KINDS.length,
		);
	});

	test("local capabilities cover every kind except the station-hosted ones", () => {
		// A kind with no entry would read as `available: undefined`, which a
		// caller checking truthiness treats as unavailable — the wrong answer for
		// a kind the Station actually hosts.
		const covered = localBindleCapabilities().map((c) => c.kind);
		expect(covered).not.toContain("experiment");
		for (const kind of BINDLE_RESOURCE_KINDS) {
			if (kind === "experiment") continue;
			expect(covered).toContain(kind);
		}
	});

	test("availability is a boolean for every kind", () => {
		for (const capability of localBindleCapabilities()) {
			expect(typeof capability.available).toBe("boolean");
		}
	});

	test("the kinds with no local implementation are reported unavailable", () => {
		// "No mocks" is the stated rule: a kind the Station cannot really host
		// must say so rather than pretend, or a developer builds against
		// something that will not exist when they deploy.
		const unavailable = localBindleCapabilities()
			.filter((c) => !c.available)
			.map((c) => c.kind);
		expect(unavailable).toEqual(
			expect.arrayContaining(["notify", "guardrail", "external", "container"]),
		);
	});

	test("the core hosting kinds are available", () => {
		const available = localBindleCapabilities()
			.filter((c) => c.available)
			.map((c) => c.kind);
		for (const kind of ["api", "web", "kv", "bucket", "data", "secret"]) {
			expect(available).toContain(kind);
		}
	});
});

describe("reading the bindle name", () => {
	test("the name is taken from the bindle() call", () => {
		expect(inspectBindleSource('const b = bindle("shop");').name).toBe("shop");
	});

	test("single and double quotes both work", () => {
		expect(inspectBindleSource("bindle('shop')").name).toBe("shop");
		expect(inspectBindleSource('bindle("shop")').name).toBe("shop");
	});

	test("whitespace inside the call is tolerated", () => {
		// Formatters wrap long calls; a name-detection that broke on a newline
		// would silently fall back for every prettified file.
		expect(inspectBindleSource('bindle(\n\t"shop"\n)').name).toBe("shop");
	});

	test("a source with no bindle call uses the fallback name", () => {
		expect(inspectBindleSource("export const x = 1;", "fallback").name).toBe(
			"fallback",
		);
	});

	test("the fallback defaults to 'app'", () => {
		expect(inspectBindleSource("").name).toBe("app");
	});

	test("a whitespace-only name falls back rather than being kept", () => {
		// An empty name would produce an unnamed entry on the occupancy board.
		expect(inspectBindleSource('bindle("   ")', "fallback").name).toBe(
			"fallback",
		);
	});
});

describe("resources declared in a returned object", () => {
	test("an inline factory call is read as a named resource", () => {
		const source = `
			const b = bindle("shop");
			export default () => {
				return { cart: b.kv(), orders: b.data() };
			};
		`;
		expect(names(source)).toEqual(["cart", "orders"]);
		expect(kinds(source)).toEqual(["kv", "data"]);
	});

	test("an aliased local variable resolves to its declared kind", () => {
		// The common shape: declare it, configure it, then return it under a
		// name. The alias has to be traced back to the factory that made it.
		const source = `
			const b = bindle("shop");
			const sessions = b.kv();
			export default () => {
				return { store: sessions };
			};
		`;
		expect(names(source)).toEqual(["store"]);
		expect(kinds(source)).toEqual(["kv"]);
	});

	test("object shorthand resolves to the variable's kind", () => {
		const source = `
			const b = bindle("shop");
			const sessions = b.kv();
			export default () => {
				return { sessions };
			};
		`;
		expect(names(source)).toEqual(["sessions"]);
		expect(kinds(source)).toEqual(["kv"]);
	});

	test("let and var declarations are traced as well as const", () => {
		const source = `
			const b = bindle("shop");
			let a = b.kv();
			var c = b.bucket();
			export default () => ({ a, c });
		`;
		expect(kinds(source).sort()).toEqual(["bucket", "kv"]);
	});

	test("an arrow returning a parenthesised object is read", () => {
		// `() => ({ ... })` is at least as common as an explicit return.
		const source = `
			const b = bindle("shop");
			export default () => ({ cart: b.kv() });
		`;
		expect(names(source)).toEqual(["cart"]);
	});

	test("a shorthand naming an untraced variable is skipped", () => {
		// Returning something that is not a resource — a helper, a config object
		// — must not appear on the occupancy board.
		const source = `
			const b = bindle("shop");
			const helper = makeHelper();
			const store = b.kv();
			export default () => ({ helper, store });
		`;
		expect(names(source)).toEqual(["store"]);
	});

	test("an unknown factory name is not treated as a resource", () => {
		// `b.middleware()` shares the call shape but is not a resource kind.
		const source = `
			const b = bindle("shop");
			export default () => ({ mw: b.middleware(), store: b.kv() });
		`;
		expect(names(source)).toEqual(["store"]);
	});

	test("nested braces and commas do not split an entry", () => {
		// The entry splitter tracks depth; a naive comma split would cut an
		// options object in half and lose the resource.
		const source = `
			const b = bindle("shop");
			export default () => {
				return { cart: b.kv({ ttl: 60, prefix: "c" }), orders: b.data() };
			};
		`;
		expect(names(source)).toEqual(["cart", "orders"]);
	});

	test("an inline options object does not truncate the resource list", () => {
		// Regression. The block was extracted with a non-greedy
		// `/return\s*\{([\s\S]*?)\}/`, which stops at the *first* closing brace —
		// the one ending `{ ttl: 60 }`. Everything declared after it was silently
		// dropped, so the Station never provisioned `orders` or `sessions` and the
		// app failed at runtime against dependencies it had correctly declared.
		const source = `
			const b = bindle("shop");
			export default () => {
				return {
					cart: b.kv({ ttl: 60 }),
					orders: b.data(),
					sessions: b.bucket(),
				};
			};
		`;
		expect(names(source)).toEqual(["cart", "orders", "sessions"]);
	});

	test("several options objects in a row are all spanned", () => {
		const source = `
			const b = bindle("shop");
			export default () => ({
				cart: b.kv({ ttl: 60 }),
				files: b.bucket({ acl: "private" }),
				jobs: b.queue({ retries: 3 }),
			});
		`;
		expect(names(source)).toEqual(["cart", "files", "jobs"]);
	});

	test("a deeply nested options object is spanned", () => {
		const source = `
			const b = bindle("shop");
			export default () => ({
				cart: b.kv({ opts: { nested: { deep: true } } }),
				orders: b.data(),
			});
		`;
		expect(names(source)).toEqual(["cart", "orders"]);
	});

	test("an unbalanced source still yields what it can", () => {
		// A truncated file should degrade to a partial read rather than reporting
		// no resources at all, which would look like a bindle declaring nothing.
		const source = `
			const b = bindle("shop");
			export default () => {
				return { cart: b.kv(), orders: b.data()
		`;
		expect(names(source)).toEqual(["cart", "orders"]);
	});

	test("a returned object with no resources yields none", () => {
		const source = `
			const b = bindle("shop");
			export default () => ({ version: 1 });
		`;
		expect(inspectBindleSource(source).resources).toEqual([]);
	});
});

describe("the factory-call fallback", () => {
	test("resources are inferred when nothing is returned", () => {
		// A file that configures resources without returning them still declares
		// them; missing these would leave the app's dependencies unprovisioned.
		const source = `
			const b = bindle("shop");
			b.kv();
			b.bucket();
		`;
		expect(kinds(source)).toEqual(["kv", "bucket"]);
	});

	test("repeated kinds get distinguishing names", () => {
		// Two unnamed buckets are two buckets. Collapsing them would provision
		// one and leave the app writing to a store that does not exist.
		const source = `
			const b = bindle("shop");
			b.bucket();
			b.bucket();
			b.bucket();
		`;
		expect(names(source)).toEqual(["bucket", "bucket-2", "bucket-3"]);
	});

	test("the fallback is used only when the returned object yields nothing", () => {
		// Otherwise a file that both configures and returns would double-count
		// every resource.
		const source = `
			const b = bindle("shop");
			const store = b.kv();
			export default () => ({ store });
		`;
		expect(names(source)).toEqual(["store"]);
	});

	test("method calls that are not resource kinds are ignored", () => {
		const source = `
			const b = bindle("shop");
			b.configure();
			b.use();
			b.kv();
		`;
		expect(kinds(source)).toEqual(["kv"]);
	});

	test("an empty source yields no resources and does not throw", () => {
		expect(inspectBindleSource("").resources).toEqual([]);
	});
});

describe("environment keys", () => {
	test("upper-case keys are read from an env block", () => {
		const source = `
			const b = bindle("shop");
			b.env({ DATABASE_URL: "", API_KEY: "" });
		`;
		expect(inspectBindleSource(source).envKeys).toEqual([
			"DATABASE_URL",
			"API_KEY",
		]);
	});

	test("keys with digits and underscores are read", () => {
		const source = 'b.env({ S3_BUCKET_2: "", X: "" })';
		expect(inspectBindleSource(source).envKeys).toEqual(["S3_BUCKET_2", "X"]);
	});

	test("lower-case keys are not treated as environment variables", () => {
		// Convention is SCREAMING_CASE; matching anything would pull in ordinary
		// option keys and present them to the user as required configuration.
		const source = 'b.env({ timeout: 5, DATABASE_URL: "" })';
		expect(inspectBindleSource(source).envKeys).toEqual(["DATABASE_URL"]);
	});

	test("a source with no env block has no keys", () => {
		expect(inspectBindleSource('bindle("shop")').envKeys).toEqual([]);
	});

	test("an empty env block has no keys", () => {
		expect(inspectBindleSource("b.env({})").envKeys).toEqual([]);
	});
});

describe("requirement inference", () => {
	test("http-serving kinds require a managed runtime", () => {
		// This is what a Yard is matched against; a missing requirement means a
		// deployment lands somewhere that cannot serve the app at all.
		for (const kind of ["api", "web", "service"]) {
			expect(
				inspectBindleSource(`const b = bindle("x"); b.${kind}();`).requirements,
			).toContain("managed-http-runtime");
		}
	});

	test("storage kinds map to their capabilities", () => {
		const cases: Array<[string, string]> = [
			["kv", "key-value"],
			["bucket", "object-store"],
			["data", "data"],
			["queue", "queue"],
			["topic", "topic"],
			["secret", "secrets"],
		];
		for (const [kind, requirement] of cases) {
			expect(
				inspectBindleSource(`const b = bindle("x"); b.${kind}();`).requirements,
			).toContain(requirement);
		}
	});

	test("requirements are deduplicated across several resources", () => {
		// Three buckets need object storage once, not three times.
		const source = `
			const b = bindle("x");
			b.bucket();
			b.bucket();
			b.api();
			b.web();
		`;
		const requirements = inspectBindleSource(source).requirements;
		expect(requirements).toEqual([...new Set(requirements)]);
		expect(
			requirements.filter((r) => r === "managed-http-runtime"),
		).toHaveLength(1);
	});

	test("a kind with no capability adds no requirement", () => {
		expect(
			inspectBindleSource('const b = bindle("x"); b.flag();').requirements,
		).toEqual([]);
	});

	test("no resources means no requirements", () => {
		expect(inspectBindleSource('bindle("x")').requirements).toEqual([]);
	});
});

describe("deduplication", () => {
	test("the same kind and name is recorded once", () => {
		const source = `
			const b = bindle("x");
			export default () => ({ store: b.kv(), store: b.kv() });
		`;
		expect(inspectBindleSource(source).resources).toHaveLength(1);
	});

	test("the same name under different kinds is kept separately", () => {
		// They are genuinely different resources that happen to share a label.
		const source = `
			const b = bindle("x");
			const a = b.kv();
			const c = b.bucket();
			export default () => ({ main: a, other: c });
		`;
		expect(inspectBindleSource(source).resources).toHaveLength(2);
	});
});

describe("inspecting a project directory", () => {
	test("a JSON declaration is read in preference to source", () => {
		// The JSON is generated output and authoritative; the source is a
		// best-effort parse, so preferring it would discard better information.
		const dir = projectDir({
			"hobo.bindle.json": JSON.stringify({
				name: "from-json",
				resources: { cart: { kind: "kv" } },
			}),
			"src/bindle.ts": 'const b = bindle("from-source"); b.bucket();',
		});
		const inspected = inspectBindleProject(dir);
		expect(inspected?.name).toBe("from-json");
		expect(inspected?.resources.map((r) => r.kind)).toEqual(["kv"]);
	});

	test("malformed JSON falls through to the source rather than failing", () => {
		// A half-written generated file must not make the project uninspectable.
		const dir = projectDir({
			"hobo.bindle.json": "{ not valid json",
			"src/bindle.ts": 'const b = bindle("from-source"); b.bucket();',
		});
		expect(inspectBindleProject(dir)?.name).toBe("from-source");
	});

	test("the source candidates are tried in order", () => {
		// TypeScript source first, then compiled output — the source is closer to
		// what the developer wrote and more likely to be current.
		const dir = projectDir({
			"src/bindle.ts": 'const b = bindle("ts"); b.kv();',
			"dist/bindle.js": 'const b = bindle("dist"); b.bucket();',
		});
		expect(inspectBindleProject(dir)?.name).toBe("ts");
	});

	test("a compiled bindle is read when no source is present", () => {
		const dir = projectDir({
			"dist/bindle.js": 'const b = bindle("dist"); b.bucket();',
		});
		expect(inspectBindleProject(dir)?.name).toBe("dist");
	});

	test("a project with nothing to inspect yields undefined", () => {
		// Distinct from an empty bindle: there is no declaration here at all, and
		// the caller needs to tell those apart.
		expect(inspectBindleProject(projectDir())).toBeUndefined();
	});

	test("the directory name is used as the fallback bindle name", () => {
		const dir = projectDir({ "src/bindle.ts": "b.kv();" });
		const inspected = inspectBindleProject(dir);
		expect(inspected?.name).toBe(dir.split(/[/\\]/u).at(-1));
	});

	test("an explicit fallback name overrides the directory name", () => {
		const dir = projectDir({ "src/bindle.ts": "b.kv();" });
		expect(inspectBindleProject(dir, "explicit")?.name).toBe("explicit");
	});
});

describe("the JSON declaration format", () => {
	function fromJson(value: unknown, fallback?: string) {
		const dir = projectDir({ "hobo.bindle.json": JSON.stringify(value) });
		return inspectBindleProject(dir, fallback);
	}

	test("resources are read from the resources map", () => {
		const inspected = fromJson({
			name: "shop",
			resources: {
				cart: { kind: "kv", dependsOn: ["orders"], declaredAllow: ["read"] },
			},
		});
		expect(inspected?.resources[0]).toEqual({
			kind: "kv",
			name: "cart",
			dependsOn: ["orders"],
			allow: ["read"],
		});
	});

	test("the map key supplies the kind and name when the entry omits them", () => {
		// A terse declaration `{ kv: {} }` still names a resource.
		const inspected = fromJson({ name: "shop", resources: { kv: {} } });
		expect(inspected?.resources[0]?.kind).toBe("kv");
		expect(inspected?.resources[0]?.name).toBe("kv");
	});

	test("an explicit name overrides the map key", () => {
		const inspected = fromJson({
			name: "shop",
			resources: { cart: { kind: "kv", name: "sessions" } },
		});
		expect(inspected?.resources[0]?.name).toBe("sessions");
	});

	test("an unrecognised kind is dropped rather than trusted", () => {
		// The kind selects a provisioning path; an unknown one has none, and
		// carrying it forward would fail far from the declaration.
		const inspected = fromJson({
			name: "shop",
			resources: { good: { kind: "kv" }, bad: { kind: "quantum-flux" } },
		});
		expect(inspected?.resources.map((r) => r.name)).toEqual(["good"]);
	});

	test("non-string entries in dependsOn and declaredAllow are filtered", () => {
		const inspected = fromJson({
			name: "shop",
			resources: {
				cart: {
					kind: "kv",
					dependsOn: ["a", 42, null],
					declaredAllow: [{}, "read"],
				},
			},
		});
		expect(inspected?.resources[0]?.dependsOn).toEqual(["a"]);
		expect(inspected?.resources[0]?.allow).toEqual(["read"]);
	});

	test("non-array dependsOn and declaredAllow become empty lists", () => {
		const inspected = fromJson({
			name: "shop",
			resources: { cart: { kind: "kv", dependsOn: "a", declaredAllow: 1 } },
		});
		expect(inspected?.resources[0]?.dependsOn).toEqual([]);
		expect(inspected?.resources[0]?.allow).toEqual([]);
	});

	test("a non-object entry still yields a resource keyed by its name", () => {
		const inspected = fromJson({ name: "shop", resources: { kv: "yes" } });
		expect(inspected?.resources[0]?.kind).toBe("kv");
	});

	test("services are read alongside resources", () => {
		const inspected = fromJson({
			name: "shop",
			services: [{ name: "web", kind: "web" }, { name: "backend" }],
		});
		expect(inspected?.resources.map((r) => [r.name, r.kind])).toEqual([
			["web", "web"],
			["backend", "api"],
		]);
	});

	test("a service kind other than web defaults to api", () => {
		const inspected = fromJson({
			name: "shop",
			services: [{ name: "s", kind: "something-else" }],
		});
		expect(inspected?.resources[0]?.kind).toBe("api");
	});

	test("a service is skipped when a resource already claims its name", () => {
		// Otherwise the same thing appears twice on the occupancy board, once
		// from each section of the file.
		const inspected = fromJson({
			name: "shop",
			resources: { web: { kind: "web" } },
			services: [{ name: "web", kind: "web" }],
		});
		expect(inspected?.resources).toHaveLength(1);
	});

	test("a malformed service entry is skipped", () => {
		const inspected = fromJson({
			name: "shop",
			services: [null, "text", { name: "ok" }],
		});
		expect(inspected?.resources.map((r) => r.name)).toEqual(["ok"]);
	});

	test("services drive requirement inference too", () => {
		const inspected = fromJson({ name: "shop", services: [{ name: "api" }] });
		expect(inspected?.requirements).toContain("managed-http-runtime");
	});

	test("a JSON file with a name but no resources is still a declaration", () => {
		// It names the app, which is more than nothing — the fallback path is
		// only taken when the file says nothing useful at all.
		const inspected = fromJson({ name: "named-only" });
		expect(inspected?.name).toBe("named-only");
		expect(inspected?.resources).toEqual([]);
	});

	test("a JSON file with neither a name nor resources falls through", () => {
		// Nothing to learn from it, so the source path gets a chance.
		const dir = projectDir({
			"hobo.bindle.json": JSON.stringify({}),
			"src/bindle.ts": 'const b = bindle("from-source"); b.kv();',
		});
		expect(inspectBindleProject(dir)?.name).toBe("from-source");
	});

	test("a JSON array or scalar is not a declaration", () => {
		for (const value of [[], "text", 42, null]) {
			const dir = projectDir({
				"hobo.bindle.json": JSON.stringify(value),
				"src/bindle.ts": 'const b = bindle("from-source"); b.kv();',
			});
			expect(inspectBindleProject(dir)?.name).toBe("from-source");
		}
	});

	test("the JSON path reports no env keys", () => {
		// Environment is declared in source, not in the generated JSON; claiming
		// otherwise would tell a user their configuration was empty.
		expect(fromJson({ name: "shop", resources: { kv: {} } })?.envKeys).toEqual(
			[],
		);
	});
});
