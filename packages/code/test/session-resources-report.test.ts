/**
 * The resources report, and the `--kind` filter that narrows it.
 *
 * `session-resources.test.ts` assembles a real inventory from a real station
 * and checks the whole pipeline. This drives the two pure functions at the end
 * of it — the text renderer and the filter — over inventories built by hand, so
 * every conditional section can be turned on and off directly rather than
 * reached through whatever a fixture station happens to contain.
 *
 * The report is a nested outline, and almost all of it is optional. What it
 * commits to:
 *
 * **A logged-out inventory renders two lines and no topology.** Not an empty
 * outline — a reason and the command that fixes it. An empty tree would read
 * as "you have nothing", which is a different and alarming claim.
 *
 * **A section header only appears when it has rows under it.** `endpoints`,
 * `capabilities`, `missing` and `bindle endpoints` are each printed only when
 * non-empty, because a header with nothing beneath it reads as a thing that
 * failed to load.
 *
 * **Station occupancy endpoints and bindle endpoints are separated.** They live
 * in one list on the record and split into two sections in the report, because
 * they answer different questions — "is the platform up" versus "is my app
 * reachable" — and mixing them buries the second in the first.
 *
 * **A bindle nested under its camp is not printed twice.** The outline walks
 * camps and prints their bindles indented; a bindle already shown that way is
 * skipped in the flat pass, so a reader counting bindles gets the real number.
 *
 * The filter's rule is narrower and stricter: **`--kind` keeps the scope and
 * drops everything that is not that kind**, so a filtered inventory is still a
 * valid inventory rather than a partially-blanked one.
 */
import { describe, expect, it } from "vitest";

import {
	filterSessionResources,
	formatSessionResources,
	SESSION_RESOURCES_SCHEMA,
	type SessionResourceInventory,
} from "../src/session-resources.js";

type Patch = Partial<SessionResourceInventory>;

const node = (id: string, patch: Record<string, unknown> = {}) =>
	// SAFETY: the fixture is the topology-node shape the renderer reads.
	({
		id,
		kind: id.split(":")[0] ?? "station",
		name: id.split(":")[1] ?? id,
		status: "declared",
		environment: "local-dev",
		...patch,
	}) as never;

const endpoint = (resourceName: string, patch: Record<string, unknown> = {}) =>
	// SAFETY: the fixture is the endpoint-row shape the renderer reads.
	({
		resourceName,
		backendUrl: "http://127.0.0.1:8080/",
		preferredUrl: "",
		namedUrl: "",
		freshness: "live",
		status: "serving",
		...patch,
	}) as never;

const inventory = (patch: Patch = {}): SessionResourceInventory =>
	// SAFETY: the fixture is the inventory shape both functions are declared over.
	({
		ok: true,
		code: "HOBO_CODE_RESOURCES",
		message: "station:local",
		schema: SESSION_RESOURCES_SCHEMA,
		scope: {
			stationId: "station:local",
			tenant: "camp-west",
			environment: "local-dev",
		},
		peers: [],
		junctions: [],
		yards: [],
		camps: [],
		bindles: [],
		endpoints: [],
		missing: [],
		capabilities: [],
		managed: [],
		...patch,
	}) as SessionResourceInventory;

const report = (patch: Patch = {}) => formatSessionResources(inventory(patch));

describe("a logged-out inventory", () => {
	const out = () => report({ ok: false, message: "run: hobo-code auth login" });

	it("renders two lines and nothing else", () => {
		// Not an empty outline. "You have nothing" is a different and more
		// alarming claim than "you are not logged in".
		expect(out().split("\n")).toHaveLength(2);
	});

	it("marks the session as logged out", () => {
		expect(out()).toContain("auth:out");
	});

	it("carries the remediation as the next step", () => {
		expect(out()).toContain("hobo-code auth login");
	});

	it("prints no topology even when the record carries some", () => {
		// The record may still hold a stale tree; a refusal must not render it
		// as if it were current.
		expect(
			formatSessionResources(
				inventory({ ok: false, message: "no", station: node("station:local") }),
			),
		).not.toContain("station:local");
	});
});

describe("the header", () => {
	it("leads with the message", () => {
		expect(report().split("\n")[0]).toContain("station:local");
	});

	it("names the environment", () => {
		expect(report()).toContain("local-dev");
	});

	it("names the tenant", () => {
		expect(report()).toContain("camp-west");
	});
});

describe("the station section", () => {
	it("prints the station when there is one", () => {
		expect(report({ station: node("station:local") })).toContain(
			"station:local",
		);
	});

	it("prints nothing station-shaped when there is none", () => {
		expect(report()).not.toContain("endpoints");
	});

	it("nests the station's own managed resources under it", () => {
		expect(
			report({
				station: node("station:local"),
				managed: [
					// SAFETY: the fixture is the managed-resource shape the renderer reads.
					{
						id: "evals",
						kind: "sidecar",
						ownerKind: "station",
						ownerId: "station:local",
						enabled: true,
					} as never,
				],
			}),
		).toContain("evals");
	});

	it("leaves another owner's managed resources out of the station block", () => {
		// The outline is ownership; a sidecar owned by a camp belongs under
		// that camp, not under the station that happens to host it.
		expect(
			report({
				station: node("station:local"),
				managed: [
					// SAFETY: the fixture is the managed-resource shape the renderer reads.
					{
						id: "evals",
						kind: "sidecar",
						ownerKind: "camp",
						ownerId: "camp:code",
						enabled: true,
					} as never,
				],
			}),
		).not.toContain("evals");
	});
});

describe("endpoint sections", () => {
	it("prints station occupancy endpoints under the station", () => {
		expect(
			report({
				station: node("station:local"),
				endpoints: [endpoint("dashboard")],
			}),
		).toContain("dashboard");
	});

	it("heads that section only when it has rows", () => {
		// A header with nothing beneath it reads as a thing that failed to
		// load rather than a thing that is empty.
		expect(report({ station: node("station:local") })).not.toContain(
			"   endpoints",
		);
	});

	it("keeps bindle endpoints in their own section", () => {
		// One list on the record, two sections in the report: "is the platform
		// up" and "is my app reachable" are different questions, and mixing
		// them buries the second in the first.
		const out = report({
			station: node("station:local"),
			endpoints: [endpoint("dashboard"), endpoint("web")],
		});
		expect(out).toContain(" bindle endpoints");
		expect(out.indexOf("   endpoints")).toBeLessThan(
			out.indexOf(" bindle endpoints"),
		);
	});

	it("omits the bindle section when every endpoint is a station one", () => {
		expect(
			report({
				station: node("station:local"),
				endpoints: [endpoint("dashboard")],
			}),
		).not.toContain("bindle endpoints");
	});

	it("prints bindle endpoints with no station at all", () => {
		expect(report({ endpoints: [endpoint("web")] })).toContain(
			"bindle endpoints",
		);
	});

	it("shows the freshness of a bindle endpoint", () => {
		expect(
			report({ endpoints: [endpoint("web", { freshness: "last-seen:x" })] }),
		).toContain("last-seen:x");
	});

	it("appends the reason an endpoint could not be resolved", () => {
		// A URL with no explanation beside it invites a reader to try it; the
		// reason is what turns a dead link into a diagnosis.
		expect(
			report({
				endpoints: [
					endpoint("web", { unresolvedReason: "no DNS for web.app.local" }),
				],
			}),
		).toContain("no DNS for web.app.local");
	});

	it("says nothing extra when an endpoint resolved cleanly", () => {
		expect(report({ endpoints: [endpoint("web")] })).not.toContain("  no ");
	});

	it("prefers the preferred url over the named one", () => {
		expect(
			report({
				endpoints: [
					endpoint("web", {
						preferredUrl: "https://preferred/",
						namedUrl: "https://named/",
					}),
				],
			}),
		).toContain("https://preferred/");
	});

	it("falls back to the named url", () => {
		expect(
			report({ endpoints: [endpoint("web", { namedUrl: "https://named/" })] }),
		).toContain("https://named/");
	});

	it("falls back to the backend url when there is neither", () => {
		expect(
			report({
				endpoints: [endpoint("web", { backendUrl: "http://127.0.0.1:9/" })],
			}),
		).toMatch(/127\.0\.0\.1:9|web\./u);
	});
});

describe("capabilities", () => {
	const caps = (rows: readonly unknown[]) =>
		report({ station: node("station:local"), capabilities: rows as never });

	it("heads the section when there are any", () => {
		expect(caps([{ kind: "web", available: true }])).toContain("capabilities");
	});

	it("omits it when there are none", () => {
		expect(report({ station: node("station:local") })).not.toContain(
			"capabilities",
		);
	});

	it("marks an available capability", () => {
		expect(caps([{ kind: "web", available: true }])).toContain("available");
	});

	it("marks an unavailable one as unavailable, not as missing", () => {
		// The distinction the column exists for: a capability the platform
		// knows about and cannot offer here is not the same as one it has
		// never heard of.
		expect(caps([{ kind: "container", available: false }])).toContain(
			"unavailable",
		);
	});
});

describe("the camp and its bindles", () => {
	it("prints the camp config when there is one", () => {
		expect(
			report({
				// SAFETY: the fixture is the camp-config shape the renderer reads.
				camp: { name: "code", require: ["web", "kv"] } as never,
			}),
		).toContain("code");
	});

	it("lists what the camp requires", () => {
		expect(
			report({
				// SAFETY: the fixture is the camp-config shape the renderer reads.
				camp: { name: "code", require: ["web", "kv"] } as never,
			}),
		).toContain("web,kv");
	});

	it("prints an em dash for a camp that requires nothing", () => {
		// An empty list rendered as nothing at all would look like a truncated
		// line rather than a camp with no requirements.
		expect(
			report({
				// SAFETY: the fixture is the camp-config shape the renderer reads.
				camp: { name: "code", require: [] } as never,
			}),
		).toContain("—");
	});

	it("nests a bindle under the camp that owns it", () => {
		const out = report({
			camps: [node("camp:code")],
			bindles: [node("bindle:app", { parentId: "camp:code" })],
		});
		expect(out).toContain("bindle:app");
	});

	it("does not print a nested bindle twice", () => {
		// A reader counting bindles has to get the real number.
		const out = report({
			camps: [node("camp:code")],
			bindles: [node("bindle:app", { parentId: "camp:code" })],
		});
		expect(out.split("bindle:app").length - 1).toBe(1);
	});

	it("prints an orphan bindle at the top level", () => {
		expect(report({ bindles: [node("bindle:loose")] })).toContain(
			"bindle:loose",
		);
	});

	it("prints a bindle whose parent camp is not in the inventory", () => {
		// Filtered views drop the camp but keep the bindle; hiding it would
		// make the bindle vanish from a report that was asked for it.
		expect(
			report({ bindles: [node("bindle:app", { parentId: "camp:absent" })] }),
		).toContain("bindle:app");
	});
});

describe("the missing section", () => {
	it("heads it when a layer is missing", () => {
		expect(
			report({
				// SAFETY: the fixture is the missing-layer shape the renderer reads.
				missing: [{ kind: "junction", reason: "none declared" }] as never,
			}),
		).toContain("missing");
	});

	it("gives the reason, not just the layer", () => {
		// "junction" alone tells a reader what is absent but not what to do.
		expect(
			report({
				// SAFETY: the fixture is the missing-layer shape the renderer reads.
				missing: [{ kind: "junction", reason: "none declared" }] as never,
			}),
		).toContain("none declared");
	});

	it("omits the section when nothing is missing", () => {
		expect(report()).not.toContain(" missing");
	});
});

describe("peers, junctions and yards", () => {
	it("prints peers", () => {
		expect(report({ peers: [node("station:west")] })).toContain("station:west");
	});

	it("prints junctions", () => {
		expect(report({ junctions: [node("junction:a")] })).toContain("junction:a");
	});

	it("prints yards", () => {
		expect(report({ yards: [node("yard:local")] })).toContain("yard:local");
	});
});

describe("narrowing by kind", () => {
	const full = () =>
		inventory({
			station: node("station:local"),
			peers: [node("station:west")],
			junctions: [node("junction:a")],
			yards: [node("yard:local")],
			camps: [node("camp:code")],
			bindles: [node("bindle:app")],
			endpoints: [endpoint("web")],
			// SAFETY: the fixtures are the shapes the filter carries through.
			missing: [{ kind: "junction", reason: "none" }] as never,
			managed: [
				{
					id: "evals",
					kind: "sidecar",
					ownerKind: "camp",
					ownerId: "camp:code",
					enabled: true,
				},
			] as never,
		});

	it("keeps the scope whatever the kind", () => {
		// A filtered inventory is still an inventory: the scope says which
		// station and environment it describes, and dropping it would make the
		// result unattributable.
		expect(filterSessionResources(full(), "yard").scope.tenant).toBe(
			"camp-west",
		);
	});

	it("keeps ok and the code", () => {
		const filtered = filterSessionResources(full(), "yard");
		expect(filtered.ok).toBe(true);
		expect(filtered.code).toBe("HOBO_CODE_RESOURCES");
	});

	it("keeps the station only for the station kind", () => {
		expect(filterSessionResources(full(), "station").station).toBeDefined();
		expect(filterSessionResources(full(), "yard").station).toBeUndefined();
	});

	it("keeps peers with the station", () => {
		// Peers are other stations; they belong to the station view or nowhere.
		expect(filterSessionResources(full(), "station").peers).toHaveLength(1);
		expect(filterSessionResources(full(), "yard").peers).toEqual([]);
	});

	it.each([
		["junction", "junctions"],
		["yard", "yards"],
		["camp", "camps"],
		["bindle", "bindles"],
	] as const)("keeps only %s rows for that kind", (kind, field) => {
		const filtered = filterSessionResources(full(), kind);
		expect(filtered[field]).toHaveLength(1);
	});

	it("drops the other kinds' rows", () => {
		const filtered = filterSessionResources(full(), "yard");
		expect(filtered.junctions).toEqual([]);
		expect(filtered.camps).toEqual([]);
		expect(filtered.bindles).toEqual([]);
	});

	it("keeps endpoints only with the bindles they belong to", () => {
		// An endpoint without its bindle is a URL with no owner in the view.
		expect(filterSessionResources(full(), "bindle").endpoints).toHaveLength(1);
		expect(filterSessionResources(full(), "yard").endpoints).toEqual([]);
	});

	it("keeps capabilities in every view", () => {
		// Capabilities describe the whole session rather than one layer of it.
		expect(
			filterSessionResources(
				inventory({
					capabilities: [{ kind: "web", available: true }] as never,
				}),
				"yard",
			).capabilities,
		).toHaveLength(1);
	});

	it("keeps managed resources owned by the kind asked for", () => {
		expect(filterSessionResources(full(), "camp").managed).toHaveLength(1);
	});

	it("drops managed resources owned by another kind", () => {
		expect(filterSessionResources(full(), "yard").managed).toEqual([]);
	});

	it("keeps only the missing layers of that kind", () => {
		expect(filterSessionResources(full(), "junction").missing).toHaveLength(1);
		expect(filterSessionResources(full(), "yard").missing).toEqual([]);
	});

	it("carries the camp config through every view", () => {
		expect(
			filterSessionResources(
				// SAFETY: the fixture is the camp-config shape the filter carries.
				inventory({ camp: { name: "code", require: [] } as never }),
				"yard",
			).camp,
		).toBeDefined();
	});

	it("omits the camp config when there was none", () => {
		expect(filterSessionResources(inventory(), "yard").camp).toBeUndefined();
	});

	it("renders a filtered inventory as a report", () => {
		// The two functions compose: `--kind yard` is a filter followed by the
		// same renderer, so the narrowed record has to survive it.
		expect(
			formatSessionResources(filterSessionResources(full(), "yard")),
		).toContain("yard:local");
	});
});
