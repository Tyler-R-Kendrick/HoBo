export function parseComponentHostManifest(raw: unknown) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new TypeError("manifest must be an object");
	}

	const source = raw as Record<string, unknown>;
	const componentHost = source.componentHost;
	if (!componentHost || typeof componentHost !== "object" || Array.isArray(componentHost)) {
		throw new TypeError("componentHost is required");
	}

	const hostSection = componentHost as Record<string, unknown>;
	const certifiedHosts = hostSection.certifiedHosts;
	if (!Array.isArray(certifiedHosts) || certifiedHosts.length === 0) {
		throw new TypeError("certifiedHosts must be a non-empty array");
	}

	for (const pin of certifiedHosts) {
		if (!pin || typeof pin !== "object") {
			throw new TypeError("certified host pin must be an object");
		}
		const entry = pin as Record<string, unknown>;
		if (typeof entry.kind !== "string" || entry.kind.length === 0) {
			throw new TypeError("host.kind must be non-empty");
		}
		if (typeof entry.version !== "string" || entry.version.length === 0) {
			throw new TypeError("host.version must be non-empty");
		}
	}

	return Object.freeze(structuredClone(raw));
}
