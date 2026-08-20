import type { APIRoute, GetStaticPaths } from "astro";
import { paint, THEMES, TRAIL_LAYERS } from "../../lib/trail-art";

// One static file per (layer, theme): /parallax/trail-dark.svg and friends.
// They live out here rather than inline in the page because a data URI of the
// same drawing has to be percent-encoded, which roughly triples it and then
// gzips badly — and unlike the page, these can be cached forever.

const tiles: ReadonlyMap<string, string> = new Map(
	TRAIL_LAYERS.flatMap((layer) =>
		// SAFETY: THEMES is a const key map; Object.keys preserves those keys.
		(Object.keys(THEMES) as Array<keyof typeof THEMES>).map(
			(theme) => [`${layer.key}-${theme}`, paint(layer.svg, theme)] as const,
		),
	),
);

export const getStaticPaths: GetStaticPaths = () =>
	[...tiles.keys()].map((layer) => ({ params: { layer } }));

export const GET: APIRoute = ({ params }) => {
	const svg = tiles.get(String(params.layer));
	if (!svg) return new Response("Not found", { status: 404 });
	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
};
