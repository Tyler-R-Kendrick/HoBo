import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
	NoRouteError,
	ProviderHandlerStore,
	WireVersionIncompatibleError,
	parseWireVersion,
	parseWrpcInterfaceId,
} from "@hobo/core";

import { createInProcessTransport, createWrpcLinkLayer } from "../src/index.js";

const pactPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../contracts/wrpc-membrane.pact.json",
);
const pact = JSON.parse(readFileSync(pactPath, "utf8")) as {
	interactions: Array<{
		description: string;
		request: { body: Record<string, unknown> };
		response: { body: Record<string, unknown> };
	}>;
};

function createLayer(floor: string) {
	const store = new ProviderHandlerStore();
	const transport = createInProcessTransport({ store });
	return createWrpcLinkLayer({ transport, compatibilityFloor: floor, store });
}

describe("wrpc-membrane provider pact", () => {
	it("verifies all wrpc-membrane pact interactions", async () => {
		for (const interaction of pact.interactions) {
			if (interaction.description.includes("establish-link success")) {
				const body = interaction.request.body;
				const iface = parseWrpcInterfaceId(String(body.importInterface));
				const layer = createLayer(String(body.floor));
				layer.registerComponent({
					id: String(body.componentId),
					imports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: (body.callerVersions as string[]).map(parseWireVersion),
						},
					],
				});
				layer.registerProvider({
					id: String(body.providerId),
					exports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: (body.providerVersions as string[]).map(parseWireVersion),
						},
					],
					handlers: { [iface]: { get: () => ({ value: "ok" }) } },
				});

				const link = layer.establishLink({
					componentId: String(body.componentId),
					importInterface: iface,
					providerId: String(body.providerId),
					exportInterface: iface,
				});
				assert.deepEqual(
					{
						negotiatedWire: {
							minor: link.negotiatedWire.minor,
							version: link.negotiatedWire.version,
						},
					},
					interaction.response.body,
				);
				continue;
			}

			if (interaction.description.includes("below-floor")) {
				const body = interaction.request.body;
				const iface = parseWrpcInterfaceId(String(body.importInterface));
				let providerCalls = 0;
				const layer = createLayer(String(body.floor));
				layer.registerComponent({
					id: String(body.componentId),
					imports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: (body.callerVersions as string[]).map(parseWireVersion),
						},
					],
				});
				layer.registerProvider({
					id: String(body.providerId),
					exports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: (body.providerVersions as string[]).map(parseWireVersion),
						},
					],
					handlers: {
						[iface]: {
							get() {
								providerCalls += 1;
								return { value: "never" };
							},
						},
					},
				});

				assert.throws(
					() =>
						layer.establishLink({
							componentId: String(body.componentId),
							importInterface: iface,
							providerId: String(body.providerId),
							exportInterface: iface,
						}),
					(error: unknown) => {
						if (!(error instanceof WireVersionIncompatibleError)) return false;
						assert.deepEqual(
							{
								code: error.code,
								reason: error.reason,
								phase: error.phase,
								floor: error.floor,
								sharedVersions: error.sharedVersions,
							},
							interaction.response.body,
						);
						return true;
					},
				);
				assert.equal(providerCalls, 0);
				continue;
			}

			if (interaction.description.includes("unlinked import")) {
				const body = interaction.request.body;
				const iface = parseWrpcInterfaceId(String(body.importInterface));
				const layer = createLayer("0.2.0");
				layer.registerComponent({
					id: String(body.componentId),
					imports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: [parseWireVersion("0.2.0")],
						},
					],
				});

				await assert.rejects(
					() =>
						layer.callImport(
							String(body.componentId),
							iface,
							String(body.operation),
							body.payload,
						),
					(error: unknown) => {
						if (!(error instanceof NoRouteError)) return false;
						assert.deepEqual({ code: error.code }, interaction.response.body);
						return true;
					},
				);
				continue;
			}

			if (interaction.description.includes("linked call")) {
				const body = interaction.request.body;
				const iface = parseWrpcInterfaceId(String(body.importInterface));
				const layer = createLayer("0.2.0");
				layer.registerComponent({
					id: String(body.componentId),
					imports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: [parseWireVersion("0.2.0")],
						},
					],
				});
				layer.registerProvider({
					id: "local-kv",
					exports: [
						{
							interfaceId: iface,
							stability: "stable",
							versions: [parseWireVersion("0.2.0")],
						},
					],
					handlers: {
						[iface]: {
							get: ({ key }: { key: string }) => ({ value: `stored:${key}` }),
						},
					},
				});
				layer.establishLink({
					componentId: String(body.componentId),
					importInterface: iface,
					providerId: "local-kv",
					exportInterface: iface,
				});

				const result = await layer.callImport(
					String(body.componentId),
					iface,
					String(body.operation),
					body.payload,
					{ deadline: String(body.deadline) },
				);
				const called = layer.events.find((event) => event.type === "link.Called");
				assert.deepEqual(
					{
						result,
						linkCalled: {
							transport: called?.type === "link.Called" ? called.transport : null,
							boundaryMode:
								called?.type === "link.Called" ? called.boundaryMode : null,
							codec: called?.type === "link.Called" ? called.codec : null,
							deadline: called?.type === "link.Called" ? called.deadline : null,
						},
					},
					interaction.response.body,
				);
			}
		}
	});
});
