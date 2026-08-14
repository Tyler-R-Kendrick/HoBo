import { describe, expect, it } from "vitest";

import {
	assertNoWaitTrue,
	createRivetRuntimeHost,
	HOBO_RUNTIME_RIVET_PACKAGE,
	RIVET_ENGINE_PIN,
	RIVET_RESOLVER_PROFILES,
	RIVETKIT_PIN,
	rivetEngineImageRef,
	rivetStreamId,
} from "../src/index.js";

const identity = {
	tenantId: "acme",
	projectId: "shop",
	actorTypeId: "Cart",
	keySegments: ["user-1"],
	schemaVersion: 1,
};

describe("@hobo/runtime-rivet", () => {
	it("package id and grammar-legal profiles", () => {
		expect(HOBO_RUNTIME_RIVET_PACKAGE).toBe("@hobo/runtime-rivet");
		expect(RIVET_RESOLVER_PROFILES[0]).toBe("kv.durable-object/v1");
		expect(RIVET_RESOLVER_PROFILES.some((id) => id.startsWith("actor."))).toBe(
			false,
		);
		expect(RIVETKIT_PIN.version).toBe("2.3.10");
		expect(RIVET_ENGINE_PIN.tag).toBe("2.3.10");
		expect(rivetEngineImageRef()).toContain("@sha256:");
	});

	it("ensure reports rivet kind and local-sqlite fidelity offline", async () => {
		const bundle = createRivetRuntimeHost({ tenantId: "t1", campId: "c1" });
		expect(bundle.host.kind).toBe("rivet");
		const result = await bundle.host.ensure({ hoboHome: "/tmp", env: {} });
		expect(result.kind).toBe("rivet");
		expect(result.details.placementMode).toBe("rivet");
		expect(result.details.fidelity).toBe("local-sqlite");
		expect(result.details.secretless).toBe(true);
		bundle.journal.close();
	});

	it("actor host enforces single-writer and durable accept-before-ack", () => {
		const bundle = createRivetRuntimeHost({ tenantId: "acme", campId: "shop" });
		const host = bundle.actors;
		const lease = host.acquire("Cart/1", { holderId: "a" });
		expect(lease.placement).toBe("rivet");
		expect(() => host.acquire("Cart/1", { holderId: "b" })).toThrow(
			/placement conflict/,
		);
		const accepted = host.accept({
			identity,
			commandId: "cmd-1",
			commandType: "addItem",
			payload: { sku: "hat" },
			expectedRevision: 0,
		});
		expect(accepted.status).toBe("persisted");
		expect(accepted.duplicate).toBe(false);
		const processed = host.processNext(
			identity,
			(state, event) => {
				const items = (state as { items: string[] }).items;
				if (event.type === "addItem") {
					return { items: [...items, (event.payload as { sku: string }).sku] };
				}
				return state;
			},
			{ items: [] },
		);
		expect(processed?.revision).toBe(1);
		const again = host.accept({
			identity,
			commandId: "cmd-1",
			commandType: "addItem",
			payload: { sku: "hat" },
			expectedRevision: 0,
		});
		expect(again.duplicate).toBe(true);
		expect(rivetStreamId(identity)).toContain("hobo/acme/shop/Cart/user-1");
		expect(() => assertNoWaitTrue({ wait: true })).toThrow(/wait:true/);
		lease.release();
		bundle.journal.close();
	});

	it("refuses secret material in runtime config", () => {
		expect(() =>
			createRivetRuntimeHost({
				tenantId: "t",
				campId: "c",
				mode: "not-a-mode",
			}),
		).toThrow(/runtime mode/);
	});
});
