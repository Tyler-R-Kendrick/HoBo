import { deepFreeze, SdkDeclarationError } from "./errors.js";
import { GENERATE_PROVIDER_SCHEMA } from "./schema.js";

// Greenfield declaration factory (walkthrough §2.1): "a provider that doesn't
// exist yet" is generated through scaffold → LLM-fill → sandbox-conformance →
// sign, then registered like any signed plugin. Honest scope: this factory
// parses and freezes the generation REQUEST; the generation pipeline itself
// (and the signed conformance report it must produce) is a separate
// initiative — the async shape matches the walkthrough's `await` usage site.

// The fixed pipeline stages a generation request declares, in order.
export const GENERATE_PROVIDER_PIPELINE = Object.freeze([
	"scaffold",
	"llm-fill",
	"sandbox-conformance",
	"sign",
] as const);

// domain-view: authored provider-generation request; wire form is GenerateProviderRequest in data-models/sdk.proto.
export interface GenerateProviderRequest {
	readonly schema: string;
	readonly docsUrl: string;
	readonly pipeline: readonly string[];
}

export async function generateProvider(
	docsUrl: string,
): Promise<GenerateProviderRequest> {
	let parsed: URL;
	try {
		parsed = new URL(docsUrl);
	} catch {
		throw new SdkDeclarationError(
			"generateProvider",
			"docsUrl",
			"must be a URL",
		);
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new SdkDeclarationError(
			"generateProvider",
			"docsUrl",
			"must be an http(s) URL",
		);
	}

	return deepFreeze({
		schema: GENERATE_PROVIDER_SCHEMA,
		docsUrl: parsed.toString(),
		pipeline: [...GENERATE_PROVIDER_PIPELINE],
	});
}
