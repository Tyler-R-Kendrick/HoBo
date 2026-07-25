import { defineConfig } from "astro/config";

// GitHub Pages project site: https://tyler-r-kendrick.github.io/HoBo/
// The base path is also hardcoded in markdown links (see site/README.md);
// change both together if the repo is ever renamed or moved to a custom domain.
export default defineConfig({
	site: "https://tyler-r-kendrick.github.io",
	base: "/HoBo",
	trailingSlash: "ignore",
	markdown: {
		shikiConfig: {
			themes: { light: "github-light", dark: "github-dark" },
			defaultColor: false,
		},
	},
});
