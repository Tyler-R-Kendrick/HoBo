#!/usr/bin/env node
/**
 * hobo-code — standalone coding harness CLI (ADR-0139).
 * Default verb: dispatch.
 */
import { formatHoboCodeResult, runHoboCodeCli } from "../cli.js";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const result = await runHoboCodeCli(argv, { json });
process.stdout.write(formatHoboCodeResult(result, json));
process.exitCode = result.exitCode;
