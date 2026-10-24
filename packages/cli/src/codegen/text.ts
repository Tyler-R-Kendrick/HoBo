// Deterministic text/JSON helpers shared by the codegen engine, tree, and
// fixture modules. Implementations live upstream in ts-autocode-grounding
// (ADR-0128), pinned there by golden tests so the byte-compatible digests
// (build-digest-parity) are unchanged. Upstream renamed its text digest to
// `textDigest` (its `digest` is now a deprecated alias); HoBo's callers keep
// the local name `digest`.

export {
	normalizePath,
	normalizeText,
	pascalCase,
	stableStringify,
	textDigest as digest,
	toStableValue,
	union,
} from "ts-autocode-grounding";
