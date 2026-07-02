export {
	MANIFEST_SCHEMA,
	ManifestParseError,
	aspireFallbackEnv,
	canonicalManifestHash,
	parseManifest,
	parseManifestReference,
	parseOutputPlaceholder,
	serializeManifest,
} from "./manifest.js";

export type {
	ManifestHash,
	ManifestReference,
	ManifestV1,
	OutputPlaceholder,
} from "./manifest.js";
