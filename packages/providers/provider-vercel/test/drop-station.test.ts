/**
 * The Vercel Drop temporary-station path.
 *
 * Drop is the anonymous lane: a new project, no Git, no permanent credential.
 * That last part is the property the whole path exists to hold —
 * `stripPermanentVercelEnv` removes `VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN` and
 * `NOW_TOKEN` from the child environment, because a developer's real token
 * leaking into a Drop deploy would create a **durable project in their real
 * account** from a path that promises nothing durable, and the TTL that is
 * supposed to reclaim it would not apply.
 *
 * The output parser carries the other risk. `vercel deploy` prints JSON on some
 * versions and prose on others, so the parser reads structured lines first and
 * falls back to scanning for a `*.vercel.app` URL. A deploy that succeeded but
 * whose URL was not recovered is worse than a failed one: the project exists,
 * bills, and nobody has its address.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	materializeVercelDropStation,
	parseVercelDropDeployOutput,
	provisionTemporaryEnvironmentStation,
	sanitizeVercelDropProjectName,
	supportsAnonymousTemporaryDeploy,
	VERCEL_DROP_URL,
	VERCEL_TEMPORARY_PROVIDER_ID,
	type VercelDropTransport,
} from "../src/temporary-station.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function workDir(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "hobo-vercel-drop-test-"));
	dirs.push(dir);
	return dir;
}

describe("the Drop lane advertises itself honestly", () => {
	it("states that anonymous temporary deploy is supported", () => {
		// Unlike Railway, which refuses. A literal `true` rather than a runtime
		// check, so the type itself carries the claim.
		expect(supportsAnonymousTemporaryDeploy).toBe(true);
		expect(VERCEL_TEMPORARY_PROVIDER_ID).toBe("vercel");
	});

	it("publishes the documented Drop URL", () => {
		// Quoted in the default station page and in the parser's failure message,
		// so somebody who hits either has the documentation one click away.
		expect(VERCEL_DROP_URL).toBe("https://vercel.com/drop");
	});
});

describe("sanitizeVercelDropProjectName", () => {
	it("produces a hobo-drop prefixed name", () => {
		// The prefix is what makes an abandoned Drop project identifiable in an
		// account later — otherwise a temporary project is indistinguishable from
		// one somebody meant to keep.
		expect(sanitizeVercelDropProjectName("station-1")).toBe(
			"hobo-drop-station-1",
		);
	});

	it("replaces every character Vercel will not accept in a project name", () => {
		// Station ids come from callers and carry slashes, colons, spaces and
		// capitals. Vercel rejects an invalid name outright rather than
		// sanitising it, so this has to happen here.
		const name = sanitizeVercelDropProjectName("Tenant/ACME:station 01");
		expect(name).toMatch(/^[a-z0-9-]+$/u);
		expect(name.startsWith("hobo-drop-")).toBe(true);
	});

	it("collapses a run of separators rather than emitting several hyphens", () => {
		expect(sanitizeVercelDropProjectName("a///b")).toBe("hobo-drop-a-b");
	});

	it("trims leading and trailing separators", () => {
		// A name starting or ending with a hyphen is invalid; producing one would
		// turn a routine station id into a rejected deploy.
		expect(sanitizeVercelDropProjectName("---abc---")).toBe("hobo-drop-abc");
	});

	it("keeps the tail of a long id, not the head", () => {
		// The distinguishing part of a station id is usually at the end — a
		// tenant prefix is shared, a suffix is not. Truncating from the front
		// would map many stations onto one name.
		const name = sanitizeVercelDropProjectName(
			`tenant-prefix-${"x".repeat(60)}-tail`,
		);
		expect(name).toContain("tail");
	});

	it("bounds the whole name to what Vercel accepts", () => {
		expect(
			sanitizeVercelDropProjectName("z".repeat(500)).length,
		).toBeLessThanOrEqual(52);
	});

	it("falls back to anon rather than emitting a bare prefix", () => {
		// An id made entirely of separators sanitises to nothing. `hobo-drop-`
		// with a trailing hyphen is an invalid project name, so the fallback is
		// what keeps a degenerate id deployable.
		for (const stationId of ["///", "---", "", "   "]) {
			expect(sanitizeVercelDropProjectName(stationId)).toBe("hobo-drop-anon");
		}
	});
});

describe("parseVercelDropDeployOutput", () => {
	it("reads a JSON line naming the url and id", () => {
		expect(
			parseVercelDropDeployOutput(
				'{"url":"https://hobo-drop-1.vercel.app","id":"dpl_1"}',
			),
		).toEqual({
			stationUrl: "https://hobo-drop-1.vercel.app",
			deploymentId: "dpl_1",
		});
	});

	it("finds the JSON line among ordinary chatter", () => {
		// The CLI interleaves progress lines with the structured one. Parsing the
		// whole stream as JSON would fail on every real deploy.
		expect(
			parseVercelDropDeployOutput(
				[
					"Vercel CLI 39.0.0",
					"Uploading [====] 100%",
					'{"url":"hobo-drop-1.vercel.app","id":"dpl_1"}',
					"Done.",
				].join("\n"),
			).stationUrl,
		).toBe("https://hobo-drop-1.vercel.app");
	});

	it("adds the scheme when the CLI printed a bare host", () => {
		// Some versions print `foo.vercel.app` with no scheme. Returning that as
		// a station URL would produce a value nothing can fetch.
		expect(
			parseVercelDropDeployOutput('{"url":"hobo-drop-1.vercel.app","id":"d"}')
				.stationUrl,
		).toBe("https://hobo-drop-1.vercel.app");
	});

	it("accepts alias where url is absent", () => {
		// Both spellings appear depending on the command. Knowing only one would
		// send a perfectly good deploy down the fallback path.
		expect(
			parseVercelDropDeployOutput(
				'{"alias":"https://hobo-drop-1.vercel.app","id":"d"}',
			).stationUrl,
		).toBe("https://hobo-drop-1.vercel.app");
	});

	it("accepts deploymentId where id is absent", () => {
		expect(
			parseVercelDropDeployOutput(
				'{"url":"https://h.vercel.app","deploymentId":"dpl_9"}',
			).deploymentId,
		).toBe("dpl_9");
	});

	it("falls back to the hostname when no id was printed", () => {
		// An empty deployment id would leave a receipt that cannot be correlated
		// back to anything in the account.
		expect(
			parseVercelDropDeployOutput('{"url":"https://hobo-drop-1.vercel.app"}')
				.deploymentId,
		).toBe("hobo-drop-1.vercel.app");
	});

	it("carries a project name under either spelling", () => {
		expect(
			parseVercelDropDeployOutput(
				'{"url":"https://h.vercel.app","projectName":"p1"}',
			).projectName,
		).toBe("p1");
		expect(
			parseVercelDropDeployOutput('{"url":"https://h.vercel.app","name":"p2"}')
				.projectName,
		).toBe("p2");
	});

	it("omits the project name rather than reporting an empty one", () => {
		// Conditional spread. An empty string in a receipt would read as a
		// project actually named "" rather than one the CLI did not report.
		expect(
			Object.hasOwn(
				parseVercelDropDeployOutput('{"url":"https://h.vercel.app"}'),
				"projectName",
			),
		).toBe(false);
	});

	it("keeps scanning past a JSON line that does not parse", () => {
		// The CLI can print a truncated or progress-updated JSON fragment. Giving
		// up on the first unparseable brace would abandon a deploy whose real
		// answer is on the next line.
		expect(
			parseVercelDropDeployOutput(
				['{"partial":', '{"url":"https://h.vercel.app","id":"d"}'].join("\n"),
			).stationUrl,
		).toBe("https://h.vercel.app");
	});

	it("keeps scanning past a JSON line carrying no url", () => {
		// A structured line that is not *the* line — a build event, say. Treating
		// the first JSON object as authoritative would return an empty URL.
		expect(
			parseVercelDropDeployOutput(
				['{"event":"building"}', '{"url":"https://h.vercel.app"}'].join("\n"),
			).stationUrl,
		).toBe("https://h.vercel.app");
	});

	it("falls back to scanning prose for a vercel.app URL", () => {
		// The path taken when the CLI printed no JSON at all. Without it every
		// non-JSON version of the CLI would look like a failed deploy.
		const parsed = parseVercelDropDeployOutput(
			"Production: https://hobo-drop-1.vercel.app [2s]",
		);
		expect(parsed.stationUrl).toBe("https://hobo-drop-1.vercel.app");
		expect(parsed.deploymentId).toBe("hobo-drop-1");
	});

	it("strips trailing punctuation the CLI wrapped the URL in", () => {
		// A URL followed by a full stop or a closing bracket is common in prose
		// output, and carrying the punctuation into the URL makes it unfetchable.
		for (const suffix of [".", ",", ")", ").", "..."]) {
			expect(
				parseVercelDropDeployOutput(
					`Deployed to https://hobo-drop-1.vercel.app${suffix}`,
				).stationUrl,
			).toBe("https://hobo-drop-1.vercel.app");
		}
	});

	it("refuses empty output rather than returning an empty station", () => {
		// A deploy that printed nothing did not tell us it succeeded. Returning
		// an empty URL would report a station nobody can reach.
		for (const stdout of ["", "   ", "\n\n"]) {
			expect(() => parseVercelDropDeployOutput(stdout)).toThrow(
				/empty output/u,
			);
		}
	});

	it("refuses output with no vercel.app URL anywhere, pointing at the docs", () => {
		// The consequential refusal. If the CLI succeeded but we cannot recover
		// the URL, the project exists and bills and nobody has its address —
		// worse than a clean failure. Failing here keeps the output in hand.
		try {
			parseVercelDropDeployOutput("Vercel CLI 39.0.0\nUploading...\nDone.");
			expect.unreachable("output with no URL must be refused");
		} catch (error) {
			expect((error as Error).message).toContain("*.vercel.app");
			// The docs page, not the `VERCEL_DROP_URL` constant — the constant is
			// the product landing page a user starts from, and this message wants
			// the reference documentation instead. Pinned so the two do not get
			// collapsed into one on the assumption they are the same link.
			expect((error as Error).message).toContain(
				"https://vercel.com/docs/drop",
			);
		}
	});

	it("does not mistake another host for a deployment URL", () => {
		// The fallback regex is anchored on `vercel.app`. Matching any URL would
		// return the documentation link the CLI printed as the station address.
		expect(() =>
			parseVercelDropDeployOutput(
				"See https://vercel.com/docs for help\nhttps://example.com/x",
			),
		).toThrow(/missing \*\.vercel\.app URL/u);
	});
});

describe("materializeVercelDropStation", () => {
	it("writes a default station page when the caller supplied no files", () => {
		// Drop deploys a directory, so there has to be something in it. An empty
		// directory would deploy a project serving 404s.
		return materializeVercelDropStation({
			stationId: "s-1",
			rootDir: workDir(),
		}).then(({ workDir: dir, files }) => {
			expect(files).toHaveLength(1);
			const html = readFileSync(path.join(dir, "index.html"), "utf8");
			expect(html).toContain("HoBo Environment Station");
			expect(html).toContain(VERCEL_DROP_URL);
		});
	});

	it("writes the caller's files instead when given some", async () => {
		const dir = workDir();
		await materializeVercelDropStation({
			stationId: "s-1",
			rootDir: dir,
			files: [{ file: "index.html", data: "<h1>mine</h1>", encoding: "utf-8" }],
		});
		expect(readFileSync(path.join(dir, "index.html"), "utf8")).toBe(
			"<h1>mine</h1>",
		);
	});

	it("decodes a base64 file rather than writing its encoding", async () => {
		// Binary assets — an image, a wasm module — reach here base64-encoded.
		// Writing the encoded text would deploy a corrupt file that still has the
		// right name and a plausible size.
		const dir = workDir();
		await materializeVercelDropStation({
			stationId: "s-1",
			rootDir: dir,
			files: [
				{
					file: "logo.png",
					data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
					encoding: "base64",
				},
			],
		});
		expect([...readFileSync(path.join(dir, "logo.png"))]).toEqual([
			0x89, 0x50, 0x4e, 0x47,
		]);
	});

	it("creates nested directories for a file in a subdirectory", async () => {
		// `mkdir(dirname, { recursive: true })`. A static site routinely has
		// `assets/app.js`, and failing on the missing directory would make this
		// usable only for flat sites.
		const dir = workDir();
		await materializeVercelDropStation({
			stationId: "s-1",
			rootDir: dir,
			files: [
				{ file: "assets/js/app.js", data: "export {}", encoding: "utf-8" },
			],
		});
		expect(readFileSync(path.join(dir, "assets", "js", "app.js"), "utf8")).toBe(
			"export {}",
		);
	});

	it("makes its own temp directory when the caller names none", async () => {
		// The production path: nobody supplies a root, and the station is built
		// somewhere disposable rather than in the user's project.
		const { workDir: dir } = await materializeVercelDropStation({
			stationId: "s-1",
		});
		dirs.push(dir);
		expect(dir.startsWith(tmpdir())).toBe(true);
		expect(
			readFileSync(path.join(dir, "index.html"), "utf8").length,
		).toBeGreaterThan(0);
	});

	it("returns the files it wrote, so the caller need not restate them", async () => {
		const { files } = await materializeVercelDropStation({
			stationId: "s-1",
			rootDir: workDir(),
			files: [{ file: "a.txt", data: "a", encoding: "utf-8" }],
		});
		expect(files).toEqual([{ file: "a.txt", data: "a", encoding: "utf-8" }]);
	});
});

describe("provisionTemporaryEnvironmentStation", () => {
	/** A transport that records what it was asked to deploy. */
	function recordingTransport(
		result: Partial<Parameters<VercelDropTransport["deployDrop"]>[0]> & {
			stationUrl?: string;
			claimUrl?: string;
			projectName?: string;
			deploymentId?: string;
		} = {},
	) {
		const calls: Array<Record<string, unknown>> = [];
		const transport: VercelDropTransport = {
			async deployDrop(input) {
				calls.push({ ...input });
				return {
					stationUrl: result.stationUrl ?? "https://hobo-drop-1.vercel.app",
					claimUrl: result.claimUrl ?? "https://vercel.com/claim/abc",
					projectName: result.projectName ?? "hobo-drop-s-1",
					deploymentId: result.deploymentId ?? "dpl_1",
				} as never;
			},
		};
		return { transport, calls };
	}

	it("returns an anonymous, temporary station", async () => {
		const { transport } = recordingTransport();
		const result = await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			transport,
		} as never);
		expect(result.anonymous).toBe(true);
		expect(result.temporary).toBe(true);
		expect(result.providerId).toBe("vercel");
	});

	it("carries the deployed URL as both the station and the primary URL", async () => {
		// Two fields, one address on this lane. A caller reading either must get
		// something reachable rather than one being empty.
		const { transport } = recordingTransport();
		const result = await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			transport,
		} as never);
		expect(result.stationUrl).toBe("https://hobo-drop-1.vercel.app");
		expect(result.primaryUrl).toBe(result.stationUrl);
	});

	it("carries the claim URL, because the project outlives the deploy", async () => {
		// A Drop project is real and unclaimed. Losing the claim URL strands it:
		// created, running, and belonging to nobody who can manage it.
		const { transport } = recordingTransport();
		expect(
			(
				await provisionTemporaryEnvironmentStation({
					stationId: "s-1",
					transport,
				} as never)
			).claimUrl,
		).toBe("https://vercel.com/claim/abc");
	});

	it("stamps a TTL and an expiry in the future", async () => {
		// The TTL is what tells a caller the station is not durable. Without it a
		// Drop project would be treated as permanent infrastructure.
		const { transport } = recordingTransport();
		const result = await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			transport,
		} as never);
		expect(result.ttlSeconds).toBeGreaterThan(0);
		expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
	});

	it("derives the project name from the station id", async () => {
		const { transport, calls } = recordingTransport();
		await provisionTemporaryEnvironmentStation({
			stationId: "Tenant/ACME:01",
			transport,
		} as never);
		expect(calls[0]?.projectName).toBe(
			sanitizeVercelDropProjectName("Tenant/ACME:01"),
		);
	});

	it("honours an explicit project name", async () => {
		// So two stations configured differently stay distinguishable in an
		// account rather than both deriving the same name.
		const { transport, calls } = recordingTransport();
		await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			projectName: "explicit-name",
			transport,
		} as never);
		expect(calls[0]?.projectName).toBe("explicit-name");
	});

	it("hands the transport a materialized directory, not just file records", async () => {
		// The CLI deploys a directory. Passing files without writing them would
		// deploy an empty project.
		const { transport, calls } = recordingTransport();
		await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			transport,
		} as never);
		const dir = String(calls[0]?.workDir);
		dirs.push(dir);
		expect(
			readFileSync(path.join(dir, "index.html"), "utf8").length,
		).toBeGreaterThan(0);
	});

	it("forwards the caller's own files", async () => {
		const { transport, calls } = recordingTransport();
		await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			files: [{ file: "index.html", data: "<h1>mine</h1>", encoding: "utf-8" }],
			transport,
		} as never);
		dirs.push(String(calls[0]?.workDir));
		expect(calls[0]?.files).toEqual([
			{ file: "index.html", data: "<h1>mine</h1>", encoding: "utf-8" },
		]);
	});

	it("reports the project and deployment the transport actually created", async () => {
		// Not the requested name — the created one. A receipt quoting what we
		// asked for rather than what exists would not resolve in the account if
		// Vercel disambiguated the name.
		const { transport } = recordingTransport({
			projectName: "hobo-drop-s-1-2",
			deploymentId: "dpl_9",
		});
		const result = await provisionTemporaryEnvironmentStation({
			stationId: "s-1",
			transport,
		} as never);
		expect(result.accountId).toBe("hobo-drop-s-1-2");
		expect(result.scriptName).toBe("dpl_9");
	});

	it("surfaces a transport failure rather than returning a partial station", async () => {
		// A half-populated result would be handed on as a station with an empty
		// URL, and the failure would surface wherever somebody tried to open it.
		const transport: VercelDropTransport = {
			async deployDrop() {
				throw new Error("vercel: deployment failed");
			},
		};
		await expect(
			provisionTemporaryEnvironmentStation({
				stationId: "s-1",
				transport,
			} as never),
		).rejects.toThrow(/deployment failed/u);
	});
});
