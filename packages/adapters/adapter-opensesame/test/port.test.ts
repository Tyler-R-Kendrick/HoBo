import {
	asHoboSecretsStore,
	createSecretAccessedEvent,
	requireNoPlaintextConformance,
	resolveConfigEntry,
	type SecretsPort,
} from "@hobo/identity";
import { describe, expect, it } from "vitest";

import { createOpenSesameCredentialResolver } from "../src/credential-resolver.js";
import { OpenSesameAdapterError } from "../src/errors.js";
import { createOpenSesameSecretsPort } from "../src/port.js";
import { parsed, vercelRecord } from "./fixtures/bindings.js";

const SURROGATE = `osr_${"0123456789abcdef".repeat(2)}`;
const LOCATOR = "hobo-token://vercel/deploy";
const VERSION_FALLBACK = "surrogate";

function portWith(env: NodeJS.ProcessEnv): SecretsPort {
	return createOpenSesameSecretsPort({ bindings: parsed(), env });
}

describe("the OpenSesame SecretsPort", () => {
	it("is an opensesame port with a stable id", () => {
		const port = portWith({});
		expect(port.kind).toBe("opensesame");
		expect(port.id).toBe("secrets:opensesame");
		expect(
			createOpenSesameSecretsPort({
				bindings: parsed(),
				env: {},
				id: "secrets:qdai",
			}).id,
		).toBe("secrets:qdai");
	});

	it("access returns ok with material shaped osr_ and source provider-federation", async () => {
		const result = await portWith({ VERCEL_TOKEN: SURROGATE }).access(LOCATOR);
		expect(result).toEqual({
			status: "ok",
			valueRef: "opensesame://acme/vercel#surrogate",
			material: SURROGATE,
			versionId: "surrogate",
			source: "provider-federation",
		});
	});

	it("unknown locator is denied secret-not-found", async () => {
		const result = await portWith({ VERCEL_TOKEN: SURROGATE }).access(
			"hobo-token://vercel/other",
		);
		expect(result).toMatchObject({
			status: "denied",
			code: "secret-not-found",
		});
	});

	it("a placeholder is denied placeholders_only", async () => {
		const placeholder = `ostest_${"0123456789abcdef".repeat(2)}`;
		const result = await portWith({ VERCEL_TOKEN: placeholder }).access(
			LOCATOR,
		);
		expect(result).toMatchObject({
			status: "denied",
			code: "placeholders_only",
		});
	});

	it("a variable that is absent is denied placeholders_only", async () => {
		expect(await portWith({}).access(LOCATOR)).toMatchObject({
			status: "denied",
			code: "placeholders_only",
		});
	});

	it("never serves a plain token as material: only a surrogate of this run passes", async () => {
		const plain = "vtok_dummy_marker_0123456789abcdef";
		const result = await portWith({ VERCEL_TOKEN: plain }).access(LOCATOR);
		expect(result).toMatchObject({
			status: "denied",
			code: "placeholders_only",
		});
		expect(JSON.stringify(result)).not.toContain(plain);
	});

	it("rejects a surrogate that is the wrong length or not hex", async () => {
		for (const value of [
			"osr_abc",
			`osr_${"g".repeat(32)}`,
			`${SURROGATE}0`,
			` ${SURROGATE}`,
			`osr_${"0123456789ABCDEF".repeat(2)}`,
		]) {
			expect(
				await portWith({ VERCEL_TOKEN: value }).access(LOCATOR),
				value,
			).toMatchObject({ status: "denied" });
		}
	});

	it("accessVersion serves the one version and refuses another", async () => {
		const port = portWith({ VERCEL_TOKEN: SURROGATE });
		expect(await port.accessVersion(LOCATOR, "surrogate")).toMatchObject({
			status: "ok",
			material: SURROGATE,
		});
		expect(await port.accessVersion(LOCATOR, "v1")).toMatchObject({
			status: "denied",
			code: "secret-version-not-found",
		});
	});

	it("listVersions is the one surrogate for a bound locator and nothing for another", async () => {
		const port = portWith({ VERCEL_TOKEN: SURROGATE });
		expect(await port.listVersions(LOCATOR)).toEqual(["surrogate"]);
		expect(await port.listVersions("hobo-token://vercel/other")).toEqual([]);
	});

	it("put throws read_only: secrets enter by a person's `opensesame pass insert`", async () => {
		const port = portWith({ VERCEL_TOKEN: SURROGATE });
		await expect(port.put(LOCATOR, "anything")).rejects.toMatchObject({
			code: "read_only",
		});
		await expect(port.put(LOCATOR, "anything")).rejects.toBeInstanceOf(
			OpenSesameAdapterError,
		);
		await expect(
			asHoboSecretsStore(port).put(LOCATOR, new Uint8Array([1])),
		).rejects.toMatchObject({ code: "read_only" });
	});

	it("serves each binding its own variable", async () => {
		const other = `osr_${"fedcba9876543210".repeat(2)}`;
		const port = createOpenSesameSecretsPort({
			bindings: parsed(
				vercelRecord(),
				vercelRecord({
					locator: "hobo-token://vercel/edge",
					env_name: "EDGE_TOKEN",
				}),
			),
			env: { VERCEL_TOKEN: SURROGATE, EDGE_TOKEN: other },
		});
		expect(await port.access(LOCATOR)).toMatchObject({ material: SURROGATE });
		expect(await port.access("hobo-token://vercel/edge")).toMatchObject({
			material: other,
		});
	});

	it("passes the plaintext conformance oracle: refs only in events and agent context", async () => {
		const port = portWith({ VERCEL_TOKEN: SURROGATE });
		const ok = await port.access(LOCATOR);
		if (ok.status !== "ok") throw new Error("expected ok");
		const event = createSecretAccessedEvent({
			name: LOCATOR,
			source: ok.source,
			valueRef: ok.valueRef,
			tenant: "qdai",
			versionId: ok.versionId ?? VERSION_FALLBACK,
		});
		requireNoPlaintextConformance({
			events: [event],
			agentContext: { valueRef: ok.valueRef, versionId: ok.versionId },
			logs: "opensesame residual",
		});
	});

	it("the ladder resolves a binding named by its locator and keeps the surrogate off the entry", async () => {
		const resolved = await resolveConfigEntry({
			name: LOCATOR,
			sensitive: true,
			preferredSource: "provider-federation",
			allowedSources: ["provider-federation"],
			secretsPort: portWith({ VERCEL_TOKEN: SURROGATE }),
		});
		expect(resolved.status).toBe("resolved");
		if (resolved.status === "resolved") {
			expect(resolved.entry.placeholder).toMatch(/REDACTED/u);
			expect(JSON.stringify(resolved.entry)).not.toContain(SURROGATE);
		}
	});
});

describe("the credential resolver for the Vercel resolvers", () => {
	it("returns the surrogate for a bound locator", async () => {
		const resolve = createOpenSesameCredentialResolver(
			portWith({ VERCEL_TOKEN: SURROGATE }),
		);
		expect(await resolve(LOCATOR)).toBe(SURROGATE);
	});

	it("throws placeholders_only, naming no value, when the child holds a placeholder", async () => {
		const placeholder = `ostest_${"0123456789abcdef".repeat(2)}`;
		const resolve = createOpenSesameCredentialResolver(
			portWith({ VERCEL_TOKEN: placeholder }),
		);
		const error = await resolve(LOCATOR).then(
			() => undefined,
			(caught: Error) => caught,
		);
		expect(error).toBeInstanceOf(OpenSesameAdapterError);
		expect(error).toMatchObject({ code: "placeholders_only" });
		expect(String(error)).not.toContain(placeholder);
	});

	it("throws binding_invalid for a locator that is not bound, and answers for no other", async () => {
		const resolve = createOpenSesameCredentialResolver(
			portWith({ VERCEL_TOKEN: SURROGATE }),
		);
		await expect(resolve("hobo-token://vercel/other")).rejects.toMatchObject({
			code: "binding_invalid",
		});
	});
});
