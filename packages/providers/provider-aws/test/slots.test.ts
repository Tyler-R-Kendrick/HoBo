import type { SlotBindingError } from "@hobo/core";
import { describe, expect, it } from "vitest";

import {
	dynamodb,
	eks,
	lambda,
	rds,
	type S3Options,
	s3,
	sqs,
} from "../src/index.js";

/** The code core refused a call with, or undefined if it did not refuse. */
function refusalCode(call: () => unknown): string | undefined {
	try {
		call();
		return undefined;
	} catch (error) {
		return (error as SlotBindingError).code;
	}
}

/** Every factory, called with no options, plus the triple it must emit. */
const NO_ARG_FACTORIES = [
	["s3", () => s3(), "bucket", "bucket.s3-compatible/v1", "aws.s3/v1"],
	[
		"rds.postgres",
		() => rds.postgres(),
		"data",
		"data.postgres/v1",
		"aws.rds-postgres/v1",
	],
	["dynamodb", () => dynamodb(), "kv", "kv.key-value/v1", "aws.dynamodb/v1"],
	["sqs", () => sqs(), "queue", "queue.at-least-once/v1", "aws.sqs/v1"],
	[
		"eks.deployment",
		() => eks.deployment(),
		"web",
		"web.hosted/v1",
		"aws.eks-deployment/v1",
	],
	["lambda", () => lambda(), "service", "service.worker/v1", "aws.lambda/v1"],
] as const;

describe("AWS slot factories emit the documented triple", () => {
	it.each(
		NO_ARG_FACTORIES,
	)("%s binds slot/profile/product without arguments", (_name, call, slot, profile, productId) => {
		const binding = call();
		expect(binding.slot).toBe(slot);
		expect(binding.profile).toBe(profile);
		expect(binding.productId).toBe(productId);
	});

	it.each(
		NO_ARG_FACTORIES,
	)("%s yields empty properties when called with no options", (_name, call) => {
		expect(call().properties).toEqual({});
	});
});

describe("options land in properties and omitted options stay absent", () => {
	it("s3 keeps only the options the caller passed", () => {
		const binding = s3({ versioning: true });
		expect(binding.properties).toEqual({ versioning: true });
		expect(Object.keys(binding.properties)).toEqual(["versioning"]);
		expect("publicAccessBlocked" in binding.properties).toBe(false);
		expect("storageClass" in binding.properties).toBe(false);
	});

	it("s3 carries every option when every option is passed", () => {
		expect(
			s3({
				versioning: false,
				publicAccessBlocked: true,
				storageClass: "glacier-ir",
			}).properties,
		).toEqual({
			versioning: false,
			publicAccessBlocked: true,
			storageClass: "glacier-ir",
		});
	});

	it("rds.postgres invents no instance class or storage size", () => {
		const binding = rds.postgres({ multiAz: true });
		expect(binding.properties).toEqual({ multiAz: true });
		expect("instanceClass" in binding.properties).toBe(false);
		expect("storageGb" in binding.properties).toBe(false);
		expect("engineVersion" in binding.properties).toBe(false);
	});

	it("dynamodb invents no capacity when only the billing mode is set", () => {
		const binding = dynamodb({ billingMode: "on-demand" });
		expect(binding.properties).toEqual({ billingMode: "on-demand" });
		expect("readCapacity" in binding.properties).toBe(false);
		expect("writeCapacity" in binding.properties).toBe(false);
	});

	it("sqs invents no visibility timeout when only fifo is set", () => {
		const binding = sqs({ fifo: true });
		expect(binding.properties).toEqual({ fifo: true });
		expect("visibilityTimeoutSeconds" in binding.properties).toBe(false);
	});

	it("eks.deployment invents no replica count and keeps nested keys sparse", () => {
		const binding = eks.deployment({ limits: { cpu: "500m" } });
		expect(binding.properties).toEqual({ limits: { cpu: "500m" } });
		expect("replicas" in binding.properties).toBe(false);
		expect("requests" in binding.properties).toBe(false);
		const limits = binding.properties.limits as Record<string, unknown>;
		expect("memory" in limits).toBe(false);
	});

	it("lambda invents no memory or timeout when only architecture is set", () => {
		const binding = lambda({ architecture: "arm64" });
		expect(binding.properties).toEqual({ architecture: "arm64" });
		expect("memoryMb" in binding.properties).toBe(false);
		expect("timeoutSeconds" in binding.properties).toBe(false);
	});
});

describe("the core parse boundary still applies", () => {
	it("refuses a credential-shaped option key that bypassed the types", () => {
		const smuggled = { apiKey: "x" } as unknown as S3Options;
		expect(refusalCode(() => s3(smuggled))).toBe(
			"SLOT_BINDING_CREDENTIAL_PROPERTY",
		);
	});

	it("forwards an undeclared key instead of silently dropping it", () => {
		const smuggled = { unknownKnob: 1 } as unknown as S3Options;
		expect(s3(smuggled).properties).toEqual({ unknownKnob: 1 });
	});

	it("refuses a credential-shaped key on a namespaced factory too", () => {
		const smuggled = { password: "x" } as unknown as Parameters<
			typeof rds.postgres
		>[0];
		expect(refusalCode(() => rds.postgres(smuggled))).toBe(
			"SLOT_BINDING_CREDENTIAL_PROPERTY",
		);
	});
});

describe("factories are deterministic and hand back frozen records", () => {
	it.each(NO_ARG_FACTORIES)("%s is deep-equal across calls", (_name, call) => {
		expect(call()).toEqual(call());
	});

	it("repeats identical output for identical options", () => {
		const options = {
			replicas: 3,
			limits: { cpu: "1", memory: "1Gi" },
		} as const;
		expect(eks.deployment(options)).toEqual(eks.deployment(options));
	});

	it.each(NO_ARG_FACTORIES)("%s returns a frozen record", (_name, call) => {
		const binding = call();
		expect(Object.isFrozen(binding)).toBe(true);
		expect(Object.isFrozen(binding.properties)).toBe(true);
	});
});
