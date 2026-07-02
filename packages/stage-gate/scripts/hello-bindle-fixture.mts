import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const SOURCE_DATE_EPOCH = "2024-01-01T00:00:00.000Z";

export function resolveHelloBindleRoot(): string {
	const production = join(REPO_ROOT, "examples/hello-bindle");
	if (existsSync(join(production, "src/service.ts"))) {
		return production;
	}
	return join(
		REPO_ROOT,
		"src/draft/technical-proofs/hobo-componentize-contract/examples/hello-bindle",
	);
}

export async function buildHelloBindleComponent() {
	const { componentizeHelloBindle } = await import(
		"../../../src/draft/technical-proofs/hobo-componentize-contract/src/componentize-contract.ts"
	);
	return componentizeHelloBindle({
		sourceRoot: resolveHelloBindleRoot(),
		sourceDateEpoch: SOURCE_DATE_EPOCH,
	});
}

export function emitEvidence(payload: Record<string, string>): void {
	console.log(JSON.stringify(payload));
}

export { REPO_ROOT, SOURCE_DATE_EPOCH };
