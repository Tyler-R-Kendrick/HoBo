/** Single source of truth for header and sidebar navigation. */

export type NavItem = { label: string; slug: string };
export type NavGroup = { label: string; slug: string; items: NavItem[] };

export const nav: NavGroup[] = [
	{
		label: "Guide",
		slug: "/guide/",
		items: [
			{ label: "What is HoBo?", slug: "/guide/" },
			{ label: "Getting started", slug: "/guide/getting-started/" },
			{ label: "Core concepts", slug: "/guide/concepts/" },
			{ label: "Architecture", slug: "/guide/architecture/" },
			{ label: "The hobo CLI", slug: "/guide/cli/" },
			{ label: "Custom providers", slug: "/guide/custom-providers/" },
			{ label: "Testing", slug: "/guide/testing/" },
			{ label: "The Bridge", slug: "/guide/bridge/" },
			{ label: "The trail map", slug: "/guide/status/" },
		],
	},
	{
		label: "Primitives",
		slug: "/primitives/",
		items: [
			{ label: "Meet the primitives", slug: "/primitives/" },
			{ label: "Bindles", slug: "/primitives/bindles/" },
			{ label: "Camps", slug: "/primitives/camps/" },
			{ label: "Yards", slug: "/primitives/yards/" },
			{ label: "Junctions", slug: "/primitives/junctions/" },
		],
	},
	{
		label: "Roles",
		slug: "/roles/",
		items: [
			{ label: "Who writes what", slug: "/roles/" },
			{ label: "HoBo for Developers", slug: "/roles/developers/" },
			{ label: "HoBo for Platform Engineers", slug: "/roles/platform-engineers/" },
			{ label: "HoBo for DevSecOps", slug: "/roles/devsecops/" },
			{ label: "HoBo for Agents", slug: "/agents/" },
			{ label: "The MCP surface", slug: "/agents/mcp/" },
		],
	},
];
