import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { ScaffoldResult } from "./types.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_ROOT = join(PACKAGE_ROOT, "templates");

export const HIGH_VALUE_TEMPLATE_ID = "openui-astryx-bindle" as const;

export interface ScaffoldOptions {
	readonly outputDir: string;
	readonly appName: string;
	readonly templateId?: string;
}

function walkFiles(dir: string, base = dir): string[] {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			out.push(...walkFiles(full, base));
		} else {
			out.push(relative(base, full).replace(/\\/g, "/"));
		}
	}
	return out;
}

/**
 * Materialize the high-value OpenUI + Astryx Bindle template with
 * Gherkin linked to OpenFeature. ts-autocode specialization respects
 * konsistent layout + `_generated/` + proof promotion rules.
 */
export function scaffoldHighValueTemplate(
	options: ScaffoldOptions,
): ScaffoldResult {
	const templateId = options.templateId ?? HIGH_VALUE_TEMPLATE_ID;
	const templateDir = join(TEMPLATES_ROOT, templateId);
	if (!existsSync(templateDir)) {
		throw new Error(`template not found: ${templateId}`);
	}
	mkdirSync(options.outputDir, { recursive: true });
	cpSync(templateDir, options.outputDir, { recursive: true });

	// Specialize placeholders for HoBo package layout.
	const packageJsonPath = join(options.outputDir, "package.json");
	if (existsSync(packageJsonPath)) {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
			string,
			unknown
		>;
		pkg.name = `@hobo/app-${options.appName}`;
		writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	}

	// Ensure konsistent-shaped dirs for Bindle apps that grow into packages.
	for (const dir of ["src", "test", "contracts", "data-models", "src/_generated"]) {
		mkdirSync(join(options.outputDir, dir), { recursive: true });
	}
	writeFileSync(
		join(options.outputDir, "src/_generated", ".gitkeep"),
		"",
		"utf8",
	);
	writeFileSync(
		join(options.outputDir, "hobo.scaffold.json"),
		JSON.stringify(
			{
				templateId,
				appName: options.appName,
				ui: "openui+astryx",
				smallUiFallback: "aha",
				openFeature: true,
				gherkin: true,
				tsAutocode: true,
				konsistent: true,
				generatedDir: "src/_generated",
			},
			null,
			2,
		),
		"utf8",
	);

	const files = walkFiles(options.outputDir);
	return {
		templateId,
		outputDir: options.outputDir,
		files,
		openFeatureFlag: "app.visual.primary",
		gherkinFeature: "features/visual.feature",
		respectsKonsistent: true,
		respectsGenerated: true,
	};
}

export interface SuccessRateSample {
	readonly templateId: string;
	readonly attempts: number;
	readonly successes: number;
	readonly rate: number;
}

/**
 * Measurement path for agent success rate on the canonical high-value template.
 * Callers append samples; rate is successes/attempts.
 */
export function measureTemplateSuccessRate(
	samples: readonly { success: boolean }[],
	templateId: string = HIGH_VALUE_TEMPLATE_ID,
): SuccessRateSample {
	const attempts = samples.length;
	const successes = samples.filter((s) => s.success).length;
	return {
		templateId,
		attempts,
		successes,
		rate: attempts === 0 ? 0 : successes / attempts,
	};
}

/** ts-autocode specialization hooks for HoBo conventions. */
export function tsAutocodeConventions(): {
	readonly packageLayout: readonly string[];
	readonly generatedDir: string;
	readonly proofPromotion: boolean;
	readonly konsistent: boolean;
	readonly bindleTopology: boolean;
} {
	return {
		packageLayout: [
			"package.json",
			"tsconfig.json",
			"src/",
			"test/",
			"contracts/",
			"data-models/",
		],
		generatedDir: "src/_generated",
		proofPromotion: true,
		konsistent: true,
		bindleTopology: true,
	};
}
