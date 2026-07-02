import {
	RUNTIME_PORT_CONFORMANCE_VERSION,
	type RuntimePortConformanceReport,
} from "./types.js";

export function parseRuntimePortReport(
	raw: unknown,
): RuntimePortConformanceReport {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new TypeError("report must be an object");
	}

	const source = raw as Record<string, unknown>;
	if (source.contract !== RUNTIME_PORT_CONFORMANCE_VERSION) {
		throw new TypeError("contract must be hobo.runtime-port-conformance/v1");
	}

	const status = source.status;
	if (status !== "pass" && status !== "fail") {
		throw new TypeError("status must be pass or fail");
	}

	const failures = Array.isArray(source.failures) ? source.failures : [];
	if ((status === "fail") !== failures.length > 0) {
		throw new TypeError("status must be fail iff failures is non-empty");
	}

	const coverage = source.coverage as
		| { local?: Record<string, unknown> }
		| undefined;
	const local = coverage?.local;
	if (!local || typeof local !== "object") {
		throw new TypeError("coverage.local is required");
	}

	const passed = Number(local.passed);
	const failed = Number(local.failed);
	const total = Number(local.total);
	if (passed + failed !== total) {
		throw new TypeError("coverage.local.passed + failed must equal total");
	}

	return Object.freeze({
		contract: RUNTIME_PORT_CONFORMANCE_VERSION,
		backend: String(source.backend ?? ""),
		status,
		checks: Object.freeze(
			Array.isArray(source.checks)
				? (source.checks as RuntimePortConformanceReport["checks"])
				: [],
		),
		failures: Object.freeze(
			failures as RuntimePortConformanceReport["failures"],
		),
		coverage: Object.freeze({
			local: Object.freeze({
				status: local.status === "pass" ? "pass" : "fail",
				passed,
				failed,
				total,
			}),
		}),
	}) as RuntimePortConformanceReport;
}
