#!/usr/bin/env -S node --experimental-strip-types
import { appendFileSync, existsSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";

// A real subprocess derived from the CLI Pact. No engine or network is started.
const settings = process.env.XDG_CONFIG_HOME;
const config = process.env.DAGGER_CONFIG;
if (!settings || !config) throw new Error("missing isolated CLI settings");
if (process.env.FIXTURE_IGNORE_TERM) process.on("SIGTERM", () => {});
appendFileSync(
	join(process.cwd(), "observed.jsonl"),
	`${JSON.stringify({
		argv: process.argv.slice(2),
		settings,
		savedLogin: existsSync(join(settings, "dagger", "credentials.json")),
		configText: readFileSync(config, "utf8"),
		keys: Object.keys(process.env),
		proxyPreserved: process.env.HTTPS_PROXY === process.env.FIXTURE_PROXY,
		caPreserved: process.env.NODE_EXTRA_CA_CERTS === process.env.FIXTURE_CA,
	})}\n`,
);
if (process.argv[2] === "version") {
	writeSync(
		1,
		`dagger v${process.env.FIXTURE_VERSION ?? "1.0.0-beta.21"} (fixture)\n`,
	);
} else if (process.env.FIXTURE_WAIT) {
	setInterval(() => {}, 100);
} else {
	process.exitCode = 17;
}
