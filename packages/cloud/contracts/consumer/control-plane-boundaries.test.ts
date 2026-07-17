import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import type { EventEnvelope } from "@hobo/core";
import { createInMemoryActorHost } from "@hobo/data";
import { parseManifest, type ManifestV1 } from "@hobo/bindles";
import { createCloudflareProvider } from "@hobo/provider-cloudflare";
import {
	createManualClock,
	createRuntimeLocalEventStore,
	type RuntimeLocalEventStore,
} from "@hobo/runtime-local";

import {
	createRegistryFromProviders,
	deploy,
	deploymentStreamId,
	deploymentViewProjection,
	hashDeploymentPlan,
	lowerManifest,
	matchResource,
	plan,
	type GatewayDeps,
	type ResourceIntent,
} from "../../src/index.js";

// Consumer contracts (control-plane.md service boundaries): the Yard kernel is
// the ControlPlaneReferenceApp consumer of the lifted epic pacts. Each test
// verifies our side honors the documented boundary schema.

const packageRoot = dirname(fileURLToPath(import.meta.url));
function loadPact(name: string) {
	return JSON.parse(readFileSync(join(packageRoot, "../pacts/", name), "utf8"));
}

const fixturesDir = join(packageRoot, "../../test/fixtures");
function helloBindle(): ManifestV1 {
	return parseManifest(
		JSON.parse(readFileSync(join(fixturesDir, "hello-bindle.manifest.json"), "utf8")),
	);
}
function registry() {
	return createRegistryFromProviders([createCloudflareProvider()]);
}

let stores: RuntimeLocalEventStore[] = [];
function freshStore(): RuntimeLocalEventStore {
	const dir = mkdtempSync(join(tmpdir(), "hobo-cloud-pact-"));
	const s = createRuntimeLocalEventStore({ dataDir: dir, clock: createManualClock() });
	stores.push(s);
	return s;
}
afterEach(() => {
	for (const s of stores) s.close();
	stores = [];
});
const actor = { kind: "user", id: "operator-1" } as const;
function deps(store: RuntimeLocalEventStore): GatewayDeps {
	return { store, actorHost: createInMemoryActorHost(), registry: registry() };
}

describe("ManifestIrCollector boundary (consumer contract)", () => {
	it("collects manifest resources + bind-edge links (step 0/1 lowering)", () => {
		const pact = loadPact("manifest-ir-collector.pact.json");
		expect(pact.provider.name).toBe("ManifestIrCollector");
		const body = pact.interactions[0].response.body;

		const intents = lowerManifest(helloBindle());
		const resources = intents.map((i) => i.name);
		const links = intents.flatMap((i) => i.deps.map((dep) => [dep, i.name]));

		// Same shape the boundary documents: a resource list + directed links.
		expect(Object.keys(body).sort()).toEqual(["links", "resources"]);
		expect(resources.length).toBeGreaterThan(0);
		expect(resources).toEqual(["assets", "service", "sessions"]);
		expect(links).toContainEqual(["assets", "service"]);
	});
});

describe("ResourceDefinitionCatalog boundary (consumer contract)", () => {
	it("returns a stable catalog snapshot + a matching winner", () => {
		const pact = loadPact("resource-definition-catalog.pact.json");
		expect(pact.provider.name).toBe("ResourceDefinitionCatalog");
		const body = pact.interactions[0].response.body;
		expect(Object.keys(body).sort()).toEqual(["candidates", "catalogHash", "winner"]);

		const reg = registry();
		const intent: ResourceIntent = {
			name: "service",
			port: "compute",
			require: ["http"],
			prefer: [],
			negotiation: "require",
			deps: [],
			objective: "min-cost",
		};
		const outcome = matchResource(intent, reg);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.decision.catalogHash).toBe(reg.catalogHash);
		expect(outcome.decision.winner).toBe("@hobo/provider-cloudflare.compute");
	});
});

describe("CapabilityRegistry boundary (consumer contract)", () => {
	it("rejects an unsatisfiable require with a remediation code", () => {
		const pact = loadPact("capability-registry.pact.json");
		expect(pact.provider.name).toBe("CapabilityRegistry");
		const body = pact.interactions[0].response.body;
		expect(body.decision).toBe("reject");

		const intent: ResourceIntent = {
			name: "checkout-api",
			port: "compute",
			require: ["gpu"],
			prefer: [],
			negotiation: "require",
			deps: [],
			objective: "min-cost",
		};
		const outcome = matchResource(intent, registry());
		expect(outcome.ok).toBe(false);
		if (outcome.ok) return;
		expect(outcome.remediation.code).toBe(body.code);
		expect(outcome.remediation.remediation).toContain("prefer");
	});
});

describe("EventStoreActorHost boundary (consumer contract)", () => {
	it("appends control-plane facts under a single-writer lease", async () => {
		const pact = loadPact("eventstore-actorhost.pact.json");
		expect(pact.provider.name).toBe("EventStoreActorHost");
		expect(pact.interactions[0].response.body.lease).toBe("single-writer");

		const store = freshStore();
		const result = await deploy(
			deps(store),
			{ deploymentId: "cp-1", bindle: helloBindle() },
			{ tenant: "t", actor },
		);
		expect(result.status).toBe("planned");

		const events: EventEnvelope[] = [];
		for await (const e of store.read(deploymentStreamId("cp-1"))) events.push(e);
		expect(events[0]?.type).toBe("deployment.Requested");
		// Per-stream monotonic seq is the single-writer guarantee.
		expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
	});
});

describe("DeploymentSetStore boundary (consumer contract)", () => {
	it("content-addresses the plan as an immutable set ref", () => {
		const pact = loadPact("deployment-set-store.pact.json");
		expect(pact.provider.name).toBe("DeploymentSetStore");
		expect(pact.interactions[0].response.body.appliedSetRef).toMatch(/^set:.*@sha256:/);

		const result = plan(helloBindle(), { deploymentId: "cp-1" }, registry());
		if (!result.ok) throw new Error("expected plan");
		const setRef = `set:cp-1@${hashDeploymentPlan(result.plan)}`;
		expect(setRef).toMatch(/^set:cp-1@sha256:[a-f0-9]{64}$/);
	});
});

describe("DeploymentViewProjection boundary (consumer contract)", () => {
	it("reconstructs the deployment graph from the log", async () => {
		const pact = loadPact("deployment-view-projection.pact.json");
		expect(pact.provider.name).toBe("DeploymentViewProjection");
		const body = pact.interactions[0].response.body;
		expect(body.correlationComplete).toBe(true);

		const store = freshStore();
		await deploy(
			deps(store),
			{ deploymentId: "cp-2", bindle: helloBindle() },
			{ tenant: "t", actor, correlationId: "deploy:cp-2" },
		);
		const view = await deploymentViewProjection.rebuildFromZero(
			store,
			deploymentStreamId("cp-2"),
		);
		const row = deploymentViewProjection.get(view, "cp-2");
		// Graph reconstructed: requested -> decided(xN) -> planned, no gaps.
		expect(row?.status).toBe("planned");
		expect(row?.decisions.length).toBe(3);
		expect(body.missingEvents).toEqual([]);
	});
});
