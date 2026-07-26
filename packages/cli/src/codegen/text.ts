// Deterministic text/JSON helpers shared by the codegen engine, tree, and
// fixture modules. Implementations live upstream in ts-autocode-grounding
// (ADR-0128), pinned there by golden tests so the byte-compatible digests
// (build-digest-parity) are unchanged.

export {
	digest,
	normalizePath,
	normalizeText,
	pascalCase,
	stableStringify,
	toStableValue,
	union,
} from "ts-autocode-grounding";
