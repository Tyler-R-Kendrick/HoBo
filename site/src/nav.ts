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
			{ label: "Project status", slug: "/guide/status/" },
		],
	},
	{
		label: "Agents",
		slug: "/agents/",
		items: [
			{ label: "Agent-native repo", slug: "/agents/" },
			{ label: "Tooling & MCP", slug: "/agents/tooling/" },
			{ label: "Skills & workflows", slug: "/agents/skills/" },
			{ label: "Rules & guardrails", slug: "/agents/rules/" },
		],
	},
	{
		label: "Develop",
		slug: "/develop/",
		items: [
			{ label: "Contributing", slug: "/develop/" },
			{ label: "Repository map", slug: "/develop/repo-map/" },
			{ label: "Checks & CI gates", slug: "/develop/gates/" },
			{ label: "Extending the design", slug: "/develop/extending/" },
		],
	},
];

export const github = "https://github.com/Tyler-R-Kendrick/HoBo";
