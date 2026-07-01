import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseLoweringCorpus,
  parseSemanticsAnnexVectors,
  runSdkIdiomConformance,
} from "../src/sdk/index.js";
import { createDriftAdapter } from "./fixtures/drift-adapters.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = parseLoweringCorpus(
  JSON.parse(readFileSync(join(rootDir, "src/sdk/corpus/lowering-corpus.json"), "utf8")),
);
const annexVectors = parseSemanticsAnnexVectors(
  JSON.parse(readFileSync(join(rootDir, "src/sdk/vectors/semantics-annex.vectors.json"), "utf8")),
);

describe("seeded semantics drift", () => {
  it("hideCancellationAsRetry passes golden-IR but fails semantics-annex on caller-cancellation with vector diff", async () => {
    const report = await runSdkIdiomConformance({
      corpus: [corpus[0]!],
      annexVectors,
      adapter: createDriftAdapter({ hideCancellationAsRetry: true }),
    });

    const goldenIr = report.lanes.find((lane) => lane.lane === "golden-ir-lowering-equivalence");
    const semantics = report.lanes.find((lane) => lane.lane === "semantics-annex");

    expect(report.status).toBe("failed");
    expect(goldenIr?.status).toBe("passed");
    expect(semantics?.status).toBe("failed");

    const cancellationCase = semantics?.cases.find((entry) => entry.name === "caller-cancellation");
    expect(cancellationCase?.status).toBe("failed");
    expect(cancellationCase?.actualJson).toContain('"retried":true');
    expect(cancellationCase?.expectedJson).toContain('"tag":"cancelled"');
    expect(cancellationCase?.expectedJson).toContain('"retry":"caller-owned"');
    expect(cancellationCase?.diffPaths?.length).toBeGreaterThan(0);
  });

  it("swallowResultErrors fails result-error-mapping", async () => {
    const report = await runSdkIdiomConformance({
      corpus: [corpus[0]!],
      annexVectors,
      adapter: createDriftAdapter({ swallowResultErrors: true }),
    });

    const semantics = report.lanes.find((lane) => lane.lane === "semantics-annex");
    const errorCase = semantics?.cases.find((entry) => entry.name === "result-error-mapping");
    expect(errorCase?.status).toBe("failed");
  });

  it("useInputOrder fails awaited-ifc-order", async () => {
    const report = await runSdkIdiomConformance({
      corpus: [corpus[0]!],
      annexVectors,
      adapter: createDriftAdapter({ useInputOrder: true }),
    });

    const semantics = report.lanes.find((lane) => lane.lane === "semantics-annex");
    const orderCase = semantics?.cases.find((entry) => entry.name === "awaited-ifc-order");
    expect(orderCase?.status).toBe("failed");
    expect(orderCase?.diffPaths?.length).toBeGreaterThan(0);
  });
});
