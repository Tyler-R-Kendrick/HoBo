import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseLoweringCorpus,
  parseSdkConformanceReport,
  parseSemanticsAnnexVectors,
  runSdkIdiomConformance,
  sdkConformanceGateSpec,
} from "../src/sdk/index.js";
import { createReferenceAdapter } from "./fixtures/drift-adapters.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = parseLoweringCorpus(
  JSON.parse(readFileSync(join(rootDir, "src/sdk/corpus/lowering-corpus.json"), "utf8")),
);
const annexVectors = parseSemanticsAnnexVectors(
  JSON.parse(readFileSync(join(rootDir, "src/sdk/vectors/semantics-annex.vectors.json"), "utf8")),
);

describe("sdk conformance gate", () => {
  it("declares the required SDK conformance lanes without resilience-semantics", () => {
    expect(sdkConformanceGateSpec.lanes).toEqual([
      "golden-ir-lowering-equivalence",
      "semantics-annex",
      "thin-idiom-layer",
      "authorship-neutral-gate",
      "coverage-claim",
    ]);
    expect(sdkConformanceGateSpec.contract).toBe("hobo:sdk@0.1.0");
    expect(sdkConformanceGateSpec.corpusClaim).toMatch(/bounded by the checked corpus/);
  });

  it("passing adapter passes all lanes and report parses", async () => {
    const report = await runSdkIdiomConformance({
      corpus,
      corpusPath: "src/sdk/corpus/lowering-corpus.json",
      annexVectors,
      annexPath: "src/sdk/vectors/semantics-annex.vectors.json",
      adapter: createReferenceAdapter(),
      sourceFiles: [{ path: "src/reference.ts", source: "export const ok = true;" }],
    });

    expect(report.status).toBe("passed");
    expect(report.suite).toBe("@hobo/conformance/sdk");
    expect(report.contract).toBe("hobo:sdk@0.1.0");
    expect(report.lanes.map((lane) => lane.lane)).toEqual(sdkConformanceGateSpec.lanes);

    const goldenIr = report.lanes.find((lane) => lane.lane === "golden-ir-lowering-equivalence");
    const semantics = report.lanes.find((lane) => lane.lane === "semantics-annex");
    expect(goldenIr?.status).toBe("passed");
    expect(goldenIr?.boundedByCorpus).toBe(true);
    expect(semantics?.status).toBe("passed");

    const parsed = parseSdkConformanceReport(report);
    expect(parsed.status).toBe("passed");
  });

  it("throws TypeError for empty corpus, empty annex vectors, or missing adapter", async () => {
    await expect(
      runSdkIdiomConformance({
        corpus: [],
        annexVectors,
        adapter: createReferenceAdapter(),
      }),
    ).rejects.toThrow(TypeError);

    await expect(
      runSdkIdiomConformance({
        corpus,
        annexVectors: [],
        adapter: createReferenceAdapter(),
      }),
    ).rejects.toThrow(TypeError);

    await expect(
      runSdkIdiomConformance({
        corpus,
        annexVectors,
        adapter: undefined as never,
      }),
    ).rejects.toThrow(TypeError);
  });

  it("fails coverage lane when helper claim has no matching vector", async () => {
    const report = await runSdkIdiomConformance({
      corpus,
      annexVectors,
      adapter: createReferenceAdapter(),
      helperClaims: ["sdk.retry.jitter"],
    });

    expect(report.status).toBe("failed");
    const coverage = report.lanes.find((lane) => lane.lane === "coverage-claim");
    expect(coverage?.status).toBe("failed");
    expect(coverage?.cases[0]?.reason).toBe(
      "helper claim has no golden-IR or semantics-annex vector",
    );
  });
});
