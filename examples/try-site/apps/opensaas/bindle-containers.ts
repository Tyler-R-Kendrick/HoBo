/**
 * Extract OCI image refs from a Bindle definition's container resources.
 * Ship/bridge paths must use this — never invent images from example ids.
 */
export type BindleContainerRef = {
	readonly name: string;
	readonly image: string;
};

export function bindleContainerImages(
	definition: unknown,
): readonly BindleContainerRef[] {
	if (!definition || typeof definition !== "object") return [];
	const resources = (definition as { resources?: unknown }).resources;
	if (!resources || typeof resources !== "object") return [];
	const out: BindleContainerRef[] = [];
	for (const [name, resource] of Object.entries(
		resources as Record<string, unknown>,
	)) {
		if (!resource || typeof resource !== "object") continue;
		const kind = (resource as { kind?: unknown }).kind;
		if (kind !== "container") continue;
		const annotations = (resource as { annotations?: unknown }).annotations;
		if (!Array.isArray(annotations)) continue;
		const dep = annotations.find(
			(entry) =>
				entry &&
				typeof entry === "object" &&
				(entry as { option?: unknown }).option === "dependency" &&
				(entry as { provider?: unknown }).provider === "hobo",
		) as { config?: { image?: unknown } } | undefined;
		const image = dep?.config?.image;
		if (typeof image === "string" && image.length > 0) {
			out.push({ name, image });
		}
	}
	return Object.freeze(out);
}

export function requireBindleContainer(
	containers: readonly BindleContainerRef[],
	name: string,
): BindleContainerRef {
	const hit = containers.find((entry) => entry.name === name);
	if (!hit) {
		throw new Error(
			`Bindle missing container resource "${name}" with an image — cannot ship`,
		);
	}
	return hit;
}
