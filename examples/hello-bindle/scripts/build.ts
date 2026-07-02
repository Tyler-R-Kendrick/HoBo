import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	componentizeHelloBindle,
	validateWasmComponentArtifact,
} from "@hobo/componentize";

import { parseHelloBindleBuildRecord } from "../src/parse.js";
import { signComponentDigest, verifySignedArtifact } from "../src/signing.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(packageRoot, "dist");

export async function buildHelloBindle() {
	const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH ?? "2026-01-01T00:00:00.000Z";
	if (!sourceDateEpoch || Number.isNaN(Date.parse(sourceDateEpoch))) {
		throw new Error("hello_bindle.source_date_epoch_required");
	}

	const result = await componentizeHelloBindle({
		sourceRoot: packageRoot,
		sourceDateEpoch,
	});
	validateWasmComponentArtifact(result.component);

	const record = parseHelloBindleBuildRecord(result, sourceDateEpoch);
	const signed = signComponentDigest(record.componentDigest);
	if (!verifySignedArtifact(signed)) {
		throw new Error("hello_bindle.signature_verification_failed");
	}

	const lifecycle = [
		{ event: "ComponentBuilt", record },
		{ event: "ArtifactSigned", artifact: signed },
		{ event: "ArtifactVerified", digest: signed.digest, passed: true },
	];

	await mkdir(distDir, { recursive: true });
	await writeFile(join(distDir, "hello-bindle.component.wasm"), result.component.bytes);
	await writeFile(join(distDir, "hello-bindle.oci.json"), JSON.stringify(result.oci, null, 2));
	await writeFile(join(distDir, "hello-bindle.signature.json"), JSON.stringify(signed, null, 2));
	await writeFile(join(distDir, "hello-bindle.build-record.json"), JSON.stringify(lifecycle, null, 2));

	return { result, record, signed, lifecycle };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	buildHelloBindle().catch((error: unknown) => {
		console.error(error);
		process.exit(1);
	});
}
