import { buildHelloBindleComponent, emitEvidence } from "./hello-bindle-fixture.mts";

const build = await buildHelloBindleComponent();
const { runWasmtimeSmoke } = await import(
	"../../../src/draft/technical-proofs/hobo-componentize-contract/src/componentize-contract.ts"
);

const smoke = await runWasmtimeSmoke(build.component, { exportName: "health" });
const expected = "hello-bindle:ok\n";
if (smoke.stdout !== expected) {
	console.error(`health export returned ${JSON.stringify(smoke.stdout)}`);
	process.exit(1);
}

emitEvidence({
	component_digest: build.component.digest,
	digest_sha256: build.component.digest,
	byte_length: String(build.component.bytes.length),
	media_type: build.component.mediaType,
	health_stdout: smoke.stdout.trim(),
});
