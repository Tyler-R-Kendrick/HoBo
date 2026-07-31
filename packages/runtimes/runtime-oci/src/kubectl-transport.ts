import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";

/**
 * HTTP-shaped request/response for the kubectl integration boundary.
 * Structurally compatible with `@hobo/contract-harness` PactRequest/PactResponse
 * so tests inject `createMockProviderFromPact` without a production dep.
 */
export interface KubectlRequest {
	readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	readonly path: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: unknown;
}

export interface KubectlResponse {
	readonly status: number;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: unknown;
}

/**
 * Transport for the kubectl/cluster integration boundary.
 * Production: {@link createProcessKubectlTransport}.
 * Tests: {@link createMockProviderFromPact} from `@hobo/contract-harness`.
 */
export interface KubectlTransport {
	readonly name: string;
	handle(request: KubectlRequest): KubectlResponse | Promise<KubectlResponse>;
}

export interface ProcessKubectlTransportOptions {
	readonly kubectlBin?: string;
	readonly context?: string;
	readonly env?: NodeJS.ProcessEnv;
}

export class KubectlUnavailableError extends Error {
	readonly code = "HOBO_KUBECTL_UNAVAILABLE";
	constructor(message: string) {
		super(message);
		this.name = "KubectlUnavailableError";
	}
}

function freeLoopbackPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr === null || typeof addr === "string") {
				server.close();
				reject(new Error("failed to allocate loopback port"));
				return;
			}
			const port = addr.port;
			server.close((error) => (error ? reject(error) : resolve(port)));
		});
		server.once("error", reject);
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real kubectl process transport — the production side of the PACT boundary.
 */
export function createProcessKubectlTransport(
	options: ProcessKubectlTransportOptions = {},
): KubectlTransport {
	const env = options.env ?? process.env;
	const bin = options.kubectlBin ?? env.HOBO_KUBECTL_BIN ?? "kubectl";

	function baseArgs(): string[] {
		return options.context ? ["--context", options.context] : [];
	}

	function run(
		args: readonly string[],
		input?: string,
	): { status: number; stdout: string; stderr: string } {
		const result = spawnSync(bin, [...baseArgs(), ...args], {
			env: { ...env },
			encoding: "utf8",
			input,
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 120_000,
		});
		return {
			status: result.status ?? 1,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? result.error?.message ?? "",
		};
	}

	function runOrThrow(args: readonly string[], input?: string): string {
		const result = run(args, input);
		if (result.status !== 0) {
			throw new KubectlUnavailableError(
				`kubectl ${args.join(" ")} failed (exit ${result.status}): ${result.stderr || result.stdout}`,
			);
		}
		return result.stdout;
	}

	// Active port-forwards keyed by service for http-proxy.
	const forwards = new Map<
		string,
		{ loopbackUrl: string; localPort: number; child: ChildProcess }
	>();

	return {
		name: "KubernetesClusterApi",
		async handle(request: KubectlRequest): Promise<KubectlResponse> {
			const path = request.path;
			const body = (request.body ?? {}) as Record<string, unknown>;

			if (path === "/kubectl/version") {
				const result = run(["version", "--client=true", "-o", "json"]);
				if (result.status !== 0) {
					return {
						status: 503,
						body: {
							ok: false,
							error: result.stderr || result.stdout,
						},
					};
				}
				let clientVersion: string | null = null;
				try {
					const parsed = JSON.parse(result.stdout) as {
						clientVersion?: { gitVersion?: string };
					};
					clientVersion = parsed.clientVersion?.gitVersion ?? null;
				} catch {
					clientVersion = "unknown";
				}
				return {
					status: 200,
					body: { ok: true, clientVersion, kubectlBin: bin },
				};
			}

			if (path === "/kubectl/cluster-info") {
				const result = run(["cluster-info"]);
				return {
					status: result.status === 0 ? 200 : 503,
					body: {
						ok: result.status === 0,
						reachable: result.status === 0,
						detail: result.stdout || result.stderr,
					},
				};
			}

			if (path === "/kubectl/namespace/ensure") {
				const namespace = String(body.namespace ?? "default");
				const get = run(["get", "namespace", namespace, "-o", "name"]);
				if (get.status !== 0) {
					runOrThrow(
						["apply", "-f", "-"],
						JSON.stringify({
							apiVersion: "v1",
							kind: "Namespace",
							metadata: { name: namespace },
						}),
					);
				}
				return { status: 200, body: { ok: true, namespace } };
			}

			if (path === "/kubectl/apply") {
				const namespace = String(body.namespace ?? "default");
				const manifests = (body.manifests as unknown[]) ?? [];
				for (const manifest of manifests) {
					const doc = {
						...(manifest as object),
						metadata: {
							...((manifest as { metadata?: object }).metadata ?? {}),
							namespace,
						},
					};
					runOrThrow(
						["apply", "-n", namespace, "-f", "-"],
						JSON.stringify(doc),
					);
				}
				return {
					status: 200,
					body: { ok: true, applied: manifests.length },
				};
			}

			if (path === "/kubectl/rollout-status") {
				const namespace = String(body.namespace ?? "default");
				const name = String(body.name ?? "");
				const timeoutMs = Number(body.timeoutMs ?? 120_000);
				const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
				const rollout = run([
					"rollout",
					"status",
					`deployment/${name}`,
					"-n",
					namespace,
					`--timeout=${timeoutSec}s`,
				]);
				if (rollout.status === 0) {
					return { status: 200, body: { ok: true, ready: true } };
				}
				const deadline = Date.now() + timeoutMs;
				while (Date.now() < deadline) {
					const ep = run([
						"get",
						"endpoints",
						name,
						"-n",
						namespace,
						"-o",
						"jsonpath={.subsets[*].addresses[*].ip}",
					]);
					if (ep.status === 0 && ep.stdout.trim().length > 0) {
						return { status: 200, body: { ok: true, ready: true } };
					}
					await sleep(500);
				}
				return {
					status: 504,
					body: {
						ok: false,
						ready: false,
						error: rollout.stderr || "timeout waiting for ready",
					},
				};
			}

			if (path === "/kubectl/port-forward") {
				const namespace = String(body.namespace ?? "default");
				const service = String(body.service ?? "");
				const targetPort = Number(body.targetPort ?? 8080);
				const localPort = await freeLoopbackPort();
				const args = [
					...baseArgs(),
					"port-forward",
					"-n",
					namespace,
					`svc/${service}`,
					`${localPort}:${targetPort}`,
				];
				const child = spawn(bin, args, {
					env: { ...env },
					stdio: ["ignore", "pipe", "pipe"],
				});
				let log = "";
				const onChunk = (chunk: Buffer) => {
					log += chunk.toString("utf8");
				};
				child.stderr?.on("data", onChunk);
				child.stdout?.on("data", onChunk);

				const deadline = Date.now() + 30_000;
				let ready = false;
				while (Date.now() < deadline) {
					if (child.exitCode !== null) {
						return {
							status: 503,
							body: {
								ok: false,
								error: `port-forward exited: ${log}`,
							},
						};
					}
					if (/Forwarding from\s+127\.0\.0\.1:/i.test(log)) {
						ready = true;
						break;
					}
					await sleep(50);
				}
				if (!ready) {
					child.kill("SIGTERM");
					return {
						status: 504,
						body: { ok: false, error: `port-forward not ready: ${log}` },
					};
				}
				const loopbackUrl = `http://127.0.0.1:${localPort}`;
				forwards.set(service, { loopbackUrl, localPort, child });
				return {
					status: 200,
					body: { ok: true, localPort, loopbackUrl },
				};
			}

			if (path === "/kubectl/http-proxy") {
				const service = String(body.service ?? "");
				const method = String(body.method ?? "GET");
				const reqPath = String(body.path ?? "/");
				const forward = forwards.get(service);
				if (!forward) {
					return {
						status: 503,
						body: {
							ok: false,
							error: `no active port-forward for service ${service}`,
						},
					};
				}
				const target = `${forward.loopbackUrl}${reqPath.startsWith("/") ? reqPath : `/${reqPath}`}`;
				const headers = (body.headers as Record<string, string> | undefined) ?? {};
				const init: RequestInit = { method, headers };
				if (
					body.body !== undefined &&
					method !== "GET" &&
					method !== "HEAD"
				) {
					init.body =
						typeof body.body === "string"
							? body.body
							: JSON.stringify(body.body);
				}
				const response = await fetch(target, init);
				const contentType = response.headers.get("content-type") ?? "";
				const text = await response.text();
				let json: unknown;
				if (contentType.includes("application/json")) {
					try {
						json = JSON.parse(text);
					} catch {
						json = undefined;
					}
				}
				return {
					status: 200,
					body: {
						status: response.status,
						headers: { "content-type": contentType },
						...(json !== undefined ? { json } : { text }),
					},
				};
			}

			if (path === "/kubectl/resources" && request.method === "DELETE") {
				const namespace = String(body.namespace ?? "default");
				const name = String(body.name ?? "");
				const forward = forwards.get(name);
				if (forward) {
					forward.child.kill("SIGTERM");
					forwards.delete(name);
				}
				run([
					"delete",
					"deployment,service",
					name,
					"-n",
					namespace,
					"--ignore-not-found=true",
					"--wait=false",
				]);
				return { status: 200, body: { ok: true, deleted: true } };
			}

			return {
				status: 404,
				body: { ok: false, error: `unknown path ${path}` },
			};
		},
	};
}
