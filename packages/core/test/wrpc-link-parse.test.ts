import { describe, expect, it } from "vitest";

import { parseWireVersion, parseWrpcInterfaceId } from "../src/ports/wrpc-link.js";

describe("wrpc-link parse constructors", () => {
	it("parseWireVersion accepts valid semver", () => {
		expect(parseWireVersion("1.2.3")).toEqual({
			raw: "1.2.3",
			major: 1,
			minor: 2,
			patch: 3,
		});
		expect(parseWireVersion("1.2.3-rc.1").raw).toBe("1.2.3-rc.1");
	});

	it("parseWireVersion rejects malformed semver", () => {
		expect(() => parseWireVersion("1.2")).toThrow(/invalid_semver/);
		expect(() => parseWireVersion("v1.2.3")).toThrow(/invalid_semver/);
		expect(() => parseWireVersion("")).toThrow(/invalid_semver/);
	});

	it("parseWrpcInterfaceId accepts versioned WIT interface ids", () => {
		const id = parseWrpcInterfaceId("wasi:keyvalue/store@0.2.0");
		expect(id).toBe("wasi:keyvalue/store@0.2.0");
	});

	it("parseWrpcInterfaceId rejects malformed ids", () => {
		expect(() => parseWrpcInterfaceId("")).toThrow(/interface_id_required/);
		expect(() => parseWrpcInterfaceId("not-an-interface")).toThrow(/invalid_interface_id/);
	});
});
