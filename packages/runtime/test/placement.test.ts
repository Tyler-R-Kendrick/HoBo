import { describe, expect, it } from "vitest";

import type { ActorHost } from "../src/ports.js";
import { resolveActorPlacement } from "../src/placement.js";

function stubHost(label: string): ActorHost {
	return {
		acquire(key) {
			return {
				key,
				holderId: label,
				fenceToken: 1n,
				expiresAt: new Date().toISOString(),
				release() {},
			};
		},
		state() {
			return {
				append: () => ({ streamId: "s", seq: 1, fenceToken: 1n }),
				read: () => ({ streamId: "s", seq: 0, state: {} as never }),
			};
		},
	};
}

describe("resolveActorPlacement", () => {
	const native = stubHost("native");
	const dapr = stubHost("dapr");

	it("defaults to native (ADR-0031)", () => {
		const r = resolveActorPlacement({ nativeHost: native });
		expect(r.mode).toBe("native");
		expect(r.source).toBe("default");
		expect(r.host).toBe(native);
	});

	it("selects dapr from camp runtime requirements", () => {
		const r = resolveActorPlacement({
			nativeHost: native,
			daprHost: dapr,
			campRuntimeRequirements: ["dapr"],
		});
		expect(r.mode).toBe("dapr");
		expect(r.host).toBe(dapr);
		expect(r.source).toBe("camp-runtime");
	});

	it("explicit native wins over camp dapr", () => {
		const r = resolveActorPlacement({
			explicit: "native",
			nativeHost: native,
			daprHost: dapr,
			campRuntimeRequirements: ["dapr"],
		});
		expect(r.mode).toBe("native");
	});

	it("fails closed when dapr required but host missing", () => {
		expect(() =>
			resolveActorPlacement({
				nativeHost: native,
				campRuntimeRequirements: ["dapr"],
			}),
		).toThrow(/Dapr ActorHost/);
	});
});
