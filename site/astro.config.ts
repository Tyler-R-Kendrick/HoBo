import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";

import { temporaryStationApiPlugin } from "./scripts/vite-temporary-station-api.mts";

// GitHub Pages project site: https://tyler-r-kendrick.github.io/HoBo/
// The base path is also hardcoded in markdown links (see site/README.md);
// change both together if the repo is ever renamed or moved to a custom domain.
//
// `temporaryStationApiPlugin` attaches same-origin Temporary Accounts provision
// for `astro dev` / `astro preview` so Examples Deploy stations works without a
// dead external CORS relay URL (api.cloudflare.com has no browser ACAO).
export default defineConfig({
	site: "https://tyler-r-kendrick.github.io",
	base: "/HoBo",
	trailingSlash: "ignore",
	vite: {
		plugins: [temporaryStationApiPlugin()],
		// Try-site example apps use TC39 standard decorators (@trainable /
		// @intent from @hobo/runtime). Vite's esbuild otherwise passes standard
		// decorators through at its default target, and Node rejects them with
		// "Invalid or unexpected token" when the SSR runner evaluates an example
		// app for /examples/index.json in dev (the production build already
		// lowers them). Force esbuild to lower decorators in dev transforms too.
		esbuild: {
			supported: { decorators: false },
		},
	},
	markdown: {
		// Heading anchors. Without these no `.prose h2/h3` carried an `id`, so
		// none of the 130+ docs pages could be deep-linked — and the homepage
		// already links to `/primitives/bindles/#greenfield-…`, which silently
		// resolved to nothing. `scroll-padding-top` was set for anchors that did
		// not exist.
		rehypePlugins: [
			rehypeSlug,
			[
				rehypeAutolinkHeadings,
				{
					behavior: "append",
					properties: { class: "heading-anchor", ariaHidden: "true", tabIndex: -1 },
					content: { type: "text", value: "#" },
				},
			],
		],
		shikiConfig: {
			// High-contrast variants: the standard GitHub themes fall below
			// WCAG AA on the aged-paper/near-black code backgrounds.
			themes: {
				light: "github-light-high-contrast",
				dark: "github-dark-high-contrast",
			},
			defaultColor: false,
		},
	},
});
