import { readFile, writeFile } from "node:fs/promises";
import { ciProjectJsonSchema } from "../src/project-schema.js";

const path = new URL("../schema/ci-project.schema.json", import.meta.url);
const generated = `${JSON.stringify(ciProjectJsonSchema(), null, 2)}\n`;
if (process.argv.includes("--check")) {
	if ((await readFile(path, "utf8")) !== generated)
		throw new Error("CI project schema is stale; run schema:generate");
} else await writeFile(path, generated);
