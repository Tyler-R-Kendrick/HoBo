import type { ComponentizeResult } from "@hobo/componentize";
import { PINNED_TOOLCHAIN } from "@hobo/componentize";

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const MEDIA_TYPE = "application/vnd.wasm.component.v1+wasm";
const WIT_WORLD = "hobo:examples/hello-bindle@0.1.0/service";

export interface ParsedHelloBindleBuildRecord {
	schema: "hobo.componentize/v1";
	name: "hello-bindle";
	witWorld: typeof WIT_WORLD;
	sourceDateEpoch: string;
	toolchain: typeof PINNED_TOOLCHAIN;
	sources: { path: string; digest: string }[];
	componentDigest: string;
	mediaType: typeof MEDIA_TYPE;
}

export function parseHelloBindleBuildRecord(
	result: ComponentizeResult,
	sourceDateEpoch: string,
): ParsedHelloBindleBuildRecord {
	const metadata = JSON.parse(result.component.metadata) as {
		sources: { path: string; digest: string }[];
	};
	const record: ParsedHelloBindleBuildRecord = {
		schema: "hobo.componentize/v1",
		name: "hello-bindle",
		witWorld: WIT_WORLD,
		sourceDateEpoch,
		toolchain: PINNED_TOOLCHAIN,
		sources: metadata.sources,
		componentDigest: result.component.digest,
		mediaType: MEDIA_TYPE,
	};

	assertParsedRecord(record);
	return record;
}

function assertParsedRecord(record: ParsedHelloBindleBuildRecord) {
	if (!DIGEST_RE.test(record.componentDigest)) {
		throw new Error("hello_bindle.invalid_digest");
	}
	if (record.mediaType !== MEDIA_TYPE) {
		throw new Error("hello_bindle.invalid_media_type");
	}
	if (record.witWorld !== WIT_WORLD) {
		throw new Error("hello_bindle.invalid_wit_world");
	}
}
