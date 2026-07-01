export { bindle } from "./bindle.js";
export type {
	BindleManifest,
	ClosureBuilder,
	ResourceDescriptor,
	ResourceHandle,
	ResourceKind,
	ResourceRelationship,
} from "./bindle.js";

export const HOBO_BINDLES_PACKAGE = "@hobo/bindles";

export {
	MANIFEST_SCHEMA,
	ManifestParseError,
	aspireFallbackEnv,
	canonicalManifestHash,
	parseManifest,
	parseManifestReference,
	parseOutputPlaceholder,
	serializeManifest,
} from "./manifest/index.js";

export type {
	ManifestHash,
	ManifestReference,
	ManifestV1,
	OutputPlaceholder,
} from "./manifest/index.js";
