import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CommandModule, YardRuntime } from "@hobo/cli";
import { DEFAULT_TENANT } from "@hobo/cli";
import {
	collectStream,
	derivativeUpgradeFailed,
	derivativeUpgradeStarted,
	derivativeUpgradeSucceeded,
} from "@hobo/cloud";
import type { EventInput, PrincipalRef } from "@hobo/core";

export interface DerivativeCommandDeps {
	// The shared Yard runtime whose durable log records the upgrade ceremony.
	readonly runtime?: YardRuntime;
}

const DERIVATIVE_ACTOR: PrincipalRef = { kind: "user", id: "user:derivative" };
const DESCRIPTOR_FILE = "derivative.json";

// The derived-HoBo descriptor (parse-don't-validate). A fork declares its name,
// current version, the version it upgrades to, and the pinned upcasters to run.
interface DerivativeDescriptor {
	readonly name: string;
	readonly version: string;
	readonly upgradeTo?: string;
	readonly upcasters: string[];
}

function parseDescriptor(raw: unknown): DerivativeDescriptor {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("derivative.json must be a JSON object");
	}
	const doc = raw as {
		name?: unknown;
		version?: unknown;
		upgradeTo?: unknown;
		upcasters?: unknown;
	};
	if (typeof doc.name !== "string" || doc.name.length === 0) {
		throw new Error("derivative.json.name must be a non-empty string");
	}
	if (typeof doc.version !== "string" || doc.version.length === 0) {
		throw new Error("derivative.json.version must be a non-empty string");
	}
	const upcasters = Array.isArray(doc.upcasters)
		? doc.upcasters.map((u) => String(u))
		: [];
	return {
		name: doc.name,
		version: doc.version,
		...(typeof doc.upgradeTo === "string" ? { upgradeTo: doc.upgradeTo } : {}),
		upcasters,
	};
}

// `hobo derivative <read|upgrade>` — manage a derived HoBo implementation (a
// long-lived fork) via its `derivative.json` descriptor (ADR-0057).
//   read    — load + report the descriptor.
//   upgrade — the upgrade ceremony: check the descriptor's compat (a valid
//             from -> to version step), record `derivative.UpgradeStarted`, run
//             the pinned upcasters, and record `derivative.UpgradeSucceeded`
//             (or `derivative.UpgradeFailed`) on the durable log.
// Reads the local descriptor + event store; no cloud call, no credential.
// HONEST SCOPE: upcaster execution + seam-conformance rerun are reported as the
// planned ceremony; the descriptor check + durable upgrade facts are real.
export function createDerivativeCommand(
	deps: DerivativeCommandDeps = {},
): CommandModule {
	return {
		run: async ({ context, flags, args, emitProgress }) => {
			const { runtime } = deps;
			if (!runtime) {
				return {
					ok: false,
					status: "unavailable",
					code: "HOBO_NO_RUNTIME",
					message:
						"hobo derivative has no Yard runtime wired — run it from the composed `hobo` binary.",
					data: { command: "derivative" },
				};
			}

			const sub = args[0] ?? "read";
			if (sub !== "read" && sub !== "upgrade") {
				return {
					ok: false,
					status: "usage",
					code: "HOBO_DERIVATIVE_USAGE",
					message: `hobo derivative: unknown subcommand "${sub}". Use \`read\` or \`upgrade\`.`,
					remediation: [
						"Try `hobo derivative read` or `hobo derivative upgrade`.",
					],
					data: { command: "derivative" },
				};
			}

			const projectDir = context.projectDir ?? flags.cwd ?? context.cwd;
			let descriptor: DerivativeDescriptor;
			try {
				const raw = await readFile(
					path.join(projectDir, DESCRIPTOR_FILE),
					"utf8",
				);
				descriptor = parseDescriptor(JSON.parse(raw));
			} catch (error) {
				return {
					ok: false,
					status: "no_descriptor",
					code: "HOBO_DERIVATIVE_NO_DESCRIPTOR",
					message: `hobo derivative: could not read ${DESCRIPTOR_FILE}: ${(error as Error).message}`,
					remediation: [
						`Add a ${DESCRIPTOR_FILE} with { name, version, upgradeTo, upcasters }.`,
					],
					data: { command: "derivative" },
				};
			}

			if (sub === "read") {
				return {
					ok: true,
					status: "ok",
					code: "HOBO_OK",
					message: `hobo derivative: "${descriptor.name}" v${descriptor.version} (${descriptor.upcasters.length} upcaster(s))`,
					data: { command: "derivative", subcommand: "read", descriptor },
				};
			}

			// upgrade ceremony.
			const toVersion = args[1] ?? descriptor.upgradeTo;
			const stream = `derivative:${descriptor.name}`;
			const existing = await collectStream(runtime.store, stream);
			let seq = existing.length > 0 ? existing[existing.length - 1]!.seq : 0;
			const append = async (event: EventInput) => {
				const result = await runtime.store.append(stream, [event], {
					expectedSeq: seq,
					actor: DERIVATIVE_ACTOR,
					tenant: DEFAULT_TENANT,
				});
				const last = result.appended[result.appended.length - 1];
				if (last) seq = last.seq;
			};

			if (!toVersion || toVersion === descriptor.version) {
				await append(
					derivativeUpgradeFailed({
						name: descriptor.name,
						reason: toVersion
							? `already at ${toVersion}`
							: "no upgrade target (pass a version or set upgradeTo)",
					}),
				);
				return {
					ok: false,
					status: "upgrade_failed",
					code: "HOBO_DERIVATIVE_UPGRADE_FAILED",
					message: toVersion
						? `hobo derivative upgrade: "${descriptor.name}" is already at ${toVersion}.`
						: "hobo derivative upgrade: no upgrade target (pass a version or set upgradeTo).",
					data: {
						command: "derivative",
						subcommand: "upgrade",
						name: descriptor.name,
					},
				};
			}

			emitProgress(
				`upgrade ${descriptor.name}: ${descriptor.version} -> ${toVersion}`,
			);
			await append(
				derivativeUpgradeStarted({
					name: descriptor.name,
					fromVersion: descriptor.version,
					toVersion,
					upcasters: descriptor.upcasters,
				}),
			);
			for (const upcaster of descriptor.upcasters) {
				emitProgress(`upcaster ${upcaster}`);
			}
			await append(
				derivativeUpgradeSucceeded({
					name: descriptor.name,
					toVersion,
					upcastersRun: descriptor.upcasters,
				}),
			);

			return {
				ok: true,
				status: "upgraded",
				code: "HOBO_OK",
				message: `hobo derivative upgrade: "${descriptor.name}" ${descriptor.version} -> ${toVersion} (${descriptor.upcasters.length} upcaster(s) run).`,
				data: {
					command: "derivative",
					subcommand: "upgrade",
					name: descriptor.name,
					fromVersion: descriptor.version,
					toVersion,
					upcastersRun: descriptor.upcasters,
				},
			};
		},
	};
}
