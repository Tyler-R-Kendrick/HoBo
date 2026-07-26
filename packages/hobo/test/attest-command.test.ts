import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "@hobo/cli";
import type { RuntimeLocalEventStore } from "@hobo/runtime-local";
import { afterEach, describe, expect, it } from "vitest";

import {
	createAttestCommand,
	createComposedHoboCli,
	createDefaultYardRuntime,
} from "../src/index.js";

// `hobo attest` folds the CredentialAudit projection (emitted on the deploy path)
// and exports it as OCSF 1.x Authorization evidence. The happy path deploys for
// real, then attests the SAME runtime and asserts the OCSF taxonomy + credential
// chain + integrity seal. Also covers the no-facts and no-runtime cases.

const HELLO_BINDLE = {
	schema: "hobo.manifest/v1",
	componentHost: { kind: "wasmtime", version: "1.0.0" },
	resources: {
		service: {
			type: "component.v1",
			image: "oci://registry.example.com/hello-bindle@sha256:abc123",
			runtime: "wasm",
			exports: ["wasi:http/incoming-handler"],
			bind: ["sessions"],
		},
		sessions: { type: "data.v1", port: "kv" },
	},
};

let openStores: RuntimeLocalEventStore[] = [];
afterEach(() => {
	for (const store of openStores) store.close();
	openStores = [];
});

async function withProject(
	callback: (cwd: string) => Promise<void>,
): Promise<void> {
	const dir = await mkdtemp(path.join(tmpdir(), "hobo-attest-"));
	await writeFile(
		path.join(dir, "hobo.bindle.json"),
		`${JSON.stringify(HELLO_BINDLE, null, 2)}\n`,
	);
	try {
		await callback(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function runInput(cwd: string) {
	return {
		context: { cwd, projectDir: cwd } as unknown as CliContext,
		flags: { cwd } as never,
		args: [] as readonly string[],
		verb: "attest",
		emitProgress: () => {},
	};
}

// biome-ignore lint/suspicious/noExplicitAny: test-only envelope reader.
function envelope(stdout: string): any {
	return JSON.parse(stdout);
}

describe("createAttestCommand", () => {
	it("exports OCSF Authorization evidence from the deploy credential-audit trail", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const up = envelope((await cli.run(["up", "--json"], { cwd })).stdout);
			expect(up.status).toBe("deployed");

			const attest = envelope(
				(await cli.run(["attest", "--json"], { cwd })).stdout,
			);
			expect(attest.code).not.toBe("HOBO_CLI_STUB");
			expect(attest.ok).toBe(true);
			expect(attest.status).toBe("attested");
			expect(attest.data.format).toBe("ocsf-1.x");
			// One grant per provisioned resource (service + sessions).
			expect(attest.data.records).toBe(2);

			const batch = attest.data.batches[0];
			expect(batch.export_version).toBe("hobo.identity-ocsf-export/v1");
			expect(batch.sealDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
			expect(batch.ordering.mode).toBe("ordered");

			const record = batch.records[0];
			// Faithful OCSF taxonomy: IAM category 3, Authorization class 3004.
			expect(record.category_uid).toBe(3);
			expect(record.class_uid).toBe(3004);
			expect(record.class_name).toBe("Authorization");
			// Terminal lifecycle state is revoked -> activity 4, type_uid 300404.
			expect(record.activity_id).toBe(4);
			expect(record.type_uid).toBe(300404);
			// The linked credential chain carries the grant lifecycle + scope.
			const chain = record.hobo.credential_chain;
			expect(chain.grantId).toBeTruthy();
			expect(chain.scope.action).toBe("apply");
			expect(chain.grantedAt).toBeTruthy();
			expect(chain.usedAt).toBeTruthy();
			expect(chain.revokedAt).toBeTruthy();
		});
	});

	it("is deterministic: the seal digest is stable across two exports of the same log", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });
			await cli.run(["up", "--json"], { cwd });

			const a = envelope((await cli.run(["attest", "--json"], { cwd })).stdout);
			const b = envelope((await cli.run(["attest", "--json"], { cwd })).stdout);
			expect(a.data.batches[0].sealDigest).toBe(b.data.batches[0].sealDigest);
		});
	});

	it("reports no audit facts for a project that has never deployed", async () => {
		await withProject(async (cwd) => {
			const runtime = createDefaultYardRuntime();
			openStores.push(runtime.store as RuntimeLocalEventStore);
			const cli = createComposedHoboCli({ yardRuntime: runtime });

			const attest = envelope(
				(await cli.run(["attest", "--json"], { cwd })).stdout,
			);
			expect(attest.ok).toBe(true);
			expect(attest.status).toBe("no_audit_facts");
			expect(attest.data.records).toBe(0);
		});
	});

	it("reports unavailable when no runtime is wired", async () => {
		const result = await createAttestCommand().run(runInput("/tmp"));
		expect(result.ok).toBe(false);
		expect(result.code).toBe("HOBO_NO_RUNTIME");
	});
});
